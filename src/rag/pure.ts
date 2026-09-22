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

export function assemblePrompt(userQuery: string, chunks: RetrievedChunk[]): string {
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.body}`)
    .join("\n\n");

  return `You are an offline research assistant. Use the context below when relevant, ` +
    `and cite sources as [n]. If the context doesn't cover the question, say so and ` +
    `answer from general knowledge.\n\n` +
    `Context:\n${context}\n\n` +
    `Question: ${userQuery}\n\nAnswer:`;
}
