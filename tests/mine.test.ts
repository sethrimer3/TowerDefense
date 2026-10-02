// The Mine: its falling-sand physics, the world a seed generates, the crew's
// work, what it pays, and its save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AIR, BEDROCK, CELLS, DIRT, GOLD, GRASS, H, IRON, LADDER, RAIL, ROCK, STONE, TORCH, W, World, decodeGrid, encodeGrid, generate, idx, isPassable, strata } from "../src/mine/world.ts";
import { MineSim, TICK_HZ, decodeMineSave, hirePrice } from "../src/mine/sim.ts";
import { decode } from "../src/save.ts";

const minutes = (sim: MineSim, n: number) => {
  for (let t = 0; t < n * 60 * TICK_HZ; t++) sim.step();
};
/** Column heights of the loose pile standing on the floor of `world`. */
function heights(world: World) {
  return Array.from({ length: W }, (_, x) => {
    let h = 0;
    while (h < H - 1 && world.get(x, H - 2 - h) !== AIR) h++;
    return h;
  });
}
function emptyWorld() {
  const cells = new Uint8Array(CELLS);
  for (let x = 0; x < W; x++) cells[idx(x, H - 1)] = BEDROCK;
  return new World(cells);
}

test("poured dirt settles into a steep mound: one across, two up", () => {
  const world = emptyWorld();
  for (let y = H - 2 - 60; y < H - 2; y++) world.set(64, y, DIRT);
  for (let i = 0; i < 2000 && (i < 2 || world.settling); i++) world.step();
  assert.equal(world.settling, false);
  const h = heights(world);
  assert.equal(h.reduce((a, b) => a + b, 0), 60, "no dirt lost or made");
  for (let x = 1; x < W; x++) assert.ok(Math.abs(h[x] - h[x - 1]) <= 2, `step at ${x}: ${h[x - 1]} → ${h[x]}`);
  const peak = h.indexOf(Math.max(...h));
  assert.equal(h[peak + 1] - h[peak + 4], 6, "the flank climbs two for each one across");
});

test("rocks drop straight down and never slide", () => {
  const world = emptyWorld();
  for (let y = H - 22; y < H - 2; y++) world.set(10, y, ROCK);
  for (let i = 0; i < 200; i++) world.step();
  const h = heights(world);
  assert.equal(h[10], 20);
  assert.equal(h[9] + h[11], 0);
});

test("a seed generates the same world: grass over dirt over stone, with iron and gold", () => {
  const a = generate(42), b = generate(42);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, generate(43));
  const { surface, stoneTop } = strata(42);
  for (let x = 0; x < W; x++) {
    assert.equal(a[idx(x, surface[x] - 1)], AIR);
    assert.equal(a[idx(x, surface[x])], GRASS);
    assert.ok([DIRT, ROCK].includes(a[idx(x, surface[x] + 3)]));
    assert.ok([STONE, IRON, GOLD].includes(a[idx(x, stoneTop[x] + 1)]));
    assert.equal(a[idx(x, H - 1)], BEDROCK);
  }
  assert.ok(a.filter((m) => m === IRON).length > 500);
  assert.ok(a.filter((m) => m === GOLD).length > 100);
  // The generated ground already holds its slopes.
  const world = new World(new Uint8Array(a));
  world.step();
  assert.deepEqual(world.cells, a);
});

test("a grid survives encoding; a damaged one is refused", () => {
  const g = generate(7);
  assert.deepEqual(decodeGrid(encodeGrid(g), CELLS, 14), g);
  assert.equal(decodeGrid(encodeGrid(g.subarray(1)), CELLS, 14), null);
  assert.equal(decodeGrid("not base64!", CELLS, 14), null);
  assert.equal(decodeGrid(42, CELLS, 14), null);
});

test("one miner sinks a shored, laddered shaft and opens a tunnel with track and torches", () => {
  const sim = new MineSim(12345);
  minutes(sim, 20);
  const x0 = sim.shaftX, { surface, stoneTop } = sim.strata;
  assert.ok(sim.depth >= sim.levels[0] - surface[x0], `shaft reached the first level (${sim.depth})`);
  for (let y = surface[x0] + 1; y < sim.levels[0]; y++) assert.equal(sim.world.get(x0, y), LADDER, `ladder at ${y}`);
  // Where the shaft passes through dirt, its walls are timbered.
  for (let y = surface[x0] + 2; y < stoneTop[x0] - 1; y++)
    for (const side of [-1, 1]) assert.notEqual(sim.world.get(x0 + side, y), DIRT, `shoring at ${side},${y}`);
  const y = sim.levels[0];
  assert.ok(sim.railReach(0, -1) + sim.railReach(0, 1) > 20, "track laid");
  let torches = 0;
  for (let x = 0; x < W; x++) if (sim.world.get(x, y - 1) === TORCH) torches++;
  assert.ok(torches >= 2, `torches hung (${torches})`);
  assert.ok(sim.mined.iron > 0, "ore found and dug");
});

test("the crew pays Gold and iron bars, carts and the hoist bring ore up, and nobody ends up inside rock", () => {
  const sim = new MineSim(99);
  for (let i = 0; i < 5; i++) sim.hire();
  let gold = 0, bars = 0;
  for (let k = 0; k < 40; k++) {
    minutes(sim, 1);
    const pay = sim.collect();
    gold += pay.gold;
    bars += pay.ironBar;
    for (const m of sim.miners) {
      assert.ok(isPassable(sim.world.get(m.x, m.y)) && isPassable(sim.world.get(m.x, m.y - 1)), `miner ${m.id} at ${m.x},${m.y}`);
    }
  }
  assert.ok(bars > 10, `iron bars ${bars}`);
  assert.ok(gold > 0, `gold ${gold}`);
  assert.ok(sim.carts.length >= 2, `carts ${sim.carts.length}`);
  assert.ok(sim.world.cells.some((m) => m === RAIL));
});

test("the same seed and crew mine the same way", () => {
  const run = () => {
    const sim = new MineSim(5);
    sim.hire();
    minutes(sim, 10);
    return encodeGrid(sim.world.cells) + JSON.stringify(sim.miners.map((m) => [m.x, m.y]));
  };
  assert.equal(run(), run());
});

test("a mine saves and loads whole; a malformed save is dropped", () => {
  const sim = new MineSim(321);
  sim.hire();
  minutes(sim, 8);
  const saved = JSON.parse(JSON.stringify(sim.save(1000)));
  const back = decodeMineSave(saved);
  assert.ok(back);
  const loaded = new MineSim(back.seed, back);
  assert.deepEqual(loaded.world.cells, sim.world.cells);
  assert.deepEqual(loaded.plan, sim.plan);
  assert.equal(loaded.miners.length, 2);
  assert.equal(loaded.hired, 1);
  minutes(loaded, 2);
  assert.equal(decodeMineSave({ ...saved, cells: "AAAA" }), null);
  assert.equal(decodeMineSave({ ...saved, miners: [{ x: -1, y: 5, iron: 0, gold: 0, spoil: 0 }] }), null);
  assert.equal(decodeMineSave(null), null);
  // The game save keeps the mine alongside everything else.
  assert.equal(decode(JSON.stringify({ version: 1, mine: saved })).mine?.seed, 321);
  assert.equal(decode(JSON.stringify({ version: 1, mine: { seed: "x" } })).mine, null);
});

test("each miner hired costs more than the last", () => {
  for (let n = 0; n < 10; n++) assert.ok(hirePrice(n + 1) > hirePrice(n));
});
