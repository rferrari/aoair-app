import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";

export function AboutScreen({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>About aoair</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.closeBtn}>Close</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.icon}>⛺</Text>
        <Text style={styles.paragraph}>
          aoair is a fully offline AI research assistant for Android — local
          LLM inference (llama.cpp via llama.rn) and local hybrid retrieval
          (SQLite FTS5 + on-device embeddings), no cloud calls once the
          one-time model setup is done.
        </Text>
        <Text style={styles.paragraph}>
          Built for the "Best Offline AI Research App" community,
          inspired by @VitalikButerin's post on offline-capable phone AI.
        </Text>
        <Text style={styles.sectionHeading}>What runs where</Text>
        <Text style={styles.paragraph}>
          Chat, retrieval, and generation are 100% on-device. The only
          network access anywhere in the app is the Settings screen's model
          catalog — used only when you explicitly download something.
        </Text>
        <Text style={styles.sectionHeading}>Source</Text>
        <Text style={styles.paragraph}>
          Public repository: github.com/rferrari/aoair-app — includes all
          code, the model/corpus manifest, and setup scripts.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "600" },
  closeBtn: { color: "#8bf", fontSize: 14 },
  body: { padding: 16, gap: 12 },
  icon: { fontSize: 40, textAlign: "center", marginBottom: 8 },
  sectionHeading: { color: "#8bf", fontSize: 13, fontWeight: "700", marginTop: 8 },
  paragraph: { color: "#ccc", fontSize: 13, lineHeight: 20 },
});
