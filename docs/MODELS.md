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

## Verification

Every shipped asset is declared in `src/models/manifest.ts` with a `sha256` and
`sizeBytes`; `ModelManager` verifies presence and (on demand) checksum before the
app relies on it. `scripts/setup-models.sh` is the only place network access to
fetch these assets happens — it runs once, before offline use, with the device
online; the built app itself never makes network requests.
