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
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
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
  getHapticsEnabled,
} from "../models/settings";
import { getPersonality, PersonalityId } from "../constants/personalities";
import { PromptIdeasCarousel } from "./PromptIdeasCarousel";
import { VoiceInputButton } from "./VoiceInputButton";
import { ProcessingIndicator, ProcessingStatus } from "./ProcessingIndicator";
import { Drawer, DrawerItem } from "./Drawer";
import { AboutScreen } from "./AboutScreen";
import { recordQueryStats, trackPeakRss } from "../services/telemetry";
import { getMemoryInfo } from "ram-monitor";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: RetrievedChunk[];
  stopped?: boolean;
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [personalityId, setPersonalityIdState] = useState<PersonalityId>("succinct");
  const [processing, setProcessing] = useState<{ messageId: string; status: ProcessingStatus } | null>(null);
  const [liveTokPerSec, setLiveTokPerSec] = useState<number | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
  const hapticsEnabledRef = useRef(true);

  useEffect(() => {
    (async () => {
      const hide = await getHidePromptIdeas();
      if (!hide) setShowPromptIdeas(true);
      setPersonalityIdState(await getPersonalityId());
      hapticsEnabledRef.current = await getHapticsEnabled();
    })();
  }, []);

  const haptic = useCallback((fn: () => Promise<void>) => {
    if (hapticsEnabledRef.current) fn().catch(() => {});
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

  const stopRequestedRef = useRef(false);

  const stopGeneration = useCallback(async () => {
    stopRequestedRef.current = true;
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    await llamaEngine.stop();
  }, [haptic]);

  const send = useCallback(async () => {
    const query = input.trim();
    if (!query || generating) return;
    setInput("");
    setGenerating(true);
    stopRequestedRef.current = false;

    const userMsg: Message = { id: `${Date.now()}-u`, role: "user", text: query };
    const assistantId = `${Date.now()}-a`;
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", text: "" }]);
    setProcessing({ messageId: assistantId, status: "retrieving" });

    const peakRss = trackPeakRss(() => {
      try {
        return getMemoryInfo().rssBytes;
      } catch {
        return 0;
      }
    });
    const startTime = performance.now();
    let ttftMs = 0;
    let tokensGenerated = 0;

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

      setProcessing({ messageId: assistantId, status: "thinking" });
      let firstToken = true;
      let firstTokenTime = 0;

      await llamaEngine.generate({
        prompt,
        nPredict: maxTokens,
        onToken: (piece) => {
          tokensGenerated += 1;
          if (firstToken) {
            firstToken = false;
            firstTokenTime = performance.now();
            ttftMs = firstTokenTime - startTime;
            setProcessing({ messageId: assistantId, status: "generating" });
          } else {
            const elapsedSinceFirst = (performance.now() - firstTokenTime) / 1000;
            if (elapsedSinceFirst > 0) setLiveTokPerSec(tokensGenerated / elapsedSinceFirst);
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + piece } : m))
          );
        },
      });

      const wasStopped = stopRequestedRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, citations: chunks, stopped: wasStopped } : m
        )
      );
      haptic(() =>
        Haptics.notificationAsync(
          wasStopped ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success
        )
      );

      const durationMs = performance.now() - startTime;
      recordQueryStats({
        tokensGenerated,
        durationMs,
        ttftMs,
        tokPerSec: tokensGenerated > 0 ? tokensGenerated / ((durationMs - ttftMs) / 1000) : 0,
        peakRssBytes: peakRss.stop(),
        timestamp: Date.now(),
      });
    } catch (e: any) {
      peakRss.stop();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: `Error: ${e?.message ?? e}` } : m
        )
      );
    } finally {
      setGenerating(false);
      setProcessing(null);
      setLiveTokPerSec(null);
    }
  }, [input, generating, haptic]);

  const drawerItems: DrawerItem[] = [
    { key: "prompts", icon: "💡", label: "Prompt Ideas", onPress: () => setShowPromptIdeas(true) },
    ...(onOpenSettings
      ? [{ key: "settings", icon: "⚙️", label: "Settings", onPress: onOpenSettings }]
      : []),
    { key: "about", icon: "ℹ️", label: "About & Info", onPress: () => setShowAbout(true) },
  ];

  if (showAbout) {
    return <AboutScreen onClose={() => setShowAbout(false)} />;
  }

  return (
    <LinearGradient colors={["#0b0c10", "#1f2833"]} style={styles.container}>
      <View style={styles.ambientGlowTop} pointerEvents="none" />
      <View style={styles.ambientGlowBottom} pointerEvents="none" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.hamburgerBtn} onPress={() => setDrawerOpen(true)} hitSlop={8}>
            <Text style={styles.hamburgerIcon}>☰</Text>
          </Pressable>
          <Pressable style={styles.tonePill} onPress={cycleTone} hitSlop={8}>
            <Text style={styles.tonePillText}>
              {personalityId === "succinct" ? "⚡" : "🔬"}
            </Text>
          </Pressable>
          {liveTokPerSec != null && (
            <View style={styles.tokBadge}>
              <Text style={styles.tokBadgeText}>{liveTokPerSec.toFixed(1)} tok/s</Text>
            </View>
          )}
          <Pressable
            style={styles.newChatBtn}
            onPress={() => setMessages([])}
            hitSlop={8}
          >
            <Text style={styles.newChatIcon}>+</Text>
          </Pressable>
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
          renderItem={({ item }) => {
            const showProcessing =
              item.text === "" && processing?.messageId === item.id && processing.status !== "generating";
            return (
              <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
                {showProcessing ? (
                  <ProcessingIndicator status={processing!.status as Exclude<ProcessingStatus, "idle">} />
                ) : (
                  <Text style={styles.bubbleText}>{item.text}</Text>
                )}
                {item.citations && item.citations.length > 0 && (
                  <Text style={styles.citations}>
                    Sources: {item.citations.map((c, i) => `[${i + 1}] ${c.title}`).join("  ")}
                  </Text>
                )}
                {item.stopped && <Text style={styles.stoppedTag}>⏹ Stopped</Text>}
              </View>
            );
          }}
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
          {generating ? (
            <Pressable style={styles.stopBtn} onPress={stopGeneration}>
              <Text style={styles.stopBtnText}>⏹</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.sendBtn} onPress={send} disabled={!ready}>
              <Text style={styles.sendBtnText}>Send</Text>
            </Pressable>
          )}
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

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} items={drawerItems} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  ambientGlowTop: {
    position: "absolute",
    top: -80,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "#2e1a47",
    opacity: 0.35,
  },
  ambientGlowBottom: {
    position: "absolute",
    bottom: -100,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#112233",
    opacity: 0.4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  hamburgerBtn: { padding: 4 },
  hamburgerIcon: { color: "#eee", fontSize: 20 },
  tonePill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tonePillText: { fontSize: 14 },
  tokBadge: {
    backgroundColor: "rgba(139,92,246,0.2)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tokBadgeText: { color: "#c9a8ff", fontSize: 10, fontWeight: "700" },
  newChatBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  newChatIcon: { color: "#eee", fontSize: 16, fontWeight: "700" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  bannerText: { color: "#ccc", fontSize: 12 },
  list: { padding: 12, gap: 8 },
  bubble: { padding: 10, borderRadius: 14, maxWidth: "85%" },
  userBubble: {
    backgroundColor: "rgba(99,102,241,0.25)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
    alignSelf: "flex-end",
  },
  assistantBubble: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignSelf: "flex-start",
  },
  bubbleText: { color: "#eee", fontSize: 15 },
  citations: { color: "#888", fontSize: 11, marginTop: 6 },
  inputRow: {
    flexDirection: "row",
    padding: 8,
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
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
  stopBtn: {
    backgroundColor: "#7a2a2a",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  stopBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  stoppedTag: { color: "#e0a020", fontSize: 11, marginTop: 6, fontWeight: "600" },
});
