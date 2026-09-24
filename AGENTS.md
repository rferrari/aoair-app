# AGENTS.md — compiling & installing BOAR from source

This file is for an AI coding agent (or anyone scripting a build) that needs
to go from a clean checkout to a running app on a real Android device — the
exact commands, and the non-obvious constraints that make the naive path
fail. For what the app *is* and how it's designed, read `README.md` and
`ARCHITECTURE.md` first; this file only covers build/install mechanics.

## The one fact that changes everything: this is NOT an Expo Go app

`app.json`'s `plugins` includes `expo-dev-client`, and this repo has three
**custom native modules** (`modules/bundled-assets`, `modules/ram-monitor`,
`modules/voice-input`) plus `llama.rn` (native LLM inference). None of that
runs inside the generic Expo Go app from the Play Store. Every build must go
through `expo prebuild` to generate a real native Android project, then a
real native build (`expo run:android` or an EAS cloud build) — there is no
`expo start` + "scan QR code with Expo Go" path for this app. If you're
tempted to just run `npx expo start` and expect it to work standalone: it
won't — it only starts the Metro bundler, which a dev-client build (built
via one of the two paths below) then connects to.

## Prerequisites

- Node.js (any recent LTS; developed against Node 24) and npm.
- One of:
  - **A local Android SDK + NDK + JDK** (Android Studio installs all three) —
    needed for `expo run:android` (builds and installs directly on a
    connected device/emulator over USB).
  - **No local Android SDK at all** — use the EAS cloud build path instead
    (`eas.json` is already configured; needs an Expo account,
    `npx eas-cli login`, no local toolchain).
- A physical Android device with USB debugging enabled and `adb` able to see
  it (`adb devices` lists it), if installing locally rather than via EAS. The
  bounty/project this app targets explicitly requires a real device, not
  just an emulator, for final verification — but an emulator works fine for
  iterating during development.

## Compile from source and install (local Android SDK path)

```bash
git clone <repo-url>
cd aoair_app
npm install
npx expo prebuild -p android --clean   # generates ./android from app.json + plugins — gitignored, regenerate any time
npx expo run:android --device          # builds the native app AND installs it on the connected device
```

Or via the `Makefile` (`make help` lists everything):

```bash
make setup          # npm install (+ tells you whether you have the Android SDK)
make run-android    # prebuild + run:android
```

**`--clean` on prebuild is not optional after touching `app.json` or its
plugins** (icon, name, any native config). Without it, `expo prebuild` can
leave a stale `android/` project with old values baked in, and a plain
`npm install` will never fix that — it never touches `android/` at all.
When in doubt, `--clean`.

## No local Android SDK: build via EAS instead

```bash
npm install
npx eas-cli login                                      # one-time, needs an Expo account
npx eas-cli build --platform android --profile preview # builds an installable .apk in the cloud
```

or `make build-eas`. This produces a downloadable `.apk` (see `eas.json`'s
`preview` profile) — download it and `adb install <file>.apk`, or transfer it
to the device directly.

## After install: the app is not immediately usable — one more step

First launch shows a **mandatory, one-time setup screen** that downloads the
default models (Phi-3.5-mini + Qwen2.5-1.5B + an embedding model, ~3.2GB
total) — this is the app's only required network access, and the app is
gated behind it (`ModelManager.requiredModelsPresent()` in
`src/models/ModelManager.ts` decides whether the chat screen or the setup
wizard shows). If you're scripting an unattended install-and-verify flow,
this download has to complete (or you pre-seed the files — see next
section) before the app is otherwise usable. After that first setup, the
app works fully offline.

### Skipping the in-app download (pre-seeding models)

If you already have the GGUF weight files on the machine running the build,
you can bake them into the APK itself instead of downloading them at
first-run — see `docs/MODELS.md`'s "Pre-seeding models you already have
locally" section for the exact filenames/checksums and the
`scripts/setup-models.sh` + `assets/models/` + `withBundledModels.js` flow.
This is a genuinely different build path (bundles ~3.2GB into the APK, no
runtime network needed at all), not the default — only use it if avoiding
the in-app download matters for your scenario.

## Verifying the build without a device (what an agent without device access can actually check)

```bash
npm run typecheck   # tsc --noEmit — must be clean
npm test            # vitest run — currently 131 tests, native-module-dependent
                     # code (expo-sqlite/llama.rn/expo-file-system) is deliberately
                     # untested here; see src/rag/pure.ts and its siblings for
                     # what IS unit-tested and why
```

Neither of these proves the native build/install actually works — they only
prove the JS/TS layer is internally consistent. There is no way to verify a
real device install without a real device; don't claim success from
typecheck/tests alone if the task was specifically about building/installing.

## Common pitfalls

- **Blank/white screen, or "Failed to connect to `<LAN IP>`" after starting
  Metro**: almost always Wi-Fi client/AP isolation (common on phone hotspots
  and many routers) blocking the phone and dev machine from reaching each
  other, even on the same network. USB debugging isn't affected. Fix: force
  Metro onto the USB `adb reverse` tunnel instead of Wi-Fi —
  `npx expo start --localhost` (or `make start`, which already does this).
- **`ClassNotFoundException: expo.modules.splashscreen.SplashScreenManager`
  in logs**: a red herring — a caught, harmless, expected exception from a
  soft-dependency check inside `expo-dev-launcher`, not a real build
  problem. Don't spend time chasing it.
- **A stale `android/` directory causing weird build errors after editing
  `app.json`**: see the `--clean` note above.
- **Don't run destructive git/native-reset commands to "fix" a build
  problem** (`rm -rf android`, force-pushes, etc.) without checking
  `git status` first and understanding why the build actually failed —
  most build failures here are the two points above, not something that
  needs nuking the repo state.
