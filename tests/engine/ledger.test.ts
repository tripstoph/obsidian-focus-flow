import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startSession } from "../../src/engine/fsm";
import { applyEdit } from "../../src/engine/session";
import { editInDocument, frontmatterEnd } from "../../src/engine/word-ledger";

describe("words typed", () => {
  it("counts inserted words and ignores a later delete", () => {
    const started = startSession(0, "note.md");
    let doc = "";
    let step = applyEdit(started.state, editInDocument(doc, 0, 0, "alpha beta gamma"));
    assert.equal(step.state.credit, 3);

    doc = "alpha beta gamma";
    step = applyEdit(step.state, editInDocument(doc, 0, "alpha ".length, ""));
    assert.equal(step.state.credit, 3);
  });

  it("counts words in a second note", () => {
    const started = startSession(0, "note.md");
    const first = applyEdit(started.state, editInDocument("alpha", 5, 5, " beta", "note.md"));
    const second = applyEdit(first.state, editInDocument("", 0, 0, "gamma delta", "other.md"));
    assert.equal(second.state.credit, 3);
  });

  it("does not count a paste of any size", () => {
    const started = startSession(0, "note.md");
    const small = applyEdit(started.state, editInDocument("", 0, 0, "alpha beta", "note.md", 0, "input.paste"));
    assert.equal(small.state.credit, 0);
    const paste = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");
    const large = applyEdit(small.state, editInDocument("", 0, 0, paste, "note.md", 0, "input.paste"));
    assert.equal(large.state.credit, 0);
    const prefixed = applyEdit(large.state, editInDocument("", 0, 0, "gamma", "note.md", 0, "input.paste.line"));
    assert.equal(prefixed.state.credit, 0);
  });

  it("leaves credit unchanged when a paste is undone or redone", () => {
    const started = startSession(0, "note.md");
    const paste = "alpha beta gamma";
    const pasted = applyEdit(started.state, editInDocument("", 0, 0, paste, "note.md", 0, "input.paste"));
    const undone = applyEdit(pasted.state, editInDocument(paste, 0, paste.length, "", "note.md", 0, "undo"));
    assert.equal(undone.state.credit, 0);
    const redone = applyEdit(undone.state, editInDocument("", 0, 0, paste, "note.md", 0, "redo"));
    assert.equal(redone.state.credit, 0);
  });

  it("does not subtract typed words on undo", () => {
    const started = startSession(0, "note.md");
    const typed = applyEdit(started.state, editInDocument("", 0, 0, "alpha"));
    const undone = applyEdit(typed.state, editInDocument("alpha", 0, "alpha".length, "", "note.md", 0, "undo"));
    assert.equal(undone.state.credit, 1);
  });

  it("counts dragged text", () => {
    const started = startSession(0, "note.md");
    const step = applyEdit(started.state, editInDocument("", 0, 0, "alpha beta", "note.md", 0, "input.drop"));
    assert.equal(step.state.credit, 2);
  });

  it("ignores an edit that stays inside frontmatter", () => {
    const doc = "---\ntags: [a]\n---\n";
    assert.ok(frontmatterEnd(doc) > doc.indexOf("a"));
    const started = startSession(0, "note.md");
    const at = doc.indexOf("[a]");
    const step = applyEdit(started.state, editInDocument(doc, at + 1, at + 2, "ab"));
    assert.equal(step.state.credit, 0);
  });

  it("ignores a note that is not markdown", () => {
    const started = startSession(0, "note.md");
    const step = applyEdit(started.state, editInDocument("", 0, 0, "alpha beta", "board.canvas"));
    assert.equal(step.state.credit, 0);
  });
});
