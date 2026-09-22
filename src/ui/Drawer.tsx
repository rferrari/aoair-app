import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Dimensions, ScrollView } from "react-native";
import { ChatSession } from "../services/chatHistory";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.8);

export interface DrawerItem {
  key: string;
  icon: string;
  label: string;
  onPress: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: DrawerItem[];
  /** Recent Chats section, rendered above `items` if provided. */
  sessions?: ChatSession[];
  activeSessionId?: string | null;
  onNewChat?: () => void;
  onSelectSession?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
}

function formatTimestamp(ms: number): string {
  const diffMin = (Date.now() - ms) / 60000;
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;
  const diffHr = diffMin / 60;
  if (diffHr < 24) return `${Math.floor(diffHr)}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/**
 * Hand-rolled slide-in drawer (Animated.Value translateX + backdrop),
 * instead of @react-navigation/drawer — that pulls in gesture-handler +
 * screens + a full navigator architecture for an effect this app's simple
 * screen-switch state machine (App.tsx) doesn't need. Keeps native surface
 * area (and rebuild/crash risk) down.
 */
export function Drawer({
  open,
  onClose,
  items,
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
}: Props) {
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: open ? 0 : -DRAWER_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: open ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, translateX, backdropOpacity]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        onTouchEnd={onClose}
      />
      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
        <Text style={styles.title}>aoair</Text>
        <Text style={styles.subtitle}>Offline AI research assistant</Text>

        {onNewChat && (
          <Pressable
            style={styles.newChatBtn}
            onPress={() => {
              onClose();
              onNewChat();
            }}
          >
            <Text style={styles.newChatIcon}>＋</Text>
            <Text style={styles.newChatLabel}>New Chat</Text>
          </Pressable>
        )}

        {sessions && sessions.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Recent Chats</Text>
            <ScrollView style={styles.sessionList}>
              {sessions.map((s) => {
                const active = s.id === activeSessionId;
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.sessionRow, active && styles.sessionRowActive]}
                    onPress={() => {
                      onClose();
                      onSelectSession?.(s.id);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionTitle} numberOfLines={1}>
                        {s.title}
                      </Text>
                      <Text style={styles.sessionTime}>{formatTimestamp(s.updatedAt)}</Text>
                    </View>
                    <Pressable
                      hitSlop={8}
                      onPress={(e) => {
                        e.stopPropagation();
                        onDeleteSession?.(s.id);
                      }}
                    >
                      <Text style={styles.sessionTrash}>🗑️</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.divider} />
          </>
        )}

        <View style={styles.itemList}>
          {items.map((item) => (
            <Pressable
              key={item.key}
              style={styles.item}
              onPress={() => {
                onClose();
                item.onPress();
              }}
            >
              <Text style={styles.itemIcon}>{item.icon}</Text>
              <Text style={styles.itemLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#14141f",
    paddingTop: 56,
    paddingHorizontal: 16,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(255,255,255,0.08)",
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  subtitle: { color: "#888", fontSize: 12, marginTop: 2, marginBottom: 16 },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(139,92,246,0.15)",
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.3)",
    marginBottom: 12,
  },
  newChatIcon: { color: "#c9a8ff", fontSize: 16, fontWeight: "700" },
  newChatLabel: { color: "#c9a8ff", fontSize: 14, fontWeight: "600" },
  sectionHeading: { color: "#777", fontSize: 11, fontWeight: "700", marginBottom: 6, marginTop: 4 },
  sessionList: { maxHeight: 220 },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  sessionRowActive: { backgroundColor: "rgba(58,122,74,0.25)" },
  sessionTitle: { color: "#ddd", fontSize: 13, fontWeight: "500" },
  sessionTime: { color: "#666", fontSize: 10, marginTop: 1 },
  sessionTrash: { fontSize: 13, opacity: 0.7 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 12 },
  itemList: { gap: 4 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  itemIcon: { fontSize: 18 },
  itemLabel: { color: "#eee", fontSize: 15, fontWeight: "500" },
});
