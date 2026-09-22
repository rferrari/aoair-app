/**
 * Local, in-memory performance/memory telemetry for the Usage Stats screen.
 * Nothing here is persisted or transmitted anywhere — it's only for
 * auditing this session's inference performance and RAM footprint against
 * the bounty's 12GB RAM / 50GB storage caps, live on-device.
 */

export interface QueryStats {
  tokensGenerated: number;
  durationMs: number;
  ttftMs: number;
  tokPerSec: number;
  peakRssBytes: number;
  timestamp: number;
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
