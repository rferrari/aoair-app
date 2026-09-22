import { describe, it, expect } from "vitest";
import { cosineSimilarity, assemblePrompt } from "./pure";
import type { RetrievedChunk } from "./retrieve.types";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it("is -1 for opposite vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });

  it("returns 0 for zero-norm vectors instead of NaN", () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([1, 1]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe("assemblePrompt", () => {
  const chunks: RetrievedChunk[] = [
    {
      chunkId: "1",
      docId: "1",
      title: "Doc One",
      body: "Body one.",
      score: 0.9,
      matchType: "hybrid",
    },
  ];

  it("includes the question and numbered citations", () => {
    const prompt = assemblePrompt("What is X?", chunks);
    expect(prompt).toContain("Question: What is X?");
    expect(prompt).toContain("[1] Doc One");
    expect(prompt).toContain("Body one.");
  });

  it("still produces a valid prompt with no context", () => {
    const prompt = assemblePrompt("What is X?", []);
    expect(prompt).toContain("Question: What is X?");
  });
});
