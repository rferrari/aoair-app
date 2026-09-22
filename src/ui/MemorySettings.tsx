import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Switch, Pressable, Alert } from "react-native";
import { getMemorySettings, setMemorySettings, MemorySettings as MemorySettingsType } from "../models/settings";
import { clearAllHistory } from "../services/chatHistory";

const TURN_OPTIONS = [4, 6, 8, 10] as const;
const SESSION_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Unlimited" },
] as const;

export function MemorySettings({ onCleared }: { onCleared?: () => void }) {
  const [settings, setSettings] = useState<MemorySettingsType | null>(null);

  useEffect(() => {
    getMemorySettings().then(setSettings);
  }, []);

  const update = async (patch: Partial<MemorySettingsType>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    await setMemorySettings(patch);
  };

  const confirmClearAll = () => {
    Alert.alert(
      "Clear all chat history?",
      "This permanently deletes every saved chat session and message on this device. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await clearAllHistory();
            onCleared?.();
          },
        },
      ]
    );
  };

  if (!settings) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>💾 Chat history & memory</Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Background context summarization</Text>
          <Text style={styles.rowValue}>
            Condenses older turns so long chats don't lose context
          </Text>
        </View>
        <Switch
          value={settings.autoSummarize}
          onValueChange={(v) => update({ autoSummarize: v })}
          trackColor={{ false: "#333", true: "#3a7a4a" }}
        />
      </View>

      <Text style={styles.subheading}>Recent turns before summarizing</Text>
      <View style={styles.pillRow}>
        {TURN_OPTIONS.map((n) => (
          <Pressable
            key={n}
            style={[styles.pill, settings.historyTurnThreshold === n && styles.pillSelected]}
            onPress={() => update({ historyTurnThreshold: n })}
          >
            <Text style={[styles.pillText, settings.historyTurnThreshold === n && styles.pillTextSelected]}>
              {n}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.subheading}>Max saved chat sessions</Text>
      <View style={styles.pillRow}>
        {SESSION_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.pill, settings.maxSavedSessions === opt.value && styles.pillSelected]}
            onPress={() => update({ maxSavedSessions: opt.value })}
          >
            <Text
              style={[styles.pillText, settings.maxSavedSessions === opt.value && styles.pillTextSelected]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Auto-generate chat titles</Text>
          <Text style={styles.rowValue}>Names new chats from your first message</Text>
        </View>
        <Switch
          value={settings.autoGenerateTitles}
          onValueChange={(v) => update({ autoGenerateTitles: v })}
          trackColor={{ false: "#333", true: "#3a7a4a" }}
        />
      </View>

      <Pressable style={styles.clearBtn} onPress={confirmClearAll}>
        <Text style={styles.clearBtnText}>🗑️ Clear All Chat History</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111", borderRadius: 10, padding: 14, margin: 12, gap: 12 },
  title: { color: "#fff", fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowLabel: { color: "#eee", fontSize: 13, fontWeight: "600" },
  rowValue: { color: "#999", fontSize: 11, marginTop: 2 },
  subheading: { color: "#ccc", fontSize: 12, fontWeight: "600" },
  pillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { backgroundColor: "#1a1a1a", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  pillSelected: { backgroundColor: "#2a5f3a" },
  pillText: { color: "#999", fontSize: 12 },
  pillTextSelected: { color: "#fff", fontWeight: "600" },
  clearBtn: {
    backgroundColor: "rgba(122,42,42,0.3)",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(122,42,42,0.5)",
  },
  clearBtnText: { color: "#f88", fontSize: 13, fontWeight: "700" },
});
