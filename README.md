# Nex — VPN-клиент (Flutter + Xray)

Ядро Xray и Android VpnService (плагин flutter_v2ray).
Протоколы: VLESS (в т.ч. Reality), VMess, Trojan, Shadowsocks, SOCKS.
Подписки: список ссылок (в т.ч. base64) и готовые Xray JSON-конфигурации.
Hysteria2 / TUIC / sing-box-подписки это ядро не поддерживает.

## Сборка без установки Flutter
1. Загрузите ВСЕ файлы проекта в репозиторий GitHub (папки lib, test, tools, assets, android_overrides, файл pubspec.yaml и скрытую папку .github).
2. Actions -> Build APK -> Run workflow.
3. Скачайте артефакт nexvpn-apk; для большинства телефонов нужен app-arm64-v8a-release.apk.
4. В логе шага «Generate Android platform» виден результат тестов.

## Как проверяется логика
- `tools/ref/` — эталонная реализация разбора подписок на Node.js и тестовый сервер, имитирующий панель подписок
  (заглушки при отсутствии HWID, одинаковые «серверы»-заглушки, Xray JSON для одного User-Agent, base64-список для другого):
  `node tools/ref/run_tests.js`
- `test/core_test.dart` — те же примеры, но на Dart; запускается в CI перед сборкой.
- В приложении: Настройки → Диагностика — журнал того, что реально ответила подписка (без паролей), кнопка копирования.

## Иконка
`python3 tools/make_icon.py` пересоздаёт иконку (Pillow); при сборке она копируется из android_overrides.
