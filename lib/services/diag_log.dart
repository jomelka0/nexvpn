import 'package:flutter/foundation.dart';

/// Журнал диагностики: что ответил сервер подписки, какие были ошибки пинга и подключения.
/// Секреты (uuid, пароли) в журнал не попадают — ссылки маскируются.
class DiagLog extends ChangeNotifier {
  DiagLog._();
  static final DiagLog instance = DiagLog._();

  final List<String> _lines = [];

  static void add(String message) => instance._add(message);

  void _add(String message) {
    final t = DateTime.now();
    String two(int n) => n.toString().padLeft(2, '0');
    _lines.add('[${two(t.hour)}:${two(t.minute)}:${two(t.second)}] $message');
    if (_lines.length > 400) _lines.removeAt(0);
    notifyListeners();
  }

  String get text => _lines.join('\n');
  bool get isEmpty => _lines.isEmpty;

  void clear() {
    _lines.clear();
    notifyListeners();
  }
}

String redactUrl(String url) {
  final u = Uri.tryParse(url);
  if (u == null || u.host.isEmpty) return '***';
  return '${u.scheme}://${u.host}/…';
}
