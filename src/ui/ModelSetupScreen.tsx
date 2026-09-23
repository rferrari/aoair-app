import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, Alert } from "react-native";
import { MODEL_CATALOG, CatalogModel, AssetKind, TIERS, SetupTier, CORPUS_CATALOG } from "../models/manifest";
import { ModelManager } from "../models/ModelManager";
import { getActiveModelId, setActiveModelId } from "../models/settings";
import { seedKnowledgeBaseIfEmpty } from "../rag/seedCorpus";
import { startDownload, getDownloadState, isDownloading, subscribeDownloads } from "../services/downloadManager";
import { listDiscoveredModels, removeDiscoveredModel } from "../models/discoveredModels";
import { resetAllAppData } from "../services/appReset";
import { CatalogItemCard, CatalogRowState } from "./CatalogItemCard";
import { CorpusSettingsTab } from "./CorpusSettingsTab";
import { ModelBrowser } from "./ModelBrowser";
import { PersonalitySettings } from "./PersonalitySettings";
import { UsageStatsContent } from "./UsageStatsContent";
import { VoiceSettings } from "./VoiceSettings";
import { MemorySettings } from "./MemorySettings";
import { AccordionSection } from "./AccordionSection";
import { Toast } from "./Toast";

const modelManager = new ModelManager();
const LLM_EMBEDDING_KINDS: AssetKind[] = ["llm", "embedding"];

type Props =
  | { mode: "required"; onReady: () => void }
  | { mode: "optional"; onClose: () => void; onRelaunchWizard?: () => void };

/**
 * Model catalog / setup screen, in two modes:
 *
 * - "required" (first run, no models on disk yet): a short wizard that
 *   explains the one-time download before starting it, then blocks entry
 *   to the app until the default LLM + embedding model are present.
 * - "optional" (the app's Settings screen, reached via the chat drawer):
 *   collapsible sections — Tone & Model, Knowledge Base, Memory, Stats &
 *   System, Voice.
 *
 * Download progress/state lives in src/services/downloadManager.ts (a
 * module-level store), not component state — this screen (and the whole
 * app) can unmount/remount while a download is in flight and this screen
 * will correctly show it still running when reopened, instead of forgetting
 * about it and risking a second concurrent download to the same file (see
 * that module's doc comment for the bug this fixes).
 */
export function ModelSetupScreen(props: Props) {
  const requiredMode = props.mode === "required";
  const [wizardStep, setWizardStep] = useState<"welcome" | "intro" | "downloading">("welcome");
  const [selectedTier, setSelectedTier] = useState<SetupTier>("standard");
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [activeIds, setActiveIds] = useState<Partial<Record<AssetKind, string>>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<CatalogModel[]>([]);
  const [, forceRender] = useState(0);

  const refreshDiscovered = useCallback(async () => {
    const models = await listDiscoveredModels();
    setDiscoveredModels(models);
    const statuses = await Promise.all(models.map((m) => modelManager.statusOf(m)));
    setPresence((prev) => ({ ...prev, ...Object.fromEntries(statuses.map((s) => [s.asset.id, s.present])) }));
  }, []);

  // Re-render whenever any download's progress changes, so rows reflect
  // live state even if this screen wasn't the one that started it.
  useEffect(() => subscribeDownloads(() => forceRender((n) => n + 1)), []);

  const refreshStatus = useCallback(async () => {
    const statuses = await modelManager.statusAll();
    setPresence(Object.fromEntries(statuses.map((s) => [s.asset.id, s.present])));
    await refreshDiscovered();

    const next: Partial<Record<AssetKind, string>> = {};
    for (const kind of LLM_EMBEDDING_KINDS) {
      const active = await getActiveModelId(kind);
      next[kind] = active ?? MODEL_CATALOG.find((m) => m.kind === kind && m.required)?.id;
    }
    setActiveIds(next);

    return statuses;
  }, [refreshDiscovered]);

  const getRow = useCallback(
    (item: CatalogModel): CatalogRowState => {
      const dl = getDownloadState(item.id);
      return {
        present: presence[item.id] ?? false,
        downloading: isDownloading(item.id),
        progress: dl?.progress ?? 0,
        error: dl?.error ?? null,
      };
    },
    [presence]
  );

  const download = useCallback(
    async (model: CatalogModel) => {
      await startDownload(model);
      await refreshStatus();

      // A corpus pack just landed on disk. In optional (Settings) mode the
      // embedding model is already loaded (ChatScreen mounted before this
      // screen is reachable), so we can merge its docs into the knowledge
      // base right away instead of waiting for the next app launch.
      if (model.kind === "corpus" && !requiredMode && !getDownloadState(model.id)?.error) {
        await seedKnowledgeBaseIfEmpty();
        setToast(`Added "${model.label}" to your offline knowledge base`);
      }
    },
    [requiredMode, refreshStatus]
  );

  const remove = useCallback(
    async (model: CatalogModel) => {
      await modelManager.deleteModel(model);
      if (model.id.startsWith("hf-")) {
        await removeDiscoveredModel(model.id);
      }
      await refreshStatus();
      setToast(`Removed "${model.label}"`);
    },
    [refreshStatus]
  );

  const useModel = useCallback(
    async (model: CatalogModel) => {
      await setActiveModelId(model.kind, model.id);
      await refreshStatus();
      setToast(`Active ${model.kind} model set to "${model.label}"`);
    },
    [refreshStatus]
  );

  const [resetting, setResetting] = useState(false);
  const onRelaunchWizard = !requiredMode ? (props as { onRelaunchWizard?: () => void }).onRelaunchWizard : undefined;

  const confirmClearAllData = useCallback(() => {
    Alert.alert(
      "Clear all data?",
      "This deletes every downloaded model, your custom knowledge bases, and all chat history from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "⚠️ Are you absolutely sure?",
              "This will delete all downloaded models, custom knowledge bases, and chat history. The app will restart into the Setup Wizard. This can't be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear All Data & Reset App",
                  style: "destructive",
                  onPress: async () => {
                    setResetting(true);
                    try {
                      await resetAllAppData();
                      onRelaunchWizard?.();
                    } catch (e: any) {
                      setResetting(false);
                      Alert.alert("Reset failed", e?.message ?? String(e));
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [onRelaunchWizard]);

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

  const requiredReady = tierAssets.every((m) => presence[m.id]);

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

  if (requiredMode) {
    // wizardStep === "downloading"
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Downloading models</Text>
        </View>
        <Text style={styles.subtitle}>
          This needs an internet connection now — the app works fully offline
          from here on once it's done. Keep aoair open in the foreground until
          this finishes — backgrounding the app can interrupt a download.
        </Text>
        <FlatList
          data={tierAssets}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <CatalogItemCard
              item={item}
              row={getRow(item)}
              isActive={item.required || tierCorpusPackIds.includes(item.id)}
              onDownload={download}
              onUse={() => {}}
              onRemove={() => {}}
            />
          )}
        />
        <Pressable
          style={[styles.primaryBtn, !requiredReady && styles.primaryBtnDisabled]}
          disabled={!requiredReady}
          onPress={() => (props as { onReady: () => void }).onReady()}
        >
          <Text style={styles.primaryBtnText}>
            {requiredReady ? "Continue" : "Waiting for downloads…"}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Optional mode: collapsible Settings screen.
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Pressable onPress={(props as { onClose: () => void }).onClose} hitSlop={8}>
          <Text style={styles.closeBtn}>Close</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.accordionScroll}>
        <AccordionSection icon="🤖" title="Tone & Model" defaultOpen>
          <PersonalitySettings />
          <Text style={styles.sectionHeading}>Generation model</Text>
          <FlatList
            data={[...MODEL_CATALOG.filter((m) => m.kind === "llm" || m.kind === "embedding"), ...discoveredModels]}
            keyExtractor={(m) => m.id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <CatalogItemCard
                item={item}
                row={getRow(item)}
                isActive={activeIds[item.kind] === item.id}
                onDownload={download}
                onUse={useModel}
                onRemove={remove}
              />
            )}
          />
          <Text style={styles.sectionHeading}>Find more models</Text>
          <View style={styles.list}>
            <ModelBrowser onAdded={refreshDiscovered} />
          </View>
        </AccordionSection>

        <AccordionSection icon="📦" title="Knowledge Base">
          <CorpusSettingsTab
            corpusItems={CORPUS_CATALOG}
            getRow={getRow}
            download={download}
            remove={remove}
          />
        </AccordionSection>

        <AccordionSection icon="💾" title="Memory">
          <MemorySettings />
        </AccordionSection>

        <AccordionSection icon="⚡" title="Stats & System">
          <UsageStatsContent />
        </AccordionSection>

        <AccordionSection icon="🎙️" title="Voice">
          <VoiceSettings />
        </AccordionSection>

        <AccordionSection icon="🧰" title="App">
          <Pressable
            style={styles.wizardBtn}
            onPress={() => onRelaunchWizard?.()}
            disabled={!onRelaunchWizard}
          >
            <Text style={styles.wizardBtnText}>🪄 Re-run Setup Wizard</Text>
          </Pressable>
          <Text style={styles.hint}>
            Switch model tiers or re-download the default models/knowledge base
            from scratch.
          </Text>

          <Text style={styles.dangerHeading}>Danger Zone</Text>
          <Pressable
            style={[styles.dangerBtn, resetting && styles.dangerBtnDisabled]}
            onPress={confirmClearAllData}
            disabled={resetting}
          >
            <Text style={styles.dangerBtnText}>
              {resetting ? "Clearing…" : "🚨 Clear All Data & Reset App"}
            </Text>
          </Pressable>
          <Text style={styles.hint}>
            Deletes all downloaded models, custom knowledge bases, and chat history,
            then restarts into the Setup Wizard.
          </Text>
        </AccordionSection>
      </ScrollView>

      <Toast message={toast} onHide={() => setToast(null)} />
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
  accordionScroll: { paddingBottom: 24 },
  closeBtn: { color: "#8bf", fontSize: 14 },
  subtitle: { color: "#999", fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 },
  sectionHeading: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    marginHorizontal: 12,
    marginTop: 4,
  },
  list: { padding: 12, gap: 10 },
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
  wizardBtn: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: "rgba(139,92,246,0.15)",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  wizardBtnText: { color: "#c9a8ff", fontWeight: "700", fontSize: 14 },
  hint: { color: "#888", fontSize: 11, marginHorizontal: 12, marginTop: 6, lineHeight: 16 },
  dangerHeading: {
    color: "#e05a5a",
    fontSize: 13,
    fontWeight: "700",
    marginHorizontal: 12,
    marginTop: 20,
  },
  dangerBtn: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: "rgba(224,90,90,0.15)",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(224,90,90,0.4)",
  },
  dangerBtnDisabled: { opacity: 0.5 },
  dangerBtnText: { color: "#f2a5a5", fontWeight: "700", fontSize: 14 },
});
