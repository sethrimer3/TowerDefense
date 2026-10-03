// The Mine: its falling-sand physics, the world a seed generates, the crew's
// work, its buildings and trades, what it pays, and its save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AIR, BEDROCK, CELLS, DIRT, GOLD, GRASS, GRAVEL, H, LAVA, LOOSE, COPPER, LADDER, MATERIAL_COUNT, RAIL, ROCK, SILVER, STONE, TORCH, W, World, decodeGrid, encodeGrid, generate, idx, isPassable, strata } from "../src/mine/world.ts";
import {
  BARS_PER_POINT, BREATH_TICKS, DAY_TICKS, DEATH_GAP, KIT, MineSim, ORE_PER_BAR, STARVE_TICKS, metalSum, TICK_HZ, WEATHER_TICKS, daylight, decodeMineSave,
  hirePrice, PACE_MINUTES, skyAt, weatherOf,
} from "../src/mine/sim.ts";
import { MAX_AWAY_MS, span } from "../src/away.ts";
import { BAY_BUNKS, FIRST_LEVELS, MAX_LEVEL, along, layout, pathTicks } from "../src/mine/buildings.ts";
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

test("a seed generates the same world: grass over dirt over stone, with copper, silver and gold", () => {
  const a = generate(42), b = generate(42);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, generate(43));
  const { surface, stoneTop } = strata(42);
  for (let x = 0; x < W; x++) {
    assert.equal(a[idx(x, surface[x] - 1)], AIR);
    assert.equal(a[idx(x, surface[x])], GRASS);
    assert.ok([DIRT, ROCK, LOOSE].includes(a[idx(x, surface[x] + 3)]));
    assert.ok([STONE, COPPER, SILVER, GOLD, GRAVEL].includes(a[idx(x, stoneTop[x] + 1)]));
    assert.equal(a[idx(x, H - 1)], BEDROCK);
  }
  assert.ok(a.filter((m) => m === COPPER).length > 500);
  assert.ok(a.filter((m) => m === SILVER).length > 500);
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
  // Two nights' sleep among it.
  minutes(sim, 32);
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
  assert.ok(metalSum(sim.mined) > 0, "ore found and dug");
});

test("the crew's ore comes up by pack, cart and hoist to the forge, is smelted into bars and worked, and nobody ends up inside rock", () => {
  const sim = new MineSim(99);
  sim.setLevel("barracks", 2);
  for (let i = 0; i < 5; i++) sim.hire();
  let points = 0;
  for (let k = 0; k < 40; k++) {
    minutes(sim, 1);
    points += metalSum(sim.collect());
    for (const m of sim.miners) {
      assert.ok(isPassable(sim.world.get(m.x, m.y)) && isPassable(sim.world.get(m.x, m.y - 1)), `miner ${m.id} at ${m.x},${m.y}`);
    }
  }
  const bars = points * BARS_PER_POINT + metalSum(sim.worked) + metalSum(sim.bars);
  assert.ok(bars > 3, `bars ${bars}`);
  assert.ok(sim.mined.copper > 100, `copper mined ${sim.mined.copper}`);
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
  assert.equal(decodeMineSave({ ...saved, miners: [{ x: -1, y: 5, copper: 0, silver: 0, gold: 0, spoil: 0 }] }), null);
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
  sim.setLevel("barracks", MAX_LEVEL);
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
  assert.equal(a.m.inside?.b, "barracks");
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

// ── Buildings and trades ──────────────────────────────────────────────

test("each building grows with its level (a bay of bunks, two forge hands, an anvil a level), and each spot's way in starts at the door", () => {
  const { surface } = strata(7);
  for (const n of [1, 3, MAX_LEVEL]) {
    const b = layout(surface, W / 2, { shaft: n, barracks: n, warehouse: n, forge: n, smithy: n });
    assert.equal(b.barracks.spots.sleep!.length, n * BAY_BUNKS);
    assert.equal(b.forge.spots.work!.length, 2 * n);
    assert.equal(b.smithy.spots.work!.length, n);
    if (n > 1) for (const id of ["shaft", "barracks", "warehouse", "forge", "smithy"] as const) {
      const first = layout(surface, W / 2, FIRST_LEVELS)[id];
      assert.ok(b[id].x1 - b[id].x0 > first.x1 - first.x0, `${id} wider at level ${n}`);
    }
    for (const id of ["barracks", "warehouse", "forge", "smithy"] as const) {
      const building = b[id];
      // Every building stands on the highest ground under it.
      for (let x = building.x0; x <= building.x1; x++) assert.ok(surface[x] > building.floor, `${id} floor at ${x}`);
      for (const spots of Object.values(building.spots))
        for (const spot of spots!) {
          const end = along([building.door, building.floor], spot.path, pathTicks(spot.path));
          assert.deepEqual([end.x, end.y], [spot.x, spot.y], `${id} spot reached`);
          assert.ok(spot.x > building.x0 && spot.x < building.x1, `${id} spot inside`);
        }
    }
    // The buildings don't overlap.
    const spans = Object.values(b).map((x) => [x.x0, x.x1]).sort((p, q) => p[0] - q[0]);
    for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] > spans[i - 1][1], "apart");
  }
});

test("the forge smelts copper, silver and gold ore into bars, and every hundred bars the smiths work make a Smithy point; a trade nobody works goes slowly", () => {
  const run = (forge: number, smith: number) => {
    const sim = new MineSim(8);
    for (let i = 0; i < 4; i++) sim.hire();
    sim.setJobs(forge, smith);
    sim.ore = { copper: ORE_PER_BAR.copper * 6, silver: ORE_PER_BAR.silver * 3, gold: 3 };
    sim.worked = { copper: BARS_PER_POINT - 2, silver: 0, gold: BARS_PER_POINT - 1 };
    // A morning's work, before anyone goes to bed.
    for (let t = 0; t < 4 * 60 * TICK_HZ; t++) {
      sim.step();
      if (sim.night) break;
    }
    return { sim, paid: sim.collect() };
  };
  const busy = run(2, 1);
  assert.equal(busy.sim.miners.filter((m) => m.job === "forge").length, 2);
  assert.equal(busy.sim.miners.filter((m) => m.job === "smith").length, 1);
  assert.equal(busy.sim.miners.filter((m) => m.job === "mine").length, 2);
  assert.deepEqual(busy.paid, { copper: 1, silver: 0, gold: 1 }, "a hundredth bar of copper and of gold made a point each");
  assert.equal(busy.sim.worked.silver, 3, "three silver bars worked");
  // Nobody at the forge or anvil: the work still trickles through, slower.
  const idle = run(0, 0);
  assert.ok(metalSum(idle.paid) < metalSum(busy.paid), `idle ${metalSum(idle.paid)} < busy ${metalSum(busy.paid)}`);
  assert.ok(metalSum(idle.sim.ore) > metalSum(busy.sim.ore), "a backlog of ore at the forge");
  // The allocation never takes more hands than there are, nor more than
  // each building has room for.
  busy.sim.setJobs(9, 9);
  assert.deepEqual(busy.sim.jobs, { forge: 2, smith: 1 });
  busy.sim.setLevel("forge", 3);
  busy.sim.setJobs(9, 9);
  assert.deepEqual(busy.sim.jobs, { forge: 5, smith: 0 });
});

test("at night most of the crew sleeps in the barracks; the night shift works on, and Coffee keeps more awake", () => {
  const asleep = (coffee: number) => {
    const sim = new MineSim(21);
    sim.setLevel("barracks", 2);
    for (let i = 0; i < 9; i++) sim.hire();
    sim.coffee = coffee;
    while (!sim.night) sim.step();
    minutes(sim, 2.5);
    assert.ok(sim.night);
    return sim.miners.filter((m) => m.inside?.why === "sleep").length;
  };
  const tired = asleep(0), wired = asleep(12);
  assert.equal(tired, 8, "all but 20% of ten asleep");
  assert.equal(wired, 2, "all but 80% of ten asleep");
});

test("a new hand fetches supplies from the warehouse before fitting out the workings", () => {
  const sim = new MineSim(3);
  const m = sim.miners[0];
  assert.equal(m.kit, 0);
  let fetched = false;
  for (let t = 0; t < 60 * TICK_HZ && !fetched; t++) {
    sim.step();
    if (m.inside?.b === "warehouse") fetched = true;
  }
  assert.ok(fetched, "went to the warehouse");
  minutes(sim, 0.2);
  assert.ok(m.kit > 0 && m.kit <= KIT, `kit ${m.kit}`);
});

test("the shaft house keeps rain running off the ground out of the shaft, and Waterproofing keeps more out", () => {
  const flood = (waterproof: number) => {
    const sim = new MineSim(17);
    sim.waterproof = waterproof;
    const x = sim.shaftX, top = sim.strata.surface[x];
    for (let y = top; y < top + 60; y++) sim.world.set(x, y, LADDER);
    for (let t = 0; t < 600; t++) {
      if (t % 15 === 0) sim.world.setWater(x - 1, top - 1, true);
      sim.world.step();
      sim.tick++;
      if (sim.world.waterCount) (sim as unknown as { seal(): void }).seal();
    }
    let below = 0;
    for (let y = top + 2; y < H; y++) if (sim.world.water[idx(x, y)]) below++;
    return below;
  };
  const bare = flood(0), proofed = flood(4);
  assert.ok(bare > 0, "some gets in");
  assert.ok(proofed < bare * 0.6, `waterproofed ${proofed} < ${bare}`);
});

test("the smithy's pace follows the bars worked, eased in a minute at a time, and saves; a pace out of reason is forgotten", () => {
  const sim = new MineSim(8);
  for (let i = 0; i < 4; i++) sim.hire();
  sim.setJobs(1, 1);
  assert.deepEqual(sim.pace, { copper: 0, silver: 0, gold: 0 });
  // Plenty of bars at the anvil: a smith working them steadily.
  sim.bars = { copper: 1e6, silver: 0, gold: 0 };
  for (let t = 0; t < 20 * 60 * TICK_HZ; t++) sim.step();
  const worked = 1e6 - sim.bars.copper;
  // Twenty minutes' points, three times over, an hour.
  const hourly = (worked / BARS_PER_POINT) * 3;
  assert.ok(sim.pace.copper > 0, "the pace rose");
  assert.ok(sim.pace.copper < hourly, `eased in over ${PACE_MINUTES} minutes: ${sim.pace.copper} < ${hourly}`);
  const back = new MineSim(8, decodeMineSave(JSON.parse(JSON.stringify(sim.save(1))))!);
  assert.deepEqual(back.pace, sim.pace);
  const odd = JSON.parse(JSON.stringify(sim.save(1)));
  odd.pace = { copper: -1, silver: 0, gold: 0 };
  const kept = decodeMineSave(odd);
  assert.ok(kept, "the mine is kept");
  assert.equal(kept!.pace, undefined);
  // Time away reads in hours and minutes, up to a day.
  assert.equal(MAX_AWAY_MS, 24 * 60 * 60 * 1000);
  assert.equal(span(30 * 1000), "under a minute");
  assert.equal(span(45 * 60 * 1000), "45 min");
  assert.equal(span(3 * 3600 * 1000 + 12 * 60 * 1000), "3 h 12 min");
  assert.equal(span(MAX_AWAY_MS), "24 h");
});

test("the trades and the forge's stock save and load; older saves without them still load", () => {
  const sim = new MineSim(55);
  for (let i = 0; i < 4; i++) sim.hire();
  sim.setJobs(2, 1);
  sim.ore = { copper: 30, silver: 6, gold: 4 };
  sim.bars = { copper: 2, silver: 3, gold: 1 };
  sim.worked = { copper: 5, silver: 50, gold: 0 };
  sim.miners[3].kit = 7;
  const saved = JSON.parse(JSON.stringify(sim.save(0)));
  const loaded = new MineSim(saved.seed, decodeMineSave(saved)!);
  assert.deepEqual(loaded.jobs, { forge: 2, smith: 1 });
  assert.deepEqual(loaded.ore, { copper: 30, silver: 6, gold: 4 });
  assert.deepEqual(loaded.bars, { copper: 2, silver: 3, gold: 1 });
  assert.deepEqual(loaded.worked, { copper: 5, silver: 50, gold: 0 });
  assert.deepEqual(loaded.miners.map((m) => [m.job, m.kit]), sim.miners.map((m) => [m.job, m.kit]));
  const { jobs, ore, bars, worked, ...old } = saved;
  old.miners = old.miners.map(({ job, kit, ...m }: { job: string; kit: number }) => m);
  const plain = new MineSim(old.seed, decodeMineSave(old)!);
  assert.deepEqual(plain.jobs, { forge: 0, smith: 0 });
  assert.ok(plain.miners.every((m) => m.job === "mine" && m.kit === KIT));
  assert.equal(decodeMineSave({ ...saved, jobs: { forge: -1, smith: 0 } }), null);
  assert.equal(decodeMineSave({ ...saved, miners: [{ ...saved.miners[0], job: "baker" }] }), null);
  assert.equal(decodeMineSave({ ...saved, ore: { copper: 1.5, silver: 0, gold: 0 } }), null);
  // A save from before silver: iron became copper.
  const { smelted, ...ironAge } = saved;
  const aged = decodeMineSave({
    ...ironAge, ironOre: 7, mined: { iron: 40, gold: 2 }, ore: { iron: 9, gold: 1 }, bars: { iron: 4, gold: 0 }, steelWork: 3, worked: undefined,
    miners: saved.miners.map(({ copper, silver, ...m }: any) => ({ ...m, iron: 1 })), buckets: [{ y: 90, iron: 5, gold: 1 }],
  })!;
  assert.ok(aged);
  assert.deepEqual(aged.mined, { copper: 40, silver: 0, gold: 2 });
  assert.deepEqual(aged.ore, { copper: 9, silver: 0, gold: 1 });
  assert.deepEqual(aged.smelted, { copper: ORE_PER_BAR.copper - 1, silver: 0, gold: 0 });
  assert.ok(aged.miners.every((m) => m.copper === 1 && m.silver === 0));
  assert.deepEqual(aged.buckets, [{ y: 90, copper: 5, silver: 0, gold: 1 }]);
  new MineSim(aged.seed, aged).step();
});

test("each miner has a name for life: unlike the rest of the crew's, and kept in the save", () => {
  const sim = new MineSim(808);
  sim.setLevel("barracks", 3);
  for (let i = 0; i < 11; i++) sim.hire();
  const names = sim.miners.map((m) => m.name);
  assert.equal(new Set(names).size, names.length, "no two alike");
  assert.ok(names.every((n) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(n)), names.join(", "));
  const loaded = new MineSim(808, decodeMineSave(JSON.parse(JSON.stringify(sim.save(0))))!);
  assert.deepEqual(loaded.miners.map((m) => m.name), names);
  assert.equal(decodeMineSave({ ...sim.save(0), miners: [{ ...sim.save(0).miners[0], name: 7 }] }), null);
});

test("the player puts one miner to a trade; a miner lost is remembered until let go or replaced", () => {
  const sim = new MineSim(909);
  sim.setLevel("smithy", 2);
  for (let i = 0; i < 4; i++) sim.hire();
  const pick = sim.miners.find((m) => m.job === "mine")!, smiths = sim.jobs.smith;
  sim.setJob(pick, "smith");
  assert.equal(pick.job, "smith");
  assert.equal(sim.jobs.smith, smiths + 1);
  sim.mercy = 0;
  const [a, b] = sim.miners.filter((m) => m !== pick);
  (sim as any).kill(a, "crushed");
  sim.mercy = 0;
  (sim as any).kill(b, "drowned");
  assert.deepEqual(sim.fallen.map((f) => [f.name, f.cause]), [[a.name, "crushed"], [b.name, "drowned"]]);
  const loaded = new MineSim(909, decodeMineSave(JSON.parse(JSON.stringify(sim.save(0))))!);
  assert.deepEqual(loaded.fallen, sim.fallen);
  sim.dismiss(b.name);
  assert.deepEqual(sim.fallen.map((f) => f.name), [a.name]);
  sim.hire();
  assert.equal(sim.fallen.length, 0, "the replacement takes the lost miner's place in the list");
  assert.ok(!sim.miners.some((m) => m.name === a.name || m.name === b.name), "names of the lost aren't reused at once");
});

test("a new prospect is a fresh world; the crew, their trades and the stock go with them", () => {
  const sim = new MineSim(1001);
  sim.setLevel("barracks", 2);
  for (let i = 0; i < 5; i++) sim.hire();
  minutes(sim, 6);
  sim.ore = { copper: 9, silver: 1, gold: 2 };
  sim.bars = { copper: 3, silver: 0, gold: 1 };
  for (const m of sim.miners) m.copper = m.silver = m.gold = 0;
  sim.miners[0].copper = 4;
  sim.yard = { copper: 5, silver: 2, gold: 0 };
  sim.carts.length = sim.buckets.length = 0;
  sim.hoist.copper = sim.hoist.silver = sim.hoist.gold = 0;
  const crew = sim.miners.map((m) => [m.name, m.job]);
  const next = sim.prospectNext(4242, 0);
  assert.equal(next.seed, 4242);
  assert.equal(next.prospect, 2);
  assert.deepEqual(next.world.cells, generate(4242), "untouched ground");
  assert.deepEqual(next.miners.map((m) => [m.name, m.job]), crew);
  const door = next.buildings.barracks.door;
  assert.ok(next.miners.every((m) => m.x === door && metalSum(m) === 0));
  assert.deepEqual(next.ore, { copper: 18, silver: 3, gold: 2 }, "ore in packs and the yard goes to the forge's piles");
  assert.deepEqual(next.bars, { copper: 3, silver: 0, gold: 1 });
  assert.equal(next.hired, sim.hired);
  assert.equal(next.oreLeft, next.oreFound);
  minutes(next, 4);
  assert.ok(next.depth > 0, "the crew sinks a new shaft");
});

test("a prospect is worked out once the shaft is at the bottom and its work is done", () => {
  const sim = new MineSim(77);
  minutes(sim, 1);
  assert.equal(sim.workedOut, false);
  assert.ok(sim.oreFound > 2000, `plenty of ore (${sim.oreFound})`);
  sim.shaftLevel = sim.levels.length - 1;
  sim.plan.fill(0);
  (sim as any).survey();
  assert.equal(sim.workedOut, true);
  const loaded = new MineSim(77, decodeMineSave(JSON.parse(JSON.stringify(sim.save(0))))!);
  assert.equal(loaded.workedOut, true);
});

test("a mine from before the world was widened moves its crew to a fresh prospect of the same seed", () => {
  const sim = new MineSim(31);
  for (let i = 0; i < 2; i++) sim.hire();
  sim.setJobs(1, 0);
  const saved = JSON.parse(JSON.stringify(sim.save(0)));
  const narrow = new Uint8Array(128 * H);
  const old = { ...saved, cells: encodeGrid(narrow), plan: encodeGrid(narrow), water: encodeGrid(narrow), burning: [[5, 10]] };
  for (const m of old.miners) delete m.name;
  const back = decodeMineSave(old)!;
  assert.ok(back && back.cells === undefined);
  const moved = new MineSim(back.seed, back);
  assert.deepEqual(moved.world.cells, generate(31));
  assert.equal(moved.miners.length, 3);
  assert.deepEqual(moved.jobs, { forge: 1, smith: 0 });
  assert.ok(moved.miners.every((m) => m.name.length > 0));
});

test("the hoist lets its bucket down to a load, winds it up and tips it in the yard; the forge's hands carry it in", () => {
  const sim = new MineSim(64);
  sim.hire();
  sim.setJobs(1, 0);
  const top = sim.hoist.y, level = top + 40;
  sim.buckets.push({ y: level, copper: 20, silver: 3, gold: 2 });
  let deepest = top;
  for (let t = 0; t < 400 && sim.hoist.state !== "up"; t++) {
    sim.step();
    deepest = Math.max(deepest, sim.hoist.y);
  }
  assert.equal(deepest, level, "let down to the load");
  assert.equal(sim.buckets.length, 0);
  for (let t = 0; t < 400 && sim.hoist.state !== "idle"; t++) sim.step();
  assert.equal(sim.hoist.y, top, "wound back up");
  assert.ok(metalSum(sim.yard) > 0 || metalSum(sim.ore) > 0, "tipped in the yard");
  const yard = metalSum(sim.yard);
  sim.miners.forEach((m) => m.job === "mine" && (m.copper = m.silver = m.gold = m.spoil = 0));
  minutes(sim, 4);
  assert.equal(sim.yard.gold, 0, "gold is carried in first");
  assert.equal(sim.yard.silver, 0, "then silver");
  assert.ok(sim.ore.gold + sim.bars.gold + sim.worked.gold > 0, "into the forge, and on to the smithy");
  assert.ok(yard > 0);
});

// ── Building levels ───────────────────────────────────────────────────

test("the barracks bunks five a level, the forge two hands and the smithy one smith; the rest rise one past the warehouse", () => {
  const sim = new MineSim(4100);
  for (let i = 0; i < 10; i++) sim.hire();
  assert.equal(sim.miners.length, 5, "a first barracks bunks five");
  assert.equal(sim.crewCap, 5);
  assert.equal(sim.jobCap("forge"), 2);
  assert.equal(sim.jobCap("smith"), 1);
  const spare = sim.miners.filter((m) => m.job === "mine");
  sim.setJob(spare[0], "forge");
  assert.equal(sim.setJob(spare[1], "forge"), false, "a full forge turns a hand away");
  assert.equal(sim.jobs.forge, 2);
  // The warehouse caps the others.
  assert.equal(sim.upgrade("barracks"), true);
  assert.equal(sim.buildingLevels.barracks, 2);
  assert.ok(sim.rebuilding("barracks"));
  assert.equal(sim.upgradeBlock("barracks"), "warehouse");
  sim.setLevel("warehouse", 2);
  assert.equal(sim.upgradeBlock("barracks"), "rebuilding");
  sim.setLevel("warehouse", MAX_LEVEL);
  assert.equal(sim.upgradeBlock("warehouse"), "top");
  assert.equal(sim.maxLevel("forge"), MAX_LEVEL);
  assert.ok(sim.upgradeCost("forge") > 0);
  sim.setLevel("forge", 2);
  assert.ok(sim.upgradeCost("forge") > sim.upgradeCost("smithy"), "each level costs more");
  for (let i = 0; i < 10; i++) sim.hire();
  assert.equal(sim.miners.length, 10);
});

test("an upgrade rebuilds the building and moves those it pushes along, sending everyone inside out, while supplies last", () => {
  const sim = new MineSim(4200);
  for (let i = 0; i < 2; i++) sim.hire();
  minutes(sim, 1);
  const before = { ...sim.buildings.smithy }, barracks = { ...sim.buildings.barracks };
  const forgeHand = sim.miners.find((m) => m.job === "forge")!;
  sim.setLevel("warehouse", 2);
  assert.ok(sim.upgrade("forge"));
  assert.equal(forgeHand.inside, null, "nobody is left inside");
  assert.ok(sim.rebuilding("forge") && sim.rebuilding("forge")!.from, "the forge widens, so it moves");
  assert.ok(sim.rebuilding("smithy")?.from, "the smithy is pushed along");
  assert.equal(sim.rebuilding("barracks"), undefined, "the other side stays put");
  assert.deepEqual([sim.buildings.barracks.x0, sim.buildings.barracks.x1], [barracks.x0, barracks.x1]);
  assert.ok(sim.buildings.smithy.x1 < before.x0 || sim.buildings.smithy.x0 < before.x0, "the smithy's new place is further out");
  // Without supplies the work waits.
  sim.stock = 0;
  const t = sim.rebuilding("forge")!.t;
  for (let i = 0; i < 10; i++) sim.step();
  assert.ok(sim.rebuilding("forge")!.t - t <= 1, "waits on supplies");
  for (let i = 0; i < 40 && sim.rebuilds.length; i++) minutes(sim, 0.5);
  assert.equal(sim.rebuilds.length, 0, "both rebuilt");
  assert.ok(sim.miners.every((m) => !m.inside || m.inside.b !== "forge" || !sim.rebuilding("forge")));
});

test("the warehouse brings in supplies to its cap; with none, nobody fetches them and the shaft waits", () => {
  const sim = new MineSim(4300);
  assert.equal(sim.stock, sim.stockCap);
  sim.stock = 0;
  minutes(sim, 1);
  assert.ok(Math.abs(sim.stock - (sim.stockRate - 0)) < sim.stockRate, `brought in ${sim.stock}`);
  sim.setLevel("warehouse", 3);
  assert.equal(sim.stockCap, 3 * 120);
  // A mine with no supplies to fit its shaft doesn't sink it.
  const dry = new MineSim(3), wet = new MineSim(3);
  (dry as any).stepBuildings = () => {};
  dry.stock = 0;
  minutes(dry, 6);
  minutes(wet, 6);
  assert.ok(dry.miners[0].kit === 0, "nothing to fetch");
  assert.ok(dry.depth < wet.depth, `dry ${dry.depth} < stocked ${wet.depth}`);
});

test("levels, supplies and rebuilds save and load; older saves get room for their crew and trades", () => {
  const sim = new MineSim(4400);
  sim.setLevel("warehouse", 2);
  sim.upgrade("smithy");
  sim.stock = 42.5;
  const saved = JSON.parse(JSON.stringify(sim.save(0)));
  const loaded = new MineSim(saved.seed, decodeMineSave(saved)!);
  assert.deepEqual(loaded.buildingLevels, sim.buildingLevels);
  assert.equal(loaded.stock, 42.5);
  assert.deepEqual(loaded.rebuilds, sim.rebuilds);
  assert.equal(decodeMineSave({ ...saved, buildingLevels: { ...saved.buildingLevels, forge: 9 } }), null);
  assert.equal(decodeMineSave({ ...saved, rebuilds: [{ b: "inn", t: 0, total: 5, used: 0, supplies: 1, from: null }] }), null);
  // A big crew from before levels keeps every miner and trade.
  const big = new MineSim(4500);
  big.setLevel("barracks", MAX_LEVEL);
  big.setLevel("warehouse", MAX_LEVEL);
  big.setLevel("forge", 3);
  for (let i = 0; i < 23; i++) big.hire();
  big.setJobs(5, 0);
  const { buildingLevels, stock, rebuilds, ...old } = JSON.parse(JSON.stringify(big.save(0)));
  const migrated = new MineSim(old.seed, decodeMineSave(old)!);
  assert.equal(migrated.miners.length, 24);
  assert.equal(migrated.buildingLevels.barracks, 5);
  assert.equal(migrated.buildingLevels.forge, 3);
  assert.equal(migrated.jobs.forge, 5);
  assert.equal(migrated.buildingLevels.warehouse, 4);
  assert.equal(migrated.stock, migrated.stockCap);
});
