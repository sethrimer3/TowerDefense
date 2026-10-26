// The forest outside Mossbound Ruins' walls (src/defend/forest.ts,
// forest-art.ts, forest-grass.ts): where its trees of four sizes, berry
// bushes, rocks, pads, lakes and boulders go, its grass, the trees blasts and charges blow up, its pixel art, and
// the boulders blocking the way in the battle (the rest is presentation).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { CellType, generateCity } from "../src/defend/citygen.ts";
import { CELLS_H, CELLS_W, cellIndex } from "../src/defend/grid.ts";
import { BOULDERS, FOREST, ForestDamage, TOUGH, VARIANTS, boulderPlan, clearOf, forestPlan, hasForest } from "../src/defend/forest.ts";
import { LEAN, floorPixels, leanOf, rockSprite, treeSprite, turfAt } from "../src/defend/forest-art.ts";
import { forestBlades } from "../src/defend/forest-grass.ts";
import { DefendSim } from "../src/defend/sim.ts";
import { defaultDefendSave } from "../src/defend/progress.ts";

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
  assert.ok(plan.trees.length > open * 0.08, `${plan.trees.length} trees on ${open} open cells`);
  const bushes = plan.trees.filter((t) => t.kind === "bush");
  assert.equal(bushes.length, FOREST.bushes, "a few berry bushes");
  assert.ok(plan.trees.every((t) => (t.kind === "bush") === (t.size === 0)), "only big trees besides the bushes");
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
  for (const size of [0, 1, 2, 3] as const)
  for (const kind of size ? (["oak", "pine"] as const) : (["oak", "pine", "bush"] as const))
    for (let v = 0; v < VARIANTS; v++) {
      const frames = [-2, -1, 0, 1, 2].map((l) => treeSprite(kind, v, l, size));
      for (const s of frames) {
        assert.ok(s.px.some((p) => p === 0xff07090b), "a black outline");
        for (const p of s.px) assert.ok(p === 0 || p >>> 24 === 255, "opaque or clear");
      }
      assert.notDeepEqual(frames[0].px, frames[4].px, "leaning moves the canopy");
      assert.ok(s0Trunkless(frames[2]), "seen from above: no trunk under the crown");
      // The bottom row (the canopy's skirt) doesn't sway.
      const last = (s: (typeof frames)[0]) => Array.from(s.px.slice((s.h - 1) * s.w));
      assert.deepEqual(last(frames[0]), last(frames[4]));
    }
  assert.ok(rockSprite(0.4, 9).px.some((p) => p === 0xff07090b));
});

/** No bark-brown pixels: the trunk is hidden under the crown from above. */
function s0Trunkless(s: { px: Uint32Array }) {
  return !s.px.some((p) => p === 0xff1c2a3e || p === 0xff29415e);
}

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
  const t = plan.trees.find((o) => o.size === 1)!;
  damage.blast(t.x, t.y, 0.6);
  const after = floorPixels(plan, damage);
  const i = Math.round(t.y * 8) * CELLS_W * 8 + Math.round(t.x * 8);
  assert.notEqual(before[i], after[i], "a stump where the tree stood");
  assert.equal(after[i] >>> 24, 255);
});

test("large, larger and huge trees stand among the rest, and only big blasts fell them", () => {
  const plan = forestPlan(city());
  const count = [0, 1, 2, 3].map((n) => plan.trees.filter((t) => t.size === n).length);
  assert.ok(count[0] === FOREST.bushes && count[1] > 100 && count[2] > 50 && count[3] > 30, `sizes ${count}`);
  for (const n of [2, 3] as const) {
    const big = plan.trees.filter((t) => t.size === n);
    assert.ok(Math.min(...big.map((t) => t.r)) > Math.max(...plan.trees.filter((t) => t.size === n - 1).map((t) => t.r)) - 0.3, "each size bigger than the last");
    assert.ok(Math.min(...big.map((t) => t.r)) > 0.6);
  }
  const sprite = (n: 0 | 1 | 2 | 3) => treeSprite("oak", 0, 0, n).w;
  assert.ok(sprite(0) < sprite(1) && sprite(1) < sprite(2) && sprite(2) < sprite(3));
  const huge = plan.trees.find((t) => t.size === 3)!, damage = new ForestDamage(plan);
  assert.equal(damage.blast(huge.x, huge.y, TOUGH[3] - 0.1).filter((f) => f.tree === huge).length, 0, "a small blast leaves a huge tree");
  assert.equal(damage.cut(huge.x - 2, huge.y, huge.x + 2, huge.y, 0.3).filter((f) => f.tree === huge).length, 0, "a charge passes a huge tree");
  assert.ok(damage.blast(huge.x, huge.y, TOUGH[3]).some((f) => f.tree === huge));
  assert.ok(damage.craters.at(-1)!.r > 2, "and leaves a great crater");
});

test("a few lakes lie in the open, spread over the board, kept clear of trees", () => {
  const map = city(), plan = forestPlan(map);
  assert.equal(plan.lakes.length, 3);
  const ys = [...plan.lakes.map((l) => l.discs[0].y), ...plan.trees.filter((t) => t.kind === "bush").map((t) => t.y)];
  assert.ok(Math.max(...ys) - Math.min(...ys) > CELLS_H / 3, "not all in the top rows");
  for (const l of plan.lakes)
    for (const d of l.discs) {
      assert.ok(clearOf(map, d.x, d.y, d.r), "a lake reaches into the city");
      for (const t of plan.trees) assert.ok(Math.hypot(t.x - d.x, t.y - d.y) > d.r, "a tree stands in a lake");
    }
  // Painted: water's blue where the lake's middle is.
  const floor = floorPixels(plan, null), d = plan.lakes[0].discs[0];
  const p = floor[Math.round(d.y * 8) * CELLS_W * 8 + Math.round(d.x * 8)];
  assert.ok(((p >> 16) & 0xff) > (p & 0xff), "blue water");
});

test("boulders and clusters keep off the city, the spawn rows and each other, and wall nothing in", () => {
  const map = city(), plan = boulderPlan(map);
  assert.ok(plan.length > 10 && plan.some((b) => b.cells.length >= 3) && plan.some((b) => b.cells.length === 1));
  const rock = new Uint8Array(map.type.length);
  for (const b of plan)
    for (const c of b.cells) {
      const x = c % CELLS_W, y = Math.floor(c / CELLS_W);
      assert.ok(y >= BOULDERS.top, "in the spawn rows");
      for (let dy = -BOULDERS.clear; dy <= BOULDERS.clear; dy++)
        for (let dx = -BOULDERS.clear; dx <= BOULDERS.clear; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < CELLS_W && ny < CELLS_H) assert.equal(map.type[cellIndex(nx, ny)], CellType.OUT);
        }
      rock[c] = 1;
    }
  // Every open cell is still reached from every other, a step at a time.
  const open = (i: number) => map.type[i] === CellType.OUT && !rock[i];
  const start = map.type.findIndex((_, i) => open(i)), seen = new Uint8Array(map.type.length), todo = [start];
  seen[start] = 1;
  while (todo.length) {
    const i = todo.pop()!, x = i % CELLS_W, y = Math.floor(i / CELLS_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = cellIndex(nx, ny);
      if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H || seen[n] || !open(n)) continue;
      seen[n] = 1;
      todo.push(n);
    }
  }
  map.type.forEach((_, i) => open(i) && assert.ok(seen[i], `open cell ${i} walled in`));
  const trees = forestPlan(map).trees;
  for (const b of plan) for (const c of b.cells) for (const t of trees) assert.ok(Math.hypot(t.x - (c % CELLS_W) - 0.5, t.y - Math.floor(c / CELLS_W) - 0.5) > 0.6, "a tree on a boulder");
});

test("in the battle, boulders block those on foot in Mossbound Ruins only", () => {
  const map = city(), cells = boulderPlan(map).flatMap((b) => b.cells);
  const sim = new DefendSim(map, defaultDefendSave().levels, 3);
  sim.step(1 / 60);
  for (const c of cells) {
    assert.equal(sim.solid[c], 1);
    assert.equal(sim.rocks[c], 1);
  }
  sim.computeField();
  for (const c of cells) assert.equal(sim.field[c], Infinity, "the enemy's way runs through a boulder");
  const far = new DefendSim(map, defaultDefendSave().levels, 3);
  far.startAt(22);
  far.step(1 / 60);
  for (const c of cells) assert.equal(far.solid[c] + far.rocks[c], 0, "boulders outside Mossbound Ruins");
});

test("small mountains: big heaps, filled solid, drawn as rocky hills", () => {
  const map = city(), plan = boulderPlan(map);
  const big = plan.filter((b) => b.cells.length >= 14);
  assert.ok(big.length >= 3, `${big.length} mountains`);
  assert.ok(plan.some((b) => b.cells.length >= 7 && b.cells.length < 14), "larger clusters too");
  const floor = floorPixels(forestPlan(map), null), m = big[0], c = m.cells[Math.floor(m.cells.length / 2)];
  const grey = m.cells.filter((c) => {
    const p = floor[(Math.floor(c / CELLS_W) * 8 + 4) * CELLS_W * 8 + (c % CELLS_W) * 8 + 4];
    return p >>> 24 === 255 && Math.abs((p & 0xff) - ((p >> 16) & 0xff)) < 40;
  });
  assert.ok(grey.length > m.cells.length / 2 && c >= 0, "stone over the mountain's cells");
});

test("berry bushes are small, red-berried and outlined; the middle of a crown has no square", () => {
  for (let v = 0; v < VARIANTS; v++) {
    const s = treeSprite("bush", v, 0, 0);
    assert.ok(s.px.some((p) => p === 0xff3a30c8), "red berries");
    assert.ok(s.w < treeSprite("oak", v, 0, 1).w, "smaller than a large tree");
  }
  // A pine's middle: no lit dot ringed in dark.
  for (let v = 0; v < VARIANTS; v++) {
    const s = treeSprite("pine", v, 0, 3), mid = s.px[s.oy * s.w + s.ox];
    const ring = [-2, 2].flatMap((d) => [s.px[(s.oy + d) * s.w + s.ox], s.px[s.oy * s.w + s.ox + d]]);
    const lum = (p: number) => (p & 0xff) + ((p >> 8) & 0xff) + ((p >> 16) & 0xff);
    assert.ok(!ring.every((p) => lum(p) < lum(mid) - 60), "a bright dot boxed in at the middle");
  }
});

test("the open ground is grass with blades, and blasts and burning ground clear it to dirt", () => {
  const map = city(), plan = forestPlan(map), damage = new ForestDamage(plan);
  assert.ok(plan.open.length === map.type.length);
  const before = floorPixels(plan, damage);
  let grass = 0, open = 0;
  for (let i = 0; i < plan.open.length; i++) {
    if (!plan.open[i]) continue;
    open++;
    const X = (i % CELLS_W) * 8 + 4, Y = Math.floor(i / CELLS_W) * 8 + 4;
    if (turfAt(X, Y)) grass++;
  }
  assert.ok(grass > open * 0.5, `${grass} of ${open} open cells grassed`);
  const inside = map.type.findIndex((t) => t !== CellType.OUT);
  assert.equal(before[Math.floor(inside / CELLS_W) * 8 * CELLS_W * 8 + (inside % CELLS_W) * 8], 0, "no grass in the city");
  const blades = forestBlades(plan), count = blades.reduce((n, b) => n + (b?.length ?? 0), 0);
  assert.ok(count > open * 2, `${count} blades`);
  blades.forEach((b, i) => b && assert.equal(plan.open[i], 1, "a blade off the open ground"));
  // A blast on open grass bares it, once.
  let spot = -1;
  for (let i = 0; i < plan.open.length && spot < 0; i++) {
    const X = (i % CELLS_W) * 8 + 4, Y = Math.floor(i / CELLS_W) * 8 + 4;
    if (plan.open[i] && turfAt(X, Y) && Math.floor(i / CELLS_W) > 10) spot = i;
  }
  const x = (spot % CELLS_W) + 0.5, y = Math.floor(spot / CELLS_W) + 0.5;
  assert.ok(damage.clear(x, y, 1.2));
  assert.ok(!damage.clear(x, y, 1.2), "the same ground again clears nothing");
  floorPixels(plan, damage);
  assert.ok(!turfAt(Math.round(x * 8), Math.round(y * 8)), "dirt where the blast fell");
  assert.ok(!damage.clear(-5, -5, 1), "off the board clears nothing");
});
