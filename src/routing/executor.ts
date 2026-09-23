/**
 * Adaptive routing Phase 4 — the execution engine. Runs a RoutingPlan
 * (Phase 3's output) step by step against the real inference/retrieval
 * services. Orchestration only — no low-level llama.cpp logic lives here,
 * everything actually touching the model goes through the existing
 * LlamaEngine, same as every other caller in this app.
 *
 * Sequential by design, not a limitation to fix later: this app can only
 * hold one generation context resident at a time (docs/ADAPTIVE_ROUTING.md
 * §3/§13), so a plan spanning multiple roles genuinely does pay a real
 * unload+reload cost each time it switches — tracked here as
 * `modelSwitches` rather than hidden.
 *
 * Generalizes the same step-loop shape src/services/orchestrator.ts already
 * uses for Deep Research Mode (shouldStop checked between steps, a generous
 * per-step timeout, no new cancellation mechanism) rather than inventing a
 * different one — orchestrator.ts is untouched by this file and keeps
 * working exactly as before; this is new, separate infrastructure existing
 * alongside it, not a replacement.
 */
import { llamaEngine } from "../inference/LlamaEngine";
import { retrieve } from "../rag/retrieve";
import { assemblePrompt, assembleChatMessages, ConversationHistory } from "../rag/pure";
import type { RetrievedChunk } from "../rag/retrieve.types";
import { RoutingPlan, RoutingStep } from "./router";
import { VerificationStatus } from "./types";

/** The bits of a CatalogModel the executor actually needs — kept minimal and injected (resolveModel) rather than importing MODEL_CATALOG directly, so this stays testable without a real catalog and doesn't silently ignore discovered/custom models the router might reference. */
export interface ExecutableModel {
  id: string;
  filename: string;
  /** See ModelCapabilities.usesChatTemplate (src/routing/types.ts) — mirrors the resolved model's own flag, injected here for the same testability reason as the rest of this interface. Absent/false means "use assemblePrompt, unchanged." */
  usesChatTemplate?: boolean;
}

export interface PipelineInput {
  query: string;
  systemPrompt?: string;
  history?: ConversationHistory;
}

export interface PipelineCallbacks {
  onToken?: (piece: string) => void;
  onStepStart?: (step: RoutingStep) => void;
  /** Checked between every step, same contract as orchestrator.ts's shouldStop — llamaEngine.stop() alone only halts whichever single completion is in flight right now, not a multi-step plan. */
  shouldStop?: () => boolean;
}

export interface PipelineResult {
  answer: string;
  plan: RoutingPlan;
  citations: RetrievedChunk[];
  verification: { status: VerificationStatus; note?: string };
  warnings: string[];
  stepsExecuted: number;
  /**
   * How many times THIS plan's own execution needed to swap the resident
   * model (a plan spanning multiple roles, e.g. retrieve+generate+verify
   * with a distinct verifier) — plan-local, deliberately NOT "did the
   * model differ from whatever the previous, separate request left
   * loaded." Each executeRoutingPlan() call starts counting from a fresh
   * `loadedModelId = null`, so a single-generate-step plan always reports
   * 0 here regardless of what was resident before this call began — see
   * `crossMessageModelSwitch` for that question instead.
   */
  modelSwitches: number;
  /**
   * Whether the model actually resident in LlamaEngine (via
   * llamaEngine.getModelInfo(), the real source of truth — never an
   * assumption about what the previous request supposedly left loaded)
   * changed between the start and end of THIS execution. False for a cold
   * start (nothing was resident before this call — there's nothing to
   * have switched FROM), false when nothing loaded successfully (a failed
   * or skipped load leaves residency unchanged, so no false positive),
   * true for a genuine Qwen->Phi or Phi->Qwen transition either within
   * this plan or carried over from a previous, separate request.
   */
  crossMessageModelSwitch: boolean;
  timedOut: boolean;
  stopped: boolean;
}

// Same generous safety-net used for orchestrator.ts's Deep Research stages —
// not a performance target, see docs/ADAPTIVE_ROUTING.md §14.
const STEP_TIMEOUT_MS = 120_000;

export async function executeRoutingPlan(
  plan: RoutingPlan,
  input: PipelineInput,
  resolveModel: (modelId: string) => ExecutableModel | undefined,
  callbacks: PipelineCallbacks = {}
): Promise<PipelineResult> {
  const warnings: string[] = [];
  let answer = "";
  let citations: RetrievedChunk[] = [];
  let verification: { status: VerificationStatus; note?: string } = { status: "not_applicable" };
  let stepsExecuted = 0;
  let timedOut = false;
  let loadedModelId: string | null = null;
  let modelSwitches = 0;
  // Read once, before anything in this execution can touch it — the real
  // resident state at the moment this request started, not an assumption.
  const residentFilenameBefore = llamaEngine.getModelInfo()?.filename ?? null;

  const markTimedOut = () => {
    timedOut = true;
  };

  // Re-reads llamaEngine's actual current state (never the filename
  // ensureModelLoaded merely *intended* to load) at whichever point the
  // function is about to return, so a failed/skipped load that never
  // actually changed residency can't produce a false positive.
  const crossMessageModelSwitch = (): boolean => {
    if (residentFilenameBefore === null) return false; // cold start — nothing to have switched from
    const residentFilenameAfter = llamaEngine.getModelInfo()?.filename ?? null;
    return residentFilenameAfter !== residentFilenameBefore;
  };

  const ensureModelLoaded = async (modelId: string | undefined): Promise<boolean> => {
    if (!modelId) return false;
    const model = resolveModel(modelId);
    if (!model) {
      warnings.push(`model-unavailable:${modelId}`);
      return false;
    }
    if (loadedModelId !== modelId) {
      await llamaEngine.load(model.filename);
      if (loadedModelId !== null) modelSwitches++;
      loadedModelId = modelId;
    }
    return true;
  };

  for (const step of plan.steps) {
    if (callbacks.shouldStop?.()) {
      return { answer, plan, citations, verification, warnings, stepsExecuted, modelSwitches, timedOut, crossMessageModelSwitch: crossMessageModelSwitch(), stopped: true };
    }
    callbacks.onStepStart?.(step);

    switch (step.type) {
      case "retrieve": {
        citations = await retrieve(input.query);
        stepsExecuted++;
        break;
      }

      case "generate": {
        const ok = await ensureModelLoaded(step.modelId);
        if (!ok) {
          if (step.required) {
            warnings.push("generate-step-failed-no-model");
            return { answer, plan, citations, verification, warnings, stepsExecuted, modelSwitches, timedOut, crossMessageModelSwitch: crossMessageModelSwitch(), stopped: false };
          }
          break;
        }
        // resolveModel(step.modelId) is a second lookup (ensureModelLoaded
        // already called it once) — cheap (an injected map/find, not I/O),
        // and keeps ExecutableModel's capability data out of
        // ensureModelLoaded's own narrower "is something loaded" concern.
        const generateModel = resolveModel(step.modelId!);
        answer = generateModel?.usesChatTemplate
          ? await llamaEngine.generate({
              messages: assembleChatMessages(input.query, citations, input.systemPrompt, input.history),
              nPredict: step.maxTokens ?? 512,
              onToken: callbacks.onToken,
              timeoutMs: step.timeoutMs ?? STEP_TIMEOUT_MS,
              onTimeout: markTimedOut,
            })
          : await llamaEngine.generate({
              prompt: assemblePrompt(input.query, citations, input.systemPrompt, input.history),
              nPredict: step.maxTokens ?? 512,
              onToken: callbacks.onToken,
              timeoutMs: step.timeoutMs ?? STEP_TIMEOUT_MS,
              onTimeout: markTimedOut,
            });
        stepsExecuted++;
        break;
      }

      case "verify": {
        // Nothing to check claims against, or nothing was actually
        // generated — verification would just be asking a model to grade a
        // vacuum, not a meaningful check. "not_applicable" is the honest
        // status, not "uncertain" (that implies it tried and couldn't
        // decide).
        if (citations.length === 0 || !answer) {
          verification = { status: "not_applicable" };
          break;
        }
        const ok = await ensureModelLoaded(step.modelId);
        if (!ok) {
          verification = { status: "not_applicable" };
          break;
        }
        const verifyPrompt = buildVerificationPrompt(input.query, answer, citations);
        const verdictText = await llamaEngine.generate({
          prompt: verifyPrompt,
          nPredict: step.maxTokens ?? 200,
          temperature: 0.2,
          timeoutMs: step.timeoutMs ?? STEP_TIMEOUT_MS,
          onTimeout: markTimedOut,
        });
        verification = parseVerificationVerdict(verdictText);
        stepsExecuted++;
        break;
      }

      default:
        // "classify"/"synthesize" aren't produced by planRoute yet — Phase 3
        // only builds single-pass retrieve/generate/verify plans. Reserved
        // for a future multi-step plan shape; not silently ignored so a
        // plan referencing one doesn't just look like it did nothing.
        warnings.push(`unhandled-step-type:${step.type}`);
    }
  }

  return { answer, plan, citations, verification, warnings, stepsExecuted, modelSwitches, timedOut, crossMessageModelSwitch: crossMessageModelSwitch(), stopped: false };
}

/**
 * Task-specific per the build plan ("should not simply ask another model
 * whether the first model was correct") — this asks whether the answer's
 * claims are actually supported by the retrieved evidence, a narrower and
 * more checkable question than open-ended correctness.
 */
function buildVerificationPrompt(query: string, answer: string, citations: RetrievedChunk[]): string {
  const evidence = citations.map((c, i) => `[${i + 1}] ${c.title}\n${c.body}`).join("\n\n");
  return (
    `You are checking whether an answer is actually supported by the evidence below — ` +
    `not whether it's well-written, not whether you personally agree with it. ` +
    `Respond with exactly one word first: SUPPORTED, PARTIAL, or UNSUPPORTED, then a ` +
    `single sentence explaining why.\n\n` +
    `Question: ${query}\n\nEvidence:\n${evidence}\n\nAnswer to check:\n${answer}\n\nVerdict:`
  );
}

function parseVerificationVerdict(text: string): { status: VerificationStatus; note?: string } {
  const upper = text.trim().toUpperCase();
  const note = text.trim().slice(0, 200) || undefined;
  if (upper.startsWith("SUPPORTED")) return { status: "passed", note };
  if (upper.startsWith("UNSUPPORTED")) return { status: "failed", note };
  if (upper.startsWith("PARTIAL")) return { status: "uncertain", note };
  // The verifier didn't follow the requested format — genuinely uncertain,
  // not a crash: we asked for a specific answer shape and didn't get one.
  return { status: "uncertain", note };
}
