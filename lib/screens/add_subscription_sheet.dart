import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/subscription_service.dart';
import '../widgets/tap_scale.dart';

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

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final text = data?.text;
    if (text != null && text.isNotEmpty) {
      setState(() => _controller.text = text.trim());
    }
  }

  Future<void> _import() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _loading) return;
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

    final msg = await SubscriptionService.saveResult(res);
    if (mounted) Navigator.pop(context, msg);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 20,
        right: 20,
        top: 10,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFF30363D),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 18),
          const Text('Добавить подписку',
              style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text('vmess / vless / trojan / ss / Xray JSON',
              style: TextStyle(fontSize: 12.5, color: Color(0xFF8B949E))),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            maxLines: 3,
            minLines: 1,
            decoration: InputDecoration(
              hintText: 'https://example.com/sub/xxxx',
              prefixIcon: const Icon(Icons.link_rounded, size: 20),
              suffixIcon: IconButton(
                tooltip: 'Вставить из буфера',
                icon: const Icon(Icons.content_paste_rounded, size: 20),
                onPressed: _paste,
              ),
              filled: true,
              fillColor: const Color(0xFF0D1117),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFF30363D)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFF30363D)),
              ),
              errorText: _error,
              errorMaxLines: 8,
            ),
          ),
          const SizedBox(height: 16),
          TapScale(
            onTap: _import,
            scaleDown: 0.97,
            child: Container(
              height: 54,
              width: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: const LinearGradient(
                  colors: [Color(0xFF1F6FEB), Color(0xFF58A6FF)],
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF1F6FEB).withOpacity(0.35),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Center(
                child: _loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                    : const Text('Импортировать',
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.white)),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
