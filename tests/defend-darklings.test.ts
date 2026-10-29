import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES, UPGRADES, type EnemyKind } from '../src/defend/catalog.ts';
import { DefendSim, type Enemy } from '../src/defend/sim.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { buildWave, buildDifficultyWave, waveDifficulty, MAX_WAVE_ENEMIES } from '../src/defend/waves.ts';
import { DarkDensity, drainFalloff, DRAIN_W, DRAIN_H } from '../src/defend/dark-drain.ts';
import { drawEnemyArt } from '../src/defend/battle-art.ts';
import { drawSimpleEnemies } from '../src/defend/simple-units.ts';
import { defaultDefendSave, decodeDefendSave } from '../src/defend/progress.ts';
import { journalHTML } from '../src/defend/journal.ts';

const fixture = () => {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9;
  return sim;
};
const crowd = (n: number, kind: EnemyKind = 'miniDarkling', x = 20, y = 20) => Array.from({ length: n }, (_, id) => ({ kind, x, y, hp: 1, id } as Enemy));
const at = (d: DarkDensity, x: number, y: number) => d.field[Math.floor(y * 2) * DRAIN_W + Math.floor(x * 2)];

test('authored opening is 30 minis and 5 Darklings, independent of RNG; later waves retain legacy roster', () => {
  const wave = buildWave(1, () => { throw Error('opening must not roll'); });
  assert.equal(wave.length, 35);
  assert.equal(wave.filter(k => k === 'miniDarkling').length, 30);
  assert.equal(wave.filter(k => k === 'darkling').length, 5);
  assert.equal(wave.reduce((sum, k) => sum + ENEMIES[k].cost, 0), waveDifficulty(1));
  for (let i = 0; i < 5; i++) assert.deepEqual(wave.splice(-7).reverse(), [...Array(6).fill('miniDarkling'), 'darkling']);
  for (const n of [2, 20, 181, 200, 201, 1000]) assert.ok(buildWave(n, () => .5).every(k => !ENEMIES[k].scriptedOnly));
  assert.ok(buildDifficultyWave(100, () => .5).every(k => !ENEMIES[k].scriptedOnly));
});

test('Darklings split once into two ordinary targetable minis and the wave waits for their deaths', () => {
  const sim = fixture();
  sim.beginManualWave(1, 40, 35);
  const parent = sim.spawnAuxiliary('darkling', 20, 10)!;
  sim.hurtEnemy(parent, 1000);
  sim.step(1 / 30);
  assert.equal(sim.slain.darkling, 1);
  assert.equal(sim.enemies.length, 2);
  assert.ok(sim.enemies.every(e => e.kind === 'miniDarkling' && e.hp === ENEMIES.miniDarkling.hp));
  assert.equal(new Set(sim.enemies.map(e => e.id)).size, 2);
  sim.step(1 / 30);
  assert.equal(sim.slain.darkling, 1);
  assert.equal(sim.enemies.length, 2);
  for (const e of sim.enemies) sim.hurtEnemy(e, 1000);
  sim.step(1 / 30);
  assert.equal(sim.slain.miniDarkling, 2);
  assert.equal(sim.enemies.length, 0);
  assert.equal(sim.wave, 1);
  const save = defaultDefendSave(); save.discovered = ['miniDarkling', 'darkling'];
  assert.deepEqual(decodeDefendSave(save).discovered, save.discovered);
  assert.match(journalHTML(save.discovered), /Mini Darkling/);
});

test('splitting respects the native hard cap', () => {
  const sim = fixture(), parent = sim.spawnAuxiliary('darkling', 20, 10)!;
  (sim as any).waveSpawned = MAX_WAVE_ENEMIES - 1;
  sim.hurtEnemy(parent, 1000); sim.step(1 / 30);
  assert.equal(sim.enemies.length, 1);
  assert.equal((sim as any).waveSpawned, MAX_WAVE_ENEMIES);
});

test('one and two art-pixel bodies stay plain black in normal and Simple settings, even when struck or marked', () => {
  for (const [kind, side] of [['miniDarkling', 1], ['darkling', 2]] as const) {
    for (const px of [8, 24]) {
      const boxes: number[][] = [];
      const c = { fillStyle: '', fillRect(...args: number[]) { assert.equal(this.fillStyle, '#000000'); boxes.push(args); }, beginPath() {}, fill() {} } as unknown as CanvasRenderingContext2D;
      const e = { ...crowd(1, kind, 10, 10)[0], flash: 1, marked: true };
      drawEnemyArt({ c, px }, e, { time: 0 } as DefendSim);
      drawSimpleEnemies({ c, px }, [e]);
      assert.equal(boxes.length, 2);
      assert.ok(boxes.every(b => b[2] === side * px / 8 && b[3] === side * px / 8));
    }
  }
});

test('dark density starts at ten, grows to full, fades radially and keeps independent crowds local', () => {
  const d = new DarkDensity();
  assert.equal(d.update(crowd(9)), false);
  d.update(crowd(10)); const faint = at(d, 20, 20);
  assert.ok(faint > 0 && faint < .03);
  d.update(crowd(35)); const medium = at(d, 20, 20);
  assert.ok(medium > faint && medium < 1);
  d.update(crowd(60));
  assert.equal(at(d, 20, 20), 1);
  assert.ok(at(d, 24, 20) < 1 && at(d, 24, 20) > at(d, 27, 20));
  assert.equal(at(d, 40, 40), 0);
  assert.equal(drainFalloff(10, 10), 0);
  assert.equal(d.update([...crowd(9, 'darkling', 10, 10), ...crowd(9, 'miniDarkling', 50, 50)]), false);
  assert.equal(d.update([...crowd(5, 'darkling', 19.9, 20), ...crowd(5, 'miniDarkling', 20.1, 20)]), true, 'bucket boundary does not hide a crowd');
});

test('explicit Dark One types contribute, other enemies, dead bodies, multipart parts and raid proxies do not', () => {
  const d = new DarkDensity();
  assert.equal(d.update(crowd(60, 'iceGolem')), false);
  assert.equal(d.update(crowd(60, 'darkKnight')), true);
  assert.equal(d.update(crowd(60).map(e => ({ ...e, hp: 0 }))), false);
  assert.equal(d.update(crowd(60).map(e => ({ ...e, raidProxy: true }))), false);
  assert.equal(d.update(crowd(60).map(e => ({ ...e, fortressPart: { role: 'leg' } as any }))), false);
  const field = d.field;
  d.update(Array.from({ length: 10000 }, (_, i) => ({ ...crowd(1)[0], x: (i * 7 % 71) + .5, y: (i * 13 % 103) + .5 })));
  assert.equal(d.field, field);
  assert.equal(field.length, DRAIN_W * DRAIN_H);
  assert.ok(field.every(v => v >= 0 && v <= 1));
  assert.equal(d.update([]), false);
  assert.ok(field.every(v => v === 0));
});
