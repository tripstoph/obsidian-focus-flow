import type { SessionState } from "../types";

export const SUSPEND_GAP_MS = 2_000;

export function trackingMs(state: SessionState, now: number): number {
  if (state.status === "RUNNING" && state.segmentStartedAt != null) {
    return state.accumulatedTrackingMs + Math.max(0, now - state.segmentStartedAt);
  }
  return state.accumulatedTrackingMs;
}

export function activeMs(state: SessionState, now: number): number {
  return trackingMs(state, now);
}

export function writingMs(state: SessionState, now: number): number {
  return trackingMs(state, now);
}

export function shiftForSuspend(state: SessionState, gapMs: number): SessionState {
  if (state.status !== "RUNNING" || gapMs < SUSPEND_GAP_MS || state.segmentStartedAt == null) return state;
  return { ...state, segmentStartedAt: state.segmentStartedAt + gapMs };
}

export function foldSegment(state: SessionState, at: number): SessionState {
  if (state.segmentStartedAt == null) return state;
  const elapsed = Math.max(0, at - state.segmentStartedAt);
  return {
    ...state,
    segmentStartedAt: null,
    accumulatedTrackingMs: state.accumulatedTrackingMs + elapsed,
  };
}
