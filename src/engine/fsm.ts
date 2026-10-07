import { foldSegment, freezeClock, shiftForSuspend, thawClock, extendDeadline } from "./clock";
import { goalsSatisfied } from "./goals";
import { intervalPaceWph, targetWords } from "./ghost";
import { idleSession, type Phase, type SessionConfig, type SessionState } from "../types";

export type RoundEvent = {
  type: "round";
  words: number;
  burst: number;
  writingMs: number;
  delta: number;
  paceWph: number | null;
};

export type EngineEvent =
  | { type: "phase"; phase: Phase }
  | RoundEvent
  | { type: "goal" }
  | { type: "completed" };

export interface StepResult {
  state: SessionState;
  events: EngineEvent[];
}

function result(state: SessionState, events: EngineEvent[] = []): StepResult {
  return { state, events };
}

function finish(state: SessionState): SessionState {
  return {
    ...state,
    status: "COMPLETED",
    phase: null,
    deadlineAt: null,
    segmentStartedAt: null,
    remainingMs: 0,
    segmentCountsTowardTarget: false,
  };
}

function enterPhase(state: SessionState, phase: Phase, at: number, config: SessionConfig): SessionState {
  const duration = phase === "THINKING" ? config.thinkingMs : config.writingMs;
  const writing = phase === "WRITING";
  return {
    ...state,
    status: "RUNNING",
    phase,
    deadlineAt: at + duration,
    remainingMs: duration,
    segmentStartedAt: at,
    segmentCountsTowardTarget: writing || config.thinkingCountsTowardTarget,
    intervalDurationMs: duration,
    intervalWritingMs: writing ? 0 : state.intervalWritingMs,
    intervalWords: writing ? 0 : state.intervalWords,
    intervalBurstWords: writing ? 0 : state.intervalBurstWords,
    creditAtIntervalStart: writing ? state.credit : state.creditAtIntervalStart,
    writingGeneration: writing ? state.writingGeneration + 1 : state.writingGeneration,
    missingNote: false,
  };
}

function closeWriting(state: SessionState, config: SessionConfig): { state: SessionState; round: RoundEvent } {
  const pace = intervalPaceWph(state.intervalWords, state.intervalBurstWords, state.intervalWritingMs);
  const tracked = state.accumulatedTrackingMs - state.trackingAtRoundStart;
  const delta = state.intervalWords - targetWords(config.wordsPerHour, tracked);
  return {
    state: {
      ...state,
      roundsCompleted: state.roundsCompleted + 1,
      peakIntervalWph: pace == null ? state.peakIntervalWph : Math.max(state.peakIntervalWph, pace),
      trackingAtRoundStart: state.accumulatedTrackingMs,
    },
    round: {
      type: "round",
      words: state.intervalWords,
      burst: state.intervalBurstWords,
      writingMs: state.intervalWritingMs,
      delta,
      paceWph: pace,
    },
  };
}

function applyGoals(state: SessionState, config: SessionConfig, events: EngineEvent[]): StepResult {
  if (!goalsSatisfied(state, config)) return result(state, events);
  if (config.infiniteMode) {
    if (state.goalCelebrated) return result(state, events);
    return result({ ...state, goalCelebrated: true }, [...events, { type: "goal" }]);
  }
  return result(finish(state), [...events, { type: "goal" }, { type: "completed" }]);
}

function advance(state: SessionState, at: number, config: SessionConfig): StepResult {
  const folded = foldSegment(state, at);
  const events: EngineEvent[] = [];
  let next = folded;
  if (folded.phase === "WRITING") {
    const closed = closeWriting(folded, config);
    next = closed.state;
    events.push(closed.round);
  }
  const gated = applyGoals(next, config, events);
  if (gated.state.status === "COMPLETED") return gated;
  const phase: Phase = next.phase === "THINKING" ? "WRITING" : "THINKING";
  return result(enterPhase(gated.state, phase, at, config), [...gated.events, { type: "phase", phase }]);
}

export function startSession(
  config: SessionConfig,
  now: number,
  boundPath: string | null,
  docLength: number,
): StepResult {
  const state = enterPhase(
    {
      ...idleSession(),
      boundPath,
      startedAt: now,
      docLength,
      trackingAtRoundStart: 0,
    },
    "THINKING",
    now,
    config,
  );
  return result({ ...state, writingGeneration: 0 }, [{ type: "phase", phase: "THINKING" }]);
}

export function pauseSession(state: SessionState, now: number): StepResult {
  if (state.status !== "RUNNING") return result(state);
  return result(freezeClock(state, now));
}

export function resumeSession(state: SessionState, now: number): StepResult {
  if (state.status !== "PAUSED") return result(state);
  return result(thawClock(state, now));
}

export function extendSession(state: SessionState, now: number, addMs: number): StepResult {
  return result(extendDeadline(state, now, addMs));
}

export function skipSession(state: SessionState, config: SessionConfig, now: number): StepResult {
  if (state.status !== "RUNNING" && state.status !== "PAUSED") return result(state);
  const folded = state.status === "RUNNING" ? foldSegment(state, now) : state;
  return advance({ ...folded, segmentStartedAt: null }, now, config);
}

export function tickSession(
  state: SessionState,
  config: SessionConfig,
  now: number,
  lastTick: number | null,
): StepResult {
  if (state.status !== "RUNNING" || state.deadlineAt == null) return result(state);
  if (lastTick != null && now - lastTick >= 2000) {
    return result(shiftForSuspend(state, now - lastTick));
  }
  if (now < state.deadlineAt) return result(state);
  return advance(state, state.deadlineAt, config);
}

export function suspendSession(state: SessionState, gapMs: number): StepResult {
  return result(shiftForSuspend(state, gapMs));
}

export function endSession(state: SessionState, config: SessionConfig, now: number): StepResult {
  if (state.status !== "RUNNING" && state.status !== "PAUSED") return result(state);
  const folded = state.status === "RUNNING" ? foldSegment(state, now) : state;
  const events: EngineEvent[] = [];
  let next = folded;
  if (folded.phase === "WRITING") {
    const closed = closeWriting(folded, config);
    next = closed.state;
    events.push(closed.round);
  }
  return result(finish(next), [...events, { type: "completed" }]);
}

export function dismissSession(): StepResult {
  return result(idleSession());
}

export function settleEarlyGoal(state: SessionState, config: SessionConfig, now: number): StepResult {
  if (state.status !== "RUNNING" && state.status !== "PAUSED") return result(state);
  if (!goalsSatisfied(state, config)) return result(state);
  if (config.infiniteMode) {
    if (state.goalCelebrated) return result(state);
    return result({ ...state, goalCelebrated: true }, [{ type: "goal" }]);
  }
  const folded = state.status === "RUNNING" ? foldSegment(state, now) : state;
  const events: EngineEvent[] = [];
  let next = folded;
  if (folded.phase === "WRITING") {
    const closed = closeWriting(folded, config);
    next = closed.state;
    events.push(closed.round);
  }
  const finished = finish(next);
  if (goalsSatisfied(finished, config) || events.some((event) => event.type === "round")) {
    return result(finished, [...events, { type: "goal" }, { type: "completed" }]);
  }
  return result(finished, [...events, { type: "completed" }]);
}
