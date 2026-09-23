import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

interface Props {
  toneIcon: string;
  deepResearchActive: boolean;
  liveTokPerSec: number | null;
  onOpenDrawer: () => void;
  onCycleTone: () => void;
  onNewChat: () => void;
}

/** Chat screen's top bar: hamburger, BOAR branding, tone/status badges, new-chat button. */
export function ChatHeader({
  toneIcon,
  deepResearchActive,
  liveTokPerSec,
  onOpenDrawer,
  onCycleTone,
  onNewChat,
}: Props) {
  return (
    <View style={styles.headerRow}>
      <Pressable style={styles.hamburgerBtn} onPress={onOpenDrawer} hitSlop={8}>
        <Text style={styles.hamburgerIcon}>☰</Text>
      </Pressable>

      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          🐗 BOAR
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Offline AI Research Assistant
        </Text>
      </View>

      <Pressable style={styles.tonePill} onPress={onCycleTone} hitSlop={8}>
        <Text style={styles.tonePillText}>{toneIcon}</Text>
      </Pressable>
      {deepResearchActive && (
        <View style={styles.deepResearchBadge}>
          <Text style={styles.deepResearchBadgeText}>🔬 Deep Research</Text>
        </View>
      )}
      {liveTokPerSec != null && (
        <View style={styles.tokBadge}>
          <Text style={styles.tokBadgeText}>{liveTokPerSec.toFixed(1)} tok/s</Text>
        </View>
      )}
      <Pressable style={styles.newChatBtn} onPress={onNewChat} hitSlop={8}>
        <Text style={styles.newChatIcon}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  hamburgerBtn: { padding: 4 },
  hamburgerIcon: { color: "#eee", fontSize: 20 },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { color: "#eee", fontSize: 15, fontWeight: "700" },
  subtitle: { color: "#888", fontSize: 9, marginTop: 1 },
  tonePill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tonePillText: { fontSize: 14 },
  tokBadge: {
    backgroundColor: "rgba(139,92,246,0.2)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tokBadgeText: { color: "#c9a8ff", fontSize: 10, fontWeight: "700" },
  deepResearchBadge: {
    backgroundColor: "rgba(59,130,246,0.2)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deepResearchBadgeText: { color: "#7db4ff", fontSize: 10, fontWeight: "700" },
  newChatBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  newChatIcon: { color: "#eee", fontSize: 16, fontWeight: "700" },
});
