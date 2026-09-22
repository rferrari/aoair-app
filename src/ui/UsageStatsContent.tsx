import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SystemMonitor } from "./SystemMonitor";
import {
  getLastQueryStats,
  subscribeQueryStats,
  QueryStats,
  getAppPeakRssBytes,
} from "../services/telemetry";
import { llamaEngine } from "../inference/LlamaEngine";
import { MODEL_CATALOG, RAM_BUDGET_BYTES } from "../models/manifest";
import { getMemoryInfo, getDeviceTotalRamBytes } from "ram-monitor";

function formatGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Performance/memory/model-config content for the Settings screen's
 * "Stats & System" tab. Helps verify the app's compliance with the
 * bounty's 12GB RAM / 50GB storage caps on real hardware, live, not just
 * by claim. Inference stats are from the last completed query this session
 * (src/services/telemetry.ts) — nothing persisted or transmitted anywhere.
 */
export function UsageStatsContent() {
  const [stats, setStats] = useState<QueryStats | null>(getLastQueryStats());
  const [appRss, setAppRss] = useState(0);
  const [appPeakRss, setAppPeakRss] = useState(getAppPeakRssBytes());
  const [deviceTotalRam, setDeviceTotalRam] = useState(0);

  useEffect(() => subscribeQueryStats(setStats), []);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      try {
        if (!cancelled) setAppRss(getMemoryInfo().rssBytes);
      } catch {
        // native module not linked
      }
      if (!cancelled) setAppPeakRss(getAppPeakRssBytes());
    }
    poll();
    const id = setInterval(poll, 2000);
    try {
      setDeviceTotalRam(getDeviceTotalRamBytes());
    } catch {
      // native module not linked
    }
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const modelInfo = llamaEngine.getModelInfo();
  const modelCatalogEntry = modelInfo
    ? MODEL_CATALOG.find((m) => m.filename === modelInfo.filename)
    : undefined;

  const deviceUsedRam = deviceTotalRam > 0 ? Math.max(deviceTotalRam - appRss, 0) : 0;
  const withinLimit = appPeakRss <= RAM_BUDGET_BYTES;

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>🧠 Memory footprint</Text>
          {appPeakRss > 0 && (
            <View style={[styles.limitBadge, withinLimit ? styles.limitBadgeOk : styles.limitBadgeOver]}>
              <Text style={styles.limitBadgeText}>
                {withinLimit ? "🟢 Within 12GB Limit" : "🔴 Over 12GB Limit"}
              </Text>
            </View>
          )}
        </View>
        <Row label="App memory" value={`${formatGB(appRss)} (Peak: ${formatGB(appPeakRss)})`} />
        <Row
          label="Device RAM"
          value={
            deviceTotalRam > 0
              ? `${formatGB(deviceUsedRam)} used / ${formatGB(deviceTotalRam)} total`
              : "unavailable"
          }
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚡ Inference performance</Text>
        {stats ? (
          <>
            <Row label="Last query speed" value={`${stats.tokPerSec.toFixed(1)} tok/s`} />
            <Row label="Time to first token" value={formatMs(stats.ttftMs)} />
            <Row label="Tokens generated" value={String(stats.tokensGenerated)} />
            <Row label="Total duration" value={formatMs(stats.durationMs)} />
            <Row label="Peak RSS during query" value={formatGB(stats.peakRssBytes)} />
          </>
        ) : (
          <Text style={styles.note}>Send a message to see performance stats here.</Text>
        )}
      </View>

      <SystemMonitor />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>ℹ️ Active model configuration</Text>
        {modelInfo ? (
          <>
            <Row label="Model" value={modelCatalogEntry?.label ?? modelInfo.filename} />
            <Row label="Context window" value={`${modelInfo.nCtx} tokens`} />
            <Row label="Threads" value={String(modelInfo.nThreads)} />
            {modelCatalogEntry && <Row label="License" value={modelCatalogEntry.license} />}
          </>
        ) : (
          <Text style={styles.note}>No model loaded.</Text>
        )}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111", borderRadius: 10, padding: 14, margin: 12, gap: 8 },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  limitBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  limitBadgeOk: { backgroundColor: "rgba(58,122,74,0.4)" },
  limitBadgeOver: { backgroundColor: "rgba(122,42,42,0.4)" },
  limitBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: "#999", fontSize: 12 },
  rowValue: { color: "#eee", fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  note: { color: "#666", fontSize: 12 },
});
