// The keep's guards (src/defend/city-watch.ts): mustered in a Defend battle
// (`Bonuses.watch`), fighting what gets into the city, walking their rounds,
// trained back while the keep stands, and the keep's City watch ranks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { NO_BONUSES, WATCHMAN, type Bonuses } from "../src/defend/catalog.ts";
import { CITY_WATCH, cityWatch, KEEP_PATHS, THROWN_SPEAR, upgradeKeep } from "../src/keep-upgrades.ts";
import { guardsOf, musterWatch } from "../src/defend/city-watch.ts";
import { cellCenter } from "../src/defend/pathing.ts";
import { CELL_COUNT } from "../src/defend/grid.ts";
import { defaults } from "../src/save.ts";
import { SIDE_GROUPS } from "../src/campaign/siege-dps-catalog.ts";

const RAISED = { watch: 1 };
const map = () => generateCity(fitLayout(defaultLayout()) as never, 7);
function battle(watch?: Bonuses["watch"]) {
  const sim = new DefendSim(map(), defaults().defend.levels, 3, watch ? { ...NO_BONUSES, watch } : NO_BONUSES);
  sim.startUnitTester();
  return sim;
}
const run = (sim: DefendSim, seconds: number) => { for (let t = 0; t < seconds; t += 0.1) sim.update(0.1); };
const enemyAt = (sim: DefendSim, x: number, y: number, hp = 200): Enemy => {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp, maxHp: hp, cd: 99, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  return e;
};
const openCity = (sim: DefendSim) => { const out: number[] = []; for (let i = 0; i < CELL_COUNT; i++) if (sim.map.city[i] && !sim.ownSolid[i]) out.push(i); return out; };

test("only a Defend battle's keep has guards", () => {
  const sim = battle();
  run(sim, 1);
  assert.equal(guardsOf(sim).length, 0, "no guards without Bonuses.watch, so fixtures play as before");
});

test("the watch musters where the watchmen stood, the rest at the keep's door", () => {
  const sim = battle(cityWatch(RAISED));
  const cells = openCity(sim), spot = cellCenter(cells[Math.floor(cells.length / 2)]);
  musterWatch(sim, [spot, { x: -5, y: -5 }]);
  const guards = guardsOf(sim);
  assert.equal(guards.length, CITY_WATCH.guards[1]);
  assert.deepEqual([guards[0].x, guards[0].y], [spot.x, spot.y]);
  const door = cellCenter(sim.doorOf(sim.keep));
  assert.deepEqual([guards[1].x, guards[1].y], [door.x, door.y], "a spot off the board falls back to the door");
  assert.equal(guards[0].maxHp, WATCHMAN.hp);
  // A battle nobody mustered musters on its first step.
  const other = battle(cityWatch(RAISED));
  run(other, 0.1);
  assert.equal(guardsOf(other).length, CITY_WATCH.guards[1]);
});

test("guards walk their rounds and fight what gets into the city", () => {
  const sim = battle(cityWatch(RAISED));
  run(sim, 0.1);
  const start = guardsOf(sim).map((g) => [g.x, g.y]);
  run(sim, 12);
  assert.ok(guardsOf(sim).some((g, i) => Math.abs(g.x - start[i][0]) + Math.abs(g.y - start[i][1]) > 1), "they walk the streets");
  // An enemy on the open street a few cells from a guard.
  const g = guardsOf(sim)[0], cells = openCity(sim);
  const near = cells.find((i) => { const c = cellCenter(i), d = Math.abs(c.x - g.x) + Math.abs(c.y - g.y); return d >= 2 && d <= 4; })!;
  const at = cellCenter(near), foe = enemyAt(sim, at.x, at.y);
  run(sim, 4);
  assert.ok(foe.hp < foe.maxHp, "a guard strikes the enemy beside it");
});

test("a fallen guard is trained back while the keep stands", () => {
  const w = cityWatch(RAISED), sim = battle(w);
  run(sim, 0.1);
  guardsOf(sim)[0].hp = 0;
  run(sim, 0.2);
  assert.equal(guardsOf(sim).length, w.guards - 1);
  run(sim, w.drill + 0.5);
  assert.equal(guardsOf(sim).length, w.guards);
});

test("the keep has no watch until its first City watch rank raises one", () => {
  assert.equal(cityWatch(undefined), undefined);
  assert.equal(cityWatch({ bastions: 3 }), undefined);
  const s = defaults();
  s.knowledge = 1e7;
  assert.ok(upgradeKeep(s, "watch").ok);
  const w = cityWatch(s.defend.keepRanks)!;
  assert.deepEqual([w.guards, w.hp, w.damage, w.reach, w.throws], [4, 1, 1, WATCHMAN.reach, false]);
});

test("the keep's City watch branch: tougher, harder-hitting, more guards, then thrown spears", () => {
  const s = defaults();
  s.knowledge = 1e7;
  const branch = KEEP_PATHS.find((p) => p.id === "watch")!;
  assert.equal(branch.ranks.length, THROWN_SPEAR.rank);
  for (let n = 0; n < 4; n++) assert.ok(upgradeKeep(s, "watch").ok);
  const w = cityWatch(s.defend.keepRanks)!;
  assert.equal(w.guards, 8);
  assert.ok(w.hp > 1 && w.damage > 1 && w.reach > WATCHMAN.reach && w.drill < CITY_WATCH.drill[1] && !w.throws);
  const sim = battle(w);
  run(sim, 0.1);
  assert.equal(guardsOf(sim).length, 8);
  assert.equal(guardsOf(sim)[0].maxHp, WATCHMAN.hp * w.hp);
  assert.ok(upgradeKeep(s, "watch").ok);
  assert.ok(cityWatch(s.defend.keepRanks)!.throws);
  assert.equal(upgradeKeep(s, "watch").ok, false, "Throwing spears is the top rank");
  // Siege castles never buy it: their guards would not fight.
  assert.ok(!SIDE_GROUPS.find((g) => g.kind === "keep")!.paths.some((p) => p.id === "watch"));
});

/** A battle with one guard left and a tough enemy on an open street about
 * 3 cells from it. */
function throwRange(ranks: number) {
  const sim = battle(cityWatch({ watch: ranks }));
  run(sim, 0.1);
  const g = guardsOf(sim)[0], cells = openCity(sim);
  const spot = cells.map(cellCenter).find((c) => { const d = Math.hypot(c.x - g.x, c.y - g.y); return d >= 2.5 && d <= 3.5; })!;
  for (const o of guardsOf(sim).slice(1)) o.hp = 0;
  const foe = enemyAt(sim, spot.x, spot.y, 1000);
  return { sim, foe };
}

test("Throwing spears: guards throw at enemies out of reach", () => {
  const { sim, foe } = throwRange(5);
  sim.update(0.1);
  const spear = sim.arrows.find((a) => a.shot === "spear");
  assert.ok(spear, "a spear is thrown at once");
  assert.equal(spear.target, foe.id);
  assert.equal(spear.damage, WATCHMAN.damage * CITY_WATCH.damage[5] * THROWN_SPEAR.damage);
  run(sim, 1);
  assert.ok(foe.hp < foe.maxHp, "the spear strikes home");
  // Without the rank, no spears.
  const plain = throwRange(4);
  run(plain.sim, 1);
  assert.ok(!plain.sim.arrows.some((a) => a.shot === "spear"));
});
