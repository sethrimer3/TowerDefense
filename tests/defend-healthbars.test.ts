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

test('bounded healthbar selection matches stable full sorting for large mixed crowds', () => {
  const kinds = Object.keys(ENEMIES) as EnemyKind[];
  for (let wave=1;wave<=8;wave++) {
    const enemies = Array.from({length:2500},(_,i)=>({
      ...enemy(kinds[(i*17+wave)%kinds.length],i),
      hp: (i%29+1)*7,
      ...(i%31===0 ? {hp:0} : {}),
      ...(i%37===0 ? {leader:1} : {}),
      ...(i%41===0 ? {burrow:1} : {}),
    }));
    const sim:any={wave,spawnQueue:[],enemies};
    const threshold=Math.max(100,Math.max(...enemies.map(e=>ENEMIES[e.kind].cost))/4);
    const expected=enemies.filter((e:any)=>e.hp>0 && !(e.burrow>0) && e.leader===undefined && ENEMIES[e.kind].cost>=threshold)
      .sort((a,b)=>ENEMIES[b.kind].cost-ENEMIES[a.kind].cost || a.hp/a.maxHp-b.hp/b.maxHp || a.id-b.id).slice(0,MAX_ENEMY_HEALTHBARS);
    assert.deepEqual(healthbarEnemies(sim),expected);
  }
});
