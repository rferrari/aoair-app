import { describe, it, expect } from "vitest";
import { splitThinking, stripThinking } from "./thinking";

describe("splitThinking", () => {
  it("leaves answers without reasoning untouched", () => {
    expect(splitThinking("Canberra.")).toEqual({ answer: "Canberra.", thinking: null, thinkingInProgress: false });
  });

  it("separates a complete think block from the answer", () => {
    expect(splitThinking("<think>The user asks about Australia.</think>\n\nCanberra is the capital.")).toEqual({
      answer: "Canberra is the capital.",
      thinking: "The user asks about Australia.",
      thinkingInProgress: false,
    });
  });

  it("reports reasoning still streaming, with no answer yet", () => {
    expect(splitThinking("<think>Let me recall the capital")).toEqual({
      answer: "",
      thinking: "Let me recall the capital",
      thinkingInProgress: true,
    });
  });

  it("handles a template that opened <think> in the prompt, so only </think> is generated", () => {
    expect(splitThinking("reasoning here</think>The answer.")).toEqual({
      answer: "The answer.",
      thinking: "reasoning here",
      thinkingInProgress: false,
    });
  });

  it("treats an empty think block as no reasoning", () => {
    expect(splitThinking("<think>\n\n</think>Hi!")).toEqual({ answer: "Hi!", thinking: null, thinkingInProgress: false });
  });

  it("strips reasoning for copy and history", () => {
    expect(stripThinking("<think>x</think> Answer")).toBe("Answer");
    expect(stripThinking("Plain answer")).toBe("Plain answer");
  });
});
