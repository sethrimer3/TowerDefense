import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim, type Enemy, type Soldier } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout, placeCityTile } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { ENEMIES, UPGRADES, type EnemyKind } from '../src/defend/catalog.ts';
import { FLOOD_LIFE, MAGE_SOAK, floodRadius, wetAt, stepBoat, stepFloods, sinks, fizzles, sheltered } from '../src/defend/boats.ts';
import { center, rectDist } from '../src/defend/pathing.ts';
import { buildDifficultyWave } from '../src/defend/waves.ts';
import { journalHTML } from '../src/defend/journal.ts';
import { defaultDefendSave, decodeDefendSave } from '../src/defend/progress.ts';

const BOATS: EnemyKind[] = ['boatLesser', 'boat', 'boatGreater', 'boatSovereign'];
const SMALL_BOATS: EnemyKind[] = ['boatDinghy', 'boatSailboat', 'boatCutter', 'boatCog'];

function sim() {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) l = placeCityTile(l, tx + dx, ty + dy)!;
  const fit = fitLayout(l); assert.ok(fit.ok);
  const s = new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  s.breakT = 1e9;
  s.computeField();
  return s;
}
const create = (s: DefendSim, kind: EnemyKind, x: number, y: number): Enemy => { const e = (s as any).newEnemy(kind, x, y); s.enemies.push(e); return e; };
const run = (s: DefendSim, seconds: number) => { for (let n = 0; n < seconds * 30 && !s.lost; n++) s.step(1 / 30); };
const mage = (id: number, x: number, y: number): Soldier => ({ id, kind: 'mage', home: 0, x, y, hp: 22, maxHp: 22, damage: 1, cd: 99, target: -1, path: [], thinkT: 99, flash: 0 });
const sword = (id: number, x: number, y: number): Soldier => ({ ...mage(id, x, y), kind: 'sword', hp: 40, maxHp: 40 });

test('small boats have exact costs, growing hulls and harmless water, and enter ordinary waves', () => {
  for (const [n, kind] of SMALL_BOATS.entries()) {
    const def = ENEMIES[kind];
    assert.equal(def.cost, [5, 10, 50, 100][n]);
    assert.ok(def.boat!.decorativeWater && def.boat!.water > def.size / 2);
    assert.ok(def.size < ENEMIES.boatLesser.size && !def.flying && !def.hatched);
    if (n) assert.ok(def.size > ENEMIES[SMALL_BOATS[n - 1]].size);
    const roster = Object.values(ENEMIES).filter(d => !d.hatched && d.cost <= def.cost);
    const roll = (roster.findIndex(d => d.kind === kind) + .5) / roster.length;
    assert.deepEqual(buildDifficultyWave(def.cost, () => roll), [kind]);
  }
});

test('small water reaches buildings without sinking or damaging them and does not alter combat', () => {
  for (const kind of SMALL_BOATS) {
    const s = sim(), def = ENEMIES[kind], house = s.map.buildings.find(b => b.kind === 'house')!;
    const e = create(s, kind, house.rect.x - def.boat!.water + .05, house.rect.y + house.rect.h / 2);
    e.cd = 99; // Isolate water effects from the boat's ordinary bow attack.
    const hp = [...s.hp], built = [...s.built];
    stepBoat(s, e, 0);
    assert.deepEqual([...s.hp], hp);
    assert.deepEqual([...s.built], built);
    assert.equal(s.sinkings.length, 0);
    assert.ok(s.floods.length && s.floods.every(f => f.decorative));
    assert.ok(s.map.buildings.every(b => !sinks(def.boat!, b)));
    s.soldiers.length = 0;
    const m = mage(100, e.x, e.y); s.soldiers.push(m);
    s.blazes.push({ x: e.x, y: e.y, r: .1, t: 0, life: 9, dps: 5, seed: 1 });
    stepFloods(s, .1);
    assert.equal(m.hp, 22);
    assert.equal(s.blazes.length, 1);
    assert.equal(wetAt(s, e.x, e.y), false);
    assert.equal(sheltered(s, e.x, e.y), false);
    assert.equal(fizzles(s, e.x, e.y, 1), false);
    const target = create(s, 'ogre', e.x, e.y);
    s.explode(e.x, e.y, { r: 1, damage: 10, friendlyFire: false });
    assert.equal(target.hp, target.maxHp - 10);
    assert.equal(e.hp, e.maxHp - 10);
  }
});

test('small boats ram walls and the keep with normal damage and leave a drying visual trail', () => {
  for (const kind of SMALL_BOATS) {
    const s = sim(), def = ENEMIES[kind], wall = s.map.buildings.find(b => b.kind === 'wall')!;
    const at = center(wall.rect), e = create(s, kind, at.x, at.y);
    e.cd = 0; const wallHp = s.hp[wall.id]; stepBoat(s, e, 0);
    assert.equal(s.hp[wall.id], wallHp - def.damage);
    const k = s.keep.rect; e.x = k.x + k.w / 2; e.y = k.y - def.size / 2 - .2;
    e.cd = 0; const keepHp = s.keepHp(); stepBoat(s, e, 0);
    assert.equal(s.keepHp(), keepHp - def.damage);
    assert.equal(s.sinkings.length, 0);
    e.x = 10; e.y = 10; e.abilityT = 0; stepBoat(s, e, .5);
    assert.ok(e.y > 10, 'sails toward the keep');
    const trail = s.floods[0];
    assert.equal(floodRadius(trail), def.boat!.water);
    e.hp = 0;
    stepFloods(s, FLOOD_LIFE * .7);
    assert.ok(floodRadius(trail) < def.boat!.water);
    stepFloods(s, FLOOD_LIFE);
    assert.equal(s.floods.length, 0);
  }
});

test('overlapping decorative water never disables the larger boats water effects', () => {
  const s = sim(); s.soldiers.length = 0;
  s.floods.push({ x: 10, y: 10, r: 3, t: 0, life: 99, boat: 1, decorative: true });
  assert.equal(wetAt(s, 10, 10), false);
  s.floods.push({ x: 10, y: 10, r: 2, t: 0, life: 99, boat: 2 });
  assert.equal(wetAt(s, 10, 10), true);
  const m = mage(100, 10, 10); s.soldiers.push(m); stepFloods(s, 1);
  assert.equal(m.hp, 22 - MAGE_SOAK);
  assert.equal(sheltered(s, 10, 10), true);
  assert.equal(fizzles(s, 10, 10, 1), true);
  s.floods = s.floods.filter(f => f.decorative);
  assert.equal(wetAt(s, 10, 10), false);
});

test('a stopped small boat refreshes one pool; moving, death and expiry still leave drying trails', () => {
  const s = sim(), k = s.keep.rect, e = create(s, 'boatDinghy', k.x + k.w / 2, k.y - .4);
  e.cd = 99;
  for (let n = 0; n < 100; n++) { stepFloods(s, .1); stepBoat(s, e, .1); }
  assert.equal(s.floods.length, 1);
  const old = s.floods[0];
  e.x = 10; e.y = 10; e.abilityT = 0; stepBoat(s, e, .1);
  assert.equal(s.floods.length, 2);
  stepFloods(s, 1);
  assert.ok(old.t >= 1);
  e.hp = 0; stepFloods(s, FLOOD_LIFE);
  assert.equal(s.floods.length, 0);
  e.hp = e.maxHp; e.abilityT = 0; stepBoat(s, e, 0);
  assert.equal(s.floods.length, 1, 'expired pool is replaced');
});

test('small boat kills count once and journal discoveries persist with accurate water notes', () => {
  for (const kind of SMALL_BOATS) {
    const s = sim(), e = create(s, kind, 10, 10);
    s.hurtEnemy(e, 1e9, true, 'melee'); (s as any).sweepAway();
    assert.equal(s.slain[kind], 1);
  }
  const saved = defaultDefendSave(); saved.discovered = [...SMALL_BOATS]; saved.journalRead = [...SMALL_BOATS];
  const decoded = decodeDefendSave(saved);
  assert.deepEqual(decoded.discovered, SMALL_BOATS); assert.deepEqual(decoded.journalRead, SMALL_BOATS);
  const html = journalHTML(decoded.discovered);
  for (const kind of SMALL_BOATS) assert.ok(html.includes(ENEMIES[kind].name));
  assert.match(html, /water is purely visual/); assert.doesNotMatch(html, /Its water sinks/);
});

test('magic boats come in the four danger tiers', () => {
  assert.deepEqual(BOATS.map(k => ENEMIES[k].cost), [1000, 10000, 100000, 1000000]);
  assert.deepEqual(BOATS.map(k => [!!ENEMIES[k].boat!.walls, !!ENEMIES[k].boat!.keep]), [[false, false], [false, false], [true, false], [true, true]]);
  for (const k of BOATS) assert.ok(!ENEMIES[k].flying && !ENEMIES[k].hatched, k);
  const rolled = new Set<EnemyKind>();
  for (let n = 0; n < 300; n++) for (const k of buildDifficultyWave(1500, Math.random)) rolled.add(k);
  assert.ok(rolled.has('boatLesser'));
  assert.match(journalHTML(['boatLesser']), /Enchanted Skiff/);
});

test('a skiff sails straight at the keep, sinking houses but ramming the wall', () => {
  const s = sim(), k = s.keep.rect;
  const e = create(s, 'boatLesser', k.x + k.w / 2, 1.5);
  const walls = s.map.buildings.filter(b => b.kind === 'wall').length;
  let rammed = false, sunkHouse = false;
  for (let n = 0; n < 30 * 400 && !s.lost && e.hp > 0; n++) {
    const wallHp = s.map.buildings.filter(b => b.kind === 'wall').reduce((a, b) => a + s.hp[b.id], 0);
    s.step(1 / 30);
    const after = s.map.buildings.filter(b => b.kind === 'wall').reduce((a, b) => a + s.hp[b.id], 0);
    if (after < wallHp) rammed = true;
    for (const sk of s.sinkings) {
      const b = s.map.buildings[sk.building];
      assert.notEqual(b.kind, 'wall'); assert.notEqual(b.kind, 'keep');
      if (b.kind === 'house') sunkHouse = true;
    }
    if (rectDist(k, e.x, e.y) <= ENEMIES.boatLesser.size / 2 + 0.4) break;
  }
  assert.ok(rammed, 'rammed through the wall');
  assert.ok(sunkHouse, 'sank a house');
  assert.equal(s.map.buildings.filter(b => b.kind === 'wall').length, walls);
  assert.ok(s.keepHp() > 0);
  // At the keep it rams; it never sinks it.
  const hp = s.keepHp();
  run(s, 3);
  assert.ok(s.keepHp() < hp);
  assert.ok(s.sinkings.every(sk => s.map.buildings[sk.building].kind !== 'keep'));
});

test('the galleon sinks wall stones, and the ark sinks the keep outright', () => {
  const s = sim(), k = s.keep.rect;
  const wall = s.map.buildings.find(b => b.kind === 'wall' && b.rect.y < k.y)!;
  create(s, 'boatGreater', wall.rect.x + 0.5, wall.rect.y - 1);
  s.step(1 / 30);
  assert.equal(s.built[wall.id], 0);
  assert.ok(s.sinkings.some(sk => sk.building === wall.id));
  const t = sim(), kk = t.keep.rect;
  create(t, 'boatSovereign', kk.x + kk.w / 2, kk.y - 4);
  t.step(1 / 30);
  assert.equal(t.keepHp(), 0);
  assert.ok(t.lost);
});

test('the water dries up behind the boat, leaving rubble', () => {
  const s = sim(), k = s.keep.rect;
  const e = create(s, 'boat', k.x + k.w / 2, 1.5);
  run(s, 2);
  assert.ok(s.floods.length > 5);
  assert.ok(wetAt(s, e.x, e.y));
  const first = s.floods[0];
  assert.ok(floodRadius(first) <= ENEMIES.boat.boat!.water);
  e.hp = 0;
  run(s, FLOOD_LIFE + 0.5);
  assert.equal(s.floods.length, 0);
  assert.ok(!wetAt(s, e.x, e.y));
});

test('the water hurts only fire mages, puts out burning ground and stops splash', () => {
  const s = sim();
  s.soldiers.length = 0; s.civilians.length = 0;
  s.floods.push({ x: 10, y: 10, r: 3, t: 0, life: 99, boat: 0 });
  const m = mage(1, 10, 10), w = sword(2, 10.5, 10);
  s.soldiers.push(m, w);
  s.blazes.push({ x: 11, y: 10, r: 1, t: 0, life: 9, dps: 5, seed: 1 });
  s.step(1 / 30);
  assert.ok(m.hp < 22 && Math.abs(22 - m.hp - MAGE_SOAK / 30) < 1e-6, 'the mage sputters');
  assert.equal(w.hp, 40, 'the swordsman is fine');
  assert.equal(s.blazes.length, 0, 'the fire is out');
  assert.ok(s.effects.some(fx => fx.kind === 'steam'));
  // A blast in the water fizzles; one beside it spares the enemy standing in it.
  const wet = create(s, 'ogre', 12.5, 10), dry = create(s, 'ogre', 14, 10);
  s.explode(10, 10, { r: 2, damage: 50, friendlyFire: true });
  assert.equal(wet.hp, wet.maxHp);
  s.explode(13.6, 10, { r: 1.5, damage: 50, friendlyFire: false });
  assert.equal(wet.hp, wet.maxHp, 'sheltered by the water');
  assert.ok(dry.hp < dry.maxHp);
});

test('runs without boats make no water', () => {
  const s = sim(), k = s.keep.rect;
  create(s, 'ogre', k.x + k.w / 2, 1.5);
  run(s, 5);
  assert.equal(s.floods.length, 0);
  assert.equal(s.sinkings.length, 0);
  assert.ok(center(k));
});
