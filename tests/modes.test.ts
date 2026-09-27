import { test } from "node:test";
import assert from "node:assert/strict";
import { MODES, milestones } from "../src/modes.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import { START_X, TOWER_START_X, goldReward } from "../src/config.ts";
import type { Run } from "../src/entities.ts";

const { tower, delve } = MODES;
const run = (over: Partial<Run> = {}) =>
  ({ seed: 7, height: 12, floor: 0, kills: 3, treasures: 2, changes: {}, player: { x: 0, y: 0 }, ...over }) as Run;

test("a Tower floor is its own equivalent floor; ten Delve depth make one", () => {
  assert.deepEqual([0, 9, 70].map(tower.equivalentFloor), [0, 9, 70]);
  assert.deepEqual([9, 10, 19, 20, 700, 705, 709].map(delve.equivalentFloor), [0, 1, 1, 2, 70, 70, 70]);
  assert.equal(tower.progressAt(run(), 5), 12, "Tower loot is measured at the floor");
  assert.equal(delve.progressAt(run(), 5), 5, "Delve loot is measured at the row");
});

test("each new equivalent floor reached pays one of the mode's currency", () => {
  for (const [from, to, t, d] of [[0, 9, 9, 0], [9, 10, 1, 1], [10, 19, 9, 0], [19, 20, 1, 1], [5, 5, 0, 0]])
    assert.deepEqual([milestones(tower, from, to), milestones(delve, from, to)], [t, d], `${from} → ${to}`);
  const save = defaults();
  tower.credit(save, 2);
  delve.credit(save, 5);
  assert.deepEqual([save.tower.inspiration, save.delve.courage], [2, 5]);
  assert.deepEqual([tower.balance(save), delve.balance(save)], [2, 5]);
});

test("each mode builds its own board from a run and enters it at its own column", () => {
  const t = tower.board(run());
  assert.ok(t instanceof RoomWorld && t.room === 12 && t.seed === 7);
  const d = delve.board(run({ floor: 20, delveMilestone: 1 }));
  assert.ok(d instanceof World && d.floor === 20 && d.milestone === 1);
  assert.deepEqual([tower.entranceX, delve.entranceX], [TOWER_START_X, START_X]);
});

test("loot keys, drops and end-of-run gold differ by mode", () => {
  assert.equal(tower.lootKey(run(), 3, 4), "7:12:3,4");
  assert.equal(delve.lootKey(run(), 3, 4), "7:3,4");
  assert.equal(tower.endGold(run()), 0);
  assert.equal(delve.endGold(run()), goldReward(3, 2));
  let draws = 0;
  tower.enemyDrops("Cinder slime", () => (draws++, 0));
  assert.equal(draws, 0, "Tower drops are fixed per enemy");
});
