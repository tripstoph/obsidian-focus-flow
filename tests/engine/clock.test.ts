import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trackingMs } from "../../src/engine/clock";
import {
  endSession,
  extendSession,
  pauseSession,
  resumeSession,
  skipSession,
  startSession,
  suspendSession,
  tickSession,
} from "../../src/engine/fsm";
import { targetWords } from "../../src/engine/ghost";
import { configFromSettings, DEFAULT_SETTINGS, type SessionConfig } from "../../src/types";

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return { ...configFromSettings(DEFAULT_SETTINGS), ...overrides };
}

describe("clock and session machine", () => {
  it("shifts a two-hour suspend without feeding the ghost", () => {
    const start = 1_000_000;
    const gap = 7_200_000;
    const started = startSession(config(), start, "note.md", 0);
    const suspended = suspendSession(started.state, gap);
    const now = start + gap;
    assert.equal(suspended.state.deadlineAt, start + 300_000 + gap);
    assert.equal(suspended.state.segmentStartedAt, start + gap);
    assert.equal(trackingMs(suspended.state, now), 0);
    assert.equal(targetWords(500, trackingMs(suspended.state, now)), 0);

    const workedUntil = start + 10_000;
    const ticked = tickSession(started.state, config(), workedUntil + gap, workedUntil);
    assert.equal(trackingMs(ticked.state, workedUntil + gap), 10_000);
    assert.equal(targetWords(500, trackingMs(ticked.state, workedUntil + gap)), (500 / 3600) * 10);
  });

  it("opens the next interval at its full length after a skip", () => {
    const start = 1_000_000;
    const started = startSession(config(), start, "note.md", 0);
    const writing = skipSession(started.state, config(), start + 120_000);
    assert.equal(writing.state.phase, "WRITING");
    assert.equal(writing.state.deadlineAt, start + 120_000 + 600_000);

    const thinking = skipSession(writing.state, config(), start + 130_000);
    assert.equal(thinking.state.phase, "THINKING");
    assert.equal(thinking.state.deadlineAt, start + 130_000 + 300_000);
  });

  it("keeps fractional seconds across pause and resume", () => {
    const started = startSession(config({ thinkingMs: 10_000.5 }), 0, "note.md", 0);
    const paused = pauseSession(started.state, 1234.25);
    assert.equal(paused.state.status, "PAUSED");
    assert.equal(paused.state.remainingMs, 10_000.5 - 1234.25);
    const resumed = resumeSession(paused.state, 50_000);
    assert.equal(resumed.state.deadlineAt, 50_000 + paused.state.remainingMs);
    assert.equal(trackingMs(resumed.state, 50_000), 1234.25);

    const extended = extendSession(resumed.state, 50_000, 60_000);
    assert.equal(extended.state.deadlineAt, (resumed.state.deadlineAt ?? 0) + 60_000);
    assert.equal(trackingMs(extended.state, 50_000), trackingMs(resumed.state, 50_000));
    const ended = endSession(extended.state, config(), 50_000);
    assert.equal(ended.state.status, "COMPLETED");
  });
});
