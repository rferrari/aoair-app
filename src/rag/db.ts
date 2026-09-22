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
  `);

  return db;
}

export interface ChunkRecord {
  chunkId: string;
  docId: string;
  title: string;
  body: string;
  source?: string;
}

export async function insertChunk(
  chunk: ChunkRecord,
  embedding: Float32Array
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO chunks (chunk_id, doc_id, title, body, source) VALUES (?, ?, ?, ?, ?)`,
      [chunk.chunkId, chunk.docId, chunk.title, chunk.body, chunk.source ?? null]
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
