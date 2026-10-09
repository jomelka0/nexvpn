import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/diag_log.dart';
import '../services/storage_service.dart';
import '../services/subscription_service.dart';

/// Журнал: что ответил сервер подписки, ошибки пинга и подключения.
/// Пароли и UUID в журнал не попадают.
class DiagnosticsScreen extends StatefulWidget {
  const DiagnosticsScreen({super.key});

  @override
  State<DiagnosticsScreen> createState() => _DiagnosticsScreenState();
}

class _DiagnosticsScreenState extends State<DiagnosticsScreen> {
  bool _running = false;

  String get _report {
    final hwid = StorageService.getHwid();
    final head = 'Nex 1.1 • устройство ${hwid == null ? '—' : hwid.substring(0, 6)}…\n'
        'Подписок: ${StorageService.getSubscriptions().length}, '
        'серверов: ${StorageService.getServers().length}\n';
    return '$head\n${DiagLog.instance.text}';
  }

  Future<void> _check() async {
    setState(() => _running = true);
    final subs = StorageService.getSubscriptions();
    if (subs.isEmpty) DiagLog.add('Нет подписок для проверки');
    for (final sub in subs) {
      final res = await SubscriptionService.import(sub.url);
      if (res.servers.isNotEmpty) {
        await SubscriptionService.saveResult(res);
      } else {
        DiagLog.add('Итог: ${res.error}');
      }
    }
    if (mounted) setState(() => _running = false);
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
          title: const Text('Диагностика', style: TextStyle(fontWeight: FontWeight.w800)),
          actions: [
            IconButton(
              tooltip: 'Копировать отчёт',
              icon: const Icon(Icons.copy_rounded),
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: _report));
                if (!context.mounted) return;
                ScaffoldMessenger.of(context)
                    .showSnackBar(const SnackBar(content: Text('Отчёт скопирован')));
              },
            ),
            IconButton(
              tooltip: 'Очистить',
              icon: const Icon(Icons.delete_outline_rounded),
              onPressed: DiagLog.instance.clear,
            ),
          ],
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _running ? null : _check,
                      icon: _running
                          ? const SizedBox(
                              width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.fact_check_outlined),
                      label: const Text('Проверить подписки и собрать отчёт'),
                    ),
                  ),
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'Ссылки в отчёте маскируются: пароли и UUID не показываются. '
                'Нажмите значок копирования и отправьте отчёт разработчику.',
                style: TextStyle(fontSize: 11.5, color: Color(0xFF8B949E)),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: AnimatedBuilder(
                animation: DiagLog.instance,
                builder: (context, _) {
                  final text = DiagLog.instance.isEmpty
                      ? 'Журнал пуст. Нажмите «Проверить подписки…».'
                      : DiagLog.instance.text;
                  return Container(
                    width: double.infinity,
                    margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0D1117),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFF30363D)),
                    ),
                    child: SingleChildScrollView(
                      child: SelectableText(
                        text,
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 11, height: 1.35),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
