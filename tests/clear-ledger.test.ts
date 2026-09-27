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
  const r = { seed: 1, height: 0, damaged: false, keysSpent: false, changes: {}, ...run } as unknown as Run;
  const world = new RoomWorld(r.seed, r.height, r.changes);
  world.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) world.cells.set(point(x, y), { kind: "floor" });
  world.cells.set(point(4, 4), { kind: "stairs" });
  for (const [k, t] of Object.entries(extra)) world.cells.set(k, t);
  return { tower, run: r, world, ledger: new ClearLedger(tower) };
}
/** The chests the board shows, as tier and tile. */
function chestsOn(world: RoomWorld) {
  const out: string[] = [];
  for (const k of world.cells.keys()) {
    const [x, y] = k.split(",").map(Number), t = world.tile(x, y);
    if (t.kind === "reward") out.push(`${t.tier} ${k}`);
  }
  return out.sort();
}

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
  assert.deepEqual(tower.log[0], { silver: "earned", gold: "earned", platinum: "earned" });
  assert.equal(tower.shards, 0, "chests pay when opened, not when earned");
});

test("chests stand on the floor tiles closest to the stairs; a tier with no room is paid at once", () => {
  const roomy = floor();
  roomy.ledger.check(roomy.world, roomy.run);
  assert.deepEqual(chestsOn(roomy.world), ["gold 4,3", "platinum 2,4", "silver 3,4"]);
  assert.ok(ClearLedger.hasChests(roomy.run));

  const walls = Object.fromEntries([...Array(25).keys()].map(i => [point(i % 5, Math.floor(i / 5)), { kind: "wall" } as Tile]));
  const cramped = floor({ ...walls, [point(4, 4)]: { kind: "stairs" }, [point(3, 4)]: { kind: "floor" } });
  cramped.ledger.check(cramped.world, cramped.run);
  assert.deepEqual(chestsOn(cramped.world), ["silver 3,4"]);
  assert.deepEqual(cramped.tower.log[0], { silver: "earned", gold: "claimed", platinum: "claimed" });
  assert.equal(cramped.tower.shards, 2);
});

test("a chest can stand where an enemy was beaten, and leaves floor behind", () => {
  const { ledger, world, run } = floor({ [point(3, 4)]: { kind: "enemy", enemy: { name: "rat", hp: 1, attack: 0, defense: 0, tier: 0 } } });
  world.clear(3, 4);
  ledger.check(world, run);
  assert.deepEqual(world.tile(3, 4), { kind: "reward", tier: "silver" });
  ledger.claimAll(run);
  assert.deepEqual(world.tile(3, 4), { kind: "floor" });
});

test("opening a chest pays its tier once", () => {
  const { ledger, world, run, tower } = floor();
  ledger.check(world, run);
  assert.equal(ledger.open("gold", run), 1);
  assert.equal(tower.shards, 1);
  assert.deepEqual(tower.log[0], { silver: "earned", gold: "claimed", platinum: "earned" });
  assert.equal(ledger.open("gold", run), 0);
  assert.equal(tower.shards, 1);
});

test("a chest undo brings back stands again but pays nothing", () => {
  const { ledger, world, run, tower } = floor();
  ledger.check(world, run);
  const before = structuredClone(run);
  run.changes["4,3"] = { kind: "openedChest", tier: "gold" };
  ledger.open("gold", run);
  ledger.settle(before);
  assert.equal(before.changes["4,3"].kind, "reward");
  assert.equal(ledger.open("gold", before), 0);
  assert.equal(tower.shards, 1);
});

test("settling pays every earned tier whose chest is gone, and takes away chests never earned", () => {
  const { ledger, world, run, tower } = floor();
  ledger.check(world, run);
  run.changes["4,3"] = { kind: "floor" };
  tower.log[5] = { silver: "earned" };
  ledger.settle(run);
  assert.equal(tower.shards, 2, "gold on this floor and silver on floor 5");
  assert.deepEqual(chestsOn(world), ["platinum 2,4", "silver 3,4"]);
  assert.deepEqual(tower.log[5], { silver: "claimed" });

  const stale = floor({}, { changes: { "3,4": { kind: "reward", tier: "silver" } } });
  stale.ledger.settle(stale.run);
  assert.deepEqual(chestsOn(stale.world), []);
  assert.equal(stale.world.tile(3, 4).kind, "floor");
});

test("leaving pays every tier still owed and takes the chests away", () => {
  const { ledger, world, run, tower } = floor();
  ledger.check(world, run);
  assert.equal(ledger.claimAll(run), 3);
  assert.equal(tower.shards, 3);
  assert.ok(!ClearLedger.hasChests(run));
  assert.deepEqual(chestsOn(world), []);
  assert.equal(ledger.claimAll(run), 0);
});
