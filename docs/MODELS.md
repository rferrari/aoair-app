# Models, indexes, and datasets

This file documents every offline asset the app ships with or depends on, per the
bounty's "clearly document the models, datasets, indexes, and other resources used"
requirement.

## Primary generation model — chosen

**[Phi-3.5-mini-instruct](https://huggingface.co/microsoft/Phi-3.5-mini-instruct)**
(Microsoft, **MIT license**), quantized GGUF from
**[bartowski/Phi-3.5-mini-instruct-GGUF](https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF)**,
file `Phi-3.5-mini-instruct-Q4_K_M.gguf` (~2.23GB, sha256 below).

- 3.8B params, dense, Q4_K_M quantization
- Chosen over Qwen2.5-3B-Instruct because Qwen's 3B GGUF ships under the restrictive
  `qwen-research` license (non-commercial/research-only), which is a poor fit for a
  public open-source bounty submission; Phi-3.5-mini's MIT license has no such
  restriction.
- Strong reasoning-per-parameter for its size (outperforms most 1–3B dense models on
  MMLU/GSM8K-style benchmarks per its model card), directly targeting the bounty's
  ">1B dense model" reasoning bar.
- Runs via `llama.cpp`/`llama.rn` on Android CPU, mmap-streamable so weights aren't
  fully pinned in RAM.
- **Upgrade path (not yet implemented)**: a proper MoE model (e.g. an Apache/MIT
  licensed variant in the Qwen1.5-MoE / OLMoE family, ~2–3B active params) for more
  world knowledge at similar active-param RAM/speed cost, once benchmarked on-device
  against this baseline.

## Embedding model — chosen

**[bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5)** (BAAI, **MIT
license**), quantized GGUF from
**[CompendiumLabs/bge-small-en-v1.5-gguf](https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf)**,
file `bge-small-en-v1.5-q8_0.gguf` (~35MB, sha256 below).

- 33M params, well under the 300MB sub-budget, fast enough to stay resident alongside
  the primary LLM without meaningfully affecting the 12GB RAM budget.

## Local knowledge base / retrieval index

- **Lexical**: SQLite FTS5 virtual table (`chunks_fts`), built from the same source
  corpus as the vector index. See `src/rag/db.ts`.
- **Semantic**: brute-force cosine search over stored float32 embeddings
  (`chunk_embeddings` table). Fine at the corpus scale a phone can hold within the
  storage budget; revisit with a proper ANN index (e.g. quantized HNSW) only if
  corpus size makes brute-force too slow on-device.
- **Corpus source**: `assets/corpus/corpus.json` — 58 article summaries fetched
  from **Wikipedia** (CC BY-SA 4.0) covering AI/systems topics relevant to the
  bounty's own eval questions (MoE, quantization, RAG, BM25, mmap, transformers)
  plus general research topics across science, history, geography, biology, and
  economics, so the app isn't just answering questions about itself. Built by
  `scripts/build-corpus.mjs` (dev-machine-only, online, run once to curate/update
  the corpus — not run by the shipped app). ~44KB of text; embeddings are computed
  on-device at first launch via `src/rag/seedCorpus.ts`, not precomputed, so they
  always match whatever embedding model ships.
- **Attribution**: per Wikipedia's CC BY-SA 4.0 license, each stored chunk keeps a
  `source` field linking back to its origin article
  (`https://en.wikipedia.org/wiki/<Title>`), surfaced to the user as a citation.
- **Known limitation**: 58 short summaries is a starter corpus, not a comprehensive
  knowledge base — sufficient to demonstrate the RAG pipeline and answer the eval
  questions in `docs/EVAL_QUERIES.md`, but growing it (more topics, fuller article
  text beyond the lead paragraph) would meaningfully improve real-world usefulness.

## Language scope: English-only for this version

bge-small-en-v1.5 is an English-only embedding model, and the bootstrap corpus is
English-only. This was a deliberate choice, not an oversight: swapping in a
per-locale embedding model would also require a per-locale knowledge base and
separate retrieval-quality testing per language, and the primary LLM
(Phi-3.5-mini-instruct) is itself primarily English-tuned — a multilingual
embedding model wouldn't meaningfully help without a multilingual LLM and corpus
to match. Worth revisiting (e.g. a multilingual embedding model matched to the
device's locale, paired with a multilingual LLM candidate and corpus) as future
work, not in this version.

## Optional LLM catalog (choose your model)

Beyond the required default, the in-app Settings screen offers additional
Apache-2.0-licensed LLM candidates a user can download and switch to:

| Candidate | Params | Quant | Approx. size | Notes |
|---|---|---|---|---|
| Qwen2.5-1.5B-Instruct | 1.5B | Q4_K_M | ~0.92GB | Faster/lighter alternative |
| Qwen2.5-7B-Instruct | 7B | Q4_K_M | ~4.36GB | Stronger reasoning, more RAM/storage, slower tokens/sec |

Both from `bartowski`'s GGUF quantizations, sha256-verified the same way as the
default models (see `src/models/manifest.ts`). Switching models re-loads the
inference engine (`LlamaEngine`/`EmbeddingEngine` now release their previous
context before loading a new one, avoiding a native memory leak on switch).

## Setup tiers and corpus packs

First run offers three tiers (`src/models/manifest.ts` `TIERS`, picked in
`ModelSetupScreen`'s wizard) — all download the same required models, only
the knowledge base differs, and higher tiers are strict supersets:

| Tier | Knowledge base | Extra download |
|---|---|---|
| Minimum | 58 bundled topics (in the JS bundle, no download) | none |
| Standard | + 300 more Wikipedia-derived topics | ~180KB |
| Full | + 1,000 more on top of Standard (1,358 total) | ~800KB total |

Corpus packs (`corpus-standard`, `corpus-full`) are built by
`scripts/build-corpus-tier.mjs`, which uses MediaWiki's batched
`generator=random` API (20 articles/request) rather than one-by-one summary
calls — far fewer HTTP round-trips for a given count. They're committed to
this repo and downloaded via a `raw.githubusercontent.com` URL (no separate
hosting needed) through the same `ModelManager.downloadCatalogModel` path as
everything else, verified by sha256.

**Honest scope note**: "Full" is not literally the entire English Wikipedia —
that's a different scale of engineering (dump processing, compression, a real
ANN index) not attempted here. The architecture is designed so more packs can
be added later within the 50GB storage budget without changing how any of
this works — `MODEL_CATALOG`/`TIERS` are meant to grow.

## Multi-session chat history & conversation memory

Chat sessions/messages persist locally in the same SQLite database as the
knowledge base (`src/rag/db.ts`'s `chat_sessions`/`chat_messages` tables) —
`src/services/chatHistory.ts` is the CRUD layer, surfaced as a "Recent
Chats" list in the drawer with auto-generated titles and per-session
delete.

For long conversations, `src/services/summarize.ts` condenses older turns
into a running summary (prepended to the prompt alongside the last 3
exchanges kept verbatim — see `assemblePrompt`'s `history` param in
`src/rag/pure.ts`), instead of sending the whole transcript every time.

**Concurrency constraint worth being explicit about**: title generation and
summarization are themselves LLM calls through the *same* `llamaEngine`
context as the main chat — `llama.cpp` contexts only run one completion at
a time. These run as fire-and-forget background tasks after a response
finishes (not literally blocking the UI thread), but if the user sends a
new message while one is still in flight, `ChatScreen` calls
`llamaEngine.stop()` and awaits it before starting the next generation
(`cancelBackgroundTask`) — otherwise the new message would silently queue
behind the background task on the same context.

## UI dependency choices

The chat UI's animations (mic pulse/aura rings, processing indicator, drawer
slide) all use React Native's built-in `Animated` API rather than
`react-native-reanimated`, and the side drawer is hand-rolled rather than
`@react-navigation/drawer`. Both would work, but both are heavier native
dependency chains (worklets + Babel plugin; gesture-handler + screens + a
full navigator) for effects `Animated` and a simple slide-panel component
already deliver here — given this app is a single-screen state machine, not
a multi-route navigator, pulling in a routing library felt like solving a
problem this app doesn't have. `expo-linear-gradient` is the one new native
dependency added for the gradient background/glassmorphism look.

## Voice input (offline speech-to-text)

`modules/voice-input` wraps Android's built-in `SpeechRecognizer` with
`EXTRA_PREFER_OFFLINE`, exposed via `src/voice/VoiceInput.ts` and the mic
button in `ChatScreen`. No cloud STT API is called.

**Honest scope note**: this depends on a system-provided recognition service
(Google's, or an OEM's) being installed on the device. Most stock
Android/OEM builds ship one; **GrapheneOS and other de-Googled builds
typically do not**, so voice input won't work there out of the box —
`isAvailable()` detects this and the UI shows a clear "unavailable" message
rather than pretending to listen. A true cross-device guarantee would mean
bundling a `whisper.cpp` model with a custom binding, which is a project on
the scale of the `llama.rn` integration itself — documented as future work,
not attempted in this version. Typing always works everywhere regardless.

## Delivery: one-time first-run download

Both default models are declared with `required: true` in `src/models/manifest.ts`.
The app itself ships small (no multi-GB assets baked in, for fast builds/installs);
on first launch it shows a mandatory setup screen that downloads them — see
`ARCHITECTURE.md` "First-run model setup". Once done, the app works completely
offline from then on, matching "work completely offline once installed."

The same screen, reached later via the chat UI's "Models" button, additionally
lets a user fetch **optional, non-default** models over the network — only when
they explicitly tap "Download" on a specific entry. `ModelManager.downloadCatalogModel`
is the only code path in the shipped app that performs a network request;
`android.permission.INTERNET` is present in the build for that reason, but is
otherwise unused (in particular, never during chat/inference/retrieval).

An alternate build path (`modules/bundled-assets` + `plugins/withBundledModels.js`,
verified working but not used by default) can bake the default models directly
into the APK instead, for a build that needs zero network ever — see
`ARCHITECTURE.md`.

## Verification

Every catalog entry is declared in `src/models/manifest.ts` with a `sha256` and
`sizeBytes`. `ModelManager` verifies bundled installs by exact byte size (cheap,
safe for multi-GB files) and can verify full sha256 on demand (used for the
small embedding model; a multi-GB full-file JS-side sha256 is a known,
documented limitation — see `ARCHITECTURE.md` Status). `scripts/setup-models.sh`
does the authoritative sha256 verification, once, on the dev machine, before
`expo prebuild` bundles the files into the build.
