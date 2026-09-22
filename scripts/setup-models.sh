#!/usr/bin/env bash
# One-time, online setup step: downloads the model weights declared in
# src/models/manifest.ts into ./assets/models and verifies their sha256.
# The app itself never runs this or makes network calls; this script is a
# developer/user tool run once, before going offline, to prepare assets for
# `expo run:android` (dev) or for pushing to a device with adb (release).
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p assets/models

download_and_verify() {
  local url="$1" out="$2" expected_sha256="$3"

  if [[ -f "$out" ]]; then
    local existing
    existing=$(sha256sum "$out" | awk '{print $1}')
    if [[ "$existing" == "$expected_sha256" ]]; then
      echo "OK  $out (already present, checksum matches)"
      return 0
    fi
    echo "!!  $out exists but checksum mismatch, re-downloading"
  fi

  echo ">>  Downloading $out"
  curl -L --fail -o "$out" "$url"

  local actual
  actual=$(sha256sum "$out" | awk '{print $1}')
  if [[ "$actual" != "$expected_sha256" ]]; then
    echo "FAIL  $out checksum mismatch"
    echo "      expected: $expected_sha256"
    echo "      actual:   $actual"
    exit 1
  fi
  echo "OK  $out (verified)"
}

# Kept in sync with src/models/manifest.ts. See docs/MODELS.md for rationale.
download_and_verify \
  "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf" \
  "assets/models/primary-llm.gguf" \
  "e4165e3a71af97f1b4820da61079826d8752a2088e313af0c7d346796c38eff5"

download_and_verify \
  "https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-q8_0.gguf" \
  "assets/models/embedding.gguf" \
  "ec38e8da142596baa913124ae50550de284b6916bf59577ef2f0cb9660c2f514"

PACKAGE_ID="team.sopa.aoair"

echo
echo "All model assets verified in assets/models/."
echo
echo "Next steps:"
echo "  1. npx expo prebuild -p android && npx expo run:android"
echo "     (installs a debug dev-client build on the connected device)"
echo "  2. Push the verified weights into the app's private storage (debug builds"
echo "     are run-as-able, no root needed):"
echo "       adb push assets/models/primary-llm.gguf /data/local/tmp/primary-llm.gguf"
echo "       adb push assets/models/embedding.gguf /data/local/tmp/embedding.gguf"
echo "       adb shell run-as $PACKAGE_ID mkdir -p files/models"
echo "       adb shell run-as $PACKAGE_ID cp /data/local/tmp/primary-llm.gguf files/models/primary-llm.gguf"
echo "       adb shell run-as $PACKAGE_ID cp /data/local/tmp/embedding.gguf files/models/embedding.gguf"
echo "  3. Relaunch the app — it reads models from its document directory"
echo "     (files/models/), matching src/models/manifest.ts."
