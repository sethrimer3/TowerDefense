import test from "node:test";
import assert from "node:assert/strict";
import { buildingLevel, smithyRows } from "../src/building-level.ts";
import { STRUCTURES, UPGRADES, type StructureKind } from "../src/defend/catalog.ts";
import { TRAINING } from "../src/progression.ts";

test("A building starts at level 1 and gains one for every Smithy upgrade that applies to it", () => {
  assert.equal(buildingLevel("archerTower", {}, {}), 1);
  assert.equal(buildingLevel("archerTower", { archerDamage: 3, archerRate: 2, cannonDamage: 5 }, { towerDamage: 10, troopDamage: 9 }), 1 + 3 + 2 + 10);
  assert.equal(buildingLevel("barracks", { soldierArms: 4, soldierReach: 1, archerDamage: 6 }, { troopDamage: 7, towerDamage: 8 }), 1 + 4 + 1 + 7);
});
test("Every building has Smithy rows, and a fully upgraded one counts each of them", () => {
  const maxLevels = Object.fromEntries(UPGRADES.map((u) => [u.id, u.maxLevel])),
    maxTraining = Object.fromEntries(TRAINING.map((t) => [t.id, t.max]));
  for (const kind of [...Object.keys(STRUCTURES), "wall", "gate", "wallBallista", "spikes"] as (StructureKind | "wall" | "gate" | "wallBallista" | "spikes")[]) {
    const rows = smithyRows(kind);
    assert.ok(rows.upgrades.length + rows.training.length > 0, kind);
    const total = rows.upgrades.reduce((n, id) => n + maxLevels[id], 0) + rows.training.reduce((n, id) => n + maxTraining[id], 0);
    assert.equal(buildingLevel(kind, maxLevels, maxTraining), 1 + total, kind);
  }
  // An archer tower's own three Forge rows and the two All towers Training rows.
  assert.deepEqual(smithyRows("archerTower"), { upgrades: ["archerDamage", "archerRange", "archerRate"], training: ["towerDamage", "towerReload", "towerHp"] });
  assert.deepEqual(smithyRows("keep"), { upgrades: ["keepStrength"], training: ["keepHp"] });
});
