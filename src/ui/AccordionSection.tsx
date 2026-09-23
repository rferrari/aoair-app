import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "./theme/colors";
import { typography } from "./theme/typography";
import { spacing, radii } from "./theme/spacing";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  icon: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Collapsible section for the Settings screen — styled with field terminal elevation */
export function AccordionSection({ icon, title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={toggle}>
        <Text style={styles.headerIcon}>{icon}</Text>
        <Text style={styles.headerTitle}>{title.toUpperCase()}</Text>
        <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.bg.cardElevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    backgroundColor: colors.bg.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerIcon: { fontSize: 16 },
  headerTitle: {
    ...typography.mono.xs,
    fontSize: 11,
    color: colors.text.heading,
    fontWeight: "800",
    letterSpacing: 0.5,
    flex: 1,
  },
  chevron: { color: colors.text.dim, fontSize: 10 },
  body: {
    paddingVertical: spacing.xs,
  },
});
