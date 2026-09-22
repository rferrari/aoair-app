import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ModelManager } from "../models/ModelManager";
import { RAM_BUDGET_BYTES, STORAGE_BUDGET_BYTES } from "../models/manifest";
import { getMemoryInfo, MemoryInfo } from "ram-monitor";

const modelManager = new ModelManager();

function formatGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function Bar({ label, usedBytes, budgetBytes }: { label: string; usedBytes: number; budgetBytes: number }) {
  const fraction = Math.min(usedBytes / budgetBytes, 1);
  const over = usedBytes > budgetBytes;
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, over && styles.rowValueOver]}>
          {formatGB(usedBytes)} / {formatGB(budgetBytes)}
          {over ? " ⚠️" : ""}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${fraction * 100}%` },
            over && styles.fillOver,
          ]}
        />
      </View>
    </View>
  );
}

/**
 * Live RAM + storage readout so the app's compliance with the bounty's
 * 12GB RAM / 50GB storage caps is auditable on-device, not just claimed.
 * RAM uses the local `ram-monitor` native module (real process RSS from
 * /proc/self/status), which — unlike JS heap size — includes the resident
 * pages of the mmap'd GGUF model. Falls back to "n/a" if the native module
 * isn't linked yet (e.g. running in Expo Go instead of the dev client).
 * Lives in the Settings screen rather than the chat header, out of the way
 * of the status bar and everyday use.
 */
export function SystemMonitor() {
  const [storageBytes, setStorageBytes] = useState<number>(0);
  const [memInfo, setMemInfo] = useState<MemoryInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const used = await modelManager.currentStorageUsageBytes();
      if (!cancelled) setStorageBytes(used);

      try {
        const info = getMemoryInfo();
        if (!cancelled) setMemInfo(info);
      } catch {
        // Native module not linked (e.g. Expo Go) — leave memInfo as null.
      }
    }

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Storage & memory</Text>
      <Bar label="Storage" usedBytes={storageBytes} budgetBytes={STORAGE_BUDGET_BYTES} />
      <Bar label="RAM" usedBytes={memInfo?.rssBytes ?? 0} budgetBytes={RAM_BUDGET_BYTES} />
      {memInfo == null && (
        <Text style={styles.note}>RAM readout unavailable in this build.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 14,
    margin: 12,
    gap: 10,
  },
  title: { color: "#fff", fontSize: 14, fontWeight: "600" },
  row: { gap: 4 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: "#aaa", fontSize: 12 },
  rowValue: { color: "#8f8", fontSize: 12, fontVariant: ["tabular-nums"] },
  rowValueOver: { color: "#f88" },
  track: { height: 6, borderRadius: 3, backgroundColor: "#222", overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#3a7a4a" },
  fillOver: { backgroundColor: "#7a3a3a" },
  note: { color: "#666", fontSize: 11 },
});
