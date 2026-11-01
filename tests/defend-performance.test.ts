import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BattlePerformance, FrameTimeOverlay, Timings } from '../src/defend/performance.ts';
import { blocked, firstSorted, nearest } from '../src/defend/pathing.ts';
import { CELL_COUNT, CELLS_W, CELLS_H, cellInBounds, cellIndex } from '../src/defend/grid.ts';
import { DefendSim, type Enemy } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { UPGRADES } from '../src/defend/catalog.ts';

test('nearest enemy query matches native shortlist order, ties, exclusions and live changes', () => {
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 42);
  sim.enemies = Array.from({length: 900}, (_, i) => ({ id: i, kind: 'roach',
    x: (i * 137 % 720) / 10 - 2, y: (i * 193 % 1000) / 10 - 2, hp: i % 11 ? 10 : 0,
    ...(i % 13 ? {} : {untargetable: true}),
    ...(i % 17 ? {} : {fortressPart: {role: 'armor'}}),
  })) as Enemy[];
  const index = () => (sim as any).indexEnemies(); index();
  const check = (x: number, y: number, r: number) => {
    for (const last of [false, true]) assert.equal(sim.nearestEnemy(x, y, r, last),
      nearest(sim.enemiesNear(x, y, r), {x, y}, last ? r * r : Infinity, last));
  };
  for (let i = 0; i < 160; i++) for (const r of [0, .9, 1.6, 5, 12, 100, Infinity, -2, NaN])
    check((i * 97 % 800) / 10 - 5, (i * 157 % 1050) / 10 - 5, r);
  sim.enemies = [
    {id: 99, x: 5, y: 4, hp: 10}, {id: 1, x: 3, y: 4, hp: 10},
    {id: 3, x: 4, y: 5, hp: 10, untargetable: true},
  ] as Enemy[]; index();
  assert.equal(sim.nearestEnemy(4, 4, 1, false)?.id, 1, 'grid order wins over array order');
  assert.equal(sim.nearestEnemy(4, 4, 1)?.id, 99, 'last cell wins an equal-distance tie');
  sim.enemies[0].hp = 0; check(4, 4, 1);
  sim.enemies[1].untargetable = true; check(4, 4, 1);
  sim.enemies[2].untargetable = false; sim.enemies[2].x = 8; index(); check(8, 5, 0);
  sim.enemies = []; index(); check(4, 4, 100);
});

test('bounded target selection matches stable sorting, including ties at the cutoff', () => {
  for (const size of [0, 1, 3, 20, 1500]) {
    const items = Array.from({length: size}, (_, id) => ({id, d: id * 137 % 29, hp: id % 7 ? id % 13 : Infinity}));
    for (const compare of [(a: typeof items[number], b: typeof items[number]) => a.d - b.d,
      (a: typeof items[number], b: typeof items[number]) => b.hp - a.hp || a.d - b.d]) {
      for (const n of [0, 1, 3, 5]) assert.deepEqual(firstSorted(items, compare, n), [...items].sort(compare).slice(0, n));
    }
    assert.deepEqual(items.map(i => i.id), Array.from({length: size}, (_, i) => i), 'input is untouched');
  }
  let comparisons = 0;
  firstSorted(Array.from({length: 20000}, (_, i) => i), (a, b) => { comparisons++; return a - b; }, 3);
  assert.ok(comparisons <= 3 * 20000, 'only the retained three candidates are compared');
});

test('allocation-free terrain checks match the four native corners at board and cell boundaries', () => {
  const solid = Uint8Array.from({length: CELL_COUNT}, (_, i) => i * 137 % 17 === 0 ? 1 : 0);
  const original = (x: number, y: number, r: number) => {
    for (const [px, py] of [[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r]])
      if (!cellInBounds(px, py) || solid[cellIndex(Math.floor(px), Math.floor(py))]) return true;
    return false;
  };
  const points = [NaN, Infinity, -Infinity, -.18, 0, .18, .99999999, 1, 1.18, CELLS_W-.18, CELLS_W, CELLS_H-.18, CELLS_H];
  for (const x of points) for (const y of points) for (const r of [0, .18, .5, 1, -1, NaN, Infinity])
    assert.equal(blocked(solid, x, y, r), original(x, y, r));
  for (let i = 0; i < 10000; i++) {
    const x = i * 137 % (CELLS_W * 100) / 100, y = i * 193 % (CELLS_H * 100) / 100;
    assert.equal(blocked(solid, x, y), original(x, y, .18));
  }
});

test('wave timing keeps terminal summaries once, including slow frames', (t) => {
  t.mock.method(console, 'info', () => {});
  const perf = new BattlePerformance();
  perf.sample(1, 500, 20, 4, 6);
  perf.sample(1, 490, 1200, 800, 300);
  perf.finish('cleared');
  perf.sample(1, 0, 16, 0, 1); // inter-wave break must not reopen the wave
  perf.finish('cleared');
  assert.equal(perf.history.length, 1);
  assert.equal(perf.history[0].peakEnemies, 500);
  assert.equal(perf.history[0].maxFrameMs, 1200);
  assert.equal(perf.history[0].frameP95Ms, 1200);
  assert.equal(perf.history[0].samples, 2);
  perf.sample(2, 1000, 16, 2, 3);
  perf.finish('lost');
  assert.equal(perf.history[1].planned, 1000);
  assert.equal(perf.history[1].samples, 1);
  assert.equal(perf.history[1].status, 'lost');
});

test('frame timing histogram counts percentiles without retaining samples', () => {
  const times = new Timings();
  for (let i = 0; i < 95; i++) times.add(16.1);
  for (let i = 0; i < 5; i++) times.add(800);
  assert.equal(times.p95(), 17);
  assert.equal(times.count, 100);
  assert.equal(times.max, 800);
});

test('disabled overlay does no DOM work and resets on toggle', () => {
  const overlay = new FrameTimeOverlay();
  overlay.sample({ frameMs: 1000, updateMs: 1, entityMs: 2, effectsMs: 3, terrainMs: 4, uiMs: 5 });
  assert.equal(overlay.enabled, false);
  overlay.toggle(true);
  overlay.sample({ frameMs: 0, updateMs: 1, entityMs: 2, effectsMs: 3, terrainMs: 4, uiMs: 5 });
  overlay.toggle(false);
  assert.equal(overlay.enabled, false);
});

test('long runs keep bounded log history and emit periodic snapshots', (t) => {
  t.mock.method(console, 'info', () => {});
  const perf = new BattlePerformance();
  for (let wave = 1; wave <= 120; wave++) {
    perf.sample(wave, wave * 500, 5000, 1, 2);
    perf.finish('cleared');
  }
  assert.equal(perf.history.length, 100);
  assert.equal(perf.history.at(-2)?.status, 'running');
  assert.equal(perf.history.at(-1)?.wave, 120);
});
