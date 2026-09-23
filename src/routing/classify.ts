import { TaskType } from "./types";

/**
 * Deterministic, rule-based task classification — per the build plan,
 * explicitly NOT an LLM call ("do not initially ask an LLM to freely invent
 * a pipeline"). Heuristic and imperfect by nature (keyword/shape matching on
 * a short query string can't really "understand" intent), but deterministic
 * and testable, which is the actual requirement for Phase 3's router: same
 * input always produces the same plan.
 */
const PATTERNS: Array<{ type: TaskType; test: RegExp }> = [
  { type: "compare", test: /\b(compare|versus|vs\.?|difference between|which is better)\b/i },
  { type: "summarize", test: /\b(summarize|summarise|summary of|tl;?dr)\b/i },
  { type: "translate", test: /\btranslate\b/i },
  { type: "code", test: /```|\b(write (a |some )?code|debug this|refactor|fix this function|regex for)\b/i },
  { type: "calculate", test: /\b(calculate|compute|how much is)\b|\d+\s*[+\-*/×÷]\s*\d/i },
  { type: "extract", test: /\b(extract|list all|pull out|find every)\b/i },
];

export function classifyTask(query: string): TaskType {
  const trimmed = query.trim();
  if (!trimmed) return "unknown";

  for (const { type, test } of PATTERNS) {
    if (test.test(trimmed)) return type;
  }

  const wordCount = trimmed.split(/\s+/).length;
  if (/^(who|what|when|where|which)\b/i.test(trimmed) && wordCount <= 12) {
    return "lookup";
  }
  if (wordCount > 25 || /\b(research|analyze|analyse|investigate|explore|explain in depth)\b/i.test(trimmed)) {
    return "research";
  }
  return "chat";
}
