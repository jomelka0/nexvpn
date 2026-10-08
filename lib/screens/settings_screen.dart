import 'package:flutter/material.dart';
import '../models/app_settings.dart';
import '../services/storage_service.dart';
import '../services/vpn_service.dart';
import '../widgets/setting_tile.dart';
import 'app_picker_screen.dart';

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
          'Откройте настройки VPN → значок ⚙ рядом с NexVPN → включите «Всегда включённый VPN» и '
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
      MaterialPageRoute(builder: (_) => AppPickerScreen(selected: settings.selectedApps)),
    );
    if (result != null) {
      settings.selectedApps = result;
      _save();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Продвинутые настройки')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Функции Shadowrocket & INCY',
              style: TextStyle(color: Color(0xFF8B949E), fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('Изменения применяются при следующем подключении.',
              style: TextStyle(color: Color(0xFF8B949E), fontSize: 12)),
          const SizedBox(height: 10),
          SettingTile(
            title: 'Kill Switch',
            subtitle: 'Блокирует трафик при обрыве VPN. Настраивается в системе Android — нажмите, чтобы открыть.',
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
          SettingTile(
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
          SettingTile(
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
          if (settings.perAppRouting)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: OutlinedButton.icon(
                onPressed: _pickApps,
                icon: const Icon(Icons.apps),
                label: Text(settings.selectedApps.isEmpty
                    ? 'Выбрать приложения (пока ни одного — VPN для всех)'
                    : 'Выбрано приложений: ${settings.selectedApps.length}'),
              ),
            ),
          SettingTile(
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
        ],
      ),
    );
  }
}
