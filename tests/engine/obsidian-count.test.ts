import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { obsidianWordCount } from "../../src/engine/obsidian-count";
import { startSession } from "../../src/engine/fsm";
import { applyEdit } from "../../src/engine/session";
import { editInDocument } from "../../src/engine/word-ledger";

describe("obsidian word count", () => {
  it("counts whitespace-separated tokens and skips properties", () => {
    assert.equal(obsidianWordCount("alpha beta"), 2);
    assert.equal(obsidianWordCount("---\ntags: [a]\n---\nalpha beta"), 2);
    assert.equal(obsidianWordCount("hello,"), 1);
  });

  it("keeps a replaced word in the session total while the note stays flat", () => {
    const started = startSession(0, "note.md");
    const typed = applyEdit(started.state, editInDocument("", 0, 0, "alpha beta"), 0);
    const replaced = applyEdit(typed.state, editInDocument("alpha beta", 0, "alpha".length, "gamma"), 1);
    assert.equal(replaced.state.credit, 3);
    const note = replaced.state.noteCounts["note.md"];
    assert.equal(note.current - note.baseline, 2);
  });
});
