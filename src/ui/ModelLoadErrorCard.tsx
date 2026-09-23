import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

interface Diagnosis {
  title: string;
  detail: string;
}

/**
 * Turns a raw thrown error message into a short, readable diagnosis.
 * Deliberately conservative: an actual native out-of-memory during model
 * load usually crashes the process (SIGSEGV/OOM-killer) before any JS catch
 * block can run, so it can't be reliably detected here — the "memory"
 * bucket below only covers the cases where llama.cpp's init rejects with a
 * JS-catchable message that happens to mention memory, not a guarantee.
 */
function diagnose(error: string): Diagnosis {
  const lower = error.toLowerCase();
  if (lower.includes("size mismatch") || lower.includes("verification")) {
    return {
      title: "Corrupted Download",
      detail: "The model file didn't match its expected size — the download was likely interrupted. Re-downloading it should fix this.",
    };
  }
  if (lower.includes("not found")) {
    return {
      title: "Model File Missing",
      detail: "The selected model isn't on this device anymore. Pick a different model or re-download this one from Settings.",
    };
  }
  if (lower.includes("memory") || lower.includes("oom")) {
    return {
      title: "Out of Memory",
      detail: "This device may not have enough free RAM for the selected model. Try closing other apps, or switch to a smaller model.",
    };
  }
  return { title: "Unable to Load Model", detail: error };
}

interface Props {
  error: string;
  onOpenSettings?: () => void;
  onRelaunchWizard?: () => void;
}

export function ModelLoadErrorCard({ error, onOpenSettings, onRelaunchWizard }: Props) {
  const { title, detail } = diagnose(error);

  return (
    <View style={styles.card}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.callout}>
        <Text style={styles.calloutText}>{detail}</Text>
      </View>
      <View style={styles.actionsRow}>
        {onOpenSettings && (
          <Pressable style={styles.actionBtn} onPress={onOpenSettings}>
            <Text style={styles.actionBtnText}>⚙️ Settings</Text>
          </Pressable>
        )}
        {onRelaunchWizard && (
          <Pressable style={styles.actionBtn} onPress={onRelaunchWizard}>
            <Text style={styles.actionBtnText}>🪄 Setup Wizard</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(224,90,90,0.08)",
    borderWidth: 1,
    borderColor: "rgba(224,90,90,0.3)",
    alignItems: "center",
    gap: 8,
  },
  icon: { fontSize: 28 },
  title: { color: "#f2a5a5", fontSize: 16, fontWeight: "700" },
  callout: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 8,
    padding: 10,
    width: "100%",
  },
  calloutText: { color: "#ddd", fontSize: 12, lineHeight: 18, textAlign: "center" },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 4, width: "100%" },
  actionBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  actionBtnText: { color: "#eee", fontSize: 13, fontWeight: "600" },
});
