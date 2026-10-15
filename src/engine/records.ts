import type { HighScores } from "../types";

export function applySprintPace(records: HighScores, paceWph: number | null, now: number): HighScores {
  if (paceWph == null || paceWph <= records.apexSprintWph) return records;
  return { ...records, apexSprintWph: paceWph, apexSprintAt: now };
}

export function applySessionDelta(records: HighScores, delta: number, now: number): HighScores {
  const streak = delta >= 0 ? records.currentPositiveDeltaStreak + 1 : 0;
  let next = { ...records, currentPositiveDeltaStreak: streak };
  if (streak > next.positiveDeltaStreak) {
    next = { ...next, positiveDeltaStreak: streak, positiveDeltaStreakAt: now };
  }
  return next;
}

export function applyVolume(records: HighScores, words: number, now: number): HighScores {
  if (words > records.volumeRecordWords) {
    return { ...records, volumeRecordWords: words, volumeRecordAt: now };
  }
  return records;
}

export function applyMarathon(records: HighScores, activeMs: number, now: number): HighScores {
  if (activeMs > records.flowMarathonMs) {
    return { ...records, flowMarathonMs: activeMs, flowMarathonAt: now };
  }
  return records;
}
