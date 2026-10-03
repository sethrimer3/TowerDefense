import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthbarEnemies, MAX_ENEMY_HEALTHBARS } from '../src/defend/healthbars.ts';
import { ENEMIES, type EnemyKind } from '../src/defend/catalog.ts';
import { decodeSettings } from '../src/settings.ts';

const enemy = (kind: EnemyKind, id: number, hp = ENEMIES[kind].hp) => ({ kind, id, hp, maxHp: ENEMIES[kind].hp });

test('trivial enemies never get bars; selection follows the actual random wave roster', () => {
  const sim: any = { wave: 1, spawnQueue: [], enemies: [enemy('roach', 1), enemy('orc', 2)] };
  assert.deepEqual(healthbarEnemies(sim), []);
  sim.enemies = [enemy('warlord', 3), enemy('darkKnight', 4)];
  assert.deepEqual(healthbarEnemies(sim).map(e => e.kind), ['darkKnight']);
  sim.spawnQueue = ['aegis'];
  assert.deepEqual(healthbarEnemies(sim), []);
  sim.spawnQueue = [];
  assert.deepEqual(healthbarEnemies(sim), [], 'weak survivors do not acquire bars');
  sim.wave++;
  assert.deepEqual(healthbarEnemies(sim).map(e => e.kind), ['darkKnight']);
});

test('bars are capped, prioritise wounded enemies, and ignore dead enemies and chain followers', () => {
  const sim: any = { wave: 1, spawnQueue: [], enemies: Array.from({ length: 20 }, (_, i) => enemy('dragon', i + 1)) };
  sim.enemies[19].hp = 20;
  sim.enemies[18].leader = 1;
  sim.enemies[17].hp = 0;
  const bars = healthbarEnemies(sim);
  assert.equal(bars.length, MAX_ENEMY_HEALTHBARS);
  assert.equal(bars[0].id, 20);
  assert.ok(!bars.some(e => e.id === 19 || e.id === 18));
  assert.deepEqual(healthbarEnemies(sim).map(e => e.id), bars.map(e => e.id));
});

test('healthbar preference persists and defaults on for older saves', () => {
  assert.equal(decodeSettings({}).showHealthbars, true);
  assert.equal(decodeSettings({ showHealthbars: false }).showHealthbars, false);
});
