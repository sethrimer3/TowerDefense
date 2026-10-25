import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { pathById } from "../src/knowledge-paths.ts";
import { nextSteps, fullTree, upgradeBuilding, allocated } from "../src/specializations.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { CellType, generateCity } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { Towers, stepShells, cannonTowerRange } from "../src/defend/towers.ts";
import { fireMine, mineAim, mineCount, stepMines, type Mine } from "../src/defend/mines.ts";
import { stepBlazes } from "../src/defend/mages.ts";
import { quench } from "../src/defend/fire-ice.ts";
import { cannonDamage, type PlacedKind } from "../src/defend/catalog.ts";
import { cellIndex } from "../src/defend/grid.ts";
import { kindStats } from "../src/ui/specialty.ts";
import { structurePixels } from "../src/defend/tower-art.ts";
import { reachOf } from "../src/defend/inspect.ts";

function scene(kind: PlacedKind = "minelayerTower", rank = 0) {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 4), defaults().defend.levels, 1);
  sim.enemies = []; sim.soldiers = []; sim.civilians = [];
  sim.solid.fill(0); sim.foeSolid.fill(0); sim.ownSolid.fill(0); sim.map.type.fill(CellType.STREET);
  const id = sim.keep.id;
  const b = { ...sim.keep, id, kind, rect: { x: 19, y: 19, w: 2, h: 2 }, structureUid: 42 };
  sim.map.buildings[id] = b;
  const path = kind === "batteryTower" ? "gunnery" : kind === "mortarTower" ? "siegeShot" : "minelaying";
  sim.bonuses = { ...sim.bonuses, structurePaths: rank ? { 42: { [kind]: { path, rank } } } : {} };
  return { sim, b };
}
function enemy(sim: DefendSim, x: number, y = 20, kind: Enemy["kind"] = "orc") {
  const e: Enemy = { id: sim.newId(), kind, x, y, hp: 10000, maxHp: 10000, cd: 0, flash: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false };
  sim.enemies.push(e); sim.reindexAfterDisplacement(); return e;
}
function mine(sim: DefendSim, smart = false, x = 23, y = 20): Mine {
  return { x, y, age: 0, damage: 100, r: 1.7, smart, origin: { x: 20, y: 20, building: sim.keep.id } };
}

test("Cannon Tower has three attunements, three ranks each, preserved old IDs and readable stats", () => {
  assert.deepEqual(nextSteps("cannonTower").map(s => s.type === "become" && s.to), ["batteryTower", "mortarTower", "minelayerTower"]);
  for (const path of ["gunnery", "siegeShot", "minelaying"] as const) {
    assert.equal(pathById(path).ranks.length, 3);
    assert.ok(fullTree("watchTower").some(n => n.id === `p:${path}:3`));
  }
  assert.match(kindStats(defaults(), "batteryTower"), /4 extra blasts/);
  assert.match(kindStats(defaults(), "mortarTower", "siegeShot", 3), /15 burn damage\/s for 4s/);
  assert.match(kindStats(defaults(), "minelayerTower", "minelaying", 3), /50 mines.*walking Smart charges/);
  const save = defaults(); save.knowledge = 1e6; save.defend.owned.cannonTower = 1;
  assert.ok(upgradeBuilding(save, { copy: "cannonTower" }, nextSteps("cannonTower")[2]).ok);
  for (let rank = 1; rank <= 3; rank++) {
    const target = { copy: "minelayerTower" as const, ...(rank > 1 ? { wear: { path: "minelaying" as const, rank: rank - 1 } } : {}) };
    assert.ok(upgradeBuilding(save, target, nextSteps("minelayerTower", target.wear)[0]).ok);
  }
  const loaded = decode(JSON.stringify(save));
  assert.equal(loaded.defend.owned.minelayerTower, 1);
  assert.deepEqual(loaded.defend.kept, save.defend.kept);
  assert.ok(allocated("minelayerTower", { path: "minelaying", rank: 3 }) > 0);
  assert.ok(structurePixels("minelayerTower", 2, 2, 0, 1).some(v => v));
  assert.notDeepEqual(structurePixels("minelayerTower", 2, 2, 0, 1), structurePixels("cannonTower", 2, 2, 0, 1));
});

test("Gun Battery gets grapeshot at attuning, retaining it across 0/15/25/50% shorter reloads", () => {
  for (let rank = 0; rank <= 3; rank++) {
    const { sim, b } = scene("batteryTower", rank); enemy(sim, 24);
    const t = new Towers(); t.step(sim, 0);
    assert.equal(sim.shells[0].grape, true);
    assert.equal(t.cooldown.get(b.id), 2.8 * [1, .85, .75, .5][rank]);
    stepShells(sim, 3); assert.equal(sim.effects.filter(e => e.kind === "boom").length, 5);
  }
  const { sim } = scene("cannonTower"); enemy(sim, 24); new Towers().step(sim, 0);
  assert.equal(sim.shells[0].grape, undefined); assert.equal(sim.shells[0].mortar, undefined);
});

test("Mortar impact and burn scale together, retain lifetime and expand both radii", () => {
  for (let rank = 0; rank <= 3; rank++) {
    const { sim, b } = scene("mortarTower", rank), e = enemy(sim, 24);
    sim.bonuses.towerDamage = 2;
    const t = new Towers(); t.step(sim, 0);
    const shell = sim.shells[0], damage = cannonDamage(0) * 2 * [1, 1.8, 1.8, 3][rank];
    assert.equal(shell.damage, damage); assert.equal(shell.mortar?.dps, damage * .25);
    assert.equal(t.cooldown.get(b.id), 2.8 * (rank ? 1.5 : 1.25));
    assert.equal(cannonTowerRange(sim, b), rank === 3 ? 14 : 11);
    stepShells(sim, 2);
    const blaze = sim.blazes[0];
    assert.equal(blaze.life, 4); assert.equal(blaze.r, shell.r); assert.equal(blaze.dps, damage * .25);
    assert.equal(blaze.r, 1.7 * (rank >= 2 ? 1.5 : 1));
    const hp = e.hp; stepBlazes(sim, 1); assert.equal(hp - e.hp, damage * .25);
    sim.bonuses.paths = { cinderHall: { path: "cinders", rank: 3 } };
    stepBlazes(sim, .1); assert.equal(e.burn, undefined, "mortars cannot inherit mage clinging research");
  }
});

test("Mortar ground fire spares fliers, quenches in rime and fizzles in boat water", () => {
  const { sim } = scene("mortarTower"), ground = enemy(sim, 24), air = enemy(sim, 24, 20, "bat");
  new Towers().step(sim, 0); stepShells(sim, 2);
  const hp = air.hp, g = ground.hp; stepBlazes(sim, .25);
  assert.equal(air.hp, hp); assert.ok(ground.hp < g);
  sim.rime.push({ ...sim.blazes[0], r: 10 } as any); quench(sim); assert.equal(sim.blazes.length, 0);
  const wet = scene("mortarTower"); enemy(wet.sim, 24); new Towers().step(wet.sim, 0);
  wet.sim.floods.push({ x: 24, y: 20, r: 3, t: 0, life: 10, boat: -1 });
  stepShells(wet.sim, 2); assert.equal(wet.sim.blazes.length, 0);
});

test("Minelayer lays without enemies at half range, with all caps including flight slots", () => {
  for (let rank = 0; rank <= 3; rank++) {
    const { sim, b } = scene("minelayerTower", rank);
    assert.equal(reachOf(b, sim)[0].r, 5.5);
    const cap = [15, 15, 30, 50][rank];
    for (let i = 0; i < cap; i++) assert.ok(fireMine(sim, b));
    assert.equal(mineCount(sim, b.id), cap); assert.equal(fireMine(sim, b), false);
    for (const s of sim.shells) assert.ok((s.x1 - 20) ** 2 + (s.y1 - 20) ** 2 <= 5.5 ** 2);
    stepShells(sim, 3); assert.equal(sim.mines.length, cap); assert.equal(sim.effects.length, 0, "laying does not explode");
    assert.equal(fireMine(sim, b), false); sim.mines.pop(); assert.ok(fireMine(sim, b));
    assert.equal(sim.mines[0].smart, rank === 3);
  }
});

test("Directed laying clamps its crosshair and scatters locally; rank zero ignores aim", () => {
  const { sim, b } = scene("minelayerTower", 1);
  assert.equal(mineAim(b, { x: 20, y: 20 }), undefined);
  assert.equal(mineAim(b, { x: Infinity, y: 2 }), undefined);
  assert.deepEqual(mineAim(b, { x: 100, y: 20 }), { x: 25.5, y: 20 });
  sim.mineAims.set(b.id, { x: 24, y: 20 });
  for (let i = 0; i < 15; i++) assert.ok(fireMine(sim, b));
  for (const s of sim.shells) assert.ok((s.x1 - 24) ** 2 + (s.y1 - 20) ** 2 <= 1);
  assert.deepEqual(scene().sim.mineAims.size, 0, "aim is local to one battle");
  const basic = scene(); basic.sim.mineAims.set(basic.b.id, { x: 24, y: 20 });
  for (let i = 0; i < 15; i++) fireMine(basic.sim, basic.b);
  assert.ok(basic.sim.shells.some(s => (s.x1 - 24) ** 2 + (s.y1 - 20) ** 2 > 1));
});

test("Laying rejects buildings, ponds, water and invalidated landings without leaking capacity", () => {
  const { sim, b } = scene(); sim.solid.fill(1);
  assert.equal(fireMine(sim, b), false); assert.equal(mineCount(sim, b.id), 0);
  sim.solid.fill(0); sim.map.type.fill(CellType.WATER); assert.equal(fireMine(sim, b), false);
  sim.map.type.fill(CellType.STREET); sim.floods.push({ x: 20, y: 20, r: 10, t: 0, life: 10, boat: -1 });
  assert.equal(fireMine(sim, b), false); sim.floods = [];
  assert.ok(fireMine(sim, b)); sim.solid.fill(1); stepShells(sim, 2);
  assert.equal(mineCount(sim, b.id), 0); assert.equal(sim.effects.length, 0);
});

test("Mines arm, ignore aerial and friendly triggers, and explode only once at proximity", () => {
  const { sim } = scene(); const m = mine(sim); sim.mines.push(m);
  const air = enemy(sim, 23, 20, "bat");
  stepMines(sim, 1); assert.equal(sim.mines.length, 1); assert.equal(air.hp, air.maxHp);
  const e = enemy(sim, 23); m.age = 0;
  stepMines(sim, .49); assert.equal(e.hp, e.maxHp);
  stepMines(sim, .02); assert.ok(e.hp < e.maxHp); assert.equal(sim.mines.length, 0);
  const hp = e.hp; stepMines(sim, 1); assert.equal(e.hp, hp);
});

test("Mines retain cannon safety: friends never trigger, but unsafe explosions can hurt them", () => {
  for (const safe of [0, 1]) {
    const { sim, b } = scene(); sim.levels.cannonSafe = safe;
    const s: Soldier = { id: sim.newId(), kind: "sword", x: 23, y: 20, home: b.id, hp: 1000, maxHp: 1000, damage: 1, cd: 0, target: -1, path: [], thinkT: 0, flash: 0 };
    sim.soldiers = [s]; sim.mines = [mine(sim)]; stepMines(sim, 1);
    assert.equal(sim.mines.length, 1); assert.equal(s.hp, 1000);
    enemy(sim, 23); stepMines(sim, .1);
    assert.equal(s.hp < 1000, !safe);
  }
});

test("Smart charges approach living ground targets, retarget, stop without targets, and stay in range", () => {
  const { sim } = scene(); const m = mine(sim, true); m.age = 1; sim.mines = [m];
  const e = enemy(sim, 25); stepMines(sim, 1); assert.ok(Math.abs(m.x - 23.5) < 1e-10);
  e.hp = 0; stepMines(sim, 1); assert.ok(Math.abs(m.x - 23.5) < 1e-10);
  const back = enemy(sim, 21); stepMines(sim, 1); assert.ok(Math.abs(m.x - 23) < 1e-10);
  back.hp = 0; e.hp = 10000; e.x = 27.9; m.x = 25.4; sim.reindexAfterDisplacement();
  stepMines(sim, 10); assert.ok(m.x <= 25.5); assert.ok(m.x >= 25.4);
  const air = enemy(sim, 24, 20, "bat"); e.hp = 0; const x = m.x; stepMines(sim, 1); assert.equal(m.x, x); assert.equal(air.hp, air.maxHp);
});

test("Walking charges sweep against walls and water even with a long step", () => {
  for (const obstacle of ["wall", "pond", "water"]) {
    const { sim } = scene(); const m = mine(sim, true, 22.5); m.age = 1; sim.mines = [m]; enemy(sim, 25.4);
    if (obstacle === "wall") for (let y = 0; y < 104; y++) sim.solid[cellIndex(23, y)] = 1;
    if (obstacle === "pond") for (let y = 0; y < 104; y++) sim.map.type[cellIndex(23, y)] = CellType.WATER;
    if (obstacle === "water") sim.floods.push({ x: 23.5, y: 20, r: .4, t: 0, life: 100, boat: -1 });
    stepMines(sim, 10); assert.ok(m.x < 23.2, obstacle); assert.equal(sim.mines.length, 1);
  }
});

test("Minelayer firing respects tower cadence and capacity is independent per owner", () => {
  const { sim, b } = scene(); const t = new Towers(); t.step(sim, 0);
  assert.equal(sim.shells.length, 1); assert.equal(t.cooldown.get(b.id), 2.8);
  const other = { ...b, id: sim.map.buildings.length, structureUid: 43 }; sim.map.buildings.push(other);
  for (let i = 1; i < 15; i++) fireMine(sim, b);
  assert.ok(!fireMine(sim, b)); assert.ok(fireMine(sim, other));
});
