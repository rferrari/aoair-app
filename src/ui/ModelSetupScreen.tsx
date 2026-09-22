import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { MODEL_CATALOG, CatalogModel, AssetKind, TIERS, SetupTier, CORPUS_CATALOG } from "../models/manifest";
import { ModelManager, DownloadProgress } from "../models/ModelManager";
import { getActiveModelId, setActiveModelId } from "../models/settings";
import { SystemMonitor } from "./SystemMonitor";

const modelManager = new ModelManager();

function formatMB(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
    : `${(bytes / 1024 / 1024).toFixed(0)}MB`;
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
 * - "required" (first run, no models on disk yet): a short wizard that
 *   explains the one-time download before starting it, then blocks entry
 *   to the app until the default LLM + embedding model are present.
 * - "optional" (the app's Settings screen, reached via the chat header):
 *   storage/RAM readout, plus browsing/downloading additional models and
 *   switching which downloaded model is active per kind.
 *
 * Either way, `ModelManager.downloadCatalogModel` — only ever triggered
 * here by an explicit action — is the app's sole network call site.
 */
export function ModelSetupScreen(props: Props) {
  const requiredMode = props.mode === "required";
  const [wizardStep, setWizardStep] = useState<"welcome" | "intro" | "downloading">("welcome");
  const [selectedTier, setSelectedTier] = useState<SetupTier>("standard");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [activeIds, setActiveIds] = useState<Partial<Record<AssetKind, string>>>({});

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

    const llmActive = await getActiveModelId("llm");
    const embActive = await getActiveModelId("embedding");
    setActiveIds({
      llm: llmActive ?? MODEL_CATALOG.find((m) => m.kind === "llm" && m.required)?.id,
      embedding: embActive ?? MODEL_CATALOG.find((m) => m.kind === "embedding" && m.required)?.id,
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

  const useModel = useCallback(
    async (model: CatalogModel) => {
      await setActiveModelId(model.kind, model.id);
      await refreshStatus();
    },
    [refreshStatus]
  );

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tierCorpusPackIds = TIERS.find((t) => t.id === selectedTier)?.corpusPackIds ?? [];
  const tierAssets = [
    ...MODEL_CATALOG.filter((m) => m.required),
    ...CORPUS_CATALOG.filter((c) => tierCorpusPackIds.includes(c.id)),
  ];

  const startRequiredDownloads = useCallback(async () => {
    setWizardStep("downloading");
    const statuses = await refreshStatus();
    const presentIds = new Set(statuses.filter((s) => s.present).map((s) => s.asset.id));
    for (const asset of tierAssets) {
      if (!presentIds.has(asset.id)) {
        download(asset);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [download, refreshStatus, tierAssets]);

  const requiredReady = tierAssets.every((m) => rows[m.id]?.present);

  const chooseForMe = useCallback(() => {
    setSelectedTier("standard");
    startRequiredDownloads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRequiredDownloads]);

  if (requiredMode && wizardStep === "welcome") {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.introScroll}>
          <Text style={styles.introIcon}>⛺</Text>
          <Text style={styles.introTitle}>Welcome to aoair</Text>
          <Text style={styles.introBody}>
            An offline AI research assistant — local inference, local retrieval,
            no cloud, no accounts.
          </Text>
        </ScrollView>
        <View style={styles.welcomeActions}>
          <Pressable style={styles.primaryBtn} onPress={chooseForMe}>
            <Text style={styles.primaryBtnText}>✨ Choose for Me (Recommended)</Text>
          </Pressable>
          <Text style={styles.welcomeSubtext}>
            Optimal settings auto-configured for your device (under 12GB RAM &
            50GB storage).
          </Text>
          <Pressable style={styles.secondaryBtn} onPress={() => setWizardStep("intro")}>
            <Text style={styles.secondaryBtnText}>⚙️ Custom Setup (Advanced)</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (requiredMode && wizardStep === "intro") {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.introScroll}>
          <Text style={styles.introIcon}>⛺</Text>
          <Text style={styles.introTitle}>Welcome to aoair</Text>
          <Text style={styles.introBody}>
            An offline AI research assistant — local inference, local retrieval,
            no cloud, no accounts.
          </Text>
          <View style={styles.introCard}>
            <Text style={styles.introCardTitle}>One-time setup</Text>
            <Text style={styles.introCardBody}>
              aoair needs an internet connection right now, once, to download its
              default AI model (~2.3GB) and embedding model (~35MB).
            </Text>
          </View>
          <View style={styles.introCard}>
            <Text style={styles.introCardTitle}>Then, fully offline</Text>
            <Text style={styles.introCardBody}>
              After this setup finishes, aoair never needs the internet again —
              chat, search, and reasoning all run entirely on this device. You
              can even turn on airplane mode right now.
            </Text>
          </View>

          <Text style={styles.tierHeading}>How much knowledge base?</Text>
          {TIERS.map((tier) => (
            <Pressable
              key={tier.id}
              style={[styles.tierCard, selectedTier === tier.id && styles.tierCardSelected]}
              onPress={() => setSelectedTier(tier.id)}
            >
              <View style={styles.tierRadio}>
                {selectedTier === tier.id && <View style={styles.tierRadioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tierLabel}>{tier.label}</Text>
                <Text style={styles.tierDescription}>{tier.description}</Text>
              </View>
            </Pressable>
          ))}
          <Text style={styles.tierNote}>
            You can add more knowledge base packs later from Settings, any time
            you're back online.
          </Text>
        </ScrollView>
        <Pressable style={styles.primaryBtn} onPress={startRequiredDownloads}>
          <Text style={styles.primaryBtnText}>Start setup</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{requiredMode ? "Downloading models" : "Settings"}</Text>
        {!requiredMode && (
          <Pressable onPress={(props as { onClose: () => void }).onClose} hitSlop={8}>
            <Text style={styles.closeBtn}>Close</Text>
          </Pressable>
        )}
      </View>

      <ScrollView>
        {!requiredMode && <SystemMonitor />}

        {requiredMode && (
          <Text style={styles.subtitle}>
            This needs an internet connection now — the app works fully offline
            from here on once it's done.
          </Text>
        )}
        {!requiredMode && (
          <Text style={styles.subtitle}>
            Downloading or switching models here needs an internet connection —
            nothing else in this app does.
          </Text>
        )}

        <FlatList
          data={requiredMode ? tierAssets : MODEL_CATALOG}
          keyExtractor={(m) => m.id}
          scrollEnabled={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const row = rows[item.id];
            const isActive = activeIds[item.kind] === item.id;
            return (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    {item.label}
                    {isActive && !requiredMode ? "  ★" : ""}
                  </Text>
                  <Text style={styles.meta}>
                    {item.kind} · {formatMB(item.sizeBytes)} · {item.license}
                    {item.required ? " · default" : ""}
                  </Text>
                  <Text style={styles.description}>{item.description}</Text>
                  {row?.error && <Text style={styles.error}>{row.error}</Text>}
                  {row?.downloading && (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${row.progress * 100}%` }]} />
                    </View>
                  )}
                </View>
                {row?.downloading ? (
                  <ActivityIndicator color="#8f8" />
                ) : row?.present ? (
                  requiredMode ? (
                    <Text style={styles.meta}>ready</Text>
                  ) : isActive ? (
                    <Text style={styles.activeLabel}>Active</Text>
                  ) : (
                    <View style={{ gap: 6, alignItems: "flex-end" }}>
                      <Pressable onPress={() => useModel(item)}>
                        <Text style={styles.useBtn}>Use this</Text>
                      </Pressable>
                      {!item.required && (
                        <Pressable onPress={() => remove(item)}>
                          <Text style={styles.removeBtn}>Remove</Text>
                        </Pressable>
                      )}
                    </View>
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
      </ScrollView>

      {requiredMode && (
        <Pressable
          style={[styles.primaryBtn, !requiredReady && styles.primaryBtnDisabled]}
          disabled={!requiredReady}
          onPress={() => (props as { onReady: () => void }).onReady()}
        >
          <Text style={styles.primaryBtnText}>
            {requiredReady ? "Continue" : "Waiting for downloads…"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  introScroll: { padding: 24, alignItems: "center", gap: 16 },
  introIcon: { fontSize: 48, marginTop: 24 },
  introTitle: { color: "#fff", fontSize: 24, fontWeight: "700" },
  introBody: { color: "#aaa", fontSize: 14, textAlign: "center", lineHeight: 20 },
  introCard: {
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    gap: 6,
  },
  introCardTitle: { color: "#8bf", fontSize: 13, fontWeight: "700" },
  introCardBody: { color: "#ccc", fontSize: 13, lineHeight: 19 },
  tierHeading: { color: "#fff", fontSize: 15, fontWeight: "700", alignSelf: "flex-start", marginTop: 8 },
  tierCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: "#111",
  },
  tierCardSelected: { borderColor: "#3a7a4a", backgroundColor: "#132018" },
  tierRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#555",
    alignItems: "center",
    justifyContent: "center",
  },
  tierRadioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#3a7a4a" },
  tierLabel: { color: "#eee", fontSize: 14, fontWeight: "700" },
  tierDescription: { color: "#999", fontSize: 12, marginTop: 2 },
  tierNote: { color: "#666", fontSize: 11, textAlign: "center", marginTop: 4 },
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
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#222",
    overflow: "hidden",
    marginTop: 6,
  },
  progressFill: { height: "100%", backgroundColor: "#3a7a4a" },
  downloadBtn: { backgroundColor: "#2a5f3a", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  downloadBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  useBtn: { color: "#8bf", fontSize: 12, fontWeight: "600" },
  removeBtn: { color: "#f88", fontSize: 12 },
  activeLabel: { color: "#8f8", fontSize: 12, fontWeight: "600" },
  primaryBtn: {
    backgroundColor: "#2a5f3a",
    borderRadius: 8,
    margin: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { backgroundColor: "#333" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  welcomeActions: { padding: 16, gap: 10, alignItems: "center" },
  welcomeSubtext: { color: "#888", fontSize: 11, textAlign: "center", paddingHorizontal: 12 },
  secondaryBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    width: "100%",
  },
  secondaryBtnText: { color: "#8bf", fontWeight: "600", fontSize: 14 },
});
