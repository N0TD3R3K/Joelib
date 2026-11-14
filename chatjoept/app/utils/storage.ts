import type { ChatSession, UserSettings } from "~/types/chat";
import { JOEGLISH_SYSTEM_PROMPT } from "~/utils/joeglish";

const SESSIONS_KEY = "chatjoept_sessions_v1";
const ACTIVE_SESSION_KEY = "chatjoept_active_session_id_v1";
const SETTINGS_KEY = "chatjoept_settings_v1";

export const DEFAULT_SETTINGS: UserSettings = {
  apiKey: "",
  baseUrl: "",
  model: "",
  systemPrompt: JOEGLISH_SYSTEM_PROMPT,
  theme: "system",
  temperature: 1.0,
};

export function getLocalSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse sessions from localStorage", err);
    return [];
  }
}

export function saveLocalSessions(sessions: ChatSession[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.error("Failed to save sessions to localStorage", err);
  }
}

export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function setActiveSessionId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (!id) {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } else {
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
  }
}

export function getLocalSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveLocalSettings(settings: Partial<UserSettings>): UserSettings {
  const current = getLocalSettings();
  const updated = { ...current, ...settings };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error("Failed to save settings to localStorage", err);
    }
  }
  return updated;
}
