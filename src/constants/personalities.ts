export type PersonalityId = "succinct" | "detailed" | "summary" | "custom";

export interface Personality {
  id: PersonalityId;
  label: string;
  icon: string;
  description: string;
  /** System prompt text; unused for "custom" (user supplies their own via settings). */
  systemPrompt: string;
}

/**
 * Response-style presets. Local models on phone hardware default to long,
 * meandering answers — extra output length means more latency and battery
 * drain, not more usefulness. These give the user direct control over
 * answer length/style without editing prompts by hand.
 */
export const PERSONALITIES: Personality[] = [
  {
    id: "succinct",
    label: "Succinct & Direct",
    icon: "⚡",
    description: "Fastest — 2–3 brief paragraphs or bullets, no preamble. Default for mobile.",
    systemPrompt:
      "You are a concise offline research assistant. Deliver direct, high-density " +
      "answers in bullet points or brief paragraphs without preamble.",
  },
  {
    id: "detailed",
    label: "Deep Research & Analysis",
    icon: "🔬",
    description: "Structured, thorough explanations with comparisons and reasoning.",
    systemPrompt:
      "You are an analytical research partner. Provide thorough, structured " +
      "explanations with comparisons and evidence.",
  },
  {
    id: "summary",
    label: "Executive Summary",
    icon: "📋",
    description: "One top-line takeaway, then 3 key bullet points.",
    systemPrompt:
      "Provide a 1-sentence top-line key takeaway followed by 3 short bullet " +
      "points summarizing the answer.",
  },
  {
    id: "custom",
    label: "Custom",
    icon: "⚙️",
    description: "Write your own system prompt.",
    systemPrompt: "",
  },
];

export const DEFAULT_PERSONALITY_ID: PersonalityId = "succinct";

export const MAX_TOKENS_OPTIONS = [256, 512, 1024, 2048] as const;

export function getPersonality(id: PersonalityId): Personality {
  return PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0];
}
