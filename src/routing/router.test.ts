import { describe, it, expect } from "vitest";
import { planRoute, RoutingContext, InferenceBudget } from "./router";
import { ModelProfile } from "./profiles";

function profile(role: ModelProfile["role"], modelId: string, enabled = true): ModelProfile {
  return { modelId, role, enabled, userOverride: false, compatibilityStatus: "green" };
}

const BUDGET: InferenceBudget = { maxTokens: 512, allowVerification: true, allowRetrieval: true };

function context(overrides: Partial<RoutingContext>): RoutingContext {
  return {
    taskType: "chat",
    query: "hi",
    hasLocalKnowledgeBase: true,
    retrievalAvailable: true,
    availableModels: [profile("general", "phi"), profile("fast", "qwen-1.5b")],
    preset: "balanced",
    budget: BUDGET,
    ...overrides,
  };
}

describe("planRoute", () => {
  it("simple preset picks the general-role model for a plain chat task", () => {
    const plan = planRoute(context({ preset: "simple" }));
    const genStep = plan.steps.find((s) => s.type === "generate");
    expect(genStep?.modelId).toBe("phi");
    expect(plan.selectedModelIds).toEqual(["phi"]);
  });

  it("balanced preset picks the fast-role model for a plain chat task", () => {
    const plan = planRoute(context({ preset: "balanced" }));
    const genStep = plan.steps.find((s) => s.type === "generate");
    expect(genStep?.modelId).toBe("qwen-1.5b");
  });

  it("research task always prefers the reasoning role, even under a non-research preset", () => {
    const plan = planRoute(
      context({
        preset: "balanced",
        taskType: "research",
        availableModels: [profile("general", "phi"), profile("fast", "qwen-1.5b"), profile("reasoning", "qwen-7b")],
      })
    );
    const genStep = plan.steps.find((s) => s.type === "generate");
    expect(genStep?.modelId).toBe("qwen-7b");
  });

  it("falls back gracefully when the preferred role has no model, rather than producing an empty plan", () => {
    const plan = planRoute(
      context({ preset: "research", taskType: "research", availableModels: [profile("fast", "qwen-1.5b")] })
    );
    const genStep = plan.steps.find((s) => s.type === "generate");
    expect(genStep?.modelId).toBe("qwen-1.5b");
    expect(plan.reasonCodes).toContain("generate:role-reasoning-unavailable-fell-back-to-fast");
  });

  it("produces no generate step, not a throw, when nothing is enabled at all", () => {
    const plan = planRoute(context({ availableModels: [] }));
    expect(plan.steps.find((s) => s.type === "generate")).toBeUndefined();
    expect(plan.reasonCodes).toContain("generate:no-model-available");
  });

  it("skips retrieval for calculate/translate/code tasks even with a knowledge base available", () => {
    for (const taskType of ["calculate", "translate", "code"] as const) {
      const plan = planRoute(context({ taskType }));
      expect(plan.steps.find((s) => s.type === "retrieve")).toBeUndefined();
    }
  });

  it("includes retrieval for a research task when a knowledge base is available", () => {
    const plan = planRoute(context({ taskType: "research", preset: "research" }));
    expect(plan.steps[0].type).toBe("retrieve");
  });

  it("skips retrieval when the caller disables it or none is available", () => {
    expect(planRoute(context({ hasLocalKnowledgeBase: false })).steps.find((s) => s.type === "retrieve")).toBeUndefined();
    expect(
      planRoute(context({ budget: { ...BUDGET, allowRetrieval: false } })).steps.find((s) => s.type === "retrieve")
    ).toBeUndefined();
  });

  it("only verifies for research-preset research/compare tasks with a distinct verifier model and retrieval in the plan", () => {
    const withVerifier = context({
      preset: "research",
      taskType: "research",
      availableModels: [profile("reasoning", "qwen-7b"), profile("verifier", "phi")],
    });
    const plan = planRoute(withVerifier);
    expect(plan.steps.find((s) => s.type === "verify")?.modelId).toBe("phi");
  });

  it("never verifies with the same model that generated the answer", () => {
    const sameModel = context({
      preset: "research",
      taskType: "research",
      availableModels: [profile("reasoning", "qwen-7b"), profile("verifier", "qwen-7b")],
    });
    const plan = planRoute(sameModel);
    expect(plan.steps.find((s) => s.type === "verify")).toBeUndefined();
    expect(plan.reasonCodes).toContain("verify:skipped-no-distinct-verifier-model");
  });

  it("does not verify a simple chat task even under the research preset without a research/compare task type", () => {
    const plan = planRoute(
      context({ preset: "research", taskType: "chat", availableModels: [profile("reasoning", "qwen-7b"), profile("verifier", "phi")] })
    );
    expect(plan.steps.find((s) => s.type === "verify")).toBeUndefined();
  });

  it("low-power mode forces the fast role and caps the token budget regardless of task/preset", () => {
    const plan = planRoute(
      context({
        preset: "research",
        taskType: "research",
        deviceState: { lowPowerMode: true },
        availableModels: [profile("general", "phi"), profile("fast", "qwen-1.5b"), profile("reasoning", "qwen-7b")],
      })
    );
    const genStep = plan.steps.find((s) => s.type === "generate");
    expect(genStep?.modelId).toBe("qwen-1.5b");
    expect(genStep?.maxTokens).toBeLessThanOrEqual(256);
    expect(plan.steps.find((s) => s.type === "verify")).toBeUndefined();
  });

  it("estimatedCost.modelSwitches counts distinct models minus one", () => {
    const plan = planRoute(
      context({
        preset: "research",
        taskType: "research",
        availableModels: [profile("reasoning", "qwen-7b"), profile("verifier", "phi")],
      })
    );
    expect(plan.selectedModelIds).toHaveLength(2);
    expect(plan.estimatedCost.modelSwitches).toBe(1);
  });

  it("a single-model plan has zero estimated model switches", () => {
    const plan = planRoute(context({ preset: "simple" }));
    expect(plan.estimatedCost.modelSwitches).toBe(0);
  });

  it("is deterministic: identical input always produces an identical plan", () => {
    const ctx = context({ preset: "research", taskType: "compare" });
    expect(planRoute(ctx)).toEqual(planRoute(ctx));
  });
});
