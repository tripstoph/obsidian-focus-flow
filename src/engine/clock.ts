import type { SessionState } from "../types";

export const SUSPEND_GAP_MS = 2_000;

export function trackingMs(state: SessionState, now: number): number {
  if (
    state.status === "RUNNING" &&
    state.segmentStartedAt != null &&
    state.segmentCountsTowardTarget
  ) {
    return state.accumulatedTrackingMs + Math.max(0, now - state.segmentStartedAt);
  }
  return state.accumulatedTrackingMs;
}

export function activeMs(state: SessionState, now: number): number {
  if (state.status === "RUNNING" && state.segmentStartedAt != null) {
    return state.accumulatedActiveMs + Math.max(0, now - state.segmentStartedAt);
  }
  return state.accumulatedActiveMs;
}

export function currentRemainingMs(state: SessionState, now: number): number {
  if (state.status === "RUNNING" && state.deadlineAt != null) {
    return state.deadlineAt - now;
  }
  return state.remainingMs;
}

export function shiftForSuspend(state: SessionState, gapMs: number): SessionState {
  if (state.status !== "RUNNING" || gapMs < SUSPEND_GAP_MS) return state;
  if (state.deadlineAt == null || state.segmentStartedAt == null) return state;
  return {
    ...state,
    deadlineAt: state.deadlineAt + gapMs,
    segmentStartedAt: state.segmentStartedAt + gapMs,
  };
}

export function foldSegment(state: SessionState, at: number): SessionState {
  if (state.segmentStartedAt == null) return state;
  const elapsed = Math.max(0, at - state.segmentStartedAt);
  return {
    ...state,
    segmentStartedAt: null,
    accumulatedActiveMs: state.accumulatedActiveMs + elapsed,
    accumulatedTrackingMs:
      state.accumulatedTrackingMs + (state.segmentCountsTowardTarget ? elapsed : 0),
    intervalWritingMs: state.intervalWritingMs + (state.phase === "WRITING" ? elapsed : 0),
    accumulatedWritingMs: state.accumulatedWritingMs + (state.phase === "WRITING" ? elapsed : 0),
  };
}

export function writingMs(state: SessionState, now: number): number {
  const live =
    state.status === "RUNNING" && state.phase === "WRITING" && state.segmentStartedAt != null
      ? Math.max(0, now - state.segmentStartedAt)
      : 0;
  return state.accumulatedWritingMs + live;
}

export function freezeClock(state: SessionState, now: number): SessionState {
  const folded = foldSegment(state, now);
  const remaining = state.deadlineAt == null ? state.remainingMs : state.deadlineAt - now;
  return {
    ...folded,
    status: "PAUSED",
    deadlineAt: null,
    remainingMs: remaining,
    segmentCountsTowardTarget: state.segmentCountsTowardTarget,
  };
}

export function thawClock(state: SessionState, now: number): SessionState {
  return {
    ...state,
    status: "RUNNING",
    deadlineAt: now + state.remainingMs,
    segmentStartedAt: now,
  };
}

export function extendDeadline(state: SessionState, now: number, addMs: number): SessionState {
  if (addMs <= 0) return state;
  if (state.status === "RUNNING" && state.deadlineAt != null) {
    const deadlineAt = state.deadlineAt + addMs;
    return {
      ...state,
      deadlineAt,
      remainingMs: deadlineAt - now,
      intervalDurationMs: state.intervalDurationMs + addMs,
    };
  }
  if (state.status === "PAUSED") {
    return {
      ...state,
      remainingMs: state.remainingMs + addMs,
      intervalDurationMs: state.intervalDurationMs + addMs,
    };
  }
  return state;
}
