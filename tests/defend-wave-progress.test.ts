import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { payWave } from "../src/progression.ts";
import { MAX_START_WAVE, decodeDefendSave, defaultDefendSave, furthestWave, recordWaveCleared, recordWaveReached, startingWave, unlockWaves, waveReach } from "../src/defend/progress.ts";
import { wavePickerHTML } from "../src/defend/wave-picker.ts";

test("a wave unlocks as a start only once it is defeated, and selects itself", () => {
  const save = defaultDefendSave();
  assert.equal(startingWave(save), 1);
  assert.equal(recordWaveReached(save, 5), true);
  assert.equal(waveReach(save), 1, "reaching a wave does not unlock it");
  assert.deepEqual(recordWaveCleared(save, 1), [], "wave one is always open");
  for (const wave of [2, 3, 19]) {
    assert.deepEqual(recordWaveCleared(save, wave), [wave]);
    assert.equal(waveReach(save), wave);
    assert.equal(startingWave(save), wave);
  }
});

test("a new zone's first wave unlocks as soon as it is reached", () => {
  const save = defaultDefendSave();
  recordWaveCleared(save, 19);
  assert.deepEqual(recordWaveCleared(save, 20), [20, 21]);
  assert.equal(waveReach(save), 21);
  assert.equal(startingWave(save), 21);
  assert.deepEqual(recordWaveCleared(save, 21), [], "already unlocked when reached");
  assert.deepEqual(recordWaveCleared(save, 22), [22]);
});

test("losing a wave sends no one back past an unlocked choice", () => {
  const save = defaultDefendSave();
  recordWaveCleared(save, 30);
  save.startWave = 20;
  for (const wave of [20, 21, 25, 31]) recordWaveReached(save, wave);
  assert.equal(startingWave(save), 20, "an unlocked choice is kept after a loss");
  for (const wave of [20, 21, 30]) assert.deepEqual(recordWaveCleared(save, wave), []);
  assert.equal(startingWave(save), 20, "clearing already-unlocked waves keeps the choice");
  save.startWave = 35;
  assert.equal(startingWave(save), 30, "a locked choice moves back to the furthest unlocked wave");
  const html = wavePickerHTML(save);
  assert.match(html, /data-wave="30"/);
  assert.doesNotMatch(html, /data-wave="31"/);
});

test("rewards follow cleared waves and report what unlocked", () => {
  const save = defaults();
  assert.deepEqual(payWave(save, 1), { upgrade: 1, unlocked: [] });
  assert.deepEqual(payWave(save, 1), { upgrade: 0, unlocked: [] });
  assert.equal(save.defend.bestWave, 1);
  for (let w = 2; w < 20; w++) payWave(save, w);
  assert.deepEqual(payWave(save, 20), { upgrade: 1, unlocked: [20, 21] });
  assert.equal(save.upgradePoints, 20);
});

test("old saves keep their cleared waves unlocked and their selections where unlocked", () => {
  const old = decodeDefendSave({ bestWave: 12 });
  assert.equal(old.furthestWave, 13);
  assert.equal(waveReach(old), 12);
  assert.equal(startingWave(old), 12);
  assert.equal(startingWave(decodeDefendSave({ bestWave: 12, startWave: 3 })), 3);
  assert.equal(startingWave(decodeDefendSave({ bestWave: 8, furthestWave: 12, startWave: 11 })), 8);
  assert.equal(waveReach(decodeDefendSave({ bestWave: 40 })), 41);
  assert.deepEqual(decodeDefendSave({ storiesSeen: ["moss", "nope", 3, "moss", "desert"] }).storiesSeen, ["moss", "desert"]);
  assert.deepEqual(decodeDefendSave({}).storiesSeen, []);
  for (const invalid of [-1, 1.5, Infinity, "12", NaN])
    assert.equal(decodeDefendSave({ bestWave: 3, furthestWave: invalid }).furthestWave, 4);
  assert.equal(furthestWave(decodeDefendSave({ bestWave: 12, furthestWave: 5 })), 12);
});

test("developer unlocks open more starts without claiming cleared waves", () => {
  const save = defaultDefendSave();
  assert.equal(unlockWaves(save), 101);
  save.startWave = 90;
  assert.equal(startingWave(save), 90);
  assert.equal(save.bestWave, 0);
  assert.equal(unlockWaves(save), 201);
});

test("invalid waves change nothing, and starts stay within the limit", () => {
  const save = defaultDefendSave(), before = JSON.stringify(save);
  for (const wave of [0, -1, 1.5, NaN, Infinity, MAX_START_WAVE + 2]) {
    assert.equal(recordWaveReached(save, wave), false);
    assert.deepEqual(recordWaveCleared(save, wave), []);
  }
  assert.equal(JSON.stringify(save), before);
  save.bestWave = MAX_START_WAVE;
  save.startWave = MAX_START_WAVE + 5;
  assert.equal(startingWave(save), MAX_START_WAVE);
});
