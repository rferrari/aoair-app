import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, StyleSheet, Animated, Alert } from "react-native";
import { isVoiceInputAvailable, startListening, stopListening, VoiceEvent } from "../voice/VoiceInput";

interface Props {
  disabled?: boolean;
  onTranscript: (text: string) => void;
}

/**
 * Mic button for offline speech-to-text. Backed by Android's built-in
 * SpeechRecognizer with EXTRA_PREFER_OFFLINE (src/voice/VoiceInput.ts +
 * modules/voice-input) — works on stock Android/most OEM builds that ship a
 * speech-recognition service, but NOT guaranteed on GrapheneOS or other
 * de-Googled builds with no such service installed. Detects this and shows
 * a clear "unavailable" state instead of pretending to listen.
 */
export function VoiceInputButton({ disabled, onTranscript }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    isVoiceInputAvailable().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (!listening) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  const handlePress = async () => {
    if (available === false) {
      Alert.alert(
        "Voice input unavailable",
        "No on-device speech recognition service was found on this device " +
          "(common on GrapheneOS / de-Googled builds). Type your question instead."
      );
      return;
    }
    if (listening) {
      await stopListening();
      setListening(false);
      return;
    }
    setListening(true);
    try {
      const result = await startListening((event: VoiceEvent) => {
        if (event.type === "error") {
          setListening(false);
        }
      });
      if (result) onTranscript(result);
    } finally {
      setListening(false);
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Pressable
        style={[
          styles.btn,
          listening && styles.btnListening,
          (disabled || available === false) && styles.btnDisabled,
        ]}
        onPress={handlePress}
        disabled={disabled && !listening}
        hitSlop={8}
      >
        <Text style={styles.icon}>{listening ? "●" : "🎤"}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  btnListening: { backgroundColor: "#7a2a2a" },
  btnDisabled: { opacity: 0.4 },
  icon: { fontSize: 16 },
});
