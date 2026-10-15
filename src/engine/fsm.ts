import { foldSegment, shiftForSuspend } from "./clock";
import { idleSession, type SessionState } from "../types";

export type EngineEvent = { type: "completed" };

export interface StepResult {
  state: SessionState;
  events: EngineEvent[];
}

function result(state: SessionState, events: EngineEvent[] = []): StepResult {
  return { state, events };
}

export function startSession(now: number, boundPath: string | null): StepResult {
  return result({
    ...idleSession(),
    status: "RUNNING",
    boundPath,
    startedAt: now,
    segmentStartedAt: now,
  });
}

export function tickSession(state: SessionState, now: number, lastTick: number | null): StepResult {
  if (state.status !== "RUNNING") return result(state);
  if (lastTick != null && now - lastTick >= 2_000) {
    return result(shiftForSuspend(state, now - lastTick));
  }
  return result(state);
}

export function suspendSession(state: SessionState, gapMs: number): StepResult {
  return result(shiftForSuspend(state, gapMs));
}

export function endSession(state: SessionState, now: number): StepResult {
  if (state.status !== "RUNNING") return result(state);
  const folded = foldSegment(state, now);
  return result({ ...folded, status: "COMPLETED" }, [{ type: "completed" }]);
}

export function dismissSession(): StepResult {
  return result(idleSession());
}
