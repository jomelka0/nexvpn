import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_v2ray/flutter_v2ray.dart';
import '../models/server_node.dart';
import '../models/subscription.dart';
import '../services/ping_service.dart';
import '../services/storage_service.dart';
import '../services/subscription_service.dart';
import '../services/vpn_service.dart';
import '../utils/format.dart';
import '../utils/page_routes.dart';
import '../widgets/animated_icon_button.dart';
import '../widgets/connection_stats.dart';
import '../widgets/fade_in_up.dart';
import '../widgets/server_card.dart';
import '../widgets/tap_scale.dart';
import 'add_subscription_sheet.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<ServerNode> servers = [];
  List<Subscription> subs = [];
  String? filterUrl; // null = все серверы
  ServerNode? selected;
  bool pinging = false;
  String? connectingId;
  final Set<String> pingingIds = {};

  static const _muted = Color(0xFF8B949E);

  @override
  void initState() {
    super.initState();
    _loadData();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoUpdate());
  }

  void _loadData() {
    servers = StorageService.getServers();
    subs = StorageService.getSubscriptions();
    if (filterUrl != null && !subs.any((s) => s.url == filterUrl)) filterUrl = null;
    final id = StorageService.getSelectedId();
    selected = servers.where((s) => s.id == id).firstOrNull ?? servers.firstOrNull;
    if (mounted) setState(() {});
  }

  List<ServerNode> get _visible =>
      filterUrl == null ? servers : servers.where((s) => s.source == filterUrl).toList();

  Subscription? get _currentSub {
    if (filterUrl != null) return subs.where((s) => s.url == filterUrl).firstOrNull;
    return subs.length == 1 ? subs.first : null;
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  // ---------- подписки ----------

  Future<void> _autoUpdate() async {
    for (final sub in StorageService.getSubscriptions()) {
      if (sub.needsUpdate) await _updateSubscription(sub, silent: true);
    }
  }

  Future<int> _updateSubscription(Subscription sub, {bool silent = false}) async {
    final res = await SubscriptionService.import(sub.url);
    if (res.servers.isEmpty) {
      if (!silent) _snack(res.error ?? 'Не удалось обновить подписку');
      return 0;
    }
    await SubscriptionService.saveResult(res);
    _loadData();
    return res.servers.length;
  }

  Future<void> _refreshAll() async {
    if (subs.isEmpty) {
      _snack('Нет подписок для обновления');
      return;
    }
    _snack('Обновляю подписки…');
    var count = 0;
    for (final sub in List<Subscription>.from(subs)) {
      count += await _updateSubscription(sub, silent: true);
    }
    _snack(count > 0 ? 'Обновлено серверов: $count' : 'Не удалось обновить — см. Настройки → Диагностика');
  }

  Future<void> _deleteSubscription(Subscription sub) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Удалить подписку?'),
        content: Text('${sub.name}\nВсе её серверы будут удалены.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Отмена')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Удалить')),
        ],
      ),
    );
    if (ok != true) return;
    final all = StorageService.getServers()..removeWhere((s) => s.source == sub.url);
    await StorageService.saveServers(all);
    final rest = StorageService.getSubscriptions()..removeWhere((s) => s.url == sub.url);
    await StorageService.saveSubscriptions(rest);
    _loadData();
  }

  Future<void> _openAddSheet() async {
    final msg = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF161B22),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (_) => const AddSubscriptionSheet(),
    );
    _loadData();
    if (msg != null) _snack(msg);
  }

  // ---------- подключение ----------

  Future<void> _toggleServer(ServerNode server) async {
    final vpn = VpnManager.instance;
    if (connectingId != null) return;
    setState(() {
      selected = server;
      connectingId = server.id;
    });
    StorageService.saveSelectedId(server.id);
    try {
      if (vpn.connectedServerId == server.id) {
        await vpn.disconnect();
      } else {
        if (vpn.isConnected) {
          await vpn.disconnect();
          await Future.delayed(const Duration(milliseconds: 500));
        }
        final err = await vpn.connect(server, StorageService.getSettings());
        if (err != null) _snack(err);
      }
    } finally {
      if (mounted) setState(() => connectingId = null);
    }
  }

  Future<void> _disconnect() async {
    await VpnManager.instance.disconnect();
  }

  // ---------- пинг ----------

  Future<void> _pingAll() async {
    if (pinging || _visible.isEmpty) return;
    final list = _visible;
    setState(() => pinging = true);
    await PingService.pingAll(
      list,
      onStart: (s) {
        if (mounted) setState(() => pingingIds.add(s.id));
      },
      onDone: (s) {
        if (mounted) setState(() => pingingIds.remove(s.id));
      },
    );
    await StorageService.saveServers(servers);
    if (!mounted) return;
    setState(() => pinging = false);
    if (list.every((s) => (s.ping ?? -1) < 0)) {
      _snack(VpnManager.instance.lastPingError ?? 'Ни один сервер не ответил на проверку');
    }
  }

  Future<void> _pingOne(ServerNode server) async {
    if (pingingIds.contains(server.id)) return;
    setState(() => pingingIds.add(server.id));
    server.ping = await VpnManager.instance.ping(server);
    await StorageService.saveServers(servers);
    if (!mounted) return;
    setState(() => pingingIds.remove(server.id));
    if ((server.ping ?? -1) < 0) {
      _snack(VpnManager.instance.lastPingError ?? 'Сервер не ответил на проверку');
    }
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

  // ---------- интерфейс ----------

  String _plural(int n, String one, String few, String many) {
    final m10 = n % 10, m100 = n % 100;
    if (m10 == 1 && m100 != 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF111D31), Color(0xFF0D1117)],
        ),
      ),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: ValueListenableBuilder<V2RayStatus>(
            valueListenable: VpnManager.instance.status,
            builder: (context, st, _) {
              final connected = st.state == 'CONNECTED';
              final connecting = st.state == 'CONNECTING';
              final connectedServer =
                  servers.where((s) => s.id == VpnManager.instance.connectedServerId).firstOrNull;
              return Column(
                children: [
                  _header(connected, connecting),
                  _subBar(),
                  if (subs.length > 1) _subChips(),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 350),
                    curve: Curves.easeOutCubic,
                    alignment: Alignment.topCenter,
                    child: connected
                        ? Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: ConnectionStats(
                              status: st,
                              down: VpnManager.instance.downHistory,
                              up: VpnManager.instance.upHistory,
                              serverName: connectedServer?.name ?? '',
                              onDisconnect: _disconnect,
                            ),
                          )
                        : const SizedBox(width: double.infinity),
                  ),
                  const SizedBox(height: 6),
                  Expanded(child: _serverList(st, connecting)),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _header(bool connected, bool connecting) {
    final n = _visible.length;
    final status = connecting ? 'подключение…' : (connected ? 'подключено' : 'не подключено');
    final subtitle = '$n ${_plural(n, 'сервер', 'сервера', 'серверов')} • $status';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 6, 6),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF58A6FF).withOpacity(0.35)),
              color: const Color(0xFF58A6FF).withOpacity(0.10),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(13),
              child: Image.asset('assets/icon/nex_logo.png', fit: BoxFit.cover),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Nex', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  child: Text(subtitle,
                      key: ValueKey(subtitle),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 12.5,
                          color: connected ? const Color(0xFF3FB950) : _muted)),
                ),
              ],
            ),
          ),
          AnimatedIconButton(
            tooltip: 'Обновить подписки',
            icon: Icons.refresh_rounded,
            anim: IconAnim.spin,
            onPressed: _refreshAll,
          ),
          AnimatedIconButton(
            tooltip: 'Проверить пинг',
            icon: Icons.network_ping_rounded,
            anim: IconAnim.bounce,
            onPressed: _pingAll,
          ),
          AnimatedIconButton(
            tooltip: 'Настройки',
            icon: Icons.settings_rounded,
            anim: IconAnim.turn,
            onPressed: () => Navigator.push(context, fadeSlideRoute<void>(const SettingsScreen()))
                .then((_) => _loadData()),
          ),
        ],
      ),
    );
  }

  Widget _subBar() {
    final sub = _currentSub;
    final parts = <String>[];
    if (sub != null) {
      if (sub.total > 0) {
        parts.add('${formatBytes(sub.used)} из ${formatBytes(sub.total)}');
      } else if (sub.used > 0) {
        parts.add('использовано ${formatBytes(sub.used)}');
      }
      if (sub.expire > 0) {
        final left = DateTime.fromMillisecondsSinceEpoch(sub.expire * 1000)
            .difference(DateTime.now())
            .inDays;
        parts.add(left < 0 ? 'срок истёк' : 'осталось дней: $left');
      }
      if (sub.updatedAt > 0) {
        parts.add('обновлено ${formatDateTime(DateTime.fromMillisecondsSinceEpoch(sub.updatedAt))}');
      }
    }
    final title = sub != null
        ? sub.name
        : (subs.isEmpty ? 'Добавьте подписку' : 'Все подписки (${subs.length})');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: TapScale(
        onTap: _openAddSheet,
        scaleDown: 0.98,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
          decoration: BoxDecoration(
            color: const Color(0xFF161B22),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFF30363D)),
          ),
          child: Row(
            children: [
              const Icon(Icons.link_rounded, size: 20, color: _muted),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    if (parts.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(parts.join(' • '),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 11, color: _muted)),
                      ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                icon: const Icon(Icons.edit_outlined, size: 20, color: _muted),
                color: const Color(0xFF1C2230),
                onSelected: (v) async {
                  if (v == 'add') {
                    await _openAddSheet();
                  } else if (v == 'update' && sub != null) {
                    final n = await _updateSubscription(sub);
                    if (n > 0) _snack('Обновлено серверов: $n');
                  } else if (v == 'copy' && sub != null) {
                    await Clipboard.setData(ClipboardData(text: sub.url));
                    _snack('Ссылка скопирована');
                  } else if (v == 'delete' && sub != null) {
                    await _deleteSubscription(sub);
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(value: 'add', child: Text('Добавить подписку')),
                  if (sub != null) const PopupMenuItem(value: 'update', child: Text('Обновить')),
                  if (sub != null) const PopupMenuItem(value: 'copy', child: Text('Копировать ссылку')),
                  if (sub != null) const PopupMenuItem(value: 'delete', child: Text('Удалить подписку')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _subChips() {
    Widget chip(String label, bool active, VoidCallback onTap) {
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: TapScale(
          onTap: onTap,
          scaleDown: 0.94,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              color: active ? const Color(0xFF58A6FF).withOpacity(0.16) : const Color(0xFF161B22),
              border: Border.all(
                  color: active ? const Color(0xFF58A6FF) : const Color(0xFF30363D)),
            ),
            child: Text(label,
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: active ? const Color(0xFF58A6FF) : _muted)),
          ),
        ),
      );
    }

    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        children: [
          chip('Все', filterUrl == null, () => setState(() => filterUrl = null)),
          for (final s in subs)
            chip(s.name, filterUrl == s.url, () => setState(() => filterUrl = s.url)),
        ],
      ),
    );
  }

  Widget _serverList(V2RayStatus st, bool statusConnecting) {
    final list = _visible;
    if (list.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            subs.isEmpty
                ? 'Подписок пока нет.\nНажмите на строку выше и вставьте ссылку подписки — все серверы загрузятся сразу.'
                : 'В этой подписке нет серверов.\nОбновите её или проверьте Настройки → Диагностика.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: _muted),
          ),
        ),
      );
    }
    final connectedId = VpnManager.instance.connectedServerId;
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 24),
      itemCount: list.length,
      itemBuilder: (context, index) {
        final server = list[index];
        final delay = (index < 8 ? index : 8) * 50;
        return FadeInUp(
          delayMs: delay,
          child: ServerCard(
            server: server,
            isSelected: selected?.id == server.id,
            isConnected: connectedId == server.id,
            isConnecting: connectingId == server.id ||
                (statusConnecting && selected?.id == server.id),
            pinging: pingingIds.contains(server.id),
            onPingTap: () => _pingOne(server),
            onPower: () => _toggleServer(server),
            onLongPress: () => _confirmDelete(server),
            onTap: () {
              setState(() => selected = server);
              StorageService.saveSelectedId(server.id);
            },
          ),
        );
      },
    );
  }
}
