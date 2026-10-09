import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/server_node.dart';
import '../models/app_settings.dart';
import '../models/subscription.dart';

class StorageService {
  static late SharedPreferences _prefs;

  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  static Future<void> saveServers(List<ServerNode> servers) async {
    final list = servers.map((s) => jsonEncode(s.toJson())).toList();
    await _prefs.setStringList('servers', list);
  }

  static List<ServerNode> getServers() {
    final list = _prefs.getStringList('servers') ?? [];
    return list
        .map((item) => ServerNode.fromJson(jsonDecode(item)))
        // заглушки панелей подписок (адрес 0.0.0.0) — не настоящие серверы
        .where((s) => s.address != '0.0.0.0' && s.address != '127.0.0.1')
        .toList();
  }

  static String? getHwid() => _prefs.getString('hwid');

  static Future<void> saveHwid(String value) async {
    await _prefs.setString('hwid', value);
  }

  static Future<void> saveSettings(AppSettings settings) async {
    await _prefs.setString('settings', jsonEncode(settings.toJson()));
  }

  static AppSettings getSettings() {
    final data = _prefs.getString('settings');
    if (data == null) return AppSettings();
    return AppSettings.fromJson(jsonDecode(data));
  }

  static String? getSelectedId() => _prefs.getString('selectedServerId');

  static Future<void> saveSelectedId(String id) async {
    await _prefs.setString('selectedServerId', id);
  }

  static List<Subscription> getSubscriptions() {
    final list = _prefs.getStringList('subs2');
    if (list != null) {
      return list.map((s) => Subscription.fromJson(jsonDecode(s))).toList();
    }
    // миграция со старого формата (список ссылок)
    final old = _prefs.getStringList('subscriptions') ?? [];
    return old.map((u) => Subscription(url: u, name: Uri.tryParse(u)?.host ?? u)).toList();
  }

  static Future<void> saveSubscriptions(List<Subscription> subs) async {
    await _prefs.setStringList('subs2', subs.map((s) => jsonEncode(s.toJson())).toList());
  }
}
