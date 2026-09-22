import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { CatalogModel } from "../models/manifest";

function formatMB(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
    : `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

export interface CatalogRowState {
  present: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
}

interface Props {
  item: CatalogModel;
  row: CatalogRowState | undefined;
  isActive: boolean;
  onDownload: (item: CatalogModel) => void;
  onUse: (item: CatalogModel) => void;
  onRemove: (item: CatalogModel) => void;
}

/**
 * A single model/corpus catalog row, following a strict lifecycle so the
 * state is never ambiguous:
 *
 * - LLM/embedding items are genuinely swappable (only one "active" per
 *   kind at a time, via src/models/settings.ts) — full 3-state: Not
 *   downloaded -> Downloaded (inactive, "Select & Use") -> Active.
 * - Corpus packs are NOT a single-selection choice — seedCorpus.ts merges
 *   in every downloaded pack additively — so "downloaded" already means
 *   "included in your knowledge base." Modeling them with a fake "Use
 *   this" step (as an earlier version did) was the root of a real bug:
 *   activeIds was never computed for kind "corpus", so they could never
 *   show as active no matter what. Corpus packs get a simpler 2-state:
 *   Not downloaded -> Active (green) as soon as they're present.
 */
export function CatalogItemCard({ item, row, isActive, onDownload, onUse, onRemove }: Props) {
  const isCorpus = item.kind === "corpus";
  const present = row?.present ?? false;
  const effectivelyActive = isCorpus ? present : isActive;

  const confirmRemove = () => {
    Alert.alert(
      isCorpus ? "Remove this knowledge base pack?" : "Remove this model?",
      isCorpus
        ? `This deletes the local file and frees ${formatMB(item.sizeBytes)}. Its topics won't be in your offline search until you download it again.`
        : `This deletes the local file and frees ${formatMB(item.sizeBytes)}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => onRemove(item) },
      ]
    );
  };

  return (
    <View style={[styles.card, effectivelyActive && styles.cardActive]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{item.label}</Text>
        <Badge present={present} active={effectivelyActive} downloading={row?.downloading ?? false} />
      </View>

      <Text style={styles.meta}>
        {item.kind} · {formatMB(item.sizeBytes)} · {item.license}
        {item.required ? " · default" : ""}
      </Text>
      <Text style={styles.description}>{item.description}</Text>

      {row?.error && <Text style={styles.error}>{row.error}</Text>}

      {row?.downloading && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${row.progress * 100}%` }]} />
        </View>
      )}

      {!row?.downloading && (
        <View style={styles.actionsRow}>
          {!present && (
            <Pressable style={styles.downloadBtn} onPress={() => onDownload(item)}>
              <Text style={styles.downloadBtnText}>{row?.error ? "Retry" : "📥 Download"}</Text>
            </Pressable>
          )}
          {present && !isCorpus && !isActive && (
            <Pressable style={styles.useBtn} onPress={() => onUse(item)}>
              <Text style={styles.useBtnText}>🔘 Select & use</Text>
            </Pressable>
          )}
          {present && isCorpus && (
            <Text style={styles.activeNote}>✓ Currently powering offline search</Text>
          )}
          {present && !isCorpus && isActive && (
            <Text style={styles.activeNote}>✓ Currently active</Text>
          )}
          {present && !item.required && (
            <Pressable onPress={confirmRemove} hitSlop={8} style={styles.trashBtn}>
              <Text style={styles.trashIcon}>🗑️</Text>
            </Pressable>
          )}
        </View>
      )}
      {row?.downloading && <ActivityIndicator color="#8f8" style={{ marginTop: 6 }} />}
    </View>
  );
}

function Badge({
  present,
  active,
  downloading,
}: {
  present: boolean;
  active: boolean;
  downloading: boolean;
}) {
  if (downloading) return <BadgePill text="Downloading…" style={styles.badgeNeutral} />;
  if (!present) return <BadgePill text="Not downloaded" style={styles.badgeGrey} />;
  if (active) return <BadgePill text="🟢 ACTIVE" style={styles.badgeActive} />;
  return <BadgePill text="Downloaded" style={styles.badgeBlue} />;
}

function BadgePill({ text, style }: { text: string; style: object }) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardActive: { borderColor: "rgba(58,122,74,0.6)", backgroundColor: "#0e1a12" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  label: { color: "#eee", fontSize: 14, fontWeight: "600", flex: 1 },
  meta: { color: "#8f8", fontSize: 11, marginTop: 2 },
  description: { color: "#999", fontSize: 12, marginTop: 2 },
  error: { color: "#f88", fontSize: 11, marginTop: 4 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#222",
    overflow: "hidden",
    marginTop: 6,
  },
  progressFill: { height: "100%", backgroundColor: "#3a7a4a" },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  downloadBtn: { backgroundColor: "#2a5f3a", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  downloadBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  useBtn: { backgroundColor: "rgba(139,92,246,0.2)", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  useBtnText: { color: "#c9a8ff", fontSize: 12, fontWeight: "600" },
  activeNote: { color: "#8f8", fontSize: 11, fontWeight: "600", flex: 1 },
  trashBtn: { marginLeft: "auto", padding: 4 },
  trashIcon: { fontSize: 15 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  badgeGrey: { backgroundColor: "rgba(255,255,255,0.08)" },
  badgeBlue: { backgroundColor: "rgba(59,130,246,0.3)" },
  badgeActive: { backgroundColor: "rgba(58,122,74,0.5)" },
  badgeNeutral: { backgroundColor: "rgba(255,255,255,0.05)" },
});
