import { test } from "node:test";
import assert from "node:assert/strict";
import { DefendSim, type Levels } from "../src/defend/sim.ts";
import { ENEMIES, UPGRADES } from "../src/defend/catalog.ts";
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { cellIndex, SUB } from "../src/defend/grid.ts";
import { wormCityReturn, wormReturnChance } from "../src/defend/worm-city-return.ts";
import { stepEnemy } from "../src/defend/enemies.ts";
import { WORM_CITY_RETURN, type BlightWormKind } from "../src/defend/blight-worm-tuning.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
function fixture(seed = 4) {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Levels, seed);
  sim.beginManualWave(40, 4800, 3); sim.scenario = { manualWaves: true, noCivilians: true, ignoreKeepLoss: true };
  sim.solid.fill(0); sim.foeSolid.fill(0); sim.ownSolid.fill(0); sim.rocks.fill(0);
  sim.map.type.fill(CellType.OUT); sim.map.owner.fill(-1); sim.map.city.fill(0);
  sim.hp.fill(0); sim.built.fill(0); sim.soldiers = []; sim.civilians = [];
  return sim;
}
function city(sim: DefendSim, x: number, y: number, w = SUB, h = SUB) {
  for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) sim.map.city[cellIndex(cx, cy)] = 1;
}
function head(sim: DefendSim, kind: BlightWormKind, x = 36, y = 12) {
  const before = sim.enemies.length; assert.ok(sim.releaseEnemy(kind, { x, y }));
  const e = sim.enemies[before], h = e.worm!.head!;
  h.dx = 0; h.dy = -1; h.surfaceT = 1e6; h.turnT = 0;
  return e;
}

test("city return probability starts beyond 2.5 full tiles and rises to a high, variable cap", () => {
  assert.equal(wormReturnChance(0), 0); assert.equal(wormReturnChance(2.5 * SUB), 0);
  close(wormReturnChance(3 * SUB), .19); close(wormReturnChance(4 * SUB), .57);
  close(wormReturnChance(5 * SUB), .95); close(wormReturnChance(1000), .95);
  let last = 0; for (let d = 0; d <= 60; d++) { const p = wormReturnChance(d); assert.ok(p >= last && p >= 0 && p < 1); last = p; }
});

test("distance follows the nearest real city edge, including concave gaps and translated cities", () => {
  const sim = fixture(); city(sim, 32, 40); city(sim, 48, 48);
  const a = wormCityReturn(sim.map, { x: 36, y: 12 })!;
  close(a.distance, 28); close(a.dx, 0); close(a.dy, 1);
  const gap = wormCityReturn(sim.map, { x: 44, y: 44 })!;
  close(gap.distance, 4); close(gap.dx, -1); close(gap.dy, 0);
  close(wormCityReturn(sim.map, { x: 36, y: 44 })!.distance, 0);
  const other = fixture(); city(other, 48, 64);
  const b = wormCityReturn(other.map, { x: 52, y: 36 })!;
  assert.deepEqual(b, a);
  const empty = fixture(); assert.equal(wormCityReturn(empty.map, { x: 20, y: 20 }), undefined);
  // Replacing a map's footprint cannot accidentally reuse its old cached rows.
  sim.map.city = other.map.city; assert.deepEqual(wormCityReturn(sim.map, { x: 52, y: 36 }), b);
});

for (const kind of ["smallBlightWorm", "mediumBlightWorm", "blightWorm"] as const) {
  test(`${kind}: a far, outward head turns inward on success with native speed and trail following`, () => {
    const sim = fixture(); city(sim, 32, 40); const e = head(sim, kind);
    const sequence = [.5, 0, .5]; let draws = 0; sim.rand = () => sequence[draws++];
    const y = e.y; stepEnemy(sim, e, .1);
    assert.equal(draws, 3); close(e.worm!.head!.dx, 0); close(e.worm!.head!.dy, 1);
    close(e.y - y, ENEMIES[kind].speed * .1);
    for (const segment of sim.enemies.slice(1)) stepEnemy(sim, segment, .1);
    close(e.worm!.s - sim.enemies[1].worm!.s, ENEMIES[kind].size);
  });
  test(`${kind}: a failed return roll preserves ordinary wandering, while nearby heads use no return roll`, () => {
    const sim = fixture(); city(sim, 32, 40); const e = head(sim, kind);
    const sequence = [.5, .99, .5]; let draws = 0; sim.rand = () => sequence[draws++];
    stepEnemy(sim, e, .1); assert.equal(draws, 3); close(e.worm!.head!.dy, -1);
    const near = fixture(); city(near, 32, 40); const n = head(near, kind, 36, 24);
    let nearDraws = 0; near.rand = () => { nearDraws++; return .5; };
    stepEnemy(near, n, .1); assert.equal(nearDraws, 2); close(n.worm!.head!.dy, -1);
  });
  test(`${kind}: return checks wait for a surface turn; underground rays stay straight`, () => {
    const sim = fixture(); city(sim, 32, 40); const e = head(sim, kind), h = e.worm!.head!;
    h.turnT = 100; let draws = 0; sim.rand = () => { draws++; return .5; };
    stepEnemy(sim, e, .1); assert.equal(draws, 0);
    h.under = true; h.reached = false; h.turnT = 0; e.burrow = 1;
    stepEnemy(sim, e, .1); assert.equal(draws, 0); close(h.dx, 0); close(h.dy, -1);
  });
}

test("successful returns retain left/right angular variation instead of one fixed approach ray", () => {
  const headings = [];
  for (const angleRoll of [.1, .9]) {
    const sim = fixture(); city(sim, 32, 40); const e = head(sim, "blightWorm");
    const sequence = [angleRoll, 0, .5]; let draws = 0; sim.rand = () => sequence[draws++];
    stepEnemy(sim, e, .01); headings.push(e.worm!.head!);
  }
  assert.ok(headings[0].dx > 0 && headings[1].dx < 0);
  assert.ok(headings.every(h => h.dy > .97));
});

test("far heads retain angular variation and repeatedly approach the city rather than roam for minutes", () => {
  for (const kind of ["smallBlightWorm", "mediumBlightWorm", "blightWorm"] as const) {
    for (let seed = 1; seed <= 12; seed++) {
      const sim = fixture(seed); city(sim, 28, 48, 16, 16); const e = head(sim, kind, 12 + seed * 4, 8);
      let reached = false;
      for (let n = 0; n < 30 * 40; n++) {
        for (const segment of sim.enemies) stepEnemy(sim, segment, 1 / 30);
        sim.time += 1 / 30;
        if (wormCityReturn(sim.map, e)!.distance <= WORM_CITY_RETURN.startTiles * SUB) { reached = true; break; }
      }
      assert.ok(reached, `${kind}, start ${seed} approaches within 40 seconds`);
    }
  }
  const run = () => {
    const sim = fixture(); city(sim, 28, 48, 16, 16); const e = head(sim, "mediumBlightWorm", 20, 8);
    for (let n = 0; n < 600; n++) { for (const segment of sim.enemies) stepEnemy(sim, segment, 1 / 30); sim.time += 1 / 30; }
    return JSON.stringify(sim.enemies);
  };
  assert.equal(run(), run());
});
