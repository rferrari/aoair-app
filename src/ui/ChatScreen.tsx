import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Keyboard,
  ActivityIndicator,
  Animated,
  AppState,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { llamaEngine } from "../inference/LlamaEngine";
import { embeddingEngine } from "../rag/embed";
import { retrieve, assemblePrompt, RetrievedChunk, ConversationTurn } from "../rag/retrieve";
import { seedKnowledgeBaseIfEmpty } from "../rag/seedCorpus";
import { MODEL_CATALOG, REQUIRED_MODELS, CatalogModel } from "../models/manifest";
import {
  getActiveModelId,
  getHidePromptIdeas,
  getPersonalityId,
  setPersonalityId,
  getCustomSystemPrompt,
  getMaxTokens,
  getHapticsEnabled,
  getMemorySettings,
  MemorySettings as MemorySettingsType,
  DEFAULT_MEMORY_SETTINGS,
  getDeepResearchMode,
  setDeepResearchMode,
} from "../models/settings";
import { runDeepResearch, ResearchProgress } from "../services/orchestrator";
import { getPersonality, PersonalityId } from "../constants/personalities";
import {
  createSession,
  addMessage as persistMessage,
  getMessages as getSessionMessages,
  listSessions,
  deleteSession,
  setSessionTitle,
  setSessionSummary,
  pruneSessions,
  ChatSession,
} from "../services/chatHistory";
import { generateSessionTitle, summarizeConversation } from "../services/summarize";
import { PromptIdeasCarousel } from "./PromptIdeasCarousel";
import { VoiceInputButton } from "./VoiceInputButton";
import { ProcessingIndicator, ProcessingStatus } from "./ProcessingIndicator";
import { Drawer, DrawerItem } from "./Drawer";
import { AboutScreen } from "./AboutScreen";
import { KnowledgeBaseScreen } from "./KnowledgeBaseScreen";
import { ChatHeader } from "./ChatHeader";
import { ModelLoadErrorCard } from "./components/ModelLoadErrorCard";
import { MarkdownMessage } from "./components/MarkdownMessage";
import { SourceFootnotes } from "./components/SourceFootnotes";
import { recordQueryStats, trackPeakRss, startAppMemoryTracking } from "../services/telemetry";
import { getMemoryInfo } from "ram-monitor";
import { useTheme, colors, typography } from "./theme";
import { spacing, radii, shadows } from "./theme/spacing";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: RetrievedChunk[];
  stopped?: boolean;
  timedOut?: boolean;
  interruptedByBackground?: boolean;
}

const VERBATIM_MESSAGE_COUNT = 6;

function researchStageLabel(p: ResearchProgress, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (p.stage === "decomposing") return t("chatScreen.research.decomposing");
  if (p.stage === "researching") {
    return t("chatScreen.research.researching", {
      index: (p.subQuestionIndex ?? 0) + 1,
      count: p.subQuestionCount ?? 1,
    });
  }
  return t("chatScreen.research.synthesizing");
}

async function resolveActiveModel(kind: "llm" | "embedding"): Promise<CatalogModel> {
  const activeId = await getActiveModelId(kind);
  const fallback = REQUIRED_MODELS.find((m) => m.kind === kind)!;
  if (!activeId) return fallback;
  return MODEL_CATALOG.find((m) => m.id === activeId && m.kind === kind) ?? fallback;
}

export function ChatScreen({
  onOpenSettings,
  onRelaunchWizard,
}: {
  onOpenSettings?: () => void;
  onRelaunchWizard?: () => void;
}) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [loadStatus, setLoadStatus] = useState(t("chatScreen.initializingCore"));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showPromptIdeas, setShowPromptIdeas] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [personalityId, setPersonalityIdState] = useState<PersonalityId>("succinct");
  const [processing, setProcessing] = useState<{ messageId: string; status: ProcessingStatus; label?: string } | null>(null);
  const [deepResearchActive, setDeepResearchActive] = useState(false);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const [liveTokPerSec, setLiveTokPerSec] = useState<number | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeModel, setActiveModel] = useState<CatalogModel | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
  const hapticsEnabledRef = useRef(true);
  const memorySettingsRef = useRef<MemorySettingsType>(DEFAULT_MEMORY_SETTINGS);
  const deepResearchModeRef = useRef(false);
  const sessionSummaryRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const backgroundTaskRef = useRef<Promise<void> | null>(null);
  const sendTaskRef = useRef<Promise<void> | null>(null);
  const processingRef = useRef<{ messageId: string; status: ProcessingStatus; label?: string } | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    processingRef.current = processing;
  }, [processing]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const refreshSessions = useCallback(async () => {
    setSessions(await listSessions());
  }, []);

  useEffect(() => {
    (async () => {
      const hide = await getHidePromptIdeas();
      if (!hide) setShowPromptIdeas(true);
      setPersonalityIdState(await getPersonalityId());
      hapticsEnabledRef.current = await getHapticsEnabled();
      memorySettingsRef.current = await getMemorySettings();
      const drMode = await getDeepResearchMode();
      deepResearchModeRef.current = drMode;
      setDeepResearchEnabled(drMode);
      await refreshSessions();
    })();
  }, [refreshSessions]);

  const haptic = useCallback((fn: () => Promise<void>) => {
    if (hapticsEnabledRef.current) fn().catch(() => {});
  }, []);

  const copyMessage = useCallback(
    async (id: string, text: string) => {
      await Clipboard.setStringAsync(text);
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId((cur) => (cur === id ? null : cur)), 1500);
    },
    [haptic]
  );

  const toggleDeepResearch = useCallback(async () => {
    const next = !deepResearchEnabled;
    setDeepResearchEnabled(next);
    deepResearchModeRef.current = next;
    await setDeepResearchMode(next);
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  }, [deepResearchEnabled, haptic]);

  const cycleTone = useCallback(async () => {
    const next = personalityId === "succinct" ? "detailed" : "succinct";
    setPersonalityIdState(next);
    await setPersonalityId(next);
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  }, [personalityId, haptic]);

  const initModels = useCallback(async () => {
    try {
      setLoadError(null);
      setReady(false);
      setLoadStatus(t("chatScreen.mountingWeights"));
      const llm = await resolveActiveModel("llm");
      const emb = await resolveActiveModel("embedding");
      setActiveModel(llm);

      await Promise.all([
        llamaEngine.load(llm.filename),
        embeddingEngine.load(emb.filename),
      ]);
      startAppMemoryTracking();

      setLoadStatus(t("chatScreen.indexingKnowledgeBase"));
      await seedKnowledgeBaseIfEmpty();
      setReady(true);
    } catch (e: any) {
      setLoadError(e?.message ?? String(e));
    }
  }, [t]);

  useEffect(() => {
    initModels();
  }, [initModels]);

  const stopRequestedRef = useRef(false);

  const stopGeneration = useCallback(async () => {
    stopRequestedRef.current = true;
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    await llamaEngine.stop();
  }, [haptic]);

  const cancelBackgroundTask = useCallback(async () => {
    if (!backgroundTaskRef.current) return;
    await llamaEngine.stop();
    await backgroundTaskRef.current.catch(() => {});
    backgroundTaskRef.current = null;
  }, []);

  /**
   * Stops whatever's actively generating (single-pass or Deep Research) and
   * waits for send()'s own promise to fully settle — including its finally
   * block and DB persistence — before returning. Switching sessions or
   * starting a new chat while a generation is in flight used to just swap
   * `messages`/`activeSessionId` out from under it: the old generation kept
   * running against a now-stale assistantId, so its token updates and even
   * its final "insert the finished answer" update silently no-opped (a
   * .map() that can't find a matching id), losing the response from the
   * live UI even though it was still correctly persisted to that session's
   * history (only a fresh DB read — e.g. re-selecting the session — ever
   * surfaced it again). Awaiting the real generation task here, not just
   * the post-generation title/summary background task, closes that gap.
   */
  const stopAndAwaitGeneration = useCallback(async () => {
    if (!sendTaskRef.current) return;
    stopRequestedRef.current = true;
    await llamaEngine.stop();
    await sendTaskRef.current.catch(() => {});
  }, []);

  /**
   * Per docs/ADAPTIVE_ROUTING.md §14: no AppState handling existed anywhere
   * in the app before this — an in-flight generation (or, once the
   * execution engine exists, a multi-step routing pipeline) would just keep
   * burning CPU/battery invisibly if the user backgrounded the app, with no
   * cancellation and no way to know it happened. Default policy: background
   * -> stop immediately (reusing the exact same stop path as the Stop
   * button — no second cancellation mechanism), mark the in-progress
   * message as interrupted so it's visibly explained rather than silently
   * truncated, and let the user retry by just asking again.
   */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "background") return;
      if (!sendTaskRef.current) return;
      const interruptedId = processingRef.current?.messageId;
      stopAndAwaitGeneration().then(() => {
        if (interruptedId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === interruptedId ? { ...m, interruptedByBackground: true } : m))
          );
        }
      });
    });
    return () => sub.remove();
  }, [stopAndAwaitGeneration]);

  const resetToNewChat = useCallback(async () => {
    await stopAndAwaitGeneration();
    await cancelBackgroundTask();
    setMessages([]);
    setActiveSessionId(null);
    sessionSummaryRef.current = null;
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  }, [stopAndAwaitGeneration, cancelBackgroundTask, haptic]);

  const selectSession = useCallback(async (id: string) => {
    await stopAndAwaitGeneration();
    await cancelBackgroundTask();
    const records = await getSessionMessages(id);
    setMessages(records.map((r) => ({ id: r.id, role: r.role, text: r.text })));
    setActiveSessionId(id);
    const session = sessions.find((s) => s.id === id);
    sessionSummaryRef.current = session?.summary ?? null;
  }, [stopAndAwaitGeneration, cancelBackgroundTask, sessions]);

  const removeSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      await refreshSessions();
      if (id === activeSessionId) await resetToNewChat();
    },
    [activeSessionId, refreshSessions, resetToNewChat]
  );

  const send = useCallback(async () => {
    const query = input.trim();
    if (!query || generating) return;

    await cancelBackgroundTask();

    setInput("");
    setGenerating(true);
    stopRequestedRef.current = false;

    let sessionId = activeSessionId;
    const isNewSession = !sessionId;
    if (!sessionId) {
      const session = await createSession();
      sessionId = session.id;
      setActiveSessionId(sessionId);
    }
    await persistMessage(sessionId, "user", query);

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
    let assistantText = "";

    try {
      const [maxTokens, activePersonalityId, customPrompt] = await Promise.all([
        getMaxTokens(),
        getPersonalityId(),
        getCustomSystemPrompt(),
      ]);
      const personality = getPersonality(activePersonalityId);
      const systemPrompt = activePersonalityId === "custom" ? customPrompt : personality.systemPrompt;

      const priorMessages = messagesRef.current.filter((m) => m.text.length > 0);
      const verbatimTurns: ConversationTurn[] = priorMessages
        .slice(-VERBATIM_MESSAGE_COUNT)
        .map((m) => ({ role: m.role, text: m.text }));
      const history = { summary: sessionSummaryRef.current, turns: verbatimTurns };

      let firstToken = true;
      let firstTokenTime = 0;
      const onToken = (piece: string) => {
        tokensGenerated += 1;
        assistantText += piece;
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
      };

      let chunks: RetrievedChunk[];

      if (deepResearchModeRef.current) {
        setDeepResearchActive(true);
        const result = await runDeepResearch(
          query,
          systemPrompt,
          history,
          maxTokens,
          (p: ResearchProgress) => {
            setProcessing({ messageId: assistantId, status: "thinking", label: researchStageLabel(p, t) });
          },
          onToken,
          () => stopRequestedRef.current
        );
        chunks = result.citations;
        if (result.timedOut) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, timedOut: true } : m))
          );
        }
      } else {
        setProcessing({ messageId: assistantId, status: "retrieving" });
        chunks = await retrieve(query);
        setProcessing({ messageId: assistantId, status: "thinking" });
        const prompt = assemblePrompt(query, chunks, systemPrompt, history);
        await llamaEngine.generate({ prompt, nPredict: maxTokens, onToken });
      }

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

      if (assistantText.trim().length > 0) {
        await persistMessage(sessionId, "assistant", assistantText);
      }

      const settings = memorySettingsRef.current;
      const allMessages = [...priorMessages, userMsg, { ...userMsg, id: assistantId, role: "assistant" as const, text: assistantText }];

      if (isNewSession && settings.autoGenerateTitles && !wasStopped) {
        const sid = sessionId;
        backgroundTaskRef.current = generateSessionTitle(query)
          .then(async (title) => {
            await setSessionTitle(sid, title);
            await refreshSessions();
          })
          .catch(() => {})
          .finally(() => {
            backgroundTaskRef.current = null;
          });
      } else if (settings.autoSummarize && !wasStopped) {
        const totalTurns = Math.floor(allMessages.length / 2);
        if (totalTurns > settings.historyTurnThreshold) {
          const olderMessages = allMessages.slice(0, -VERBATIM_MESSAGE_COUNT);
          if (olderMessages.length > 0) {
            const sid = sessionId;
            const turnsToSummarize: ConversationTurn[] = olderMessages.map((m) => ({
              role: m.role,
              text: m.text,
            }));
            const previousSummary = sessionSummaryRef.current;
            backgroundTaskRef.current = summarizeConversation(turnsToSummarize, previousSummary)
              .then(async (summary) => {
                sessionSummaryRef.current = summary;
                await setSessionSummary(sid, summary);
              })
              .catch(() => {})
              .finally(() => {
                backgroundTaskRef.current = null;
              });
          }
        }
      }

      await pruneSessions(settings.maxSavedSessions);
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
      setDeepResearchActive(false);
    }
  }, [input, generating, haptic, activeSessionId, cancelBackgroundTask, refreshSessions]);

  // send() itself isn't awaited by its callers (onPress/onSubmitEditing) —
  // stopAndAwaitGeneration needs a handle on the in-flight promise so a
  // session switch can wait for it to actually finish. Only the entry point
  // sets sendTaskRef; send() doesn't need to know about it.
  const handleSend = useCallback(() => {
    sendTaskRef.current = send().finally(() => {
      sendTaskRef.current = null;
    });
  }, [send]);

  const drawerItems: DrawerItem[] = [
    { key: "prompts", icon: "💡", label: t("chatScreen.drawerItems.prompts"), onPress: () => setShowPromptIdeas(true) },
    { key: "knowledge", icon: "📚", label: t("chatScreen.drawerItems.myDocuments"), onPress: () => setShowKnowledgeBase(true) },
    ...(onOpenSettings
      ? [{ key: "settings", icon: "⚙️", label: t("chatScreen.drawerItems.settings"), onPress: onOpenSettings }]
      : []),
    { key: "about", icon: "ℹ️", label: t("chatScreen.drawerItems.about"), onPress: () => setShowAbout(true) },
  ];

  if (showKnowledgeBase) {
    return <KnowledgeBaseScreen onClose={() => setShowKnowledgeBase(false)} />;
  }

  if (showAbout) {
    return <AboutScreen onClose={() => setShowAbout(false)} />;
  }

  const isDeepActive = deepResearchEnabled || deepResearchActive;

  return (
    <LinearGradient
      colors={isDeepActive ? [colors.frontier.gradientStart, colors.bg.terminal] : [colors.bg.terminal, colors.bg.surface]}
      style={styles.container}
    >
      {/* Ambient background glows */}
      <View
        style={[styles.ambientGlowTop, isDeepActive && styles.ambientGlowTopDeep]}
        pointerEvents="none"
      />
      <View
        style={[styles.ambientGlowBottom, isDeepActive && styles.ambientGlowBottomDeep]}
        pointerEvents="none"
      />

      <View style={[styles.flex, { paddingBottom: keyboardHeight }]}>
        <ChatHeader
          toneIcon={getPersonality(personalityId).icon}
          deepResearchActive={isDeepActive}
          liveTokPerSec={liveTokPerSec}
          activeModelLabel={activeModel?.label}
          onOpenDrawer={() => {
            refreshSessions();
            setDrawerOpen(true);
          }}
          onCycleTone={cycleTone}
          onNewChat={resetToNewChat}
          onToggleDeepResearch={toggleDeepResearch}
        />

        {/* Deep Research Mode Banner */}
        {isDeepActive && (
          <View style={[styles.deepResearchBanner, { backgroundColor: colors.frontier.badgeBg, borderBottomColor: colors.frontier.badgeBorder }]}>
            <View style={styles.deepBannerPill}>
              <Text style={styles.deepBannerIcon}>🔬</Text>
              <Text style={[styles.deepBannerText, { color: colors.frontier.text }]}>
                {t("chatScreen.deepResearchBanner")}
              </Text>
            </View>
          </View>
        )}

        {loadError && (
          <ModelLoadErrorCard
            error={loadError}
            onOpenSettings={onOpenSettings}
            onRelaunchWizard={onRelaunchWizard}
            onRetry={initModels}
          />
        )}

        {!ready && !loadError && (
          <View style={[styles.loadingBanner, { backgroundColor: colors.emerald.bgSubtle, borderBottomColor: colors.emerald.border }]}>
            <ActivityIndicator color={colors.emerald[400]} size="small" />
            <Text style={[styles.loadingBannerText, { color: colors.text.accentEmerald }]}>{loadStatus}</Text>
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
            const isStreamingThis = generating && item.role === "assistant" && processing?.messageId === item.id;

            return (
              <View
                style={[
                  styles.bubble,
                  item.role === "user"
                    ? [styles.userBubble, { backgroundColor: colors.bg.cardElevated, borderColor: colors.border.focus }]
                    : [styles.assistantBubble, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }],
                ]}
              >
                {/* Bubble role label */}
                <View style={styles.bubbleHeader}>
                  <Text
                    style={[
                      styles.bubbleRoleLabel,
                      item.role === "user"
                        ? [styles.userRoleLabel, { color: colors.text.accentCyan }]
                        : [styles.assistantRoleLabel, { color: colors.text.accentEmerald }],
                    ]}
                  >
                    {item.role === "user" ? t("chatScreen.roleYou") : t("chatScreen.roleAssistant")}
                  </Text>
                  {item.role === "assistant" && item.text.length > 0 && (
                    <Pressable
                      onPress={() => copyMessage(item.id, item.text)}
                      hitSlop={8}
                      accessibilityLabel={t("chatScreen.copyResponse")}
                    >
                      <Text style={[styles.copyIcon, { color: colors.text.dim }]}>
                        {copiedMessageId === item.id ? "✓" : "⧉"}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {showProcessing ? (
                  <ProcessingIndicator
                    status={processing!.status as Exclude<ProcessingStatus, "idle">}
                    label={processing!.label}
                  />
                ) : (
                  <MarkdownMessage content={item.text} isStreaming={isStreamingThis} />
                )}

                {item.citations && item.citations.length > 0 && (
                  <SourceFootnotes citations={item.citations} />
                )}

                {item.stopped && (
                  <View style={[styles.stoppedBadge, { backgroundColor: colors.amber.bgSubtle, borderColor: colors.amber.border }]}>
                    <Text style={[styles.stoppedTag, { color: colors.text.accentAmber }]}>⏹ {t("chatScreen.stoppedByUser")}</Text>
                  </View>
                )}

                {item.timedOut && (
                  <View style={[styles.stoppedBadge, { backgroundColor: colors.amber.bgSubtle, borderColor: colors.amber.border }]}>
                    <Text style={[styles.stoppedTag, { color: colors.text.accentAmber }]}>⏱ {t("chatScreen.stageTimedOut")}</Text>
                  </View>
                )}

                {item.interruptedByBackground && (
                  <View style={[styles.stoppedBadge, { backgroundColor: colors.amber.bgSubtle, borderColor: colors.amber.border }]}>
                    <Text style={[styles.stoppedTag, { color: colors.text.accentAmber }]}>⏸ {t("chatScreen.interruptedByBackground")}</Text>
                  </View>
                )}
              </View>
            );
          }}
        />

        {/* Input Bar */}
        <View style={[styles.inputContainer, { backgroundColor: colors.bg.cardElevated, borderTopColor: colors.border.default }]}>
          <View style={styles.inputRow}>
            <VoiceInputButton
              disabled={!ready || generating}
              onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
            />
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: colors.bg.input, color: colors.text.primary, borderColor: colors.border.default }]}
              value={input}
              onChangeText={setInput}
              placeholder={t("chatScreen.inputPlaceholder")}
              placeholderTextColor={colors.text.dim}
              editable={ready && !generating}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              multiline={false}
            />
            {generating ? (
              <Pressable
                style={styles.stopBtn}
                onPress={stopGeneration}
                hitSlop={8}
                accessibilityLabel={t("chatScreen.stopGeneration")}
              >
                <Text style={styles.stopBtnText}>⏹</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.sendBtn, (!ready || !input.trim()) && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!ready || !input.trim()}
                hitSlop={8}
                accessibilityLabel={t("chatScreen.sendMessage")}
              >
                <Text style={styles.sendBtnText}>➤</Text>
              </Pressable>
            )}
          </View>
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
      </View>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={drawerItems}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewChat={resetToNewChat}
        onSelectSession={selectSession}
        onDeleteSession={removeSession}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  ambientGlowTop: {
    position: "absolute",
    top: -90,
    left: -70,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(6, 182, 212, 0.12)",
    opacity: 0.6,
  },
  ambientGlowTopDeep: {
    backgroundColor: "rgba(139, 92, 246, 0.25)",
    opacity: 0.85,
  },
  ambientGlowBottom: {
    position: "absolute",
    bottom: -110,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    opacity: 0.5,
  },
  ambientGlowBottomDeep: {
    backgroundColor: "rgba(6, 182, 212, 0.18)",
    opacity: 0.7,
  },
  deepResearchBanner: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    backgroundColor: colors.frontier.badgeBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.frontier.badgeBorder,
  },
  deepBannerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deepBannerIcon: {
    fontSize: 10,
  },
  deepBannerText: {
    ...typography.mono.xs,
    fontSize: 9,
    color: colors.frontier.text,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  loadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.emerald.bgSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.emerald.border,
  },
  loadingBannerText: {
    ...typography.mono.xs,
    color: colors.text.accentEmerald,
    fontWeight: "600",
  },
  list: {
    padding: spacing.md,
    gap: spacing.md,
  },
  bubble: {
    padding: spacing.md,
    borderRadius: radii.lg,
    maxWidth: "92%",
    gap: 4,
    ...shadows.card,
  },
  userBubble: {
    backgroundColor: "#13213B",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.35)",
    alignSelf: "flex-end",
    borderBottomRightRadius: radii.xs,
  },
  assistantBubble: {
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignSelf: "flex-start",
    borderBottomLeftRadius: radii.xs,
    minWidth: 200,
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  bubbleRoleLabel: {
    ...typography.mono.xs,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  userRoleLabel: {
    color: colors.text.accentCyan,
  },
  assistantRoleLabel: {
    color: colors.text.accentEmerald,
  },
  copyIcon: {
    fontSize: 14,
    paddingHorizontal: 4,
  },
  stoppedBadge: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.amber.bgSubtle,
    borderColor: colors.amber.border,
    borderWidth: 1,
    borderRadius: radii.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stoppedTag: {
    ...typography.mono.xs,
    color: colors.text.accentAmber,
    fontWeight: "700",
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
    backgroundColor: colors.bg.cardElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg.input,
    color: colors.text.primary,
    borderColor: colors.border.default,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...typography.ui.body,
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.emerald[600],
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.35,
    backgroundColor: colors.border.elevated,
  },
  sendBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
    marginLeft: 2,
  },
  stopBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.crimson[600],
    alignItems: "center",
    justifyContent: "center",
  },
  stopBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
});
