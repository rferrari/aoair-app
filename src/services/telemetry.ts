/**
 * Local, in-memory performance/memory telemetry for the Usage Stats screen.
 * Nothing here is persisted or transmitted anywhere — it's only for
 * auditing this session's inference performance and RAM footprint against
 * the bounty's 12GB RAM / 50GB storage caps, live on-device.
 */
import { getMemoryInfo } from "ram-monitor";
import type { TaskType } from "../routing/types";

export interface QueryStats {
  tokensGenerated: number;
  durationMs: number;
  ttftMs: number;
  tokPerSec: number;
  peakRssBytes: number;
  timestamp: number;
  /**
   * Adaptive routing (Phase 9) fields — all optional, present only when
   * the request actually went through runAdaptiveChat()
   * (src/services/adaptiveChat.ts). Undefined for the existing fixed-
   * active-model path and for Deep Research Mode (unaffected by this
   * integration), so this stays a strict addition — every existing
   * QueryStats consumer keeps working unchanged.
   */
  adaptiveRoutingUsed?: boolean;
  modelId?: string;
  taskType?: TaskType;
  reasonCodes?: string[];
  /** Plan-local switches only (a single plan needing multiple roles) — see executor.ts's PipelineResult.modelSwitches doc comment. NOT "did the model differ from the previous request" — see crossMessageModelSwitch for that. */
  modelSwitches?: number;
  /** Whether the resident model actually changed between the start and end of this request, per LlamaEngine's own real state (not an assumption) — false for a cold start or a failed/skipped load, true for a genuine Qwen<->Phi transition, whether within this plan or carried over from a previous, separate request. */
  crossMessageModelSwitch?: boolean;
  retrievalUsed?: boolean;
  /** Time spent specifically inside executeRoutingPlan() — retrieval + generation + verification steps, not settings/history assembly. */
  generationLatencyMs?: number;
  /** Full request span, same basis as durationMs (start of send() to final response) — kept as a named field so it doesn't get confused with generationLatencyMs for adaptive-routed requests. */
  totalLatencyMs?: number;
  outcome?: "success" | "failure" | "cancelled";
}

type Listener = (stats: QueryStats) => void;

let lastStats: QueryStats | null = null;
const listeners = new Set<Listener>();

export function recordQueryStats(stats: QueryStats): void {
  lastStats = stats;
  listeners.forEach((l) => l(stats));
}

export function getLastQueryStats(): QueryStats | null {
  return lastStats;
}

export function subscribeQueryStats(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Tracks peak RSS by sampling `ram-monitor` at an interval while a
 * generation is in flight. Call `stop()` once the query is done to get the
 * peak observed during that window (and stop the interval).
 */
export function trackPeakRss(sampleFn: () => number, intervalMs = 400) {
  let peak = sampleFn();
  const id = setInterval(() => {
    const current = sampleFn();
    if (current > peak) peak = current;
  }, intervalMs);

  return {
    stop(): number {
      clearInterval(id);
      const current = sampleFn();
      if (current > peak) peak = current;
      return peak;
    },
  };
}

/**
 * App-lifetime peak RSS (process resident set size), not just during a
 * single query — tracks the high-water mark from the moment the app
 * started polling (typically once a model is loaded), so "was this app
 * ever over 12GB" is answerable even between queries. Started once,
 * lazily, on first read/poll — see startAppMemoryTracking().
 */
let appPeakRssBytes = 0;
let trackingStarted = false;

export function startAppMemoryTracking(intervalMs = 2000): void {
  if (trackingStarted) return;
  trackingStarted = true;
  const poll = () => {
    try {
      const rss = getMemoryInfo().rssBytes;
      if (rss > appPeakRssBytes) appPeakRssBytes = rss;
    } catch {
      // native module not linked; leave peak at whatever we've seen
    }
  };
  poll();
  setInterval(poll, intervalMs);
}

export function getAppPeakRssBytes(): number {
  return appPeakRssBytes;
}
