import { getDb } from "./db";
import { embeddingEngine } from "./embed";
import { cosineSimilarity } from "./pure";
import type { RetrievedChunk } from "./retrieve.types";

export type { RetrievedChunk } from "./retrieve.types";

/** BM25-ranked FTS5 lexical search over the local knowledge base. */
async function lexicalSearch(query: string, limit: number): Promise<RetrievedChunk[]> {
  const db = await getDb();
  const escaped = query.replace(/"/g, '""');
  const rows = await db.getAllAsync<{
    chunk_id: string;
    doc_id: string;
    title: string;
    body: string;
    rank: number;
  }>(
    `SELECT f.chunk_id, f.doc_id, f.title, f.body, bm25(chunks_fts) AS rank
     FROM chunks_fts f
     JOIN chunks c ON c.chunk_id = f.chunk_id
     LEFT JOIN custom_collections cc ON cc.id = c.collection_id
     WHERE chunks_fts MATCH ? AND (c.collection_id IS NULL OR cc.active = 1)
     ORDER BY rank LIMIT ?`,
    [`"${escaped}"`, limit]
  );
  return rows.map((r) => ({
    chunkId: r.chunk_id,
    docId: r.doc_id,
    title: r.title,
    body: r.body,
    score: -r.rank, // bm25() returns lower-is-better; invert for consistent "higher is better"
    matchType: "lexical" as const,
  }));
}

/** Brute-force cosine search over stored embeddings; fine at knowledge-base scale on-device. */
async function semanticSearch(query: string, limit: number): Promise<RetrievedChunk[]> {
  const db = await getDb();
  const queryVec = await embeddingEngine.embed(query);

  const rows = await db.getAllAsync<{
    chunk_id: string;
    doc_id: string;
    title: string;
    body: string;
    embedding: Uint8Array;
  }>(
    `SELECT c.chunk_id, c.doc_id, c.title, c.body, e.embedding
     FROM chunk_embeddings e
     JOIN chunks c ON c.chunk_id = e.chunk_id
     LEFT JOIN custom_collections cc ON cc.id = c.collection_id
     WHERE c.collection_id IS NULL OR cc.active = 1`
  );

  const scored = rows.map((r) => {
    const vec = new Float32Array(
      r.embedding.buffer,
      r.embedding.byteOffset,
      r.embedding.byteLength / 4
    );
    return {
      chunkId: r.chunk_id,
      docId: r.doc_id,
      title: r.title,
      body: r.body,
      score: cosineSimilarity(queryVec, vec),
      matchType: "semantic" as const,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Hybrid retrieval: union lexical (BM25) + semantic (cosine) results,
 * re-ranked by a simple weighted-sum fusion. No network calls.
 */
export async function retrieve(query: string, topK = 6): Promise<RetrievedChunk[]> {
  const [lexical, semantic] = await Promise.all([
    lexicalSearch(query, topK * 2),
    semanticSearch(query, topK * 2),
  ]);

  const byId = new Map<string, RetrievedChunk>();
  const normalize = (chunks: RetrievedChunk[], weight: number) => {
    if (chunks.length === 0) return;
    const max = Math.max(...chunks.map((c) => c.score), 1e-9);
    for (const c of chunks) {
      const norm = (c.score / max) * weight;
      const existing = byId.get(c.chunkId);
      if (existing) {
        existing.score += norm;
        existing.matchType = "hybrid";
      } else {
        byId.set(c.chunkId, { ...c, score: norm });
      }
    }
  };

  normalize(lexical, 0.5);
  normalize(semantic, 0.5);

  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export { assemblePrompt } from "./pure";
export type { ConversationTurn, ConversationHistory } from "./pure";
