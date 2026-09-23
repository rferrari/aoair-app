import { getDb } from "./db";
import { embeddingEngine } from "./embed";
import { cosineSimilarity, filterByMinScore, fuseRetrievalResults, MIN_SEMANTIC_SIMILARITY } from "./pure";
import type { RetrievedChunk } from "./retrieve.types";

export type { RetrievedChunk } from "./retrieve.types";

/**
 * BM25-ranked FTS5 lexical search over the local knowledge base. The query
 * is wrapped in double quotes, which FTS5 treats as a PHRASE match (the
 * query's words must appear consecutively, in order, in the indexed text)
 * — this is already this search's relevance gate, not just a ranking
 * detail: gibberish or a query with no matching phrasing anywhere in the
 * corpus returns zero rows, not a weak match. No additional numeric score
 * floor is applied on top of it — every row bm25() ranks here already
 * passed that gate, and layering an unvalidated magnitude threshold on top
 * (bm25's raw scale is corpus/query-dependent, and there's no real FTS5
 * runtime available in this sandbox to measure it) risks discarding
 * genuine exact-phrase matches for no evidenced benefit.
 */
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
  return filterByMinScore(scored, MIN_SEMANTIC_SIMILARITY).slice(0, limit);
}

/**
 * Hybrid retrieval: union lexical (BM25, exact-phrase-gated) + semantic
 * (cosine, MIN_SEMANTIC_SIMILARITY-gated) results, re-ranked by a simple
 * weighted-sum fusion (fuseRetrievalResults, src/rag/pure.ts — extracted
 * there so the fusion/threshold mechanics are unit-testable without a real
 * device; see retrieve.relevance.test.ts). No network calls. If neither
 * source has anything relevant, this returns [] — never a forced top-K of
 * whatever happened to be least-irrelevant.
 */
export async function retrieve(query: string, topK = 6): Promise<RetrievedChunk[]> {
  const [lexical, semantic] = await Promise.all([
    lexicalSearch(query, topK * 2),
    semanticSearch(query, topK * 2),
  ]);

  return fuseRetrievalResults(lexical, semantic, topK);
}

export { assemblePrompt } from "./pure";
export type { ConversationTurn, ConversationHistory } from "./pure";
