import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BattlePerformance } from '../src/defend/performance.ts';

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
