import { getDb, insertChunk, ChunkRecord } from "./db";
import { embeddingEngine } from "./embed";

/**
 * Small bootstrap knowledge base so the app has something to retrieve
 * against out of the box. This is a placeholder corpus, not the final
 * shipped knowledge base — see docs/MODELS.md "Local knowledge base" for
 * the plan to replace this with a larger curated offline corpus.
 *
 * Embeddings are computed on-device at first run (not precomputed at build
 * time) so the vector index always matches whatever embedding model
 * actually ships, with no separate offline embedding pipeline to keep in
 * sync.
 */
const SEED_DOCS: Array<{ title: string; source: string; body: string }> = [
  {
    title: "Mixture-of-Experts models and phone RAM",
    source: "aoair seed corpus",
    body:
      "A Mixture-of-Experts (MoE) model has many 'expert' sub-networks but only " +
      "routes each token through a small subset of them (the active parameters). " +
      "Total parameter count determines disk footprint (all experts must be " +
      "stored), but RAM usage during inference tracks the active parameters " +
      "actually touched per token, plus the KV cache for the current context. " +
      "This is why an MoE model with, say, 100B total but 8B active parameters " +
      "can run in far less RAM than a dense 100B model, provided weights are " +
      "streamed from disk (mmap) rather than fully resident.",
  },
  {
    title: "mmap-based weight streaming vs. full RAM loading",
    source: "aoair seed corpus",
    body:
      "Memory-mapping (mmap) a GGUF model file lets the OS page in only the " +
      "weight blocks actually touched during inference, backed by the file on " +
      "disk rather than requiring the whole file to be read into RAM upfront. " +
      "This trades some latency (first-touch page faults, and repeated faults " +
      "if the OS evicts pages under memory pressure) for a dramatically lower " +
      "resident memory floor. Fully loading weights into RAM (or locking them " +
      "with mlock) avoids page-fault latency and eviction thrashing, at the " +
      "cost of requiring RAM at least as large as the active working set. On " +
      "memory-constrained phones, mmap streaming is usually the right default; " +
      "it loses when storage I/O is slow enough that page faults dominate " +
      "generation latency, e.g. on slow eMMC storage under heavy background load.",
  },
  {
    title: "BM25 lexical search vs. cosine similarity over embeddings",
    source: "aoair seed corpus",
    body:
      "BM25 (used by SQLite's FTS5) ranks documents by term frequency and " +
      "inverse document frequency, rewarding exact keyword and phrase matches. " +
      "It's fast, needs no model, and is precise for queries with distinctive " +
      "vocabulary, but misses paraphrases and synonyms. Cosine similarity over " +
      "dense embeddings captures semantic closeness even without shared " +
      "keywords, but can retrieve topically related-but-irrelevant chunks and " +
      "needs a trained embedding model. Hybrid retrieval (combining both, as " +
      "this app does) helps when a query mixes exact terms with a broader " +
      "conceptual ask; it can hurt if the two signals disagree and the fusion " +
      "weighting isn't tuned for the corpus, effectively adding noise instead " +
      "of complementary signal.",
  },
  {
    title: "GrapheneOS and Google Play Services",
    source: "aoair seed corpus",
    body:
      "GrapheneOS is a privacy- and security-focused Android fork that does " +
      "not ship Google Play Services by default. Play Services provides many " +
      "convenience APIs apps rely on, including on-device AI features like " +
      "Gemini Nano access via AICore, push notifications (FCM), location " +
      "fusion, and Play Integrity attestation. Apps that depend on these APIs " +
      "either fail or fall back to degraded behavior on GrapheneOS. An offline " +
      "AI app targeting GrapheneOS compatibility must reimplement equivalent " +
      "functionality itself — bundling its own inference engine (e.g. " +
      "llama.cpp) rather than calling a Play-Services-mediated model API.",
  },
  {
    title: "Budgeting RAM for on-device LLM inference",
    source: "aoair seed corpus",
    body:
      "On a phone with a 12GB RAM budget for an offline AI app, the usable " +
      "headroom for the LLM's active weight working set is whatever remains " +
      "after OS/app overhead, the embedding model's resident memory, and the " +
      "KV cache for the chosen context length. KV cache size scales with " +
      "context length, number of layers, and attention head dimensions; a " +
      "longer context window directly reduces the RAM left for model weights. " +
      "Quantization (e.g. Q4_K_M) reduces both weight size and the working-set " +
      "footprint compared to higher precision, which is why quantized GGUF " +
      "models are the standard choice for phone-class inference.",
  },
];

function chunkId(docIndex: number): string {
  return `seed-${docIndex}`;
}

export async function seedKnowledgeBaseIfEmpty(): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM chunks`
  );
  if ((row?.count ?? 0) > 0) return;

  for (let i = 0; i < SEED_DOCS.length; i++) {
    const doc = SEED_DOCS[i];
    const chunk: ChunkRecord = {
      chunkId: chunkId(i),
      docId: chunkId(i),
      title: doc.title,
      body: doc.body,
      source: doc.source,
    };
    const embedding = await embeddingEngine.embed(`${doc.title}\n${doc.body}`);
    await insertChunk(chunk, embedding);
  }
}
