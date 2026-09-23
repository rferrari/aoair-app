import { llamaEngine } from "../inference/LlamaEngine";
import { retrieve, assemblePrompt, RetrievedChunk, ConversationHistory } from "../rag/retrieve";

/**
 * "Deep Research Mode" — a sequential multi-pass pipeline over the SAME
 * single loaded model, not literally multiple specialist models running
 * concurrently. Three frontier-agent-inspired ideas (running 3 models at
 * once, a planner model, a critic model) genuinely don't fit in the 12GB
 * RAM budget alongside everything else this app already loads — so this
 * decomposes the request into sequential llama.cpp calls on one context
 * instead: decompose -> research each sub-question (with its own
 * retrieval pass) -> synthesize. Slower than the normal single-pass chat
 * (several LLM calls instead of one), not "multiple AI agents." The UI
 * badge for this mode says "Deep Research (multi-pass)", not "multi-agent",
 * to avoid overclaiming what's actually happening.
 */

export type ResearchStage = "decomposing" | "researching" | "synthesizing";

export interface ResearchProgress {
  stage: ResearchStage;
  subQuestionIndex?: number;
  subQuestionCount?: number;
}

export interface ResearchResult {
  answer: string;
  subQuestions: string[];
  citations: RetrievedChunk[];
  /** True if any stage hit STAGE_TIMEOUT_MS and was cut off early. */
  timedOut?: boolean;
}

// Safety net, not a performance target — before this, no stage of this
// multi-call pipeline had any time ceiling at all (see
// docs/ADAPTIVE_ROUTING.md §14), so a single stuck stage on a slow/loaded
// device could hang the whole research pass indefinitely with no recovery
// but the user manually stopping it. 2 minutes is deliberately generous.
const STAGE_TIMEOUT_MS = 120_000;

async function decompose(query: string, onTimeout: () => void): Promise<string[]> {
  const prompt =
    `Break this research question into 2-3 focused sub-questions that ` +
    `together cover it well (e.g. technical analysis, counter-arguments, ` +
    `practical implications — whichever fit this question). One per line, ` +
    `no numbering, no extra commentary.\n\nQuestion: ${query}\n\nSub-questions:`;
  const text = await llamaEngine.generate({
    prompt,
    nPredict: 150,
    temperature: 0.4,
    timeoutMs: STAGE_TIMEOUT_MS,
    onTimeout,
  });
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 8);
  return lines.slice(0, 3).length > 0 ? lines.slice(0, 3) : [query];
}

async function researchSubQuestion(
  subQuestion: string,
  systemPrompt: string | undefined,
  history: ConversationHistory | undefined,
  onTimeout: () => void
): Promise<{ answer: string; chunks: RetrievedChunk[] }> {
  const chunks = await retrieve(subQuestion);
  const prompt = assemblePrompt(subQuestion, chunks, systemPrompt, history);
  const answer = await llamaEngine.generate({
    prompt,
    nPredict: 300,
    temperature: 0.6,
    timeoutMs: STAGE_TIMEOUT_MS,
    onTimeout,
  });
  return { answer, chunks };
}

async function synthesize(
  originalQuery: string,
  subResults: { subQuestion: string; answer: string }[],
  systemPrompt: string | undefined,
  maxTokens: number,
  onToken: (piece: string) => void,
  onTimeout: () => void
): Promise<string> {
  const perspectives = subResults
    .map((r, i) => `Perspective ${i + 1} (${r.subQuestion}):\n${r.answer}`)
    .join("\n\n");
  const instruction =
    systemPrompt && systemPrompt.trim().length > 0
      ? systemPrompt.trim()
      : "You are an offline research assistant.";
  const prompt =
    `${instruction} You are synthesizing multiple research perspectives into one answer.\n\n` +
    `Original question: ${originalQuery}\n\n${perspectives}\n\n` +
    `Compare these perspectives, reconcile any conflicts, and write one unified, ` +
    `well-reasoned answer. Cite sources as [n] where the perspectives did.\n\nAnswer:`;
  return llamaEngine.generate({
    prompt,
    nPredict: maxTokens,
    temperature: 0.6,
    onToken,
    timeoutMs: STAGE_TIMEOUT_MS,
    onTimeout,
  });
}

export async function runDeepResearch(
  query: string,
  systemPrompt: string | undefined,
  history: ConversationHistory | undefined,
  maxTokens: number,
  onProgress?: (p: ResearchProgress) => void,
  onToken?: (piece: string) => void,
  shouldStop?: () => boolean
): Promise<ResearchResult> {
  let timedOut = false;
  const markTimedOut = () => {
    timedOut = true;
  };

  onProgress?.({ stage: "decomposing" });
  const subQuestions = await decompose(query, markTimedOut);

  const subResults: { subQuestion: string; answer: string }[] = [];
  const allChunks: RetrievedChunk[] = [];
  for (let i = 0; i < subQuestions.length; i++) {
    // llamaEngine.stop() only interrupts whichever single completion call is
    // in flight *right now* — with several sequential completions here
    // (decompose, each sub-question, synthesize), a stop request needs its
    // own check between stages or the pipeline just carries on to the next
    // one regardless of the user having asked it to stop.
    if (shouldStop?.()) return { answer: "", subQuestions, citations: allChunks, timedOut };
    onProgress?.({ stage: "researching", subQuestionIndex: i, subQuestionCount: subQuestions.length });
    const { answer, chunks } = await researchSubQuestion(subQuestions[i], systemPrompt, history, markTimedOut);
    subResults.push({ subQuestion: subQuestions[i], answer });
    allChunks.push(...chunks);
  }

  if (shouldStop?.()) return { answer: "", subQuestions, citations: allChunks, timedOut };

  onProgress?.({ stage: "synthesizing" });
  // The final synthesized answer respects the user's Max Output Tokens
  // setting, same as a normal single-pass reply — the sub-question research
  // passes above use their own smaller fixed budgets since they're
  // intermediate working material, not what the user reads.
  const answer = await synthesize(
    query,
    subResults,
    systemPrompt,
    maxTokens,
    onToken ?? (() => {}),
    markTimedOut
  );

  return { answer, subQuestions, citations: allChunks, timedOut };
}
