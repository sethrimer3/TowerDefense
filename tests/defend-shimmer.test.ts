import test from "node:test";
import assert from "node:assert/strict";
import { SHIMMER, outlineRing, shimmerAt, shimmerPeriod, shimmerTargets } from "../src/defend/placed-shimmer.ts";
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

test("the ring hugs a sprite edge to edge, corners cut, clockwise from its top left", () => {
  // A 3 × 2 block with a clear pixel round it, and a notch out of its top right.
  const w = 5, h = 4, mask = new Uint8Array(w * h);
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2]]) mask[y * w + x] = 1;
  const { xs, ys } = outlineRing(mask, w, h);
  const ring = Array.from(xs, (x, i) => [x, ys[i]]);
  const key = (p: number[]) => p.join(",");
  // Every ring pixel touches the sprite edge to edge, and none is a corner.
  for (const [x, y] of ring) {
    assert.equal(mask[y * w + x], 0);
    assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => mask[(y + dy) * w + x + dx] === 1));
  }
  assert.ok(!ring.some((p) => key(p) === "0,0"), "the corner is cut");
  assert.ok(ring.some((p) => key(p) === "3,1"), "the notch is traced");
  assert.equal(ring.length, 9);
  // It starts at the top left and runs clockwise: along the top first.
  assert.deepEqual(ring.slice(0, 3).map(key), ["1,0", "2,0", "3,1"]);
  assert.equal(key(ring[ring.length - 1]), "0,1", "and ends coming back up the left");
});

test("placed wall sections touching edge to edge shimmer as one piece, round its outside", () => {
  const quarter = (id: number, x: number, y: number) =>
    [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy], i) => b(id * 4 + i, "wall", x + dx, y + dy, { piece: true }));
  // An L of three quarters, a ring of eight round a hole, and one touching the L only at a corner.
  const ring = [[0, 0], [2, 0], [4, 0], [0, 2], [4, 2], [0, 4], [2, 4], [4, 4]].map(([x, y], i) => quarter(10 + i, 40 + x, 40 + y)).flat();
  const map = { buildings: [
    b(0, "wall", 5, 5),
    ...quarter(1, 10, 10), ...quarter(2, 12, 10), ...quarter(3, 12, 12),
    ...quarter(4, 14, 14),
    ...ring,
  ] } as unknown as CityMap;
  const groups = shimmerTargets(map);
  assert.deepEqual(groups.map((t) => [t.rect.x, t.rect.y, t.rect.w, t.rect.h]).sort((a, c) => a[0] - c[0] || a[1] - c[1]),
    [[10, 10, 4, 4], [14, 14, 2, 2], [40, 40, 6, 6]], "the city's own wall stone never shimmers");
  const l = groups.find((t) => t.rect.x === 10)!;
  assert.equal(l.cells!.reduce((n, v) => n + v, 0), 12, "the L's missing corner stays open");
  // The ring's trace goes round its outside only, never into the hole.
  const loop = groups.find((t) => t.rect.x === 40)!;
  const w = 6 * 8 + 2, h = w, mask = new Uint8Array(w * h);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (loop.cells![y * 6 + x])
    for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) mask[(y * 8 + py + 1) * w + x * 8 + px + 1] = 1;
  const { xs, ys } = outlineRing(mask, w, h);
  assert.ok(xs.length > 0);
  for (let i = 0; i < xs.length; i++) assert.ok(xs[i] === 0 || ys[i] === 0 || xs[i] === w - 1 || ys[i] === h - 1, "only the outer edge");
});
