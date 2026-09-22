import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ModelManager } from "../models/ModelManager";
import { RAM_BUDGET_BYTES, STORAGE_BUDGET_BYTES } from "../models/manifest";
import { getMemoryInfo } from "ram-monitor";
import { getLastQueryStats, subscribeQueryStats } from "../services/telemetry";

const modelManager = new ModelManager();

function formatGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

function MiniBar({ fraction, over }: { fraction: number; over: boolean }) {
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          { width: `${Math.min(fraction, 1) * 100}%` },
          over && styles.fillOver,
        ]}
      />
    </View>
  );
}

/**
 * Compact system summary pinned to the bottom of the drawer — a
 * lower-friction way to spot-check RAM/storage compliance than opening
 * Settings > Stats & System (which still has the full detail).
 */
export function DrawerFooterStats() {
  const [storageBytes, setStorageBytes] = useState(0);
  const [rssBytes, setRssBytes] = useState(0);
  const [tokPerSec, setTokPerSec] = useState<number | null>(getLastQueryStats()?.tokPerSec ?? null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const used = await modelManager.currentStorageUsageBytes();
      if (!cancelled) setStorageBytes(used);
      try {
        if (!cancelled) setRssBytes(getMemoryInfo().rssBytes);
      } catch {
        // native module not linked; leave at 0
      }
    }
    poll();
    const id = setInterval(poll, 5000);
    const unsubscribe = subscribeQueryStats((s) => setTokPerSec(s.tokPerSec));
    return () => {
      cancelled = true;
      clearInterval(id);
      unsubscribe();
    };
  }, []);

  const ramFraction = rssBytes / RAM_BUDGET_BYTES;
  const storageFraction = storageBytes / STORAGE_BUDGET_BYTES;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>RAM</Text>
        <MiniBar fraction={ramFraction} over={ramFraction > 1} />
        <Text style={styles.value}>{formatGB(rssBytes)}/{formatGB(RAM_BUDGET_BYTES)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Disk</Text>
        <MiniBar fraction={storageFraction} over={storageFraction > 1} />
        <Text style={styles.value}>{formatGB(storageBytes)}/{formatGB(STORAGE_BUDGET_BYTES)}</Text>
      </View>
      {tokPerSec != null && (
        <Text style={styles.tokLine}>{tokPerSec.toFixed(1)} tok/s last query</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 16,
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { color: "#777", fontSize: 10, width: 26 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#222", overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#3a7a4a" },
  fillOver: { backgroundColor: "#7a3a3a" },
  value: { color: "#888", fontSize: 9, fontVariant: ["tabular-nums"] },
  tokLine: { color: "#666", fontSize: 10, marginTop: 1 },
});
