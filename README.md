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
- Import your own documents (.txt/.md/.csv/.json) into the local knowledge
  base, toggle or delete them per-collection, and export/share a collection
  as a portable JSON pack — see [Custom knowledge base](#custom-knowledge-base) below

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

## Custom knowledge base

Settings > Knowledge Base has an "Import" card alongside the built-in
downloadable corpus packs. It lets you index your own notes into the same
local FTS5 + vector search used everywhere else in the app:

- **Supported formats:** `.txt`, `.md`, `.csv` (naive comma-split, no quoted-field
  escaping), `.json` (either the app's own `{title, source, body}[]` corpus-pack
  shape, or any other JSON — imported as raw text otherwise). **PDF is not
  supported** — there's no pure-JS PDF text extractor reliable enough for
  real-world (compressed-stream) PDFs to run in Hermes, and a native PDF
  library would reintroduce the native-dependency/rebuild risk this project
  has otherwise avoided. Convert a PDF to text/markdown first.
- Each import is chunked (~500 tokens, 50-token overlap, heuristic
  char-based split) and embedded on-device with the same embedding model used
  for the rest of the knowledge base, then saved as a named, toggleable
  collection — turn one off without deleting it, or delete it outright.
- **Export** re-serializes a collection as `{title, source, body}[]` JSON (the
  same shape as the bundled corpus packs) and hands it to the Android share
  sheet — send it over Bluetooth, Nearby Share, a file manager, whatever the
  recipient's device offers. This is deliberately *not* a raw `.sqlite`
  export: that would bake in this device's specific embedding vectors, which
  are meaningless (or the wrong dimension) on a phone running a different
  embedding model. A recipient re-embeds the JSON locally by importing it the
  same way.
- Everything happens on-device; nothing is uploaded anywhere.

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
