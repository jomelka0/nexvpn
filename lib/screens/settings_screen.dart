import 'package:flutter/material.dart';
import '../models/app_settings.dart';
import '../services/storage_service.dart';
import '../services/vpn_service.dart';
import '../utils/page_routes.dart';
import '../widgets/fade_in_up.dart';
import '../widgets/setting_tile.dart';
import '../widgets/tap_scale.dart';
import 'app_picker_screen.dart';
import 'diagnostics_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late AppSettings settings;

  @override
  void initState() {
    super.initState();
    settings = StorageService.getSettings();
  }

  void _save() {
    StorageService.saveSettings(settings);
    setState(() {});
  }

  void _showInfoDialog(String title, String description) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(description),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Понятно')),
        ],
      ),
    );
  }

  void _showKillSwitchHelp() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Kill Switch'),
        content: const Text(
          'В Android приложение не может само блокировать интернет при обрыве VPN — это делает система.\n\n'
          'Откройте настройки VPN → значок ⚙ рядом с Nex → включите «Всегда включённый VPN» и '
          '«Блокировать подключения без VPN». Тогда при обрыве туннеля трафик не пойдёт напрямую.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Позже')),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              VpnManager.openSystemVpnSettings();
            },
            child: const Text('Открыть настройки VPN'),
          ),
        ],
      ),
    );
  }

  Future<void> _pickApps() async {
    final result = await Navigator.push<List<String>>(
      context,
      fadeSlideRoute<List<String>>(AppPickerScreen(selected: settings.selectedApps)),
    );
    if (result != null) {
      settings.selectedApps = result;
      _save();
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
          title: const Text('Настройки', style: TextStyle(fontWeight: FontWeight.w800)),
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const FadeInUp(
              child: Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: Text(
                  'Изменения применяются при следующем подключении.',
                  style: TextStyle(color: Color(0xFF8B949E), fontSize: 12),
                ),
              ),
            ),
            FadeInUp(
              delayMs: 40,
              child: SettingTile(
                icon: Icons.shield_rounded,
                title: 'Kill Switch',
                subtitle:
                    'Блокирует трафик при обрыве VPN. Настраивается в системе Android — включите и откроется подсказка.',
                value: settings.killSwitch,
                onChanged: (val) {
                  settings.killSwitch = val;
                  _save();
                  if (val) _showKillSwitchHelp();
                },
                onLongPress: () => _showInfoDialog(
                  'Что такое Kill Switch?',
                  'Функция безопасности уровня операционной системы. Если туннель неожиданно падает (например, при смене базовой станции мобильной сети), Kill Switch мгновенно блокирует выход устройства в открытый интернет, защищая реальный IP-адрес от утечки.',
                ),
              ),
            ),
            FadeInUp(
              delayMs: 90,
              child: SettingTile(
                icon: Icons.call_split_rounded,
                title: 'TLS Fragmentation',
                subtitle: 'Фрагментация пакетов ClientHello для обхода систем DPI.',
                value: settings.tlsFragmentation,
                onChanged: (val) {
                  settings.tlsFragmentation = val;
                  _save();
                },
                onLongPress: () => _showInfoDialog(
                  'Что такое TLS Fragmentation?',
                  'Метод противодействия глубокому анализу пакетов (DPI). Пакет инициализации TLS соединения разбивается на мелкие фрагменты, что мешает цензурному оборудованию распознать сигнатуру заблокированного протокола.',
                ),
              ),
            ),
            FadeInUp(
              delayMs: 140,
              child: SettingTile(
                icon: Icons.apps_rounded,
                title: 'Per-App Routing',
                subtitle: 'Через VPN идут только выбранные приложения, остальные — напрямую.',
                value: settings.perAppRouting,
                onChanged: (val) {
                  settings.perAppRouting = val;
                  _save();
                },
                onLongPress: () => _showInfoDialog(
                  'Что такое Per-App Routing?',
                  'Раздельное туннелирование (Split Tunneling). Позволяет пустить через VPN-соединение только выбранные приложения (например, мессенджеры), в то время как остальные программы будут работать через вашего местного провайдера.',
                ),
              ),
            ),
            AnimatedSize(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutCubic,
              alignment: Alignment.topCenter,
              child: settings.perAppRouting
                  ? Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: OutlinedButton.icon(
                        onPressed: _pickApps,
                        icon: const Icon(Icons.checklist_rounded),
                        label: Text(settings.selectedApps.isEmpty
                            ? 'Выбрать приложения (пока ни одного — VPN для всех)'
                            : 'Выбрано приложений: ${settings.selectedApps.length}'),
                      ),
                    )
                  : const SizedBox(width: double.infinity),
            ),
            FadeInUp(
              delayMs: 190,
              child: SettingTile(
                icon: Icons.lan_rounded,
                title: 'Bypass LAN',
                subtitle: 'Исключить локальную сеть из VPN-туннеля.',
                value: settings.bypassLan,
                onChanged: (val) {
                  settings.bypassLan = val;
                  _save();
                },
                onLongPress: () => _showInfoDialog(
                  'Что такое Bypass LAN?',
                  'Позволяет вашему устройству напрямую взаимодействовать с локальными устройствами (принтеры, сетевые диски NAS, умный дом) без перенаправления запросов на удаленный VPN-сервер.',
                ),
              ),
            ),
            FadeInUp(
              delayMs: 240,
              child: TapScale(
                onTap: () => Navigator.push(context, fadeSlideRoute<void>(const DiagnosticsScreen())),
                scaleDown: 0.97,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF161B22),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: const Color(0xFF30363D)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          color: const Color(0xFF21262D),
                        ),
                        child: const Icon(Icons.bug_report_rounded, size: 22, color: Color(0xFF8B949E)),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Диагностика',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                            SizedBox(height: 3),
                            Text('Журнал ответов подписки, пингов и подключений',
                                style: TextStyle(fontSize: 12, color: Color(0xFF8B949E))),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded, color: Color(0xFF8B949E)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
