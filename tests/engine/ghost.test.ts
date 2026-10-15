import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trackingMs } from "../../src/engine/clock";
import { startSession } from "../../src/engine/fsm";
import { targetWords } from "../../src/engine/ghost";

describe("ghost", () => {
  it("advances with the whole session", () => {
    const started = startSession(0, "note.md").state;
    const elapsed = 120_000;
    assert.equal(trackingMs(started, elapsed), elapsed);
    assert.equal(targetWords(500, elapsed), (500 / 3600) * 120);
  });
});
