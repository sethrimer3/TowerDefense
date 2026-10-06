import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim, type Enemy } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { UPGRADES } from '../src/defend/catalog.ts';
import { chainBolt } from '../src/defend/dark-wizards.ts';
import { assembleFortress } from '../src/defend/fortress.ts';

function scene() {
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  return new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
}
function oldTarget(this: DefendSim, x: number, y: number, r: number, struck: Set<number>) {
  let best: Enemy | null = null, bd = r * r;
  for (const e of this.enemiesNear(x, y, r)) {
    if (struck.has(e.id)) continue;
    const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d < bd || (d === bd && !best)) { best = e; bd = d; }
  }
  return best;
}

test('dense chains preserve complete branches, ties, deaths and damage against original query', () => {
  const sim = scene(), internal = sim as any;
  for (let i = 0; i < 2000; i++) sim.enemies.push(internal.newEnemy('roach', 10 + (i % 50) / 5, 10 + Math.floor(i / 50) / 5));
  internal.indexEnemies();
  const query = sim.chainTarget;
  const run = () => {
    sim.enemies.forEach((e, i) => { e.hp = i % 7 ? 1000 : 1; });
    sim.bolts.length = sim.effects.length = 0;
    const bolt = chainBolt(sim, { x: 9, y: 9 }, sim.enemies[0], 2, 1500, .4);
    return { bolt, hp: sim.enemies.map(e => e.hp), effects: [...sim.effects] };
  };
  sim.chainTarget = oldTarget;
  const before = run();
  sim.chainTarget = query;
  assert.deepEqual(run(), before);
  const struck = new Set<number>();
  for (const [x, y, r] of [[10, 10, 0], [10, 10, 1], [-1, 10, 12], [20, 20, 100]]) {
    assert.equal(sim.chainTarget(x, y, r, struck), oldTarget.call(sim, x, y, r, struck));
  }
});

test('blast grid reuse is scoped to attacks and direct blasts observe moved enemies', () => {
  const sim = scene(), internal = sim as any;
  const e = internal.newEnemy('roach', 10, 10); e.hp = 1000; sim.enemies.push(e);
  const index = internal.indexEnemies.bind(sim); let rebuilds = 0;
  internal.indexEnemies = () => { rebuilds++; index(); };
  internal.stepAttacks = () => {
    sim.explode(10, 10, { r: 1, damage: 1, friendlyFire: false });
    sim.explode(10, 10, { r: 1, damage: 1, friendlyFire: false });
  };
  internal.stepUnits(0);
  assert.equal(rebuilds, 1);
  e.x = 30; e.y = 30;
  const hp = e.hp;
  sim.explode(30, 30, { r: 1, damage: 1, friendlyFire: false });
  assert.equal(e.hp, hp - 1);
  assert.equal(rebuilds, 2);
  assert.equal(internal.enemyLookupActive, false);
  assert.equal(internal.enemyLookup.size, 0);
  e.hp = 0;
  assert.equal(sim.livingEnemy(e.id), undefined);
});

test('fortress lookup uses live health during the enemy phase and clears after it', () => {
  const sim = scene(), internal = sim as any;
  const core = internal.newEnemy('fortressHut', 10, 10);
  sim.enemies.push(core); assembleFortress(sim, core);
  const lookup = sim.livingEnemy; let calls = 0;
  sim.livingEnemy = id => {
    calls++;
    assert.equal(internal.enemyLookupActive, true);
    assert.equal(lookup.call(sim, id), core);
    const hp = core.hp; core.hp = 0;
    assert.equal(lookup.call(sim, id), undefined);
    core.hp = hp;
    return core;
  };
  internal.stepUnits(0);
  assert.equal(calls, core.fortressParts.length);
  sim.livingEnemy = lookup;
  sim.enemies = [];
  assert.equal(sim.livingEnemy(core.id), undefined);
});

test('ranged shields preserve infinite priority, finite order, exhaustion and melee bypass', () => {
  const sim = scene(), internal = sim as any;
  const target = internal.newEnemy('roach', 10, 10);
  const first = internal.newEnemy('shieldLesser', 10, 10);
  const second = internal.newEnemy('shieldBearer', 10, 10);
  const infinite = internal.newEnemy('aegis', 10, 10);
  assert.equal(sim.hurtEnemy(target, 10), false);
  assert.equal(first.shieldHp, 600);
  infinite.hp = 0;
  sim.hurtEnemy(target, 600);
  assert.equal(first.shieldHp, 0);
  assert.equal(second.shieldHp, 3000);
  sim.hurtEnemy(target, 10);
  assert.equal(second.shieldHp, 2990);
  sim.hurtEnemy(target, 1, false, 'melee');
  assert.equal(target.hp, 9);
  second.x = 50;
  sim.hurtEnemy(target, 1);
  assert.equal(target.hp, 8);
});
