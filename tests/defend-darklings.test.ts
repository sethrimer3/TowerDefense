import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES, UPGRADES, type EnemyKind } from '../src/defend/catalog.ts';
import { DefendSim, type Enemy } from '../src/defend/sim.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { buildWave, buildDifficultyWave, waveDifficulty, MAX_WAVE_ENEMIES } from '../src/defend/waves.ts';
import { DarkDensity, drainFalloff, DRAIN_W, DRAIN_H } from '../src/defend/dark-drain.ts';
import { basicUnitPixels } from '../src/defend/basic-unit-art.ts';
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

test('authored opening is 30 minis and 5 Darklings, independent of RNG; waves 21 onward retain legacy roster', () => {
  const wave = buildWave(1, () => { throw Error('opening must not roll'); });
  assert.equal(wave.length, 35);
  assert.equal(wave.filter(k => k === 'miniDarkling').length, 30);
  assert.equal(wave.filter(k => k === 'darkling').length, 5);
  assert.equal(wave.reduce((sum, k) => sum + ENEMIES[k].cost, 0), waveDifficulty(1));
  for (let i = 0; i < 5; i++) assert.deepEqual(wave.splice(-7).reverse(), [...Array(6).fill('miniDarkling'), 'darkling']);
  for (const n of [21, 40, 181, 200, 201, 202, 203, 204, 205, 1000]) assert.ok(buildWave(n, () => .5).every(k => !ENEMIES[k].scriptedOnly));
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

test('one to five art-pixel bodies stay plain black in normal and Simple settings, even when struck or marked', () => {
  for (const [kind, side] of [['miniDarkling', 1], ['darkling', 2], ['largeDarkling', 3], ['majorDarkling', 4], ['significantDarkling', 5], ['blightWorm', 5]] as const) {
    for (const px of [8, 24]) {
      const boxes: number[][] = [];
      const c = { fillStyle: '', fillRect(...args: number[]) { assert.equal(this.fillStyle, '#000000'); boxes.push(args); }, rect(...args: number[]) { assert.equal(this.fillStyle, '#000000'); boxes.push(args); }, beginPath() {}, fill() {} } as unknown as CanvasRenderingContext2D;
      const e = { ...crowd(1, kind, 10, 10)[0], flash: 1, marked: true };
      const source = basicUnitPixels(kind, true);
      assert.equal(source.w, side); assert.equal(source.h, side);
      assert.ok(source.data.every(v => v === 0xff000000), 'solid black material survives without stripping');
      drawSimpleEnemies({ c, px }, [e]);
      assert.equal(boxes.length, 1);
      assert.ok(boxes.every(b => b[2] === side * px / 8 && b[3] === side * px / 8));
    }
  }
});

test('dark density starts at ten, grows to full, fades radially and keeps independent crowds local', () => {
  const d = new DarkDensity();
  assert.equal(d.update(crowd(9)), false);
  d.update(crowd(10)); const faint = at(d, 20, 20);
  assert.ok(faint >= .2 && faint < .3);
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


test('authored waves 2–10 have exact requested counts and fresh independent queues', () => {
  const expected = [
    { wave: 2, miniDarkling: 45, darkling: 15, largeDarkling: 0, majorDarkling: 0, budget: 75 },
    { wave: 3, miniDarkling: 0, darkling: 50, largeDarkling: 0, majorDarkling: 0, budget: 100 },
    { wave: 4, miniDarkling: 0, darkling: 80, largeDarkling: 5, majorDarkling: 0, budget: 180 },
    { wave: 5, miniDarkling: 0, darkling: 0, largeDarkling: 30, majorDarkling: 0, budget: 120 },
    { wave: 6, miniDarkling: 0, darkling: 0, largeDarkling: 0, majorDarkling: 5, budget: 40 },
    { wave: 7, miniDarkling: 0, darkling: 0, largeDarkling: 0, majorDarkling: 10, budget: 80 },
    { wave: 8, miniDarkling: 0, darkling: 0, largeDarkling: 0, majorDarkling: 20, budget: 160 },
    { wave: 9, miniDarkling: 0, darkling: 0, largeDarkling: 0, majorDarkling: 30, budget: 240 },
    { wave: 10, miniDarkling: 0, darkling: 0, largeDarkling: 0, majorDarkling: 50, budget: 400 },
  ];
  for (const row of expected) {
    const queue = buildWave(row.wave, () => { throw Error('authored waves must not roll'); });
    for (const kind of ['miniDarkling', 'darkling', 'largeDarkling', 'majorDarkling'] as const)
      assert.equal(queue.filter(k => k === kind).length, row[kind], `wave ${row.wave}: ${kind}`);
    assert.equal(queue.length, row.miniDarkling + row.darkling + row.largeDarkling + row.majorDarkling);
    assert.equal(waveDifficulty(row.wave), row.budget);
    queue.pop();
    assert.equal(buildWave(row.wave, () => 0).length, queue.length + 1, 'caller cannot mutate authored roster');
  }
  const two = buildWave(2, () => 0);
  for (let i = 0; i < 15; i++) assert.deepEqual(two.splice(-4).reverse(), [...Array(3).fill('miniDarkling'), 'darkling']);
  const four = buildWave(4, () => 0);
  for (let i = 0; i < 5; i++) assert.deepEqual(four.splice(-17).reverse(), [...Array(16).fill('darkling'), 'largeDarkling']);
});

test('complete waves include every generation of offspring without ending early or splitting twice', () => {
  const expected = [
    [2, 0, 0, 15, 75], [3, 0, 0, 50, 100], [4, 0, 5, 90, 180], [5, 0, 30, 60, 120], [6, 5, 15, 30, 60],
  ];
  for (const [wave, major, large, dark, mini] of expected) {
    const sim = fixture(), queue = buildWave(wave, () => 0);
    sim.beginManualWave(wave, waveDifficulty(wave), queue.length);
    for (const kind of queue) assert.ok(sim.spawnAuxiliary(kind, 20, 10));
    let rounds = 0;
    while (sim.enemies.length) {
      for (const enemy of sim.enemies) sim.hurtEnemy(enemy, 1000);
      sim.step(1 / 30);
      assert.equal(sim.wave, wave, 'children retain the wave until cleared');
      assert.ok(++rounds <= 4, 'only the authored split generations exist');
    }
    assert.equal(sim.slain.majorDarkling, major);
    assert.equal(sim.slain.largeDarkling, large);
    assert.equal(sim.slain.darkling, dark);
    assert.equal(sim.slain.miniDarkling, mini);
    assert.equal((sim as any).waveSpawned, major + large + dark + mini);
    sim.step(1 / 30);
    assert.equal(sim.enemies.length, 0, 'no repeated split after cleanup');
  }
});

test('Large Darklings participate in color drain and journal/save discovery', () => {
  const d = new DarkDensity();
  assert.equal(d.update(crowd(10, 'largeDarkling')), true);
  const save = defaultDefendSave(); save.discovered = ['largeDarkling']; save.journalRead = ['largeDarkling'];
  const decoded = decodeDefendSave(save);
  assert.deepEqual(decoded.discovered, ['largeDarkling']);
  assert.deepEqual(decoded.journalRead, ['largeDarkling']);
  assert.match(journalHTML(decoded.discovered), /Large Darkling/);
});


test('night heat is present for lone dark enemies and strengthens locally without changing the drain threshold', () => {
  const d = new DarkDensity(), at = () => d.glow[40 * DRAIN_W + 40];
  assert.equal(d.update(crowd(1)), false); assert.equal(d.glowing, true);
  const lone = at(); assert.ok(lone > .1 && lone < .3);
  d.update(crowd(10)); const group = at(); assert.ok(group > lone);
  d.update(crowd(60)); assert.equal(at(), 1);
  assert.equal(d.glow[80 * DRAIN_W + 80], 0);
  assert.equal(d.update([]), false); assert.equal(d.glowing, false); assert.ok(d.glow.every(v => v === 0));
});


test('a local aura clips blending to its bounded world region and clears both bounds with its last enemy', () => {
  const d = new DarkDensity(); d.update(crowd(60));
  assert.ok(d.bounds && d.glowBounds);
  assert.ok(d.bounds.w < 24 && d.bounds.h < 24);
  assert.ok(d.glowBounds.w < d.bounds.w);
  for (const [field, b] of [[d.field, d.bounds], [d.glow, d.glowBounds]] as const)
    for (let y = 0; y < DRAIN_H; y++) for (let x = 0; x < DRAIN_W; x++)
      if (field[y * DRAIN_W + x] > 0) assert.ok((x + .5) / 2 >= b.x && (x + .5) / 2 <= b.x + b.w && (y + .5) / 2 >= b.y && (y + .5) / 2 <= b.y + b.h);
  d.update([]); assert.equal(d.bounds, null); assert.equal(d.glowBounds, null);
});

test('Major Darklings split into three Large Darklings, fit the hard cap and wear a portal contour', () => {
  const def = ENEMIES.majorDarkling;
  assert.deepEqual(def.splits, { into: 'largeDarkling', count: 3 });
  assert.equal(def.darkPixels, 4);
  assert.equal(def.size, 4 / 8);
  assert.ok(def.portalOutline && def.scriptedOnly && def.faction === 'darkOne');
  // 50 × (1 + 3 × (1 + 2 × (1 + 2))) = 1100 bodies at most.
  assert.ok(50 * 22 <= MAX_WAVE_ENEMIES);
  for (const kind of ['miniDarkling', 'darkling', 'largeDarkling'] as const) assert.ok(!ENEMIES[kind].portalOutline);
});
