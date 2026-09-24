import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeContext = { model: string; released: boolean; release: () => Promise<void> };
const created: FakeContext[] = [];
let inFlightInits = 0;
let maxConcurrentInits = 0;

vi.mock("llama.rn", () => ({
  initLlama: async ({ model }: { model: string }) => {
    inFlightInits++;
    maxConcurrentInits = Math.max(maxConcurrentInits, inFlightInits);
    await new Promise((r) => setTimeout(r, 5));
    inFlightInits--;
    const ctx: FakeContext = {
      model,
      released: false,
      release: async () => {
        ctx.released = true;
      },
    };
    created.push(ctx);
    return ctx;
  },
}));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  getInfoAsync: async () => ({ exists: true, size: 1_000_000 }),
}));
vi.mock("ram-monitor", () => ({
  getDeviceTotalRamBytes: () => 12 * 1024 ** 3,
  getMemoryInfo: () => ({ rssBytes: 1024 ** 3 }),
}));

import { LlamaEngine } from "./LlamaEngine";

const live = () => created.filter((c) => !c.released);

beforeEach(() => {
  created.length = 0;
  inFlightInits = 0;
  maxConcurrentInits = 0;
});

describe("LlamaEngine load/unload", () => {
  it("never leaves an orphaned context when loads overlap (quick model swaps)", async () => {
    const engine = new LlamaEngine();
    await Promise.all([engine.load("models/a.gguf"), engine.load("models/b.gguf"), engine.load("models/a.gguf")]);
    expect(maxConcurrentInits).toBe(1);
    expect(live()).toHaveLength(1);
    expect(live()[0].model).toBe("file:///docs/models/a.gguf");
    expect(engine.getModelInfo()?.filename).toBe("models/a.gguf");
  });

  it("skips a load of the model that is already loaded", async () => {
    const engine = new LlamaEngine();
    await engine.load("models/a.gguf");
    await Promise.all([engine.load("models/a.gguf"), engine.load("models/a.gguf")]);
    expect(created).toHaveLength(1);
  });

  it("serializes unload with a pending load, leaving nothing loaded", async () => {
    const engine = new LlamaEngine();
    await Promise.all([engine.load("models/a.gguf"), engine.unload()]);
    expect(live()).toHaveLength(0);
    expect(engine.isLoaded).toBe(false);
  });

  it("keeps working after a failed load", async () => {
    const engine = new LlamaEngine();
    const fs = await import("expo-file-system/legacy");
    const spy = vi.spyOn(fs, "getInfoAsync").mockResolvedValueOnce({ exists: false } as any);
    await expect(engine.load("models/missing.gguf")).rejects.toThrow(/not found/);
    await engine.load("models/b.gguf");
    expect(engine.getModelInfo()?.filename).toBe("models/b.gguf");
    spy.mockRestore();
  });
});
