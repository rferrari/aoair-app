/**
 * Reasoning models (e.g. LFM2.5) put their thinking in <think>...</think>
 * before the answer. This separates the two so the chat can hide the
 * reasoning behind a toggle and keep it out of copied text and history.
 */
export interface SplitThinking {
  /** The answer shown to the user. */
  answer: string;
  /** The reasoning text, or null if the model didn't reason. */
  thinking: string | null;
  /** Still streaming the reasoning: <think> opened, no </think> yet. */
  thinkingInProgress: boolean;
}

const OPEN = "<think>";
const CLOSE = "</think>";

export function splitThinking(text: string): SplitThinking {
  const open = text.indexOf(OPEN);
  if (open === -1) {
    // Some templates open the think block in the prompt, so only </think> appears.
    const close = text.indexOf(CLOSE);
    if (close === -1) return { answer: text, thinking: null, thinkingInProgress: false };
    return {
      answer: text.slice(close + CLOSE.length).trim(),
      thinking: text.slice(0, close).trim() || null,
      thinkingInProgress: false,
    };
  }
  const before = text.slice(0, open);
  const rest = text.slice(open + OPEN.length);
  const close = rest.indexOf(CLOSE);
  if (close === -1) {
    return { answer: before.trim(), thinking: rest.trim() || null, thinkingInProgress: true };
  }
  return {
    answer: `${before}${rest.slice(close + CLOSE.length)}`.trim(),
    thinking: rest.slice(0, close).trim() || null,
    thinkingInProgress: false,
  };
}

/** The answer alone, for copying and conversation history. */
export function stripThinking(text: string): string {
  return splitThinking(text).answer;
}
