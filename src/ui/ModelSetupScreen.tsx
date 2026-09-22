import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { MODEL_CATALOG, CatalogModel } from "../models/manifest";
import { ModelManager, DownloadProgress } from "../models/ModelManager";

const modelManager = new ModelManager();

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

interface RowState {
  present: boolean;
  downloading: boolean;
  progress: number; // 0-1
  error: string | null;
}

/**
 * Optional model catalog: browse and download additional/alternate models
 * beyond the bundled default. This is the ONLY screen in the app that makes
 * network requests, and only when the user explicitly taps "Download" on a
 * specific model — never automatically, never during chat/inference.
 */
export function ModelSetupScreen({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const refreshStatus = useCallback(async () => {
    const statuses = await modelManager.statusAll();
    setRows((prev) => {
      const next = { ...prev };
      for (const s of statuses) {
        next[s.asset.id] = {
          present: s.present,
          downloading: prev[s.asset.id]?.downloading ?? false,
          progress: prev[s.asset.id]?.progress ?? 0,
          error: prev[s.asset.id]?.error ?? null,
        };
      }
      return next;
    });
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const download = useCallback(
    async (model: CatalogModel) => {
      setRows((prev) => ({
        ...prev,
        [model.id]: { present: false, downloading: true, progress: 0, error: null },
      }));
      try {
        await modelManager.downloadCatalogModel(model, (p: DownloadProgress) => {
          const progress =
            p.totalBytesExpectedToWrite > 0
              ? p.totalBytesWritten / p.totalBytesExpectedToWrite
              : 0;
          setRows((prev) => ({
            ...prev,
            [model.id]: { ...prev[model.id], downloading: true, progress },
          }));
        });
        setRows((prev) => ({
          ...prev,
          [model.id]: { present: true, downloading: false, progress: 1, error: null },
        }));
      } catch (e: any) {
        setRows((prev) => ({
          ...prev,
          [model.id]: {
            present: false,
            downloading: false,
            progress: 0,
            error: e?.message ?? String(e),
          },
        }));
      }
    },
    []
  );

  const remove = useCallback(async (model: CatalogModel) => {
    await modelManager.deleteModel(model);
    await refreshStatus();
  }, [refreshStatus]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Model catalog</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.closeBtn}>Close</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>
        The default model is bundled and works with no network. Downloading
        extra models here requires an internet connection — nothing else in
        this app does.
      </Text>
      <FlatList
        data={MODEL_CATALOG}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const row = rows[item.id];
          return (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{item.label}</Text>
                <Text style={styles.meta}>
                  {item.kind} · {formatMB(item.sizeBytes)} · {item.license}
                  {item.bundled ? " · bundled" : ""}
                </Text>
                <Text style={styles.description}>{item.description}</Text>
                {row?.error && <Text style={styles.error}>{row.error}</Text>}
                {row?.downloading && (
                  <Text style={styles.meta}>
                    Downloading… {(row.progress * 100).toFixed(0)}%
                  </Text>
                )}
              </View>
              {row?.downloading ? (
                <ActivityIndicator color="#8f8" />
              ) : row?.present ? (
                item.bundled ? (
                  <Text style={styles.meta}>installed</Text>
                ) : (
                  <Pressable onPress={() => remove(item)}>
                    <Text style={styles.removeBtn}>Remove</Text>
                  </Pressable>
                )
              ) : (
                <Pressable style={styles.downloadBtn} onPress={() => download(item)}>
                  <Text style={styles.downloadBtnText}>Download</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
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
  subtitle: { color: "#999", fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 },
  list: { padding: 12, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 10,
  },
  label: { color: "#eee", fontSize: 14, fontWeight: "600" },
  meta: { color: "#8f8", fontSize: 11, marginTop: 2 },
  description: { color: "#999", fontSize: 12, marginTop: 4 },
  error: { color: "#f88", fontSize: 11, marginTop: 4 },
  downloadBtn: { backgroundColor: "#2a5f3a", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  downloadBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  removeBtn: { color: "#f88", fontSize: 12 },
});
