import test from "node:test";
import assert from "node:assert/strict";
import { AREAS, areaForWave } from "../src/defend/areas.ts";
import { AMBUSH_LEVELS } from "../src/campaign/levels.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { CellType } from "../src/defend/citygen.ts";
import { cellIndex } from "../src/defend/grid.ts";
import { fireflyAt, hasMagicForest, magicForestPlan, MAGIC_FOREST } from "../src/defend/magic-forest.ts";
import { cloverPixels, wispyTreePixels } from "../src/defend/magic-forest-art.ts";

test("the Crystal Caves (once the Drowned Temple) are the third zone and the Magic Forest a testing zone after the ten", () => {
  assert.equal(AREAS[2].id, "drowned");
  assert.equal(areaForWave(41).id, "drowned");
  assert.equal(areaForWave(61).id, "ember");
  assert.equal(areaForWave(201).id, "magic");
  assert.equal(areaForWave(201).name, "Magic Forest");
  assert.ok(hasMagicForest("magic") && !hasMagicForest("moss"));
  assert.equal(AMBUSH_LEVELS.length, 30);
  assert.ok(!AMBUSH_LEVELS.some((l) => l.area === "magic"));
  assert.equal(AMBUSH_LEVELS[6].area, "drowned");
  assert.equal(AMBUSH_LEVELS[6].name, "Gravel Road");
});

function city() {
  const layout = defaultLayout();
  const fit = fitLayout(layout);
  assert.ok(fit.ok);
  return generateCity(fit, 1);
}

test("the Magic Forest plants wispy trees on open ground, ringed by lightning bugs", () => {
  const map = city(), plan = magicForestPlan(map);
  assert.equal(magicForestPlan(map), plan);
  assert.ok(plan.trees.length >= 6 && plan.trees.length <= MAGIC_FOREST.trees);
  for (const t of plan.trees) assert.equal(map.type[cellIndex(Math.floor(t.x), Math.floor(t.y))], CellType.OUT);
  for (const a of plan.trees) for (const b of plan.trees) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r);
  for (const t of plan.trees) {
    const n = plan.flies.filter((f) => f.tree === t.id).length;
    assert.ok(n >= MAGIC_FOREST.flies[0] && n <= MAGIC_FOREST.flies[1]);
  }
  // The bugs stay near their tree, drift and blink.
  for (const f of plan.flies) {
    const t = plan.trees[f.tree], a = fireflyAt(f, t, 0), b = fireflyAt(f, t, 3);
    assert.ok(Math.hypot(a.x - t.x, a.y - t.y) <= t.r * 1.3 + 1.2);
    assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
    assert.ok(a.glow >= 0.2 && a.glow <= 1);
  }
});

test("clovers carpet every open cell and nothing else; trees are wispy, see-through", () => {
  const map = city(), plan = magicForestPlan(map), px = cloverPixels(plan), W = plan.open.length / 104 * 8;
  let covered = 0, open = 0;
  for (let i = 0; i < plan.open.length; i++) {
    const cx = i % (W / 8), cy = Math.floor(i / (W / 8)), p = px[(cy * 8 + 3) * W + cx * 8 + 3];
    if (plan.open[i]) { open++; if (p >>> 24 === 255) covered++; }
    else assert.equal(p, 0);
  }
  assert.equal(covered, open);
  const { pixels } = wispyTreePixels(plan.trees[0], 0);
  const alphas = new Set(Array.from(pixels, (p) => p >>> 24));
  assert.ok([...alphas].some((a) => a > 0 && a < 200), "translucent wisps");
  assert.notDeepEqual(wispyTreePixels(plan.trees[0], 0).pixels, wispyTreePixels(plan.trees[0], 3).pixels, "sways");
});
