import type { SessionState } from "../types";

export function trackingMs(state: SessionState, now: number): number {
  if (state.status === "RUNNING" && state.segmentStartedAt != null) {
    return state.accumulatedTrackingMs + Math.max(0, now - state.segmentStartedAt);
  }
  return state.accumulatedTrackingMs;
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
