# Models, indexes, and datasets

This file documents every offline asset the app ships with or depends on, per the
bounty's "clearly document the models, datasets, indexes, and other resources used"
requirement. **Not yet finalized** — placeholders below will be replaced with the
exact GGUF files, sha256 checksums, and source URLs once on-device benchmarking
(tokens/sec, RAM footprint via `adb shell dumpsys meminfo`) selects the final picks.

## Primary generation model (candidates)

Selection criteria: quantized GGUF, runs via `llama.cpp`/`llama.rn` on Android CPU,
mmap-streamable, working-set RAM (weights touched + KV cache) comfortably under 12GB
alongside the embedding model and app overhead, and meaningfully stronger than a 1B
dense model on reasoning/synthesis tasks.

| Candidate | Total params | Active params | Quant | Approx. disk size | Notes |
|---|---|---|---|---|---|
| Qwen2.5-3B-Instruct | 3B | 3B (dense) | Q4_K_M | ~2.0GB | Safe baseline, fast bring-up |
| Qwen1.5-MoE-A2.7B-Chat | 14.3B | 2.7B | Q4_K_M | ~9GB | MoE direction Vitalik suggested; more knowledge at similar active-param RAM/speed cost |
| Phi-3.5-mini-instruct | 3.8B | 3.8B (dense) | Q4_K_M | ~2.3GB | Strong reasoning-per-param, dense fallback |

Default until benchmarked: **Qwen2.5-3B-Instruct Q4_K_M**, with a documented upgrade
path to the MoE candidate once on-device tokens/sec and RSS are measured.

## Embedding model (candidates)

Sub-300MB, GGUF, usable via `llama.rn`'s embedding mode.

| Candidate | Params | Quant | Approx. size |
|---|---|---|---|
| all-MiniLM-L6-v2 (GGUF) | 22M | F16/Q8 | ~45–90MB |
| bge-small-en-v1.5 (GGUF) | 33M | Q8 | ~35MB |

## Local knowledge base / retrieval index

- **Lexical**: SQLite FTS5 virtual table (`chunks_fts`), built from the same source
  corpus as the vector index. See `src/rag/db.ts`.
- **Semantic**: brute-force cosine search over stored float32 embeddings
  (`chunk_embeddings` table). Fine at the corpus scale a phone can hold within the
  storage budget; revisit with a proper ANN index (e.g. quantized HNSW) only if
  corpus size makes brute-force too slow on-device.
- **Corpus source**: TBD — candidates are a curated Wikipedia/Wikidata subset or a
  domain-specific offline reference set, compressed and chunked ahead of time on a
  dev machine, then shipped as a pre-built SQLite DB (not built on-device).

## Verification

Every shipped asset is declared in `src/models/manifest.ts` with a `sha256` and
`sizeBytes`; `ModelManager` verifies presence and (on demand) checksum before the
app relies on it. `scripts/setup-models.sh` is the only place network access to
fetch these assets happens — it runs once, before offline use, with the device
online; the built app itself never makes network requests.
