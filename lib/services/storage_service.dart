import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/server_node.dart';
import '../models/app_settings.dart';

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
    return list.map((item) => ServerNode.fromJson(jsonDecode(item))).toList();
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

  static List<String> getSubscriptions() => _prefs.getStringList('subscriptions') ?? [];

  static Future<void> saveSubscriptions(List<String> urls) async {
    await _prefs.setStringList('subscriptions', urls);
  }
}
