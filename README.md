# NexVPN (Flutter + Xray)

Рабочий VPN-клиент: ядро Xray и Android VpnService (плагин flutter_v2ray).
Протоколы: VLESS (в т.ч. Reality), VMess, Trojan, Shadowsocks, SOCKS.
Hysteria2 / TUIC такое ядро не поддерживает — такие ссылки при импорте пропускаются.

## Сборка без установки Flutter (рекомендуется)
1. Создайте репозиторий на github.com и загрузите ВСЕ файлы проекта (вместе с папками .github и tools).
2. Вкладка Actions -> Build APK -> Run workflow.
3. Через 5-10 минут скачайте артефакт nexvpn-apk. Для большинства телефонов нужен app-arm64-v8a-release.apk.

## Сборка локально (Linux / macOS / Git Bash)
    flutter create --platforms=android --project-name nexvpn_app --org com.nexvpn .
    sh tools/patch_android.sh
    flutter pub get
    flutter build apk --release --split-per-abi --no-shrink

(`flutter create .` не перезаписывает существующие lib/ и pubspec.yaml; если перезапишет — верните свои файлы.)

## Как пользоваться
- 🔗 сверху: вставьте ссылку подписки https://… или vless:// / vmess:// / trojan:// / ss://
- «Тест пинга» — реальный замер задержки через ядро.
- Большая кнопка — подключиться/отключиться (при первом запуске Android спросит разрешение на VPN).
- Настройки: Per-App Routing, Bypass LAN, TLS Fragmentation. Kill Switch включается в системных настройках Android.
