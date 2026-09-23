import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { PersonalDocumentsManager } from "./PersonalDocumentsManager";
import { colors } from "./theme/colors";
import { typography } from "./theme/typography";
import { spacing, radii } from "./theme/spacing";

/**
 * Drawer shortcut straight to "manage my documents" — the same
 * PersonalDocumentsManager also embedded in Settings > Knowledge Base
 * (CorpusSettingsTab), so users who just want to add/toggle/remove their
 * own notes don't have to go through Settings to get there. Settings keeps
 * its own path too, alongside the downloadable corpus packs.
 */
export function KnowledgeBaseScreen({ onClose }: { onClose: () => void }) {
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>📚</Text>
          <Text style={styles.title}>MY DOCUMENTS</Text>
        </View>
        <Pressable onPress={handleClose} hitSlop={8} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>DONE</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <PersonalDocumentsManager />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    backgroundColor: colors.bg.cardElevated,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIcon: {
    fontSize: 18,
  },
  title: {
    ...typography.ui.titleSm,
    color: colors.text.heading,
  },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.xs,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  closeBtnText: {
    ...typography.mono.xs,
    color: colors.text.accentCyan,
    fontWeight: "800",
  },
  body: { paddingBottom: spacing.xxxl },
});
