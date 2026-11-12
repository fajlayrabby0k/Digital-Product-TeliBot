#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_SDK_ROOT:?Set ANDROID_SDK_ROOT to the Android SDK directory}"
: "${BRIDGE_KEYSTORE:?Set BRIDGE_KEYSTORE to a private release keystore path}"
: "${BRIDGE_STORE_PASS:?Set BRIDGE_STORE_PASS in the environment}"
tools="$ANDROID_SDK_ROOT/build-tools/35.0.0"
platform="$ANDROID_SDK_ROOT/platforms/android-35/android.jar"
rm -rf build
mkdir -p build/classes build/dex
"$tools/aapt2" link -o build/base.apk --manifest AndroidManifest.xml -I "$platform" --min-sdk-version 26 --target-sdk-version 35
if command -v javac >/dev/null; then
 javac -encoding UTF-8 --release 8 -cp "$platform" -d build/classes src/com/telibot/bridge/*.java
else
 : "${ECJ_JAR:?Install JDK or set ECJ_JAR to Eclipse Java compiler 3.40.0}"
 java -jar "$ECJ_JAR" -8 -encoding UTF-8 -cp "$platform" -d build/classes src/com/telibot/bridge/*.java
fi
python3 - <<'PYZIP'
import zipfile,pathlib
with zipfile.ZipFile('build/classes.jar','w') as z:
 for p in pathlib.Path('build/classes').rglob('*.class'): z.write(p,p.relative_to('build/classes'))
PYZIP
"$tools/d8" --min-api 26 --lib "$platform" --output build/dex build/classes.jar
cp build/base.apk build/unsigned.apk
(cd build/dex && zip -q ../unsigned.apk classes.dex)
"$tools/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
"$tools/apksigner" sign --ks "$BRIDGE_KEYSTORE" --ks-key-alias bridge --ks-pass env:BRIDGE_STORE_PASS --key-pass env:BRIDGE_STORE_PASS --out build/telibot-receipt-bridge.apk build/aligned.apk
"$tools/apksigner" verify --verbose --print-certs build/telibot-receipt-bridge.apk
sha256sum build/telibot-receipt-bridge.apk
