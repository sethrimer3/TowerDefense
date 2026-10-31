import { fortressFootStride } from "../src/defend/fortress-motion-art.ts";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { ENEMIES, UPGRADES, enemyFlying, groundMeleeTarget, type EnemyKind } from '../src/defend/catalog.ts';
import { enemySpeed } from '../src/defend/enemy-abilities.ts';
import { stepEnemy } from '../src/defend/enemies.ts';
import { syncFortress, stepFortressCore, finishFortressStep, FORTRESS_FALL, fortressLift, fortressAreaTargets } from '../src/defend/fortress.ts';
import { MAX_WAVE_ENEMIES, slots, buildDifficultyWave } from '../src/defend/waves.ts';
import { fortressBodyPixels } from '../src/defend/fortress-art.ts';
import { journalHTML } from '../src/defend/journal.ts';
import { decodeDefendSave, defaultDefendSave } from '../src/defend/progress.ts';

const kinds = Object.values(ENEMIES).filter(d => d.fortress).map(d => d.kind);
function scene(kind: EnemyKind = 'fortress') {
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
  (sim as any).spawnEnemy(kind);
  const core = sim.enemies[0]; core.x = 10; core.y = 8;
  core.walker!.x = core.x; core.walker!.y = core.y; syncFortress(core);
  const legs = core.fortressParts!.filter(p => p.fortressPart!.role === 'leg');
  const turrets = core.fortressParts!.filter(p => p.fortressPart!.role === 'turret');
  return { sim, core, legs, turrets };
}
function ground(s: ReturnType<typeof scene>, left = 2) {
  for (const leg of s.legs.slice(left)) s.sim.hurtEnemy(leg, 1e9, true, 'melee');
  stepFortressCore(s.sim, s.core, FORTRESS_FALL);
}

test('every walker has six, eight or twelve evenly spaced legs on all four sides', () => {
  for (const kind of kinds) {
    const { core, legs, turrets } = scene(kind), def = ENEMIES[kind], fort = def.fortress!;
    const expected = def.size <= 2 ? 6 : def.size <= 3.5 ? 8 : 12;
    assert.equal(legs.length, expected);
    assert.deepEqual([0, 1, 2, 3].map(side => legs.filter(p => p.fortressPart!.side === side).length), expected === 6 ? [2, 1, 2, 1] : Array(4).fill(expected / 4));
    for (let side = 0; side < 4; side++) {
      const positions = legs.filter(p => p.fortressPart!.side === side).map(p => side % 2 ? p.fortressPart!.dx : p.fortressPart!.dy);
      const span = side % 2 ? def.size : fort.height;
      positions.forEach((position, n) => assert.equal(position, ((n + 1) / (positions.length + 1) - .5) * span));
    }
    assert.equal(core.hp, turrets.reduce((sum, t) => sum + t.hp, 0));
    assert.equal(core.walker!.phase, 'raised'); assert.equal(core.untargetable, true);
    assert.ok(turrets.every(enemyFlying)); assert.ok(turrets.every(t => !groundMeleeTarget(t)));
    assert.ok(legs.every(t => !enemyFlying(t) && groundMeleeTarget(t)));
  }
});

test('planted feet hold their world position and opposite legs use alternate banks', () => {
  const a = fortressFootStride(.1, .65, 0, 0), b = fortressFootStride(.11, .65, 0, 0);
  assert.equal(a.lift, 0); assert.equal(b.lift, 0);
  assert.ok(Math.abs((.1 + a.forward) - (.11 + b.forward)) < 1e-12);
  const left = fortressFootStride(.2, .65, 0, 0), right = fortressFootStride(.2, .65, 0, 2);
  assert.equal(left.lift, 0); assert.ok(right.lift > 0);
});

test('raised and falling chassis are absolutely immune; air and ground attacks can break legs', () => {
  const s = scene(), { sim, core, legs, turrets } = s;
  const hp = turrets.map(t => t.hp);
  assert.equal(sim.hurtEnemy(core, 1e9, true, 'ranged', undefined, true, 'physical', 1), false);
  assert.equal(sim.hurtEnemy(turrets[0], 5, true, 'melee'), false);
  assert.equal(sim.hurtEnemy(legs[0], 5, true, 'melee'), true);
  assert.equal(sim.hurtEnemy(legs[0], 5, true, 'ranged'), true);
  for (const leg of legs.slice(2)) sim.hurtEnemy(leg, 1e9, true, 'melee');
  assert.equal(core.walker!.phase, 'falling');
  stepFortressCore(sim, core, FORTRESS_FALL / 2);
  assert.ok(fortressLift(core) > 0 && fortressLift(core) < .18);
  assert.equal(sim.hurtEnemy(core, 5, true, 'melee'), false);
  assert.deepEqual(turrets.map(t => t.hp), hp);
  stepFortressCore(sim, core, FORTRESS_FALL / 2);
  assert.equal(core.walker!.phase, 'grounded'); assert.equal(core.untargetable, undefined);
  assert.equal(fortressLift(core), 0); assert.equal(sim.effects.filter(e => e.kind === 'dust').length, 1);
  stepFortressCore(sim, core, 1);
  assert.equal(sim.effects.filter(e => e.kind === 'dust').length, 1);
});

test('a fortress blocked by a crowd still completes its collapse', () => {
  const s = scene();
  for (const leg of s.legs.slice(2)) s.sim.hurtEnemy(leg, 1e9, true, 'melee');
  s.sim.crowd.holds = () => true;
  stepEnemy(s.sim, s.core, FORTRESS_FALL);
  assert.equal(s.core.walker!.phase, 'grounded');
  assert.ok(s.sim.effects.some(e => e.kind === 'dust'));
});

test('each grounded body hit deals its full damage separately to every surviving turret', () => {
  const s = scene(); ground(s); const { sim, core, turrets } = s;
  const before = turrets.map(t => t.hp);
  assert.equal(sim.hurtEnemy(core, 5, true, 'melee'), true);
  assert.deepEqual(turrets.map(t => t.hp), before.map(hp => hp - 5));
  assert.ok(core.flash > 0); assert.equal(core.hp, turrets.reduce((sum, t) => sum + t.hp, 0));
  assert.equal(sim.hurtEnemy(turrets[0], 5, true, 'melee'), false);
  assert.equal(sim.hurtEnemy(turrets[0], 5, true, 'ranged'), true);
  assert.equal(turrets[0].hp, before[0] - 10);
  assert.equal(turrets[1].hp, before[1] - 5);
  assert.equal(groundMeleeTarget(core), true);
});

test('two or one legs pull the grounded chassis; no legs means no movement', () => {
  const s = scene(); ground(s, 2); const { sim, core, legs } = s;
  sim.scenario = { routeEnemy: (e, dt) => { e.y += enemySpeed(sim, e) * dt; return true; } };
  const base = ENEMIES[core.kind].speed;
  assert.equal(enemySpeed(sim, core), base * 2 / legs.length);
  const y = core.y; stepEnemy(sim, core, .2); finishFortressStep(sim, core);
  assert.ok(core.y > y); assert.ok(core.walker!.walk > 0);
  sim.hurtEnemy(legs[1], 1e9, true, 'melee');
  assert.equal(enemySpeed(sim, core), base / legs.length);
  const y1 = core.y; stepEnemy(sim, core, .2); finishFortressStep(sim, core); assert.ok(core.y > y1);
  sim.hurtEnemy(legs[0], 1e9, true, 'melee');
  assert.equal(enemySpeed(sim, core), 0);
  const point = { x: core.x, y: core.y }; stepEnemy(sim, core, 1);
  assert.deepEqual({ x: core.x, y: core.y }, point);
});

test('dragging leaves bounded transient rock debris only along actual movement', () => {
  const s = scene(); ground(s); const { sim, core } = s;
  finishFortressStep(sim, core); assert.equal(sim.fortressRubble.length, 0);
  for (let n = 0; n < 300; n++) { core.y += .2; finishFortressStep(sim, core); }
  assert.equal(sim.fortressRubble.length, 256);
  assert.ok(sim.fortressRubble.every(r => r.life === 5));
  (sim as any).tick(6); assert.equal(sim.fortressRubble.length, 0);
});

test('all turrets dead destroys the whole walker immediately and credits exactly one kill', () => {
  for (const kind of kinds) {
    const { sim, core, legs, turrets } = scene(kind);
    let credited = 0; sim.tally = (_b, _d, killed) => { if (killed) credited++; };
    for (const turret of turrets) sim.hurtEnemy(turret, 1e9, true, 'ranged', { x: 0, y: 0, building: 0 });
    assert.equal(core.hp, 0); assert.ok(legs.every(p => p.hp === 0));
    assert.ok(sim.enemies.every(p => p.hp <= 0)); assert.equal(credited, 1);
    assert.equal(sim.effects.filter(e => e.kind === 'boom').length, 1);
    (sim as any).sweepAway(); assert.equal(sim.enemies.length, 0); assert.equal(sim.slain[kind], 1);
  }
});

test('area hits cannot double strike both chassis and rooftop mounts; ground blasts cannot hit raised mounts', () => {
  const s = scene(), { sim, core, turrets } = s;
  const t = turrets[0], hp = t.hp;
  sim.explode(t.x, t.y, { r: .1, damage: 10, friendlyFire: false, groundOnly: true });
  assert.equal(t.hp, hp);
  sim.explode(t.x, t.y, { r: .1, damage: 10, friendlyFire: false }); assert.equal(t.hp, hp - 10);
  ground(s);
  const before = turrets.map(t => t.hp);
  assert.ok(fortressAreaTargets(sim.enemies).every(e => e.fortressPart?.role !== 'turret'));
  sim.explode(core.x, core.y, { r: 10, damage: 10, friendlyFire: false });
  assert.deepEqual(turrets.map(t => t.hp), before.map(hp => hp - 10));
});

test('collision queries omit raised chassis and decorative armor, then expose the grounded body', () => {
  const s = scene(); (s.sim as any).indexEnemies();
  const raised = s.sim.enemiesNear(s.core.x, s.core.y, 10);
  assert.ok(!raised.includes(s.core)); assert.ok(raised.every(e => e.fortressPart?.role !== 'armor'));
  assert.ok(s.turrets.every(t => raised.includes(t)));
  ground(s); (s.sim as any).indexEnemies();
  assert.ok(s.sim.enemiesNear(s.core.x, s.core.y, 10).includes(s.core));
});

test('turrets continuously aim while reloading and remain aligned during the fall', () => {
  const { sim, core, turrets: [turret], legs } = scene();
  const foe = { id: 100, x: turret.x + 1, y: turret.y + 1, hp: 1000, flash: 0, kind: 'sword' } as any;
  sim.soldiers.push(foe); turret.cd = 0; stepEnemy(sim, turret, 1 / 30);
  assert.ok(foe.hp < 1000); assert.deepEqual(turret.aim, { x: foe.x, y: foe.y });
  foe.x += .5; stepEnemy(sim, turret, 1 / 30); assert.equal(turret.aim!.x, foe.x);
  for (const p of legs.slice(2)) sim.hurtEnemy(p, 1e9, true, 'melee');
  stepFortressCore(sim, core, .2); syncFortress(core);
  assert.equal(turret.y, core.y + turret.fortressPart!.dy - fortressLift(core));
});

test('spawn reservations remain atomic and the journal preserves all walker discoveries', () => {
  for (const kind of kinds) {
    const s = scene(kind).sim, reserve = slots(ENEMIES[kind]); s.enemies = [];
    (s as any).waveSpawned = MAX_WAVE_ENEMIES - reserve + 1; (s as any).spawnEnemy(kind); assert.equal(s.enemies.length, 0);
    (s as any).waveSpawned = MAX_WAVE_ENEMIES - reserve; (s as any).spawnEnemy(kind); assert.equal(s.enemies.length, reserve);
  }
  const saved = defaultDefendSave(); saved.discovered = [...kinds]; saved.journalRead = [...kinds];
  assert.deepEqual(decodeDefendSave(saved).discovered, kinds);
  const html = journalHTML(kinds); for (const kind of kinds) assert.match(html, new RegExp(ENEMIES[kind].name));
  assert.ok(buildDifficultyWave(1e12, () => .99).reduce((sum, k) => sum + slots(ENEMIES[k]), 0) <= MAX_WAVE_ENEMIES);
});

test('top-down body sources retain native dimensions, damage variants and deterministic material', () => {
  for (const kind of kinds.filter(k => !ENEMIES[k].blightFortress)) {
    const d = ENEMIES[kind], f = d.fortress!, w = d.size * 8, h = f.height * 8;
    const whole = fortressBodyPixels(f.tier, w, h, true, false, 0, 1);
    assert.equal(whole.length, w * h); assert.ok(whole.every(p => p !== 0));
    assert.notDeepEqual(fortressBodyPixels(f.tier, w, h, true, true, 0, 1), whole);
    assert.deepEqual(fortressBodyPixels(f.tier, w, h, true, false, 0, 1), whole);
  }
});
