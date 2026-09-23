import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii } from "../theme/spacing";

interface Diagnosis {
  title: string;
  category: "memory" | "corrupt" | "missing" | "general";
  detail: string;
  recommendation: string;
}

function diagnose(error: string): Diagnosis {
  const lower = error.toLowerCase();
  if (lower.includes("size mismatch") || lower.includes("verification") || lower.includes("hash")) {
    return {
      title: "Integrity Check Failed",
      category: "corrupt",
      detail: "The downloaded model file is truncated or corrupted (likely due to background network interruption).",
      recommendation: "Re-download the model file cleanly or switch to a cached model in Settings.",
    };
  }
  if (lower.includes("not found") || lower.includes("no such file")) {
    return {
      title: "Model Asset Missing",
      category: "missing",
      detail: "The designated GGUF model binary is not present in local device storage.",
      recommendation: "Relaunch the Setup Wizard or select an installed model from the catalog.",
    };
  }
  if (lower.includes("memory") || lower.includes("oom") || lower.includes("allocate") || lower.includes("ram")) {
    return {
      title: "Hardware RAM Exceeded",
      category: "memory",
      detail: "Insufficient resident memory to mmap the GGUF model weights and initialize KV cache.",
      recommendation: "Close background apps or switch to a lighter model (e.g., Compact 1.2GB) in Settings.",
    };
  }
  return {
    title: "Engine Initialization Halted",
    category: "general",
    detail: error || "Llama.rn engine failed to bind to the local GGUF context.",
    recommendation: "Review model settings or re-run the Setup Wizard to restore defaults.",
  };
}

export interface ModelLoadErrorCardProps {
  error: string;
  onOpenSettings?: () => void;
  onRelaunchWizard?: () => void;
  onRetry?: () => void;
}

export function ModelLoadErrorCard({
  error,
  onOpenSettings,
  onRelaunchWizard,
  onRetry,
}: ModelLoadErrorCardProps) {
  const diagnosis = diagnose(error);

  const handleAction = (callback?: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    callback?.();
  };

  const isMemory = diagnosis.category === "memory";

  return (
    <View style={[styles.container, isMemory ? styles.amberBorder : styles.dangerBorder]}>
      {/* Terminal Title Bar */}
      <View style={styles.header}>
        <View style={styles.badgeRow}>
          <Text style={styles.icon}>{isMemory ? "⚡" : "⚠️"}</Text>
          <Text style={[styles.badgeText, isMemory ? styles.badgeTextAmber : styles.badgeTextDanger]}>
            {diagnosis.title.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.codeTag}>ERR_LOCAL_INIT</Text>
      </View>

      {/* Diagnostic Message */}
      <View style={styles.body}>
        <Text style={styles.detailText}>{diagnosis.detail}</Text>
        <View style={styles.recommendationBox}>
          <Text style={styles.recommendationLabel}>ACTION REQUIRED</Text>
          <Text style={styles.recommendationText}>{diagnosis.recommendation}</Text>
        </View>
      </View>

      {/* Action Shortcuts */}
      <View style={styles.actionsRow}>
        {onRetry && (
          <Pressable
            style={styles.retryBtn}
            onPress={() => handleAction(onRetry)}
            android_ripple={{ color: "rgba(255,255,255,0.1)" }}
          >
            <Text style={styles.retryBtnText}>🔄 Retry</Text>
          </Pressable>
        )}
        {onOpenSettings && (
          <Pressable
            style={styles.actionBtn}
            onPress={() => handleAction(onOpenSettings)}
            android_ripple={{ color: "rgba(255,255,255,0.1)" }}
          >
            <Text style={styles.actionBtnText}>⚙️ Settings</Text>
          </Pressable>
        )}
        {onRelaunchWizard && (
          <Pressable
            style={[styles.actionBtn, styles.wizardBtn]}
            onPress={() => handleAction(onRelaunchWizard)}
            android_ripple={{ color: "rgba(6,182,212,0.2)" }}
          >
            <Text style={styles.wizardBtnText}>🪄 Setup Wizard</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bg.cardElevated,
    borderWidth: 1,
    gap: spacing.sm,
  },
  amberBorder: {
    borderColor: colors.border.amber,
    backgroundColor: "rgba(245, 158, 11, 0.06)",
  },
  dangerBorder: {
    borderColor: colors.border.danger,
    backgroundColor: "rgba(239, 68, 68, 0.06)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingBottom: spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  icon: {
    fontSize: 16,
  },
  badgeText: {
    ...typography.ui.titleSm,
    letterSpacing: 0.5,
  },
  badgeTextAmber: {
    color: colors.text.accentAmber,
  },
  badgeTextDanger: {
    color: colors.crimson[400],
  },
  codeTag: {
    ...typography.mono.xs,
    color: colors.text.dim,
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  body: {
    gap: spacing.xs,
  },
  detailText: {
    ...typography.ui.body,
    color: colors.text.primary,
    lineHeight: 20,
  },
  recommendationBox: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: radii.sm,
    padding: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.cyan[500],
    marginTop: 4,
    gap: 2,
  },
  recommendationLabel: {
    ...typography.mono.xs,
    color: colors.text.accentCyan,
    fontWeight: "700",
  },
  recommendationText: {
    ...typography.ui.caption,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  retryBtn: {
    flex: 1,
    backgroundColor: colors.emerald.bgSubtle,
    borderColor: colors.emerald.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  retryBtnText: {
    ...typography.ui.titleSm,
    color: colors.text.accentEmerald,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderColor: colors.border.default,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    ...typography.ui.titleSm,
    color: colors.text.heading,
  },
  wizardBtn: {
    backgroundColor: colors.cyan.bgSubtle,
    borderColor: colors.cyan.border,
  },
  wizardBtnText: {
    ...typography.ui.titleSm,
    color: colors.text.accentCyan,
  },
});
