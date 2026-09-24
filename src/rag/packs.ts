/**
 * Knowledge packs: SQLite files built on a computer by
 * scripts/build-knowledge-pack.mjs (docs/KNOWLEDGE_PACKS.md), each with its
 * own FTS5 index and int8 embeddings made with the app's embedding model.
 * They're opened read-only and searched alongside the built-in knowledge base.
 *
 * Search is keyword-first: FTS5 picks up to PACK_CANDIDATES chunks, and only
 * those are compared with the question's embedding. Scanning every embedding
 * of a large pack on each question would take seconds on the phone's JS engine.
 */
import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";
import { CORPUS_CATALOG, MODEL_CATALOG, CatalogModel } from "../models/manifest";
import { buildLexicalQuery, cosineSimilarityInt8, filterByMinScore, filterByTermCoverage, MIN_SEMANTIC_SIMILARITY } from "./pure";
import type { RetrievedChunk } from "./retrieve.types";

const PACK_CANDIDATES = 400;
const EMBEDDING_SHA256 = MODEL_CATALOG.find((m) => m.kind === "embedding" && m.required)!.sha256;

const openPacks = new Map<string, SQLite.SQLiteDatabase>();

export function knowledgePacks(): CatalogModel[] {
  return CORPUS_CATALOG.filter((m) => m.format === "sqlite-pack");
}

export async function closePack(id: string): Promise<void> {
  const db = openPacks.get(id);
  openPacks.delete(id);
  await db?.closeAsync().catch(() => {});
}

export async function closeAllPacks(): Promise<void> {
  await Promise.all([...openPacks.keys()].map(closePack));
}

/** The pack's database if it's fully downloaded and built for this app's embedding model, else null. */
async function openPack(pack: CatalogModel): Promise<SQLite.SQLiteDatabase | null> {
  const uri = `${FileSystem.documentDirectory}${pack.filename}`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.size !== pack.sizeBytes) {
    await closePack(pack.id);
    return null;
  }
  const cached = openPacks.get(pack.id);
  if (cached) return cached;

  const path = uri.replace(/^file:\/\//, "");
  const slash = path.lastIndexOf("/");
  const db = await SQLite.openDatabaseAsync(path.slice(slash + 1), { useNewConnection: true }, path.slice(0, slash));
  const meta = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'embeddingModelSha256'");
  if (meta?.value !== EMBEDDING_SHA256) {
    console.warn(`[packs] ${pack.id} was built with a different embedding model; skipping it`);
    await db.closeAsync().catch(() => {});
    return null;
  }
  openPacks.set(pack.id, db);
  return db;
}

type PackRow = { id: number; title: string; body: string; vec: Uint8Array; rank: number };

/** Lexical and semantic candidates from every installed pack, scored like the built-in ones. */
export async function searchPacks(
  query: string,
  queryVec: Float32Array,
  limit: number
): Promise<{ lexical: RetrievedChunk[]; semantic: RetrievedChunk[] }> {
  const lexicalQuery = buildLexicalQuery(query);
  const lexical: RetrievedChunk[] = [];
  const semantic: RetrievedChunk[] = [];
  if (!lexicalQuery) return { lexical, semantic };

  for (const pack of knowledgePacks()) {
    try {
      const db = await openPack(pack);
      if (!db) continue;
      const rows = await db.getAllAsync<PackRow>(
        `SELECT c.id, c.title, c.body, c.vec, bm25(chunks_fts) AS rank
         FROM chunks_fts f JOIN chunks c ON c.id = f.rowid
         WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?`,
        [lexicalQuery.match, PACK_CANDIDATES]
      );
      const toChunk = (r: PackRow, score: number, matchType: RetrievedChunk["matchType"]): RetrievedChunk => ({
        chunkId: `pack:${pack.id}:${r.id}`,
        docId: `pack:${pack.id}:${r.title}`,
        title: r.title,
        body: r.body,
        score,
        matchType,
      });
      lexical.push(...filterByTermCoverage(rows, lexicalQuery.terms).slice(0, limit).map((r) => toChunk(r, -r.rank, "lexical")));
      const scored = rows.map((r) => toChunk(r, cosineSimilarityInt8(queryVec, r.vec), "semantic"));
      scored.sort((a, b) => b.score - a.score);
      semantic.push(...filterByMinScore(scored, MIN_SEMANTIC_SIMILARITY).slice(0, limit));
    } catch (e: any) {
      console.warn(`[packs] search failed in ${pack.id}:`, e?.message ?? e);
    }
  }
  return { lexical, semantic };
}
