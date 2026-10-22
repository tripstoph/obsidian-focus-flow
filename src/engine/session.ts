import type { EngineEvent } from "./fsm";
import { isMarkdownPath, wordsTypedInEdit, type PreparedEdit } from "./word-ledger";
import type { SessionState } from "../types";

export interface EditStep {
  state: SessionState;
  events: EngineEvent[];
}

export function applyEdit(state: SessionState, edit: PreparedEdit): EditStep {
  if (state.status !== "RUNNING" || !isMarkdownPath(edit.path)) {
    return { state, events: [] };
  }
  if (isPaste(edit.userEvent) || isUndo(edit.userEvent) || isRedo(edit.userEvent)) {
    return { state, events: [] };
  }
  const added = wordsTypedInEdit(edit);
  if (added === 0) return { state, events: [] };
  return {
    state: { ...state, credit: state.credit + added },
    events: [],
  };
}

function isPaste(userEvent: string | null): boolean {
  return userEvent === "input.paste" || userEvent?.startsWith("input.paste.") === true;
}

function isUndo(userEvent: string | null): boolean {
  return userEvent === "undo" || userEvent?.startsWith("undo.") === true;
}

function isRedo(userEvent: string | null): boolean {
  return userEvent === "redo" || userEvent?.startsWith("redo.") === true;
}
