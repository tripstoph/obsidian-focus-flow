import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCallout, formatPace, formatTarget } from "../../src/engine/format";
import { parseWordsPerHour, sanitizeSettings } from "../../src/engine/validate";

describe("formatPace", () => {
  it("states the pace in words per minute", () => {
    assert.equal(formatPace({ wordsPerHour: 500 }), "500 words per hour is about 8.3 words per minute.");
  });
});

describe("settings parsers", () => {
  it("accepts in-range values and rejects the rest", () => {
    assert.equal(parseWordsPerHour("500"), 500);
    assert.equal(parseWordsPerHour("49"), null);
    assert.equal(parseWordsPerHour("8.3"), null);
  });

  it("fills missing settings from the defaults", () => {
    const settings = sanitizeSettings({});
    assert.equal(settings.wordsPerHour, 500);
  });

  it("keeps a saved pace and ignores retired interval settings", () => {
    const settings = sanitizeSettings({ wordsPerHour: 800, thinkingMinutes: 5, writingMinutes: 10 });
    assert.equal(settings.wordsPerHour, 800);
  });
});

describe("callout", () => {
  it("is a markdown callout with the session line", () => {
    const callout = buildCallout({
      words: 420,
      targetWords: 380.4,
      delta: 40,
      activeMs: 48 * 60_000,
    });
    assert.equal(
      callout,
      ["> [!success] Focus Flow session", "> **Wrote** 420 words · ghost 380 · delta +40", "> **Active** 48 min"].join(
        "\n",
      ),
    );
    assert.equal(formatTarget(380.44), "380.4");
  });
});
