import 'dart:math';
import 'package:device_info_plus/device_info_plus.dart';
import 'storage_service.dart';

/// Идентификатор устройства для сервисов с лимитом устройств (Remnawave HWID).
/// Генерируется один раз при первом запуске и хранится на устройстве.
class DeviceService {
  static Future<Map<String, String>> headers() async {
    var hwid = StorageService.getHwid();
    if (hwid == null) {
      final r = Random.secure();
      hwid = List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
      await StorageService.saveHwid(hwid);
    }

    var model = 'Android';
    var osVersion = '';
    try {
      final info = await DeviceInfoPlugin().androidInfo;
      model = '${info.manufacturer} ${info.model}'.trim();
      osVersion = info.version.release;
    } catch (_) {}

    String clean(String v) => v.replaceAll(RegExp(r'[^\x20-\x7E]'), '').trim();

    final map = <String, String>{
      'x-hwid': hwid,
      'x-device-os': 'Android',
      'x-device-model': clean(model),
    };
    if (clean(osVersion).isNotEmpty) map['x-ver-os'] = clean(osVersion);
    return map;
  }
}
