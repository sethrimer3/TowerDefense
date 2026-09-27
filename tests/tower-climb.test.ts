import { test } from "node:test";
import assert from "node:assert/strict";
import { TowerClimb, stairsOn } from "../src/tower/climb.ts";
import { point, type Run } from "../src/entities.ts";
import { TOWER_SECTION, TOWER_START_X } from "../src/config.ts";

function run(height = 0): Run {
  return {
    seed: 7, height, maxHeight: height, kills: 0, treasures: 0, changes: {}, floor: 0,
    player: { x: TOWER_START_X, y: 0, hp: 10, maxHp: 10, attack: 1, defense: 1, keys: { yellow: 0, blue: 0, red: 0 } },
  };
}

test("climbing keeps each floor's changes apart, and going down brings them back", () => {
  const r = run(), climb = new TowerClimb(r);
  r.changes[point(1, 1)] = { kind: "floor" };
  const floor0 = r.changes;
  const { board } = climb.up();
  assert.equal(r.height, 1);
  assert.equal(r.maxHeight, 1);
  assert.deepEqual(r.changes, {});
  assert.equal(board.changes, r.changes, "the board edits the run's current floor");
  assert.deepEqual({ x: r.player.x, y: r.player.y }, { x: TOWER_START_X, y: 0 });
  r.changes[point(2, 2)] = { kind: "floor" };
  climb.down();
  assert.equal(r.height, 0);
  assert.equal(r.changes, floor0);
  assert.deepEqual(Object.keys(r.floors!), ["1"], "the current floor never also sits in floors");
  assert.deepEqual(r.floors![1], { [point(2, 2)]: { kind: "floor" } });
  assert.equal(r.maxHeight, 1);
});

test("going down stands on the floor below's stairs up", () => {
  const r = run(), climb = new TowerClimb(r);
  climb.up();
  const { board } = climb.down()!;
  assert.deepEqual({ x: r.player.x, y: r.player.y }, stairsOn(board, "stairs"));
  assert.equal(board.tile(r.player.x, r.player.y).kind, "stairs");
});

test("a section's first floor is sealed below", () => {
  const r = run(TOWER_SECTION - 1), climb = new TowerClimb(r);
  assert.equal(climb.sealedBelow, false);
  assert.equal(climb.up().sectionStart, true);
  assert.equal(climb.sealedBelow, true);
  assert.equal(climb.down(), null);
  assert.equal(r.height, TOWER_SECTION);
  assert.equal(climb.up().sectionStart, false);
});

test("the climb reads every visited floor, and survives a JSON round trip", () => {
  const r = run(), climb = new TowerClimb(r);
  r.changes[point(1, 1)] = { kind: "attack" };
  climb.up();
  const copy: Run = JSON.parse(JSON.stringify(r)), again = new TowerClimb(copy);
  assert.ok(again.visited(0) && again.visited(1) && !again.visited(2));
  assert.equal(again.board(0).tile(1, 1).kind, "attack");
  assert.equal(again.board(1).changes, copy.changes, "the current floor's board edits the run");
  again.board(1).clear(3, 3);
  again.down();
  assert.deepEqual(copy.floors![1], { [point(3, 3)]: { kind: "floor" } });
});

test("an out-of-date entry for the current floor is never read", () => {
  const r = run();
  r.floors = { 0: { [point(1, 1)]: { kind: "wall" } } };
  const climb = new TowerClimb(r);
  assert.equal(climb.changesOn(0), r.changes);
  climb.up();
  assert.deepEqual(r.floors[0], {}, "leaving writes the floor's real changes");
});
