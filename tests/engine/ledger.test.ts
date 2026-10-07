import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { endSession, skipSession, startSession, type EngineEvent } from "../../src/engine/fsm";
import { applyEdit } from "../../src/engine/session";
import { editInDocument, frontmatterEnd, WordLedger, type PreparedEdit } from "../../src/engine/word-ledger";
import { configFromSettings, DEFAULT_SETTINGS, type SessionConfig, type SessionState } from "../../src/types";

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return { ...configFromSettings(DEFAULT_SETTINGS), ...overrides };
}

function beginWriting(doc: string, path = "note.md"): { state: SessionState; ledger: WordLedger; pace: SessionConfig } {
  const pace = config();
  const started = startSession(pace, 0, path, doc.length);
  const writing = skipSession(started.state, pace, 0);
  return { state: writing.state, ledger: WordLedger.empty(doc.length), pace };
}

function type(state: SessionState, ledger: WordLedger, pace: SessionConfig, doc: string, edit: PreparedEdit, now = 0) {
  return applyEdit(state, ledger, pace, edit, now);
}

describe("authored spans", () => {
  it("credits a sprint insert and ignores deletes of older text", () => {
    let doc = "alpha beta gamma";
    let { state, ledger, pace } = beginWriting(doc);
    let step = type(state, ledger, pace, doc, editInDocument(doc, doc.length, doc.length, " delta epsilon"));
    assert.equal(step.state.credit, 2);

    doc = "alpha beta gamma delta epsilon";
    step = type(step.state, step.ledger, pace, doc, editInDocument(doc, 0, "alpha beta gamma".length, ""));
    assert.equal(step.state.credit, 2);

    doc = " delta epsilon";
    const deltaAt = doc.indexOf("delta");
    step = type(step.state, step.ledger, pace, doc, editInDocument(doc, deltaAt, deltaAt + "delta".length, ""));
    assert.equal(step.state.credit, 1);
  });

  it("leaves thinking notes uncredited and keeps them out of later deletes", () => {
    const pace = config();
    let doc = "";
    let state = startSession(pace, 0, "note.md", 0).state;
    let ledger = WordLedger.empty(0);
    let step = type(state, ledger, pace, doc, editInDocument(doc, 0, 0, "outline one"));
    assert.equal(step.state.credit, 0);
    assert.equal(step.state.phase, "THINKING");

    doc = "outline one";
    state = skipSession(step.state, pace, 1_000).state;
    step = type(state, step.ledger, pace, doc, editInDocument(doc, doc.length, doc.length, " real prose"), 1_000);
    assert.equal(step.state.credit, 2);

    doc = "outline one real prose";
    step = type(step.state, step.ledger, pace, doc, editInDocument(doc, 0, "outline one".length, ""), 1_000);
    assert.equal(step.state.credit, 2);
  });

  it("counts a 40-word paste toward output and not toward peak pace", () => {
    const doc = "";
    const { state, ledger, pace } = beginWriting(doc);
    const paste = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");
    const step = type(state, ledger, pace, doc, editInDocument(doc, 0, 0, paste));
    assert.equal(step.state.credit, 40);
    assert.equal(step.state.burstWords, 40);
    assert.equal(step.state.intervalWords, 40);

    const ended = endSession(step.state, pace, 30_000);
    const round = ended.events.find((event): event is Extract<EngineEvent, { type: "round" }> => event.type === "round");
    assert.ok(round);
    assert.equal(round.paceWph, null);
    assert.equal(ended.state.credit, 40);
    assert.equal(ended.state.peakIntervalWph, 0);
  });

  it("ignores an edit in a different note", () => {
    const doc = "alpha";
    const { state, ledger, pace } = beginWriting(doc, "note.md");
    const step = type(state, ledger, pace, doc, editInDocument(doc, doc.length, doc.length, " beta", "other.md"));
    assert.equal(step.state.credit, 0);
    assert.equal(step.ledger, ledger);
  });

  it("ignores an edit that stays inside frontmatter", () => {
    const doc = "---\ntags: [a]\n---\n";
    assert.ok(frontmatterEnd(doc) > doc.indexOf("a"));
    const { state, ledger, pace } = beginWriting(doc);
    const at = doc.indexOf("[a]");
    const step = type(state, ledger, pace, doc, editInDocument(doc, at + 1, at + 2, "ab"));
    assert.equal(step.state.credit, 0);
  });

  it("keeps credit and clears spans when the document length disagrees", () => {
    const doc = "hello";
    const { state, ledger, pace } = beginWriting(doc);
    const credited = { ...state, credit: 5 };
    const mismatched = editInDocument(doc, doc.length, doc.length, " there");
    mismatched.oldLength = doc.length + 3;
    const step = type(credited, ledger, pace, doc, mismatched);
    assert.equal(step.state.credit, 5);
    assert.equal(step.state.resynced, true);
    let spanCount = 0;
    step.ledger.spans.between(0, 100, () => {
      spanCount += 1;
    });
    assert.equal(spanCount, 0);
  });

  it("reduces session credit but not the current interval when an older sprint word is deleted", () => {
    const pace = config();
    let doc = "";
    let state = skipSession(startSession(pace, 0, "note.md", 0).state, pace, 0).state;
    let ledger = WordLedger.empty(0);
    let step = type(state, ledger, pace, doc, editInDocument(doc, 0, 0, "one two"));
    assert.equal(step.state.credit, 2);
    assert.equal(step.state.writingGeneration, 1);

    doc = "one two";
    state = skipSession(skipSession(step.state, pace, 1_000).state, pace, 2_000).state;
    assert.equal(state.phase, "WRITING");
    assert.equal(state.writingGeneration, 2);
    assert.equal(state.intervalWords, 0);
    step = type(state, step.ledger, pace, doc, editInDocument(doc, 0, "one".length, ""), 2_000);
    assert.equal(step.state.credit, 1);
    assert.equal(step.state.intervalWords, 0);
  });
});
