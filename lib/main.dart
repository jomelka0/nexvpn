import 'package:flutter/material.dart';
import 'services/storage_service.dart';
import 'services/vpn_service.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await StorageService.init();
  try {
    await VpnManager.instance.init();
  } catch (_) {
    // ядро инициализируется повторно при подключении
  }
  runApp(const NexVPNApp());
}

class NexVPNApp extends StatelessWidget {
  const NexVPNApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NexVPN',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0D1117),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF58A6FF),
          surface: Color(0xFF161B22),
          error: Color(0xFFF85149),
        ),
        cardTheme: CardThemeData(
          color: const Color(0xFF161B22),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFF30363D), width: 1),
          ),
        ),
      ),
      home: const HomeScreen(),
    );
  }
}
