import assert from "node:assert/strict";
import test from "node:test";
import { DefendSim } from "../src/defend/sim.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { ENEMIES, type EnemyKind } from "../src/defend/catalog.ts";
import { defaultDefendSave } from "../src/defend/progress.ts";
import { DEV_OPTIONS, decodeSettings } from "../src/settings.ts";
import { MAX_WAVE_ENEMIES } from "../src/defend/waves.ts";
import { wavePickerHTML } from "../src/defend/wave-picker.ts";

function simulation(tester = true) {
  const fit = fitLayout(defaultLayout());
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 3), defaultDefendSave().levels, 4);
  if (tester) sim.startUnitTester();
  return sim;
}

test("developer controls default off, migrate existing cheats, and disable together", () => {
  assert.equal(decodeSettings({}).developerMode, false);
  for (const key of DEV_OPTIONS) {
    assert.equal(decodeSettings({ [key]: true }).developerMode, true, key);
    assert.equal(decodeSettings({ developerMode: false, [key]: true })[key], false, key);
  }
  assert.equal(decodeSettings({ developerMode: true }).devMode, false, "master switch does not grant free money");
});

test("unit tester is offered only in developer mode and selects independently of ordinary waves", () => {
  const save = defaultDefendSave();
  assert.doesNotMatch(wavePickerHTML(save), /data-unit-tester/);
  const html = wavePickerHTML(save, true, true);
  assert.match(html, /data-unit-tester aria-pressed="true"/);
  assert.doesNotMatch(html, /data-wave="\d+" aria-pressed="true"/);
});

test("empty tester stays running without automatic enemies or wave-clear events", () => {
  const sim = simulation();
  for (let n = 0; n < 600; n++) sim.step(1 / 30);
  assert.equal(sim.unitTester, true);
  assert.equal(sim.wave, 1);
  assert.equal(sim.spawnQueue.length, 0);
  assert.equal(sim.enemies.length, 0);
  assert.deepEqual(sim.events, []);
  assert.equal(sim.summonEnemy("fernMantis"), true);
  for (const e of sim.enemies) e.hp = 0;
  for (let n = 0; n < 180; n++) sim.step(1 / 30);
  assert.equal(sim.enemies.length, 0);
  assert.equal(sim.wave, 1);
  assert.deepEqual(sim.events, []);
});

test("every catalog enemy can be summoned with its normal full body and health", () => {
  for (const kind of Object.keys(ENEMIES) as EnemyKind[]) {
    const sim = simulation(), def = ENEMIES[kind];
    assert.equal(sim.summonEnemy(kind), true, kind);
    const head = sim.enemies[0];
    assert.equal(head.kind, kind);
    assert.equal(head.hp, def.hp);
    if (def.fortress) {
      assert.equal(head.fortressParts?.length, def.fortress.turrets + def.fortress.armor + def.fortress.legs);
      assert.ok(head.fortressParts!.every(e => e.fortressPart?.core === head.id));
    } else assert.equal(sim.enemies.length, def.chainLength ?? 1);
  }
});

test("summoning is guarded and uses a live cap that recovers after enemies die", () => {
  const ordinary = simulation(false);
  assert.equal(ordinary.summonEnemy("fernMantis"), false);
  const sim = simulation();
  assert.equal(sim.summonEnemy("not-an-enemy" as EnemyKind), false);
  sim.summonEnemy("fernMantis");
  const mantis = sim.enemies[0];
  sim.enemies = Array.from({ length: MAX_WAVE_ENEMIES }, (_, id) => ({ ...mantis, id: id + 100 }));
  assert.equal(sim.summonEnemy("fernMantis"), false);
  sim.enemies.pop();
  assert.equal(sim.summonEnemy("fortressHut"), false, "must reserve room for every fortress part");
  assert.equal(sim.summonEnemy("fernMantis"), true);
  sim.enemies = [];
  assert.equal(sim.summonEnemy("fortressHut"), true);
  sim.lost = true;
  assert.equal(sim.summonEnemy("fernMantis"), false);
});

