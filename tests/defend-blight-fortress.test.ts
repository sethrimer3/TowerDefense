import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { ENEMIES, UPGRADES, type EnemyKind } from '../src/defend/catalog.ts';
import { enemySpeed } from '../src/defend/enemy-abilities.ts';
import { stepEnemy } from '../src/defend/enemies.ts';
import { syncFortress, stepFortressCore, FORTRESS_FALL } from '../src/defend/fortress.ts';
import { stepSiegeShots } from '../src/defend/siege.ts';
import { laserCrossesRect, stepBlightLasers } from '../src/defend/blight-fortress.ts';
import { createTronField, stepTronField, TRON } from '../src/defend/blight-fortress-particles.ts';
import { journalHTML } from '../src/defend/journal.ts';
import { defaultDefendSave, decodeDefendSave } from '../src/defend/progress.ts';
import { buildDifficultyWave } from '../src/defend/waves.ts';

const kinds: EnemyKind[] = ['blightCannon', 'blightLance', 'blightFortress'];
function scene(kind: EnemyKind) {
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9; sim.civilians = []; sim.soldiers = [];
  (sim as any).spawnEnemy(kind);
  const core = sim.enemies[0]; core.x = 10; core.y = 5; syncFortress(core);
  const turrets = core.fortressParts!.filter(p => p.fortressPart!.role === 'turret');
  return { sim, core, turrets };
}
function soldier(sim: DefendSim, x: number, y: number) {
  const unit = { id: 10000 + sim.soldiers.length, x, y, hp: 1000, flash: 0, kind: 'sword' } as any;
  sim.soldiers.push(unit); return unit;
}

test('three black square Dark One walkers assemble the requested independent weapons', () => {
  for (const [n, kind] of kinds.entries()) {
    const { sim, core, turrets } = scene(kind), def = ENEMIES[kind];
    assert.equal(def.faction, 'darkOne'); assert.equal(def.color, '#000000');
    assert.equal(def.size, def.fortress!.height); assert.equal(def.scriptedOnly, true);
    assert.deepEqual(turrets.map(p => p.fortressPart!.weapon), n === 0 ? ['cannon'] : n === 1 ? ['laser'] : ['cannon', 'laser']);
    assert.equal(sim.enemies.length, 1 + def.fortress!.legs + def.fortress!.armor + def.fortress!.turrets);
    assert.equal(sim.hurtEnemy(core, 10), false);
    const base = enemySpeed(sim, core);
    for (const p of core.fortressParts!) if (p.fortressPart!.role === 'leg' || p.fortressPart!.role === 'armor') p.hp = 0;
    assert.equal(enemySpeed(sim, core), 0); stepFortressCore(sim, core, FORTRESS_FALL); assert.equal(sim.hurtEnemy(core, 10), true);
    const save = defaultDefendSave(); save.discovered = [kind];
    assert.deepEqual(decodeDefendSave(save).discovered, [kind]);
    assert.match(journalHTML([kind]), new RegExp(def.name));
  }
  assert.ok(ENEMIES.blightFortress.size > ENEMIES.blightCannon.size);
  assert.ok(buildDifficultyWave(1e5, () => .5).every(kind => !ENEMIES[kind].blightFortress));
});

test('orange cannonballs travel before bursting, spare enemies and stop with the turret', () => {
  const { sim, core, turrets: [turret] } = scene('blightCannon');
  const unit = soldier(sim, turret.x, turret.y + 2), hp = core.hp;
  turret.cd = 0; stepEnemy(sim, turret, 1 / 30);
  assert.equal(unit.hp, 1000); assert.equal(sim.siegeShots.length, 1);
  const shot = sim.siegeShots[0]; assert.equal(shot.energy, true);
  stepSiegeShots(sim, shot.dur / 2); assert.equal(unit.hp, 1000);
  stepSiegeShots(sim, shot.dur); assert.ok(unit.hp < 1000);
  assert.equal(sim.siegeShots.length, 0); assert.equal(core.hp, hp);
  turret.hp = 0; turret.cd = 0; stepEnemy(sim, turret, 1);
  assert.equal(sim.siegeShots.length, 0);
});

test('the deep orange laser pierces people and multiple structures through its full range', () => {
  const { sim, core, turrets: [turret] } = scene('blightLance');
  const front = soldier(sim, turret.x, turret.y + 1), rear = soldier(sim, turret.x, turret.y + 4);
  const off = soldier(sim, turret.x + .5, turret.y + 2);
  const guarded = soldier(sim, turret.x, turret.y + 3); guarded.guard = 1;
  const outside = soldier(sim, turret.x, turret.y + 6);
  // Real native buildings are put in the beam, one beyond its first target.
  const buildings = sim.map.buildings.filter(b => b.kind === 'house').slice(0, 2);
  for (const [n, b] of buildings.entries()) b.rect = { x: turret.x - .5, y: turret.y + 2 + n * 2, w: 1, h: .5 };
  const before = buildings.map(b => sim.hp[b.id]);
  turret.cd = 0; stepEnemy(sim, turret, 1 / 30);
  assert.ok(front.hp < 1000); assert.equal(rear.hp, front.hp);
  assert.equal(off.hp, 1000); assert.equal(guarded.hp, 1000); assert.equal(outside.hp, 1000);
  buildings.forEach((b, n) => assert.ok(sim.hp[b.id] < before[n]));
  assert.equal(core.hp, core.maxHp); assert.equal(sim.siegeShots.length, 0); assert.equal(sim.blightLasers.length, 1);
  stepBlightLasers(sim, 1); assert.equal(sim.blightLasers.length, 0);
});

test('dual turrets fire independently, stay attached and clean up with exactly one core kill', () => {
  const { sim, core, turrets } = scene('blightFortress');
  soldier(sim, core.x, core.y + 1);
  for (const t of turrets) { t.cd = 0; stepEnemy(sim, t, 1 / 30); }
  assert.equal(sim.siegeShots.length, 1); assert.equal(sim.blightLasers.length, 1);
  sim.siegeShots = []; sim.blightLasers = []; turrets[0].hp = 0;
  for (const t of turrets) { t.cd = 0; stepEnemy(sim, t, 1 / 30); }
  assert.equal(sim.siegeShots.length, 0); assert.equal(sim.blightLasers.length, 1);
  core.x += 1; syncFortress(core);
  for (const p of core.fortressParts!) assert.equal(p.x, core.x + p.fortressPart!.dx);
  for (const p of turrets) if (p.hp > 0) sim.hurtEnemy(p, 1e9, true, 'ranged'); (sim as any).sweepAway();
  assert.equal(sim.enemies.length, 0); assert.equal(sim.slain.blightFortress, 1);
});

test('laser footprint intersection handles parallel, reverse and grazing beams', () => {
  const rect = { x: 2, y: 2, w: 1, h: 1 };
  assert.ok(laserCrossesRect({ x: 0, y: 2.5 }, { x: 5, y: 2.5 }, rect));
  assert.ok(laserCrossesRect({ x: 2.5, y: 5 }, { x: 2.5, y: 0 }, rect));
  assert.ok(laserCrossesRect({ x: 0, y: 1.9 }, { x: 5, y: 1.9 }, rect));
  assert.equal(laserCrossesRect({ x: 0, y: 1.5 }, { x: 5, y: 1.5 }, rect), false);
  assert.equal(laserCrossesRect({ x: 0, y: 0 }, { x: 1, y: 1 }, rect), false);
});

test('Tron particles keep a fixed population, bounded orthogonal trails and one edge replacement per exit', () => {
  for (const count of [TRON.small, TRON.medium]) {
    const field = createTronField(72, count), identical = createTronField(72, count);
    const edges = new Set<number>(); let turns = 0, replacements = 0;
    for (let frame = 0; frame < 1200; frame++) {
      const before = field.particles.map(p => ({ ...p }));
      stepTronField(field); stepTronField(identical);
      assert.equal(field.particles.length, count);
      field.particles.forEach((p, n) => {
        assert.ok(p.x >= TRON.margin && p.x <= 1 - TRON.margin && p.y >= TRON.margin && p.y <= 1 - TRON.margin);
        assert.ok(p.trail.length <= TRON.tail);
        if (p.generation !== before[n].generation) {
          assert.equal(p.generation, before[n].generation + 1); assert.equal(p.trail.length, 1);
          assert.ok(p.x === TRON.margin || p.x === 1 - TRON.margin || p.y === TRON.margin || p.y === 1 - TRON.margin);
          replacements++; edges.add(p.direction);
        } else {
          assert.ok(p.x === before[n].x || p.y === before[n].y);
          if (p.direction !== before[n].direction) turns++;
        }
        for (let k = 1; k < p.trail.length; k++) assert.ok(p.trail[k].x === p.trail[k - 1].x || p.trail[k].y === p.trail[k - 1].y);
      });
    }
    assert.deepEqual(field, identical); assert.ok(turns > 10 && replacements > 10); assert.equal(edges.size, 4);
  }
});
