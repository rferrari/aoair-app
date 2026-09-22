# aoair — Always-Offline AI Research (Android)

Offline research assistant for Android. Built for the "Best Offline AI Research App" bounty
(inspired by @VitalikButerin's post). Hard constraints this design targets:

- ≤ 12GB peak RAM during inference
- ≤ 50GB total on-disk (app + weights + indexes)
- Zero network calls once installed (verified via NetworkSecurityConfig + no INTERNET permission)
- No Google Play Services dependency (runs on GrapheneOS)
- Real Android device, not just emulator

## Stack

- **App shell**: Expo (React Native) + `expo-dev-client` (custom dev build, not Expo Go —
  we need native modules Expo Go can't load).
- **Inference engine**: [`llama.rn`](https://github.com/mybigday/llama.rn) — React Native
  bindings to llama.cpp, supports GGUF, mmap weight streaming, Android NDK build, no GMS.
- **Primary model**: quantized GGUF, swappable. Default target: a small MoE or dense
  instruct model in the 3B–8B active-param range (Q4_K_M), so that mmap + KV cache stays
  well under the 12GB RAM ceiling on a mid-range phone. MoE candidates (more total params,
  same active-param RAM cost) documented in `docs/MODELS.md` once benchmarked on-device.
- **Retrieval**: `expo-sqlite` with FTS5 for lexical search over a local offline knowledge
  base, plus a quantized sentence-embedding model (<300MB, e.g. a GGUF/ONNX MiniLM variant)
  for a local vector index (brute-force cosine or a small local ANN) — hybrid BM25 + vector
  RAG, no network.
- **Storage**: model weights + FTS5 DB + vector index all live in
  `FileSystem.documentDirectory`, verified via checksum against a manifest.

## Directory layout (target)

```
aoair_app/
  app/                    # Expo Router screens
  src/
    inference/            # llama.rn wrapper, streaming token bridge
    rag/                  # FTS5 setup, embedding, retrieval + prompt assembly
    models/                # model manifest, checksum verify, download/setup wizard
    ui/                    # chat UI, system monitor bar
  android/                 # native project (after `expo prebuild`), JNI/C++ config
  assets/models/            # (gitignored) local GGUF + index files, or download scripts
  docs/
    MODELS.md              # documented model/dataset/index choices + benchmarks
  scripts/
    setup-models.sh         # fetches + verifies model weights (checksum) into assets/models
```

## Non-negotiables enforced in code

1. `android/app/src/main/AndroidManifest.xml` must NOT declare `android.permission.INTERNET`.
2. No Firebase / GMS / Play Services libraries in `android/app/build.gradle`.
3. All inference and retrieval run through native/on-device code paths only — no `fetch`
   to any external host anywhere in `src/`.
4. A visible system-monitor bar (RAM + storage) so the RAM/storage caps are auditable live
   on-device, not just claimed.

## Status

- [x] Expo TS scaffold, `expo-dev-client`, `expo-sqlite`, `expo-file-system`, `llama.rn` installed
- [x] `app.json` blocks INTERNET/network permissions, sets Android package id
- [x] ModelManager (checksum/presence verification), manifest schema
- [x] FTS5 schema + hybrid (lexical+semantic) retrieval + prompt assembly
- [x] LlamaEngine (generation) and EmbeddingEngine wrappers over `llama.rn`
- [x] Chat UI with streaming tokens, citations, live storage monitor
- [x] Primary + embedding models chosen (MIT-licensed), downloaded, checksum-verified,
      GGUF headers validated
- [x] Bootstrap knowledge base seeded on first run, embeddings computed on-device
- [x] Unit tests (vitest) for pure retrieval/manifest logic + CI workflow
- [ ] `expo prebuild` + real Android build/run on a device (pending — no Android
      toolchain in the dev sandbox; user has local Android environment)
- [ ] Benchmark chosen models on real hardware (tokens/sec, RSS)
- [ ] Grow the knowledge base beyond the small bootstrap corpus
- [ ] Native RSS-based RAM monitor (JS heap is currently a placeholder, not true process RAM)
- [ ] Publish to a public GitHub repo (not yet pushed anywhere — local git only)
