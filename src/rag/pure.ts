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

  // With zero retrieved chunks (a greeting/calculate/translate/code task
  // per isRetrievalIrrelevant, or a "chat"-type query retrieve() genuinely
  // found nothing relevant for), the whole context/citation framing is
  // omitted entirely rather than left as an empty "Context:\n\n" section —
  // an empty-but-present section still tells the model there's supposed to
  // be something there and to "cite sources as [n]", which is exactly the
  // kind of dangling framing that nudges a small model toward inventing
  // content to fill it instead of just answering conversationally.
  const hasContext = chunks.length > 0;
  const contextInstruction = hasContext
    ? " Use the context below when relevant, and cite sources as [n]. " +
      "If the context doesn't cover the question, say so and answer from general knowledge."
    : "";
  const contextSection = hasContext
    ? `Context:\n${chunks.map((c, i) => `[${i + 1}] ${c.title}\n${c.body}`).join("\n\n")}\n\n`
    : "";

  return `${instruction}${contextInstruction} ${GROUNDING_INSTRUCTION}\n\n` +
    `${summarySection}${turnsSection}` +
    `${contextSection}` +
    `Question: ${userQuery}\n\nAnswer:`;
}

/**
 * Universal capability/tone boundary, appended for every request regardless
 * of persona or content — not a hardcoded response to any specific phrase.
 *
 * Root cause of the "wake up" -> "morning alarm set / room temperature
 * adjusted" hallucination: this prompt hand-builds a generic "Question: ...
 * Answer:" completion shape rather than Phi-3.5's actual fine-tuned chat
 * template (see LlamaEngine.ts's DEFAULT_STOP_SEQUENCES comment — no chat
 * template is used anywhere in this app). Off that template, a small model
 * given a short, ambiguous, command-shaped fragment with no explicit
 * "you're a chat assistant with no real-world abilities" framing tends to
 * free-associate into a narrative completion (the classic sci-fi/smart-home
 * assistant pattern) instead of a real conversational reply. Switching to
 * a proper chat template is a bigger, separate change (it's shared with
 * Deep Research's per-stage prompts too, via researchSubQuestion in
 * orchestrator.ts — not attempted here to avoid touching that path); this
 * instruction is the smallest fix that directly targets the actual failure
 * mode without it. It's a no-op for genuine questions (Deep Research's
 * decomposed sub-questions are always real questions, never action
 * requests), so it doesn't change that path's behavior in practice.
 */
const GROUNDING_INSTRUCTION =
  "You have no ability to control real-world devices or take physical actions — no alarms, " +
  "lights, thermostats, timers, or any other device or system. You can only respond with text. " +
  "Treat greetings and casual small talk conversationally and briefly, not as a command or task. " +
  "Never claim to have done something (set, adjusted, turned on/off, scheduled, etc.) that you " +
  "don't actually have the ability to do.";
