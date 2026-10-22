import { foldSegment } from "./clock";
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

export function endSession(state: SessionState, now: number): StepResult {
  if (state.status !== "RUNNING") return result(state);
  const folded = foldSegment(state, now);
  return result({ ...folded, status: "COMPLETED" }, [{ type: "completed" }]);
}

export function dismissSession(): StepResult {
  return result(idleSession());
}
