import { knockBack } from "../src/defend/gunners.ts";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES, UPGRADES, enemySize, type EnemyKind } from '../src/defend/catalog.ts';
import { DefendSim, type Enemy, type Soldier } from '../src/defend/sim.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { cellIndex } from '../src/defend/grid.ts';
import { buildingContactPoint, defenderContactPoint } from '../src/defend/contact.ts';
import { routeToBuilding, stepEnemy, transferCrowdAttacks } from '../src/defend/enemies.ts';

const DT = 1 / 30;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function fixture() {
  const s = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  s.breakT = 1e6; s.soldiers = []; s.civilians = [];
  s.solid.fill(0); s.foeSolid.fill(0); s.ownSolid.fill(0); s.map.wall.fill(0); s.map.owner.fill(-1);
  s.built.fill(0); s.built[s.keepId] = 1;
  const b = s.map.buildings.find(b => b.kind === 'wall' && !b.fence)!;
  b.rect = { x: 20, y: 20, w: 1, h: 1 }; b.cells = [cellIndex(20, 20)];
  s.map.owner[b.cells[0]] = b.id; s.map.wall[b.cells[0]] = 1;
  s.solid[b.cells[0]] = s.foeSolid[b.cells[0]] = s.ownSolid[b.cells[0]] = 1;
  s.hp[b.id] = s.maxHp[b.id] = 1e6; s.built[b.id] = 1;
  return { s, b };
}
function line(s: DefendSim, kinds: EnemyKind[], x = 20.5, y = 19.8125) {
  const out: Enemy[] = []; let previous: Enemy | undefined;
  for (const kind of kinds) {
    if (previous) y -= (enemySize(previous) + ENEMIES[kind].size) / 2;
    const e = s.spawnAuxiliary(kind, x, y)!; e.jx = e.jy = 0; out.push(e); previous = e;
  }
  return out;
}
function phase(s: DefendSim, b: ReturnType<typeof fixture>['b'], dt = DT) {
  s.crowd.begin(s);
  for (const e of s.enemies) { e.cd -= dt; routeToBuilding(s, e, b.id, dt, s.field); }
  transferCrowdAttacks(s); s.crowd.end();
}
function disjoint(a: Enemy, b: Enemy) {
  const reach = (enemySize(a) + enemySize(b)) / 2;
  assert.ok(Math.abs(a.x - b.x) >= reach - 1e-8 || Math.abs(a.y - b.y) >= reach - 1e-8, `${a.kind}/${a.id} overlaps ${b.kind}/${b.id}`);
}

test('mixed ground bodies stop flush and cannot tunnel, including at a bucket boundary', () => {
  const { s } = fixture();
  const [front, rear] = line(s, ['largeDarkling', 'miniDarkling'], 19.99, 18);
  rear.y -= .8; s.crowd.begin(s);
  s.crowd.move(rear, 0, 10); near(front.y - rear.y, .25); disjoint(front, rear);
  s.crowd.move(front, 0, 1); s.crowd.move(rear, 0, 10);
  near(front.y - rear.y, .25);
  const side = s.spawnAuxiliary('darkling', front.x - 2, front.y)!; s.crowd.add(side);
  s.crowd.move(side, 10, 0); near(front.x - side.x, .3125); disjoint(front, side);
  s.crowd.end();
});

test('a rear Darkling adds its own damage through a touching front without moving through it', () => {
  const { s, b } = fixture(), es = line(s, ['darkling', 'miniDarkling', 'largeDarkling']);
  Object.assign(es[0], buildingContactPoint(s, es[0], b));
  // Rebuild exact mixed-size spacings after placing the front.
  for (let i = 1; i < es.length; i++) es[i].y = es[i - 1].y - (enemySize(es[i - 1]) + enemySize(es[i])) / 2;
  const positions = es.map(e => [e.x, e.y]), hp = s.hp[b.id]; phase(s, b);
  near(hp - s.hp[b.id], 7); assert.deepEqual(es.map(e => [e.x, e.y]), positions);
  for (const e of es) near(e.cd, ENEMIES[e.kind].cooldown);
  phase(s, b); near(hp - s.hp[b.id], 7,);
  for (let i = 1; i < es.length; i++) disjoint(es[i], es[i - 1]);
});

test('gaps, dead fronts and non-Blight blockers cannot transmit attacks', () => {
  for (const mode of ['gap', 'dead', 'neutral'] as const) {
    const { s, b } = fixture();
    const es = line(s, mode === 'neutral' ? ['darkling', 'orc', 'darkling'] : ['darkling', 'darkling', 'darkling']);
    es[0].cd = 99;
    if (mode === 'gap') es[1].y -= .03;
    if (mode === 'dead') es[0].hp = 0;
    const hp = s.hp[b.id]; phase(s, b, 0);
    near(s.hp[b.id], hp);
  }
});

test('a frozen middle body conducts, a frozen rear cannot attack, and dead targets stop transfer', () => {
  const { s, b } = fixture(), es = line(s, ['darkling', 'darkling', 'darkling', 'darkling']);
  es[0].cd = 99; es[1].freeze = 1; es[3].freeze = 1;
  const hp = s.hp[b.id]; phase(s, b, 0); near(hp - s.hp[b.id], 2);
  assert.equal(es[1].cd, 0); assert.equal(es[3].cd, 0);
  // Target death never leaves a cached transfer endpoint.
  s.hp[b.id] = 0; for (const e of es) e.cd = 0;
  phase(s, b, 0); near(s.hp[b.id], 0);
});

test('Blight queues against a unit and native guard/defense rules still govern transferred hits', () => {
  for (const guard of [false, true]) {
    const { s } = fixture();
    s.solid.fill(0); s.foeSolid.fill(0); s.ownSolid.fill(0);
    const u: Soldier = { id: 999999, kind: 'sword', home: s.keepId, x: 20.5, y: 20, hp: 100, maxHp: 100, cd: 99, damage: 0, target: -1, path: [], thinkT: 99, flash: 0, ...(guard ? { guard: 1 } : {}) };
    s.soldiers = [u];
    const es = line(s, ['darkling', 'darkling', 'darkling'], u.x, 19);
    Object.assign(es[0], defenderContactPoint(es[0], u));
    for (let i = 1; i < es.length; i++) es[i].y = es[i - 1].y - .25;
    s.crowd.begin(s); for (const e of s.enemies) stepEnemy(s, e, DT); transferCrowdAttacks(s); s.crowd.end();
    near(u.hp, guard ? 100 : 94);
    for (let i = 1; i < es.length; i++) disjoint(es[i], es[i - 1]);
  }
});

test('the real fixed-step loop transfers attacks regardless of enemy iteration order', () => {
  for (const reverse of [false, true]) {
    const { s, b } = fixture(), es = line(s, ['darkling', 'darkling', 'darkling']);
    if (reverse) s.enemies.reverse();
    s.scenario = { manualWaves: true, noCivilians: true, routeEnemy(e, dt) { routeToBuilding(s, e, b.id, dt, s.field); return true; } };
    const hp = s.hp[b.id]; s.step(DT); near(hp - s.hp[b.id], 6);
    assert.equal(s.crowd.active, false);
    for (let i = 1; i < es.length; i++) disjoint(es[i], es[i - 1]);
  }
});

test('10,000 touching minis transfer in one bounded traversal with exact total damage', () => {
  const { s, b } = fixture(), n = 10000;
  const template = s.spawnAuxiliary('miniDarkling', 20.5, 19.875)!;
  s.enemies = Array.from({ length: n }, (_, i) => ({ ...template, id: i + 1, x: 20.5 + i % 100 * .125, y: 19.875 - Math.floor(i / 100) * .125 }));
  s.crowd.begin(s); routeToBuilding(s, s.enemies[0], b.id, 0, s.field);
  const hp = s.hp[b.id]; transferCrowdAttacks(s);
  near(hp - s.hp[b.id], n - 1); assert.equal(s.crowd.work.relayVisits, n);
  assert.ok(s.crowd.work.candidates < n * 160, JSON.stringify(s.crowd.work));
  assert.equal(s.crowd.work.waiting, 0); s.crowd.end();
});

test('coincident spawns pack with a shared search rather than repeated all-crowd scans', () => {
  const { s } = fixture(), n = 10000;
  const template = s.spawnAuxiliary('miniDarkling', 36, 40)!;
  s.enemies = Array.from({ length: n }, (_, i) => ({ ...template, id: i + 1 }));
  s.crowd.begin(s);
  assert.equal(s.crowd.work.waiting, 0);
  assert.ok(s.crowd.work.placements < n * 2, JSON.stringify(s.crowd.work));
  assert.ok(s.crowd.work.candidates < n * 80, JSON.stringify(s.crowd.work));
  const spots = new Set(s.enemies.map(e => `${e.x}:${e.y}`)); assert.equal(spots.size, n);
  s.crowd.end();
});


test('transferred bait retaliation strikes the front and its death interrupts the remaining queue', () => {
  for (const fragile of [false, true]) {
    const { s, b } = fixture(); b.kind = 'monsterBait'; delete b.structureUid;
    (s as any).bonuses = { ...s.bonuses, paths: { bait: { path: 'fortified', rank: 3 } } };
    const es = line(s, ['darkling', 'darkling', 'darkling']);
    Object.assign(es[0], buildingContactPoint(s, es[0], b));
    es[1].y = es[0].y - .25; es[2].y = es[1].y - .25;
    es[0].cd = 99; es[0].hp = es[0].maxHp = fragile ? 5 : 100;
    const hp = s.hp[b.id]; phase(s, b, 0);
    near(hp - s.hp[b.id], fragile ? 2 : 4);
    near(es[1].hp, 6); near(es[2].hp, 6);
    if (fragile) assert.ok(es[0].hp <= 0); else near(es[0].hp, 88);
  }
});

test('a defender charging inside the formation remains a valid contact target', () => {
  const { s } = fixture(); s.solid.fill(0); s.foeSolid.fill(0);
  const u: Soldier = { id: 999999, kind: 'sword', home: s.keepId, x: 20.5, y: 19.8125, hp: 100, maxHp: 100, cd: 99, damage: 0, target: -1, path: [], thinkT: 99, flash: 0 };
  s.soldiers = [u]; line(s, ['darkling', 'darkling', 'darkling']);
  s.crowd.begin(s); for (const e of s.enemies) stepEnemy(s, e, DT); transferCrowdAttacks(s); s.crowd.end();
  near(u.hp, 94);
});

test('trapped arrivals have a bounded placement budget and rejoin when space opens', () => {
  const { s } = fixture(); s.solid.fill(1); s.foeSolid.fill(1);
  const es = [0, 1, 2].map(() => s.spawnAuxiliary('darkling', 20.5, 19.8125)!);
  s.crowd.begin(s); assert.ok(s.crowd.work.placements <= 128); assert.equal(s.crowd.work.waiting, 2);
  s.crowd.end(); es[0].hp = 0; s.solid.fill(0); s.foeSolid.fill(0);
  s.crowd.begin(s); assert.equal(s.crowd.work.waiting, 0); assert.ok(es[1].x > 0 && es[2].x > 0); disjoint(es[1], es[2]); s.crowd.end();
});

test('passive scenarios do not inherit an old contact-transfer phase', () => {
  const { s, b } = fixture(); line(s, ['darkling', 'darkling', 'darkling']); phase(s, b, 0);
  for (const e of s.enemies) e.cd = 0;
  s.scenario = { passiveEnemies: true, noCivilians: true, manualWaves: true };
  const hp = s.hp[b.id]; s.step(DT); near(s.hp[b.id], hp);
});

test('cached queue preparation matches a fresh contact flood through deaths, births and moving defenders', () => {
  const setups = [fixture(), fixture()];
  for (const { s, b } of setups) {
    const es = line(s, Array(8).fill('darkling'));
    s.scenario = { manualWaves: true, noCivilians: true, soldierDt: () => 0,
      routeEnemy(e, dt) { routeToBuilding(s, e, b.id, dt, s.field); return true; } };
  }
  const cold = setups[1].s.crowd, prime = cold.prime.bind(cold);
  cold.prime = valid => { (cold as any).unchanged = false; prime(valid); };
  for (let step = 0; step < 100; step++) {
    for (const { s } of setups) {
      if (step === 10) s.enemies[3].hp = 0;
      if (step === 20) s.spawnAuxiliary('miniDarkling', 20.5, 18);
      if (step === 30) s.soldiers.push({ id: 999999, kind: 'sword', home: s.keepId, x: 20.55, y: 19.5, hp: 500, maxHp: 500, cd: 99, damage: 0, target: -1, path: [], thinkT: 99, flash: 0 });
      if (step === 40) s.soldiers[0].x += .2;
      if (step === 50) s.soldiers[0].hp = 0;
      s.step(DT);
    }
    const snapshot = ({ s, b }: typeof setups[number]) => [s.hp[b.id], s.enemies.map(e => [e.id, e.kind, e.x, e.y, e.hp, e.cd]), s.soldiers.map(u => [u.id, u.hp, u.x, u.y])];
    assert.deepEqual(snapshot(setups[0]), snapshot(setups[1]), `phase ${step}`);
  }
});


test('ordinary bullet knockback cannot shove a front body through its packed rear rank', () => {
  const { s } = fixture(), es = line(s, ['darkling', 'darkling', 'darkling']);
  s.crowd.begin(s);
  const y = es[0].y;
  knockBack(s, { x: es[0].x, y: 21, origin: { x: es[0].x, y: 21 }, tx: es[0].x, ty: 15, life: 1, damage: 1, target: es[0].id, knock: 2 }, es[0]);
  near(es[0].y, y); for (let i = 1; i < es.length; i++) disjoint(es[i], es[i - 1]); s.crowd.end();
});
