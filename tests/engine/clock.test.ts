import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trackingMs } from "../../src/engine/clock";
import { endSession, startSession, suspendSession, tickSession } from "../../src/engine/fsm";
import { targetWords } from "../../src/engine/ghost";

describe("clock and session machine", () => {
  it("shifts a two-hour suspend without feeding the ghost", () => {
    const start = 1_000_000;
    const gap = 7_200_000;
    const started = startSession(start, "note.md");
    const suspended = suspendSession(started.state, gap);
    const now = start + gap;
    assert.equal(suspended.state.segmentStartedAt, start + gap);
    assert.equal(trackingMs(suspended.state, now), 0);
    assert.equal(targetWords(500, trackingMs(suspended.state, now)), 0);

    const workedUntil = start + 10_000;
    const ticked = tickSession(started.state, workedUntil + gap, workedUntil);
    assert.equal(trackingMs(ticked.state, workedUntil + gap), 10_000);
    assert.equal(targetWords(500, trackingMs(ticked.state, workedUntil + gap)), (500 / 3600) * 10);
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
