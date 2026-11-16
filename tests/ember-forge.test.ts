import test from "node:test";
import assert from "node:assert/strict";
import { areaForWave } from "../src/defend/areas.ts";
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { cellIndex, CELLS_W, CELLS_H } from "../src/defend/grid.ts";
import { bubbleAt, EMBER_FORGE, emberForgePlan, hasEmberForge, smokeAt, sparkAt } from "../src/defend/ember-forge.ts";
import { emberFloorSteps, fillCinder, rockPiece, scrapPiece, shardPiece, ventPiece } from "../src/defend/ember-forge-art.ts";
import { setSceneryOutlines } from "../src/defend/scenery-looks.ts";

const ART = 8, W = CELLS_W * ART, H = CELLS_H * ART;
function city() {
  const fit = fitLayout(defaultLayout());
  assert.ok(fit.ok);
  return generateCity(fit, 1);
}
function drain<T>(g: Generator<void, T, void>): T {
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

test("zone 4 is the Ember Forge, floored as a volcanic plain", () => {
  const area = areaForWave(61);
  assert.equal(area.id, "ember");
  assert.ok(hasEmberForge("ember") && !hasEmberForge("moss") && !hasEmberForge("drowned") && !hasEmberForge("desert"));
});

test("the forge plans pools, fissures, vents, obsidian, scrap and boulders on open ground, inside the board", () => {
  const map = city(), plan = emberForgePlan(map);
  assert.equal(emberForgePlan(map), plan);
  assert.ok(plan.pools.length >= 2 && plan.pools.length <= EMBER_FORGE.pools);
  assert.ok(plan.cracks.length >= 6 && plan.vents.length >= 4 && plan.shards.length >= 4 && plan.scrap.length >= 3 && plan.rocks.length >= 20, JSON.stringify({ c: plan.cracks.length, v: plan.vents.length, s: plan.shards.length, x: plan.scrap.length, r: plan.rocks.length }));
  const all = [...plan.pools, ...plan.vents, ...plan.shards, ...plan.scrap, ...plan.rocks];
  for (const f of all) {
    assert.equal(map.type[cellIndex(Math.floor(f.x), Math.floor(f.y))], CellType.OUT);
    assert.ok(f.x - f.r > 0 && f.y - f.r > 0 && f.x + f.r < CELLS_W && f.y + f.r < CELLS_H, "not cut off by the board's edge");
  }
  for (const c of plan.cracks) for (const p of c.points) assert.equal(map.type[cellIndex(Math.floor(p.x), Math.floor(p.y))], CellType.OUT);
  assert.equal(JSON.stringify(emberForgePlan(city())), JSON.stringify(plan), "planned from the map alone");
});

test("sparks rise off the vents, smoke drifts and bubbles swell on the pools", () => {
  const plan = emberForgePlan(city()), v = plan.vents[0], p = plan.pools[0];
  for (let k = 0; k < EMBER_FORGE.sparks; k++) {
    const a = sparkAt(v, k, 1), b = sparkAt(v, k, 1.3);
    assert.ok(a.show >= 0 && a.show <= 1 && a.age >= 0 && a.age < 1);
    assert.ok(a.y < v.y + 0.01 && Math.hypot(a.x - v.x, a.y - v.y) < 6);
    assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
  }
  for (let k = 0; k < EMBER_FORGE.smoke; k++) assert.ok(smokeAt(v, k, 3).show >= 0);
  for (let k = 0; k < EMBER_FORGE.bubbles; k++) {
    const b = bubbleAt(p, k, 2);
    assert.ok(b.swell >= 0 && b.swell <= 1 && Math.hypot(b.x - p.x, b.y - p.y) <= p.r);
  }
});

test("the floor covers every open cell and nothing else, and only lava glows", () => {
  const map = city(), plan = emberForgePlan(map), { floor, glow } = drain(emberFloorSteps(plan));
  let lit = 0;
  for (let y = 0; y < H; y += 3)
    for (let x = 0; x < W; x += 3) {
      const open = map.type[cellIndex(Math.floor(x / ART), Math.floor(y / ART))] === CellType.OUT, i = y * W + x;
      assert.equal(floor[i] !== 0, open, `pixel ${x},${y}`);
      if (!open) assert.equal(glow[i], 0);
      if (glow[i]) lit++;
    }
  assert.ok(lit > 50 && lit < (W * H) / 9 / 20, `${lit} glowing samples`);
});

test("the wilds' cinders meet the field's with no seam", () => {
  // A strip straddling the board's left edge, painted as the wilds paint it
  // (board corner 40 pixels in) and as the field does.
  const w = 80, h = 40, wild = new Uint32Array(w * h), field = new Uint32Array(W * H);
  drain(fillCinder(wild, w, h, 40, 0, () => true));
  drain(fillCinder(field, W, H, 0, 0, (x, y) => x < 40 && y < h));
  for (let y = 0; y < h; y++) for (let x = 0; x < 40; x++) assert.equal(wild[y * w + 40 + x], field[y * W + x], `${x},${y}`);
});

test("pieces are drawn bare: the outline is added only while scenery outlines are on", () => {
  const plan = emberForgePlan(city());
  const pieces = [rockPiece(plan.rocks[0]), ventPiece(plan.vents[0]), shardPiece(plan.shards[0]), ...plan.scrap.map(scrapPiece)];
  for (const p of pieces) {
    assert.ok(p.px.some((v) => v !== 0));
    // A clear border all round, where the outline goes.
    for (let x = 0; x < p.w; x++) assert.equal(p.px[x], 0);
    for (let y = 0; y < p.h; y++) assert.equal(p.px[y * p.w], 0);
  }
  const map = city(), plan2 = emberForgePlan(map);
  const inked = drain(emberFloorSteps(plan2)).floor;
  setSceneryOutlines(false);
  const bare = drain(emberFloorSteps(plan2)).floor;
  setSceneryOutlines(true);
  const INK = 0xff05060a;
  assert.ok(inked.filter((v) => v === INK).length > 100);
  assert.equal(bare.filter((v) => v === INK).length, 0);
});
