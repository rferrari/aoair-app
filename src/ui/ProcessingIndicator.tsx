import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";

export type ProcessingStatus = "idle" | "retrieving" | "thinking" | "generating";

const STATUS_LABEL: Record<Exclude<ProcessingStatus, "idle">, string> = {
  retrieving: "🔍 Searching offline corpus…",
  thinking: "🧠 Analyzing context & reasoning…",
  generating: "✍️ Generating answer…",
};

function BouncingDot({ delay }: { delay: number }) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: -4, duration: 300, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay(400 - delay),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, y]);

  return <Animated.View style={[styles.dot, { transform: [{ translateY: y }] }]} />;
}

/**
 * Shown in place of an assistant bubble's text while a query is being
 * processed (RAG retrieval, then prompt prefill) — before the first token
 * has streamed back. ChatScreen swaps this out for the actual streamed text
 * the moment the first token arrives.
 */
export function ProcessingIndicator({ status }: { status: Exclude<ProcessingStatus, "idle"> }) {
  const glow = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.avatar, { opacity: glow }]} />
      <Text style={styles.label}>{STATUS_LABEL[status]}</Text>
      <View style={styles.dots}>
        <BouncingDot delay={0} />
        <BouncingDot delay={130} />
        <BouncingDot delay={260} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3a7a4a",
  },
  label: { color: "#aaa", fontSize: 13 },
  dots: { flexDirection: "row", gap: 3, marginLeft: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#666" },
});
