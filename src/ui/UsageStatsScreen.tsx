import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SystemMonitor } from "./SystemMonitor";
import { getLastQueryStats, subscribeQueryStats, QueryStats } from "../services/telemetry";
import { llamaEngine } from "../inference/LlamaEngine";
import { MODEL_CATALOG } from "../models/manifest";

function formatGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * "System Usage & Performance Stats" screen, reachable from the drawer.
 * Helps verify the app's compliance with the bounty's 12GB RAM / 50GB
 * storage caps on real hardware, live, not just by claim. Inference stats
 * are from the last completed query this session (src/services/telemetry.ts)
 * — nothing persisted or transmitted anywhere.
 */
export function UsageStatsScreen({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<QueryStats | null>(getLastQueryStats());

  useEffect(() => subscribeQueryStats(setStats), []);

  const modelInfo = llamaEngine.getModelInfo();
  const modelCatalogEntry = modelInfo
    ? MODEL_CATALOG.find((m) => m.filename === modelInfo.filename)
    : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Usage & Performance</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.closeBtn}>Close</Text>
        </Pressable>
      </View>

      <ScrollView>
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
      </ScrollView>
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
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "600" },
  closeBtn: { color: "#8bf", fontSize: 14 },
  card: { backgroundColor: "#111", borderRadius: 10, padding: 14, margin: 12, gap: 8 },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: "#999", fontSize: 12 },
  rowValue: { color: "#eee", fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  note: { color: "#666", fontSize: 12 },
});
