import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, DayClock, TIMES_OF_DAY, dayTime, daylight, simulationDaylight, skyAtTime, useDayClock, worldSky, sunSpeed } from '../src/daylight.ts';
import { defaults, decode } from '../src/save.ts';
import { CELLS_W, CELLS_H } from '../src/defend/grid.ts';
import { ART } from '../src/defend/art-scale.ts';
import { shadowMask, sunShadowMask } from '../src/defend/shadow-art.ts';

test('one cycle takes five minutes of foreground play and wraps smoothly', () => {
  assert.equal(DAY_MS, 300000);
  const clock = new DayClock();
  clock.advance(1000, true, true);
  clock.advance(151000, true, true);
  assert.equal(clock.elapsed, DAY_MS / 2);
  clock.advance(301000, true, true);
  assert.equal(clock.elapsed, 0);
  for (const ms of [0, 1, DAY_MS * .42, DAY_MS * .5, DAY_MS * .57, DAY_MS * .73, DAY_MS - 1]) {
    const a = skyAtTime(ms), b = skyAtTime(ms + DAY_MS);
    assert.deepEqual(a, b);
    assert.ok(a.daylight >= 0 && a.daylight <= 1);
  }
  assert.ok(Math.abs(skyAtTime(DAY_MS - 1).daylight - skyAtTime(0).daylight) < .001);
});

test('hidden tabs, returning after a long absence, and disabled cycles do not advance the visible day', () => {
  const clock = new DayClock(42000);
  clock.advance(0, true, true); clock.advance(1000, true, true);
  clock.reset(); // visibilitychange before browser suspends requestAnimationFrame
  clock.advance(8 * 3600000, true, true);
  assert.equal(clock.elapsed, 43000);
  clock.advance(8 * 3600000 + 1000, false, true);
  clock.advance(9 * 3600000, true, true);
  assert.equal(clock.elapsed, 43000);
  clock.advance(10 * 3600000, true, false);
  assert.equal(clock.elapsed, 43000);
  const reloaded = new DayClock(clock.elapsed);
  reloaded.advance(999999999, true, true);
  assert.equal(reloaded.elapsed, clock.elapsed);
});

test('sunset, dusk, twilight and night have distinct light and colour; the sun changes shadow direction and length', () => {
  const phases = TIMES_OF_DAY.map(phase => skyAtTime(0, phase));
  assert.deepEqual(phases.map(s => s.phase), TIMES_OF_DAY);
  const [day, sunset, dusk, twilight, night, dawn] = phases;
  assert.ok(day.daylight > sunset.daylight && sunset.daylight > dusk.daylight && dusk.daylight > twilight.daylight && twilight.daylight > night.daylight);
  assert.ok(sunset.rgb[0] > sunset.rgb[2] * 2);
  assert.ok(twilight.rgb[2] > twilight.rgb[0]);
  assert.ok(sunset.sun.x < 0 && dawn.sun.x > 0);
  assert.ok(Math.hypot(sunset.sun.x, sunset.sun.y) > Math.hypot(day.sun.x, day.sun.y));
  assert.equal(night.sun.strength, 0);
});

test('sunlight shadows reverse direction, lengthen near the horizon and match the existing diagonal height-map sweep', () => {
  const w = CELLS_W * ART, h = new Float32Array(w * CELLS_H * ART);
  h[20 * w + 20] = 8;
  const right = sunShadowMask(h, 1, 0), left = sunShadowMask(h, -1, 0), long = sunShadowMask(h, 2, 0);
  assert.ok(right[20 * w + 22]); assert.equal(right[20 * w + 18], 0);
  assert.ok(left[20 * w + 18]); assert.equal(left[20 * w + 22], 0);
  assert.ok(long.filter(Boolean).length > right.filter(Boolean).length);
  assert.deepEqual(sunShadowMask(h, 1, 1), shadowMask(h));
  assert.ok(sunShadowMask(h, 0, 0).every(v => !v));
});

test('day clock and fixed phase preferences round-trip without accepting malformed saves', () => {
  const save = defaults(); save.dayClock = 123456;
  save.settings.dayNightCycle = false; save.settings.timeOfDay = 'twilight';
  const restored = decode(JSON.stringify(save));
  assert.equal(restored.dayClock, 123456);
  assert.equal(restored.settings.dayNightCycle, false);
  assert.equal(restored.settings.timeOfDay, 'twilight');
  for (const raw of [-1, 'night', null, {}]) {
    assert.equal(decode(JSON.stringify({ version: 7, dayClock: raw })).dayClock, undefined);
  }
  assert.equal(dayTime(Infinity), 0);
  assert.equal(new DayClock(DAY_MS + 15).elapsed, 15);
});

test('fixed scenes stay fixed while economic daylight remains independent', () => {
  const settings = defaults().settings, clock = new DayClock(30000);
  useDayClock(clock, () => settings);
  settings.dayNightCycle = false;
  for (const phase of TIMES_OF_DAY) {
    settings.timeOfDay = phase;
    assert.deepEqual(worldSky(), skyAtTime(0, phase));
    assert.equal(daylight(Date.now()), worldSky()!.daylight);
    assert.equal(simulationDaylight(120000), 1);
    assert.equal(simulationDaylight(360000), 0);
  }
  settings.dayNightCycle = true;
  assert.deepEqual(worldSky(), skyAtTime(clock.elapsed));
});


test('catch-up sun speed is exactly 5x when enabled and normal when disabled', () => {
  for (const [mine, library] of [[3600000, 0], [0, 3600000], [5000, 5000]]) {
    assert.equal(sunSpeed(true, mine, library), 5);
    assert.equal(sunSpeed(false, mine, library), 1);
  }
  assert.equal(sunSpeed(true, 4999, 4999), 1, 'ordinary frame backlog does not accelerate the sun');
  const fast = new DayClock(), normal = new DayClock();
  fast.advance(0, true, true, 5); normal.advance(0, true, true, 1);
  fast.advance(10000, true, true, 5); normal.advance(10000, true, true, 1);
  assert.equal(fast.elapsed, 50000); assert.equal(normal.elapsed, 10000);
  fast.advance(11000, true, true, 1);
  assert.equal(fast.elapsed, 51000, 'normal speed resumes without a phase jump');
  fast.reset(); fast.advance(99999999, true, true, 5);
  assert.equal(fast.elapsed, 51000, 'returning to the game does not accelerate hidden time');
  fast.advance(100999999, true, false, 5);
  assert.equal(fast.elapsed, 51000, 'a fixed time does not move even during 5x catch-up');
});

test('the faster-sun preference defaults on, persists off and rejects malformed values', () => {
  assert.equal(defaults().settings.fasterSunCatchup, true);
  const save = defaults(); save.settings.fasterSunCatchup = false;
  assert.equal(decode(JSON.stringify(save)).settings.fasterSunCatchup, false);
  assert.equal(decode(JSON.stringify({ version: 7, settings: { fasterSunCatchup: 'false' } })).settings.fasterSunCatchup, true);
});
