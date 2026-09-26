/**
 * Bridge from today's answer pipelines (fixed model, adaptive routing, Deep
 * Research) to the AnswerEvent stream the chat UI consumes. Same signature as
 * the engine's answer() (src/routing/answer.ts, in progress on
 * feat/engine-routing): once that lands, the chat imports it instead and this
 * file goes away.
 *
 * Known gaps versus the real engine, all handled by the UI degrading:
 * - no instant (extractive) tier;
 * - on the adaptive and Deep Research paths, sources arrive with "done"
 *   rather than before the first token;
 * - prefill time and context size are not measured.
 */
import { llamaEngine } from "../../inference/LlamaEngine";
import { retrieve, assemblePrompt, type ConversationTurn } from "../../rag/retrieve";
import type { RetrievedChunk } from "../../rag/retrieve.types";
import { assembleChatMessages, ANSWER_CONTEXT_CHUNKS } from "../../rag/pure";
import { classifyTask, isRetrievalIrrelevant } from "../../routing/classify";
import type { TaskType } from "../../routing/types";
import { getAdaptiveRoutingEnabled } from "../../models/settings";
import { runDeepResearch, type ResearchProgress } from "../../services/orchestrator";
import { runAdaptiveChat } from "../../services/adaptiveChat";
import { recordQueryStats, trackPeakRss, type QueryStats } from "../../services/telemetry";
import { recordExecution } from "../../services/executionTelemetry";
import { getMemoryInfo } from "ram-monitor";
import type {
  AnswerErrorCode,
  AnswerEvent,
  AnswerEventHandler,
  AnswerHandle,
  AnswerOutcome,
  AnswerRequest,
  AnswerResult,
  AnswerTier,
} from "./answerEvents";

export interface AnswerContext {
  systemPrompt?: string;
  styleReminder?: string;
  history: { summary: string | null; turns: ConversationTurn[] };
  maxTokens: number;
  /** The loaded model, for the receipt when routing doesn't report one. */
  model: { id: string; label: string } | null;
  /** Settings "always complete answer" (the old Deep Research mode). */
  alwaysComplete: boolean;
}

let counter = 0;
const newAnswerId = () => `${Date.now()}-${++counter}`;

/** Maps an engine error message to a code the UI can explain. */
export function errorCode(message: string): AnswerErrorCode {
  if (/memory|\boom\b|alloc/i.test(message)) return "oom";
  if (/not found|no model/i.test(message)) return "no_model";
  if (/load/i.test(message)) return "load_failed";
  return "generation_failed";
}

function researchStage(p: ResearchProgress): Extract<AnswerEvent, { type: "stage" }>["stage"] {
  return p.stage === "researching" ? "retrieving" : "synthesizing";
}

export function answer(req: AnswerRequest, onEvent: AnswerEventHandler, ctx: AnswerContext): AnswerHandle {
  const answerId = newAnswerId();
  const tier: AnswerTier = req.tier === "deep" || (req.tier !== "fast" && ctx.alwaysComplete) ? "deep" : "fast";
  let stopRequested = false;
  const emit = (e: DistributiveOmit<AnswerEvent, "answerId">) => onEvent({ ...e, answerId } as AnswerEvent);

  const done = run();

  return {
    answerId,
    done,
    async stop() {
      stopRequested = true;
      await llamaEngine.stop();
      await done.catch(() => {});
    },
  };

  async function run(): Promise<AnswerResult> {
    const { query } = req;
    const peakRss = trackPeakRss(() => {
      try {
        return getMemoryInfo().rssBytes;
      } catch {
        return 0;
      }
    });
    const startTime = performance.now();
    let ttftMs = 0;
    let firstTokenAt = 0;
    let tokens = 0;
    let text = "";
    let modelId = ctx.model?.id ?? "";
    let modelLabel = ctx.model?.label ?? "";
    let reasonCodes: string[] = [];
    let fixedTaskType: TaskType | undefined;
    let adaptiveTelemetry: Partial<QueryStats> | null = null;
    let timedOut = false;
    let sources: RetrievedChunk[] = [];

    const onToken = (piece: string) => {
      tokens += 1;
      text += piece;
      if (tokens === 1) {
        firstTokenAt = performance.now();
        ttftMs = firstTokenAt - startTime;
        emit({ type: "stage", stage: "generating", tier, at: firstTokenAt });
      }
      emit({ type: "token", tier, text: piece });
    };
    const stage = (s: Extract<AnswerEvent, { type: "stage" }>["stage"], detail?: { index?: number; count?: number }) =>
      emit({ type: "stage", stage: s, tier, at: performance.now(), detail });
    const shouldStop = () => stopRequested;

    const runFixed = async (): Promise<RetrievedChunk[]> => {
      fixedTaskType = classifyTask(query);
      let c: RetrievedChunk[] = [];
      if (!isRetrievalIrrelevant(fixedTaskType)) {
        stage("retrieving");
        c = req.reuseSources ?? (await retrieve(query, ANSWER_CONTEXT_CHUNKS));
        emit({ type: "sources", tier, sources: c });
      }
      stage("prefill");
      // The model's own chat template when its file ships one; the plain prompt is only a fallback.
      await llamaEngine.generate(
        llamaEngine.hasEmbeddedChatTemplate()
          ? { messages: assembleChatMessages(query, c, ctx.systemPrompt, ctx.history, ctx.styleReminder), nPredict: ctx.maxTokens, onToken }
          : { prompt: assemblePrompt(query, c, ctx.systemPrompt, ctx.history, ctx.styleReminder), nPredict: ctx.maxTokens, onToken }
      );
      return c;
    };

    try {
      if (tier === "deep") {
        const result = await runDeepResearch(
          query,
          ctx.systemPrompt,
          ctx.history,
          ctx.maxTokens,
          (p) => stage(researchStage(p), { index: p.subQuestionIndex, count: p.subQuestionCount }),
          onToken,
          shouldStop
        );
        sources = result.citations;
        timedOut = !!result.timedOut;
        reasonCodes = ["multi_pass"];
      } else if (await getAdaptiveRoutingEnabled()) {
        try {
          const result = await runAdaptiveChat(
            { query, systemPrompt: ctx.systemPrompt, styleReminder: ctx.styleReminder, history: ctx.history },
            ctx.maxTokens,
            {
              onToken,
              shouldStop,
              onStepStart: (step) => stage(step.type === "retrieve" ? "retrieving" : step.type === "verify" ? "verifying" : "prefill"),
            }
          );
          // No answer and no stop means routing found nothing to run: fall back like a thrown error.
          if (result.answer.trim().length === 0 && !stopRequested) {
            console.warn("[legacyAnswer] adaptive routing produced no answer, falling back:", result.warnings, result.plan.reasonCodes);
            adaptiveTelemetry = { adaptiveRoutingUsed: true, outcome: "failure" };
            sources = await runFixed();
          } else {
            sources = result.citations;
            timedOut = !!result.timedOut;
            reasonCodes = result.plan.reasonCodes;
            if (result.modelUsed) {
              modelId = result.modelUsed.id;
              modelLabel = result.modelUsed.label;
            }
            adaptiveTelemetry = {
              adaptiveRoutingUsed: true,
              modelId: result.plan.steps.find((s) => s.type === "generate")?.modelId,
              taskType: result.taskType,
              reasonCodes: result.plan.reasonCodes,
              modelSwitches: result.modelSwitches,
              crossMessageModelSwitch: result.crossMessageModelSwitch,
              modelResidency: result.modelResidency,
              modelLoadMs: result.modelLoadMs,
              retrievalUsed: sources.length > 0,
              generationLatencyMs: result.generationLatencyMs,
              outcome: stopRequested ? "cancelled" : "success",
            };
            // executor.ts measures TTFT without model load time; prefer it when present.
            if (result.ttftMs !== undefined) {
              adaptiveTelemetry.ttftMs = result.ttftMs;
              if (result.generationLatencyMs && result.generationLatencyMs > 0) {
                adaptiveTelemetry.tokPerSec = tokens / (result.generationLatencyMs / 1000);
              }
            }
          }
        } catch (e: any) {
          // A routing failure must never leave the user without a response.
          console.warn("[legacyAnswer] adaptive routing threw, falling back to active model:", e?.message ?? String(e));
          adaptiveTelemetry = { adaptiveRoutingUsed: true, outcome: "failure" };
          sources = await runFixed();
        }
      } else {
        sources = await runFixed();
      }

      if (sources.length > 0) emit({ type: "sources", tier, sources });

      const totalMs = performance.now() - startTime;
      const genSeconds = firstTokenAt > 0 ? (performance.now() - firstTokenAt) / 1000 : 0;
      const outcome: AnswerOutcome = stopRequested ? "stopped" : timedOut ? "timeout" : "success";
      const receipt = {
        modelId,
        modelLabel,
        tokens,
        tokPerSec: adaptiveTelemetry?.tokPerSec ?? (genSeconds > 0 ? tokens / genSeconds : 0),
        ttftMs: adaptiveTelemetry?.ttftMs ?? ttftMs,
        totalMs,
        loadMs: adaptiveTelemetry?.modelLoadMs,
        reasonCodes,
      };

      const stats: QueryStats = {
        tokensGenerated: tokens,
        durationMs: totalMs,
        ttftMs,
        tokPerSec: tokens > 0 ? tokens / ((totalMs - ttftMs) / 1000) : 0,
        peakRssBytes: peakRss.stop(),
        timestamp: Date.now(),
        totalLatencyMs: totalMs,
        modelId: ctx.model?.id,
        ...(fixedTaskType ? { taskType: fixedTaskType, retrievalUsed: sources.length > 0 } : {}),
        ...(adaptiveTelemetry ?? {}),
      };
      recordQueryStats(stats);
      // Fire-and-forget: telemetry must never block or fail the answer.
      recordExecution({
        modelId: stats.modelId,
        taskType: stats.taskType,
        adaptiveRoutingUsed: stats.adaptiveRoutingUsed ?? false,
        reasonCodes: stats.reasonCodes,
        retrievalUsed: stats.retrievalUsed,
        modelSwitches: stats.modelSwitches,
        crossMessageModelSwitch: stats.crossMessageModelSwitch,
        modelResidency: stats.modelResidency,
        modelLoadMs: stats.modelLoadMs,
        ttftMs: stats.ttftMs,
        generationLatencyMs: stats.generationLatencyMs,
        totalLatencyMs: stats.totalLatencyMs,
        tokensGenerated: stats.tokensGenerated,
        tokPerSec: stats.tokPerSec,
        peakRssBytes: stats.peakRssBytes,
        outcome: stats.outcome ?? (stopRequested ? "cancelled" : "success"),
      }).catch(() => {});

      emit({ type: "done", tier, outcome, receipt });
      const retrievalRelevant = fixedTaskType ? !isRetrievalIrrelevant(fixedTaskType) : sources.length > 0;
      if (tier === "fast" && outcome === "success" && retrievalRelevant) {
        emit({ type: "deep_available", reason: "multi_pass" });
      }
      return { answerId, tier, outcome, text, sources, receipt };
    } catch (e: any) {
      peakRss.stop();
      const message = e?.message ?? String(e);
      const totalMs = performance.now() - startTime;
      recordExecution({
        adaptiveRoutingUsed: false,
        modelId: ctx.model?.id,
        totalLatencyMs: totalMs,
        tokensGenerated: tokens,
        outcome: "failure",
        errorMessage: message,
      }).catch(() => {});
      const receipt = { modelId, modelLabel, tokens, tokPerSec: 0, ttftMs, totalMs, reasonCodes };
      emit({ type: "done", tier, outcome: "error", receipt, error: { code: errorCode(message), message } });
      return { answerId, tier, outcome: "error", text, sources, receipt };
    }
  }
}

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
