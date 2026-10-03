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
