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
import { llamaEngine } from "../inference/LlamaEngine";
import { embeddingEngine } from "../rag/embed";
import { retrieve, assemblePrompt, RetrievedChunk } from "../rag/retrieve";
import { seedKnowledgeBaseIfEmpty } from "../rag/seedCorpus";
import { MODEL_CATALOG, REQUIRED_MODELS } from "../models/manifest";
import {
  getActiveModelId,
  getHidePromptIdeas,
  getPersonalityId,
  setPersonalityId,
  getCustomSystemPrompt,
  getMaxTokens,
} from "../models/settings";
import { getPersonality, PersonalityId } from "../constants/personalities";
import { PromptIdeasCarousel } from "./PromptIdeasCarousel";
import { VoiceInputButton } from "./VoiceInputButton";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: RetrievedChunk[];
}

async function resolveActiveModel(kind: "llm" | "embedding") {
  const activeId = await getActiveModelId(kind);
  const fallback = REQUIRED_MODELS.find((m) => m.kind === kind)!;
  if (!activeId) return fallback;
  return MODEL_CATALOG.find((m) => m.id === activeId && m.kind === kind) ?? fallback;
}

export function ChatScreen({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [loadStatus, setLoadStatus] = useState("Loading models into memory…");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showPromptIdeas, setShowPromptIdeas] = useState(false);
  const [personalityId, setPersonalityIdState] = useState<PersonalityId>("succinct");
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      const hide = await getHidePromptIdeas();
      if (!hide) setShowPromptIdeas(true);
      setPersonalityIdState(await getPersonalityId());
    })();
  }, []);

  const cycleTone = useCallback(async () => {
    const next = personalityId === "succinct" ? "detailed" : "succinct";
    setPersonalityIdState(next);
    await setPersonalityId(next);
  }, [personalityId]);

  useEffect(() => {
    (async () => {
      try {
        // App.tsx only mounts ChatScreen once ModelManager.requiredModelsPresent()
        // is true, so the required models are already on disk here — no
        // network needed at this point. The active model (default or a
        // user-selected alternate from Settings) is resolved from disk too.
        const llm = await resolveActiveModel("llm");
        const emb = await resolveActiveModel("embedding");

        await Promise.all([
          llamaEngine.load(llm.filename),
          embeddingEngine.load(emb.filename),
        ]);

        setLoadStatus("Preparing knowledge base…");
        await seedKnowledgeBaseIfEmpty();
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
      const [chunks, maxTokens, activePersonalityId, customPrompt] = await Promise.all([
        retrieve(query),
        getMaxTokens(),
        getPersonalityId(),
        getCustomSystemPrompt(),
      ]);
      const personality = getPersonality(activePersonalityId);
      const systemPrompt = activePersonalityId === "custom" ? customPrompt : personality.systemPrompt;
      const prompt = assemblePrompt(query, chunks, systemPrompt);

      await llamaEngine.generate({
        prompt,
        nPredict: maxTokens,
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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>aoair</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.tonePill} onPress={cycleTone} hitSlop={8}>
            <Text style={styles.tonePillText}>
              {personalityId === "succinct" ? "⚡ Concise" : "🔬 Detailed"}
            </Text>
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={() => setShowPromptIdeas(true)} hitSlop={8}>
            <Text style={styles.headerBtnText}>💡 Prompt Ideas</Text>
          </Pressable>
          {onOpenSettings && (
            <Pressable style={styles.headerBtn} onPress={onOpenSettings} hitSlop={8}>
              <Text style={styles.headerBtnText}>⚙ Settings</Text>
            </Pressable>
          )}
        </View>
      </View>

      {loadError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Model failed to load: {loadError}</Text>
        </View>
      )}
      {!ready && !loadError && (
        <View style={styles.banner}>
          <ActivityIndicator color="#8f8" />
          <Text style={styles.bannerText}>{loadStatus}</Text>
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
        <VoiceInputButton
          disabled={!ready || generating}
          onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
        />
        <TextInput
          ref={inputRef}
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

      {showPromptIdeas && (
        <PromptIdeasCarousel
          onDismiss={() => setShowPromptIdeas(false)}
          onUsePrompt={(prompt) => {
            setInput(prompt);
            setShowPromptIdeas(false);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  headerBtnText: { color: "#8bf", fontSize: 12 },
  tonePill: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tonePillText: { color: "#ccc", fontSize: 11, fontWeight: "600" },
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
