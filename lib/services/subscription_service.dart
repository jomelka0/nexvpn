import 'dart:convert';
import 'dart:io';
import 'package:flutter_v2ray/flutter_v2ray.dart';
import '../models/server_node.dart';
import '../models/subscription.dart';
import 'storage_service.dart';

class ImportResult {
  final List<ServerNode> servers;
  final int skipped;
  final String? error;
  final String source;
  final Subscription? subscription;
  ImportResult(this.servers, this.skipped, this.error, {this.source = '', this.subscription});
}

class _Fetched {
  final String body;
  final Map<String, int> info;
  final String? title;
  final int? intervalHours;
  _Fetched(this.body, this.info, this.title, this.intervalHours);
}

class SubscriptionService {
  // Протоколы, которые умеет ядро Xray в составе плагина
  static const supportedSchemes = ['vless', 'vmess', 'trojan', 'ss', 'socks'];

  // Некоторые панели отдают разный формат в зависимости от User-Agent
  static const _userAgents = ['v2rayNG/1.8.5', 'Happ/1.0'];

  /// Принимает: ссылку подписки http(s)://…, либо одну/несколько ссылок
  /// vless:// vmess:// trojan:// ss://, либо base64-текст подписки.
  static Future<ImportResult> import(String input) async {
    final text = input.trim();

    if (text.startsWith('http://') || text.startsWith('https://')) {
      ImportResult? last;
      String? lastError;
      for (final ua in _userAgents) {
        try {
          final f = await _download(text, ua);
          final res = parseContent(f.body, source: text);
          if (res.servers.isNotEmpty) {
            var hours = f.intervalHours ?? 12;
            if (hours < 1) hours = 12;
            final sub = Subscription(
              url: text,
              name: f.title ?? (Uri.tryParse(text)?.host ?? text),
              upload: f.info['upload'] ?? 0,
              download: f.info['download'] ?? 0,
              total: f.info['total'] ?? 0,
              expire: f.info['expire'] ?? 0,
              updatedAt: DateTime.now().millisecondsSinceEpoch,
              intervalHours: hours,
            );
            return ImportResult(res.servers, res.skipped, null, source: text, subscription: sub);
          }
          last = res;
        } catch (e) {
          lastError = '$e';
        }
      }
      if (last != null) {
        return ImportResult([], last.skipped, last.error, source: text);
      }
      return ImportResult([], 0, 'Не удалось загрузить подписку: ${lastError ?? ''}', source: text);
    }

    return parseContent(text);
  }

  static ImportResult parseContent(String raw, {String source = ''}) {
    var content = raw.trim();

    if (!content.contains('://')) {
      try {
        final b64 = content.replaceAll(RegExp(r'\s'), '').replaceAll('-', '+').replaceAll('_', '/');
        content = utf8.decode(base64.decode(base64.normalize(b64)));
      } catch (_) {
        return ImportResult([], 0,
            'Не удалось распознать ответ сервера (ожидаются ссылки vless://, vmess://… или base64).',
            source: source);
      }
    }

    final servers = <ServerNode>[];
    final seen = <String>{};
    var skipped = 0;

    for (final rawLine in content.split(RegExp(r'[\r\n]+'))) {
      final line = rawLine.trim();
      if (line.isEmpty || !line.contains('://')) continue;

      final scheme = line.split('://').first.toLowerCase();
      if (!supportedSchemes.contains(scheme)) {
        skipped++;
        continue;
      }
      if (!seen.add(line)) continue;

      try {
        final parsed = FlutterV2ray.parseFromURL(line);

        // Информационные «серверы» (остаток трафика и т.п.) с адресом-заглушкой пропускаем
        final addr = parsed.address;
        if (addr == '0.0.0.0' || addr == '127.0.0.1' || addr == 'localhost') continue;

        var protocol = scheme.toUpperCase();
        if (parsed.security == 'reality') protocol += '+Reality';
        servers.add(ServerNode(
          id: '${source.hashCode}_${line.hashCode}',
          name: parsed.remark.isNotEmpty ? parsed.remark : parsed.address,
          address: parsed.address,
          port: parsed.port,
          protocol: protocol,
          link: line,
          source: source,
        ));
      } catch (_) {
        skipped++;
      }
    }

    if (servers.isEmpty) {
      return ImportResult([], skipped,
          'Не найдено поддерживаемых серверов (vless, vmess, trojan, ss).', source: source);
    }
    return ImportResult(servers, skipped, null, source: source);
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

    final known = servers.map((s) => s.link).toSet();
    final fresh = res.servers.where((s) => !known.contains(s.link)).toList();
    servers.addAll(fresh);
    await StorageService.saveServers(servers);

    var msg = 'Добавлено серверов: ${fresh.length}';
    if (res.skipped > 0) {
      msg += ' (пропущено, протокол не поддерживается: ${res.skipped})';
    }
    return msg;
  }

  static Future<_Fetched> _download(String url, String userAgent) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
    try {
      final req = await client.getUrl(Uri.parse(url));
      req.headers.set('User-Agent', userAgent);
      final res = await req.close().timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) throw 'HTTP ${res.statusCode}';
      final body = await res.transform(const Utf8Decoder(allowMalformed: true)).join();
      return _Fetched(
        body,
        _parseUserInfo(_header(res, 'subscription-userinfo')),
        _decodeTitle(_header(res, 'profile-title')),
        int.tryParse(_header(res, 'profile-update-interval') ?? ''),
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

  // subscription-userinfo: upload=0; download=123; total=1000; expire=1700000000
  static Map<String, int> _parseUserInfo(String? raw) {
    final map = <String, int>{};
    if (raw == null) return map;
    for (final part in raw.split(';')) {
      final kv = part.split('=');
      if (kv.length != 2) continue;
      final v = num.tryParse(kv[1].trim());
      if (v != null) map[kv[0].trim().toLowerCase()] = v.toInt();
    }
    return map;
  }

  static String? _decodeTitle(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    var t = raw.trim();
    if (t.toLowerCase().startsWith('base64:')) {
      try {
        t = utf8.decode(base64.decode(base64.normalize(t.substring(7))));
      } catch (_) {}
    } else {
      try {
        t = Uri.decodeComponent(t);
      } catch (_) {}
    }
    return t.isEmpty ? null : t;
  }
}
