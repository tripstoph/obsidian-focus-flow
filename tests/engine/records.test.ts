import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyMarathon, applyRound, applySprintPace, applyVolume } from "../../src/engine/records";
import { emptyRecords } from "../../src/types";

describe("records", () => {
  it("updates a best only when the new value is strictly greater", () => {
    let records = emptyRecords();
    records = applyRound(records, { type: "round", words: 20, burst: 0, writingMs: 30_000, delta: 1, paceWph: 100 }, 10);
    assert.equal(records.apexSprintWph, 0);
    records = applySprintPace(records, 100, 10);
    assert.equal(records.apexSprintWph, 100);
    records = applySprintPace(records, 90, 11);
    assert.equal(records.apexSprintWph, 100);
    assert.equal(records.currentPositiveDeltaStreak, 1);
    assert.equal(records.positiveDeltaStreak, 1);

    records = applyRound(records, { type: "round", words: 20, burst: 0, writingMs: 30_000, delta: 0, paceWph: 100 }, 20);
    assert.equal(records.apexSprintWph, 100);
    assert.equal(records.currentPositiveDeltaStreak, 2);
    assert.equal(records.positiveDeltaStreak, 2);

    records = applyRound(records, { type: "round", words: 40, burst: 40, writingMs: 30_000, delta: -1, paceWph: null }, 30);
    assert.equal(records.apexSprintWph, 100);
    assert.equal(records.currentPositiveDeltaStreak, 0);

    records = applyVolume(records, 10, 40);
    records = applyVolume(records, 10, 50);
    assert.equal(records.volumeRecordWords, 10);
    records = applyVolume(records, 11, 60);
    assert.equal(records.volumeRecordWords, 11);

    records = applyMarathon(records, 1_000, 70);
    records = applyMarathon(records, 1_000, 80);
    assert.equal(records.flowMarathonMs, 1_000);
    records = applyMarathon(records, 1_001, 90);
    assert.equal(records.flowMarathonMs, 1_001);
  });
});
