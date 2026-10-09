import 'package:flutter/material.dart';
import '../models/server_node.dart';
import 'tap_scale.dart';

class ServerCard extends StatelessWidget {
  final ServerNode server;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback onLongPress;
  final bool pinging;
  final VoidCallback? onPingTap;

  const ServerCard({
    super.key,
    required this.server,
    required this.isSelected,
    required this.onTap,
    required this.onLongPress,
    this.pinging = false,
    this.onPingTap,
  });

  List<Color> _protocolColors() {
    final p = server.protocol.toUpperCase();
    if (p.startsWith('VLESS')) return const [Color(0xFF1F6FEB), Color(0xFF58A6FF)];
    if (p.startsWith('VMESS')) return const [Color(0xFF8957E5), Color(0xFFA371F7)];
    if (p.startsWith('TROJAN')) return const [Color(0xFFD29922), Color(0xFFF0883E)];
    return const [Color(0xFF238636), Color(0xFF3FB950)];
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFF58A6FF);
    final ping = server.ping;
    String pingText;
    Color pingColor;
    if (ping == null) {
      pingText = '--- ms';
      pingColor = const Color(0xFF8B949E);
    } else if (ping < 0) {
      pingText = 'timeout';
      pingColor = Colors.redAccent;
    } else {
      pingText = '$ping ms';
      pingColor = ping < 300 ? const Color(0xFF3FB950) : Colors.orange;
    }

    return TapScale(
      onTap: onTap,
      onLongPress: onLongPress,
      scaleDown: 0.97,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? primary.withOpacity(0.10) : const Color(0xFF161B22),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? primary : const Color(0xFF30363D),
            width: isSelected ? 1.6 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: _protocolColors(),
                ),
              ),
              child: const Icon(Icons.dns_rounded, size: 22, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(server.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text('${server.protocol} • ${server.address}:${server.port}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: Color(0xFF8B949E))),
                ],
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onPingTap,
              child: Container(
                constraints: const BoxConstraints(minWidth: 64),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: pingColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Center(
                  widthFactor: 1,
                  child: pinging
                      ? SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2, color: pingColor),
                        )
                      : Text(pingText,
                          style: TextStyle(
                              color: pingColor, fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ),
            ),
            const SizedBox(width: 6),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
              child: isSelected
                  ? const Icon(Icons.check_circle_rounded, key: ValueKey('on'), color: primary, size: 22)
                  : const SizedBox(key: ValueKey('off'), width: 22, height: 22),
            ),
          ],
        ),
      ),
    );
  }
}
