import test from 'node:test';
import assert from 'node:assert/strict';
import { siegeSky } from '../src/campaign/siege-sky.ts';
test('Siege daylight fades smoothly and the final twenty seconds are night', () => {
  let last = 0;
  for (let left = 120; left >= 0; left -= 0.1) {
    const sky = siegeSky(left);
    assert.ok(sky.night >= last && sky.night >= 0 && sky.night <= 1);
    assert.ok(sky.tint.strength >= 0 && sky.tint.strength <= 0.24);
    if (left <= 20) assert.equal(sky.night, 1);
    last = sky.night;
  }
  for (const [left, phase] of [[110, 'day'], [60, 'sunset'], [35, 'dusk'], [10, 'night']] as const) assert.equal(siegeSky(left).phase, phase);
  assert.equal(siegeSky(70).tint.strength, 0);
  assert.equal(siegeSky(45).night, 0);
  for (const boundary of [70, 45, 20]) assert.ok(Math.abs(siegeSky(boundary + 0.001).night - siegeSky(boundary - 0.001).night) < 0.001);
  assert.deepEqual(siegeSky(NaN), siegeSky(120));
});
