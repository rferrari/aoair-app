import type { RetrievedChunk } from "../../rag/retrieve.types";

// Local mirror of the engine's AnswerEvent contract (agreed with the engine
// owner; see review/ui-qa/chat-spec.md §9). Replace with an import from
// src/routing/events.ts once that lands on main.

export type Tier = "instant" | "fast" | "deep";
export type Stage = "loading_model" | "retrieving" | "prefill" | "generating" | "verifying" | "synthesizing";
export type Outcome = "success" | "stopped" | "timeout" | "interrupted" | "error";
export type AnswerErrorCode = "no_model" | "oom" | "load_failed" | "generation_failed" | "unknown";

export interface Receipt {
  /** "extractive" when the answer is only the source passage, with no model. */
  modelId: string;
  modelLabel: string;
  tokens: number;
  tokPerSec: number;
  ttftMs: number;
  totalMs: number;
  retrievalMs?: number;
  prefillMs?: number;
  ctxTokens?: number;
}

export interface StageDetail {
  index?: number;
  count?: number;
  progress?: number;
  sourceCount?: number;
}

export type AnswerEvent = { answerId: string } & (
  | { type: "stage"; stage: Stage; tier: Tier; modelId?: string; at: number; detail?: StageDetail }
  | { type: "sources"; tier: Tier; sources: RetrievedChunk[] }
  | { type: "instant"; snippet: { text: string; sourceIndex: number }; confidence: number }
  | { type: "token"; tier: Tier; text: string }
  | { type: "deep_available"; estSeconds?: number; modelLabel?: string }
  | {
      type: "done";
      tier: Tier;
      outcome: Outcome;
      receipt: Receipt;
      error?: { code: AnswerErrorCode; message: string };
    }
);

export const EXTRACTIVE_MODEL_ID = "extractive";
