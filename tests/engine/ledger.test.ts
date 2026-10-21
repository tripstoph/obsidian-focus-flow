import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startSession } from "../../src/engine/fsm";
import { applyEdit } from "../../src/engine/session";
import { editInDocument, frontmatterEnd } from "../../src/engine/word-ledger";

describe("words typed", () => {
  it("counts inserted words and ignores a later delete", () => {
    const started = startSession(0, "note.md");
    let doc = "";
    let step = applyEdit(started.state, editInDocument(doc, 0, 0, "alpha beta gamma"), 0);
    assert.equal(step.state.credit, 3);

    doc = "alpha beta gamma";
    step = applyEdit(step.state, editInDocument(doc, 0, "alpha ".length, ""), 1);
    assert.equal(step.state.credit, 3);
  });

  it("counts words in a second note", () => {
    const started = startSession(0, "note.md");
    const first = applyEdit(started.state, editInDocument("alpha", 5, 5, " beta", "note.md"), 0);
    const second = applyEdit(first.state, editInDocument("", 0, 0, "gamma delta", "other.md"), 1);
    assert.equal(second.state.credit, 3);
  });

  it("does not count a 40-word paste toward the ghost", () => {
    const started = startSession(0, "note.md");
    const paste = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");
    const step = applyEdit(started.state, editInDocument("", 0, 0, paste), 0);
    assert.equal(step.state.credit, 0);
    assert.equal(step.state.burstWords, 40);
  });

  it("drops a large paste when that paste is undone", () => {
    const started = startSession(0, "note.md");
    const paste = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");
    const pasted = applyEdit(started.state, editInDocument("", 0, 0, paste), 0);
    const undone = applyEdit(pasted.state, editInDocument(paste, 0, paste.length, "", "note.md", 0, "undo"), 1);
    assert.equal(undone.state.credit, 0);
    assert.equal(undone.state.burstWords, 0);
    const redone = applyEdit(undone.state, editInDocument("", 0, 0, paste, "note.md", 0, "redo"), 2);
    assert.equal(redone.state.credit, 0);
    assert.equal(redone.state.burstWords, 40);
  });

  it("ignores an edit that stays inside frontmatter", () => {
    const doc = "---\ntags: [a]\n---\n";
    assert.ok(frontmatterEnd(doc) > doc.indexOf("a"));
    const started = startSession(0, "note.md");
    const at = doc.indexOf("[a]");
    const step = applyEdit(started.state, editInDocument(doc, at + 1, at + 2, "ab"), 0);
    assert.equal(step.state.credit, 0);
  });

  it("ignores a note that is not markdown", () => {
    const started = startSession(0, "note.md");
    const step = applyEdit(started.state, editInDocument("", 0, 0, "alpha beta", "board.canvas"), 0);
    assert.equal(step.state.credit, 0);
  });
});
