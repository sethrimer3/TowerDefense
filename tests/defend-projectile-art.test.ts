import test from "node:test";
import assert from "node:assert/strict";
import { ARROW_DIRS, arrowDir, arrowPixels, ballPixels, bulletPixels, BULLET_TRAIL } from "../src/defend/projectile-art.ts";
import { OUTLINE } from "../src/defend/pixel-fx.ts";

const HEAD = "#d9dde2";
const RED = "#c23a2a";

test("arrowDir picks the nearest of the sixteen headings, clockwise from right", () => {
  assert.equal(arrowDir(1, 0), 0);
  assert.equal(arrowDir(1, 1), 2);
  assert.equal(arrowDir(0, 1), 4);
  assert.equal(arrowDir(-1, 0), 8);
  assert.equal(arrowDir(0, -1), 12);
  assert.equal(arrowDir(1, -0.1), 0);
});

test("every arrow points its head the way it flies, fletching behind, without baked rims", () => {
  const seen = new Set<string>();
  for (let dir = 0; dir < ARROW_DIRS; dir++) {
    const px = arrowPixels(dir), n = Math.sqrt(px.length);
    const where = (color: string) => {
      let x = 0, y = 0, k = 0;
      px.forEach((p, i) => { if (p === color) { x += i % n; y += Math.floor(i / n); k++; } });
      return { x: x / k, y: y / k, k };
    };
    const head = where(HEAD), tail = where(RED);
    assert.ok(head.k > 0 && tail.k > 0, `heading ${dir} has a head and fletching`);
    const a = (dir / ARROW_DIRS) * Math.PI * 2;
    const along = (head.x - tail.x) * Math.cos(a) + (head.y - tail.y) * Math.sin(a);
    assert.ok(along > 3, `heading ${dir} points its head forward (${along.toFixed(2)})`);
    // Nothing coloured touches the sprite's edge, so the outline closes.
    for (let i = 0; i < n; i++)
      for (const j of [i, (n - 1) * n + i, i * n, i * n + n - 1]) assert.ok(!px[j] || px[j] === OUTLINE);
    seen.add(px.join());
  }
  assert.equal(seen.size, ARROW_DIRS);
});

test("cannon balls are round, outline-free and lit", () => {
  for (const d of [4, 5]) {
    const { px, size } = ballPixels(d);
    assert.equal(size, d + 2);
    assert.equal(px[0], "", "corners are clear");
    assert.ok(!px.includes(OUTLINE));
    assert.ok(px.includes("#8c8c96"), "a glint");
  }
});

test("a bullet is one pale yellow pixel trailing a fading fiery tail in a thin black outline", () => {
  const n = BULLET_TRAIL.length;
  const { data, n: side } = bulletPixels(0, n);
  const at = (hx: number, hy: number) => Array.from(data.slice((hy * side + hx) * 4, (hy * side + hx) * 4 + 4));
  const cell = (ax: number) => 1 + 2 * ax; // half-cell of art pixel ax along the middle row
  const row = cell(n);
  // The head: opaque pale yellow, over its whole 2 × 2 half cells.
  assert.deepEqual(at(cell(n), row), [255, 243, 166, 255]);
  assert.deepEqual(at(cell(n) + 1, row + 1), [255, 243, 166, 255]);
  // Ahead of it nothing but its half-pixel outline, opaque black.
  assert.deepEqual(at(cell(n) + 2, row), [0, 0, 0, 255]);
  assert.equal(at(cell(n) + 3, row)[3], 0);
  // Behind it the trail, fading out pixel by pixel.
  let last = 256;
  for (let i = 1; i <= n; i++) {
    const p = at(cell(n - i), row);
    assert.ok(p[3] < last && p[3] > 0, `trail ${i} fades`);
    assert.ok(p[0] > p[2], `trail ${i} is warm`);
    last = p[3];
  }
  // A fresh bullet has no trail yet.
  const fresh = bulletPixels(0, 0);
  assert.equal(fresh.data[((row * side) + cell(n - 1)) * 4 + 3], 0);
});
