import assert from "node:assert/strict";
import { describe, it } from "node:test";

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const color = Number.parseInt(hex.slice(1), 16);
  const red = channel((color >> 16) & 255);
  const green = channel((color >> 8) & 255);
  const blue = channel(color & 255);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("delta contrast", () => {
  it("meets WCAG AA on the default light and dark backgrounds", () => {
    const pairs = [
      ["#0f7a4a", "#ffffff"],
      ["#526272", "#ffffff"],
      ["#9a6408", "#ffffff"],
      ["#5eecc0", "#202020"],
      ["#9eb0c2", "#202020"],
      ["#e6b15a", "#202020"],
      ["#5eecc0", "#1e1e1e"],
      ["#9eb0c2", "#1e1e1e"],
      ["#e6b15a", "#1e1e1e"],
    ];
    for (const [foreground, background] of pairs) {
      assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
    }
  });
});
