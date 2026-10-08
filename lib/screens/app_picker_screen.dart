import 'package:flutter/material.dart';
import 'package:installed_apps/app_info.dart';
import 'package:installed_apps/installed_apps.dart';

/// Выбор приложений, трафик которых пойдёт через VPN.
class AppPickerScreen extends StatefulWidget {
  final List<String> selected;
  const AppPickerScreen({super.key, required this.selected});

  @override
  State<AppPickerScreen> createState() => _AppPickerScreenState();
}

class _AppPickerScreenState extends State<AppPickerScreen> {
  List<AppInfo> _apps = [];
  late Set<String> _selected;
  String _query = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _selected = widget.selected.toSet();
    _load();
  }

  Future<void> _load() async {
    final apps = await InstalledApps.getInstalledApps(true, true, '');
    apps.sort((a, b) => (a.name ?? '').toLowerCase().compareTo((b.name ?? '').toLowerCase()));
    if (!mounted) return;
    setState(() {
      _apps = apps;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final visible = _apps.where((a) {
      if (_query.isEmpty) return true;
      return (a.name ?? '').toLowerCase().contains(_query.toLowerCase());
    }).toList();

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.pop(context, _selected.toList());
      },
      child: Scaffold(
        appBar: AppBar(title: Text('Приложения через VPN (${_selected.length})')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: TextField(
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.search),
                        hintText: 'Поиск приложения',
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (v) => setState(() => _query = v),
                    ),
                  ),
                  Expanded(
                    child: ListView.builder(
                      itemCount: visible.length,
                      itemBuilder: (context, i) {
                        final app = visible[i];
                        final pkg = app.packageName ?? '';
                        final icon = app.icon;
                        return CheckboxListTile(
                          value: _selected.contains(pkg),
                          onChanged: (v) => setState(() {
                            if (v == true) {
                              _selected.add(pkg);
                            } else {
                              _selected.remove(pkg);
                            }
                          }),
                          title: Text(app.name ?? pkg),
                          subtitle: Text(pkg, style: const TextStyle(fontSize: 11)),
                          secondary: icon != null
                              ? Image.memory(icon, width: 36, height: 36)
                              : const Icon(Icons.android),
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
