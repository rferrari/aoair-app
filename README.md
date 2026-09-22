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

🚧 Core app, RAG pipeline, and model selection are done and verified (see
`docs/MODELS.md`). Not yet verified on real Android/GrapheneOS hardware — see
open items below.

## Quickstart

```bash
git clone <this repo>
cd aoair_app
npm install

# One-time, online: fetch + verify model weights (~2.3GB total; see docs/MODELS.md)
./scripts/setup-models.sh

# Generate native Android project (custom dev client, not Expo Go) and install
npx expo prebuild -p android
npx expo run:android

# Push the verified model weights into the installed app's private storage
# (exact adb commands are printed at the end of setup-models.sh)
```

The app loads models from its document directory and never contacts the
network at runtime — `app.json` explicitly blocks the `INTERNET` permission,
so this is enforced at the OS level, not just by convention. All inference
and retrieval happen on-device via `llama.cpp` (through `llama.rn`) and
SQLite FTS5.

## Development

```bash
npm install
npx expo prebuild -p android   # generates ./android (gitignored, regenerable)
npx expo run:android           # build + launch on a connected device
```

## Open items

- [ ] Verify the app actually builds and runs via `expo prebuild`/`expo run:android`
      (untested — no Android toolchain in the environment this was scaffolded in)
- [ ] Benchmark chosen models on real hardware (tokens/sec, RSS) — `docs/MODELS.md`
- [ ] Grow the offline knowledge base beyond the small bootstrap corpus in
      `src/rag/seedCorpus.ts`
- [ ] On-device validation of the 12GB RAM / 50GB storage caps across a few
      real mid-range Android devices, using the `ram-monitor` module's readout
- [ ] Publish to a public GitHub repo
- [ ] Record demo video/screenshots for the bounty proof post

## License

See [LICENSE](./LICENSE).
