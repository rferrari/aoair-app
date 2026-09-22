import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Dimensions } from "react-native";

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
}

/**
 * Hand-rolled slide-in drawer (Animated.Value translateX + backdrop),
 * instead of @react-navigation/drawer — that pulls in gesture-handler +
 * screens + a full navigator architecture for an effect this app's simple
 * screen-switch state machine (App.tsx) doesn't need. Keeps native surface
 * area (and rebuild/crash risk) down.
 */
export function Drawer({ open, onClose, items }: Props) {
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
  subtitle: { color: "#888", fontSize: 12, marginTop: 2, marginBottom: 20 },
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
