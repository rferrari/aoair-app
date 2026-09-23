import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ChatScreen } from "./src/ui/ChatScreen";
import { ModelSetupScreen } from "./src/ui/ModelSetupScreen";
import { ModelManager } from "./src/models/ModelManager";
import { ThemeProvider, useTheme } from "./src/ui/theme";

const modelManager = new ModelManager();

type Screen = "checking" | "required-setup" | "chat" | "models";

function AppContent() {
  const [screen, setScreen] = useState<Screen>("checking");
  const { colors } = useTheme();

  useEffect(() => {
    (async () => {
      const ready = await modelManager.requiredModelsPresent();
      setScreen(ready ? "chat" : "required-setup");
    })();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg.terminal }]} edges={["top", "bottom"]}>
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
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
