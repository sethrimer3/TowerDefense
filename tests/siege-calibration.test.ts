import test from "node:test";
import assert from "node:assert/strict";
import { calibrationArmy, typicalArmyBudget } from "../src/campaign/siege-army.ts";
import { infantry } from "../src/campaign/plans.ts";
import { STRUCTURES } from "../src/defend/catalog.ts";
import { calibrateRaid } from "../tools/siege-calibration.ts";
import { readFileSync } from "node:fs";
test("Reference progression budgets rise smoothly and build real infantry with native support", () => {
  let previous = 0;
  for (let mmr = 100; mmr <= 2720; mmr += 20) {
    const budget = typicalArmyBudget(mmr);
    assert.ok(budget > previous);
    previous = budget;
  }
  for (const mmr of [100, 1000, 1600, 2160, 2720]) {
    const a = calibrationArmy(42, mmr);
    assert.ok(Math.abs(a.estimatedDps / a.budget - 1) <= 0.05);
    const homes = a.game.defend.layout.structures;
    assert.ok(homes.length >= 2 && homes.every((s) => infantry(s.kind)));
    assert.ok(homes.some((s) => ["meleeGuild", "barracks", "chapterHouse", "heroHall"].includes(s.kind)));
    assert.ok(homes.some((s) => ["rangedGuild", "archerBarracks", "revolutionary"].includes(s.kind)));
    for (const [kind, count] of Object.entries(a.game.defend.owned)) if (count > 0 && kind in STRUCTURES) assert.ok(infantry(kind as keyof typeof STRUCTURES));
  }
});
test("Calibration smoke runs both native sides without labeling an incomplete raid as a loss", { timeout: 30000 }, () => {
  for (const mmr of [600, 2160]) {
    const row = calibrateRaid(mmr, 101, { seconds: 2 });
    assert.equal(row.phase, "battle");
    assert.ok(row.attackUnits > 0 && row.defenseUnits > 0);
    assert.ok(row.seconds >= 2 && row.seconds < 2.1);
    assert.ok(row.castleDps <= row.budget * 1.05);
  }
});
test("The fitted curve is reproducible from complete training raids and keeps both anchors", async () => {
  const { curveFitHash, fitCurve } = await import("../tools/fit-siege-curve.ts");
  const { CURVE_INPUT_HASH, CURVE_ANCHORS } = await import("../src/campaign/siege-budget-config.ts");
  const training = JSON.parse(readFileSync(new URL("../docs/design/siege-calibration-training.json", import.meta.url), "utf8"));
  assert.equal(curveFitHash(), CURVE_INPUT_HASH);
  assert.deepEqual(fitCurve(), [...CURVE_ANCHORS]);
  assert.equal(CURVE_ANCHORS[0][1], training.floor);
  assert.equal(CURVE_ANCHORS.at(-1)![1], training.ceiling);
  assert.ok(training.ceiling > training.floor);
});
test("The published raid results were recorded against the current generator, estimate, armies and raid", async () => {
  const { calibrationHash, TUNING_SOURCES, VALIDATION_SOURCES } = await import("../tools/siege-calibration.ts");
  const read = (f: string) => JSON.parse(readFileSync(new URL("../docs/design/" + f, import.meta.url), "utf8"));
  const training = read("siege-calibration-training.json"),
    validation = read("siege-calibration.json");
  // A changed source means rerunning tools/tune-siege.ts and calibrate-siege.ts.
  assert.equal(training.inputHash, calibrationHash(TUNING_SOURCES));
  assert.ok(training.rows.every((r: { observedInputHash: string }) => r.observedInputHash === training.inputHash));
  assert.equal(validation.inputHash, calibrationHash(VALIDATION_SOURCES));
});
