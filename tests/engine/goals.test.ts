import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { skipSession, startSession, tickSession } from "../../src/engine/fsm";
import { applyEdit } from "../../src/engine/session";
import { editInDocument, WordLedger } from "../../src/engine/word-ledger";
import { configFromSettings, DEFAULT_SETTINGS, type SessionConfig, type SessionState } from "../../src/types";

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return { ...configFromSettings(DEFAULT_SETTINGS), ...overrides };
}

function writing(pace: SessionConfig, docLength = 0): SessionState {
  return skipSession(startSession(pace, 0, "note.md", docLength).state, pace, 0).state;
}

describe("goals", () => {
  it("ends a finite word goal as soon as the words land", () => {
    const pace = config({ wordGoalEnabled: true, wordGoal: 2, infiniteMode: false });
    const state = writing(pace);
    const step = applyEdit(state, WordLedger.empty(0), pace, editInDocument("", 0, 0, "alpha beta"), 0);
    assert.equal(step.state.status, "COMPLETED");
    assert.ok(step.events.some((event) => event.type === "goal"));
    assert.ok(step.events.some((event) => event.type === "completed"));
  });

  it("celebrates an infinite goal once and keeps the session running", () => {
    const pace = config({ wordGoalEnabled: true, wordGoal: 2, infiniteMode: true });
    const state = writing(pace);
    const first = applyEdit(state, WordLedger.empty(0), pace, editInDocument("", 0, 0, "alpha beta"), 0);
    assert.equal(first.state.status, "RUNNING");
    assert.equal(first.events.filter((event) => event.type === "goal").length, 1);
    assert.equal(first.events.some((event) => event.type === "completed"), false);
    assert.equal(first.state.goalCelebrated, true);

    const second = applyEdit(
      first.state,
      first.ledger,
      pace,
      editInDocument("alpha beta", "alpha beta".length, "alpha beta".length, " gamma"),
      1,
    );
    assert.equal(second.state.status, "RUNNING");
    assert.equal(second.events.some((event) => event.type === "goal"), false);
    assert.equal(second.state.credit, 3);
  });

  it("requires both limits when the operator is AND", () => {
    const pace = config({
      wordGoalEnabled: true,
      wordGoal: 2,
      maxRoundsEnabled: true,
      maxRounds: 1,
      terminationOperator: "AND",
      infiniteMode: false,
    });
    const state = writing(pace);
    const edited = applyEdit(state, WordLedger.empty(0), pace, editInDocument("", 0, 0, "alpha beta"), 0);
    assert.equal(edited.state.status, "RUNNING");
    const deadline = edited.state.deadlineAt ?? 0;
    const finished = tickSession(edited.state, pace, deadline, deadline - 500);
    assert.equal(finished.state.status, "COMPLETED");
    assert.equal(finished.state.roundsCompleted, 1);
  });

  it("stops on the first limit when the operator is OR", () => {
    const pace = config({
      wordGoalEnabled: true,
      wordGoal: 2,
      maxRoundsEnabled: true,
      maxRounds: 8,
      terminationOperator: "OR",
      infiniteMode: false,
    });
    const state = writing(pace);
    const step = applyEdit(state, WordLedger.empty(0), pace, editInDocument("", 0, 0, "alpha beta"), 0);
    assert.equal(step.state.status, "COMPLETED");
    assert.equal(step.state.roundsCompleted, 1);
  });

  it("does not end by itself when neither limit is on", () => {
    const pace = config();
    const state = writing(pace);
    const step = applyEdit(state, WordLedger.empty(0), pace, editInDocument("", 0, 0, "alpha beta gamma"), 0);
    assert.equal(step.state.status, "RUNNING");
    assert.equal(step.events.length, 0);
  });
});
