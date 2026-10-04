import test from "node:test";
import assert from "node:assert/strict";
import { ARROW_DIRS, arrowDir, arrowPixels, ballPixels } from "../src/defend/projectile-art.ts";
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

test("every arrow points its head the way it flies, fletching behind, all outlined", () => {
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

test("cannon balls are round, outlined and lit", () => {
  for (const d of [4, 5]) {
    const { px, size } = ballPixels(d);
    assert.equal(size, d + 2);
    assert.equal(px[0], "", "corners are clear");
    assert.ok(px.includes(OUTLINE));
    assert.ok(px.includes("#8c8c96"), "a glint");
  }
});
