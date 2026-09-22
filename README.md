# aoair — offline AI research assistant (Android)

A fully offline research assistant for Android: local LLM inference (`llama.cpp`
via `llama.rn`) + local hybrid retrieval (SQLite FTS5 + on-device embeddings),
no network calls, no Google Play Services required. Built for the "Best Offline
AI Research App" community bounty.

- ≤ 12GB peak RAM
- ≤ 50GB total on-disk footprint (app + model weights + indexes)
- Zero network access after install (no `INTERNET` permission — see `app.json`)
- Runs on GrapheneOS / no GMS dependency
- Real Android device, not just emulator

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design and [docs/MODELS.md](./docs/MODELS.md)
for the exact models/datasets/indexes used.

## Status

🚧 Early scaffolding. Model selection, on-device benchmarks, and the setup wizard
are still in progress — see open items below.

## Quickstart (once models are finalized)

```bash
git clone <this repo>
cd aoair_app
npm install

# One-time, online: fetch + verify model weights (see docs/MODELS.md)
./scripts/setup-models.sh

# Generate native Android project (custom dev client, not Expo Go)
npx expo prebuild -p android

# Build + install on a connected device/emulator
npx expo run:android
```

The app loads models from its document directory and never contacts the
network at runtime. All inference and retrieval happen on-device.

## Development

```bash
npm install
npx expo prebuild -p android   # generates ./android (gitignored, regenerable)
npx expo run:android           # build + launch on a connected device
```

## Open items

- [ ] Finalize + benchmark primary LLM and embedding model choices on real hardware
      (tokens/sec, RSS) — `docs/MODELS.md`
- [ ] Build offline knowledge base (source corpus → chunk → embed → SQLite) and
      ship/document its acquisition
- [ ] Implement `scripts/setup-models.sh` fetch + checksum steps
- [ ] Replace JS-heap RAM readout with a native module reporting true process RSS
- [ ] On-device validation of the 12GB RAM / 50GB storage caps across a few
      real mid-range Android devices
- [ ] Record demo video/screenshots for the bounty proof post

## License

See [LICENSE](./LICENSE).
