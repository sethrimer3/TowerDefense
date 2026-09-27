import { test } from "node:test";
import assert from "node:assert/strict";
import { ClearLedger } from "../src/tower/clear-ledger.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/generation.ts";
import { point, type Run, type Tile } from "../src/entities.ts";

/** A 5x5 open floor with the stairs in the far corner, a fresh run on it,
 * and a ledger over a fresh save. `extra` places tiles on the floor. */
function floor(extra: Record<string, Tile> = {}, run: Partial<Run> = {}) {
  const tower = defaults().tower;
  const r = { seed: 1, height: 0, damaged: false, keysSpent: false, rewards: [], changes: {}, ...run } as unknown as Run;
  const world = new RoomWorld(r.seed, r.height, r.changes);
  world.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) world.cells.set(point(x, y), { kind: "floor" });
  world.cells.set(point(4, 4), { kind: "stairs" });
  for (const [k, t] of Object.entries(extra)) world.cells.set(k, t);
  return { tower, run: r, world, ledger: new ClearLedger(tower) };
}
const tiersAt = (world: RoomWorld, run: Run) =>
  (run.rewards ?? []).map(c => [world.tile(c.x, c.y).kind, c.tier, point(c.x, c.y)]);

/** The tiers clearing `floor(extra, run)` earns. */
const earned = (extra?: Record<string, Tile>, run?: Partial<Run>) => {
  const f = floor(extra, run);
  return f.ledger.check(f.world, f.run);
};

test("a clear earns silver, gold without damage, and platinum without keys as well", () => {
  assert.deepEqual(earned(), ["silver", "gold", "platinum"]);
  assert.deepEqual(earned({}, { damaged: true }), ["silver"]);
  assert.deepEqual(earned({}, { keysSpent: true }), ["silver", "gold"]);
});

test("every enemy and door must go, and each tier is earned once", () => {
  const { ledger, world, run, tower } = floor({
    [point(1, 0)]: { kind: "door", color: "yellow" },
    [point(2, 0)]: { kind: "enemy", enemy: { name: "rat", hp: 1, attack: 0, defense: 0, tier: 0 } },
  });
  assert.deepEqual(ledger.check(world, run), []);
  world.clear(1, 0);
  assert.deepEqual(ledger.check(world, run), []);
  world.clear(2, 0);
  assert.deepEqual(ledger.check(world, run), ["silver", "gold", "platinum"]);
  assert.deepEqual(ledger.check(world, run), []);
  assert.deepEqual(tower.log[0], { earned: ["silver", "gold", "platinum"], claimed: [] });
  assert.equal(tower.shards, 0, "chests pay when opened, not when earned");
});

test("chests stand on the floor tiles closest to the stairs; a tier with no room is paid at once", () => {
  const roomy = floor();
  roomy.ledger.check(roomy.world, roomy.run);
  assert.deepEqual(tiersAt(roomy.world, roomy.run), [
    ["reward", "silver", "3,4"], ["reward", "gold", "4,3"], ["reward", "platinum", "2,4"],
  ]);
  assert.ok(ClearLedger.hasChests(roomy.run));

  const walls = Object.fromEntries([...Array(25).keys()].map(i => [point(i % 5, Math.floor(i / 5)), { kind: "wall" } as Tile]));
  const cramped = floor({ ...walls, [point(4, 4)]: { kind: "stairs" }, [point(3, 4)]: { kind: "floor" } });
  cramped.ledger.check(cramped.world, cramped.run);
  assert.deepEqual(tiersAt(cramped.world, cramped.run), [["reward", "silver", "3,4"]]);
  assert.deepEqual(cramped.tower.log[0], { earned: ["silver", "gold", "platinum"], claimed: ["gold", "platinum"] });
  assert.equal(cramped.tower.shards, 2);
});

test("a chest can stand where an enemy or pickup was consumed", () => {
  const { ledger, world, run } = floor();
  world.clear(3, 4);
  ledger.check(world, run);
  assert.deepEqual(world.tile(3, 4), { kind: "reward", tier: "silver" });
});

test("opening a chest pays its tier once and takes it off the board", () => {
  const { ledger, world, run, tower } = floor();
  ledger.check(world, run);
  assert.equal(ledger.open("gold", world, run), 1);
  assert.equal(tower.shards, 1);
  assert.deepEqual(run.rewards!.map(c => c.tier), ["silver", "platinum"]);
  assert.equal(world.tile(4, 3).kind, "floor");
  assert.equal(ledger.open("gold", world, run), 0);
  assert.equal(tower.shards, 1);
});

test("settling keeps standing chests and pays every earned tier whose chest is gone", () => {
  const { ledger, world, run, tower } = floor();
  ledger.check(world, run);
  run.rewards = run.rewards!.filter(c => c.tier !== "gold");
  tower.log[5] = { earned: ["silver"], claimed: [] };
  ledger.settle(world, run);
  assert.equal(tower.shards, 2, "gold on this floor and silver on floor 5");
  assert.deepEqual(run.rewards.map(c => c.tier), ["silver", "platinum"]);
  assert.deepEqual(tower.log[5], { earned: ["silver"], claimed: ["silver"] });

  const stale = floor({}, { rewards: [{ x: 3, y: 4, tier: "silver" }] });
  stale.ledger.settle(stale.world, stale.run);
  assert.deepEqual(stale.run.rewards, [], "a chest with no earned tier behind it goes");
  assert.equal(stale.world.tile(3, 4).kind, "floor");
});

test("leaving pays every tier still owed", () => {
  const { ledger, world, run, tower } = floor();
  ledger.check(world, run);
  assert.equal(ledger.claimAll(world, run), 3);
  assert.equal(tower.shards, 3);
  assert.ok(!ClearLedger.hasChests(run));
  assert.equal(ledger.claimAll(world, run), 0);
});
