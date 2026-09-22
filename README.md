# aoair — offline AI research assistant (Android)

A fully offline research assistant for Android: local LLM inference (`llama.cpp`
via `llama.rn`) + local hybrid retrieval (SQLite FTS5 + on-device embeddings).
First launch does a one-time model download (the app's only required network
use); after that it works completely offline. Built for the "Best Offline AI
Research App" community bounty.

- ≤ 12GB peak RAM
- ≤ 50GB total on-disk footprint (app + model weights + indexes)
- Works completely offline after a one-time first-run model setup
- Runs on GrapheneOS / no GMS dependency
- Real Android device, not just emulator

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design (including exactly how
first-run model setup works and why network permission is present but unused
during chat/inference) and [docs/MODELS.md](./docs/MODELS.md) for the exact
models/datasets/indexes used.

## Status

🚧 Core app, RAG pipeline, and model selection are done and verified. EAS
Build is configured and the project is linked for cloud builds without a
local Android SDK. Not yet verified with an actual compile + install on real
hardware — see open items below.

## Quickstart

```bash
git clone <this repo>
cd aoair_app
npm install

# Build via EAS (no local Android SDK needed) — see eas.json
npx eas-cli build --platform android --profile preview

# OR build locally if you have the Android SDK set up:
npx expo prebuild -p android
npx expo run:android
```

On first launch, the app shows a one-time setup screen that downloads the
default models (~2.3GB, see `docs/MODELS.md`) — the only time it needs
network access. From then on it works fully offline, airplane mode included.
An in-app "Models" screen lets you optionally download additional/alternate
models later when you do have connectivity — see
`src/ui/ModelSetupScreen.tsx`, the only place in the app that touches the
network.

## Development

```bash
npm install
npx expo prebuild -p android   # generates ./android (gitignored, regenerable)
npx expo run:android           # build + launch on a connected device
```

## Open items

- [ ] Actual build + install verification on real Android hardware — in
      progress via EAS Build (see `eas.json`)
- [ ] Benchmark chosen models on real hardware (tokens/sec, RSS) — `docs/MODELS.md`
- [ ] Grow the offline knowledge base beyond the 58-doc bootstrap corpus in
      `assets/corpus/corpus.json` (see `scripts/build-corpus.mjs`)
- [ ] On-device validation of the 12GB RAM / 50GB storage caps across a few
      real mid-range Android devices, using the `ram-monitor` module's readout
- [ ] Publish to a public GitHub repo
- [ ] Record demo video/screenshots for the bounty proof post

## License

See [LICENSE](./LICENSE).
