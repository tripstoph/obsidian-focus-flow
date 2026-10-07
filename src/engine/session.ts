import { writingMs } from "./clock";
import { settleEarlyGoal, type EngineEvent } from "./fsm";
import { appendSprintPoint } from "./sprint-pace";
import { isMarkdownPath, VaultLedger, WordLedger, type PreparedEdit } from "./word-ledger";
import type { SessionConfig, SessionState } from "../types";

export interface EditStep {
  state: SessionState;
  ledger: VaultLedger;
  events: EngineEvent[];
}

export function applyEdit(
  state: SessionState,
  ledger: VaultLedger,
  config: SessionConfig,
  edit: PreparedEdit,
  now: number,
): EditStep {
  if (state.status !== "RUNNING" && state.status !== "PAUSED") {
    return { state, ledger, events: [] };
  }
  if (!isMarkdownPath(edit.path)) {
    return { state, ledger, events: [] };
  }
  const kind =
    state.status === "PAUSED" || state.phase == null
      ? "paused"
      : state.phase === "WRITING"
        ? "writing"
        : "thinking";
  const current = ledger.file(edit.path) ?? WordLedger.empty(edit.oldLength);
  const effect = current.apply(edit, kind, state.writingGeneration);
  const sprintDelta = state.status === "RUNNING" && state.phase === "WRITING" ? effect.sprintDelta : 0;
  let next: SessionState = {
    ...state,
    credit: Math.max(0, state.credit + effect.sessionDelta),
    burstWords: state.burstWords + effect.burstDelta,
    docLength: effect.ledger.docLength,
    resynced: state.resynced || effect.ledger.resynced,
    sprintPoints: appendSprintPoint(state.sprintPoints, writingMs(state, now), sprintDelta),
  };
  if (state.status === "RUNNING" && state.phase === "WRITING") {
    next = {
      ...next,
      intervalWords: Math.max(0, state.intervalWords + effect.intervalDelta),
      intervalBurstWords: state.intervalBurstWords + effect.burstDelta,
    };
  }
  const settled = settleEarlyGoal(next, config, now);
  return { state: settled.state, ledger: ledger.replace(edit.path, effect.ledger), events: settled.events };
}
