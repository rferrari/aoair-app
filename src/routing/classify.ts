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

// Anchored to the whole (trimmed) query, not just "contains" — "hi, can you
// compare X and Y" must NOT match this; only pure social small talk with
// nothing else in the message should. Checked before PATTERNS would ever
// matter here (none of them overlap with these phrases), but kept as its
// own pass for clarity.
const GREETING_RE =
  /^(hi|hello|hey|hey there|yo|sup|wake up|good (morning|afternoon|evening|night)|how(?:'s| is| are) it going|how are you\??|what'?s up\??|thanks?( you)?|thank you|bye|goodbye|see ya|see you|ok(ay)?|cool|nice)[!.?~\s]*$/i;

export function classifyTask(query: string): TaskType {
  const trimmed = query.trim();
  if (!trimmed) return "unknown";

  if (GREETING_RE.test(trimmed)) return "greeting";

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

/**
 * Whether local-knowledge-base retrieval is genuinely irrelevant for this
 * task type — shared between the (unwired) router and the live chat path
 * (`ChatScreen.tsx`) so the rule lives in exactly one place. A translation,
 * calculation, code request, or pure greeting doesn't get better by
 * retrieving unrelated knowledge-base chunks; every other task type
 * (including the broad "chat" fallback, which also catches real
 * informational requests phrased as commands) still retrieves.
 */
export function isRetrievalIrrelevant(taskType: TaskType): boolean {
  return (
    taskType === "calculate" ||
    taskType === "translate" ||
    taskType === "code" ||
    taskType === "greeting"
  );
}
