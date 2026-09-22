import { getDb } from "../rag/db";

export interface ChatSession {
  id: string;
  title: string;
  summary: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createSession(title = "New chat"): Promise<ChatSession> {
  const db = await getDb();
  const now = Date.now();
  const session: ChatSession = { id: newId(), title, summary: null, createdAt: now, updatedAt: now };
  await db.runAsync(
    `INSERT INTO chat_sessions (id, title, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [session.id, session.title, session.summary, session.createdAt, session.updatedAt]
  );
  return session;
}

export async function listSessions(): Promise<ChatSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    summary: string | null;
    created_at: number;
    updated_at: number;
  }>(`SELECT id, title, summary, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getMessages(sessionId: string): Promise<ChatMessageRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    session_id: string;
    role: "user" | "assistant";
    text: string;
    created_at: number;
  }>(
    `SELECT id, session_id, role, text, created_at FROM chat_messages
     WHERE session_id = ? ORDER BY created_at ASC`,
    [sessionId]
  );
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    text: r.text,
    createdAt: r.created_at,
  }));
}

export async function addMessage(
  sessionId: string,
  role: "user" | "assistant",
  text: string
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO chat_messages (id, session_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)`,
    [newId(), sessionId, role, text, now]
  );
  await db.runAsync(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`, [now, sessionId]);
}

export async function setSessionTitle(sessionId: string, title: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE chat_sessions SET title = ? WHERE id = ?`, [title, sessionId]);
}

export async function setSessionSummary(sessionId: string, summary: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE chat_sessions SET summary = ? WHERE id = ?`, [summary, sessionId]);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM chat_messages WHERE session_id = ?`, [sessionId]);
    await db.runAsync(`DELETE FROM chat_sessions WHERE id = ?`, [sessionId]);
  });
}

export async function clearAllHistory(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM chat_messages`);
    await db.runAsync(`DELETE FROM chat_sessions`);
  });
}

/** Deletes the oldest sessions beyond `maxSessions` (0 = unlimited). */
export async function pruneSessions(maxSessions: number): Promise<void> {
  if (maxSessions <= 0) return;
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM chat_sessions ORDER BY updated_at DESC LIMIT -1 OFFSET ?`,
    [maxSessions]
  );
  for (const row of rows) {
    await deleteSession(row.id);
  }
}
