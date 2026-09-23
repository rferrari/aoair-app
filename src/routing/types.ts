/**
 * Adaptive routing domain model — Phase 1 of docs/ADAPTIVE_ROUTING.md's build
 * plan. Pure types only, no behavior: the routing service (Phase 3) and
 * execution engine (Phase 4) build on these, but nothing here executes
 * anything. Intentionally scoped to just the domain vocabulary the plan asks
 * for in Phase 1 — RoutingContext/RoutingPlan/RoutingStep (Phase 3) and
 * ModelProfile (Phase 2) are defined alongside the systems that consume them,
 * not here.
 */

/** What kind of task a query is, as classified before routing. */
export type TaskType =
  | "chat"
  | "lookup"
  | "research"
  | "summarize"
  | "compare"
  | "calculate"
  | "extract"
  | "translate"
  | "code"
  | "unknown";

/**
 * A conceptual role in a routing plan, not a specific model. Per
 * docs/ADAPTIVE_ROUTING.md §3/§13: this app can only hold one generation
 * context resident at a time, so a plan using multiple roles executes them
 * sequentially (load model for role A, run, unload, load model for role B),
 * paying a real model-switch cost each time — roles are a planning
 * abstraction, not a claim that multiple models run concurrently.
 */
export type ModelRole = "fast" | "general" | "reasoning" | "verifier" | "embedding";

/**
 * A named routing configuration a user picks (or customizes). Maps to
 * `settings.ts`'s persisted `routingPreset` field once Phase 2 adds it —
 * same JSON-settings pattern already used for theme/personality/language.
 */
export type RoutingPreset = "simple" | "balanced" | "research" | "custom";

/** One stage in an execution plan (Phase 3's RoutingStep.type). */
export type RoutingStepType = "classify" | "retrieve" | "generate" | "verify" | "synthesize";

/**
 * Outcome of an optional verification step. Deliberately distinct from "the
 * answer is correct" — per the build plan, the router/verifier chooses and
 * checks an execution plan, it doesn't adjudicate truth. "uncertain" is a
 * real, expected outcome, not a bug — evidence-grounded verification on a
 * small on-device model often can't confirm or deny cleanly.
 */
export type VerificationStatus = "not_run" | "passed" | "failed" | "uncertain" | "not_applicable";

/**
 * What a specific model is actually good for — explicit, curated data, not
 * inferred from the model's filename or label. Per docs/ADAPTIVE_ROUTING.md
 * §1/§11: MODEL_CATALOG entries can have this hand-curated (same spirit as
 * CatalogItemCard's existing RAM-compatibility heuristic); models a user
 * downloads via the Hugging Face search (discoveredModels.ts) have no one
 * vetting them, so they should default to an empty/unknown capability set
 * rather than an assumed one — never claim a capability without a source for
 * it. All fields but `roles` are optional and the type must stay resilient
 * to a model with none of them set (e.g. a freshly discovered model, or an
 * older catalog entry from before this field existed).
 */
export interface ModelCapabilities {
  /** Which roles this model is curated/suitable for. Empty = not yet assessed, not "no roles". */
  roles: ModelRole[];
  supportsStructuredOutput?: boolean;
  supportsLongContext?: boolean;
  supportsToolLikeTasks?: boolean;
  /** Rough working-set estimate, same approximation basis as LlamaEngine's own pre-flight RAM check. */
  estimatedMemoryMb?: number;
  /**
   * Rough throughput estimate. Per the build plan: never invented — only
   * set once there's real telemetry (src/services/telemetry.ts) or an
   * explicit benchmark backing the number, absent otherwise.
   */
  estimatedTokensPerSecond?: number;
}
