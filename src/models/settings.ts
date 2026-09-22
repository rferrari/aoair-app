import * as FileSystem from "expo-file-system/legacy";
import { AssetKind } from "./manifest";
import { PersonalityId, DEFAULT_PERSONALITY_ID } from "../constants/personalities";

interface Settings {
  activeModelId: Partial<Record<AssetKind, string>>;
  hidePromptIdeas?: boolean;
  personalityId?: PersonalityId;
  customSystemPrompt?: string;
  maxTokens?: number;
  hapticsEnabled?: boolean;
}

const SETTINGS_PATH = `${FileSystem.documentDirectory}settings.json`;
const DEFAULT_SETTINGS: Settings = { activeModelId: {} };
export const DEFAULT_MAX_TOKENS = 512;

async function readSettings(): Promise<Settings> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_PATH);
    if (!info.exists) return { ...DEFAULT_SETTINGS };
    const raw = await FileSystem.readAsStringAsync(SETTINGS_PATH);
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
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

/** "Don't show again" preference for the prompt-ideas onboarding carousel. */
export async function getHidePromptIdeas(): Promise<boolean> {
  const s = await readSettings();
  return s.hidePromptIdeas ?? false;
}

export async function setHidePromptIdeas(hide: boolean): Promise<void> {
  const s = await readSettings();
  s.hidePromptIdeas = hide;
  await writeSettings(s);
}

export async function getPersonalityId(): Promise<PersonalityId> {
  const s = await readSettings();
  return s.personalityId ?? DEFAULT_PERSONALITY_ID;
}

export async function setPersonalityId(id: PersonalityId): Promise<void> {
  const s = await readSettings();
  s.personalityId = id;
  await writeSettings(s);
}

export async function getCustomSystemPrompt(): Promise<string> {
  const s = await readSettings();
  return s.customSystemPrompt ?? "";
}

export async function setCustomSystemPrompt(prompt: string): Promise<void> {
  const s = await readSettings();
  s.customSystemPrompt = prompt;
  await writeSettings(s);
}

export async function getMaxTokens(): Promise<number> {
  const s = await readSettings();
  return s.maxTokens ?? DEFAULT_MAX_TOKENS;
}

export async function setMaxTokens(maxTokens: number): Promise<void> {
  const s = await readSettings();
  s.maxTokens = maxTokens;
  await writeSettings(s);
}

export async function getHapticsEnabled(): Promise<boolean> {
  const s = await readSettings();
  return s.hapticsEnabled ?? true;
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  const s = await readSettings();
  s.hapticsEnabled = enabled;
  await writeSettings(s);
}
