import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ChatScreen } from "./src/ui/ChatScreen";
import { ModelSetupScreen } from "./src/ui/ModelSetupScreen";
import { ModelManager } from "./src/models/ModelManager";

const modelManager = new ModelManager();

type Screen = "checking" | "required-setup" | "chat" | "models";

export default function App() {
  const [screen, setScreen] = useState<Screen>("checking");

  useEffect(() => {
    (async () => {
      const ready = await modelManager.requiredModelsPresent();
      setScreen(ready ? "chat" : "required-setup");
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        {screen === "checking" && (
          <View style={styles.centered}>
            <ActivityIndicator color="#8f8" />
          </View>
        )}
        {screen === "required-setup" && (
          <ModelSetupScreen mode="required" onReady={() => setScreen("chat")} />
        )}
        {screen === "chat" && (
          <ChatScreen onOpenSettings={() => setScreen("models")} />
        )}
        {screen === "models" && (
          <ModelSetupScreen mode="optional" onClose={() => setScreen("chat")} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
