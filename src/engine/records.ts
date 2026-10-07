import type { EngineEvent } from "./fsm";
import type { HighScores } from "../types";

export function applySprintPace(records: HighScores, paceWph: number | null, now: number): HighScores {
  if (paceWph == null || paceWph <= records.apexSprintWph) return records;
  return { ...records, apexSprintWph: paceWph, apexSprintAt: now };
}

export function applyRound(records: HighScores, event: Extract<EngineEvent, { type: "round" }>, now: number): HighScores {
  let next = records;
  const streak = event.delta >= 0 ? next.currentPositiveDeltaStreak + 1 : 0;
  next = { ...next, currentPositiveDeltaStreak: streak };
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

export function applyEngineEvents(records: HighScores, events: EngineEvent[], now: number): HighScores {
  let next = records;
  for (const event of events) {
    if (event.type === "round") next = applyRound(next, event, now);
  }
  return next;
}
