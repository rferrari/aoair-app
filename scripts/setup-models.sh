#!/usr/bin/env bash
# One-time, online setup step: downloads model weights + verifies checksums
# into ./assets/models, ready to be pushed to a connected device's app
# document directory (or bundled for a release build). The app itself never
# runs this or makes network calls; this script is a developer/user tool run
# before going offline.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p assets/models

MANIFEST_NOTE="See docs/MODELS.md for the current model selections, sizes, and checksums."

echo "aoair model setup"
echo "$MANIFEST_NOTE"
echo
echo "This script is a placeholder until docs/MODELS.md's model selection is"
echo "finalized (pending on-device benchmarking). Once finalized, this script"
echo "will:"
echo "  1. curl each GGUF asset from its documented source URL into assets/models/"
echo "  2. verify sha256 against src/models/manifest.ts"
echo "  3. print the adb command to push verified assets into the app's"
echo "     document directory on a connected device:"
echo "       adb push assets/models/<file> /sdcard/Android/data/<package>/files/models/"
exit 1
