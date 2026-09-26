/**
 * The one place the chat gets answer()/deepen() from. Today: the adapter over
 * the existing pipelines. When the engine's answerService (feat/engine-routing,
 * PR #2) is on main, replace the body with:
 *   export { answer, deepen } from "../../routing/answerService";
 *   export type { AnswerContext } from "../../routing/answer";
 */
export { answer, deepen } from "./legacyAnswer";
export type { AnswerContext } from "./legacyAnswer";
