import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { payWave } from "../src/progression.ts";
import { MAX_START_WAVE, decodeDefendSave, defaultDefendSave, furthestWave, recordWaveReached, startingWave, unlockWaves, waveReach } from "../src/defend/progress.ts";
import { wavePickerHTML } from "../src/defend/wave-picker.ts";

test("new reached records select the previous wave, with early progress clamped to wave one", () => {
  const save = defaultDefendSave();
  assert.equal(furthestWave(save), 0);
  assert.equal(startingWave(save), 1);
  for (const wave of [1, 2, 3, 10]) {
    assert.equal(recordWaveReached(save, wave), true);
    assert.equal(save.furthestWave, wave);
    assert.equal(startingWave(save), Math.max(1, wave - 1));
    assert.equal(waveReach(save), Math.max(1, wave - 1));
  }
  assert.equal(save.bestWave, 0, "entering a wave does not claim it was cleared");
});

test("manual earlier starts survive retries and equal records until a genuinely further wave is entered", () => {
  const save = defaultDefendSave();
  recordWaveReached(save, 10);
  save.startWave = 3;
  for (const wave of [3, 4, 9, 10]) {
    assert.equal(recordWaveReached(save, wave), false);
    assert.equal(startingWave(save), 3);
  }
  const restored = decodeDefendSave(JSON.parse(JSON.stringify(save)));
  assert.equal(startingWave(restored), 3);
  assert.equal(recordWaveReached(restored, 11), true);
  assert.equal(startingWave(restored), 10);
  assert.equal(restored.bestWave, 0);
  const html = wavePickerHTML(restored);
  assert.match(html, /data-wave="3"/);
  assert.match(html, /data-wave="10" aria-pressed="true"/);
  assert.doesNotMatch(html, /data-wave="11"/);
});

test("highest entered progress and cleared-wave rewards remain independent", () => {
  const save = defaults();
  recordWaveReached(save.defend, 10);
  assert.equal(save.upgradePoints, 0);
  assert.deepEqual(payWave(save, 9), { upgrade: 1 });
  assert.equal(save.defend.bestWave, 9);
  assert.equal(save.defend.furthestWave, 10);
  assert.equal(startingWave(save.defend), 9);
  assert.deepEqual(payWave(save, 9), { upgrade: 0 });
  save.defend.startWave = 2;
  assert.deepEqual(payWave(save, 10), { upgrade: 1 });
  assert.equal(startingWave(save.defend), 2, "clearing alone does not reset a manual choice");
  assert.equal(recordWaveReached(save.defend, 11), true);
  assert.equal(startingWave(save.defend), 10);
  assert.equal(save.upgradePoints, 2);
});

test("old saves retain unlocked progress and manual selections; missing selections use previous reached wave", () => {
  const old = decodeDefendSave({ bestWave: 12 });
  assert.equal(old.furthestWave, 13);
  assert.equal(waveReach(old), 12);
  assert.equal(startingWave(old), 12);
  assert.equal(startingWave(decodeDefendSave({ bestWave: 12, startWave: 1 })), 12, "old wave-one default advances on migration");
  assert.equal(startingWave(decodeDefendSave({ bestWave: 12, startWave: 3 })), 3);
  assert.equal(startingWave(decodeDefendSave({ bestWave: 9, furthestWave: 10, startWave: 1 })), 1, "current deliberate wave-one choice stays selected");
  const current = decodeDefendSave({ bestWave: 8, furthestWave: 12, startWave: 11 });
  assert.equal(current.furthestWave, 12);
  assert.equal(startingWave(current), 11);
  assert.equal(decodeDefendSave({ bestWave: 12, furthestWave: 5 }).furthestWave, 12, "cannot have cleared a wave never reached");
  for (const invalid of [-1, 1.5, Infinity, "12", NaN])
    assert.equal(decodeDefendSave({ bestWave: 3, furthestWave: invalid }).furthestWave, 4);
});

test("developer unlocks remain available without claiming new reached progress", () => {
  const save = defaultDefendSave();
  assert.equal(unlockWaves(save), 100);
  assert.equal(save.furthestWave, 0);
  save.startWave = 90;
  assert.equal(startingWave(save), 90);
  assert.equal(recordWaveReached(save, 90), true);
  assert.equal(startingWave(save), 89);
  assert.equal(waveReach(save), 100);
  assert.equal(unlockWaves(save), 200);
  save.startWave = 2;
  assert.equal(recordWaveReached(save, 89), false);
  assert.equal(startingWave(save), 2);
});

test("invalid reached events do not mutate progress and the highest selectable wave stays within its limit", () => {
  const save = defaultDefendSave(), before = JSON.stringify(save);
  for (const wave of [0, -1, 1.5, NaN, Infinity, MAX_START_WAVE + 2]) assert.equal(recordWaveReached(save, wave), false);
  assert.equal(JSON.stringify(save), before);
  assert.equal(recordWaveReached(save, MAX_START_WAVE + 1), true);
  assert.equal(startingWave(save), MAX_START_WAVE);
  const restored = decodeDefendSave(JSON.parse(JSON.stringify(save)));
  assert.equal(restored.furthestWave, MAX_START_WAVE + 1);
  assert.equal(startingWave(restored), MAX_START_WAVE);
});
