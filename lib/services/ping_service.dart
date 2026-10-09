import '../models/server_node.dart';
import 'vpn_service.dart';

class PingService {
  /// Реальный замер через ядро Xray. Серверы проверяются строго по одному:
  /// нативное ядро не рассчитано на параллельные проверки.
  static Future<void> pingAll(
    List<ServerNode> servers, {
    required void Function(ServerNode) onStart,
    required void Function(ServerNode) onDone,
  }) async {
    for (final s in servers) {
      onStart(s);
      s.ping = await VpnManager.instance.ping(s);
      onDone(s);
    }
  }
}
