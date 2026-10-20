import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appendSprintPoint, SPRINT_WINDOW_MS, sprintPaceWph } from "../../src/engine/sprint-pace";
import type { SprintPoint } from "../../src/types";

function at(minutes: number, words: number, previous: SprintPoint[] = []): SprintPoint[] {
  return appendSprintPoint(previous, minutes * 60_000, words - (previous.at(-1)?.words ?? 0));
}

describe("sprint pace", () => {
  it("stays unset until 15 minutes of writing", () => {
    const points = at(14, 200);
    assert.equal(sprintPaceWph(points, 14 * 60_000), null);
  });

  it("scores the words inside each rolling 15-minute window", () => {
    const points = at(2, 100);
    assert.equal(sprintPaceWph(points, SPRINT_WINDOW_MS), 400);
    assert.equal(sprintPaceWph(points, 17 * 60_000), 400);
  });

  it("keeps the denser stretch when an earlier window was slower", () => {
    let points = at(0, 10);
    assert.equal(sprintPaceWph(points, SPRINT_WINDOW_MS), 40);
    points = at(16, 210, points);
    assert.equal(sprintPaceWph(points, 16 * 60_000), 800);
  });

  it("scores a full 15 minutes from the middle of a longer session", () => {
    let points = at(61, 100);
    points = at(74, 600, points);
    points = at(90, 610, points);
    assert.equal(sprintPaceWph(points, 90 * 60_000), (600 * 3_600_000) / SPRINT_WINDOW_MS);
  });
});
