import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SystemMonitor } from "./SystemMonitor";
import { llamaEngine } from "../inference/LlamaEngine";
import { embeddingEngine } from "../rag/embed";
import { retrieve, assemblePrompt, RetrievedChunk } from "../rag/retrieve";
import { DEFAULT_MANIFEST } from "../models/manifest";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: RetrievedChunk[];
}

export function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    (async () => {
      try {
        const llm = DEFAULT_MANIFEST.find((a) => a.id === "primary-llm")!;
        const emb = DEFAULT_MANIFEST.find((a) => a.id === "embedding-model")!;
        await Promise.all([
          llamaEngine.load(llm.filename),
          embeddingEngine.load(emb.filename),
        ]);
        setReady(true);
      } catch (e: any) {
        setLoadError(e?.message ?? String(e));
      }
    })();
  }, []);

  const send = useCallback(async () => {
    const query = input.trim();
    if (!query || generating) return;
    setInput("");
    setGenerating(true);

    const userMsg: Message = { id: `${Date.now()}-u`, role: "user", text: query };
    const assistantId = `${Date.now()}-a`;
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", text: "" }]);

    try {
      const chunks = await retrieve(query);
      const prompt = assemblePrompt(query, chunks);

      await llamaEngine.generate({
        prompt,
        onToken: (piece) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + piece } : m))
          );
        },
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, citations: chunks } : m))
      );
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: `Error: ${e?.message ?? e}` } : m
        )
      );
    } finally {
      setGenerating(false);
    }
  }, [input, generating]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SystemMonitor />

      {loadError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Model failed to load: {loadError}. Run the setup wizard to install models.
          </Text>
        </View>
      )}
      {!ready && !loadError && (
        <View style={styles.banner}>
          <ActivityIndicator color="#8f8" />
          <Text style={styles.bannerText}>Loading offline models…</Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
            <Text style={styles.bubbleText}>{item.text}</Text>
            {item.citations && item.citations.length > 0 && (
              <Text style={styles.citations}>
                Sources: {item.citations.map((c, i) => `[${i + 1}] ${c.title}`).join("  ")}
              </Text>
            )}
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask a research question…"
          placeholderTextColor="#666"
          editable={ready && !generating}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable style={styles.sendBtn} onPress={send} disabled={!ready || generating}>
          <Text style={styles.sendBtnText}>{generating ? "…" : "Send"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    backgroundColor: "#222",
  },
  bannerText: { color: "#ccc", fontSize: 12 },
  list: { padding: 12, gap: 8 },
  bubble: { padding: 10, borderRadius: 10, maxWidth: "85%" },
  userBubble: { backgroundColor: "#1f3a5f", alignSelf: "flex-end" },
  assistantBubble: { backgroundColor: "#1a1a1a", alignSelf: "flex-start" },
  bubbleText: { color: "#eee", fontSize: 15 },
  citations: { color: "#888", fontSize: 11, marginTop: 6 },
  inputRow: { flexDirection: "row", padding: 8, gap: 8, backgroundColor: "#111" },
  input: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendBtn: {
    backgroundColor: "#2a5f3a",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  sendBtnText: { color: "#fff", fontWeight: "600" },
});
