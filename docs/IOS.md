# BOAR on iOS

TL;DR: the same Expo app builds for iOS. The four local native modules have Swift implementations, llama.rn ships a prebuilt Metal-enabled xcframework, and a simulator build needs Xcode only, no Apple account. Installing on a real iPhone needs an Apple ID (free: 7-day signing, paid: TestFlight/App Store).

Status (2026-09-26): `expo prebuild -p ios` and `pod install` pass and all five local modules autolink. The Xcode build has not completed on this machine (see Toolchain requirement), so the Swift modules are not compile-verified yet and nothing has run in the simulator. `UNKNOWN` until a build with a newer Xcode or EAS.

```bash
# Simulator, Release (JS bundled, no Metro needed)
npm ci
npx expo prebuild -p ios --no-install
(cd ios && pod install)
xcodebuild -workspace ios/BOAR.xcworkspace -scheme BOAR -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build ARCHS=arm64
xcrun simctl boot "iPhone 17 Pro" 2>/dev/null; open -a Simulator
xcrun simctl install booted ios/build/Build/Products/Release-iphonesimulator/BOAR.app
xcrun simctl launch booted team.sopa.aoair

# Build on a remote Mac with the newer Xcode (default host r4toMacMini), fetch the
# .app to /Users/r4to/Script/boar/builds/ios, then boot a simulator ON THAT MAC, seed
# the required models from its ~/boar/shared-models (APFS clone) and launch.
# Inference runs on the remote, not on the machine running the script.
scripts/ios-remote-build.sh --run
# Or install on the local booted simulator and seed from a local models dir
scripts/ios-remote-build.sh --install && scripts/ios-sim-seed-models.sh

# Simulator, Debug with Metro
npx expo run:ios

# EAS (cloud) — simulator build needs no Apple credentials
eas build -p ios --profile preview-simulator
eas build -p ios --profile preview          # device, ad hoc: needs Apple Developer account
```

Minimum iOS: 16.4 (Expo SDK default).

### Toolchain requirement

With Xcode 26.1 (Swift 6.2.1) `expo prebuild` and `pod install` succeed, but the Release build fails inside Expo's own `expo-modules-jsi` 57.1.0:

```
JavaScriptActor.swift:98:20: error: 'weak' must be a mutable variable, because it may change at runtime
RuntimeScheduler.h:53:26: error: 'RuntimeScheduler' cannot be annotated with either SWIFT_RETURNS_RETAINED or SWIFT_RETURNS_UNRETAINED ...
```

`weak let` needs a newer Swift than 6.2.1; the package changelog targets Xcode 27. Exact minimum Xcode: `UNKNOWN`. Use that Xcode locally, or EAS Build (its image ships the Xcode the SDK expects). None of this repo's code is involved.

## Native modules

| Module | Android | iOS |
|---|---|---|
| `ram-monitor` | VmRSS, PSS, `ActivityManager` total/avail | `task_vm_info.resident_size` (rss), `phys_footprint` (reported as `totalPssBytes`: it is what jetsam counts), `ProcessInfo.physicalMemory`, `os_proc_available_memory()` (as `getAvailableRamBytes`, JS side in feat/engine-routing) |
| `download-wake-lock` | `PARTIAL_WAKE_LOCK` | `isIdleTimerDisabled` + `beginBackgroundTask`. The transfer itself runs on expo-file-system's background `URLSession` (legacy `createDownloadResumable` defaults to `sessionType: BACKGROUND`) |
| `voice-input` | `SpeechRecognizer` + `EXTRA_PREFER_OFFLINE` | `SFSpeechRecognizer` with `requiresOnDeviceRecognition = true`. `isAvailable()` is false when the locale has no on-device model, so audio is never sent to Apple |
| `bundled-assets` | copy from APK `assets/` | copy from the app bundle's `<subdir>/` folder (no build plugin adds it yet), plus `excludeFromBackup(path)` |
| `file-hash` (Ledger) | streaming SHA-256 | CryptoKit `SHA256` over `FileHandle` 1 MiB reads, security-scoped URL access |

New JS API: `excludeFromBackup()` in `bundled-assets`.

## Dependencies checked

| Dependency | iOS status |
|---|---|
| `llama.rn` 0.13 | Prebuilt `rnllama.xcframework`, Metal + Accelerate. Expo plugin added with `enableEntitlements: false` (entitlements set in app.json instead) and `enableOpenCLAndHexagon: false` (Android-only, left to its owner). `n_gpu_layers` is 0 in `LlamaEngine.ts`; Metal offload is the obvious next lever on iOS |
| `expo-pdf-text-extract` | Has an iOS module (PDFKit). No local module needed |
| `expo-sqlite` | Vendored SQLite compiled with `SQLITE_ENABLE_FTS5=1` by default (unless `expo.sqlite.enableFTS=false` in Podfile.properties) |
| `expo-file-system` | Large files OK. Models live in `Documents/`; exclude them from iCloud backup with `excludeFromBackup()` |

## app.json (ios)

- `bundleIdentifier`: `team.sopa.aoair` (same as the Android package).
- `icon`: `assets/icon-ios.png`, the Android icon flattened on the adaptive background color (iOS icons must be opaque). Splash comes from the shared `expo-splash-screen` config.
- Info.plist: mic + speech usage strings (voice input), `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` (copy GGUF files into the app via Finder over USB or the Files app, the iOS analog of `adb push`), `ITSAppUsesNonExemptEncryption: false`.
- Entitlements: `com.apple.developer.kernel.increased-memory-limit` and `com.apple.developer.kernel.extended-virtual-addressing` (needed to mmap multi-GB GGUFs).
- Offline variant: same env as Android, `EXPO_PUBLIC_BOAR_VARIANT=offline` (read by JS and `app.config.ts`). iOS has no `INTERNET` permission, so the proof is the code path: in the offline variant the downloader throws before any fetch.

## Apple account requirements

| Goal | Needs |
|---|---|
| Simulator build and run | Xcode only, no account |
| Own iPhone, local build | Free Apple ID in Xcode (profile expires every 7 days). `UNKNOWN`: whether the two kernel entitlements are granted to free-team profiles; if not, remove them for that build |
| TestFlight / ad hoc / App Store | Apple Developer Program ($99/yr), App ID with "Increased Memory Limit" and "Extended Virtual Addressing" capabilities enabled, then `eas build -p ios --profile preview` or `production` |

`UNKNOWN`: which Apple team (if any) the project owner has. Nothing in this repo is signed for a device yet.

## Parity: Android features without an iOS equivalent

| Android feature | iOS status |
|---|---|
| APK sideload in minutes (bounty requirement is Android) | No sideload without an Apple ID; reproducing on a device needs Xcode or TestFlight |
| Models baked into the APK (`plugins/withBundledModels.js`) | Native side ready (`bundled-assets` reads the app bundle), no config plugin copies `assets/models/` into the Xcode project |
| Download continues with the screen off (wake lock) | Transfer continues on the background URLSession while suspended, but JS progress pauses until foreground, and the session identifier is random per launch, so a download interrupted by the app being killed restarts from the paused resume data or from zero (`UNKNOWN` which, not tested) |
| Build without `INTERNET` permission, verifiable in the manifest | No per-app network permission on iOS; only the offline variant's code path |
| OpenCL/Hexagon GPU/NPU plugins | Metal instead (in the xcframework), not enabled (`n_gpu_layers: 0`) |
| Release signing plugin (`withReleaseSigning`) | EAS credentials or Xcode signing |
| RAM fit check (`LlamaEngine.estimateFit`) uses device RAM − RSS | Wrong on iOS: the jetsam limit is far below device RAM. Should use `getAvailableRamBytes()` |
| Voice via system recognizer (may go online on Android) | On-device only; locales without an on-device model report unavailable |
| GrapheneOS | Not applicable |
