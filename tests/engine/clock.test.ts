import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trackingMs } from "../../src/engine/clock";
import { endSession, startSession } from "../../src/engine/fsm";
import { targetWords } from "../../src/engine/ghost";

describe("clock and session machine", () => {
  it("keeps the ghost moving through a two-hour gap", () => {
    const start = 1_000_000;
    const gap = 7_200_000;
    const started = startSession(start, "note.md");
    const now = start + gap;
    assert.equal(trackingMs(started.state, now), gap);
    assert.equal(targetWords(500, trackingMs(started.state, now)), (500 / 3600) * (gap / 1000));
    const ended = endSession(started.state, now);
    assert.equal(ended.state.accumulatedTrackingMs, gap);
  });

  it("counts the whole session until stop", () => {
    const started = startSession(0, "note.md");
    assert.equal(trackingMs(started.state, 90_000), 90_000);
    const ended = endSession(started.state, 90_000);
    assert.equal(ended.state.status, "COMPLETED");
    assert.equal(ended.state.accumulatedTrackingMs, 90_000);
    assert.equal(ended.events.some((event) => event.type === "completed"), true);
  });
});
