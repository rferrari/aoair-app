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

// bge-small-en-v1.5 cosine similarity heuristic: below this, a chunk isn't
// actually about the query, it's just whatever happened to be "closest" out
// of everything in the knowledge base — brute-force top-K with no floor
// means even a query with nothing relevant on-device always gets K chunks
// back, which then get force-fed into the prompt as "Context" the model is
// told to answer from. Not a precise cutoff (no real device/embedding
// runtime available to measure this corpus's actual score distribution —
// see retrieve.relevance.test.ts), just cheap, evidence-informed-as-far-as-
// possible insurance against near-random matches being presented as
// relevant. Left unchanged rather than invented/re-guessed — moving it
// without real score-distribution data to justify a new number would be
// exactly the mistake it's meant to prevent.
export const MIN_SEMANTIC_SIMILARITY = 0.45;

/**
 * Excludes chunks whose raw score is below a minimum confidence floor.
 * Applied to a SINGLE source's raw scores, before fuseRetrievalResults's
 * max-relative normalization — normalizing first would make a floor
 * meaningless, since that normalization rescales each result set so its
 * own best match always looks "confident" (~1.0) relative to itself,
 * regardless of how weak that best match actually is in absolute terms.
 */
export function filterByMinScore<T extends { score: number }>(chunks: T[], minScore: number): T[] {
  return chunks.filter((c) => c.score >= minScore);
}

/**
 * Weighted-sum fusion of two already-scored, already-relevance-filtered
 * result sets into one ranked list. Each source is normalized to its own
 * max score before weighting so lexical (BM25, unbounded) and semantic
 * (cosine, bounded [-1,1]) scores combine meaningfully despite being on
 * completely different scales.
 *
 * This is a RELATIVE re-ranking step, not a second relevance gate — it has
 * no way to tell a genuinely strong match from "the best of a bad lot",
 * since normalizing to each set's own max erases that distinction by
 * construction. Absolute relevance must be decided by filterByMinScore
 * (or an equivalent gate, like lexicalSearch's exact-phrase MATCH
 * requirement) on the INPUTS, before this runs — see retrieve.ts.
 */
export function fuseRetrievalResults(
  lexical: RetrievedChunk[],
  semantic: RetrievedChunk[],
  topK: number,
  weights: { lexical: number; semantic: number } = { lexical: 0.5, semantic: 0.5 }
): RetrievedChunk[] {
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

  normalize(lexical, weights.lexical);
  normalize(semantic, weights.semantic);

  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
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
