#!/bin/sh
# Вызывается после `flutter create`: добавляет разрешения и настройки, нужные VPN-ядру.
set -e
M=android/app/src/main/AndroidManifest.xml

if ! grep -q QUERY_ALL_PACKAGES "$M"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.INTERNET"/>\n    <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES"/>\n    <application#' "$M"
fi

for f in android/app/build.gradle.kts android/app/build.gradle; do
  if [ -f "$f" ]; then
    sed -i 's/minSdk = flutter.minSdkVersion/minSdk = 24/; s/minSdkVersion flutter.minSdkVersion/minSdkVersion 24/' "$f"
    sed -i 's/^android {/android {\n    packaging {\n        jniLibs {\n            useLegacyPackaging = true\n        }\n    }/' "$f"
  fi
done
echo "Android patched"
