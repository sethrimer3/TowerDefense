import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { UPGRADES } from '../src/defend/catalog.ts';
import { stepEnemy } from '../src/defend/enemies.ts';
import { enemyDamage, enemySpeed } from '../src/defend/enemy-abilities.ts';
import { blocked, cellCenter } from '../src/defend/pathing.ts';

function sim() {
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  return new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
}
const create = (s: DefendSim, kind: string, x = 10, y = 10) => { const e = (s as any).newEnemy(kind, x, y); s.enemies.push(e); return e; };

test('beetle armor depends on attacker direction for both melee and ranged hits', () => {
  const s = sim(), e = create(s, 'siegeBeetle'); e.facing = { x: 0, y: 1 };
  s.hurtEnemy(e, 100, true, 'melee', { x: 10, y: 11 }); assert.equal(e.hp, 575);
  s.hurtEnemy(e, 100, true, 'ranged', { x: 10, y: 9 }); assert.equal(e.hp, 425);
});
test('moles cross solid walls, resist damage underground, and surface inside the city', () => {
  const s = sim(), e = create(s, 'burrowingMole');
  s.hurtEnemy(e, 10000); assert.equal(e.hp, 100);
  for (let n = 0; n < 4000 && e.burrow; n++) stepEnemy(s, e, 1 / 30);
  assert.equal(e.burrow, 0); assert.ok(!blocked(s.solid, e.x, e.y));
  s.hurtEnemy(e, 10); assert.equal(e.hp, 90);
});
test('necromancers consume corpses once, stop at four summons, and respect the cap', () => {
  const s = sim(), e = create(s, 'necromancer');
  s.corpses = Array.from({ length: 6 }, () => ({ x: 10, y: 10, life: 10 }));
  for (let n = 0; n < 6; n++) { e.abilityT = 0; stepEnemy(s, e, 1 / 30); }
  assert.equal(s.enemies.filter(e => e.kind === 'skeleton').length, 4);
  assert.equal(s.corpses.length, 2);
  const capped = sim(), necro = create(capped, 'necromancer'); (capped as any).waveSpawned = 5000;
  capped.corpses.push({ x: 10, y: 10, life: 10 }); stepEnemy(capped, necro, 1 / 30);
  assert.equal(capped.enemies.length, 1);
});
test('banner auras do not stack and disappear when carriers die', () => {
  const s = sim(), e = create(s, 'orc');
  const a = create(s, 'bannerCaptain', 11), b = create(s, 'bannerCaptain', 12);
  s.bannerCarriers = [a, b]; assert.equal(enemyDamage(s, e), 6 * 1.3); assert.equal(enemySpeed(s, e), 2);
  a.hp = b.hp = 0; assert.equal(enemyDamage(s, e), 6); assert.equal(enemySpeed(s, e), 1.6);
});
test('mirror knights reflect arrows to their shooter but never melee', () => {
  const s = sim(), e = create(s, 'mirrorKnight');
  s.soldiers.push({ id: 100, hp: 100, flash: 0, kind: 'archer' } as any);
  s.hurtEnemy(e, 50, true, 'ranged', { x: 10, y: 9, attacker: 100 }, true);
  assert.equal(s.soldiers[0].hp, 80); assert.equal(e.hp, 300);
  s.hurtEnemy(e, 50, true, 'melee', { x: 10, y: 9, attacker: 100 }); assert.equal(s.soldiers[0].hp, 80);
});
test('leeches heal only by actual damage to unguarded player units', () => {
  const s = sim(), e = create(s, 'leechSwarm'); e.hp = 50;
  s.soldiers.push({ id: 100, x: 10, y: 10.2, hp: 5, flash: 0, kind: 'sword' } as any);
  stepEnemy(s, e, 1 / 30); assert.equal(e.hp, 55);
});
test('phoenix eggs revive once and can be destroyed before hatching', () => {
  const s = sim(), e = create(s, 'ashPhoenix'); e.hp = 0; (s as any).sweepAway();
  const egg = s.enemies[0]; assert.equal(egg.kind, 'phoenixEgg');
  stepEnemy(s, egg, 5.1); (s as any).sweepAway();
  const revived = s.enemies[0]; assert.equal(revived.kind, 'ashPhoenix'); assert.ok(revived.reborn);
  revived.hp = 0; (s as any).sweepAway(); assert.equal(s.enemies.length, 0);
  const other = sim(), phoenix = create(other, 'ashPhoenix'); phoenix.hp = 0; (other as any).sweepAway();
  other.hurtEnemy(other.enemies[0], 100); (other as any).sweepAway(); assert.equal(other.enemies.length, 0);
});
test('blink imps visibly wait before jumping and only land in open cells', () => {
  const s = sim(), e = create(s, 'blinkImp'); e.abilityT = 0;
  stepEnemy(s, e, 1 / 30); assert.ok(e.blink);
  const x = e.x, y = e.y, destination = { ...e.blink };
  stepEnemy(s, e, .2); assert.equal(e.x, x); assert.equal(e.y, y);
  stepEnemy(s, e, .5); assert.equal(e.x, destination.x); assert.equal(e.y, destination.y);
  assert.ok(!blocked(s.solid, e.x, e.y));
});



test('raised skeletons are weaker than even the original roach', () => {
  const s = sim(), roach = create(s, 'roach'), necro = create(s, 'necromancer', 10.1, 10);
  roach.hp = 0; (s as any).sweepAway();
  stepEnemy(s, necro, 1 / 30);
  const skeleton = s.enemies.find(e => e.kind === 'skeleton')!;
  assert.ok(skeleton.maxHp < 10);
  assert.ok(enemyDamage(s, skeleton) < 2);
});


test('projectile explosions reflect damage to their original caster', () => {
  const s = sim(), knight = create(s, 'mirrorKnight');
  s.soldiers.push({ id: 100, x: 10, y: 8, hp: 100, flash: 0, kind: 'mage' } as any);
  s.explode(10, 10, { r: 1, damage: 50, friendlyFire: false, origin: { x: 10, y: 8, attacker: 100 } });
  assert.equal(s.soldiers[0].hp, 80);
  assert.equal(knight.hp, 300);
});
