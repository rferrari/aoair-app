import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { useTranslation } from "react-i18next";
import { getHapticsEnabled, setHapticsEnabled } from "../models/settings";
import { isVoiceInputAvailable } from "../voice/VoiceInput";

export function VoiceSettings() {
  const { t } = useTranslation();
  const [haptics, setHaptics] = useState(true);
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    getHapticsEnabled().then(setHaptics);
    isVoiceInputAvailable().then(setVoiceAvailable).catch(() => setVoiceAvailable(false));
  }, []);

  const toggleHaptics = async (value: boolean) => {
    setHaptics(value);
    await setHapticsEnabled(value);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🎙️ {t("voiceSettings.title")}</Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{t("voiceSettings.speechEngineLabel")}</Text>
          <Text style={styles.rowValue}>
            {voiceAvailable == null
              ? t("voiceSettings.checking")
              : voiceAvailable
                ? t("voiceSettings.available")
                : t("voiceSettings.unavailable")}
          </Text>
        </View>
      </View>
      {voiceAvailable === false && (
        <Text style={styles.note}>{t("voiceSettings.unavailableNote")}</Text>
      )}

      <View style={styles.divider} />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{t("voiceSettings.hapticFeedbackLabel")}</Text>
          <Text style={styles.rowValue}>{t("voiceSettings.hapticFeedbackValue")}</Text>
        </View>
        <Switch
          value={haptics}
          onValueChange={toggleHaptics}
          trackColor={{ false: "#333", true: "#3a7a4a" }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111", borderRadius: 10, padding: 14, margin: 12, gap: 12 },
  title: { color: "#fff", fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowLabel: { color: "#eee", fontSize: 13, fontWeight: "600" },
  rowValue: { color: "#999", fontSize: 12, marginTop: 2 },
  note: { color: "#666", fontSize: 11, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.1)" },
});
