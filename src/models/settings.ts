import * as FileSystem from "expo-file-system/legacy";
import { AssetKind } from "./manifest";

interface Settings {
  activeModelId: Partial<Record<AssetKind, string>>;
}

const SETTINGS_PATH = `${FileSystem.documentDirectory}settings.json`;

async function readSettings(): Promise<Settings> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_PATH);
    if (!info.exists) return { activeModelId: {} };
    const raw = await FileSystem.readAsStringAsync(SETTINGS_PATH);
    return JSON.parse(raw);
  } catch {
    return { activeModelId: {} };
  }
}

async function writeSettings(s: Settings): Promise<void> {
  await FileSystem.writeAsStringAsync(SETTINGS_PATH, JSON.stringify(s));
}

/** The user's chosen model for this kind, or null to fall back to the default. */
export async function getActiveModelId(kind: AssetKind): Promise<string | null> {
  const s = await readSettings();
  return s.activeModelId[kind] ?? null;
}

export async function setActiveModelId(kind: AssetKind, id: string): Promise<void> {
  const s = await readSettings();
  s.activeModelId[kind] = id;
  await writeSettings(s);
}
