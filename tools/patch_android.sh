#!/bin/sh
# Вызывается после `flutter create`: разрешения, название, иконка, настройки сборки, тесты.
set -e
M=android/app/src/main/AndroidManifest.xml

if ! grep -q QUERY_ALL_PACKAGES "$M"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.INTERNET"/>\n    <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES"/>\n    <application#' "$M"
fi

# Название приложения на экране телефона
sed -i 's/android:label="[^"]*"/android:label="Nex"/' "$M"

# Иконка приложения (классическая + адаптивная + монохромная)
if [ -d android_overrides/res ]; then
  cp -r android_overrides/res/. android/app/src/main/res/
  echo "Icon installed"
fi

for f in android/app/build.gradle.kts android/app/build.gradle; do
  if [ -f "$f" ]; then
    sed -i 's/minSdk = flutter.minSdkVersion/minSdk = 24/; s/minSdkVersion flutter.minSdkVersion/minSdkVersion 24/' "$f"
    sed -i 's/^android {/android {\n    packaging {\n        jniLibs {\n            useLegacyPackaging = true\n        }\n    }/' "$f"
  fi
done

# Тесты логики подписок (результат виден в логе этого шага; сборка продолжается в любом случае)
rm -f test/widget_test.dart
echo "=== Запуск тестов ==="
( flutter pub get >/dev/null 2>&1 && flutter test ) || echo "!!! ТЕСТЫ НЕ ПРОШЛИ — смотрите вывод выше (сборка APK продолжится)"
echo "=== Тесты завершены ==="
echo "Android patched"
