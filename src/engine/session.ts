import { trackingMs } from "./clock";
import type { EngineEvent } from "./fsm";
import { appendSprintPoint } from "./sprint-pace";
import { isMarkdownPath, wordsTypedInEdit, type PreparedEdit } from "./word-ledger";
import type { SessionState } from "../types";

export interface EditStep {
  state: SessionState;
  events: EngineEvent[];
}

export function applyEdit(state: SessionState, edit: PreparedEdit, now: number): EditStep {
  if (state.status !== "RUNNING" || !isMarkdownPath(edit.path)) {
    return { state, events: [] };
  }
  const added = wordsTypedInEdit(edit);
  if (added.typed === 0 && added.burst === 0) return { state, events: [] };
  return {
    state: {
      ...state,
      credit: state.credit + added.typed,
      burstWords: state.burstWords + added.burst,
      sprintPoints: appendSprintPoint(state.sprintPoints, trackingMs(state, now), added.typed),
    },
    events: [],
  };
}
