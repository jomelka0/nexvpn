import 'dart:convert';
import 'package:android_intent_plus/android_intent.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_v2ray/flutter_v2ray.dart';
import 'package:installed_apps/installed_apps.dart';
import '../models/app_settings.dart';
import '../models/server_node.dart';

/// Обёртка над ядром Xray (flutter_v2ray) и Android VpnService.
class VpnManager {
  VpnManager._();
  static final VpnManager instance = VpnManager._();

  static const _lanSubnets = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '169.254.0.0/16',
  ];

  final ValueNotifier<V2RayStatus> status = ValueNotifier(V2RayStatus());
  /// История скорости за текущий сеанс (для графика), ~1 значение в секунду.
  final List<int> downHistory = [];
  final List<int> upHistory = [];

  late final FlutterV2ray _v2ray = FlutterV2ray(onStatusChanged: _onStatus);

  void _onStatus(V2RayStatus s) {
    if (s.state == 'CONNECTED') {
      downHistory.add(s.downloadSpeed);
      upHistory.add(s.uploadSpeed);
      if (downHistory.length > 40) downHistory.removeAt(0);
      if (upHistory.length > 40) upHistory.removeAt(0);
    } else if (s.state == 'DISCONNECTED') {
      downHistory.clear();
      upHistory.clear();
    }
    status.value = s;
  }
  bool _initialized = false;

  bool get isConnected => status.value.state == 'CONNECTED';
  bool get isConnecting => status.value.state == 'CONNECTING';

  Future<void> init() async {
    if (_initialized) return;
    await _v2ray.initializeV2Ray();
    _initialized = true;
  }

  /// Возвращает null при успехе или текст ошибки.
  Future<String?> connect(ServerNode server, AppSettings settings) async {
    try {
      await init();
      final granted = await _v2ray.requestPermission();
      if (!granted) return 'Нет разрешения на создание VPN-подключения';

      final parsed = FlutterV2ray.parseFromURL(server.link);
      var config = jsonDecode(parsed.getFullConfiguration()) as Map<String, dynamic>;
      if (settings.tlsFragmentation) config = _applyFragmentation(config);

      // Per-App Routing: в VPN идут только выбранные приложения,
      // все остальные исключаются (blockedApps = обходят туннель).
      List<String>? blocked;
      if (settings.perAppRouting && settings.selectedApps.isNotEmpty) {
        final all = await InstalledApps.getInstalledApps(false, false, '');
        blocked = all
            .map((a) => a.packageName ?? '')
            .where((p) => p.isNotEmpty && !settings.selectedApps.contains(p))
            .toList();
      }

      await _v2ray.startV2Ray(
        remark: server.name,
        config: jsonEncode(config),
        blockedApps: blocked,
        bypassSubnets: settings.bypassLan ? _lanSubnets : null,
        proxyOnly: false,
        notificationDisconnectButtonName: 'Отключить',
      );
      return null;
    } catch (e) {
      return 'Ошибка подключения: $e';
    }
  }

  Future<void> disconnect() async {
    await _v2ray.stopV2Ray();
  }

  /// Реальная задержка до сервера через ядро Xray (мс), -1 если недоступен.
  Future<int> ping(ServerNode server) async {
    try {
      await init();
      final parsed = FlutterV2ray.parseFromURL(server.link);
      final d = await _v2ray
          .getServerDelay(config: parsed.getFullConfiguration())
          .timeout(const Duration(seconds: 10));
      return d <= 0 ? -1 : d;
    } catch (_) {
      return -1;
    }
  }

  /// TLS Fragmentation: исходящее соединение к прокси идёт через freedom-outbound,
  /// который режет TLS ClientHello на куски (обход DPI).
  Map<String, dynamic> _applyFragmentation(Map<String, dynamic> config) {
    final outs = List<dynamic>.from((config['outbounds'] as List?) ?? const []);
    final i = outs.indexWhere((o) =>
        !const ['freedom', 'blackhole', 'dns'].contains((o as Map)['protocol']));
    if (i < 0) return config;

    final proxy = Map<String, dynamic>.from(outs[i] as Map);
    final stream = Map<String, dynamic>.from((proxy['streamSettings'] as Map?) ?? {});
    final sockopt = Map<String, dynamic>.from((stream['sockopt'] as Map?) ?? {});
    sockopt['dialerProxy'] = 'fragment';
    stream['sockopt'] = sockopt;
    proxy['streamSettings'] = stream;
    outs[i] = proxy;

    outs.add({
      'tag': 'fragment',
      'protocol': 'freedom',
      'settings': {
        'fragment': {'packets': 'tlshello', 'length': '100-200', 'interval': '10-20'}
      },
    });
    config['outbounds'] = outs;
    return config;
  }

  /// Kill Switch в Android реализуется системой, а не приложением.
  static Future<void> openSystemVpnSettings() async {
    final intent = AndroidIntent(action: 'android.settings.VPN_SETTINGS');
    await intent.launch();
  }
}
