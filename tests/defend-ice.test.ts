import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim } from '../src/defend/sim.ts';
import { generateCity, CellType } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { ageWater, stepBoat, stepFloods, iceAt, icyCell, meltIce, meltIceCone, wetAt, FLOOD_LIFE, floodRadius } from '../src/defend/boats.ts';
import { cellIndex } from '../src/defend/grid.ts';
import { UPGRADES } from '../src/defend/catalog.ts';
import { stepFireballs } from '../src/defend/mages.ts';
import { hostileBurst } from '../src/defend/hostile-attacks.ts';

function fixture() {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9; sim.snowOverride = true;
  return sim;
}
function pool(s: DefendSim, x = 10, y = 10, r = 3, decorative = false) {
  const p = { x, y, r, t: 0, life: FLOOD_LIFE, boat: 1, frozen: true, decorative };
  s.floods.push(p); return p;
}

test('winter boats leave persistent ice, including decorative wakes; stationary ice is bounded', () => {
  for (const kind of ['boatDinghy', 'boatLesser'] as const) {
    const s = fixture(), e = s.spawnAuxiliary(kind, 10, 10)!;
    for (let n = 0; n < 100; n++) { e.abilityT = 0; stepBoat(s, e, 0); }
    assert.equal(s.floods.length, 1);
    assert.ok(s.floods[0].frozen);
    ageWater(s, 1000);
    assert.ok(iceAt(s, 10, 10)); assert.equal(wetAt(s, 10, 10), false);
    assert.equal(floodRadius(s.floods[0]), s.floods[0].r);
    s.snowOverride = false; ageWater(s, 1000);
    assert.equal(s.floods.length, 1, 'warm area alone does not erase winter trails');
  }
});

test('heat thaws nearby sheets, preserves remote ice, and meltwater dries without refreezing', () => {
  const s = fixture(); pool(s); const far = pool(s, 30, 10);
  assert.equal(meltIce(s, 10, 10, .5), true);
  assert.equal(iceAt(s, 10, 10), false); assert.equal(wetAt(s, 10, 10), true);
  assert.ok(far.frozen);
  ageWater(s, FLOOD_LIFE + .1);
  assert.deepEqual(s.floods, [far]);
});

test('new winter freezes existing water at its current radius', () => {
  const s = fixture(); s.floods.push({ x: 10, y: 10, r: 4, t: 6, life: 8, boat: 1 });
  const before = floodRadius(s.floods[0]); ageWater(s, 1);
  assert.equal(floodRadius(s.floods[0]), before); assert.ok(s.floods[0].frozen);
});

test('ice overlapping any part of rubble blocks rebuilding until thawed', () => {
  const s = fixture(), wall = s.map.buildings.find(b => b.kind === 'wall')!;
  s.damageBuilding(wall.id, 1e9);
  const cell = wall.cells[0], x = cell % 63, y = Math.floor(cell / 63);
  pool(s, x - .1, y + .5, .2, true);
  assert.ok(icyCell(s, cell));
  s.rebuildCell(cell); assert.equal(s.solid[cell], 0);
  meltIce(s, x, y + .5, 1); s.rebuildCell(cell);
  assert.equal(s.solid[cell], 1);
});

test('both friendly and hostile blasts give grounded units an ice impulse, without moving fliers', () => {
  const s = fixture(); pool(s);
  const e = s.spawnAuxiliary('ogre', 10.5, 10)!;
  const flying = s.spawnAuxiliary('bat', 10.5, 10)!;
  s.explode(10, 10, { r: 2, damage: 1, friendlyFire: false });
  s.iceMotion.step(s, .1);
  assert.ok(e.x > 10.5); assert.equal(flying.x, 10.5);
  assert.equal(iceAt(s, 10, 10), false);
  pool(s, 20, 10);
  const soldier = { id: 500, x: 20.5, y: 10, kind: 'sword', hp: 40, maxHp: 40, flash: 0 } as any;
  s.soldiers.push(soldier); hostileBurst(s, 20, 10, 2, 1); s.iceMotion.step(s, .1);
  assert.ok(soldier.x > 20.5);
});

test('traction retains momentum when turning and stopping, but slides cannot cross walls', () => {
  const s = fixture(); pool(s, 10, 10, 5);
  const e = s.spawnAuxiliary('ogre', 10, 10)!;
  s.moveToward(e, { x: 20, y: 10 }, { speed: 3, dt: .1 }); s.iceMotion.step(s, .1);
  const start = e.x;
  s.moveToward(e, { x: 0, y: 10 }, { speed: 3, dt: .1 });
  assert.ok(e.x > start, 'turning initially continues the previous slide');
  s.iceMotion.step(s, .1); const stopped = e.x; s.iceMotion.step(s, .1);
  assert.ok(e.x > stopped, 'momentum continues while attacks or work stop walking');
  s.solid[cellIndex(11, 10)] = 1;
  s.iceBlast(9, 10, 5); s.iceMotion.step(s, 1);
  assert.ok(e.x < 11, 'a fast impulse cannot tunnel through a solid cell');
});

test('burning ground, flame cones and fireballs melt winter trails', () => {
  const s = fixture(); pool(s);
  s.blazes.push({ x: 10, y: 10, r: .5, t: 0, life: 8, dps: 1, seed: 1 });
  stepFloods(s, .1); assert.equal(iceAt(s, 10, 10), false);
  pool(s, 20, 10, 1); meltIceCone(s, 17, 10, 1, 0, 4, .4);
  assert.equal(iceAt(s, 20, 10), false);
  pool(s, 30, 10, 1); s.fireballs.push({ x0: 25, y0: 10, x1: 30, y1: 10, t: 0, dur: .1, damage: 1, r: 1 });
  stepFireballs(s, .2); assert.equal(iceAt(s, 30, 10), false);
});

test('natural ponds freeze in cold weather and can be melted', () => {
  const s = fixture(), cell = cellIndex(10, 10); s.map.type[cell] = CellType.WATER;
  assert.ok(iceAt(s, 10.5, 10.5)); meltIce(s, 10.5, 10.5, 1);
  assert.equal(iceAt(s, 10.5, 10.5), false); assert.ok(s.thawedPonds.has(cell));
});
