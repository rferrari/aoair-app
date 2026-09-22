import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch } from "react-native";
import { setHidePromptIdeas } from "../models/settings";

export interface PromptIdea {
  category: string;
  icon: string;
  prompt: string;
}

// Starter prompts a 1B model would typically fail on — multi-domain
// synthesis/comparison, not simple factual recall. See docs/EVAL_QUERIES.md
// for the parallel list used in the bounty demo.
const PROMPT_IDEAS: PromptIdea[] = [
  {
    category: "Travel & Off-Grid Exploration",
    icon: "⛺",
    prompt:
      "I'm trekking in a high-altitude arid environment. Synthesize methods for off-grid water purification, compare chemical treatment vs. microfiltration, and outline altitude sickness management.",
  },
  {
    category: "Travel & Off-Grid Exploration",
    icon: "⛺",
    prompt:
      "Compare Moorish design in Southern Spain with Ottoman architecture in the Balkans, detailing specific structural features to observe at historical sites.",
  },
  {
    category: "Transit & Deep Learning",
    icon: "✈️",
    prompt:
      "Explain the core differences between Paxos and Raft consensus algorithms in distributed systems. Compare leader election mechanisms and network partition handling.",
  },
  {
    category: "Transit & Deep Learning",
    icon: "✈️",
    prompt:
      "Synthesize economic arguments surrounding land value tax vs. traditional property tax on housing supply and urban development.",
  },
  {
    category: "Fieldwork & Emergency Operations",
    icon: "🔬",
    prompt:
      "Synthesize ecological differences between active reforestation and natural regeneration in degraded tropical soils, detailing soil microbiome impact on seedling survival.",
  },
  {
    category: "Fieldwork & Emergency Operations",
    icon: "🔬",
    prompt:
      "Evaluate first-aid protocols for stabilizing severe closed fractures when medical transport is delayed 24 hours. Compare traction vs. standard splinting.",
  },
];

interface Props {
  onUsePrompt: (prompt: string) => void;
  onDismiss: () => void;
}

export function PromptIdeasCarousel({ onUsePrompt, onDismiss }: Props) {
  const [index, setIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const idea = PROMPT_IDEAS[index];
  const isLast = index === PROMPT_IDEAS.length - 1;
  const isFirst = index === 0;

  const dismiss = async () => {
    if (dontShowAgain) await setHidePromptIdeas(true);
    onDismiss();
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>💡 Prompt Ideas</Text>
          <Pressable onPress={dismiss} hitSlop={8}>
            <Text style={styles.closeBtn}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.categoryIcon}>{idea.icon}</Text>
          <Text style={styles.category}>{idea.category}</Text>
          <Text style={styles.prompt}>{idea.prompt}</Text>
        </ScrollView>

        <View style={styles.stepDots}>
          {PROMPT_IDEAS.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.navRow}>
          <Pressable
            style={[styles.navBtn, isFirst && styles.navBtnDisabled]}
            disabled={isFirst}
            onPress={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <Text style={styles.navBtnText}>Back</Text>
          </Pressable>
          <Pressable
            style={styles.useBtn}
            onPress={() => {
              onUsePrompt(idea.prompt);
            }}
          >
            <Text style={styles.useBtnText}>Use this prompt</Text>
          </Pressable>
          <Pressable
            style={[styles.navBtn, isLast && styles.navBtnDisabled]}
            disabled={isLast}
            onPress={() => setIndex((i) => Math.min(PROMPT_IDEAS.length - 1, i + 1))}
          >
            <Text style={styles.navBtnText}>Next</Text>
          </Pressable>
        </View>

        <View style={styles.dismissRow}>
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setDontShowAgain((v) => !v)}
            hitSlop={8}
          >
            <Switch
              value={dontShowAgain}
              onValueChange={setDontShowAgain}
              trackColor={{ false: "#333", true: "#3a7a4a" }}
            />
            <Text style={styles.dismissLabel}>Don't show again</Text>
          </Pressable>
          <Pressable onPress={dismiss} hitSlop={8}>
            <Text style={styles.dismissBtn}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#111",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: "70%",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  closeBtn: { color: "#999", fontSize: 16, padding: 4 },
  body: { alignItems: "center", paddingVertical: 20, gap: 10 },
  categoryIcon: { fontSize: 36 },
  category: { color: "#8bf", fontSize: 13, fontWeight: "700" },
  prompt: { color: "#eee", fontSize: 15, textAlign: "center", lineHeight: 21 },
  stepDots: { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#333" },
  dotActive: { backgroundColor: "#3a7a4a" },
  navRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  navBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: "#8bf", fontSize: 13, fontWeight: "600" },
  useBtn: { flex: 1, backgroundColor: "#2a5f3a", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  useBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  dismissRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#222",
  },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dismissLabel: { color: "#999", fontSize: 12 },
  dismissBtn: { color: "#f88", fontSize: 12, fontWeight: "600" },
});
