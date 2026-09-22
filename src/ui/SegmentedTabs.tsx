import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";

export interface Tab {
  key: string;
  icon: string;
  label: string;
}

export function SegmentedTabs({
  tabs,
  activeKey,
  onChange,
}: {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(tab.key)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabActive: {
    backgroundColor: "rgba(139,92,246,0.18)",
    borderColor: "rgba(139,92,246,0.4)",
  },
  tabIcon: { fontSize: 13 },
  tabLabel: { color: "#999", fontSize: 12, fontWeight: "600" },
  tabLabelActive: { color: "#e5d9ff" },
});
