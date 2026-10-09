import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_v2ray/flutter_v2ray.dart';
import '../models/server_node.dart';
import '../models/subscription.dart';
import '../services/storage_service.dart';
import '../services/ping_service.dart';
import '../services/subscription_service.dart';
import '../services/vpn_service.dart';
import '../utils/format.dart';
import '../utils/page_routes.dart';
import '../widgets/animated_icon_button.dart';
import '../widgets/connection_stats.dart';
import '../widgets/fade_in_up.dart';
import '../widgets/server_card.dart';
import '../widgets/tap_scale.dart';
import 'settings_screen.dart';
import 'add_subscription_sheet.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  List<ServerNode> servers = [];
  List<Object> items = []; // Subscription | String (заголовок) | ServerNode
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
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoUpdate());
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  void _loadData() {
    servers = StorageService.getServers();
    final subs = StorageService.getSubscriptions();
    final id = StorageService.getSelectedId();
    selected = servers.where((s) => s.id == id).firstOrNull ?? servers.firstOrNull;

    final list = <Object>[];
    final used = <String>{};
    for (final sub in subs) {
      final group = servers.where((s) => s.source == sub.url).toList();
      list.add(sub);
      list.addAll(group);
      used.addAll(group.map((s) => s.id));
    }
    final manual = servers.where((s) => !used.contains(s.id)).toList();
    if (manual.isNotEmpty) {
      if (subs.isNotEmpty) list.add('Добавлены вручную');
      list.addAll(manual);
    }
    items = list;
    if (mounted) setState(() {});
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

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
    final subs = StorageService.getSubscriptions();
    if (subs.isEmpty) {
      _snack('Нет подписок для обновления');
      return;
    }
    _snack('Обновляю подписки…');
    var count = 0;
    for (final sub in subs) {
      count += await _updateSubscription(sub, silent: true);
    }
    _snack('Обновлено серверов: $count');
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
    final subs = StorageService.getSubscriptions()..removeWhere((s) => s.url == sub.url);
    await StorageService.saveSubscriptions(subs);
    _loadData();
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
          _snack('Сначала добавьте подписку (кнопка 🔗 сверху)');
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
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          title: Row(
            children: [
              const Icon(Icons.shield_rounded, color: Color(0xFF58A6FF)),
              const SizedBox(width: 8),
              ShaderMask(
                shaderCallback: (r) => const LinearGradient(
                  colors: [Color(0xFF58A6FF), Color(0xFFA371F7)],
                ).createShader(r),
                child: const Text('NexVPN',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 24, color: Colors.white)),
              ),
            ],
          ),
          actions: [
            AnimatedIconButton(
              tooltip: 'Обновить все подписки',
              icon: Icons.refresh_rounded,
              anim: IconAnim.spin,
              onPressed: _refreshAll,
            ),
            AnimatedIconButton(
              tooltip: 'Добавить подписку',
              icon: Icons.add_link_rounded,
              anim: IconAnim.bounce,
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
            AnimatedIconButton(
              tooltip: 'Настройки',
              icon: Icons.settings_rounded,
              anim: IconAnim.turn,
              onPressed: () => Navigator.push(context, fadeSlideRoute<void>(const SettingsScreen())),
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
                Center(child: _connectButton(connected, connecting)),
                _statusLabel(connected, connecting),
                const SizedBox(height: 10),
                AnimatedSize(
                  duration: const Duration(milliseconds: 350),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.topCenter,
                  child: connected
                      ? ConnectionStats(
                          status: st,
                          down: VpnManager.instance.downHistory,
                          up: VpnManager.instance.upHistory,
                        )
                      : const SizedBox(width: double.infinity),
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Серверы',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      TextButton.icon(
                        onPressed: pinging ? null : _pingAll,
                        icon: pinging
                            ? const SizedBox(
                                width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.network_ping_rounded, size: 18),
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
      ),
    );
  }

  Widget _statusLabel(bool connected, bool connecting) {
    final text = connecting ? 'Подключение…' : (connected ? 'Подключено' : 'Не подключено');
    final color = connected ? const Color(0xFF3FB950) : const Color(0xFF8B949E);
    return Column(
      children: [
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          transitionBuilder: (c, a) => FadeTransition(
            opacity: a,
            child: SlideTransition(
              position: Tween<Offset>(begin: const Offset(0, 0.3), end: Offset.zero).animate(a),
              child: c,
            ),
          ),
          child: Text(text,
              key: ValueKey(text),
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: color)),
        ),
        if (selected != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 24, right: 24),
            child: Text(selected!.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: Color(0xFF8B949E))),
          ),
      ],
    );
  }

  Widget _ring(double size, double opacity) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: const Color(0xFF3FB950).withOpacity(opacity.clamp(0.0, 1.0).toDouble()),
          width: 2,
        ),
      ),
    );
  }

  Widget _connectButton(bool connected, bool connecting) {
    final List<Color> colors = connected
        ? const [Color(0xFF238636), Color(0xFF3FB950)]
        : connecting
            ? const [Color(0xFF1F6FEB), Color(0xFF58A6FF)]
            : const [Color(0xFF2A313C), Color(0xFF1B212B)];
    final glow = connected
        ? const Color(0xFF3FB950)
        : (connecting ? const Color(0xFF58A6FF) : Colors.transparent);

    return TapScale(
      onTap: _toggle,
      scaleDown: 0.92,
      child: SizedBox(
        width: 190,
        height: 190,
        child: AnimatedBuilder(
          animation: _pulse,
          builder: (context, _) {
            final p = _pulse.value;
            return Stack(
              alignment: Alignment.center,
              children: [
                if (connected) ...[
                  _ring(130 + 55 * p, 0.30 * (1 - p)),
                  _ring(130 + 55 * (1 - p), 0.20 * p),
                ],
                AnimatedContainer(
                  duration: const Duration(milliseconds: 500),
                  curve: Curves.easeOutCubic,
                  width: 130,
                  height: 130,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: colors,
                    ),
                    border: Border.all(
                      color: (connected || connecting) ? Colors.transparent : const Color(0xFF30363D),
                      width: 2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: glow.withOpacity(0.45),
                        blurRadius: connected ? 28 : 22,
                        spreadRadius: connected ? 4 : 2,
                      ),
                    ],
                  ),
                  child: Center(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      transitionBuilder: (c, a) =>
                          ScaleTransition(scale: a, child: FadeTransition(opacity: a, child: c)),
                      child: connecting
                          ? const SizedBox(
                              key: ValueKey('wait'),
                              width: 42,
                              height: 42,
                              child: CircularProgressIndicator(strokeWidth: 3, color: Colors.white),
                            )
                          : Icon(
                              Icons.power_settings_new_rounded,
                              key: ValueKey(connected),
                              size: 60,
                              color: connected ? Colors.white : const Color(0xFF8B949E),
                            ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _subHeader(Subscription sub) {
    final hasTotal = sub.total > 0;
    final parts = <String>[];
    if (hasTotal) {
      parts.add('${formatBytes(sub.used)} из ${formatBytes(sub.total)}');
    } else if (sub.used > 0) {
      parts.add('Использовано ${formatBytes(sub.used)}');
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

    return Container(
      margin: const EdgeInsets.only(top: 4, bottom: 10),
      padding: const EdgeInsets.fromLTRB(14, 6, 4, 10),
      decoration: BoxDecoration(
        color: const Color(0xFF161B22),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF30363D)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.cloud_outlined, size: 18, color: Color(0xFF58A6FF)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(sub.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.bold)),
              ),
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert, size: 20),
                onSelected: (v) async {
                  if (v == 'update') {
                    final n = await _updateSubscription(sub);
                    if (n > 0) _snack('Обновлено серверов: $n');
                  } else if (v == 'copy') {
                    await Clipboard.setData(ClipboardData(text: sub.url));
                    _snack('Ссылка скопирована');
                  } else if (v == 'delete') {
                    await _deleteSubscription(sub);
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'update', child: Text('Обновить')),
                  PopupMenuItem(value: 'copy', child: Text('Копировать ссылку')),
                  PopupMenuItem(value: 'delete', child: Text('Удалить подписку')),
                ],
              ),
            ],
          ),
          if (hasTotal)
            Padding(
              padding: const EdgeInsets.only(right: 10, bottom: 6),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: (sub.used / sub.total).clamp(0.0, 1.0).toDouble(),
                  minHeight: 5,
                ),
              ),
            ),
          if (parts.isNotEmpty)
            Text(parts.join(' • '),
                style: const TextStyle(fontSize: 11, color: Color(0xFF8B949E))),
        ],
      ),
    );
  }

  Widget _serverList(bool connected) {
    if (items.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'Подписок пока нет.\nНажмите 🔗 сверху и вставьте ссылку подписки (https://…) — все серверы загрузятся сразу.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF8B949E)),
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        final delay = (index < 8 ? index : 8) * 50;
        Widget child;
        if (item is Subscription) {
          child = _subHeader(item);
        } else if (item is String) {
          child = Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 10),
            child: Text(item,
                style: const TextStyle(color: Color(0xFF8B949E), fontWeight: FontWeight.bold)),
          );
        } else {
          final server = item as ServerNode;
          child = ServerCard(
            server: server,
            isSelected: selected?.id == server.id,
            onLongPress: () => _confirmDelete(server),
            onTap: () async {
              setState(() => selected = server);
              await StorageService.saveSelectedId(server.id);
              if (connected) _snack('Сервер изменён — переподключитесь');
            },
          );
        }
        return FadeInUp(delayMs: delay, child: child);
      },
    );
  }
}
