// Gun sight (src/defend/gun-sight.ts): the gunner line shoots flat, only at
// an enemy no wall or building hides, while archers arc over; a gunner with
// nothing in sight climbs a watch tower with room and shoots over
// everything from the top, unseen by the enemy, until the tower falls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout, type PlacedKind } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { CellType, generateCity } from "../src/defend/citygen.ts";
import { cellIndex } from "../src/defend/grid.ts";
import { Barracks, stepArcher } from "../src/defend/troops.ts";
import { FLAT_SHOOTERS, TOWER_ROOM, lineOfSight, perched, shootsFlat } from "../src/defend/gun-sight.ts";
import { center } from "../src/defend/pathing.ts";

/** A city of five tiles with `kinds` placed round the keep. */
function battle(kinds: [PlacedKind, number, number][]) {
  const s = defaults();
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  for (const [kind, dx, dy] of kinds) {
    s.defend.owned[kind] = (s.defend.owned[kind] ?? 0) + 1;
    l = placeStructure(l, kind, l.keep.tx + dx, l.keep.ty + dy) ?? assert.fail(`placing ${kind}`);
  }
  s.defend.layout = l;
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
  new Barracks().step(sim, 0.01);
  return sim;
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
/** Stands `m` mid-cell on a row of open street `n` cells long, with a
 * house two cells east and an enemy three cells east behind it. */
function behindHouse(sim: DefendSim, m: Soldier, type: number = CellType.HOUSE) {
  m.x = Math.floor(m.x) + 0.5; m.y = Math.floor(m.y) + 0.5;
  for (let i = 0; i <= 5; i++) { const c = cellIndex(Math.floor(m.x) + i, Math.floor(m.y)); sim.solid[c] = 0; sim.map.type[c] = CellType.ROAD; }
  const house = cellIndex(Math.floor(m.x) + 2, Math.floor(m.y));
  sim.solid[house] = 1; sim.map.type[house] = type;
  return { e: enemy(sim, m.x + 3, m.y), house };
}

test("the whole gunner line shoots flat; archers, stone throwers and javelins arc over", () => {
  assert.deepEqual([...FLAT_SHOOTERS].sort(), ["gatlingGunner", "gunner", "machineGunner", "musketeer", "railSniper", "rocketeer", "sniper"]);
  for (const k of ["archer", "slinger", "javelineer", "mage"] as const) assert.ok(!shootsFlat(k), k);
});

test("a gunner holds its fire at an enemy behind a house or wall stone, and shoots once it is in the open", () => {
  for (const type of [CellType.HOUSE, CellType.WALL]) {
    const sim = battle([["gunHall", 0, -1]]);
    const m = sim.soldiers.find((u) => u.kind === "gunner") ?? assert.fail("a gunner");
    const { e, house } = behindHouse(sim, m, type);
    assert.ok(!lineOfSight(sim, m.x, m.y, e.x, e.y));
    m.cd = 0;
    stepArcher(sim, m, 1 / 30);
    assert.equal(sim.arrows.length, 0, "no shot through it");
    assert.ok(m.cd > 0, "it looks again a little later");
    // The house falls: the line is clear.
    sim.solid[house] = 0;
    m.cd = 0;
    stepArcher(sim, m, 1 / 30);
    assert.equal(sim.arrows[0]?.target, e.id);
  }
});

test("an archer shoots over the same house", () => {
  const sim = battle([["archerBarracks", 0, -1]]);
  const m = sim.soldiers.find((u) => u.kind === "archer") ?? assert.fail("an archer");
  const { e } = behindHouse(sim, m);
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  assert.equal(sim.arrows[0]?.target, e.id);
});

test("gunners with nothing in sight climb a watch tower, two at most, unseen up there, and shoot over everything", () => {
  const sim = battle([["gunHall", 0, -1], ["gunHall", 0, 1], ["watchTower", 1, 0]]);
  const tower = sim.map.buildings.find((b) => b.kind === "watchTower")!;
  // Let the halls fill their garrisons and the gunners walk.
  const barracks = new Barracks();
  for (let t = 0; t < 120; t++) {
    barracks.step(sim, 1 / 30);
    for (const u of sim.soldiers) stepArcher(sim, u, 1 / 30);
  }
  const guns = sim.soldiers.filter((u) => u.kind === "gunner");
  assert.ok(guns.length > TOWER_ROOM, "more gunners than room");
  for (let t = 0; t < 30 * 40; t++) for (const u of guns) stepArcher(sim, u, 1 / 30);
  const up = guns.filter((u) => u.perch?.up);
  assert.equal(up.length, TOWER_ROOM, "the tower filled");
  assert.equal(guns.filter((u) => u.perch && !u.perch.up).length, 0, "no one else bound for it");
  const c = center(tower.rect);
  for (const u of up) {
    assert.equal(u.perch!.tower, tower.id);
    assert.deepEqual([u.x, u.y], [c.x, c.y], "at the top of the tower");
    assert.ok(perched(u));
  }
  // No enemy picks them out.
  assert.ok(!up.includes(sim.nearestDefender(c.x, c.y, 0.5) as Soldier));
  // An enemy behind the tower's own stones and the houses round it: shot from up there.
  const m = up[0];
  const e = enemy(sim, c.x + 3, c.y);
  m.cd = 0;
  sim.arrows.length = 0;
  stepArcher(sim, m, 1 / 30);
  assert.equal(sim.arrows[0]?.target, e.id);
  assert.deepEqual([m.x, m.y], [c.x, c.y], "it stays put");
  // The tower falls: they drop out.
  sim.damageBuilding(tower.id, 1e9);
  for (const u of up) stepArcher(sim, u, 1 / 30);
  for (const u of up) assert.equal(u.perch, undefined);
});
