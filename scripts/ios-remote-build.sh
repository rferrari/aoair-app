#!/usr/bin/env bash
# Builds the iOS Simulator app on a remote Mac (default: r4toMacMini) and
# copies BOAR.app back. Use it when the local Xcode is older than the one
# Expo SDK 57 needs (see docs/IOS.md, "Toolchain requirement").
#
#   scripts/ios-remote-build.sh              # build, fetch .app
#   scripts/ios-remote-build.sh --run        # ...then boot a simulator ON THE REMOTE, seed the
#                                            #    required models from its ~/boar/shared-models,
#                                            #    install + launch (inference runs on the remote)
#   scripts/ios-remote-build.sh --install    # ...or install + launch on the booted LOCAL simulator
#
# Env overrides:
#   IOS_BUILD_HOST   ssh host                     (r4toMacMini)
#   IOS_REMOTE_DIR   remote checkout dir          (~/boar-ios-build)
#   IOS_XCODE_APP    Xcode on the remote          (newest /Applications/Xcode*.app)
#   IOS_OUT_DIR      local output dir             (/Users/r4to/Script/boar/builds/ios)
#   IOS_CONFIG       Release | Debug              (Release: JS bundled, no Metro)
#   IOS_KEEP_REMOTE  1 = keep remote DerivedData  (default: deleted after the build)
#   IOS_SIM_DEVICE   remote simulator for --run   (first available iPhone 17 Pro, else any iPhone)
#   IOS_REMOTE_MODELS remote models dir for --run (~/boar/shared-models)
set -euo pipefail

HOST="${IOS_BUILD_HOST:-r4toMacMini}"
REMOTE_DIR="${IOS_REMOTE_DIR:-boar-ios-build}"
OUT_DIR="${IOS_OUT_DIR:-/Users/r4to/Script/boar/builds/ios}"
CONFIG="${IOS_CONFIG:-Release}"
XCODE_APP="${IOS_XCODE_APP:-}"
KEEP_REMOTE="${IOS_KEEP_REMOTE:-0}"
SIM_DEVICE="${IOS_SIM_DEVICE:-}"
REMOTE_MODELS="${IOS_REMOTE_MODELS:-~/boar/shared-models}"
MODE="${1:-}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ID="$(node -p "require('$ROOT/app.json').expo.ios.bundleIdentifier")"
log() { printf '[ios-remote-build %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

log "sync $ROOT -> $HOST:$REMOTE_DIR"
rsync -a --delete \
  --exclude node_modules --exclude /ios --exclude /android --exclude .git \
  --exclude .maestri --exclude '*.gguf' --exclude /assets/models \
  "$ROOT/" "$HOST:$REMOTE_DIR/"

cleanup_remote() {
  [[ "$KEEP_REMOTE" == "1" ]] && return
  log "delete remote intermediates"
  ssh "$HOST" "bash -lc 'rm -rf $REMOTE_DIR/ios/build/Build/Intermediates.noindex $REMOTE_DIR/ios/build/Index.noindex'" || true
}
trap cleanup_remote EXIT

# The remote login shell is fish; everything runs under bash -lc.
log "remote build ($CONFIG)"
ssh "$HOST" "bash -lc 'set -euo pipefail
  cd $REMOTE_DIR
  XCODE=\"$XCODE_APP\"
  if [[ -z \"\$XCODE\" ]]; then XCODE=\$(ls -d /Applications/Xcode*.app | sort -V | tail -1); fi
  export DEVELOPER_DIR=\"\$XCODE/Contents/Developer\"
  echo \"using \$(xcodebuild -version | head -1) at \$XCODE\"
  npm ci --no-audit --no-fund
  npx expo prebuild -p ios --no-install --clean
  (cd ios && pod install)
  xcodebuild -workspace ios/BOAR.xcworkspace -scheme BOAR -configuration $CONFIG \
    -sdk iphonesimulator -destination \"generic/platform=iOS Simulator\" \
    -derivedDataPath ios/build ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
    > build.log 2>&1 || { grep -E \"error:|BUILD FAILED\" build.log | head -40; exit 65; }
  grep -E \"BUILD SUCCEEDED\" build.log'"

APP_REMOTE="$REMOTE_DIR/ios/build/Build/Products/$CONFIG-iphonesimulator/BOAR.app"
mkdir -p "$OUT_DIR"
log "fetch BOAR.app -> $OUT_DIR"
rsync -a --delete "$HOST:$APP_REMOTE/" "$OUT_DIR/BOAR.app/"
du -sh "$OUT_DIR/BOAR.app"

if [[ "$MODE" == "--install" ]]; then
  log "install + launch $BUNDLE_ID on the booted local simulator"
  xcrun simctl install booted "$OUT_DIR/BOAR.app"
  xcrun simctl launch booted "$BUNDLE_ID"
elif [[ "$MODE" == "--run" ]]; then
  log "boot simulator, install, seed models, launch on $HOST"
  ssh "$HOST" "bash -lc 'set -euo pipefail
    cd $REMOTE_DIR
    DEV=\"$SIM_DEVICE\"
    if [[ -z \"\$DEV\" ]]; then
      DEV=\$(xcrun simctl list devices available | grep -E \"iPhone 17 Pro \\(\" | head -1 | grep -oE \"[0-9A-F-]{36}\" || true)
      [[ -n \"\$DEV\" ]] || DEV=\$(xcrun simctl list devices available | grep iPhone | head -1 | grep -oE \"[0-9A-F-]{36}\")
    fi
    xcrun simctl boot \"\$DEV\" 2>/dev/null || true
    xcrun simctl bootstatus \"\$DEV\" -b >/dev/null
    xcrun simctl install \"\$DEV\" $APP_REMOTE
    xcrun simctl launch \"\$DEV\" $BUNDLE_ID >/dev/null
    IOS_SIM_UDID=\"\$DEV\" scripts/ios-sim-seed-models.sh $REMOTE_MODELS
    xcrun simctl terminate \"\$DEV\" $BUNDLE_ID || true
    xcrun simctl launch \"\$DEV\" $BUNDLE_ID
    echo \"simulator UDID: \$DEV\"'"
fi
log done
