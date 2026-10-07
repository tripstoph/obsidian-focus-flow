import { trackingMs } from "./clock";
import type { SessionState } from "../types";

export function targetWords(wordsPerHour: number, elapsedTrackingMs: number): number {
  if (elapsedTrackingMs <= 0 || wordsPerHour <= 0) return 0;
  return (wordsPerHour / 3600) * (elapsedTrackingMs / 1000);
}

export function displayTrackingMs(state: SessionState, now: number, hideBehindDuringThinking: boolean): number {
  const actual = trackingMs(state, now);
  if (!hideBehindDuringThinking || (state.status !== "RUNNING" && state.status !== "PAUSED") || state.phase == null) {
    return actual;
  }
  if (state.phase === "THINKING") return state.trackingAtRoundStart;
  const duration = state.intervalDurationMs;
  const elapsed = writingElapsedMs(state, now);
  const fraction = duration <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration));
  const trackingAtWritingStart = state.accumulatedTrackingMs - state.intervalWritingMs;
  const debt = Math.max(0, trackingAtWritingStart - state.trackingAtRoundStart);
  return state.trackingAtRoundStart + fraction * (debt + duration);
}

function writingElapsedMs(state: SessionState, now: number): number {
  const live =
    state.status === "RUNNING" && state.phase === "WRITING" && state.segmentStartedAt != null
      ? Math.max(0, now - state.segmentStartedAt)
      : 0;
  return state.intervalWritingMs + live;
}

export function intervalPaceWph(
  words: number,
  burstWords: number,
  activeMs: number,
): number | null {
  if (activeMs < 30_000) return null;
  const typed = words - burstWords;
  if (typed <= 0) return null;
  return (typed / (activeMs / 1000)) * 3600;
}
