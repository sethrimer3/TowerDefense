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

test("book titles: distinct runic letters, most books titled, black or dark gold by cover", async () => {
  const { TITLE_GLYPHS, TITLE_SIZE, titleFor, titleInk } = await import("../src/library/glyphs.ts");
  const keys = new Set(TITLE_GLYPHS.map((g) => g.map(([x, y]) => `${x},${y}`).join(";")));
  assert.equal(keys.size, TITLE_GLYPHS.length, "every letter differs");
  for (const g of TITLE_GLYPHS) for (const [x, y] of g) assert.ok(x >= 0 && y >= 0 && x < TITLE_SIZE && y < TITLE_SIZE);
  const titles = Array.from({ length: 400 }, (_, s) => titleFor(s, 6));
  const titled = titles.filter((t) => t.length).length;
  assert.ok(titled > 250 && titled < 350, "about three in four books titled");
  for (const t of titles) assert.ok(t.length === 0 || t.length === 2 || t.length === 3);
  for (let s = 0; s < 100; s++) assert.ok(titleFor(s, 4).length <= 2, "short spines hold two letters");
  assert.deepEqual(titleFor(42, 6), titleFor(42, 6));
  assert.deepEqual(titleInk([138, 122, 90]), [40, 24, 12], "very dark brown on a light cover");
  assert.deepEqual(titleInk([47, 77, 122]), [150, 112, 40], "dark gold on a dark cover");
});
