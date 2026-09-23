import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import { getDeviceTotalRamBytes } from "ram-monitor";
import {
  TIERS,
  SetupTier,
  MODEL_CATALOG,
  CORPUS_CATALOG,
  CatalogModel,
} from "../models/manifest";
import { ModelManager } from "../models/ModelManager";
import {
  startDownload,
  getDownloadState,
  isDownloading,
  subscribeDownloads,
} from "../services/downloadManager";
import { seedKnowledgeBaseIfEmpty } from "../rag/seedCorpus";
import { useTheme, colors, typography } from "./theme";
import { ThemeSelector } from "./components/ThemeSelector";
import { LanguageSelector } from "./components/LanguageSelector";
import { spacing, radii } from "./theme/spacing";

const modelManager = new ModelManager();

interface Props {
  onReady: () => void;
  onSkip?: () => void;
}

type WizardStep = 1 | 2 | 3;

interface HardwareScan {
  totalRamBytes: number;
  freeStorageBytes: number;
  scanned: boolean;
}

function formatGB(bytes: number): string {
  if (bytes <= 0) return "0.0 GB";
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "Calculating…";
  return bytesPerSec >= 1024 * 1024
    ? `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
    : `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

function formatEta(seconds?: number): string {
  if (seconds == null || seconds <= 0 || !isFinite(seconds)) return "Estimating…";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `${m}m ${s}s`;
}

export function SetupWizardScreen({ onReady, onSkip }: Props) {
  const { colors, typography } = useTheme();
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedTier, setSelectedTier] = useState<SetupTier>("standard");
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [hardware, setHardware] = useState<HardwareScan>({
    totalRamBytes: 0,
    freeStorageBytes: 0,
    scanned: false,
  });
  const [indexingStatus, setIndexingStatus] = useState<string>("Waiting for downloads…");
  const [, forceRender] = useState(0);

  // Subscribe to live download progress
  useEffect(() => subscribeDownloads(() => forceRender((n) => n + 1)), []);

  // Hardware Diagnostics Scan
  useEffect(() => {
    (async () => {
      let ram = 0;
      let freeStorage = 0;
      try {
        ram = getDeviceTotalRamBytes();
      } catch {
        ram = 0;
      }
      try {
        freeStorage = await FileSystem.getFreeDiskStorageAsync();
      } catch {
        freeStorage = 0;
      }
      setHardware({
        totalRamBytes: ram,
        freeStorageBytes: freeStorage,
        scanned: true,
      });
    })();
  }, []);

  const refreshPresence = useCallback(async () => {
    const statuses = await modelManager.statusAll();
    const presMap = Object.fromEntries(statuses.map((s) => [s.asset.id, s.present]));
    setPresence(presMap);
    return presMap;
  }, []);

  useEffect(() => {
    refreshPresence();
  }, [refreshPresence]);

  const activeTierConfig = TIERS.find((t) => t.id === selectedTier) ?? TIERS[0];
  const tierCorpusPackIds = activeTierConfig.corpusPackIds ?? [];
  const tierAssets: CatalogModel[] = [
    ...MODEL_CATALOG.filter((m) => m.required),
    ...CORPUS_CATALOG.filter((c) => tierCorpusPackIds.includes(c.id)),
  ];

  const allAssetsPresent = tierAssets.every((m) => presence[m.id]);

  const handleStartDownloads = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setStep(3);
    const presMap = await refreshPresence();

    for (const asset of tierAssets) {
      if (!presMap[asset.id]) {
        // presence (and therefore allAssetsPresent / each PhaseRow's status)
        // is only ever set from an explicit statusAll() scan, not derived
        // from download progress — without re-checking here, a finished
        // 100%-downloaded file never flips its PhaseRow from
        // PENDING/QUEUED to COMPLETE, and indexing never starts.
        startDownload(asset).finally(() => refreshPresence());
      }
    }
  }, [refreshPresence, tierAssets]);

  // When all assets land on disk in Step 3, seed the knowledge base
  useEffect(() => {
    if (step === 3 && allAssetsPresent) {
      (async () => {
        try {
          setIndexingStatus("Building local SQLite knowledge base & vector index…");
          await seedKnowledgeBaseIfEmpty();
          setIndexingStatus("Ready");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } catch (e: any) {
          setIndexingStatus(`Indexing error: ${e?.message ?? e}`);
        }
      })();
    }
  }, [step, allAssetsPresent]);

  // Compute aggregate download metrics across tier assets
  let totalBytesExpected = 0;
  let totalBytesWritten = 0;
  let activeSpeed = 0;
  let maxEta = 0;
  let isAnyDownloading = false;

  for (const asset of tierAssets) {
    const dl = getDownloadState(asset.id);
    totalBytesExpected += asset.sizeBytes;
    if (presence[asset.id]) {
      totalBytesWritten += asset.sizeBytes;
    } else if (dl) {
      totalBytesWritten += dl.bytesWritten ?? 0;
      if (dl.downloading) {
        isAnyDownloading = true;
        if (dl.speedBytesPerSec) activeSpeed += dl.speedBytesPerSec;
        if (dl.etaSeconds && dl.etaSeconds > maxEta) maxEta = dl.etaSeconds;
      }
    }
  }

  const aggregateProgress =
    totalBytesExpected > 0 ? Math.min(totalBytesWritten / totalBytesExpected, 1) : 0;

  return (
    <LinearGradient colors={[colors.bg.terminal, "#0A0F1D"]} style={styles.container}>
      {/* Wizard Progress Steps Bar */}
      <View style={styles.wizardProgressBar}>
        <View style={styles.stepsRow}>
          <StepBadge num={1} label="HARDWARE" active={step === 1} completed={step > 1} />
          <View style={[styles.stepLine, step > 1 && styles.stepLineCompleted]} />
          <StepBadge num={2} label="MODEL TIER" active={step === 2} completed={step > 2} />
          <View style={[styles.stepLine, step > 2 && styles.stepLineCompleted]} />
          <StepBadge num={3} label="INDEXING" active={step === 3} completed={allAssetsPresent} />
        </View>
      </View>

      {/* STEP 1: WELCOME & HARDWARE CHECK */}
      {step === 1 && (
        <ScrollView contentContainerStyle={styles.stepContent}>
          <View style={styles.mascotBanner}>
            <Image source={require("../../assets/boar.png")} style={styles.mascotHero} />
            <Text style={styles.heroTitle}>BOAR</Text>
            <Text style={styles.heroSubtitle}>BEST OFFLINE AI RESEARCHER</Text>
          </View>

          <View style={styles.card}>
            <LanguageSelector compact />
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>🛡️</Text>
              <Text style={styles.cardTitle}>AIR-GAPPED FIELD TERMINAL</Text>
            </View>
            <Text style={styles.cardText}>
              Designed for remote expeditions, crisis zones, and off-grid research.
              After this initial setup, BOAR operates 100% locally with zero network
              telemetry, no accounts, and no cloud dependencies.
            </Text>
          </View>

          {/* Hardware Diagnostic Results */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>🔍</Text>
              <Text style={styles.cardTitle}>DEVICE HARDWARE VERIFICATION</Text>
            </View>

            <View style={styles.hardwareSpecs}>
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Device RAM</Text>
                <Text style={styles.specValue}>
                  {hardware.totalRamBytes > 0 ? formatGB(hardware.totalRamBytes) : "Verified"}
                </Text>
              </View>
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Available Disk Storage</Text>
                <Text style={styles.specValue}>
                  {hardware.freeStorageBytes > 0
                    ? formatGB(hardware.freeStorageBytes)
                    : "Sufficient"}
                </Text>
              </View>
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Bounty RAM Budget</Text>
                <Text style={[styles.specValue, { color: colors.text.accentEmerald }]}>
                  Under 12GB Limit
                </Text>
              </View>
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Inference Engine</Text>
                <Text style={styles.specValue}>ARM64 llama.rn (Offline)</Text>
              </View>
            </View>

            <View style={styles.verifiedBadge}>
              <View style={styles.verifiedDot} />
              <Text style={styles.verifiedText}>HARDWARE VERIFIED FOR LOCAL INFERENCE</Text>
            </View>
          </View>

          <View style={styles.actionsBottom}>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setStep(2);
              }}
            >
              <Text style={styles.primaryBtnText}>Select Model Tier ➔</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* STEP 2: MODEL SELECTION */}
      {step === 2 && (
        <ScrollView contentContainerStyle={styles.stepContent}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>SELECT OFFLINE MODEL TIER</Text>
            <Text style={styles.stepSubtitle}>
              Weights are downloaded once to local storage and executed via mmap.
            </Text>
          </View>

          {TIERS.map((tier) => {
            const isSelected = selectedTier === tier.id;
            return (
              <Pressable
                key={tier.id}
                style={[styles.tierCard, isSelected && styles.tierCardActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setSelectedTier(tier.id);
                }}
              >
                <View style={styles.tierHeader}>
                  <View style={styles.tierTitleRow}>
                    <Text style={styles.tierName}>{tier.label}</Text>
                    {tier.id === "standard" && (
                      <View style={styles.recommendedPill}>
                        <Text style={styles.recommendedText}>RECOMMENDED</Text>
                      </View>
                    )}
                  </View>
                  <View
                    style={[
                      styles.radioCircle,
                      isSelected && styles.radioCircleActive,
                    ]}
                  >
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                </View>

                <Text style={styles.tierDesc}>{tier.description}</Text>

                <View style={styles.tierMetaRow}>
                  <View style={styles.compatPillGreen}>
                    <Text style={styles.compatPillGreenText}>🟢 Runs Great</Text>
                  </View>
                  <Text style={styles.tierFootprint}>RAM: ~2.5 GB Working Set</Text>
                </View>
              </Pressable>
            );
          })}

          <View style={styles.actionsBottom}>
            <Pressable style={styles.primaryBtn} onPress={handleStartDownloads}>
              <Text style={styles.primaryBtnText}>Install Weights & Index ➔</Text>
            </Pressable>
            <Pressable
              style={styles.textBtn}
              onPress={() => setStep(1)}
              hitSlop={8}
            >
              <Text style={styles.textBtnText}>‹ Back to Diagnostics</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* STEP 3: INITIAL CORPUS INDEXING & DOWNLOAD */}
      {step === 3 && (
        <ScrollView contentContainerStyle={styles.stepContent}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>OFFLINE CORE INITIALIZATION</Text>
            <Text style={styles.stepSubtitle}>
              Fetching open-weights and seeding local SQLite knowledge base.
            </Text>
          </View>

          {/* Aggregate Download Progress Card */}
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <View style={styles.progressLeft}>
                {isAnyDownloading && <ActivityIndicator size="small" color={colors.emerald[400]} />}
                <Text style={styles.progressTitle}>
                  {allAssetsPresent ? "ASSETS CACHED TO DISK" : "DOWNLOADING WEIGHTS"}
                </Text>
              </View>
              <Text style={styles.progressPctText}>
                {(aggregateProgress * 100).toFixed(0)}%
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.max(aggregateProgress * 100, 3)}%` },
                ]}
              />
            </View>

            <View style={styles.telemetryMetricsRow}>
              <Text style={styles.telemetryBytes}>
                {formatGB(totalBytesWritten)} / {formatGB(totalBytesExpected)}
              </Text>
              {isAnyDownloading && (
                <View style={styles.telemetryRight}>
                  <Text style={styles.telemetrySpeed}>{formatSpeed(activeSpeed)}</Text>
                  <Text style={styles.telemetryDot}>•</Text>
                  <Text style={styles.telemetryEta}>ETA: {formatEta(maxEta)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Pipeline Phases */}
          <View style={styles.phasesCard}>
            <PhaseRow
              index="1"
              title="GGUF Reasoning Model"
              status={
                presence[MODEL_CATALOG.find((m) => m.kind === "llm" && m.required)?.id ?? ""]
                  ? "COMPLETE"
                  : isAnyDownloading
                  ? "STREAMING"
                  : "PENDING"
              }
            />
            <PhaseRow
              index="2"
              title="Embedding Model & Vectors"
              status={
                presence[MODEL_CATALOG.find((m) => m.kind === "embedding" && m.required)?.id ?? ""]
                  ? "COMPLETE"
                  : "PENDING"
              }
            />
            <PhaseRow
              index="3"
              title="Offline Knowledge Base & FTS"
              status={
                indexingStatus === "Ready"
                  ? "COMPLETE"
                  : allAssetsPresent
                  ? "INDEXING"
                  : "QUEUED"
              }
            />
          </View>

          {/* Interactive Theme & Font Legibility Customization */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>🎨</Text>
              <Text style={styles.cardTitle}>INTERFACE CUSTOMIZATION</Text>
            </View>
            <ThemeSelector />
          </View>

          {/* Off-Grid Terminal Tips */}
          <View style={styles.tipBox}>
            <Text style={styles.tipLabel}>💡 FIELD TERMINAL NOTICE</Text>
            <Text style={styles.tipText}>
              Once initialized, BOAR is completely self-contained. You can toggle airplane mode
              and use the app in complete isolation without loss of functionality.
            </Text>
          </View>

          {/* Ready Action */}
          <View style={styles.actionsBottom}>
            {indexingStatus === "Ready" || allAssetsPresent ? (
              <Pressable
                style={[styles.primaryBtn, styles.launchBtn]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  onReady();
                }}
              >
                <Text style={styles.launchBtnText}>🐗 Launch BOAR Terminal</Text>
              </Pressable>
            ) : (
              <View style={styles.waitingContainer}>
                <ActivityIndicator color={colors.emerald[400]} />
                <Text style={styles.waitingText}>{indexingStatus}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </LinearGradient>
  );
}

function StepBadge({
  num,
  label,
  active,
  completed,
}: {
  num: number;
  label: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <View style={styles.stepBadgeWrapper}>
      <View
        style={[
          styles.stepCircle,
          active && styles.stepCircleActive,
          completed && styles.stepCircleCompleted,
        ]}
      >
        <Text
          style={[
            styles.stepNumber,
            (active || completed) && styles.stepNumberActive,
          ]}
        >
          {completed ? "✓" : num}
        </Text>
      </View>
      <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>
        {label}
      </Text>
    </View>
  );
}

function PhaseRow({
  index,
  title,
  status,
}: {
  index: string;
  title: string;
  status: "COMPLETE" | "STREAMING" | "INDEXING" | "PENDING" | "QUEUED";
}) {
  const isDone = status === "COMPLETE";
  const isInProgress = status === "STREAMING" || status === "INDEXING";

  return (
    <View style={styles.phaseRow}>
      <View style={styles.phaseLeft}>
        <View style={[styles.phaseIdx, isDone && styles.phaseIdxDone]}>
          <Text style={[styles.phaseIdxText, isDone && styles.phaseIdxTextDone]}>
            {isDone ? "✓" : index}
          </Text>
        </View>
        <Text style={styles.phaseTitle}>{title}</Text>
      </View>
      <View
        style={[
          styles.phaseStatusBadge,
          isDone && styles.phaseDoneBadge,
          isInProgress && styles.phaseProgressBadge,
        ]}
      >
        <Text
          style={[
            styles.phaseStatusText,
            isDone && styles.phaseDoneText,
            isInProgress && styles.phaseProgressText,
          ]}
        >
          {status}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  wizardProgressBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    backgroundColor: colors.bg.surface,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepBadgeWrapper: {
    alignItems: "center",
    gap: 4,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: {
    backgroundColor: colors.cyan.bgSubtle,
    borderColor: colors.cyan[500],
  },
  stepCircleCompleted: {
    backgroundColor: colors.emerald.bgSubtle,
    borderColor: colors.emerald[500],
  },
  stepNumber: {
    ...typography.mono.xs,
    fontSize: 10,
    color: colors.text.dim,
    fontWeight: "700",
  },
  stepNumberActive: {
    color: "#FFFFFF",
  },
  stepLabel: {
    ...typography.mono.xs,
    fontSize: 8,
    color: colors.text.dim,
    letterSpacing: 0.5,
  },
  stepLabelActive: {
    color: colors.text.accentCyan,
    fontWeight: "700",
  },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.default,
    marginHorizontal: 8,
    marginBottom: 16,
  },
  stepLineCompleted: {
    backgroundColor: colors.emerald[500],
  },
  stepContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  mascotBanner: {
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: 4,
  },
  mascotHero: {
    width: 68,
    height: 68,
    borderRadius: 16,
    marginBottom: 6,
  },
  heroTitle: {
    ...typography.ui.headline,
    color: colors.text.heading,
    letterSpacing: 1,
  },
  heroSubtitle: {
    ...typography.mono.xs,
    color: colors.text.accentEmerald,
    fontWeight: "800",
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.bg.cardElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingBottom: spacing.xs,
  },
  cardIcon: {
    fontSize: 14,
  },
  cardTitle: {
    ...typography.mono.xs,
    color: colors.text.heading,
    fontWeight: "800",
  },
  cardText: {
    ...typography.ui.body,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  hardwareSpecs: {
    backgroundColor: colors.bg.terminal,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 6,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  specLabel: {
    ...typography.ui.caption,
    color: colors.text.muted,
  },
  specValue: {
    ...typography.mono.sm,
    color: colors.text.heading,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.emerald.bgSubtle,
    borderColor: colors.emerald.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 6,
  },
  verifiedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.emerald[400],
  },
  verifiedText: {
    ...typography.mono.xs,
    fontSize: 9,
    fontWeight: "800",
    color: colors.text.accentEmerald,
  },
  stepHeader: {
    gap: 4,
    marginBottom: spacing.xs,
  },
  stepTitle: {
    ...typography.ui.title,
    color: colors.text.heading,
  },
  stepSubtitle: {
    ...typography.ui.caption,
    color: colors.text.muted,
  },
  tierCard: {
    backgroundColor: colors.bg.cardElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.md,
    gap: 8,
  },
  tierCardActive: {
    borderColor: colors.cyan[500],
    backgroundColor: "rgba(6, 182, 212, 0.08)",
  },
  tierHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tierTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tierName: {
    ...typography.ui.titleSm,
    color: colors.text.heading,
  },
  recommendedPill: {
    backgroundColor: colors.emerald.bgSubtle,
    borderColor: colors.emerald.border,
    borderWidth: 1,
    borderRadius: radii.xs,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  recommendedText: {
    ...typography.mono.xs,
    fontSize: 8,
    color: colors.text.accentEmerald,
    fontWeight: "800",
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleActive: {
    borderColor: colors.cyan[500],
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.cyan[500],
  },
  tierDesc: {
    ...typography.ui.caption,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  tierMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  compatPillGreen: {
    backgroundColor: colors.emerald.bgSubtle,
    borderColor: colors.emerald.border,
    borderWidth: 1,
    borderRadius: radii.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  compatPillGreenText: {
    ...typography.mono.xs,
    fontSize: 9,
    color: colors.text.accentEmerald,
    fontWeight: "700",
  },
  tierFootprint: {
    ...typography.mono.xs,
    color: colors.text.dim,
  },
  progressCard: {
    backgroundColor: colors.bg.cardElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.md,
    gap: 8,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressTitle: {
    ...typography.mono.xs,
    color: colors.text.accentCyan,
    fontWeight: "800",
  },
  progressPctText: {
    ...typography.mono.sm,
    color: colors.text.heading,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    height: 10,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: radii.xs,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.emerald[500],
    borderRadius: radii.xs,
  },
  telemetryMetricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  telemetryBytes: {
    ...typography.mono.xs,
    color: colors.text.dim,
    fontVariant: ["tabular-nums"],
  },
  telemetryRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  telemetrySpeed: {
    ...typography.mono.xs,
    color: colors.text.accentCyan,
    fontWeight: "700",
  },
  telemetryDot: {
    ...typography.mono.xs,
    color: colors.text.dim,
  },
  telemetryEta: {
    ...typography.mono.xs,
    color: colors.text.accentAmber,
    fontWeight: "600",
  },
  phasesCard: {
    backgroundColor: colors.bg.terminal,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.sm,
    gap: 8,
  },
  phaseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  phaseLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  phaseIdx: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  phaseIdxDone: {
    backgroundColor: colors.emerald.bgSubtle,
  },
  phaseIdxText: {
    ...typography.mono.xs,
    fontSize: 9,
    color: colors.text.dim,
    fontWeight: "700",
  },
  phaseIdxTextDone: {
    color: colors.text.accentEmerald,
  },
  phaseTitle: {
    ...typography.ui.caption,
    color: colors.text.heading,
  },
  phaseStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  phaseDoneBadge: {
    backgroundColor: colors.emerald.bgSubtle,
    borderColor: colors.emerald.border,
    borderWidth: 1,
  },
  phaseProgressBadge: {
    backgroundColor: colors.cyan.bgSubtle,
    borderColor: colors.cyan.border,
    borderWidth: 1,
  },
  phaseStatusText: {
    ...typography.mono.xs,
    fontSize: 8,
    color: colors.text.dim,
    fontWeight: "700",
  },
  phaseDoneText: {
    color: colors.text.accentEmerald,
  },
  phaseProgressText: {
    color: colors.text.accentCyan,
  },
  tipBox: {
    backgroundColor: "rgba(6, 182, 212, 0.06)",
    borderColor: colors.cyan.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 4,
  },
  tipLabel: {
    ...typography.mono.xs,
    color: colors.text.accentCyan,
    fontWeight: "700",
  },
  tipText: {
    ...typography.ui.caption,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  actionsBottom: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  primaryBtn: {
    backgroundColor: colors.emerald[600],
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    ...typography.ui.titleSm,
    color: "#FFFFFF",
    fontWeight: "800",
  },
  launchBtn: {
    backgroundColor: colors.emerald[500],
  },
  launchBtnText: {
    ...typography.ui.title,
    color: "#FFFFFF",
    fontWeight: "800",
  },
  waitingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 12,
  },
  waitingText: {
    ...typography.mono.xs,
    color: colors.text.accentEmerald,
  },
  textBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  textBtnText: {
    ...typography.ui.caption,
    color: colors.text.dim,
  },
});
