import { test } from "node:test";
import assert from "node:assert/strict";
import { GLYPHS, GLYPH_FINE, GLYPH_SIZE, glowOf, glyphFor, glyphShare } from "../src/library/glyphs.ts";

test("enchanted book glyphs: distinct designs inside their square, steady per book", () => {
  assert.ok(GLYPHS.length >= 10);
  const keys = new Set(GLYPHS.map((g) => g.map(([x, y]) => `${x},${y}`).join(";")));
  assert.equal(keys.size, GLYPHS.length, "every design differs");
  for (const g of GLYPHS) {
    assert.ok(g.length >= 6);
    for (const [x, y] of g) assert.ok(x >= 0 && y >= 0 && x < GLYPH_SIZE && y < GLYPH_SIZE);
    const lit = new Set(g.map(([x, y]) => `${x},${y}`)), glow = glowOf(g);
    assert.equal(new Set(glow.map(([x, y]) => `${x},${y}`)).size, glow.length, "each glow pixel once");
    for (const [x, y] of glow) assert.ok(!lit.has(`${x},${y}`), "glow beside the strokes, not on them");
  }
  assert.equal(glyphFor(12, 2), glyphFor(12, 2));
  assert.ok(new Set(Array.from({ length: 60 }, (_, s) => glyphFor(s, 2))).size > 6, "books vary");
});

test("enchanted book glyphs fade in as the view zooms in", () => {
  assert.equal(glyphShare(4), 0);
  assert.equal(glyphShare(3 * GLYPH_FINE), 1);
  const mid = glyphShare(2.25 * GLYPH_FINE);
  assert.ok(mid > 0 && mid < 1);
});
