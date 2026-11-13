#!/bin/bash
# Build the full VIBO Android app (com.Vibo.myvibo: Ludo, City, Poker, Wildbound and the hub) on this Mac.
#   tools/build-vibo-apk.sh            -> debug APK (installable by side-loading)
#   tools/build-vibo-apk.sh release    -> release APK (needs the upload keystore, see android/app/build.gradle)
#   tools/build-vibo-apk.sh aab        -> signed App Bundle for Google Play Console (dist-apk/VIBO-release.aab)
# Poker's accounts / online tables need a hosted game server: put VITE_RPC_SERVER (and the sign-in ids) in
# .env.production before building (see .env.example).
# Output: dist-apk/VIBO-<type>.apk
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
TOOLS="$HOME/vgame-tools"
TYPE="${1:-debug}"
export PATH="$TOOLS/node-v26.13.0-darwin-arm64/bin:$PATH"
export JAVA_HOME="$TOOLS/jdk/Contents/Home"
export ANDROID_HOME="$TOOLS/sdk"

echo "== type check"
node node_modules/.bin/tsc --noEmit -p tsconfig.app.json
echo "== web build (whole app)"
node node_modules/.bin/vite build --logLevel warn

echo "== Android project"
APP=android
ASSETS="$APP/app/src/main/assets"
rm -rf "$ASSETS/public"
mkdir -p "$ASSETS"
cp -R dist "$ASSETS/public"
echo "sdk.dir=$ANDROID_HOME" > "$APP/local.properties"

echo "== Gradle ($TYPE)"
cd "$APP"
if [ "$TYPE" = aab ]; then
  "$TOOLS/gradle-8.14.3/bin/gradle" bundleRelease --no-daemon -q
  cd "$ROOT"
  mkdir -p dist-apk
  cp "$APP/app/build/outputs/bundle/release/app-release.aab" dist-apk/VIBO-release.aab
  ls -la dist-apk/VIBO-release.aab
  exit 0
fi
TASK=$([ "$TYPE" = release ] && echo assembleRelease || echo assembleDebug)
"$TOOLS/gradle-8.14.3/bin/gradle" "$TASK" --no-daemon -q
cd "$ROOT"
mkdir -p dist-apk
SRC=$(ls "$APP"/app/build/outputs/apk/"$TYPE"/*.apk | head -1)
cp "$SRC" "dist-apk/VIBO-$TYPE.apk"
ls -la "dist-apk/VIBO-$TYPE.apk"
