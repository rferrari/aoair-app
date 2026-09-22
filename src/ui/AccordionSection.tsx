import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  icon: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Collapsible section for the Settings screen — replaces the earlier tabbed layout. */
export function AccordionSection({ icon, title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={toggle}>
        <Text style={styles.headerIcon}>{icon}</Text>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.chevron}>{open ? "︿" : "﹀"}</Text>
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  headerIcon: { fontSize: 16 },
  headerTitle: { color: "#eee", fontSize: 14, fontWeight: "700", flex: 1 },
  chevron: { color: "#888", fontSize: 12 },
  body: {},
});
