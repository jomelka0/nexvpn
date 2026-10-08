import 'package:flutter/material.dart';
import '../models/server_node.dart';

class ServerCard extends StatelessWidget {
  final ServerNode server;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const ServerCard({
    super.key,
    required this.server,
    required this.isSelected,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
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
      pingColor = ping < 300 ? Colors.green : Colors.orange;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: isSelected ? const Color(0xFF58A6FF) : const Color(0xFF30363D),
          width: isSelected ? 2 : 1,
        ),
      ),
      child: ListTile(
        onTap: onTap,
        onLongPress: onLongPress,
        title: Text(server.name, maxLines: 1, overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text('${server.protocol} • ${server.address}:${server.port}',
            maxLines: 1, overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Color(0xFF8B949E))),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xFF21262D),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(pingText,
              style: TextStyle(color: pingColor, fontWeight: FontWeight.bold, fontSize: 12)),
        ),
      ),
    );
  }
}
