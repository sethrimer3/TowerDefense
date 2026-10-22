import test from "node:test";
import assert from "node:assert/strict";
import { SHIMMER, shimmerAt, shimmerPeriod, shimmerTargets } from "../src/defend/placed-shimmer.ts";
import type { Building, CityMap } from "../src/defend/citygen.ts";

const b = (id: number, kind: Building["kind"], x: number, y: number, extra: Partial<Building> = {}): Building =>
  ({ id, kind, cells: [], rect: { x, y, w: extra.rect?.w ?? 1, h: extra.rect?.h ?? 1 }, variant: 0, ...extra });

test("only what the player placed shimmers, a wall section once", () => {
  const map = { buildings: [
    b(0, "house", 0, 0, { rect: { x: 0, y: 0, w: 3, h: 3 } }),
    b(1, "wall", 10, 10),
    b(2, "archerTower", 20, 20, { structureUid: 5, rect: { x: 20, y: 20, w: 4, h: 4 } }),
    b(3, "keep", 30, 30, { structureUid: 0, rect: { x: 30, y: 30, w: 4, h: 4 } }),
    b(4, "gate", 40, 40, { rect: { x: 40, y: 40, w: 3, h: 2 } }),
    b(5, "wallBallista", 50, 50, { rect: { x: 50, y: 50, w: 2, h: 2 } }),
    b(6, "wall", 60, 60, { piece: true }), b(7, "wall", 61, 60, { piece: true }),
    b(8, "wall", 60, 61, { piece: true }), b(9, "wall", 61, 61, { piece: true }),
  ] } as unknown as CityMap;
  const rects = shimmerTargets(map).map((t) => t.rect);
  assert.deepEqual(rects.map((r) => [r.x, r.y, r.w, r.h]), [[20, 20, 4, 4], [30, 30, 4, 4], [40, 40, 3, 2], [50, 50, 2, 2], [60, 60, 2, 2]]);
  assert.equal(shimmerTargets(map), shimmerTargets(map), "cached per map");
});

test("a trace brightens round the loop, fades, and pieces take turns", () => {
  const many = { buildings: Array.from({ length: 40 }, (_, i) => b(i, "archerTower", i * 5, 0, { structureUid: i, rect: { x: i * 5, y: 0, w: 4, h: 4 } })) } as unknown as CityMap;
  const targets = shimmerTargets(many), period = shimmerPeriod(targets.length);
  const t = targets[3];
  const at = (x: typeof t, s: number) => shimmerAt(x, s, period);
  // Find a trace starting, then follow it.
  let start = 0;
  while (at(t, start) === null || at(t, start - 0.01) !== null) start += 0.01;
  const trace = SHIMMER.trace + SHIMMER.perCell * 16;
  const a = at(t, start + 0.1)!, mid = at(t, start + trace / 2)!, full = at(t, start + trace - 0.01)!;
  assert.ok(a.run < mid.run && mid.run < full.run && a.alpha < mid.alpha && mid.alpha < full.alpha);
  assert.ok(full.alpha > 0.99);
  const fading = at(t, start + trace + SHIMMER.fade / 2)!;
  assert.equal(fading.run, 1);
  assert.ok(fading.alpha > 0 && fading.alpha < 1);
  assert.equal(at(t, start + trace + SHIMMER.fade + 0.01), null);
  // Never all at once: over a long stretch at most a few trace together.
  let most = 0;
  for (let s = 0; s < 200; s += 0.1) most = Math.max(most, targets.filter((x) => at(x, s)).length);
  assert.ok(most <= 6, `at most ${most} of 12 together`);
});
