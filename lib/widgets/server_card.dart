import 'package:flutter/material.dart';
import '../models/server_node.dart';
import 'tap_scale.dart';

/// Карточка сервера: бейдж протокола, название, адрес, пинг и кнопка питания.
class ServerCard extends StatelessWidget {
  final ServerNode server;
  final bool isSelected;
  final bool isConnected;
  final bool isConnecting;
  final bool pinging;
  final VoidCallback onTap;
  final VoidCallback onLongPress;
  final VoidCallback onPower;
  final VoidCallback? onPingTap;

  const ServerCard({
    super.key,
    required this.server,
    required this.isSelected,
    required this.isConnected,
    required this.isConnecting,
    required this.onTap,
    required this.onLongPress,
    required this.onPower,
    this.pinging = false,
    this.onPingTap,
  });

  static const _green = Color(0xFF3FB950);
  static const _blue = Color(0xFF58A6FF);
  static const _muted = Color(0xFF8B949E);

  Color _protocolColor() {
    final p = server.protocol.toUpperCase();
    if (p.startsWith('VLESS')) return _blue;
    if (p.startsWith('VMESS')) return const Color(0xFFA371F7);
    if (p.startsWith('TROJAN')) return const Color(0xFFF0883E);
    if (p.startsWith('SS')) return _green;
    return _muted;
  }

  @override
  Widget build(BuildContext context) {
    final ping = server.ping;
    String pingText;
    Color pingColor;
    if (ping == null) {
      pingText = '--- ms';
      pingColor = _muted;
    } else if (ping < 0) {
      pingText = 'Timeout';
      pingColor = const Color(0xFFF85149);
    } else {
      pingText = '$ping ms';
      pingColor = ping < 300 ? _green : const Color(0xFFF0883E);
    }
    final proto = _protocolColor();
    final borderColor = isConnected ? _green : (isSelected ? _blue : const Color(0xFF30363D));

    return TapScale(
      onTap: onTap,
      onLongPress: onLongPress,
      scaleDown: 0.97,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
        decoration: BoxDecoration(
          color: isConnected ? _green.withOpacity(0.07) : const Color(0xFF161B22),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: borderColor, width: (isConnected || isSelected) ? 1.6 : 1),
        ),
        child: Row(
          children: [
            Container(
              constraints: const BoxConstraints(minWidth: 52),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: proto.withOpacity(0.14),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                server.protocol.toUpperCase(),
                textAlign: TextAlign.center,
                style: TextStyle(color: proto, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.4),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(server.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 2),
                  Text('${server.address}:${server.port}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11.5, color: _muted)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onPingTap,
              child: Container(
                constraints: const BoxConstraints(minWidth: 66),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: pingColor.withOpacity(0.7)),
                  color: pingColor.withOpacity(0.08),
                ),
                child: Center(
                  widthFactor: 1,
                  child: pinging
                      ? SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2, color: pingColor))
                      : Text(pingText,
                          style: TextStyle(color: pingColor, fontWeight: FontWeight.w700, fontSize: 12)),
                ),
              ),
            ),
            const SizedBox(width: 10),
            TapScale(
              onTap: onPower,
              scaleDown: 0.85,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isConnected ? _green.withOpacity(0.18) : const Color(0xFF21262D),
                  border: Border.all(color: isConnected ? _green : Colors.transparent, width: 1.5),
                ),
                child: Center(
                  child: isConnecting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2.2, color: _blue))
                      : Icon(Icons.power_settings_new_rounded,
                          size: 22, color: isConnected ? _green : _muted),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
