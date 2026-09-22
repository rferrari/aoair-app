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

type Props =
  | { mode: "required"; onReady: () => void }
  | { mode: "optional"; onClose: () => void };

/**
 * Model catalog / setup screen, in two modes:
 *
 * - "required" (first run, no models on disk yet): blocks entry to the app
 *   until the default LLM + embedding model are downloaded. This is the
 *   ONE time the app needs network access; once done, "work completely
 *   offline once installed" holds from then on.
 * - "optional" (reached later via the chat screen's "Models" button): lets
 *   the user browse/download additional/alternate models, or remove ones
 *   they no longer want, purely opt-in.
 *
 * Either way, `ModelManager.downloadCatalogModel` — only ever triggered
 * here by an explicit action — is the app's sole network call site.
 */
export function ModelSetupScreen(props: Props) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const requiredMode = props.mode === "required";

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
    return statuses;
  }, []);

  const download = useCallback(async (model: CatalogModel) => {
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
  }, []);

  const remove = useCallback(
    async (model: CatalogModel) => {
      await modelManager.deleteModel(model);
      await refreshStatus();
    },
    [refreshStatus]
  );

  useEffect(() => {
    (async () => {
      const statuses = await refreshStatus();
      if (requiredMode) {
        // Kick off downloads for whichever required models are missing.
        for (const s of statuses) {
          if (s.asset.required && !s.present) {
            download(s.asset);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requiredReady = MODEL_CATALOG.filter((m) => m.required).every(
    (m) => rows[m.id]?.present
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{requiredMode ? "Set up aoair" : "Model catalog"}</Text>
        {!requiredMode && (
          <Pressable onPress={(props as { onClose: () => void }).onClose}>
            <Text style={styles.closeBtn}>Close</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.subtitle}>
        {requiredMode
          ? "One-time setup: downloading the default models. This needs an internet " +
            "connection now, but the app works fully offline from then on."
          : "The default models are set up. Downloading extra models here requires " +
            "an internet connection — nothing else in this app does."}
      </Text>
      <FlatList
        data={requiredMode ? MODEL_CATALOG.filter((m) => m.required) : MODEL_CATALOG}
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
                  {item.required ? " · default" : ""}
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
                requiredMode ? (
                  <Text style={styles.meta}>ready</Text>
                ) : (
                  <Pressable onPress={() => remove(item)}>
                    <Text style={styles.removeBtn}>Remove</Text>
                  </Pressable>
                )
              ) : (
                <Pressable style={styles.downloadBtn} onPress={() => download(item)}>
                  <Text style={styles.downloadBtnText}>
                    {row?.error ? "Retry" : "Download"}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
      {requiredMode && (
        <Pressable
          style={[styles.continueBtn, !requiredReady && styles.continueBtnDisabled]}
          disabled={!requiredReady}
          onPress={() => (props as { onReady: () => void }).onReady()}
        >
          <Text style={styles.downloadBtnText}>
            {requiredReady ? "Continue" : "Waiting for downloads…"}
          </Text>
        </Pressable>
      )}
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
  continueBtn: {
    backgroundColor: "#2a5f3a",
    borderRadius: 8,
    margin: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  continueBtnDisabled: { backgroundColor: "#333" },
});
