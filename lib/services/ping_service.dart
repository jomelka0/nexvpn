import '../models/server_node.dart';
import 'vpn_service.dart';

class PingService {
  /// Реальный замер задержки через ядро Xray, по 3 сервера параллельно.
  static Future<void> pingAll(List<ServerNode> servers, void Function() onProgress) async {
    for (var i = 0; i < servers.length; i += 3) {
      final batch = servers.skip(i).take(3).toList();
      await Future.wait(batch.map((s) async {
        s.ping = await VpnManager.instance.ping(s);
        onProgress();
      }));
    }
  }
}
