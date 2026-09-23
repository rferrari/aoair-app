import * as SQLite from "expo-sqlite";

const DB_NAME = "aoair_knowledge.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens (and lazily creates) the local knowledge base: an FTS5 virtual table
 * for lexical search plus a parallel table of vector embeddings for semantic
 * search. Entirely local — expo-sqlite is a native binding, no network.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

/**
 * Closes and deletes the on-disk database (chat history, the whole
 * knowledge base — bundled corpus, downloaded packs, and custom imported
 * collections all live in this one file) and clears the cached connection
 * so the next getDb() call creates a fresh one. Used by appReset.ts's
 * "Clear All Data" — not called during normal operation.
 */
export async function resetDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
    dbPromise = null;
  }
  await SQLite.deleteDatabaseAsync(DB_NAME);
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      chunk_id UNINDEXED,
      doc_id UNINDEXED,
      title,
      body
    );

    CREATE TABLE IF NOT EXISTS chunks (
      chunk_id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      title TEXT,
      body TEXT NOT NULL,
      source TEXT
    );

    CREATE TABLE IF NOT EXISTS chunk_embeddings (
      chunk_id TEXT PRIMARY KEY REFERENCES chunks(chunk_id),
      -- embedding stored as raw float32 blob for brute-force cosine search
      embedding BLOB NOT NULL,
      dim INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id),
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON chat_messages(session_id, created_at);

    -- User-imported document collections (Settings > Knowledge Base >
    -- Import). Chunks from the bundled/downloaded corpus have no collection
    -- (collection_id IS NULL on the chunks table below) and are always
    -- searched; chunks belonging to a collection are only searched while
    -- that collection's "active" flag is on, so the user can toggle a
    -- custom pack off without deleting it.
    CREATE TABLE IF NOT EXISTS custom_collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_filename TEXT,
      doc_count INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
  `);

  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(chunks)`);
  if (!columns.some((c) => c.name === "collection_id")) {
    await db.execAsync(`ALTER TABLE chunks ADD COLUMN collection_id TEXT REFERENCES custom_collections(id)`);
  }

  return db;
}

export interface ChunkRecord {
  chunkId: string;
  docId: string;
  title: string;
  body: string;
  source?: string;
  /** Set for chunks from a user-imported collection; omitted for the bundled/downloaded corpus. */
  collectionId?: string;
}

export async function insertChunk(
  chunk: ChunkRecord,
  embedding: Float32Array
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO chunks (chunk_id, doc_id, title, body, source, collection_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [chunk.chunkId, chunk.docId, chunk.title, chunk.body, chunk.source ?? null, chunk.collectionId ?? null]
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO chunks_fts (chunk_id, doc_id, title, body) VALUES (?, ?, ?, ?)`,
      [chunk.chunkId, chunk.docId, chunk.title, chunk.body]
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding, dim) VALUES (?, ?, ?)`,
      [chunk.chunkId, new Uint8Array(embedding.buffer), embedding.length]
    );
  });
}

export interface CustomCollection {
  id: string;
  name: string;
  sourceFilename: string | null;
  docCount: number;
  chunkCount: number;
  sizeBytes: number;
  active: boolean;
  createdAt: number;
}

export async function listCustomCollections(): Promise<CustomCollection[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    source_filename: string | null;
    doc_count: number;
    chunk_count: number;
    size_bytes: number;
    active: number;
    created_at: number;
  }>(`SELECT * FROM custom_collections ORDER BY created_at DESC`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sourceFilename: r.source_filename,
    docCount: r.doc_count,
    chunkCount: r.chunk_count,
    sizeBytes: r.size_bytes,
    active: r.active === 1,
    createdAt: r.created_at,
  }));
}

export async function createCustomCollection(
  collection: Omit<CustomCollection, "active" | "createdAt">
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO custom_collections (id, name, source_filename, doc_count, chunk_count, size_bytes, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      collection.id,
      collection.name,
      collection.sourceFilename,
      collection.docCount,
      collection.chunkCount,
      collection.sizeBytes,
      Date.now(),
    ]
  );
}

export async function setCustomCollectionActive(id: string, active: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE custom_collections SET active = ? WHERE id = ?`, [active ? 1 : 0, id]);
}

export async function deleteCustomCollection(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ chunk_id: string }>(
      `SELECT chunk_id FROM chunks WHERE collection_id = ?`,
      [id]
    );
    for (const r of rows) {
      await db.runAsync(`DELETE FROM chunks WHERE chunk_id = ?`, [r.chunk_id]);
      await db.runAsync(`DELETE FROM chunks_fts WHERE chunk_id = ?`, [r.chunk_id]);
      await db.runAsync(`DELETE FROM chunk_embeddings WHERE chunk_id = ?`, [r.chunk_id]);
    }
    await db.runAsync(`DELETE FROM custom_collections WHERE id = ?`, [id]);
  });
}

export async function getCollectionDocs(
  id: string
): Promise<Array<{ title: string; source: string; body: string }>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ title: string; body: string; source: string | null }>(
    `SELECT DISTINCT title, body, source FROM chunks WHERE collection_id = ? ORDER BY chunk_id`,
    [id]
  );
  return rows.map((r) => ({ title: r.title, body: r.body, source: r.source ?? "" }));
}
