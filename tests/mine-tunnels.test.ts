import { test } from "node:test";
import assert from "node:assert/strict";
import { MineSim, P_DIG, P_LAMP, P_RAIL, P_TORCH, TICK_HZ, WORK_LIGHT_TICKS, decodeMineSave, noMetals } from "../src/mine/sim.ts";
import { AIR, DENSE_STONE, DIG_TICKS, HARD_STONE, H, LAMP, RAIL, ROCK, STONE, TORCH, WORK_LAMP, W, generate, idx, isSolid, stoneAtDepth } from "../src/mine/world.ts";

test("stone tiers take 3, 9 and 27 times rock and begin at 30 and 60 percent depth", () => {
  assert.equal(DIG_TICKS[STONE], DIG_TICKS[ROCK] * 3);
  assert.equal(DIG_TICKS[HARD_STONE], DIG_TICKS[STONE] * 3);
  assert.equal(DIG_TICKS[DENSE_STONE], DIG_TICKS[HARD_STONE] * 3);
  const surface = 48, ground = H - 8 - surface;
  assert.equal(stoneAtDepth(surface + ground * 0.29, surface), STONE);
  assert.equal(stoneAtDepth(surface + ground * 0.31, surface), HARD_STONE);
  assert.equal(stoneAtDepth(surface + ground * 0.59, surface), HARD_STONE);
  assert.equal(stoneAtDepth(surface + ground * 0.61, surface), DENSE_STONE);
  const world = generate(7);
  for (const mat of [STONE, HARD_STONE, DENSE_STONE]) {
    assert.ok(isSolid(mat));
    assert.ok(world.filter(m => m === mat).length > 10000);
  }
});

function face(material = STONE) {
  const s = new MineSim(7);
  s.weatherOverride = "clear";
  s.plan.fill(0);
  for (let y = 115; y <= 122; y++) for (let x = 7; x <= 15; x++) s.world.set(x, y, STONE);
  for (let x = 9; x <= 10; x++) for (let y = 118; y <= 120; y++) s.world.set(x, y, AIR);
  s.world.set(11, 120, material);
  const m = s.miners[0];
  Object.assign(m, { x: 10, y: 120, inside: null, timer: 0, task: { kind: "dig", cell: idx(11, 120) }, path: [], kit: 10 });
  s.plan[idx(11, 120)] = P_DIG;
  return { s, m };
}

test("miners light a dark working face immediately and use the actual material's digging time", () => {
  for (const material of [ROCK, STONE, HARD_STONE, DENSE_STONE]) {
    const { s, m } = face(material);
    s.step();
    assert.equal(m.action, "dig");
    assert.equal(m.timer, DIG_TICKS[material]);
    assert.equal(s.world.get(9, 119), WORK_LAMP);
    assert.equal(s.lightLife.get(idx(9, 119)), WORK_LIGHT_TICKS);
    assert.equal(s.world.get(10, 120), AIR, "the miner's path stays open");
  }
});

test("lights behind solid walls do not suppress a work lamp; long jobs replace spent lamps", () => {
  const { s, m } = face(DENSE_STONE);
  s.world.set(12, 119, LAMP);
  s.step();
  assert.equal(s.world.get(9, 119), WORK_LAMP);
  for (let n = 0; n < WORK_LIGHT_TICKS + TICK_HZ; n++) s.step();
  assert.equal(m.action, "dig");
  assert.ok(s.world.cells.some(mat => mat === WORK_LAMP));
});

test("temporary lights expire without relighting plans, while lanterns and their saved life persist", () => {
  const { s } = face();
  s.step();
  const work = idx(9, 119), torch = idx(10, 118);
  s.world.set(10, 118, TORCH);
  s.plan[torch] = P_TORCH;
  s.lightLife.set(torch, 3);
  s.lightLife.set(work, 2);
  s.world.set(10, 119, LAMP);
  const save = s.save(1000), decoded = decodeMineSave(JSON.parse(JSON.stringify(save)));
  assert.ok(decoded);
  const back = new MineSim(decoded.seed, decoded);
  assert.deepEqual(back.lightLife, s.lightLife);
  back.miners.length = 0;
  for (let n = 0; n < 3; n++) back.step();
  assert.equal(back.world.get(9, 119), AIR);
  assert.equal(back.world.get(10, 118), AIR);
  assert.equal(back.plan[torch], P_DIG);
  assert.equal(back.world.get(10, 119), LAMP);
  assert.equal(back.lightLife.size, 0);
  assert.equal(decodeMineSave({ ...save, lights: [[work, -1]] }), null);
  const { lights, ...legacy } = save;
  assert.ok(decodeMineSave(legacy));
});

test("a miner installs a permanent lantern with the ordinary building job", () => {
  const { s, m } = face();
  s.world.set(11, 119, AIR);
  s.plan[idx(11, 119)] = P_LAMP;
  m.task = { kind: "build", cell: idx(11, 119) };
  s.step();
  assert.equal(m.action, "build");
  for (let n = 0; n < 75; n++) s.step();
  assert.equal(s.world.get(11, 119), LAMP);
  assert.equal(m.kit, 9);
});

test("the tunnel routes around a hard lens, never grades more than one cell, and reloads its route", () => {
  const s = new MineSim(11), y = s.levels[0];
  for (let x = s.shaftX + 1; x < W - 2; x++)
    for (let yy = y - 7; yy <= y + 4; yy++) s.world.set(x, yy, STONE);
  for (let x = s.shaftX + 10; x < s.shaftX + 25; x++)
    for (let yy = y - 2; yy <= y; yy++) s.world.set(x, yy, DENSE_STONE);
  // Exercise the same planner the crew invokes when sinking a new level.
  (s as any).routeTunnel(0, 1);
  const rows = s.tunnelRows[0];
  for (let x = s.shaftX + 1; x < W - 3; x++) assert.ok(Math.abs(rows[x] - rows[x + 1]) <= 1);
  assert.ok(rows.slice(s.shaftX + 10, s.shaftX + 25).some(row => row !== y));
  for (let x = s.shaftX + 10; x < s.shaftX + 25; x++) for (let dy = 0; dy < 3; dy++)
    assert.notEqual(s.world.get(x, rows[x] - dy), DENSE_STONE, "the tunnel bypasses the hard lens");
  s.plan.fill(0);
  for (let x = s.shaftX + 1; x < W - 2; x++) s.plan[idx(x, rows[x])] = P_RAIL;
  const save = decodeMineSave(s.save(1000))!;
  const back = new MineSim(save.seed, save);
  assert.deepEqual(back.tunnelRows[0], rows);
  assert.equal(decodeMineSave({ ...save, routes: "broken" }), null);
  const { routes, ...legacy } = save;
  const old = new MineSim(legacy.seed, legacy);
  assert.deepEqual(old.tunnelRows[0].slice(s.shaftX + 1, W - 2), rows.slice(s.shaftX + 1, W - 2));
});

test("older prospects gain harder deep ground while keeping excavated tunnels and fittings", () => {
  const s = new MineSim(11);
  s.world.set(20, 220, STONE); s.world.set(20, 350, STONE);
  s.world.set(21, 350, AIR); s.world.set(22, 350, RAIL);
  const { geology, ...legacy } = s.save(1000);
  const decoded = decodeMineSave(legacy)!;
  const back = new MineSim(decoded.seed, decoded);
  assert.equal(back.world.get(20, 220), HARD_STONE);
  assert.equal(back.world.get(20, 350), DENSE_STONE);
  assert.equal(back.world.get(21, 350), AIR);
  assert.equal(back.world.get(22, 350), RAIL);
  assert.equal(back.save(1001).geology, 1);
});

test("carts climb and descend graded rails and return their ore at the shaft", () => {
  const s = new MineSim(11), k = 0, home = s.shaftX + 2, base = s.levels[k];
  s.miners.length = 0;
  const rows = s.tunnelRows[k];
  for (let x = home - 1; x <= home + 12; x++) {
    rows[x] = base + (x > home + 4 ? 1 : x > home + 1 ? -1 : 0);
    // Turn the two-cell jump into two consecutive single-cell ramps.
    if (x === home + 5) rows[x] = base;
    s.world.set(x, rows[x], RAIL);
    s.plan[idx(x, rows[x])] = P_RAIL;
  }
  const cart = { level: k, side: 1, x: home, y: base, ...noMetals(), state: "out" as const, timer: 0 };
  s.carts.push(cart);
  let climbed = false, descended = false;
  for (let n = 0; n < 75; n++) {
    (s as any).stepCart(cart);
    assert.equal(cart.y, rows[cart.x]);
    climbed ||= cart.y < base;
    descended ||= cart.y > base;
  }
  assert.ok(climbed && descended);
  cart.copper = 18;
  for (let n = 0; n < 100; n++) (s as any).stepCart(cart);
  assert.equal(s.buckets[0]?.copper, 18);
  assert.equal(s.buckets[0]?.y, base);
});
