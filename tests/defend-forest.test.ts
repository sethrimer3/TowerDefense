// The forest outside Mossbound Ruins' walls (src/defend/forest.ts,
// forest-art.ts): where its trees, rocks and pads go, the trees blasts and
// charges blow up, and its pixel art. Presentation only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { CellType, generateCity } from "../src/defend/citygen.ts";
import { CELLS_H, CELLS_W, cellIndex } from "../src/defend/grid.ts";
import { ForestDamage, VARIANTS, clearOf, forestPlan, hasForest } from "../src/defend/forest.ts";
import { LEAN, floorPixels, leanOf, rockSprite, treeSprite } from "../src/defend/forest-art.ts";

const city = () => {
  const fit = fitLayout(defaultLayout());
  assert.ok(fit.ok);
  return generateCity(fit, 7);
};

test("only Mossbound Ruins has a forest", () => {
  assert.ok(hasForest("moss"));
  assert.ok(!hasForest("desert"));
});

test("the forest fills the open ground outside the walls and keeps off everything else", () => {
  const map = city(), plan = forestPlan(map);
  const open = map.type.filter((t) => t === CellType.OUT).length;
  assert.ok(plan.trees.length > open * 0.3, `${plan.trees.length} trees on ${open} open cells`);
  assert.ok(plan.rocks.length > 20 && plan.pads.length > 10);
  for (const t of plan.trees) {
    assert.equal(map.type[cellIndex(Math.floor(t.x), Math.floor(t.y))], CellType.OUT);
    assert.ok(clearOf(map, t.x, t.y, t.r), "a canopy reaches over a wall, street or building");
  }
  // Back to front, ids in drawing order.
  plan.trees.forEach((t, i) => {
    assert.equal(t.id, i);
    if (i) assert.ok(t.y >= plan.trees[i - 1].y);
  });
  assert.equal(forestPlan(map), plan, "planned once a map");
  assert.deepEqual(forestPlan(city()).trees, plan.trees, "the same map plans the same forest");
});

test("blasts and charges blow up the trees they reach, once, leaving craters", () => {
  const plan = forestPlan(city()), damage = new ForestDamage(plan);
  const t = plan.trees[Math.floor(plan.trees.length / 2)];
  const felled = damage.blast(t.x, t.y, 1.5);
  assert.ok(felled.some((f) => f.tree === t));
  for (const f of felled) assert.ok(Math.hypot(f.tree.x - t.x, f.tree.y - t.y) < 1.5 + f.tree.r);
  assert.equal(damage.craters.length, felled.length);
  assert.ok(!damage.standing(t));
  assert.equal(damage.blast(t.x, t.y, 1.5).length, 0, "a felled tree falls once");
  const far = plan.trees.find((o) => Math.hypot(o.x - t.x, o.y - t.y) > 6)!;
  assert.ok(damage.standing(far), "a blast leaves the trees beyond it alone");
  const v = damage.version;
  const cut = damage.cut(far.x - 2, far.y, far.x + 2, far.y, 0.3);
  assert.ok(cut.some((f) => f.tree === far));
  assert.ok(damage.version > v);
  // A brute-force check of the cell index: the same trees as testing every one.
  const fresh = new ForestDamage(plan), x = CELLS_W / 3, y = CELLS_H / 5;
  const want = plan.trees.filter((o) => Math.hypot(o.x - x, o.y - y) < 2.5 + o.r * 0.5).map((o) => o.id);
  assert.deepEqual(fresh.blast(x, y, 2.5).map((f) => f.tree.id), want);
});

test("tree sprites are outlined pixel art in five lean frames, their trunks still", () => {
  for (const kind of ["oak", "pine", "bush"] as const)
    for (let v = 0; v < VARIANTS; v++) {
      const frames = [-2, -1, 0, 1, 2].map((l) => treeSprite(kind, v, l));
      for (const s of frames) {
        assert.ok(s.px.some((p) => p === 0xff07090b), "a black outline");
        for (const p of s.px) assert.ok(p === 0 || p >>> 24 === 255, "opaque or clear");
      }
      assert.notDeepEqual(frames[0].px, frames[4].px, "leaning moves the canopy");
      // The bottom row (the trunk's foot, or the bush's own edge) doesn't sway.
      const last = (s: (typeof frames)[0]) => Array.from(s.px.slice((s.h - 1) * s.w));
      assert.deepEqual(last(frames[0]), last(frames[4]));
    }
  assert.ok(rockSprite(0.4, 9).px.some((p) => p === 0xff07090b));
});

test("trees lean with the wind, within their frames, and not at all in still air", () => {
  const t = forestPlan(city()).trees[0];
  const leans = new Set<number>();
  for (let s = 0; s < 30; s += 0.1) {
    const l = leanOf(t, s, 2);
    assert.ok(Math.abs(l) <= LEAN);
    leans.add(l);
    assert.equal(leanOf(t, s, 0), 0);
  }
  assert.ok(leans.size >= 3, "a tree sways through several frames");
});

test("the ground shows the standing trees' shadows and the felled trees' craters", () => {
  const plan = forestPlan(city()), damage = new ForestDamage(plan);
  const before = floorPixels(plan, damage);
  const t = plan.trees[10];
  damage.blast(t.x, t.y, 0.1);
  const after = floorPixels(plan, damage);
  const i = Math.round(t.y * 8) * CELLS_W * 8 + Math.round(t.x * 8);
  assert.notEqual(before[i], after[i], "a stump where the tree stood");
  assert.equal(after[i] >>> 24, 255);
});
