import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFont, FONT_FILES, readGlyphs, trace } from "../scripts/pixel-font/build.ts";

// Alembic, the pixel font: every printable ASCII character is drawn, and
// the committed font files are what scripts/pixel-font/build.ts makes.

test("Alembic draws every printable ASCII character, each glyph once", () => {
  const codes = readGlyphs().map((g) => g.code);
  assert.equal(new Set(codes).size, codes.length);
  for (let c = 33; c < 127; c++) assert.ok(codes.includes(c), `missing ${String.fromCharCode(c)}`);
});

test("glyph rows stand on the baseline, at most two below it", () => {
  for (const g of readGlyphs()) assert.ok(g.rows.length <= 9, `U+${g.code.toString(16)} is ${g.rows.length} rows`);
});

test("a pixel ring traces to an outer outline and a hole wound the other way", () => {
  const ring = ["###", "#.#", "###"].map((r) => [...r].map((c) => c === "#"));
  const area = (c: [number, number][]) => c.reduce((a, [x, y], i) => { const [x2, y2] = c[(i + 1) % c.length]; return a + x * y2 - x2 * y; }, 0) / 2;
  const [outer, hole] = trace(ring).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  assert.equal(outer.length, 4);
  assert.equal(hole.length, 4);
  assert.ok(area(outer) < 0, "outer runs clockwise");
  assert.ok(area(hole) > 0, "hole runs counterclockwise");
});

test("the committed font files match the glyphs (rebuild with scripts/pixel-font/build.ts)", () => {
  const glyphs = readGlyphs(), root = new URL("../", import.meta.url);
  assert.deepEqual(new Uint8Array(readFileSync(new URL(FONT_FILES.regular, root))), buildFont(glyphs, false));
  assert.deepEqual(new Uint8Array(readFileSync(new URL(FONT_FILES.bold, root))), buildFont(glyphs, true));
});
