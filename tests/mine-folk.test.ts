import test from "node:test";
import assert from "node:assert/strict";
import { minerAt, MINE_FOLK } from "../src/defend/mine-folk.ts";
import { MINE_BUILDINGS, MINE_LANE } from "../src/defend/tower-art.ts";

const inside = (x: number, y: number) =>
  MINE_BUILDINGS.some((b) => x > b.x0 && x < b.x1 + 1 && y > b.y0 && y < b.y1 + 1);

test("mine folk walk the yard between doors, never through a building", () => {
  let seen = 0;
  for (let n = 0; n < MINE_FOLK.count; n++)
    for (let s = 0; s < 300; s += 0.25) {
      const at = minerAt(3, n, s);
      if (!at) continue;
      seen++;
      assert.ok(!inside(at.x, at.y), `walker ${n} at ${s}s stands in a building`);
      assert.ok(at.y >= 0 && at.y <= MINE_LANE + 3 && at.x >= 0 && at.x <= 45);
    }
  assert.ok(seen > MINE_FOLK.count * 1200 * 0.25, "walkers are out a good share of the time");
});

test("mine folk are a pure function of mine, walker and time", () => {
  assert.deepEqual(minerAt(9, 2, 41.5), minerAt(9, 2, 41.5));
});

test("each trip starts at the door the last one ended at", () => {
  for (let n = 0; n < MINE_FOLK.count; n++) {
    let last: { x: number; y: number } | null = null, prev: { x: number; y: number } | null = null;
    for (let s = 0; s < 200; s += 0.05) {
      const at = minerAt(5, n, s);
      if (at && !prev && last) assert.ok(Math.abs(at.x - last.x) + Math.abs(at.y - last.y) < 1.5, "reappears where it went in");
      if (!at && prev) last = prev;
      prev = at;
    }
  }
});
