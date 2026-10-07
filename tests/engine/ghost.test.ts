import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trackingMs } from "../../src/engine/clock";
import { pauseSession, skipSession, startSession } from "../../src/engine/fsm";
import { displayTrackingMs } from "../../src/engine/ghost";
import { configFromSettings, DEFAULT_SETTINGS } from "../../src/types";

describe("eased ghost", () => {
  it("hides thinking debt and spreads it evenly across writing", () => {
    const pace = configFromSettings(DEFAULT_SETTINGS);
    const started = startSession(pace, 0, "note.md", 0).state;
    const thinkingAt = 120_000;
    assert.equal(displayTrackingMs(started, thinkingAt, true), 0);
    assert.equal(trackingMs(started, thinkingAt), thinkingAt);

    const writing = skipSession(started, pace, thinkingAt).state;
    assert.equal(displayTrackingMs(writing, thinkingAt, true), 0);
    assert.equal(trackingMs(writing, thinkingAt), thinkingAt);

    const duration = writing.intervalDurationMs;
    const halfway = thinkingAt + duration / 2;
    assert.equal(displayTrackingMs(writing, halfway, true), (thinkingAt + duration) / 2);
    assert.equal(displayTrackingMs(writing, thinkingAt + duration, true), trackingMs(writing, thinkingAt + duration));
    assert.equal(displayTrackingMs(started, thinkingAt, false), trackingMs(started, thinkingAt));
  });

  it("keeps the spread still while writing is paused", () => {
    const pace = configFromSettings(DEFAULT_SETTINGS);
    const started = startSession(pace, 0, "note.md", 0).state;
    const writing = skipSession(started, pace, 120_000).state;
    const early = 180_000;
    const shown = displayTrackingMs(writing, early, true);
    const paused = pauseSession(writing, early).state;
    assert.equal(displayTrackingMs(paused, early + 30_000, true), shown);
  });
});
