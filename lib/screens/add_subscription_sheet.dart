import 'package:flutter/material.dart';
import '../services/subscription_service.dart';
import '../services/storage_service.dart';

class AddSubscriptionSheet extends StatefulWidget {
  const AddSubscriptionSheet({super.key});

  @override
  State<AddSubscriptionSheet> createState() => _AddSubscriptionSheetState();
}

class _AddSubscriptionSheetState extends State<AddSubscriptionSheet> {
  final TextEditingController _controller = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _import() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    final res = await SubscriptionService.import(text);
    if (res.servers.isEmpty) {
      setState(() {
        _loading = false;
        _error = res.error ?? 'Ничего не найдено';
      });
      return;
    }

    final existing = StorageService.getServers();
    if (res.source.isNotEmpty) {
      existing.removeWhere((s) => s.source == res.source);
      final subs = StorageService.getSubscriptions();
      if (!subs.contains(res.source)) {
        subs.add(res.source);
        await StorageService.saveSubscriptions(subs);
      }
    }
    final known = existing.map((s) => s.link).toSet();
    final fresh = res.servers.where((s) => !known.contains(s.link)).toList();
    existing.addAll(fresh);
    await StorageService.saveServers(existing);

    var msg = 'Добавлено серверов: ${fresh.length}';
    if (res.skipped > 0) msg += ' (пропущено, протокол не поддерживается: ${res.skipped})';
    if (mounted) Navigator.pop(context, msg);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Добавить подписку / ссылку',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: 'Ссылка подписки https://… или vless:// vmess:// trojan:// ss://',
              border: const OutlineInputBorder(),
              errorText: _error,
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF58A6FF), foregroundColor: Colors.black),
            onPressed: _loading ? null : _import,
            child: _loading
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Импортировать'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
