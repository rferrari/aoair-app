import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { ModelManager } from "../models/ModelManager";
import { RAM_BUDGET_BYTES, STORAGE_BUDGET_BYTES } from "../models/manifest";

const modelManager = new ModelManager();

function formatGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

/**
 * Live RAM + storage readout so the app's compliance with the bounty's
 * 12GB RAM / 50GB storage caps is auditable on-device, not just claimed.
 * RAM figure uses performance.memory where available (Hermes/JSC don't
 * expose process RSS to JS directly); storage is exact via FileSystem.
 */
export function SystemMonitor() {
  const [storageBytes, setStorageBytes] = useState<number>(0);
  const [jsHeapBytes, setJsHeapBytes] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const used = await modelManager.currentStorageUsageBytes();
      if (!cancelled) setStorageBytes(used);

      // @ts-expect-error - non-standard, only present on some JS engines
      const heap = global.performance?.memory?.usedJSHeapSize;
      if (!cancelled && typeof heap === "number") setJsHeapBytes(heap);
    }

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const storageOver = storageBytes > STORAGE_BUDGET_BYTES;

  return (
    <View style={styles.bar}>
      <Text style={styles.item}>
        Storage: {formatGB(storageBytes)} / {formatGB(STORAGE_BUDGET_BYTES)}
        {storageOver ? " ⚠️" : ""}
      </Text>
      <Text style={styles.item}>
        RAM (JS heap): {jsHeapBytes != null ? formatGB(jsHeapBytes) : "n/a"} / {formatGB(RAM_BUDGET_BYTES)}
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
