import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPGRADES, CIVILIAN } from '../src/defend/catalog.ts';
import { CellType, generateCity } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout, placeGate } from '../src/defend/layout.ts';
import { Builders, escaped } from '../src/defend/civilians.ts';
import { cellCenter, center } from '../src/defend/pathing.ts';
import { DefendSim, type Civilian, type Levels } from '../src/defend/sim.ts';

function fixture(gate = false) {
  let layout = defaultLayout();
  if (gate) layout = placeGate(layout, { ...layout.keep, side: 'n' })!;
  const levels = Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Levels;
  const sim = new DefendSim(generateCity(fitLayout(layout), 3), levels, 4);
  sim.startUnitTester();
  const keep = center(sim.keep.rect);
  const exterior = Array.from(sim.map.type.keys()).filter(cell => sim.map.type[cell] === CellType.OUT)
    .sort((a, b) => { const p = cellCenter(a), q = cellCenter(b); return Math.hypot(p.x - keep.x, p.y - keep.y) - Math.hypot(q.x - keep.x, q.y - keep.y); })[0];
  const c: Civilian = { id: sim.newId(), ...cellCenter(exterior), hp: 10, maxHp: 10, job: -1, state: 'home', work: 0, path: [], home: sim.keepId, thinkT: 0, flash: 0 };
  sim.civilians.push(c);
  return { sim, c, builders: new Builders(levels) };
}

test('stranded builders panic, run off the board, and despawn alive', () => {
  const { sim, c } = fixture();
  sim.update(1 / 30);
  assert.equal(c.state, 'flee');
  assert.ok(c.exit);
  const start = { x: c.x, y: c.y };
  for (let i = 0; i < 1800 && sim.civilians.includes(c); i++) sim.update(1 / 30);
  assert.ok(Math.hypot(c.x - start.x, c.y - start.y) > 5);
  assert.ok(escaped(c), 'the whole sprite leaves the board before removal');
  assert.ok(!sim.civilians.includes(c));
  assert.equal(c.hp, 10);
  assert.equal(sim.stats.current.civiliansLost, 0);
});

test('an intact gate lets outside builders return indoors', () => {
  const { sim, c } = fixture(true);
  for (let i = 0; i < 1800 && sim.civilians.includes(c); i++) {
    sim.update(1 / 30);
    assert.notEqual(c.state, 'flee');
  }
  assert.ok(!sim.civilians.includes(c), 'builder gets home through the gate');
  assert.equal(c.hp, 10);
});

test('closing the last breach invalidates the return route and frees the repair job', () => {
  const { sim, c, builders } = fixture();
  // Open a two-cell-thick wall from the exterior to the streets.
  for (const b of sim.map.buildings) if (b.kind === 'wall') sim.damageBuilding(b.id, sim.maxHp[b.id]);
  builders.step(sim, 0);
  assert.notEqual(c.state, 'flee');
  for (const b of sim.map.buildings) if (b.kind === 'wall') for (const cell of b.cells) sim.rebuildCell(cell);
  builders.step(sim, 1 / 30);
  assert.equal(c.state, 'flee');
  assert.equal(c.job, -1);
  const before = { x: c.x, y: c.y };
  builders.step(sim, 1 / 30);
  assert.ok(Math.hypot(c.x - before.x, c.y - before.y) > CIVILIAN.speed / 30, 'panic runs faster than ordinary walking');
});
