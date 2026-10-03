import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { ENEMIES, UPGRADES } from '../src/defend/catalog.ts';
import { stepEnemy } from '../src/defend/enemies.ts';

function simulation() {
  const fit = fitLayout(defaultLayout());
  assert.ok(fit.ok);
  return new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
}

test('cutting a snake preserves segment HP and promotes the rear section', () => {
  const sim = simulation();
  (sim as any).spawnEnemy('snake');
  assert.equal(sim.enemies.length, 12);
  const [head, cut, rear] = sim.enemies;
  sim.hurtEnemy(cut, 100, true, 'melee');
  (sim as any).sweepAway();
  stepEnemy(sim, rear, 1 / 30);
  assert.equal(rear.leader, undefined);
  assert.equal(head.hp, ENEMIES.snake.hp);
  assert.equal(rear.hp, ENEMIES.snake.hp);
  assert.equal(sim.enemies[2].leader, rear.id);
  assert.equal(sim.enemies.length, 11);
});

test('breakable shields absorb ranged hits and melee bypasses them', () => {
  const sim = simulation();
  const shield = (sim as any).newEnemy('shieldBearer', 10, 10);
  const target = (sim as any).newEnemy('roach', 11, 10);
  sim.enemies.push(shield, target);
  assert.equal(sim.hurtEnemy(target, 100), false);
  assert.equal(target.hp, 10);
  assert.equal(shield.shieldHp, 2900);
  sim.hurtEnemy(shield, 10, true, 'melee');
  assert.equal(shield.hp, 790);
  sim.hurtEnemy(target, 3000);
  assert.equal(shield.shieldHp, 0);
  sim.hurtEnemy(target, 2);
  assert.equal(target.hp, 8);
});

test('invincible shields protect themselves, overlap safely and end with generator death', () => {
  const sim = simulation();
  const weak = (sim as any).newEnemy('shieldBearer', 10, 10);
  const strong = (sim as any).newEnemy('aegis', 10, 10);
  const target = (sim as any).newEnemy('roach', 11, 10);
  const outside = (sim as any).newEnemy('roach', 20, 10);
  sim.enemies.push(weak, strong, target, outside);
  sim.hurtEnemy(target, 1e9);
  sim.hurtEnemy(strong, 1e9);
  assert.equal(strong.hp, 6000);
  assert.equal(weak.shieldHp, 3000);
  sim.hurtEnemy(outside, 3);
  assert.equal(outside.hp, 7);
  sim.hurtEnemy(strong, 6000, true, 'melee');
  sim.hurtEnemy(weak, 800, true, 'melee');
  sim.hurtEnemy(target, 2);
  assert.equal(target.hp, 8);
});

test('dragon heads breathe flame into the keep; followers fly and cuts become heads', () => {
  const sim = simulation();
  (sim as any).spawnEnemy('dragon');
  assert.equal(sim.enemies.length, 16);
  const head = sim.enemies[0];
  head.x = sim.keep.rect.x + sim.keep.rect.w / 2;
  head.y = sim.keep.rect.y - 2;
  const hp = sim.hp[sim.keepId];
  stepEnemy(sim, head, 1 / 30);
  assert.ok(head.breath);
  assert.ok(sim.hp[sim.keepId] < hp);
  assert.ok(ENEMIES.dragon.flying);
  assert.equal(sim.enemies[1].hp, ENEMIES.dragon.hp);
});


test('Dark Knights sweep multiple defenders but spare the rear and guarded units', async () => {
  const { chilled } = await import('../src/defend/wizard.ts');
  const sim = simulation();
  const knight = (sim as any).newEnemy('darkKnight', 10, 10);
  knight.chill = 100;
  assert.equal(chilled(knight), 1);
  const unit = (id: number, x: number, y: number, guard = 0) => ({ id, x, y, hp: 100, flash: 0, kind: 'sword', guard });
  sim.soldiers.push(unit(100, 10, 10.5) as any, unit(101, 10.7, 10.7) as any,
    unit(102, 10, 9) as any, unit(103, 10, 10.8, 1) as any);
  stepEnemy(sim, knight, 1 / 30);
  assert.ok(knight.slash);
  assert.deepEqual(sim.soldiers.map(s => s.hp), [65, 65, 100, 100]);
  assert.deepEqual((sim as any).separation(knight).length, 2);
});

test('kamikazes detonate once; birds must finish their dive and can be killed first', () => {
  for (const kind of ['bombOrc', 'bombBird']) {
    const sim = simulation();
    const enemy = (sim as any).newEnemy(kind, 10, 10);
    sim.enemies.push(enemy);
    sim.soldiers.push({ id: 100, x: 10, y: 10.5, hp: 500, flash: 0, kind: 'sword' } as any);
    stepEnemy(sim, enemy, 1 / 30);
    if (kind === 'bombBird') {
      assert.ok(enemy.dive > 0);
      assert.equal(sim.soldiers[0].hp, 500);
      stepEnemy(sim, enemy, .7);
    }
    assert.equal(enemy.hp, 0);
    assert.equal(sim.soldiers[0].hp, 500 - ENEMIES[enemy.kind].damage);
    assert.equal(sim.effects.filter(e => e.kind === 'boom').length, 1);
  }
  const sim = simulation();
  const bird = (sim as any).newEnemy('bombBird', 10, 10);
  bird.dive = .3; bird.hp = 0; sim.enemies.push(bird);
  (sim as any).stepUnits(1 / 30);
  assert.equal(sim.effects.filter(e => e.kind === 'boom').length, 0);
});

test('Void Sparrow black holes pulse at the requested radius and expire', async () => {
  const { stepBlackHoles } = await import('../src/defend/hostile-attacks.ts');
  const { SUB } = await import('../src/defend/grid.ts');
  const sim = simulation();
  const sparrow = (sim as any).newEnemy('voidSparrow', 10, 10);
  sim.soldiers.push({ id: 100, x: 10, y: 11, hp: 10000, flash: 0, kind: 'sword' } as any,
    { id: 101, x: 10 + SUB * .75 + .01, y: 10, hp: 10000, flash: 0, kind: 'sword' } as any);
  stepEnemy(sim, sparrow, 1 / 30);
  assert.equal(sim.blackHoles[0].r * 2, SUB * 1.5);
  stepBlackHoles(sim, 1 / 30);
  assert.equal(sim.soldiers[0].hp, 9700);
  stepBlackHoles(sim, .5);
  assert.equal(sim.soldiers[0].hp, 9400);
  assert.equal(sim.soldiers[1].hp, 10000);
  stepBlackHoles(sim, 8);
  assert.equal(sim.blackHoles.length, 0);
});


test('shield and poison tiers have matching pixel sizes and escalating stats and radii', () => {
  const shields = [ENEMIES.shieldLesser, ENEMIES.shieldBearer, ENEMIES.shieldGreater, ENEMIES.aegis];
  const poisons = [ENEMIES.poisonLesser, ENEMIES.poisonBearer, ENEMIES.poisonGreater, ENEMIES.poisonSovereign];
  for (const family of [shields, poisons]) {
    assert.deepEqual(family.map(d => d.cost), [1000, 10000, 100000, 1000000]);
    assert.deepEqual(family.map(d => d.bodyPixels), [3, 5, 7, 9]);
    assert.deepEqual(family.map(d => d.size * 8), [3, 5, 7, 9]);
    assert.deepEqual(family.map(d => d.shield?.radius ?? d.poison!.radius), [2, 4, 6, 8]);
    for (let n = 1; n < family.length; n++) {
      assert.ok(family[n].hp > family[n - 1].hp);
      assert.ok(family[n].damage > family[n - 1].damage);
    }
  }
  assert.deepEqual(shields.map(d => d.shield!.hp), [600, 3000, 12000, Infinity]);
});

test('poison ticks rapidly, affects civilians and soldiers, and never buildings or ranged attacks', async () => {
  const { stepPoison } = await import('../src/defend/hostile-attacks.ts');
  const sim = simulation();
  const poison = (sim as any).newEnemy('poisonLesser', 10, 10);
  sim.enemies.push(poison);
  sim.soldiers.push({ id: 100, x: 10, y: 11, hp: 100, flash: 0, kind: 'sword' } as any,
    { id: 101, x: 10, y: 12.01, hp: 100, flash: 0, kind: 'sword' } as any);
  sim.civilians.push({ id: 102, x: 11, y: 10, hp: 100, flash: 0 } as any);
  const buildingHP = [...sim.hp];
  stepPoison(sim, 1 / 30);
  assert.equal(sim.soldiers[0].hp, 98);
  assert.equal(sim.civilians[0].hp, 98);
  stepPoison(sim, .1);
  assert.equal(sim.soldiers[0].hp, 96);
  assert.equal(sim.soldiers[1].hp, 100);
  assert.deepEqual([...sim.hp], buildingHP);
  assert.equal(sim.hurtEnemy(poison, 10), true);
  assert.equal(poison.hp, 190);
  poison.hp = 0;
  stepPoison(sim, .1);
  assert.equal(sim.soldiers[0].hp, 96);
});

test('million-tier poison kills on the next contact step, regardless of HP or guard', async () => {
  const { stepPoison } = await import('../src/defend/hostile-attacks.ts');
  const sim = simulation();
  sim.enemies.push((sim as any).newEnemy('poisonSovereign', 10, 10));
  sim.soldiers.push({ id: 100, x: 10, y: 17.9, hp: 1e12, flash: 0, kind: 'valkyrie', guard: 10 } as any,
    { id: 101, x: 10, y: 18.01, hp: 100, flash: 0, kind: 'sword' } as any);
  stepPoison(sim, 1 / 30);
  assert.equal(sim.soldiers[0].hp, 0);
  assert.equal(sim.soldiers[1].hp, 100);
});
