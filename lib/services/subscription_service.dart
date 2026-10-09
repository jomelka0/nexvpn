import 'dart:convert';
import 'dart:io';
import '../core/sub_parser.dart';
import '../models/server_node.dart';
import '../models/subscription.dart';
import 'device_service.dart';
import 'diag_log.dart';
import 'storage_service.dart';

class ImportResult {
  final List<ServerNode> servers;
  final int skipped;
  final String? error;
  final String source;
  final Subscription? subscription;
  /// Все серверы указывают на один адрес — провайдер, вероятно, отдал заглушки.
  final bool suspicious;
  ImportResult(this.servers, this.skipped, this.error,
      {this.source = '', this.subscription, this.suspicious = false});
}

class _Fetched {
  final String body;
  final Map<String, int> info;
  final String? title;
  final int? intervalHours;
  final bool hwidLimit;
  final bool hwidNotSupported;
  _Fetched(this.body, this.info, this.title, this.intervalHours, this.hwidLimit, this.hwidNotSupported);
}

class _Attempt {
  final _Fetched fetched;
  final ParseOutcome outcome;
  final String ua;
  _Attempt(this.fetched, this.outcome, this.ua);
}

class SubscriptionService {
  /// Панели отдают разный формат в зависимости от User-Agent:
  /// пробуем по очереди и берём первый ответ с настоящими серверами.
  static const userAgents = [
    'v2rayNG/1.9.19',
    'Happ/2.5.1',
    'v2rayN/7.0',
    'Streisand/1.0',
    'Nex/1.1',
  ];

  static bool isUrl(String s) => s.startsWith('http://') || s.startsWith('https://');

  /// Принимает ссылку подписки https://…, ссылки vless:// vmess:// trojan:// ss://,
  /// base64-текст подписки или Xray JSON.
  static Future<ImportResult> import(String input) async {
    final text = input.trim();
    if (isUrl(text)) return _importUrl(text);

    final o = parseSubscriptionBody(text);
    DiagLog.add('Импорт из текста: формат=${o.format}, серверов=${o.servers.length}, '
        'пропущено=${o.skipped}');
    if (o.servers.isEmpty) {
      return ImportResult([], o.skipped, _explainEmpty(o), source: '');
    }
    return ImportResult(_toNodes(o.servers, ''), o.skipped, null, source: '');
  }

  static Future<ImportResult> _importUrl(String url) async {
    final device = await DeviceService.headers();
    DiagLog.add('Загрузка подписки ${redactUrl(url)}');

    _Attempt? bestDecoy;
    _Attempt? first;
    String? firstError;

    for (final ua in userAgents) {
      _Fetched f;
      try {
        f = await _download(url, ua, device);
      } catch (e) {
        DiagLog.add('  [$ua] ошибка: $e');
        firstError ??= '$e';
        continue;
      }
      final o = parseSubscriptionBody(f.body);
      final decoy = looksLikeDecoys(o.servers);
      DiagLog.add('  [$ua] ${f.body.length} байт, формат=${o.format}, серверов=${o.servers.length}, '
          'одинаковый адрес у всех=${decoy ? 'да' : 'нет'}, сообщений панели=${o.notices.length}, '
          'пропущено=${o.skipped}');
      DiagLog.add('     ${o.preview}');
      if (f.hwidLimit) DiagLog.add('     панель: достигнут лимит устройств (x-hwid-limit)');
      if (f.hwidNotSupported) DiagLog.add('     панель: HWID не принят (x-hwid-not-supported)');

      final attempt = _Attempt(f, o, ua);
      first ??= attempt;
      if (o.servers.isNotEmpty && !decoy) return _success(url, attempt, suspicious: false);
      if (o.servers.isNotEmpty) bestDecoy ??= attempt;
    }

    if (bestDecoy != null) {
      DiagLog.add('Настоящих серверов не найдено, использую ответ ${bestDecoy.ua} (похоже на заглушки)');
      return _success(url, bestDecoy, suspicious: true);
    }

    if (first != null) {
      final f = first.fetched;
      var msg = _explainEmpty(first.outcome);
      if (f.hwidLimit) {
        msg = 'Достигнут лимит устройств для этой подписки. '
            'Удалите старое устройство в личном кабинете сервиса и повторите.\n$msg';
      } else if (f.hwidNotSupported) {
        msg = 'Сервис требует идентификатор устройства (HWID), но не принял его.\n$msg';
      }
      return ImportResult([], first.outcome.skipped, msg, source: url);
    }

    var msg = 'Не удалось загрузить подписку: ${firstError ?? 'нет ответа'}';
    if ((firstError ?? '').contains('404')) {
      msg += '\nСсылка неверна, либо сервис требует идентификатор устройства.';
    }
    return ImportResult([], 0, msg, source: url);
  }

  static ImportResult _success(String url, _Attempt a, {required bool suspicious}) {
    var hours = a.fetched.intervalHours ?? 12;
    if (hours < 1) hours = 12;
    final sub = Subscription(
      url: url,
      name: a.fetched.title ?? (Uri.tryParse(url)?.host ?? url),
      upload: a.fetched.info['upload'] ?? 0,
      download: a.fetched.info['download'] ?? 0,
      total: a.fetched.info['total'] ?? 0,
      expire: a.fetched.info['expire'] ?? 0,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
      intervalHours: hours,
    );
    DiagLog.add('Принят ответ ${a.ua}: серверов ${a.outcome.servers.length}'
        '${suspicious ? ' (подозрительный)' : ''}');
    return ImportResult(_toNodes(a.outcome.servers, url), a.outcome.skipped, null,
        source: url, subscription: sub, suspicious: suspicious);
  }

  static String _explainEmpty(ParseOutcome o) {
    if (o.notices.isNotEmpty) return 'Сервер подписки ответил: ${o.notices.join(' ')}';
    switch (o.format) {
      case 'singbox-json':
        return 'Подписка в формате sing-box — он не поддерживается.';
      case 'unknown':
        return 'Не удалось распознать ответ сервера: «${o.preview}»';
      case 'empty':
        return 'Сервер вернул пустой ответ.';
      default:
        return 'Не найдено поддерживаемых серверов (vless, vmess, trojan, ss).';
    }
  }

  static List<ServerNode> _toNodes(List<ParsedServer> list, String source) {
    final nodes = <ServerNode>[];
    for (var i = 0; i < list.length; i++) {
      final s = list[i];
      final id = s.link.isNotEmpty
          ? '${source.hashCode}_${s.link.hashCode}'
          : '${source.hashCode}_c${i}_${s.name.hashCode}';
      nodes.add(ServerNode(
        id: id,
        name: s.name,
        address: s.address,
        port: s.port,
        protocol: s.protocol,
        link: s.link,
        config: s.config,
        source: source,
      ));
    }
    return nodes;
  }

  /// Сохраняет результат импорта и возвращает сообщение для пользователя.
  static Future<String> saveResult(ImportResult res) async {
    final servers = StorageService.getServers();

    if (res.source.isNotEmpty) {
      servers.removeWhere((s) => s.source == res.source);
      final subs = StorageService.getSubscriptions();
      final i = subs.indexWhere((s) => s.url == res.source);
      final sub = res.subscription;
      if (sub != null) {
        if (i >= 0) {
          subs[i] = sub;
        } else {
          subs.add(sub);
        }
      }
      await StorageService.saveSubscriptions(subs);
    }

    final known = servers.map((s) => s.id).toSet();
    final fresh = res.servers.where((s) => !known.contains(s.id)).toList();
    servers.addAll(fresh);
    await StorageService.saveServers(servers);

    var msg = 'Добавлено серверов: ${fresh.length}';
    if (res.skipped > 0) msg += ' (пропущено, не поддерживается: ${res.skipped})';
    if (res.suspicious) {
      msg += '\nВсе серверы указывают на один адрес — похоже на заглушки провайдера. '
          'Подробности: Настройки → Диагностика.';
    }
    return msg;
  }

  static Future<_Fetched> _download(String url, String userAgent, Map<String, String> extra) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
    try {
      final req = await client.getUrl(Uri.parse(url));
      req.headers.set('User-Agent', userAgent);
      extra.forEach((k, v) => req.headers.set(k, v));
      final res = await req.close().timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) throw 'HTTP ${res.statusCode}';
      final body = await res.transform(const Utf8Decoder(allowMalformed: true)).join();
      return _Fetched(
        body,
        parseUserInfo(_header(res, 'subscription-userinfo')),
        decodeProfileTitle(_header(res, 'profile-title')),
        int.tryParse(_header(res, 'profile-update-interval') ?? ''),
        (_header(res, 'x-hwid-limit') ?? '').toLowerCase() == 'true',
        (_header(res, 'x-hwid-not-supported') ?? '').toLowerCase() == 'true',
      );
    } finally {
      client.close();
    }
  }

  static String? _header(HttpClientResponse res, String name) {
    try {
      return res.headers.value(name);
    } catch (_) {
      return null;
    }
  }
}
