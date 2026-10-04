import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BattlePerformance, FrameTimeOverlay, Timings } from '../src/defend/performance.ts';

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
