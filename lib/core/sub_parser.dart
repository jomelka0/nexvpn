// Чистый Dart (без Flutter): разбор подписок. Зеркало tools/ref/sub_parser.js,
// обе версии проверяются на одних и тех же фикстурах из test/fixtures.
import 'dart:convert';

const supportedSchemes = ['vless', 'vmess', 'trojan', 'ss', 'socks'];
const _infoHosts = ['0.0.0.0', '127.0.0.1', 'localhost'];
const _nonProxy = ['freedom', 'blackhole', 'dns', 'loopback'];

class ParsedServer {
  final String name;
  final String address;
  final int port;
  final String protocol;
  final String link;   // ссылка vless:// … (пусто для готовых конфигов)
  final String config; // готовый Xray JSON (пусто для ссылок)

  const ParsedServer({
    required this.name,
    required this.address,
    required this.port,
    required this.protocol,
    this.link = '',
    this.config = '',
  });
}

class ParseOutcome {
  String format = 'empty';
  List<ParsedServer> servers = [];
  int skipped = 0;
  final List<String> notices = [];
  String preview = '';
}

String _safeDecode(String s) {
  try {
    return Uri.decodeComponent(s);
  } catch (_) {
    return s;
  }
}

String decodeB64(String s) {
  var t = s.replaceAll(RegExp(r'\s'), '').replaceAll('-', '+').replaceAll('_', '/');
  t = t.replaceAll(RegExp(r'=+$'), '');
  if (!RegExp(r'^[A-Za-z0-9+/]*$').hasMatch(t)) throw const FormatException('b64');
  if (t.length % 4 == 1) throw const FormatException('b64 length');
  t = t.padRight(t.length + (4 - t.length % 4) % 4, '=');
  return utf8.decode(base64.decode(t), allowMalformed: true);
}

String redact(String s) {
  return s
      .replaceAllMapped(RegExp(r'([a-z0-9]+)://[^@\s/?#]*@', caseSensitive: false),
          (m) => '${m[1]}://***@')
      .replaceAllMapped(
          RegExp(r'(ss|vmess)://[A-Za-z0-9+/=_-]{12,}(?=[#\s]|$)', caseSensitive: false),
          (m) => '${m[1]}://***');
}

String _flat(String s, [int n = 200]) {
  final r = redact(s.replaceAll(RegExp(r'\s+'), ' '));
  return r.length > n ? r.substring(0, n) : r;
}

class _Uri {
  final String scheme, userinfo, host, fragment;
  final int port;
  _Uri(this.scheme, this.userinfo, this.host, this.port, this.fragment);
}

_Uri? _splitUri(String line) {
  final i = line.indexOf('://');
  if (i < 0) return null;
  final scheme = line.substring(0, i).toLowerCase();
  var rest = line.substring(i + 3);
  var fragment = '';
  final h = rest.indexOf('#');
  if (h >= 0) {
    fragment = rest.substring(h + 1);
    rest = rest.substring(0, h);
  }
  var end = rest.length;
  for (final ch in ['/', '?']) {
    final k = rest.indexOf(ch);
    if (k >= 0 && k < end) end = k;
  }
  final authority = rest.substring(0, end);
  final at = authority.lastIndexOf('@');
  final userinfo = at >= 0 ? authority.substring(0, at) : '';
  final hostport = at >= 0 ? authority.substring(at + 1) : authority;
  var host = hostport;
  var port = 0;
  if (hostport.startsWith('[')) {
    final r = hostport.indexOf(']');
    if (r > 0) {
      host = hostport.substring(1, r);
      final m = RegExp(r'^:(\d+)$').firstMatch(hostport.substring(r + 1));
      if (m != null) port = int.parse(m.group(1)!);
    }
  } else {
    final c = hostport.lastIndexOf(':');
    if (c >= 0 && RegExp(r'^\d+$').hasMatch(hostport.substring(c + 1))) {
      host = hostport.substring(0, c);
      port = int.parse(hostport.substring(c + 1));
    }
  }
  return _Uri(scheme, userinfo, host, port, _safeDecode(fragment));
}

// Результат разбора строки: сервер, сообщение панели или пропуск.
class _LineResult {
  final ParsedServer? server;
  final String? notice;
  final bool skip;
  _LineResult({this.server, this.notice, this.skip = false});
}

_LineResult _parseLine(String line) {
  final scheme = line.split('://').first.toLowerCase();
  if (!supportedSchemes.contains(scheme)) return _LineResult(skip: true);
  var name = '';
  var address = '';
  var port = 0;

  if (scheme == 'vmess') {
    final payload = line.substring(8).split('#').first;
    try {
      final j = jsonDecode(decodeB64(payload)) as Map<String, dynamic>;
      address = '${j['add'] ?? ''}';
      port = int.tryParse('${j['port']}') ?? 0;
      name = '${j['ps'] ?? ''}';
    } catch (_) {
      return _LineResult(skip: true);
    }
  } else if (scheme == 'ss') {
    final u = _splitUri(line);
    if (u == null) return _LineResult(skip: true);
    name = u.fragment;
    if (u.userinfo.isNotEmpty) {
      address = u.host;
      port = u.port;
    } else {
      final body = line.substring(5).split('#').first.split('?').first;
      try {
        final d = decodeB64(body);
        final at = d.lastIndexOf('@');
        if (at < 0) return _LineResult(skip: true);
        final hp = d.substring(at + 1);
        final c = hp.lastIndexOf(':');
        if (c < 0) return _LineResult(skip: true);
        address = hp.substring(0, c);
        port = int.tryParse(hp.substring(c + 1)) ?? 0;
      } catch (_) {
        return _LineResult(skip: true);
      }
    }
  } else {
    final u = _splitUri(line);
    if (u == null) return _LineResult(skip: true);
    address = u.host;
    port = u.port;
    name = u.fragment;
  }

  if (address.isEmpty) return _LineResult(skip: true);
  name = name.trim();
  if (_infoHosts.contains(address)) return _LineResult(notice: name);
  return _LineResult(
    server: ParsedServer(
      name: name.isEmpty ? address : name,
      address: address,
      port: port,
      protocol: scheme.toUpperCase(),
      link: line,
    ),
  );
}

ParseOutcome _fromJson(String text, ParseOutcome out, String prefix) {
  dynamic data;
  try {
    data = jsonDecode(text);
  } catch (_) {
    out.format = 'unknown';
    out.preview = _flat(text);
    return out;
  }
  final list = data is List ? data : [data];
  final servers = <ParsedServer>[];
  var skipped = 0;
  var singbox = false;

  for (var i = 0; i < list.length; i++) {
    final cfg = list[i];
    if (cfg is! Map || cfg['outbounds'] is! List) {
      skipped++;
      continue;
    }
    final outbounds = cfg['outbounds'] as List;
    Map? proxy;
    for (final o in outbounds) {
      if (o is Map && o['protocol'] != null && !_nonProxy.contains(o['protocol'])) {
        proxy = o;
        break;
      }
    }
    if (proxy == null) {
      if (outbounds.any((o) => o is Map && o['type'] != null)) singbox = true;
      skipped++;
      continue;
    }
    var address = '';
    dynamic port = 0;
    final s = proxy['settings'] is Map ? proxy['settings'] as Map : const {};
    if (s['vnext'] is List && (s['vnext'] as List).isNotEmpty) {
      final v = (s['vnext'] as List).first as Map;
      address = '${v['address'] ?? ''}';
      port = v['port'] ?? 0;
    } else if (s['servers'] is List && (s['servers'] as List).isNotEmpty) {
      final v = (s['servers'] as List).first as Map;
      address = '${v['address'] ?? ''}';
      port = v['port'] ?? 0;
    } else if (s['address'] != null) {
      address = '${s['address']}';
      port = s['port'] ?? 0;
    }
    final rawName = cfg['remarks'] ?? cfg['remark'] ?? cfg['ps'] ?? proxy['tag'];
    var name = '${rawName ?? ''}'.trim();
    if (name.isEmpty) name = address.isNotEmpty ? address : 'Config ${i + 1}';
    servers.add(ParsedServer(
      name: name,
      address: address,
      port: port is num ? port.toInt() : (int.tryParse('$port') ?? 0),
      protocol: '${proxy['protocol']}'.toUpperCase(),
      config: jsonEncode(cfg),
    ));
  }

  out.servers = servers;
  out.skipped = skipped;
  out.format = prefix + (servers.isEmpty && singbox ? 'singbox-json' : 'xray-json');
  var names = servers.map((s) => s.name).join(', ');
  if (names.length > 150) names = names.substring(0, 150);
  out.preview = 'JSON, конфигураций: ${list.length}${servers.isNotEmpty ? '; $names' : ''}';
  return out;
}

ParseOutcome parseSubscriptionBody(String raw) {
  var text = raw.trim();
  final out = ParseOutcome();
  if (text.isEmpty) return out;

  if (text.startsWith('[') || text.startsWith('{')) return _fromJson(text, out, '');

  if (!text.contains('://')) {
    String decoded;
    try {
      decoded = decodeB64(text);
    } catch (_) {
      out.format = 'unknown';
      out.preview = _flat(text);
      return out;
    }
    final t = decoded.trim();
    if (t.startsWith('[') || t.startsWith('{')) return _fromJson(t, out, 'base64-');
    if (!t.contains('://')) {
      out.format = 'unknown';
      out.preview = _flat(text);
      return out;
    }
    out.format = 'base64-links';
    text = t;
  } else {
    out.format = 'links';
  }

  out.preview = _flat(text);
  final seen = <String>{};
  for (final rawLine in text.split(RegExp(r'[\r\n]+'))) {
    final line = rawLine.trim();
    if (line.isEmpty || !line.contains('://') || !seen.add(line)) continue;
    final r = _parseLine(line);
    if (r.skip) {
      out.skipped++;
    } else if (r.notice != null) {
      if (r.notice!.isNotEmpty && !out.notices.contains(r.notice)) out.notices.add(r.notice!);
    } else {
      out.servers.add(r.server!);
    }
  }
  return out;
}

/// Все «серверы» указывают на один и тот же host:port — признак заглушек панели.
bool looksLikeDecoys(List<ParsedServer> servers) {
  if (servers.length < 2) return false;
  return servers.map((s) => '${s.address}:${s.port}').toSet().length == 1;
}

/// subscription-userinfo: upload=0; download=123; total=1000; expire=1700000000
Map<String, int> parseUserInfo(String? raw) {
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

String? decodeProfileTitle(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  var t = raw.trim();
  if (t.toLowerCase().startsWith('base64:')) {
    try {
      t = decodeB64(t.substring(7));
    } catch (_) {}
  } else {
    t = _safeDecode(t);
  }
  return t.isEmpty ? null : t;
}
