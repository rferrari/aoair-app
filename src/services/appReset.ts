import * as FileSystem from "expo-file-system/legacy";
import { llamaEngine } from "../inference/LlamaEngine";
import { embeddingEngine } from "../rag/embed";
import { resetDatabase } from "../rag/db";
import { resetDownloadState } from "./downloadManager";
import { clearSettings } from "../models/settings";
import { clearDiscoveredModels } from "../models/discoveredModels";

const MODELS_DIR = `${FileSystem.documentDirectory}models`;
const CORPUS_DIR = `${FileSystem.documentDirectory}corpus`;

/**
 * Full app data wipe ("Danger Zone > Clear All Data" in Settings). This app
 * doesn't use MMKV/AsyncStorage — everything persisted lives either in the
 * SQLite knowledge base (chat history, all corpus/collection chunks) or in
 * small JSON files under the document directory (settings, the discovered-
 * models list), so those are what actually get cleared here.
 *
 * Order matters: the native llama.cpp contexts are released FIRST since
 * they hold the model files open (mmap'd) — deleting a file out from under
 * a live context is exactly the kind of native-lifecycle bug this project
 * has hit before (see LlamaEngine/EmbeddingEngine's own unload-before-load
 * guard). After this call, App.tsx's required-models check will fail and
 * the app should be sent back to the setup wizard.
 */
export async function resetAllAppData(): Promise<void> {
  await Promise.all([llamaEngine.unload(), embeddingEngine.unload()]);
  resetDownloadState();

  await resetDatabase();
  await FileSystem.deleteAsync(MODELS_DIR, { idempotent: true });
  await FileSystem.deleteAsync(CORPUS_DIR, { idempotent: true });
  await clearSettings();
  await clearDiscoveredModels();
}
