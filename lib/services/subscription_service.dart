import 'dart:convert';
import 'dart:io';
import 'package:flutter_v2ray/flutter_v2ray.dart';
import '../models/server_node.dart';

class ImportResult {
  final List<ServerNode> servers;
  final int skipped;
  final String? error;
  final String source;
  ImportResult(this.servers, this.skipped, this.error, {this.source = ''});
}

class SubscriptionService {
  // Протоколы, которые умеет ядро Xray в составе плагина
  static const supportedSchemes = ['vless', 'vmess', 'trojan', 'ss', 'socks'];

  /// Принимает: http(s)-ссылку подписки, одну или несколько ссылок vless:// vmess:// trojan:// ss://,
  /// либо base64-текст подписки.
  static Future<ImportResult> import(String input) async {
    final text = input.trim();
    if (text.startsWith('http://') || text.startsWith('https://')) {
      try {
        final body = await _download(text);
        return parseContent(body, source: text);
      } catch (e) {
        return ImportResult([], 0, 'Не удалось загрузить подписку: $e', source: text);
      }
    }
    return parseContent(text);
  }

  static ImportResult parseContent(String raw, {String source = ''}) {
    var content = raw.trim();

    if (!content.contains('://')) {
      try {
        var b64 = content.replaceAll(RegExp(r'\s'), '').replaceAll('-', '+').replaceAll('_', '/');
        content = utf8.decode(base64.decode(base64.normalize(b64)));
      } catch (_) {
        return ImportResult([], 0, 'Не удалось распознать содержимое', source: source);
      }
    }

    final servers = <ServerNode>[];
    final seen = <String>{};
    var skipped = 0;

    for (final rawLine in content.split(RegExp(r'[\r\n]+'))) {
      final line = rawLine.trim();
      if (line.isEmpty || !line.contains('://')) continue;

      final scheme = line.split('://').first.toLowerCase();
      if (!supportedSchemes.contains(scheme) || !seen.add(line)) {
        if (!supportedSchemes.contains(scheme)) skipped++;
        continue;
      }

      try {
        final parsed = FlutterV2ray.parseFromURL(line);
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
          'Не найдено поддерживаемых ссылок (vless, vmess, trojan, ss).', source: source);
    }
    return ImportResult(servers, skipped, null, source: source);
  }

  static Future<String> _download(String url) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
    try {
      final req = await client.getUrl(Uri.parse(url));
      req.headers.set('User-Agent', 'v2rayNG/1.8.5');
      final res = await req.close().timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) throw 'HTTP ${res.statusCode}';
      return await res.transform(utf8.decoder).join();
    } finally {
      client.close();
    }
  }
}
