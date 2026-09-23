import React from "react";
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "./theme/colors";
import { typography } from "./theme/typography";
import { spacing, radii } from "./theme/spacing";

interface Props {
  toneIcon: string;
  deepResearchActive: boolean;
  liveTokPerSec: number | null;
  activeModelLabel?: string;
  onOpenDrawer: () => void;
  onCycleTone: () => void;
  onNewChat: () => void;
  onToggleDeepResearch?: () => void;
}

/**
 * ChatHeader: Polished Field Terminal & Frontier AI top bar.
 * Showcases 🐗 BOAR mascot, offline local engine status,
 * dynamic frontier glow when Deep Research is engaged,
 * live tok/s telemetry, and quick-action controls.
 */
export function ChatHeader({
  toneIcon,
  deepResearchActive,
  liveTokPerSec,
  activeModelLabel,
  onOpenDrawer,
  onCycleTone,
  onNewChat,
  onToggleDeepResearch,
}: Props) {
  const handlePress = (callback: () => void, feedback = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(feedback).catch(() => {});
    callback();
  };

  return (
    <View
      style={[
        styles.headerContainer,
        deepResearchActive && styles.headerContainerDeepResearch,
      ]}
    >
      <View style={styles.topRow}>
        {/* Drawer Hamburger */}
        <Pressable
          style={styles.iconBtn}
          onPress={() => handlePress(onOpenDrawer)}
          hitSlop={10}
          accessibilityLabel="Open Navigation Drawer"
        >
          <Text style={styles.hamburgerIcon}>☰</Text>
        </Pressable>

        {/* Brand & Mascot */}
        <View style={styles.brandContainer}>
          <Image
            source={require("../../assets/boar.png")}
            style={styles.mascotImg}
            resizeMode="contain"
          />
          <View style={styles.titleColumn}>
            <View style={styles.titleRow}>
              <Text style={styles.titleText}>BOAR</Text>
              <View style={styles.offlineStatusPill}>
                <View style={styles.offlineDot} />
                <Text style={styles.offlineText}>OFFLINE</Text>
              </View>
            </View>
            <Text style={styles.modelPillText} numberOfLines={1}>
              {activeModelLabel ? activeModelLabel.toUpperCase() : "LOCAL LLM CORE"}
            </Text>
          </View>
        </View>

        {/* Right Action Controls */}
        <View style={styles.rightActions}>
          {/* Tone Selector Pill */}
          <Pressable
            style={styles.tonePill}
            onPress={() => handlePress(onCycleTone)}
            hitSlop={6}
            accessibilityLabel="Cycle Assistant Tone"
          >
            <Text style={styles.tonePillEmoji}>{toneIcon}</Text>
          </Pressable>

          {/* New Chat Button */}
          <Pressable
            style={styles.newChatBtn}
            onPress={() => handlePress(onNewChat, Haptics.ImpactFeedbackStyle.Medium)}
            hitSlop={6}
            accessibilityLabel="New Chat Session"
          >
            <Text style={styles.newChatIcon}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* Sub-bar: Telemetry & Deep Research Indicator / Toggle */}
      <View style={styles.subBar}>
        {onToggleDeepResearch ? (
          <Pressable
            style={[
              styles.deepResearchPill,
              deepResearchActive && styles.deepResearchPillActive,
            ]}
            onPress={() => handlePress(onToggleDeepResearch, Haptics.ImpactFeedbackStyle.Medium)}
            hitSlop={6}
          >
            <Text style={styles.deepResearchIcon}>🔬</Text>
            <Text
              style={[
                styles.deepResearchText,
                deepResearchActive && styles.deepResearchTextActive,
              ]}
            >
              Deep Research
            </Text>
            <View
              style={[
                styles.deepResearchStatusIndicator,
                deepResearchActive && styles.deepResearchStatusIndicatorActive,
              ]}
            />
          </Pressable>
        ) : deepResearchActive ? (
          <View style={[styles.deepResearchPill, styles.deepResearchPillActive]}>
            <Text style={styles.deepResearchIcon}>🔬</Text>
            <Text style={[styles.deepResearchText, styles.deepResearchTextActive]}>
              Deep Research Active
            </Text>
          </View>
        ) : null}

        {/* Live Inference Telemetry Counter */}
        {liveTokPerSec != null && (
          <View style={styles.telemetryBadge}>
            <Text style={styles.telemetryPulseDot}>●</Text>
            <Text style={styles.telemetryText}>
              {liveTokPerSec.toFixed(1)} <Text style={styles.telemetryUnit}>tok/s</Text>
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: colors.bg.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
  },
  headerContainerDeepResearch: {
    backgroundColor: "#111028",
    borderBottomColor: colors.border.frontier,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    padding: 6,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  hamburgerIcon: {
    color: colors.text.heading,
    fontSize: 18,
    fontWeight: "700",
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginLeft: 8,
  },
  mascotImg: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  titleColumn: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  titleText: {
    ...typography.ui.title,
    color: colors.text.heading,
    letterSpacing: 0.5,
  },
  offlineStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.emerald.bgSubtle,
    borderColor: colors.emerald.border,
    borderWidth: 1,
    borderRadius: radii.xs,
    paddingHorizontal: 5,
    paddingVertical: 1,
    gap: 3,
  },
  offlineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.emerald[400],
  },
  offlineText: {
    ...typography.mono.xs,
    fontSize: 8,
    fontWeight: "800",
    color: colors.text.accentEmerald,
  },
  modelPillText: {
    ...typography.mono.xs,
    color: colors.text.dim,
    marginTop: 1,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tonePill: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderColor: colors.border.subtle,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  tonePillEmoji: {
    fontSize: 14,
  },
  newChatBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.emerald.bgSubtle,
    borderColor: colors.emerald.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  newChatIcon: {
    color: colors.text.accentEmerald,
    fontSize: 18,
    fontWeight: "700",
    marginTop: -1,
  },
  subBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deepResearchPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: colors.border.subtle,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  deepResearchPillActive: {
    backgroundColor: colors.frontier.badgeBg,
    borderColor: colors.frontier.badgeBorder,
  },
  deepResearchIcon: {
    fontSize: 11,
  },
  deepResearchText: {
    ...typography.mono.xs,
    color: colors.text.muted,
    fontWeight: "600",
  },
  deepResearchTextActive: {
    color: colors.frontier.text,
    fontWeight: "700",
  },
  deepResearchStatusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text.dim,
  },
  deepResearchStatusIndicatorActive: {
    backgroundColor: colors.frontier.glow,
  },
  telemetryBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(6, 182, 212, 0.12)",
    borderColor: colors.cyan.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
    marginLeft: "auto",
  },
  telemetryPulseDot: {
    color: colors.cyan[400],
    fontSize: 8,
  },
  telemetryText: {
    ...typography.mono.xs,
    color: colors.text.accentCyan,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  telemetryUnit: {
    color: colors.text.muted,
    fontWeight: "500",
  },
});
