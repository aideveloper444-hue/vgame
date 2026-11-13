#!/bin/bash
# Build the standalone Wildbound Android app (com.Vibo.wildbound) on this Mac.
#   tools/build-wildbound-apk.sh            -> debug APK (installable by side-loading)
#   tools/build-wildbound-apk.sh release    -> release APK (needs the upload keystore, see android-wildbound/app/build.gradle)
# Output: dist-apk/Wildbound-<type>.apk
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
TOOLS="$HOME/vgame-tools"
TYPE="${1:-debug}"
export PATH="$TOOLS/node-v26.13.0-darwin-arm64/bin:$PATH"
export JAVA_HOME="$TOOLS/jdk/Contents/Home"
export ANDROID_HOME="$TOOLS/sdk"

echo "== web build (Wildbound only)"
node node_modules/.bin/vite build -c vite.wildbound.config.ts --logLevel warn
OUT=dist-wildbound
mv "$OUT/wildbound.html" "$OUT/index.html"
# the game's own models, textures and credits, plus the jungle props it borrows from the Amazon set
mkdir -p "$OUT/models/amazon/tex"
cp -R public/models/wildbound "$OUT/models/wildbound"
cp -R public/models/amazon/props "$OUT/models/amazon/props"
cp public/models/amazon/tex/jungle_wall.webp "$OUT/models/amazon/tex/"

echo "== Android project"
APP=android-wildbound
ASSETS="$APP/app/src/main/assets"
rm -rf "$ASSETS/public"
mkdir -p "$ASSETS"
cp -R "$OUT" "$ASSETS/public"
cat > "$ASSETS/capacitor.config.json" <<'JSON'
{
	"appId": "com.Vibo.wildbound",
	"appName": "Wildbound",
	"webDir": "dist-wildbound"
}
JSON
cp android/app/src/main/assets/capacitor.plugins.json "$ASSETS/capacitor.plugins.json"
[ -d "$APP/capacitor-cordova-android-plugins" ] || cp -R android/capacitor-cordova-android-plugins "$APP/"
echo "sdk.dir=$ANDROID_HOME" > "$APP/local.properties"

echo "== Gradle ($TYPE)"
cd "$APP"
TASK=$([ "$TYPE" = release ] && echo assembleRelease || echo assembleDebug)
"$TOOLS/gradle-8.14.3/bin/gradle" "$TASK" --no-daemon -q
cd "$ROOT"
mkdir -p dist-apk
SRC=$(ls "$APP"/app/build/outputs/apk/"$TYPE"/*.apk | head -1)
cp "$SRC" "dist-apk/Wildbound-$TYPE.apk"
ls -la "dist-apk/Wildbound-$TYPE.apk"
