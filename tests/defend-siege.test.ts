import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim, type Enemy } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { ENEMIES, UPGRADES, type EnemyKind } from '../src/defend/catalog.ts';
import { stepEnemy } from '../src/defend/enemies.ts';
import { blockerAhead, SIEGE_SETUP, stepSiegeShots } from '../src/defend/siege.ts';
import { center, rectDist } from '../src/defend/pathing.ts';
import { buildDifficultyWave } from '../src/defend/waves.ts';

const SIEGE: EnemyKind[] = ['rollingCannon', 'ballista', 'fireworkLauncher', 'trebuchet', 'bombard', 'rocketBattery'];

function sim() {
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  const s = new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  s.breakT = 1e9;
  s.computeField();
  return s;
}
const create = (s: DefendSim, kind: EnemyKind, x: number, y: number): Enemy => { const e = (s as any).newEnemy(kind, x, y); s.enemies.push(e); return e; };
const run = (s: DefendSim, seconds: number) => { for (let n = 0; n < seconds * 30; n++) s.step(1 / 30); };

test('siege engines come in cheap and heavy ranks, all self-driving ground units', () => {
  const cheap = SIEGE.filter(k => ENEMIES[k].cost < 500), heavy = SIEGE.filter(k => ENEMIES[k].cost >= 2000);
  assert.deepEqual(cheap, ['rollingCannon', 'ballista', 'fireworkLauncher']);
  assert.deepEqual(heavy, ['trebuchet', 'bombard', 'rocketBattery']);
  for (const k of SIEGE) assert.ok(ENEMIES[k].siege && !ENEMIES[k].flying && !ENEMIES[k].hatched, k);
  // They join the random mix once a wave can afford them.
  const rolled = new Set<EnemyKind>();
  for (let n = 0; n < 200; n++) for (const k of buildDifficultyWave(400, Math.random)) rolled.add(k);
  assert.ok(rolled.has('rollingCannon') && rolled.has('ballista') && rolled.has('fireworkLauncher'));
});

test('an engine with nothing in range rolls on toward the keep', () => {
  const s = sim(), e = create(s, 'rollingCannon', 31.5, 1.5);
  const keep = center(s.keep.rect), before = rectDist(s.keep.rect, e.x, e.y);
  for (let n = 0; n < 30; n++) stepEnemy(s, e, 1 / 30);
  assert.equal(e.aim, undefined);
  assert.ok(rectDist(s.keep.rect, e.x, e.y) < before, `${keep.x},${keep.y}`);
});

test('engines bombard what blocks their way, bracing first, and breach it', () => {
  const s = sim(), e = create(s, 'rollingCannon', 31.5, 1.5);
  // Drive until something blocks the way within range.
  for (let n = 0; n < 30 * 60 && !e.aim; n++) s.step(1 / 30);
  assert.ok(e.aim && e.aim.building !== undefined, 'found a mark');
  const id = e.aim!.building!, b = s.map.buildings[id];
  assert.ok(rectDist(b.rect, e.x, e.y) <= ENEMIES.rollingCannon.siege!.range);
  if (id !== s.keepId) assert.equal(blockerAhead(s, e, 5), id);
  assert.ok(e.cd > 0 && e.cd <= SIEGE_SETUP + 1e-9, 'braces before the first shot');
  const x = e.x, y = e.y, hp = s.hp[id];
  run(s, 1);
  assert.ok(s.siegeShots.length > 0 || s.hp[id] < hp, 'fired');
  assert.equal(e.x, x); assert.equal(e.y, y);
  run(s, 2);
  assert.ok(s.hp[id] < hp, 'the shot landed on its mark');
});

test('the keep is shot as soon as it is in range', () => {
  const s = sim(), k = s.keep.rect;
  const e = create(s, 'trebuchet', k.x + k.w / 2, k.y - 9);
  stepEnemy(s, e, 1 / 30);
  assert.equal(e.aim?.building, s.keepId);
  const hp = s.keepHp();
  run(s, 4);
  assert.ok(s.keepHp() < hp);
  assert.ok(s.scorches.length > 0);
});

test('a ballista prefers people and its bolt runs through everyone on the line', () => {
  const s = sim();
  s.soldiers.length = 0; s.civilians.length = 0;
  const mk = (id: number, x: number, y: number) => ({ id, kind: 'sword', home: 0, x, y, hp: 100, maxHp: 100, damage: 1, cd: 99, target: -1, path: [], thinkT: 99, flash: 0 }) as any;
  const e = create(s, 'ballista', 5.5, 2.5);
  s.soldiers.push(mk(9001, 5.5, 6.5), mk(9002, 5.5, 5));
  stepEnemy(s, e, 1 / 30);
  assert.equal(e.aim?.unit, 9002, 'the nearest defender');
  e.cd = 0; e.abilityT = 1;
  e.aim = { x: 5.5, y: 6.5, unit: 9001 };
  stepEnemy(s, e, 1 / 30);
  assert.equal(s.siegeShots.length, 1);
  for (let n = 0; n < 30; n++) stepSiegeShots(s, 1 / 30);
  assert.equal(s.soldiers[0].hp, 60); assert.equal(s.soldiers[1].hp, 60);
});

test('rockets leave in a volley, scatter round the mark, and spare other enemies', () => {
  const s = sim();
  const e = create(s, 'rocketBattery', 31.5, 3), other = create(s, 'ogre', 31.5, 9);
  e.aim = { x: 31.5, y: 9 }; e.abilityT = 1; e.cd = 0;
  stepEnemy(s, e, 1 / 30);
  const def = ENEMIES.rocketBattery.siege!;
  assert.equal(s.siegeShots.length, def.volley);
  assert.equal(new Set(s.siegeShots.map(r => r.t)).size, def.volley, 'one after another');
  for (const r of s.siegeShots) assert.ok(Math.abs(r.x1 - 31.5) <= def.spread! && Math.abs(r.y1 - 9) <= def.spread!);
  for (let n = 0; n < 120; n++) stepSiegeShots(s, 1 / 30);
  assert.equal(s.siegeShots.length, 0);
  assert.equal(other.hp, other.maxHp);
  assert.ok(s.effects.some(fx => fx.kind === 'firework'));
});
