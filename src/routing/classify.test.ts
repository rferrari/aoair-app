import { describe, it, expect } from "vitest";
import { classifyTask, isRetrievalIrrelevant } from "./classify";

describe("classifyTask", () => {
  it("returns unknown for empty input", () => {
    expect(classifyTask("")).toBe("unknown");
    expect(classifyTask("   ")).toBe("unknown");
  });

  it("detects pure social greetings as a distinct type from chat", () => {
    expect(classifyTask("wake up!")).toBe("greeting");
    expect(classifyTask("hi")).toBe("greeting");
    expect(classifyTask("Hello!")).toBe("greeting");
    expect(classifyTask("hey there")).toBe("greeting");
    expect(classifyTask("good morning")).toBe("greeting");
    expect(classifyTask("thanks!")).toBe("greeting");
    expect(classifyTask("bye")).toBe("greeting");
  });

  it("does not misclassify an informational request phrased as a command as a greeting", () => {
    // "chat" is a broad fallback bucket that also catches real information
    // needs that don't match the wh-question/research heuristics — only
    // pure social small talk (nothing else in the message) is "greeting".
    expect(classifyTask("Tell me about black holes")).toBe("chat");
    expect(classifyTask("hi, can you compare Rust and Go?")).toBe("compare");
  });

  it("detects compare", () => {
    expect(classifyTask("Compare Rust and Go for backend services")).toBe("compare");
    expect(classifyTask("What's the difference between TCP and UDP?")).toBe("compare");
  });

  it("detects summarize", () => {
    expect(classifyTask("Summarize this article for me")).toBe("summarize");
  });

  it("detects translate", () => {
    expect(classifyTask("Translate 'good morning' to Portuguese")).toBe("translate");
  });

  it("detects calculate", () => {
    expect(classifyTask("What is 42 * 17?")).toBe("calculate");
    expect(classifyTask("Calculate the compound interest on $500")).toBe("calculate");
  });

  it("detects code", () => {
    expect(classifyTask("Write some code to reverse a linked list")).toBe("code");
    expect(classifyTask("```js\nconst x = 1;\n```")).toBe("code");
  });

  it("detects extract", () => {
    expect(classifyTask("Extract all the dates mentioned in this text")).toBe("extract");
  });

  it("detects lookup for short wh-questions", () => {
    expect(classifyTask("What is the capital of France?")).toBe("lookup");
    expect(classifyTask("Who wrote Don Quixote?")).toBe("lookup");
  });

  it("detects research for long or explicitly research-flavored queries", () => {
    expect(
      classifyTask(
        "Research the long-term environmental and economic implications of large-scale nuclear power adoption over the next two decades"
      )
    ).toBe("research");
  });

  it("classifies a query as compare rather than research when it explicitly compares two things, even if research-flavored too", () => {
    // Specific patterns (compare/summarize/translate/calculate/code/extract)
    // deliberately win over the broader "research" catch-all — a query
    // that names two things being weighed against each other is shaped like
    // a comparison task regardless of how long or research-y it also reads.
    expect(
      classifyTask("Research the environmental tradeoffs of nuclear versus solar power at grid scale")
    ).toBe("compare");
  });

  it("falls back to chat for everything else", () => {
    expect(classifyTask("tell me a joke")).toBe("chat");
  });

  it("isRetrievalIrrelevant is true only for greeting/calculate/translate/code", () => {
    expect(isRetrievalIrrelevant("greeting")).toBe(true);
    expect(isRetrievalIrrelevant("calculate")).toBe(true);
    expect(isRetrievalIrrelevant("translate")).toBe(true);
    expect(isRetrievalIrrelevant("code")).toBe(true);
    expect(isRetrievalIrrelevant("chat")).toBe(false);
    expect(isRetrievalIrrelevant("lookup")).toBe(false);
    expect(isRetrievalIrrelevant("research")).toBe(false);
  });

  it("is deterministic", () => {
    const q = "Compare Rust and Go";
    expect(classifyTask(q)).toBe(classifyTask(q));
  });
});
