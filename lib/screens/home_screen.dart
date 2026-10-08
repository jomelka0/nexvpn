import 'package:flutter/material.dart';
import 'package:flutter_v2ray/flutter_v2ray.dart';
import '../models/server_node.dart';
import '../services/storage_service.dart';
import '../services/ping_service.dart';
import '../services/subscription_service.dart';
import '../services/vpn_service.dart';
import '../utils/format.dart';
import '../widgets/server_card.dart';
import 'settings_screen.dart';
import 'add_subscription_sheet.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  List<ServerNode> servers = [];
  ServerNode? selected;
  bool pinging = false;
  bool busy = false;

  late AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(seconds: 2))
      ..repeat(reverse: true);
    _loadData();
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  void _loadData() {
    servers = StorageService.getServers();
    final id = StorageService.getSelectedId();
    selected = servers.where((s) => s.id == id).firstOrNull ?? servers.firstOrNull;
    setState(() {});
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _toggle() async {
    final vpn = VpnManager.instance;
    if (busy || vpn.isConnecting) return;
    setState(() => busy = true);
    try {
      if (vpn.isConnected) {
        await vpn.disconnect();
      } else {
        final server = selected;
        if (server == null) {
          _snack('Сначала добавьте сервер (кнопка 🔗 сверху)');
          return;
        }
        final err = await vpn.connect(server, StorageService.getSettings());
        if (err != null) _snack(err);
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _pingAll() async {
    if (pinging || servers.isEmpty) return;
    setState(() => pinging = true);
    await PingService.pingAll(servers, () {
      if (mounted) setState(() {});
    });
    await StorageService.saveServers(servers);
    if (mounted) setState(() => pinging = false);
  }

  Future<void> _refreshSubscriptions() async {
    final subs = StorageService.getSubscriptions();
    if (subs.isEmpty) {
      _snack('Нет подписок для обновления');
      return;
    }
    _snack('Обновляю подписки…');
    final all = StorageService.getServers();
    var count = 0;
    for (final url in subs) {
      final res = await SubscriptionService.import(url);
      if (res.servers.isEmpty) continue;
      all.removeWhere((s) => s.source == url);
      all.addAll(res.servers);
      count += res.servers.length;
    }
    await StorageService.saveServers(all);
    _loadData();
    _snack('Обновлено серверов: $count');
  }

  Future<void> _confirmDelete(ServerNode server) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Удалить сервер?'),
        content: Text(server.name),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Отмена')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Удалить')),
        ],
      ),
    );
    if (ok == true) {
      servers.removeWhere((s) => s.id == server.id);
      await StorageService.saveServers(servers);
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('NexVPN', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            tooltip: 'Обновить подписки',
            icon: const Icon(Icons.refresh),
            onPressed: _refreshSubscriptions,
          ),
          IconButton(
            tooltip: 'Добавить сервер / подписку',
            icon: const Icon(Icons.add_link),
            onPressed: () async {
              final msg = await showModalBottomSheet<String>(
                context: context,
                isScrollControlled: true,
                builder: (_) => const AddSubscriptionSheet(),
              );
              _loadData();
              if (msg != null) _snack(msg);
            },
          ),
          IconButton(
            tooltip: 'Настройки',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const SettingsScreen()),
            ),
          ),
        ],
      ),
      body: ValueListenableBuilder<V2RayStatus>(
        valueListenable: VpnManager.instance.status,
        builder: (context, st, _) {
          final connected = st.state == 'CONNECTED';
          final connecting = st.state == 'CONNECTING' || busy;
          return Column(
            children: [
              const SizedBox(height: 20),
              Center(child: _connectButton(connected, connecting)),
              const SizedBox(height: 16),
              if (connected) _statsRow(st) else const SizedBox(height: 40),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Серверы', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    TextButton.icon(
                      onPressed: pinging ? null : _pingAll,
                      icon: pinging
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.network_ping, size: 18),
                      label: const Text('Тест пинга'),
                    ),
                  ],
                ),
              ),
              Expanded(child: _serverList(connected)),
            ],
          );
        },
      ),
    );
  }

  Widget _connectButton(bool connected, bool connecting) {
    final color = connected ? Colors.green : const Color(0xFF8B949E);
    final label = connecting ? (connected ? 'ОТКЛЮЧЕНИЕ…' : 'ПОДКЛЮЧЕНИЕ…') : (connected ? 'ПОДКЛЮЧЕНО' : 'ОТКЛЮЧЕНО');
    return GestureDetector(
      onTap: _toggle,
      child: AnimatedBuilder(
        animation: _pulse,
        builder: (context, child) {
          return Container(
            width: 160,
            height: 160,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: connected ? Colors.green.withOpacity(0.15) : const Color(0xFF161B22),
              border: Border.all(
                color: connected ? Colors.green : const Color(0xFF30363D),
                width: connected ? 3 + (_pulse.value * 2) : 2,
              ),
              boxShadow: connected
                  ? [BoxShadow(color: Colors.green.withOpacity(0.4), blurRadius: 20, spreadRadius: 5)]
                  : [],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                connecting
                    ? const SizedBox(width: 48, height: 48, child: CircularProgressIndicator(strokeWidth: 3))
                    : Icon(Icons.power_settings_new_rounded, size: 56, color: color),
                const SizedBox(height: 8),
                Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: color)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _statsRow(V2RayStatus st) {
    Widget item(IconData icon, String text) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: const Color(0xFF8B949E)),
            const SizedBox(width: 4),
            Text(text, style: const TextStyle(fontSize: 12, color: Color(0xFF8B949E))),
          ],
        );
    return SizedBox(
      height: 40,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          item(Icons.timer_outlined, st.duration),
          item(Icons.arrow_downward, '${formatBytes(st.downloadSpeed)}/s'),
          item(Icons.arrow_upward, '${formatBytes(st.uploadSpeed)}/s'),
          item(Icons.data_usage, formatBytes(st.download + st.upload)),
        ],
      ),
    );
  }

  Widget _serverList(bool connected) {
    if (servers.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'Серверов пока нет.\nНажмите 🔗 сверху и вставьте ссылку подписки (https://…) или vless:// / vmess:// / trojan:// / ss://',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF8B949E)),
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: servers.length,
      itemBuilder: (context, index) {
        final server = servers[index];
        return ServerCard(
          server: server,
          isSelected: selected?.id == server.id,
          onLongPress: () => _confirmDelete(server),
          onTap: () async {
            setState(() => selected = server);
            await StorageService.saveSelectedId(server.id);
            if (connected) _snack('Сервер изменён — переподключитесь');
          },
        );
      },
    );
  }
}
