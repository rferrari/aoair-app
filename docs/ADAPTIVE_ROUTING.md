# Adaptive Offline Intelligence — Phase 0 Architecture Audit

Branch: `adaptive-offline-ai`. This audit is the required Phase 0 deliverable
before any routing/execution-engine code is written, per the build plan.
Everything below reflects the actual current code (checked directly, not
recalled), not aspiration.

## 1. Model catalog and manifest

`src/models/manifest.ts` — `CatalogModel` (id, kind: `llm`/`embedding`/`corpus`,
filename, sizeBytes, sha256, sourceUrl, license, description, required,
bundled?). `MODEL_CATALOG` is the curated list; `TIERS` (Minimum/Standard/Full)
bundle a required-model set + corpus packs for first-run setup.
`src/models/discoveredModels.ts` persists models found via the Hugging Face
search (`src/services/modelBrowser.ts`) — same `CatalogModel` shape, kept in a
separate JSON file rather than merged into `MODEL_CATALOG` since they aren't
vetted the same way.

**No model capability/role metadata exists today.** `CatalogModel` has no
notion of "this model is good at reasoning" or "this model supports role X" —
that's exactly the gap Phase 1's `ModelCapabilities` fills. It will need to be
layered on as a new, optional, separately-stored annotation (curated for
`MODEL_CATALOG` entries, absent/defaulted for discovered/custom ones), not
added as a required field on `CatalogModel` — discovered models have no one
vetting their capabilities.

## 2. Download/install lifecycle

`src/models/ModelManager.ts` — `statusOf()` (verifies on-disk file size matches
catalog, self-heals truncated files by treating them as absent),
`downloadCatalogModel()` (network fetch + post-download size check, no
per-download sha256 verification — reading a multi-GB file into memory for a
hash isn't done routinely, see the class's own doc comments), `installBundled()`
(alternate bundled-APK path, not the default build).

`src/services/downloadManager.ts` — module-level singleton (survives screen
unmount/remount), tracks per-asset progress/speed/ETA, guards against duplicate
concurrent downloads to the same asset id.

## 3. Model loading/unloading and the inference wrapper

**Two independent singletons, each wrapping one `llama.rn` `LlamaContext`:**

- `src/inference/LlamaEngine.ts` (`llamaEngine`) — generation. `load()` first
  calls `unload()` (releases any previous context) before creating a new one —
  this is a hard constraint: **only one generation-capable model can be loaded
  at a time.** `load()` now no-ops if the same file is already loaded (fixed
  earlier this session — re-mounting a screen used to force an unnecessary
  multi-second native reload). Includes a pre-flight RAM estimate
  (`estimateFit`) that throws a clear error before attempting a load likely to
  OOM. `generate()` passes fixed `DEFAULT_STOP_SEQUENCES` matching the app's
  own hand-built prompt template (not a chat-template API — see §9).
  `stop()` calls `context.stopCompletion()`, which resolves the in-flight
  `completion()` promise normally with partial text (llama.cpp's clean-stop
  behavior) — it does **not** raise/reject.

- `src/rag/embed.ts` (`embeddingEngine`) — embeddings, same load-guard pattern.

**Implication for routing/roles:** the two engines can run concurrently with
each other (generation + embedding coexist today, that's how RAG already
works), but there is **no support for two different generation models loaded
at once**. A routing plan that wants, say, a `fast` model and a separate
`reasoning` model can only run them **sequentially**, paying a model-switch
cost (unload + load, which does a RAM pre-flight and can be a multi-second
native operation for a multi-GB model) between them. This directly confirms
the build plan's own guidance: sequential execution only in the first
implementation, no concurrent multi-model execution.

## 4. Chat state and message persistence

`src/services/chatHistory.ts` over `src/rag/db.ts`'s SQLite (`chat_sessions`,
`chat_messages` tables: `id`, `session_id`, `role`, `text`, `created_at`).
`ChatScreen.tsx` holds live message state in React state; persistence happens
via explicit `createSession`/`addMessage` calls, not automatically.

This is the natural join key for feedback records (Phase 6): `messageId` =
`chat_messages.id`, `conversationId` = `chat_sessions.id`, both already stable,
already-persisted identifiers — no new ID scheme needed.

## 5. RAG / retrieval services

`src/rag/retrieve.ts` — hybrid BM25 (FTS5) + cosine (brute-force over stored
float32 embeddings) with a weighted-sum fusion. `semanticSearch` now enforces a
minimum cosine-similarity floor (`MIN_SEMANTIC_SIMILARITY = 0.45`, added this
session) so an irrelevant query doesn't get force-fed unrelated "context" —
relevant precedent for Phase 5's "avoid presenting unsupported citations as
verified facts."

`src/services/orchestrator.ts` — the existing "Deep Research Mode": a
**sequential multi-pass pipeline on the single loaded generation model**
(decompose → per-sub-question retrieve+generate → synthesize), explicitly
documented as not-actually-multi-agent. This is architecturally the closest
existing thing to a "RoutingPlan executor" — Phase 4's execution engine should
generalize this pattern (typed steps, sequential execution over one context)
rather than replace it. `runDeepResearch` already accepts a `shouldStop`
callback checked between stages (added this session, after discovering the
Stop button didn't actually halt multi-stage research) — the same shape
Phase 4's cancellation support needs.

## 6. Embedding pipeline

`src/rag/embed.ts` (above) + `src/rag/seedCorpus.ts` (idempotent bulk seeding:
checks existing `chunk_id` before embedding, so re-running only embeds new
docs). Embeddings are always computed on-device at seed/import time, never
precomputed/shipped — this is deliberate (see `ARCHITECTURE.md`), so they
always match whichever embedding model is actually loaded.

## 7. Settings and localization

`src/models/settings.ts` — single JSON file
(`FileSystem.documentDirectory + "settings.json"`), read-modify-write on every
change, no schema migration system (new fields are just optional with a
default fallback in each getter). Everything from theme to personality to
memory limits lives here. **This is the pattern Phase 2's presets/model-role
assignments should follow** for simple key-value config (e.g.
`routingPreset: RoutingPreset`, `modelRoleAssignments: Record<ModelRole,
string>`) — small, infrequently-written, no query needs.

`src/i18n/` — i18next/react-i18next, English + Portuguese, manual picker only
(no device-locale auto-detection), 261 keys as of this session's localization
pass. Any new user-facing strings (preset names, routing status text, feedback
UI) need entries in both `src/i18n/locales/en.json` and `pt.json` to stay
consistent with the rest of the app — the earlier i18n pass had gaps
specifically where strings lived in module-level object literals rather than
JSX text, worth remembering when the routing UI adds its own status-label maps.

## 8. Model selection UI

`ModelSetupScreen.tsx` (Settings) and `SetupWizardScreen.tsx` (first-run) both
already have model-management UI (download, activate, remove). `ModelBrowser.tsx`
+ `ModelCatalogScreen.tsx` handle Hugging Face search. **The routing layer
should read from/write to this existing model-management state, not introduce
a second one** — e.g. "assign this already-downloaded model to the `reasoning`
role" is a new relationship on top of existing `CatalogModel`/`discoveredModels`
data, not a new model registry.

## 9. Error handling and reset

`src/ui/components/ModelLoadErrorCard.tsx` classifies raw load errors into a
few buckets (corrupted download, missing file, likely OOM, generic) with
retry/Settings/Setup-Wizard actions. `src/services/appReset.ts` does a full
data wipe (unload both engines first, since they hold the model files open via
mmap — deleting out from under a live context is a known bad pattern in this
codebase's history). Any new local storage (routing config, telemetry,
feedback) needs to be included in `resetAllAppData()`'s wipe list.

## 10. Concurrent model loading — see §3

Confirmed: **no.** One generation context, one embedding context, both
singletons. Multi-model routing plans execute sequentially.

## 11. Memory/runtime metrics availability

`modules/ram-monitor` (native module) exposes `getMemoryInfo()` (process RSS)
and `getDeviceTotalRamBytes()`. `src/services/telemetry.ts` already tracks
peak RSS per-query (`trackPeakRss`) and app-lifetime peak RSS
(`startAppMemoryTracking`), plus per-query stats (tokens generated, duration,
time-to-first-token, tokens/sec) via `recordQueryStats`/`getLastQueryStats`.
**This is real infrastructure Phase 7's `ExecutionTelemetry` should build on,
not duplicate** — token/sec and TTFT are already measured per-generation in
`ChatScreen.tsx`'s `send()`.

No per-model "estimated tokens/sec" or "estimated memory" benchmark data
exists yet — `ModelCapabilities.estimatedMemoryMb`/`estimatedTokensPerSecond`
would need to be either hand-curated per catalog entry (rough, same spirit as
the existing RAM-compatibility badge heuristic in `CatalogItemCard.tsx`) or
derived from `telemetry.ts`'s recorded history once enough real executions
exist — the plan's own Phase 8 guidance ("do not invent memory measurements")
argues for starting with the latter, deferred, rather than fabricating numbers.

## 12. Safest existing storage mechanism for routing config / telemetry / feedback

Two mechanisms exist, matching to two different needs:

- **`settings.ts` (JSON file)** — small, singular, human-editable-shaped
  config: active preset, per-role model assignment, telemetry-enabled toggle.
  Matches Phase 2/9 needs.
- **SQLite (`src/rag/db.ts`)** — structured, queryable, growable records with
  natural foreign keys into `chat_messages`/`chat_sessions`. Matches Phase 6
  (`AnswerFeedback`) and Phase 7 (`ExecutionTelemetry`) needs — new tables
  (`answer_feedback`, `execution_telemetry`) following the exact pattern
  already used for `custom_collections`, with the same `db.ts`
  open-once-lazily/migrate-on-open structure (`PRAGMA table_info` check before
  `ALTER TABLE`, as already done for `chunks.collection_id`).

Both mechanisms are already wired into `appReset.ts`'s wipe path (JSON file
deletion, `resetDatabase()`) — new tables/fields need adding to that list, not
a new deletion path.

## 13. Model switching — does it recreate inference contexts?

Yes, always, by design: `load()` unconditionally calls `unload()` (unless the
same file is already loaded, per the no-op guard added this session). This is
correct/necessary given §3 — there's no way to have two generation contexts
resident, so switching models always means releasing native memory for the old
one and mmap'ing the new one from disk. A routing plan that alternates between
two role-mapped models on the same query will pay this cost each time it
switches — worth surfacing in `ExecutionTelemetry` as a distinct
"model-switch-ms" metric so it's visible rather than silently inflating
per-step latency numbers.

## 14. Cancellation, timeouts, and backgrounding

- **Cancellation**: `ChatScreen.tsx` tracks the in-flight `send()` promise
  (`sendTaskRef`) and a `stopRequestedRef` flag; `stopAndAwaitGeneration()`
  sets the flag, calls `llamaEngine.stop()`, and awaits the actual promise —
  added this session after discovering session-switching didn't previously
  wait for generation to actually stop, causing stale-state bugs. Deep
  Research's `runDeepResearch` checks `shouldStop()` between stages (also this
  session) since `llamaEngine.stop()` alone only halts the *current* single
  completion, not a multi-step pipeline.
- **Timeouts**: **none exist anywhere in the codebase.** No per-generation or
  per-step timeout budget. `InferenceBudget`/`RoutingStep.timeoutMs` (Phase 3)
  is entirely new — needs a `Promise.race` against a timer wrapped around
  `llamaEngine.generate()`, plus a decision on what "timeout" does to a
  streaming completion already emitting tokens (calling `stop()` mid-stream is
  the only existing mechanism; a clean timeout should probably just do that,
  reusing the stop path rather than inventing a second cancellation
  mechanism).
- **Backgrounding**: **not handled at all.** No `AppState` listener anywhere
  in the app. `ModelManager`'s own doc comments cite "app backgrounded... mid-transfer"
  as a known cause of truncated downloads, but nothing currently detects or
  reacts to backgrounding for chat generation, routing execution, or anything
  else. This is a real, pre-existing gap the build plan's constraint
  ("cancellable and resource-aware... do not implement... unexpected
  background inference") implicitly assumes is handled — it isn't yet. Worth
  a decision: should backgrounding auto-stop an in-flight generation/pipeline
  (safest, matches "no unexpected background inference"), or just let it keep
  running (simpler, but risks the OS killing the process mid-generation on
  memory pressure with no clean state)? Recommend auto-stop, matching the
  existing `stopAndAwaitGeneration` path — deferred to whichever phase adds
  the execution engine, since it's the first place a background stop actually
  has multi-step state worth protecting.

## Summary: what Phase 1+ builds on top of, unchanged

- Single generation context + single embedding context (sequential execution
  only, confirmed necessary, not just recommended).
- `orchestrator.ts`'s Deep Research pipeline is the closest existing precursor
  to the execution engine — generalize its shape, don't replace it outright.
- `telemetry.ts` already measures the core per-generation metrics
  Phase 7 needs; extend, don't duplicate.
- `settings.ts` (JSON) for routing config, SQLite for feedback/telemetry —
  matches existing storage-choice conventions in this codebase exactly.
- No timeout mechanism and no backgrounding handling exist yet — both are new
  work, not gaps in this audit.

## Status

**Phase 0 (this document) and Phase 1 (`src/routing/types.ts`): done.**

**Phase 2 — model profiles and presets: done**, config layer only, no UI yet
(per the plan's own phasing — Phase 9 adds the UI):

- `src/models/compatibility.ts` — the RAM-fit heuristic extracted out of
  `CatalogItemCard.tsx` so the catalog UI and routing resolution share one
  formula instead of drifting.
- `CatalogModel.capabilities?: ModelCapabilities` (`src/models/manifest.ts`)
  — hand-curated per §1: Phi-3.5-mini → `general`+`reasoning`, Qwen2.5-1.5B →
  `fast`, Qwen2.5-7B → `reasoning`+`verifier`, bge-small → `embedding`.
  Absent for discovered/Hugging-Face-search models — not vetted the same way.
- `src/routing/profiles.ts` — `ModelProfile`, `PRESET_DEFINITIONS` (Simple/
  Balanced/Research/Custom, as data, not execution logic),
  `resolveModelForRole()`/`buildModelProfiles()`. Resolution order: user
  override (if present on disk) → curated catalog match (if present) →
  fallback to the active default model → explicit disabled profile, never a
  silent route to an unavailable model. `simple` needs only the `general`
  role — deliberately near-identical to today's existing single-model chat,
  so a user who never touches routing settings sees no behavior change.
- `src/models/settings.ts` — `routingPreset` (default `"simple"`) and
  `modelRoleAssignments`, same JSON-file pattern as theme/personality/language.
- Tests: `src/routing/profiles.test.ts`, 10 cases. Caught a real bug during
  writing: `resolveModelForRole` was searching the global `MODEL_CATALOG`
  import instead of the injected `available` list — fixed before it shipped.

**Runtime-safety prerequisite (requested before Phase 3): done.**

- **Timeout**: `LlamaEngine.generate()` gained `timeoutMs`/`onTimeout`
  (`src/inference/LlamaEngine.ts`) — reuses the exact existing clean-stop
  path (`context.stopCompletion()`), no second cancellation mechanism. Not
  applied to regular single-pass chat (already indirectly bounded by
  `nPredict`, and an arbitrary timeout there risks cutting off a legitimate
  slow-but-working generation on a weaker phone). Applied to
  `orchestrator.ts`'s three Deep-Research stages as a 2-minute
  safety-net-not-a-performance-target (`STAGE_TIMEOUT_MS`) — that pipeline
  previously had zero time ceiling across its several sequential calls.
  `ResearchResult.timedOut` surfaces whether any stage hit it; `ChatScreen.tsx`
  shows a badge on the affected message ("⏱ stage timed out") rather than
  leaving a silently-truncated answer unexplained.
- **Backgrounding**: `ChatScreen.tsx` now subscribes to `AppState` — going to
  `"background"` while a generation/pipeline is in flight calls the same
  `stopAndAwaitGeneration()` the Stop button already uses (no new
  cancellation path), then marks the interrupted message with a distinct
  badge ("⏸ paused, app was backgrounded") so it reads as explained-and-
  retriable, not broken. This is the first AppState handling anywhere in the
  app.

**Unresolved / deferred, on purpose:**

- No timeout is applied to regular (non-Deep-Research) chat generation —
  revisit once Phase 3's `InferenceBudget` gives a principled per-task value
  instead of an arbitrary constant.
- Backgrounding policy is "always cancel," per the teammate's explicit
  recommendation. Not configurable yet — no setting to change this behavior.
- `estimatedTokensPerSecond`/`estimatedMemoryMb` in `ModelCapabilities`
  remain unset for all curated models — no benchmarked data exists yet (see
  §11); still correctly deferred rather than invented.

Typecheck and the full test suite (32 tests) pass. Not yet tested on a real
device — background-cancellation behavior in particular should be verified
hands-on (background the app mid-generation, confirm the badge appears and
the model context is actually released, not just that the promise resolves).

**Phase 3 — deterministic routing policy: done.**

- `src/routing/classify.ts` — rule-based `classifyTask()`, deliberately not
  an LLM call per the plan ("do not initially ask an LLM to freely invent a
  pipeline"). Ordered pattern list (compare/summarize/translate/code/
  calculate/extract checked before the broader lookup/research/chat
  fallbacks) — a query matching two patterns takes the more specific one,
  e.g. "research the tradeoffs of X versus Y" classifies as `compare`, not
  `research`. 11 tests.
- `src/routing/router.ts` — `planRoute(context): RoutingPlan`, pure and
  deterministic (no I/O, same input always produces the same output —
  asserted directly in the tests). Implements every explicit rule from the
  plan: simple task → fast/general role; retrieval skipped for
  calculate/translate/code; complex task or research/compare task type →
  reasoning role regardless of preset; verification only for research-preset
  research/compare tasks with retrieved evidence *and* a verifier model
  distinct from the generator (asking a model to grade its own answer isn't
  verification); missing preferred model → graceful role-fallback chain,
  never an empty/broken plan; low-power device state → forces the `fast`
  role and caps the token budget, overriding task/preset. `reasonCodes` on
  every plan explain each decision made (retrieval skipped and why,
  which role resolved to which model, why verification did or didn't run) —
  this is the "explain routing decisions" surface from Phase 9, arriving
  earlier because the router already needed to justify its own choices to
  be testable. 15 tests, including one asserting two `planRoute()` calls
  with identical input produce a deep-equal plan.

**Phase 4 — execution engine: done.**

- `src/routing/executor.ts` — `executeRoutingPlan(plan, input, resolveModel,
  callbacks)` runs a RoutingPlan's steps in order against the real
  `llamaEngine`/`retrieve()`. Generalizes orchestrator.ts's existing
  step-loop shape (shouldStop checked between every step, per-step timeout
  reusing the same `timeoutMs`/`onTimeout` LlamaEngine gained for the
  runtime-safety work) rather than inventing a different pattern —
  orchestrator.ts itself is untouched, Deep Research Mode keeps working
  exactly as before; this is new, separate infrastructure sitting alongside
  it, not a replacement.
  - Model loading is sequential and switch-aware: `ensureModelLoaded` only
    calls `llamaEngine.load()` when the step's model actually differs from
    what's resident, and counts genuine switches into `modelSwitches` on
    the result — the real cost the teammate asked to make part of the
    routing budget, now visible per-execution rather than implicit.
  - `resolveModel` is injected (a `(modelId) => ExecutableModel | undefined`
    callback), not imported from `MODEL_CATALOG` directly — same lesson as
    Phase 2's bug (a hardcoded global instead of injected data breaks both
    testability and correctness for discovered/custom models).
  - Verification is evidence-grounded, not "ask if correct": the verify
    step's prompt asks specifically whether the answer's claims are
    supported by the retrieved chunks, parsed from a constrained
    SUPPORTED/PARTIAL/UNSUPPORTED response format into `passed`/
    `uncertain`/`failed`; an off-format response is `uncertain` (a real,
    honest outcome — not a bug), and no retrieved evidence at all is
    `not_applicable` rather than a meaningless check.
  - 9 tests, run against a **mocked** `llamaEngine`/`retrieve()`
    (`vi.mock`) — `assemblePrompt`/`ConversationHistory` are imported
    directly from the native-module-free `rag/pure.ts` rather than
    `rag/retrieve.ts`, so only `retrieve()` itself needs mocking. This
    proves the orchestration logic (right model loaded for each step, model
    switches counted correctly, required-step failure aborts cleanly,
    optional-step failure just skips, verification parsing) is correct —
    it does **not** prove real Phi/Qwen inference works end-to-end, which
    this sandbox has no way to run (no Android device attached here).

**Scope boundary — read before assuming this is live:** Phase 3 and 4 exist
as complete, tested, standalone infrastructure. **Nothing in `ChatScreen.tsx`
calls `planRoute`/`executeRoutingPlan` yet** — the existing chat send() flow
and Deep Research Mode are both completely unchanged. Wiring this into the
live chat UI is a real, separate decision (touches the main chat path every
user goes through) that hasn't been made — that's Phase 9 (UI/UX) territory,
and per this branch's whole pattern so far, worth doing deliberately with
real-device verification of the routing/execution path first, not folded
into "build the engine."

Typecheck and the full test suite (68 tests total, up from 32) pass.

**Download backgrounding fix (unrelated to Phases 3/4, same runtime-safety
theme): done.**

The mandatory-setup download-stall fix (inactivity timeout + retry UI,
committed earlier) had a gap surfaced by hands-on testing: backgrounding the
app during a download looked identical to a real stall from
`ModelManager`'s point of view (expo-file-system's own docs: progress
callbacks "won't be fired until it's moved to foreground"), so the
inactivity timer fired — but it then **cancelled and deleted** the partial
file, so returning to the app meant restarting a multi-GB download from 0%.

- `ModelManager.downloadCatalogModel` now **pauses** on timeout instead of
  cancelling+deleting, keeping the `DownloadResumable` handle in a
  `pausedDownloads` map keyed by asset id. A subsequent call for the same
  asset reuses that handle and calls `resumeAsync()` instead of starting
  over — genuine (non-timeout) failures are still treated as unrecoverable
  and clean up the partial file as before.
- `SetupWizardScreen.tsx` now auto-retries (`retryFailedDownloads()`) when
  `AppState` returns to `"active"` and a failed/paused asset exists, so the
  user doesn't have to notice the error card and tap Retry manually after
  switching back to the app — it resumes on its own.
- Explicit "keep BOAR open" notice added to Step 3 while a download is
  active, since true background downloading would need a native Android
  Foreground Service — a disproportionate cost for a one-time setup
  download — so the honest fix is graceful pause/resume, not silently
  promising background progress that doesn't happen.

Typecheck and the full test suite (68 tests) still pass. Not yet verified
hands-on: whether `resumeAsync()` on a real device actually continues from
the paused byte offset as expected (the code defensively treats both a
thrown timeout-error and a `resumeAsync()` resolving to `undefined` as the
same pause outcome, since expo-file-system's own type signature only
documents `undefined` for "cancelled" — pause's exact resolution shape
wasn't confirmed against a real device in this sandbox).

**New `TaskType`: `"greeting"`, and a narrow live-path retrieval skip
(first real crossing of the ChatScreen ↔ routing scope boundary): done.**

Hands-on testing of "wake up!" surfaced a real gap in both places: the live
chat path (`ChatScreen.tsx` `send()`) calls `retrieve(query)`
unconditionally for *every* message, with zero classification — it never
called `classifyTask`/`planRoute` at all, so the router's own rules never
applied. But tracing what `planRoute` *would* have done revealed the router
had the same gap: `retrievalIrrelevant` only excluded
`calculate`/`translate`/`code` — a plain `"chat"`-classified greeting still
retrieved in the unwired module too.

- Added a `"greeting"` `TaskType` (`src/routing/types.ts`), deliberately
  **not** folded into the existing `"chat"` fallback — `"chat"` is a broad
  bucket that also catches real informational requests phrased as commands
  ("Tell me about black holes"), which should still retrieve. Only pure
  social small talk (an anchored regex matching the *whole* trimmed query —
  "hi, can you compare X and Y" must not match) classifies as `"greeting"`.
- `classify.ts` gained `isRetrievalIrrelevant(taskType)` — the
  calculate/translate/code/greeting skip rule, now defined in exactly one
  place instead of inlined in `router.ts`.
- `router.ts`'s `retrievalIrrelevant` and `preferredRole` (greeting → always
  `"fast"` role, even under the `"research"` preset) both now use it.
- **`ChatScreen.tsx`'s live `send()` now also uses it** — a narrow, additive
  change, not the full router: `classifyTask(query)` gates the existing
  unconditional `retrieve()` call, nothing else changes (model selection,
  step count, verification are all still untouched — those still require
  the deliberate `planRoute`/`executeRoutingPlan` wiring decision described
  above, which remains deferred). This is the first place any routing
  module code runs against real chat traffic, but it's a single `if` around
  an existing call, not the scope-boundary-crossing decision itself.
- Regression tests: `classify.test.ts` (greeting detection, the
  chat-vs-greeting disambiguation case, `isRetrievalIrrelevant`) and
  `router.test.ts` (greeting skips retrieval, prefers `"fast"` role under
  every preset, produces a single generate step with no verification —
  directly modeling the "wake up!" trace). 73 tests total, up from 68.
