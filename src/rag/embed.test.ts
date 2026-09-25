import { describe, it, expect, vi } from "vitest";

let busy = false;

vi.mock("llama.rn", () => ({
  initLlama: async () => ({
    // Like llama.rn: a second call while one is running is rejected.
    embedding: async (text: string) => {
      if (busy) throw new Error("Context is busy");
      busy = true;
      await new Promise((r) => setTimeout(r, 5));
      busy = false;
      return { embedding: [text.length] };
    },
    release: async () => {},
  }),
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  getInfoAsync: async () => ({ exists: true }),
}));

import { EmbeddingEngine } from "./embed";

describe("EmbeddingEngine", () => {
  it("runs overlapping embed calls one at a time", async () => {
    const engine = new EmbeddingEngine();
    await engine.load("models/embedding.gguf");
    const results = await Promise.all(["a", "bb", "ccc"].map((t) => engine.embed(t)));
    expect(results.map((r) => r[0])).toEqual([1, 2, 3]);
  });

  it("waits for a load that's still in progress before embedding", async () => {
    const engine = new EmbeddingEngine();
    const load = engine.load("models/embedding.gguf");
    const embedded = engine.embed("abcd");
    await load;
    expect((await embedded)[0]).toBe(4);
  });
});
