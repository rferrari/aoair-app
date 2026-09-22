import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import { ChatScreen } from "./src/ui/ChatScreen";
import { ModelSetupScreen } from "./src/ui/ModelSetupScreen";

export default function App() {
  const [screen, setScreen] = useState<"chat" | "models">("chat");

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {screen === "chat" ? (
        <ChatScreen onOpenModelSetup={() => setScreen("models")} />
      ) : (
        <ModelSetupScreen onClose={() => setScreen("chat")} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
});
