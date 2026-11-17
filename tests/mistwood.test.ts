import test from "node:test";
import assert from "node:assert/strict";
import { areaForWave } from "../src/defend/areas.ts";
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { cellIndex, CELLS_W, CELLS_H, CELL_COUNT } from "../src/defend/grid.ts";
import { DefendSim } from "../src/defend/sim.ts";
import { UPGRADES } from "../src/defend/catalog.ts";
import { Atmosphere, MIST, hiddenInMist } from "../src/defend/atmosphere.ts";
import { MISTWOOD, hasMistwood, mistwoodPlan, wispAt } from "../src/defend/mistwood.ts";
import { boulderPiece, crownPiece, fernPiece, fillMoss, logPiece, menhirPiece, mistwoodFloorSteps, stumpPiece } from "../src/defend/mistwood-art.ts";
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
function battle() {
  const sim = new DefendSim(city(), Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as any, 4);
  sim.wave = 101; sim.breakT = 1e9;
  sim.atmosphere = new Atmosphere();
  return sim;
}
const run = (sim: DefendSim, seconds: number) => { for (let i = 0; i < seconds * 10; i++) sim.atmosphere!.step(sim, .1); };
const open = (sim: DefendSim) => [...Array(CELL_COUNT).keys()].filter((i) => !sim.map.city[i] && !sim.map.wall[i] && !sim.solid[i]);
const mean = (sim: DefendSim, cells: number[]) => cells.reduce((s, i) => s + sim.atmosphere!.air[i], 0) / cells.length;

test("zone 6 is the Mistwood, a misty forest that never rains", () => {
  const area = areaForWave(101);
  assert.equal(area.id, "fungal");
  assert.equal(area.name, "Mistwood");
  assert.ok(hasMistwood("fungal") && !hasMistwood("moss") && !hasMistwood("ember") && !hasMistwood("magic"));
});

test("the wood plans its trees, stones, rings, wells, logs, stumps, boulders and ferns on open ground, inside the board", () => {
  const map = city(), plan = mistwoodPlan(map);
  assert.equal(mistwoodPlan(map), plan);
  const counts = { t: plan.trees.length, s: plan.stones.length, r: plan.rings.length, w: plan.wells.length, l: plan.logs.length, st: plan.stumps.length, b: plan.boulders.length, f: plan.ferns.length };
  assert.ok(counts.t >= 3 && counts.t <= MISTWOOD.trees && counts.s >= 4 && counts.r >= 2 && counts.l >= 2 && counts.st >= 2 && counts.b >= 8 && counts.f >= 12, JSON.stringify(counts));
  const at = (x: number, y: number) => map.type[cellIndex(Math.floor(x), Math.floor(y))];
  for (const f of [...plan.rings, ...plan.wells, ...plan.stumps, ...plan.boulders, ...plan.ferns]) {
    assert.equal(at(f.x, f.y), CellType.OUT);
    assert.ok(f.x - f.r > 0 && f.y - f.r > 0 && f.x + f.r < CELLS_W && f.y + f.r < CELLS_H, "not cut off by the board's edge");
  }
  for (const t of plan.trees) assert.equal(at(t.x, t.y), CellType.OUT, "a trunk stands on open ground");
  for (const s of [...plan.stones, ...plan.circles.flatMap((c) => c.stones)]) assert.equal(at(s.x, s.y), CellType.OUT);
  assert.equal(JSON.stringify(mistwoodPlan(city())), JSON.stringify(plan), "planned from the map alone");
});

test("wisps drift round their homes and glow", () => {
  const plan = mistwoodPlan(city());
  assert.ok(plan.homes.length >= 3);
  for (const home of plan.homes)
    for (let k = 0; k < MISTWOOD.wisps; k++) {
      const a = wispAt(home, k, 1), b = wispAt(home, k, 2.5);
      assert.ok(a.glow >= 0 && a.glow <= 1 && Math.hypot(a.x - home.x, a.y - home.y) < home.r + 3);
      assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
    }
});

test("the floor covers every open cell and nothing else, and some of it glows", () => {
  const map = city(), plan = mistwoodPlan(map), { floor, glow } = drain(mistwoodFloorSteps(plan));
  let lit = 0;
  for (let y = 0; y < H; y += 3)
    for (let x = 0; x < W; x += 3) {
      const isOpen = map.type[cellIndex(Math.floor(x / ART), Math.floor(y / ART))] === CellType.OUT, i = y * W + x;
      assert.equal(floor[i] !== 0, isOpen, `pixel ${x},${y}`);
      if (!isOpen) assert.equal(glow[i], 0);
      if (glow[i]) lit++;
    }
  assert.ok(lit > 10 && lit < (W * H) / 9 / 30, `${lit} glowing samples`);
});

test("the wilds' moss meets the field's with no seam", () => {
  const w = 80, h = 40, wild = new Uint32Array(w * h), field = new Uint32Array(W * H);
  drain(fillMoss(wild, w, h, 40, 0, () => true));
  drain(fillMoss(field, W, H, 0, 0, (x, y) => x < 40 && y < h));
  for (let y = 0; y < h; y++) for (let x = 0; x < 40; x++) assert.equal(wild[y * w + 40 + x], field[y * W + x], `${x},${y}`);
});

test("pieces are drawn bare: the outline is added only while scenery outlines are on", () => {
  const plan = mistwoodPlan(city());
  const pieces = [crownPiece(plan.trees[0]), menhirPiece(plan.stones[0]), logPiece(plan.logs[0]), stumpPiece(plan.stumps[0]), boulderPiece(plan.boulders[0]), fernPiece(plan.ferns[0])];
  for (const p of pieces) {
    assert.ok(p.px.some((v) => v !== 0));
    for (let x = 0; x < p.w; x++) assert.equal(p.px[x], 0);
    for (let y = 0; y < p.h; y++) assert.equal(p.px[y * p.w], 0);
  }
  const map = city(), plan2 = mistwoodPlan(map);
  const inked = drain(mistwoodFloorSteps(plan2)).floor;
  setSceneryOutlines(false);
  const bare = drain(mistwoodFloorSteps(plan2)).floor;
  setSceneryOutlines(true);
  const INK = 0xff05060a;
  assert.ok(inked.filter((v) => v === INK).length > 100);
  assert.equal(bare.filter((v) => v === INK).length, 0);
});

test("the mist rolls in from the edges once the battle starts", () => {
  const sim = battle(), cells = open(sim);
  sim.atmosphere!.step(sim, .1);
  assert.equal(sim.atmosphere!.mode, "mist");
  assert.ok(mean(sim, cells) < .01, "no mist yet");
  const edge = cells.filter((i) => { const x = i % CELLS_W, y = Math.floor(i / CELLS_W); return Math.min(x, y, CELLS_W - 1 - x, CELLS_H - 1 - y) < 2; });
  const deep = cells.filter((i) => { const x = i % CELLS_W, y = Math.floor(i / CELLS_W); return Math.min(x, y, CELLS_W - 1 - x, CELLS_H - 1 - y) >= 7; });
  run(sim, 5);
  assert.ok(mean(sim, edge) > .3, `edges misty after 5 s (${mean(sim, edge)})`);
  assert.ok(mean(sim, deep) < mean(sim, edge) * .6, "the middle later");
  assert.ok(sim.atmosphere!.roll > 0 && sim.atmosphere!.roll < 1);
  run(sim, MIST.roll);
  assert.equal(sim.atmosphere!.roll, 1);
  assert.ok(mean(sim, deep) > .4, `rolled in everywhere (${mean(sim, deep)})`);
  assert.ok(Math.abs(sim.atmosphere!.beyondMist - MIST.edge) < 1e-9);
});

test("an area attack clears the mist where it lands, holds it clear a while, then the mist creeps back", () => {
  const sim = battle();
  run(sim, MIST.roll + 10);
  const env = sim.atmosphere!, cells = open(sim), c = cells.find((i) => env.air[i] > .5 && i % CELLS_W > 6 && i % CELLS_W < CELLS_W - 6)!;
  const x = c % CELLS_W + .5, y = Math.floor(c / CELLS_W) + .5;
  assert.ok(hiddenInMist(sim, x, y), "hidden in thick mist");
  sim.explode(x, y, { r: 2, damage: 1, friendlyFire: false });
  assert.ok(env.mistAt(x, y) < .05, "cleared at once");
  assert.equal(hiddenInMist(sim, x, y), false);
  run(sim, MIST.hold * .6);
  assert.ok(env.mistAt(x, y) < MIST.hides, "still clear while held");
  run(sim, 15);
  assert.ok(env.mistAt(x, y) > MIST.hides, `back again (${env.mistAt(x, y)})`);
  assert.ok(env.air.every(Number.isFinite));
});

test("no mist hides anything outside the Mistwood", () => {
  const sim = battle();
  sim.wave = 61;
  run(sim, 5);
  assert.equal(sim.atmosphere!.mode, null);
  assert.equal(hiddenInMist(sim, 5, 5), false);
  assert.equal(sim.atmosphere!.mistAt(5, 5), 0);
});
