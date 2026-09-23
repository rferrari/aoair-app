import * as FileSystem from "expo-file-system/legacy";
import { AssetKind } from "./manifest";
import { PersonalityId, DEFAULT_PERSONALITY_ID } from "../constants/personalities";

export type ThemeId = "midnight" | "amber" | "frontier";
export type FontScale = "compact" | "standard" | "large";

interface Settings {
  activeModelId: Partial<Record<AssetKind, string>>;
  hidePromptIdeas?: boolean;
  personalityId?: PersonalityId;
  customSystemPrompt?: string;
  maxTokens?: number;
  hapticsEnabled?: boolean;
  autoSummarize?: boolean;
  historyTurnThreshold?: number;
  maxSavedSessions?: number;
  autoGenerateTitles?: boolean;
  deepResearchMode?: boolean;
  themeId?: ThemeId;
  fontScale?: FontScale;
}

export interface MemorySettings {
  autoSummarize: boolean;
  historyTurnThreshold: number;
  maxSavedSessions: number;
  autoGenerateTitles: boolean;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  autoSummarize: true,
  historyTurnThreshold: 6,
  maxSavedSessions: 10,
  autoGenerateTitles: true,
};

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

/** Deletes the settings file outright (used by appReset.ts) — next read falls back to defaults. */
export async function clearSettings(): Promise<void> {
  await FileSystem.deleteAsync(SETTINGS_PATH, { idempotent: true });
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

export async function getMemorySettings(): Promise<MemorySettings> {
  const s = await readSettings();
  return {
    autoSummarize: s.autoSummarize ?? DEFAULT_MEMORY_SETTINGS.autoSummarize,
    historyTurnThreshold: s.historyTurnThreshold ?? DEFAULT_MEMORY_SETTINGS.historyTurnThreshold,
    maxSavedSessions: s.maxSavedSessions ?? DEFAULT_MEMORY_SETTINGS.maxSavedSessions,
    autoGenerateTitles: s.autoGenerateTitles ?? DEFAULT_MEMORY_SETTINGS.autoGenerateTitles,
  };
}

export async function setMemorySettings(patch: Partial<MemorySettings>): Promise<void> {
  const s = await readSettings();
  Object.assign(s, patch);
  await writeSettings(s);
}

/**
 * "Deep Research Mode" — a sequential multi-pass pipeline over the same
 * single model (decompose -> research sub-questions -> synthesize), not
 * multiple models running concurrently. See src/services/orchestrator.ts.
 */
export async function getDeepResearchMode(): Promise<boolean> {
  const s = await readSettings();
  return s.deepResearchMode ?? false;
}

export async function setDeepResearchMode(enabled: boolean): Promise<void> {
  const s = await readSettings();
  s.deepResearchMode = enabled;
  await writeSettings(s);
}

export async function getThemeId(): Promise<ThemeId> {
  const s = await readSettings();
  return s.themeId ?? "midnight";
}

export async function setThemeId(theme: ThemeId): Promise<void> {
  const s = await readSettings();
  s.themeId = theme;
  await writeSettings(s);
}

export async function getFontScale(): Promise<FontScale> {
  const s = await readSettings();
  return s.fontScale ?? "standard";
}

export async function setFontScale(scale: FontScale): Promise<void> {
  const s = await readSettings();
  s.fontScale = scale;
  await writeSettings(s);
}
