import { DEFAULT_SETTINGS, type FocusFlowSettings, type TerminationOperator } from "../types";

export function parseWordsPerHour(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 50 || parsed > 5000) return null;
  return parsed;
}

export function parseMinutes(value: string): number | null {
  if (!/^\d+(\.\d)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (parsed < 0.5 || parsed > 180) return null;
  return parsed;
}

export function parseMaxRounds(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) return null;
  return parsed;
}

export function parseWordGoal(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100_000) return null;
  return parsed;
}

function pickNumber(value: unknown, fallback: number, parse: (text: string) => number | null): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = parse(String(value));
    if (parsed != null) return parsed;
  }
  return fallback;
}

export function sanitizeSettings(value: unknown): FocusFlowSettings {
  const raw = value && typeof value === "object" ? (value as Partial<FocusFlowSettings>) : {};
  const operator: TerminationOperator = raw.terminationOperator === "AND" ? "AND" : "OR";
  return {
    wordsPerHour: pickNumber(raw.wordsPerHour, DEFAULT_SETTINGS.wordsPerHour, parseWordsPerHour),
    thinkingMinutes: pickNumber(raw.thinkingMinutes, DEFAULT_SETTINGS.thinkingMinutes, parseMinutes),
    writingMinutes: pickNumber(raw.writingMinutes, DEFAULT_SETTINGS.writingMinutes, parseMinutes),
    maxRoundsEnabled: raw.maxRoundsEnabled === true,
    maxRounds: pickNumber(raw.maxRounds, DEFAULT_SETTINGS.maxRounds, parseMaxRounds),
    wordGoalEnabled: raw.wordGoalEnabled === true,
    wordGoal: pickNumber(raw.wordGoal, DEFAULT_SETTINGS.wordGoal, parseWordGoal),
    terminationOperator: operator,
    infiniteMode: raw.infiniteMode !== false,
    hideTimer: raw.hideTimer === true,
    thinkingCountsTowardTarget: raw.thinkingCountsTowardTarget !== false,
    hideBehindDuringThinking: raw.hideBehindDuringThinking !== false,
    audioEnabled: raw.audioEnabled !== false,
  };
}
