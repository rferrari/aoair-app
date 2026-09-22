/**
 * Pure, native-module-free RAG helpers, kept separate from db.ts/embed.ts
 * (which pull in expo-sqlite/llama.rn) so they're unit-testable under plain
 * Node/vitest without an RN runtime.
 */
import type { RetrievedChunk } from "./retrieve.types";

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ConversationHistory {
  /** Condensed summary of older turns (see src/services/summarize.ts). */
  summary?: string | null;
  /** Recent turns kept verbatim, oldest first. */
  turns?: ConversationTurn[];
}

/**
 * `systemPrompt` sets the assistant's tone/style/length (see
 * src/constants/personalities.ts) — the citation instruction is always
 * appended on top so RAG citations keep working regardless of persona.
 *
 * `history` layers in prior conversation: a condensed summary of older
 * turns (once a chat exceeds the configured turn threshold — see
 * src/services/summarize.ts) plus the last few turns kept verbatim, so the
 * assistant doesn't lose context on the 7th+ message in a long chat.
 */
export function assemblePrompt(
  userQuery: string,
  chunks: RetrievedChunk[],
  systemPrompt?: string,
  history?: ConversationHistory
): string {
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.body}`)
    .join("\n\n");

  const instruction =
    systemPrompt && systemPrompt.trim().length > 0
      ? systemPrompt.trim()
      : "You are an offline research assistant.";

  const summarySection =
    history?.summary && history.summary.trim().length > 0
      ? `Summary of earlier conversation:\n${history.summary.trim()}\n\n`
      : "";

  const turnsSection =
    history?.turns && history.turns.length > 0
      ? `Recent conversation:\n${history.turns
          .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`)
          .join("\n")}\n\n`
      : "";

  return `${instruction} Use the context below when relevant, and cite sources as [n]. ` +
    `If the context doesn't cover the question, say so and answer from general knowledge.\n\n` +
    `${summarySection}${turnsSection}` +
    `Context:\n${context}\n\n` +
    `Question: ${userQuery}\n\nAnswer:`;
}
