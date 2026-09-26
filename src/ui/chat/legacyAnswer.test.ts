import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AnswerEvent } from "./answerEvents";

const generateMock = vi.fn();
const stopMock = vi.fn(async () => {});
const retrieveMock = vi.fn();
const adaptiveEnabledMock = vi.fn(async () => false);
const recordExecutionMock = vi.fn(async () => {});

vi.mock("../../inference/LlamaEngine", () => ({
  llamaEngine: {
    generate: (opts: any) => generateMock(opts),
    stop: () => stopMock(),
    hasEmbeddedChatTemplate: () => true,
  },
}));
vi.mock("../../rag/retrieve", () => ({
  retrieve: (query: string) => retrieveMock(query),
  assemblePrompt: () => "prompt",
}));
vi.mock("../../rag/pure", () => ({ assembleChatMessages: () => [], ANSWER_CONTEXT_CHUNKS: 4 }));
vi.mock("../../models/settings", () => ({
  getAdaptiveRoutingEnabled: () => adaptiveEnabledMock(),
  getDeepResearchMode: async () => false,
  getActiveModelId: async () => "qwen",
}));
vi.mock("../../models/manifest", () => ({ MODEL_CATALOG: [{ id: "qwen", label: "Qwen 1.5B" }] }));
vi.mock("../../models/discoveredModels", () => ({ listDiscoveredModels: async () => [] }));
vi.mock("../../services/orchestrator", () => ({ runDeepResearch: vi.fn() }));
vi.mock("../../services/adaptiveChat", () => ({ runAdaptiveChat: vi.fn() }));
vi.mock("../../services/telemetry", () => ({
  recordQueryStats: vi.fn(),
  trackPeakRss: () => ({ stop: () => 0 }),
}));
vi.mock("../../services/executionTelemetry", () => ({ recordExecution: () => recordExecutionMock() }));
vi.mock("ram-monitor", () => ({ getMemoryInfo: () => ({ rssBytes: 0 }) }));

import { answer, errorCode } from "./legacyAnswer";

const ctx = { maxTokens: 256 };
const chunk = { chunkId: "c1", docId: "d1", title: "Raft", body: "…", score: 0.5, matchType: "hybrid" as const };

beforeEach(() => {
  vi.clearAllMocks();
  retrieveMock.mockResolvedValue([chunk]);
  generateMock.mockImplementation(async ({ onToken }: { onToken: (s: string) => void }) => {
    onToken("Raft ");
    onToken("elects [1].");
  });
});

describe("legacy answer adapter", () => {
  it("emits sources before the first token and one done, all tagged with the answer id", async () => {
    const events: AnswerEvent[] = [];
    const handle = answer({ query: "How does Raft elect a leader?" }, (e) => events.push(e), ctx);
    const result = await handle.done;

    expect(events.every((e) => e.answerId === handle.answerId)).toBe(true);
    const types = events.map((e) => (e.type === "stage" ? `stage:${e.stage}` : e.type));
    expect(types.indexOf("sources")).toBeLessThan(types.indexOf("token"));
    expect(types.filter((t) => t === "done")).toHaveLength(1);
    expect(types.slice(0, 3)).toEqual(["stage:retrieving", "sources", "stage:prefill"]);
    expect(types).toContain("deep_available");
    expect(result.outcome).toBe("success");
    expect(result.text).toBe("Raft elects [1].");
    expect(result.receipt.modelLabel).toBe("Qwen 1.5B");
    expect(result.receipt.tokens).toBe(2);
  });

  it("skips retrieval and Deepen for a greeting", async () => {
    const events: AnswerEvent[] = [];
    await answer({ query: "hi!" }, (e) => events.push(e), ctx).done;
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "deep_available")).toBe(false);
  });

  it("reports stopped after stop()", async () => {
    let release!: () => void;
    generateMock.mockImplementation(({ onToken }: { onToken: (s: string) => void }) => {
      onToken("partial");
      return new Promise<void>((r) => (release = r));
    });
    stopMock.mockImplementation(async () => release());
    const events: AnswerEvent[] = [];
    const handle = answer({ query: "Explain Paxos" }, (e) => events.push(e), ctx);
    await vi.waitFor(() => expect(release).toBeDefined());
    await handle.stop();
    const done = events.find((e) => e.type === "done");
    expect(done?.type === "done" && done.outcome).toBe("stopped");
    expect(events.some((e) => e.type === "deep_available")).toBe(false);
  });

  it("turns a thrown error into a done with an error code", async () => {
    generateMock.mockRejectedValue(new Error("failed to allocate memory"));
    const events: AnswerEvent[] = [];
    const result = await answer({ query: "Explain Paxos" }, (e) => events.push(e), ctx).done;
    expect(result.outcome).toBe("error");
    const done = events.find((e) => e.type === "done");
    expect(done?.type === "done" && done.error?.code).toBe("oom");
  });

  it("stops the previous answer before starting a new one", async () => {
    let release!: () => void;
    generateMock.mockImplementationOnce(({ onToken }: { onToken: (s: string) => void }) => {
      onToken("first");
      return new Promise<void>((r) => (release = r));
    });
    stopMock.mockImplementation(async () => release?.());
    const first = answer({ query: "Explain Paxos" }, () => {}, ctx);
    await vi.waitFor(() => expect(release).toBeDefined());
    const second = answer({ query: "Explain Raft" }, () => {}, ctx);
    expect((await first.done).outcome).toBe("stopped");
    expect((await second.done).outcome).toBe("success");
  });
});

describe("errorCode", () => {
  it("maps engine messages to codes", () => {
    expect(errorCode("Out of memory")).toBe("oom");
    expect(errorCode("Model not found")).toBe("no_model");
    expect(errorCode("Failed to load context")).toBe("load_failed");
    expect(errorCode("boom")).toBe("generation_failed");
  });
});
