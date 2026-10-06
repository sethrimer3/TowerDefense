import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AREAS, AREA_FADE_MS, WAVES_PER_AREA, areaFade, areaForWave, areaArtId } from '../src/defend/areas.ts';
import { rollWeather, ambientFor, skyLabel } from '../src/defend/weather.ts';
import { wavePickerHTML } from '../src/defend/wave-picker.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';

test('areas change only across twenty-wave boundaries and repeat for endless waves', () => {
  assert.equal(areaForWave(1).id, 'moss');
  assert.equal(areaForWave(20).id, 'moss');
  assert.equal(areaForWave(21).id, 'desert');
  assert.equal(areaForWave(40).id, 'desert');
  assert.equal(areaForWave(41).id, 'ember');
  for (let i = 0; i < AREAS.length * 3; i++) {
    assert.equal(areaForWave(i * WAVES_PER_AREA + 1), AREAS[i % AREAS.length]);
    assert.equal(areaForWave((i + 1) * WAVES_PER_AREA), AREAS[i % AREAS.length]);
  }
  for (const wave of [0, -10, NaN, Infinity]) assert.equal(areaForWave(wave).id, 'moss');
});

test('dry and underground areas never rain, cold areas snow, wet areas rain more often', () => {
  for (const area of AREAS) {
    for (const roll of [0, .29, .3, .74, .75, .999]) {
      const w = rollWeather(() => roll, area);
      assert.equal(w.rain, roll < area.rainChance);
      assert.equal(!!w.snow, area.climate === 'cold');
    }
  }
  assert.equal(skyLabel(rollWeather(() => .5, areaForWave(101)), 0), 'Snow');
  assert.equal(skyLabel(rollWeather(() => 0, areaForWave(101)), 0), 'Blizzard');
  assert.equal(skyLabel(rollWeather(() => 0, areaForWave(21)), 0), 'Sandstorm');
  assert.equal(skyLabel(rollWeather(() => 0, areaForWave(41)), 0), 'Clear');
});

test('terrain and ambient fades have exact endpoints and a smooth midpoint', () => {
  assert.equal(areaFade(0), 0);
  assert.equal(areaFade(AREA_FADE_MS / 2), .5);
  assert.equal(areaFade(AREA_FADE_MS), 1);
  assert.equal(areaFade(-100), 0);
  assert.equal(areaFade(0, true), 1);
  const old = { rain: true }, next = { rain: false, clear: true };
  assert.deepEqual(ambientFor(next, .5, old, 0), ambientFor(old, .5));
  assert.deepEqual(ambientFor(next, .5, old, 1), ambientFor(next, .5));
  const mid = ambientFor(next, .5, old, .5);
  assert.ok(mid.alpha > ambientFor(next, .5).alpha && mid.alpha < ambientFor(old, .5).alpha);
});

test('each new area ships four opaque square floors and the cap/face texture pair', () => {
  for (const area of AREAS.slice(1)) for (const [file, w, h] of [
    ...[1, 2, 3, 4].map(i => [`floor-${i}`, 80, 80]), ['wall-cap', 64, 64], ['wall-face', 64, 32],
  ] as [string, number, number][]) {
    const png = readFileSync(new URL(`../public/assets/defend/areas/${areaArtId(area.id)}/${file}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), w, `${area.id}/${file} width`);
    assert.equal(png.readUInt32BE(20), h, `${area.id}/${file} height`);
  }
});

test('wave picker exposes distinct area groups, row colors and selected wave', () => {
  const save = defaultDefendSave();
  save.unlockedWave = 60; save.startWave = 41;
  const html = wavePickerHTML(save);
  for (const area of AREAS.slice(0, 3)) {
    assert.ok(html.includes(area.name)); assert.ok(html.includes(`--area-color:${area.color}`));
  }
  assert.match(html, /data-wave="41" aria-pressed="true"/);
});
