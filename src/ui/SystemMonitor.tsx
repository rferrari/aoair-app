import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { ModelManager } from "../models/ModelManager";
import { RAM_BUDGET_BYTES, STORAGE_BUDGET_BYTES } from "../models/manifest";
import { getMemoryInfo, MemoryInfo } from "../../modules/ram-monitor";

const modelManager = new ModelManager();

function formatGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

/**
 * Live RAM + storage readout so the app's compliance with the bounty's
 * 12GB RAM / 50GB storage caps is auditable on-device, not just claimed.
 * RAM uses the local `ram-monitor` native module (real process RSS from
 * /proc/self/status), which — unlike JS heap size — includes the resident
 * pages of the mmap'd GGUF model. Falls back to "n/a" if the native module
 * isn't linked yet (e.g. running in Expo Go instead of the dev client).
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

  const storageOver = storageBytes > STORAGE_BUDGET_BYTES;
  const ramOver = memInfo != null && memInfo.rssBytes > RAM_BUDGET_BYTES;

  return (
    <View style={styles.bar}>
      <Text style={styles.item}>
        Storage: {formatGB(storageBytes)} / {formatGB(STORAGE_BUDGET_BYTES)}
        {storageOver ? " ⚠️" : ""}
      </Text>
      <Text style={styles.item}>
        RAM: {memInfo != null ? formatGB(memInfo.rssBytes) : "n/a"} / {formatGB(RAM_BUDGET_BYTES)}
        {ramOver ? " ⚠️" : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#111",
  },
  item: {
    color: "#8f8",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
});
