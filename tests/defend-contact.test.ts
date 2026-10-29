import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES, UPGRADES, enemySize, type EnemyKind } from '../src/defend/catalog.ts';
import { ART } from '../src/defend/art-scale.ts';
import { DefendSim } from '../src/defend/sim.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { CELLS_W, cellIndex } from '../src/defend/grid.ts';
import { approachBuildingContact, buildingContactPoint, contactRadius, structureContactRect } from '../src/defend/contact.ts';
import { routeToBuilding, stepEnemy } from '../src/defend/enemies.ts';
import { stepIceCube } from '../src/defend/ice-enemies.ts';
import { stepBoat } from '../src/defend/boats.ts';

const DT = 1 / 30;
function fixture(kind: 'wall' | 'house' = 'wall') {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
  sim.solid.fill(0); sim.foeSolid.fill(0); sim.ownSolid.fill(0); sim.map.wall.fill(0); sim.map.owner.fill(-1);
  const b = sim.map.buildings.find(b => b.kind === kind)!;
  b.rect = { x: 20, y: 20, w: 1, h: 1 }; b.cells = [cellIndex(20, 20)];
  sim.map.owner[b.cells[0]] = b.id; sim.map.wall[b.cells[0]] = kind === 'wall' ? 1 : 0;
  sim.solid[b.cells[0]] = sim.foeSolid[b.cells[0]] = sim.ownSolid[b.cells[0]] = 1;
  sim.hp[b.id] = sim.maxHp[b.id] = 1e6; sim.built[b.id] = 1;
  return { sim, b };
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('all three Darkling sizes close the old attack gap before damaging a wall', () => {
  for (const kind of ['miniDarkling', 'darkling', 'largeDarkling'] as const) {
    const { sim, b } = fixture(), e = sim.spawnAuxiliary(kind, 20.5, 19.55)!;
    const initial = sim.hp[b.id];
    routeToBuilding(sim, e, b.id, DT, sim.field);
    assert.equal(sim.hp[b.id], initial, 'old 0.4-cell reach cannot deal damage');
    let ticks = 1;
    while (sim.hp[b.id] === initial && ticks++ < 60) routeToBuilding(sim, e, b.id, DT, sim.field);
    assert.ok(ticks < 60, `${kind} reached contact`);
    close(structureContactRect(sim, b).y - (e.y + enemySize(e) / 2), 1 / ART);
    const y = e.y, hp = sim.hp[b.id];
    for (let n = 0; n < 10; n++) routeToBuilding(sim, e, b.id, DT, sim.field);
    close(e.y, y); assert.equal(sim.hp[b.id], hp, 'cooldown is not bypassed');
  }
});

test('contact is geometric on every face and at corners, including the wall front', () => {
  for (const kind of ['miniDarkling', 'darkling', 'largeDarkling'] as const) {
    const { sim, b } = fixture(), half = ENEMIES[kind].size / 2, clearance = half + 1 / ART;
    const body = structureContactRect(sim, b);
    close(body.h, 1.45 - 1 / ART);
    for (const [x, y] of [[20.5, body.y - clearance], [body.x - clearance, 20.5], [body.x + body.w + clearance, 20.5],
      [20.5, body.y + body.h + clearance], [body.x - clearance, body.y - clearance], [body.x + body.w + clearance, body.y - clearance]]) {
      const e = sim.spawnAuxiliary(kind, x, y)!;
      assert.equal(approachBuildingContact(sim, e, b, DT), true);
      const p = buildingContactPoint(sim, e, b); close(p.x, x); close(p.y, y);
      e.cd = 0; const hp = sim.hp[b.id]; routeToBuilding(sim, e, b.id, DT, sim.field);
      assert.ok(sim.hp[b.id] < hp, 'scenario routes recognize the visible wall face');
    }
  }
});

test('the one-pixel body can reach a native building rim without the old 0.18-cell padding', () => {
  const { sim, b } = fixture('house'), e = sim.spawnAuxiliary('miniDarkling', 20.5, 19.55)!;
  assert.ok(contactRadius(e) < .18);
  let n = 0;
  while (!approachBuildingContact(sim, e, b, DT) && n++ < 60) {}
  assert.ok(n < 60);
  close(b.rect.y - e.y - enemySize(e) / 2, .5 / ART);
  assert.ok(e.y > 19.82, 'tiny body can move beyond the legacy collision padding');
});

test('a positive sub-0.02-cell movement step still arrives, with no freeze/zero-dt teleport', () => {
  const { sim, b } = fixture(), e = sim.spawnAuxiliary('miniDarkling', 20.5, 19.865)!;
  const start = e.y;
  assert.equal(approachBuildingContact(sim, e, b, 0), false); close(e.y, start);
  e.freeze = 1;
  assert.equal(approachBuildingContact(sim, e, b, DT), false); close(e.y, start);
  delete e.freeze;
  assert.equal(approachBuildingContact(sim, e, b, DT), true);
  close(e.y, 20 - .0625 - .0625);
});

test('thin wooden rails can be contacted inside their logical fence cell without crossing another obstacle', () => {
  const { sim, b } = fixture();
  b.fence = { x1: 20, y1: 20.5, x2: 21, y2: 20.5 };
  const e = sim.spawnAuxiliary('miniDarkling', 20.5, 19.55)!;
  const hp = sim.hp[b.id];
  for (let n = 0; n < 90 && sim.hp[b.id] === hp; n++) routeToBuilding(sim, e, b.id, DT, sim.field);
  assert.ok(sim.hp[b.id] < hp);
  close(e.y, 20.5 - .25 - .125);
  assert.equal(Math.floor(e.y), 20, 'only the target fence margin was entered');
  const { sim: blocked, b: wall } = fixture('house');
  const other = cellIndex(20, 19); blocked.foeSolid[other] = blocked.solid[other] = 1;
  const trapped = blocked.spawnAuxiliary('miniDarkling', 20.5, 18.5)!;
  for (let n = 0; n < 90; n++) approachBuildingContact(blocked, trapped, wall, DT);
  assert.ok(trapped.y < 19, 'another solid owner remains impassable');
});

test('native marching gates every wall bite on the same contact point', () => {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
  (sim as any).computeField();
  const wall = sim.map.buildings.filter(b => b.kind === 'wall' && !b.fence).sort((a, b) => a.rect.y - b.rect.y)[0];
  const e = sim.spawnAuxiliary('miniDarkling', wall.rect.x + .5, wall.rect.y - .45)!;
  let hit = false;
  for (let n = 0; n < 300 && !hit; n++) {
    const before = [...sim.hp]; stepEnemy(sim, e, DT);
    for (const b of sim.map.buildings) if (sim.hp[b.id] < before[b.id]) {
      const contact = buildingContactPoint(sim, e, b); close(contact.x, e.x); close(contact.y, e.y); hit = true;
    }
  }
  assert.equal(hit, true);
});

test('boat rams and cardinal cube strikes also wait for body contact', () => {
  for (const kind of ['boatDinghy', 'iceCube'] as const) {
    const { sim, b } = fixture('house');
    // Use the keep target so the specialist takes its direct approach.
    sim.keep.rect = { ...b.rect }; sim.keep.cells = b.cells;
    const keep = sim.keep, half = ENEMIES[kind].size / 2;
    const e = sim.spawnAuxiliary(kind, 20.5, 20 - half - .35)!;
    const hp = sim.hp[keep.id], step = kind === 'iceCube' ? stepIceCube : stepBoat;
    step(sim, e, DT); assert.equal(sim.hp[keep.id], hp);
    let n = 0;
    while (sim.hp[keep.id] === hp && n++ < 90) step(sim, e, DT);
    assert.ok(n < 90, kind); close(20 - e.y - half, .5 / ART);
  }
});
