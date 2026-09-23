import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ChatScreen } from "./src/ui/ChatScreen";
import { ModelSetupScreen } from "./src/ui/ModelSetupScreen";
import { ModelManager } from "./src/models/ModelManager";
import { colors } from "./src/ui/theme/colors";

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
            <ActivityIndicator color={colors.emerald[400]} size="large" />
          </View>
        )}
        {screen === "required-setup" && (
          <ModelSetupScreen mode="required" onReady={() => setScreen("chat")} />
        )}
        {screen === "chat" && (
          <ChatScreen
            onOpenSettings={() => setScreen("models")}
            onRelaunchWizard={() => setScreen("required-setup")}
          />
        )}
        {screen === "models" && (
          <ModelSetupScreen
            mode="optional"
            onClose={() => setScreen("chat")}
            onRelaunchWizard={() => setScreen("required-setup")}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.terminal,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
