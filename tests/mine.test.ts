// The Mine: its falling-sand physics, the world a seed generates, the crew's
// work, what it pays, and its save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AIR, BEDROCK, CELLS, DIRT, GOLD, GRASS, GRAVEL, H, LAVA, LOOSE, IRON, LADDER, MATERIAL_COUNT, RAIL, ROCK, STONE, TORCH, W, World, decodeGrid, encodeGrid, generate, idx, isPassable, strata } from "../src/mine/world.ts";
import {
  BREATH_TICKS, DAY_TICKS, DEATH_GAP, MineSim, STARVE_TICKS, TICK_HZ, WEATHER_TICKS, daylight, decodeMineSave, hirePrice, skyAt, weatherOf,
} from "../src/mine/sim.ts";
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
    assert.ok([DIRT, ROCK, LOOSE].includes(a[idx(x, surface[x] + 3)]));
    assert.ok([STONE, IRON, GOLD, GRAVEL].includes(a[idx(x, stoneTop[x] + 1)]));
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
  assert.deepEqual(decodeGrid(encodeGrid(g), CELLS, MATERIAL_COUNT), g);
  assert.equal(decodeGrid(encodeGrid(g.subarray(1)), CELLS, MATERIAL_COUNT), null);
  assert.equal(decodeGrid("not base64!", CELLS, MATERIAL_COUNT), null);
  assert.equal(decodeGrid(42, CELLS, MATERIAL_COUNT), null);
});

test("one miner sinks a shored, laddered shaft and opens a tunnel with track and torches", () => {
  const sim = new MineSim(12345);
  minutes(sim, 25);
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

// ── Water, loose ground and lava ──────────────────────────────────────

/** Steps `world` until it settles (or `cap` steps). */
const settle = (world: World, cap = 4000) => {
  for (let i = 0; i < cap && (i < 2 || world.settling); i++) world.step();
};

test("water runs down a slope into a basin, levels out, and dirt sinks through it", () => {
  const world = emptyWorld();
  // A stone basin, ten wide, with a slope of stone running down into it.
  const floor = H - 2;
  for (let x = 40; x <= 51; x++) world.set(x, floor, STONE);
  for (let y = floor - 8; y <= floor; y++) world.set(40, y, STONE), world.set(51, y, STONE);
  for (let x = 52; x < 70; x++) for (let y = floor - 8 - Math.floor((x - 52) / 2); y <= floor; y++) world.set(x, y, STONE);
  for (let i = 0; i < 30; i++) world.setWater(66, 2 + i, true);
  settle(world);
  assert.equal(world.waterCount, 30, "no water made or lost");
  const rows = new Map<number, number>();
  world.water.forEach((v, i) => v && rows.set(Math.floor(i / W), (rows.get(Math.floor(i / W)) ?? 0) + 1));
  assert.deepEqual([...rows.entries()].sort((a, b) => b[0] - a[0]), [[floor - 1, 10], [floor - 2, 10], [floor - 3, 10]], "a level pool, three deep");
  // Dirt dropped in sinks to the bottom, lifting the water.
  for (let i = 0; i < 4; i++) world.set(45, 2 + i, DIRT);
  settle(world);
  assert.equal(world.waterCount, 30);
  assert.equal(world.get(45, floor - 1), DIRT);
  assert.equal(world.wet01(45, floor - 1), 0);
});

test("gravel and loose dirt slide one across and one down, and fall through ladders", () => {
  const world = emptyWorld();
  for (let y = H - 2 - 40; y < H - 2; y++) world.set(64, y, GRAVEL);
  settle(world);
  const h = heights(world);
  assert.equal(h.reduce((a, b) => a + b, 0), 40);
  for (let x = 1; x < W; x++) assert.ok(Math.abs(h[x] - h[x - 1]) <= 1, `gravel step at ${x}`);
  // A ladder under falling loose dirt is crushed and buried.
  const lw = emptyWorld();
  for (let y = H - 8; y < H - 1; y++) lw.set(10, y, LADDER);
  for (let x = 9; x <= 11; x += 2) for (let y = H - 12; y < H - 1; y++) lw.set(x, y, STONE);
  lw.set(10, H - 12, LOOSE);
  settle(lw);
  assert.equal(lw.get(10, H - 2), LOOSE);
  assert.equal(lw.cells.filter((m) => m === LADDER).length, 0);
});

test("lava creeps out of an opened pool and turns to stone where water meets it", () => {
  const world = emptyWorld();
  for (let x = 20; x < 23; x++) for (let y = H - 4; y < H - 1; y++) world.set(x, y, LAVA);
  for (let i = 0; i < 400; i++) world.step();
  const lava = () => world.cells.filter((m) => m === LAVA).length;
  assert.equal(lava(), 9, "lava neither made nor lost");
  assert.equal(world.get(21, H - 4), AIR, "it spread out flat");
  for (let x = 10; x < 34; x++) world.setWater(x, H - 3, true);
  for (let i = 0; i < 40; i++) world.step();
  assert.equal(lava(), 0, "all quenched");
  assert.ok(world.cells.filter((m) => m === STONE).length >= 3);
});

// ── Day, night and weather ────────────────────────────────────────────

test("days turn to nights, and each seed has its own weather, eased from spell to spell", () => {
  assert.ok(daylight(0) > 0.5, "a new mine starts in the morning");
  const day = Array.from({ length: 100 }, (_, i) => daylight((i * DAY_TICKS) / 100));
  assert.ok(day.some((d) => d === 1) && day.some((d) => d === 0));
  assert.equal(daylight(123), daylight(123 + DAY_TICKS));
  assert.equal(weatherOf(9, 0), "clear");
  const spells = Array.from({ length: 400 }, (_, n) => weatherOf(9, n));
  for (const w of ["clear", "cloudy", "rain", "storm"]) assert.ok(spells.includes(w as never), `${w} comes round`);
  assert.deepEqual(spells, Array.from({ length: 400 }, (_, n) => weatherOf(9, n)));
  const n = spells.findIndex((w, i) => i > 0 && w === "storm" && spells[i - 1] === "clear");
  const start = n * WEATHER_TICKS;
  assert.equal(skyAt(9, start).rain, 0, "the rain eases in");
  assert.equal(skyAt(9, start + 30 * TICK_HZ).rain, 1);
  assert.equal(skyAt(9, 5, "rain").weather, "rain");
});

test("rain lies on the ground, pours down the shaft, and the crew bails it out after", () => {
  const sim = new MineSim(99);
  for (let i = 0; i < 3; i++) sim.hire();
  sim.weatherOverride = "clear";
  minutes(sim, 6);
  sim.weatherOverride = "storm";
  let below = 0, bailed = false;
  for (let k = 0; k < 6 * 60; k++) {
    for (let t = 0; t < TICK_HZ; t++) sim.step();
    below = Math.max(below, sim.world.water.filter((v, i) => v && Math.floor(i / W) > sim.strata.surface[i % W]).length);
    if (sim.miners.some((m) => m.action === "bail")) bailed = true;
  }
  assert.ok(below > 5, `water reached the workings (${below})`);
  assert.ok(bailed, "someone bailed");
  sim.weatherOverride = "clear";
  minutes(sim, 6);
  assert.ok(sim.world.waterCount < below, "the flood went down");
});

// ── Harm ──────────────────────────────────────────────────────────────

/** A mine of `crew` miners, the grace of a new mine over, with miner 0
 * sealed in a pocket deep in the stone. */
function trapped(crew: number) {
  const sim = new MineSim(4242);
  for (let i = 1; i < crew; i++) sim.hire();
  sim.mercy = 0;
  for (let y = 296; y <= 302; y++) for (let x = 8; x <= 12; x++) sim.world.set(x, y, STONE);
  sim.world.set(10, 299, AIR);
  sim.world.set(10, 300, AIR);
  const m = sim.miners[0];
  m.x = 10;
  m.y = 300;
  return { sim, m };
}

test("miners drown, burn and starve; each loss makes the next hire cheaper", () => {
  const { sim, m } = trapped(3);
  const price = sim.price;
  sim.world.setWater(10, 299, true);
  sim.world.setWater(10, 300, true);
  for (let t = 0; t < BREATH_TICKS + 10; t++) sim.step();
  assert.equal(sim.lost.drowned, 1);
  assert.equal(sim.miners.length, 2);
  assert.ok(!sim.miners.includes(m));
  assert.ok(sim.price < price, "a smaller crew hires cheaper");
  assert.equal(sim.mercy, DEATH_GAP - BREATH_TICKS - 10 + (sim.mercy - (DEATH_GAP - BREATH_TICKS - 10)), "deaths are spaced");
  assert.ok(sim.news.some((n) => n.kind === "lost" && n.cause === "drowned"));

  const b = trapped(3);
  b.sim.world.set(11, 300, LAVA);
  b.sim.step();
  assert.equal(b.sim.lost.burnt, 1);

  const c = trapped(3);
  c.m.fed = STARVE_TICKS;
  c.sim.step();
  assert.equal(c.sim.lost.starved, 1);
});

test("a miner is spared soon after a death, when it's the last, and after the first loss in a catch-up", () => {
  // Soon after a death: pulled out to the hut instead.
  const a = trapped(3);
  a.sim.mercy = 100;
  a.sim.world.set(11, 300, LAVA);
  a.sim.step();
  assert.equal(a.sim.lostTotal, 0);
  assert.equal(a.sim.miners.length, 3);
  assert.equal(a.m.x, a.sim.hutX);
  assert.ok(a.sim.news.some((n) => n.kind === "saved"));
  // The last miner always gets out.
  const b = trapped(1);
  b.m.fed = STARVE_TICKS;
  b.sim.step();
  assert.equal(b.sim.miners.length, 1);
  assert.equal(b.sim.lostTotal, 0);
  // Catching up on time away, only the first to come to harm dies.
  const c = trapped(4);
  c.sim.catchingUp = true;
  for (const m of c.sim.miners) m.fed = STARVE_TICKS;
  c.sim.step();
  assert.equal(c.sim.lostTotal, 1);
  assert.equal(c.sim.miners.length, 3);
  // A new mine's first crew is spared.
  assert.equal(new MineSim(1).mercy, DEATH_GAP);
});

test("fire spreads along wood and burns it away, and the crew puts it out", () => {
  const sim = new MineSim(99);
  for (let i = 0; i < 3; i++) sim.hire();
  sim.weatherOverride = "clear";
  minutes(sim, 6);
  const ladders = () => sim.world.cells.filter((m) => m === LADDER).length;
  const before = ladders();
  const y = sim.strata.surface[sim.shaftX] + 6;
  sim.ignite(idx(sim.shaftX, y));
  assert.ok(sim.burn[idx(sim.shaftX, y)] > 0);
  let doused = false, most = 0;
  for (let k = 0; k < 90; k++) {
    for (let t = 0; t < TICK_HZ; t++) sim.step();
    most = Math.max(most, sim.burn.filter((v) => v > 0).length);
    if (sim.miners.some((m) => m.action === "douse")) doused = true;
  }
  assert.ok(most >= 1);
  assert.equal(sim.burn.filter((v) => v > 0).length, 0, "the fire is out");
  assert.ok(doused || ladders() < before, "doused, or burnt through");
});

test("the weather's state saves and loads; older saves without it still load", () => {
  const sim = new MineSim(55);
  sim.hire();
  sim.world.setWater(5, 10, true);
  sim.lost.burnt = 2;
  sim.mercy = 77;
  sim.ignite(idx(sim.shaftX, sim.strata.surface[sim.shaftX] + 1));
  sim.world.set(sim.shaftX, sim.strata.surface[sim.shaftX] + 1, LADDER);
  sim.ignite(idx(sim.shaftX, sim.strata.surface[sim.shaftX] + 1));
  const saved = JSON.parse(JSON.stringify(sim.save(0)));
  const back = decodeMineSave(saved)!;
  const loaded = new MineSim(back.seed, back);
  assert.deepEqual(loaded.world.water, sim.world.water);
  assert.equal(loaded.lost.burnt, 2);
  assert.equal(loaded.mercy, 77);
  assert.deepEqual(loaded.burn, sim.burn);
  const { water, burning, lost, mercy, ...old } = saved;
  const plain = decodeMineSave(old)!;
  assert.ok(plain);
  assert.equal(new MineSim(plain.seed, plain).world.waterCount, 0);
  assert.equal(decodeMineSave({ ...saved, water: "AAAA" }), null);
  assert.equal(decodeMineSave({ ...saved, burning: [[-1, 5]] }), null);
  assert.equal(decodeMineSave({ ...saved, lost: { drowned: -1 } }), null);
});
