import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, ActivityIndicator, Alert } from "react-native";
import { searchModels, listGgufFiles, toCatalogModel, HFModelSummary, HFGgufFile } from "../services/modelBrowser";
import { addDiscoveredModel } from "../models/discoveredModels";

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
    : `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

interface Props {
  /** Called after a model is added to the discovered list, so the parent can refresh its own list/status. */
  onAdded: () => void;
}

/**
 * Search Hugging Face for GGUF models not in the app's curated MODEL_CATALOG.
 * Adding a result here just registers it (src/models/discoveredModels.ts) —
 * the actual download happens through the normal CatalogItemCard flow in the
 * Tone & Model list above, so it gets the same progress tracking, size
 * verification, and duplicate-download guard as every other model.
 */
export function ModelBrowser({ onAdded }: Props) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<HFModelSummary[]>([]);
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [filesByRepo, setFilesByRepo] = useState<Record<string, HFGgufFile[]>>({});
  const [filesLoading, setFilesLoading] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setExpandedRepo(null);
    try {
      setResults(await searchModels(q));
    } catch (e: any) {
      Alert.alert("Search failed", e?.message ?? String(e));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const toggleRepo = useCallback(
    async (repoId: string) => {
      if (expandedRepo === repoId) {
        setExpandedRepo(null);
        return;
      }
      setExpandedRepo(repoId);
      if (!filesByRepo[repoId]) {
        setFilesLoading(repoId);
        try {
          const files = await listGgufFiles(repoId);
          setFilesByRepo((prev) => ({ ...prev, [repoId]: files }));
        } catch (e: any) {
          Alert.alert("Couldn't load files", e?.message ?? String(e));
          setExpandedRepo(null);
        } finally {
          setFilesLoading(null);
        }
      }
    },
    [expandedRepo, filesByRepo]
  );

  const addFile = useCallback(
    async (repoId: string, file: HFGgufFile) => {
      const key = `${repoId}/${file.filename}`;
      setAddingKey(key);
      try {
        const model = toCatalogModel(repoId, file);
        await addDiscoveredModel(model);
        onAdded();
        Alert.alert("Added", `"${model.label}" was added to the model list above — download it from there.`);
      } catch (e: any) {
        Alert.alert("Couldn't add model", e?.message ?? String(e));
      } finally {
        setAddingKey(null);
      }
    },
    [onAdded]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Search Hugging Face for other GGUF models. Not vetted by aoair — check RAM fit and
        licensing yourself on the model's page before downloading.
      </Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="e.g. llama 3.2 3b instruct"
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />
        <Pressable style={styles.searchBtn} onPress={runSearch} disabled={searching}>
          {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchBtnText}>🔎</Text>}
        </Pressable>
      </View>

      <FlatList
        data={results}
        keyExtractor={(m) => m.id}
        scrollEnabled={false}
        contentContainerStyle={{ gap: 8, marginTop: 8 }}
        renderItem={({ item }) => (
          <View style={styles.repoCard}>
            <Pressable onPress={() => toggleRepo(item.id)}>
              <Text style={styles.repoId}>{item.id}</Text>
              <Text style={styles.repoMeta}>
                {item.downloads?.toLocaleString() ?? "?"} downloads · {item.likes ?? 0} likes
              </Text>
            </Pressable>

            {expandedRepo === item.id && filesLoading === item.id && (
              <ActivityIndicator color="#8f8" style={{ marginTop: 8 }} />
            )}

            {expandedRepo === item.id &&
              filesLoading !== item.id &&
              (filesByRepo[item.id] ?? []).map((file) => {
                const key = `${item.id}/${file.filename}`;
                return (
                  <View key={key} style={styles.fileRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileName}>{file.filename}</Text>
                      <Text style={styles.fileMeta}>
                        {formatBytes(file.sizeBytes)}
                        {!file.sha256 ? " · no checksum available" : ""}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.addBtn}
                      disabled={addingKey === key}
                      onPress={() => addFile(item.id, file)}
                    >
                      <Text style={styles.addBtnText}>{addingKey === key ? "Adding…" : "➕ Add"}</Text>
                    </Pressable>
                  </View>
                );
              })}

            {expandedRepo === item.id && filesLoading !== item.id && (filesByRepo[item.id]?.length ?? 0) === 0 && (
              <Text style={styles.fileMeta}>No .gguf files found in this repo.</Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 4 },
  hint: { color: "#888", fontSize: 11, marginBottom: 8, lineHeight: 16 },
  searchRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#eee",
    fontSize: 13,
  },
  searchBtn: {
    backgroundColor: "#2a5f3a",
    borderRadius: 6,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  searchBtnText: { fontSize: 15 },
  repoCard: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  repoId: { color: "#eee", fontSize: 13, fontWeight: "600" },
  repoMeta: { color: "#8f8", fontSize: 11, marginTop: 2 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  fileName: { color: "#ddd", fontSize: 12 },
  fileMeta: { color: "#888", fontSize: 10, marginTop: 2 },
  addBtn: { backgroundColor: "rgba(59,130,246,0.2)", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  addBtnText: { color: "#9cc4ff", fontSize: 11, fontWeight: "600" },
});
