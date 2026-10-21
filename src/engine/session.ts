import { trackingMs } from "./clock";
import type { EngineEvent } from "./fsm";
import { appendSprintPoint } from "./sprint-pace";
import { isMarkdownPath, PASTE_WORD_THRESHOLD, wordsRemovedInEdit, wordsTypedInEdit, type PreparedEdit } from "./word-ledger";
import type { SessionState } from "../types";

export interface EditStep {
  state: SessionState;
  events: EngineEvent[];
}

export function applyEdit(state: SessionState, edit: PreparedEdit, now: number): EditStep {
  if (state.status !== "RUNNING" || !isMarkdownPath(edit.path)) {
    return { state, events: [] };
  }
  const tracked = rememberNote(state, edit);
  if (isUndo(edit.userEvent)) return undoPaste(tracked, edit);
  if (isRedo(edit.userEvent)) return redoPaste(tracked, edit);
  const added = wordsTypedInEdit(edit);
  if (added.typed === 0 && added.burst === 0) return { state: tracked, events: [] };
  return {
    state: {
      ...tracked,
      credit: tracked.credit + added.typed,
      burstWords: tracked.burstWords + added.burst,
      sprintPoints: appendSprintPoint(tracked.sprintPoints, trackingMs(tracked, now), added.typed),
    },
    events: [],
  };
}

function rememberNote(state: SessionState, edit: PreparedEdit): SessionState {
  const prior = state.noteCounts[edit.path];
  return {
    ...state,
    noteCounts: {
      ...state.noteCounts,
      [edit.path]: {
        baseline: prior?.baseline ?? edit.wordsBefore,
        current: edit.wordsAfter,
      },
    },
  };
}

function undoPaste(state: SessionState, edit: PreparedEdit): EditStep {
  const removed = wordsRemovedInEdit(edit);
  if (removed < PASTE_WORD_THRESHOLD || state.burstWords === 0) return { state, events: [] };
  return {
    state: { ...state, burstWords: Math.max(0, state.burstWords - removed) },
    events: [],
  };
}

function redoPaste(state: SessionState, edit: PreparedEdit): EditStep {
  const added = wordsTypedInEdit(edit);
  if (added.burst === 0) return { state, events: [] };
  return {
    state: { ...state, burstWords: state.burstWords + added.burst },
    events: [],
  };
}

function isUndo(userEvent: string | null): boolean {
  return userEvent === "undo" || userEvent?.startsWith("undo.") === true;
}

function isRedo(userEvent: string | null): boolean {
  return userEvent === "redo" || userEvent?.startsWith("redo.") === true;
}
