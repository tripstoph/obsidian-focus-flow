import { DEFAULT_SETTINGS, type FocusFlowSettings } from "../types";

export function parseWordsPerHour(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 50 || parsed > 5000) return null;
  return parsed;
}

export function sanitizeSettings(value: unknown): FocusFlowSettings {
  const raw = value && typeof value === "object" ? (value as { wordsPerHour?: unknown }) : {};
  if (typeof raw.wordsPerHour === "number" && Number.isFinite(raw.wordsPerHour)) {
    const parsed = parseWordsPerHour(String(raw.wordsPerHour));
    if (parsed != null) return { wordsPerHour: parsed };
  }
  return { ...DEFAULT_SETTINGS };
}
