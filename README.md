# aoair — offline AI research assistant (Android)

A fully offline research assistant for Android: local LLM inference (`llama.cpp`
via `llama.rn`) + local hybrid retrieval (SQLite FTS5 + on-device embeddings).
The default model ships **inside the app build itself**, so a fresh install
works immediately with the device fully offline — no download step required.
Built for the "Best Offline AI Research App" community bounty.

- ≤ 12GB peak RAM
- ≤ 50GB total on-disk footprint (app + model weights + indexes)
- Works fully offline immediately after install (bundled default model)
- Runs on GrapheneOS / no GMS dependency
- Real Android device, not just emulator

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design (including exactly how
model bundling works and why network permission is present but unused during
chat/inference) and [docs/MODELS.md](./docs/MODELS.md) for the exact
models/datasets/indexes used.

## Status

🚧 Core app, RAG pipeline, model bundling, and model selection are done and
verified — including an actual `expo prebuild -p android` run confirming both
models land byte-identical inside the generated Android project (see
`ARCHITECTURE.md` Status section for exactly what's verified vs. not). Not yet
verified with a full Gradle/NDK compile + install on a real device — see open
items below.

## Quickstart

```bash
git clone <this repo>
cd aoair_app
npm install

# One-time, online: fetch + verify the bundled model weights (~2.3GB total;
# see docs/MODELS.md). This is the only network access needed before build —
# from here on the app works fully offline.
./scripts/setup-models.sh

# Bundles the verified models into the APK, then builds + installs on a
# connected device (custom dev client, not Expo Go).
npx expo prebuild -p android
npx expo run:android
```

That's it — no adb push, no in-app download step for the default model. Open
the app with the device in airplane mode and it works: both models are
installed from the APK's own bundled assets on first launch (a local file
copy, not a network fetch). An in-app "Models" screen lets you optionally
download additional/alternate models later when you do have connectivity —
see `src/ui/ModelSetupScreen.tsx`, the only place in the app that touches the
network.

## Development

```bash
npm install
npx expo prebuild -p android   # generates ./android (gitignored, regenerable)
npx expo run:android           # build + launch on a connected device
```

## Open items

- [ ] Full `expo run:android` (Gradle/NDK compile + install) on a real device —
      untested; this environment has no Android SDK/NDK/emulator. Config-plugin
      output (bundled models, gradle changes, autolinking) is verified, but the
      actual native compile is not.
- [ ] Benchmark chosen models on real hardware (tokens/sec, RSS) — `docs/MODELS.md`
- [ ] Grow the offline knowledge base beyond the 58-doc bootstrap corpus in
      `assets/corpus/corpus.json` (see `scripts/build-corpus.mjs`)
- [ ] On-device validation of the 12GB RAM / 50GB storage caps across a few
      real mid-range Android devices, using the `ram-monitor` module's readout
- [ ] Publish to a public GitHub repo
- [ ] Record demo video/screenshots for the bounty proof post

## License

See [LICENSE](./LICENSE).
