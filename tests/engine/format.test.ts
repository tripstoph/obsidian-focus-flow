import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brokenLabels, buildCallout, formatPace, formatTarget, formatThinkingBurden } from "../../src/engine/format";
import { parseMaxRounds, parseMinutes, parseWordGoal, parseWordsPerHour, sanitizeSettings } from "../../src/engine/validate";
import { DEFAULT_SETTINGS, emptyRecords } from "../../src/types";

describe("formatPace", () => {
  it("states the fractional pace and the sprint burden", () => {
    assert.equal(
      formatPace({
        wordsPerHour: 500,
        thinkingMinutes: 5,
        writingMinutes: 10,
        thinkingCountsTowardTarget: true,
      }),
      "500 words per hour is about 8.3 words per minute. Across 5 minutes of thinking and 10 minutes of writing, that pace is about 12.5 words per minute during writing.",
    );
  });

  it("states the writing pace when thinking also counts", () => {
    assert.equal(
      formatThinkingBurden({ wordsPerHour: 500, thinkingMinutes: 5, writingMinutes: 10 }),
      "If the ghost advances during thinking, writing is about 12.5 words per minute.",
    );
  });

  it("keeps the writing pace when thinking is excluded", () => {
    assert.equal(
      formatPace({ ...DEFAULT_SETTINGS, thinkingCountsTowardTarget: false }),
      "500 words per hour is about 8.3 words per minute. During writing, that pace stays about 8.3 words per minute.",
    );
  });
});

describe("settings parsers", () => {
  it("accepts in-range values and rejects the rest", () => {
    assert.equal(parseWordsPerHour("500"), 500);
    assert.equal(parseWordsPerHour("49"), null);
    assert.equal(parseWordsPerHour("8.3"), null);
    assert.equal(parseMinutes("0.5"), 0.5);
    assert.equal(parseMinutes("180"), 180);
    assert.equal(parseMinutes("0.4"), null);
    assert.equal(parseMinutes("1.25"), null);
    assert.equal(parseMaxRounds("8"), 8);
    assert.equal(parseMaxRounds("0"), null);
    assert.equal(parseWordGoal("100000"), 100000);
    assert.equal(parseWordGoal("0"), null);
  });

  it("fills missing settings from the defaults", () => {
    const settings = sanitizeSettings({ wordsPerHour: 800 });
    assert.equal(settings.wordsPerHour, 800);
    assert.equal(settings.thinkingMinutes, 5);
    assert.equal(settings.infiniteMode, true);
    assert.equal(settings.audioEnabled, true);
  });
});

describe("callout", () => {
  it("is a markdown callout with the session line", () => {
    const callout = buildCallout({
      words: 420,
      targetWords: 380.4,
      delta: 40,
      activeMs: 48 * 60_000,
      rounds: 3,
      peakWph: 920,
      burstWords: 0,
    });
    assert.equal(
      callout,
      [
        "> [!success] Focus Flow session",
        "> **Wrote** 420 words · ghost 380 · delta +40",
        "> **Active** 48 min · 3 rounds · peak 920 WPH",
      ].join("\n"),
    );
    assert.equal(formatTarget(380.44), "380.4");
  });

  it("names a record only when the new value is greater", () => {
    const before = emptyRecords();
    const after = { ...before, volumeRecordWords: 12, positiveDeltaStreak: 2 };
    assert.deepEqual(brokenLabels(before, after), ["Volume record", "Positive delta streak"]);
    assert.deepEqual(brokenLabels(after, after), []);
  });
});
