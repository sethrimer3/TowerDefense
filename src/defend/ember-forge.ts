/** The Ember Forge (zone 4, area id `ember`): the open ground outside the
 * walls is a volcanic plain of dark cinders and pale ash, split by glowing
 * fissures, with pools of molten lava under drifting crust, small cinder
 * cones venting sparks and smoke, basalt boulders (some with a glowing
 * seam), clusters of obsidian and the dwarves' cast-offs: broken anvils,
 * stacked ingots, cogs and heaps of slag. Planned from the map alone (each
 * cell's own hashes), presentation only: nothing here blocks, slows or
 * draws from the battle's random stream. `ember-forge-art.ts` draws it. */
import { CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import type { AreaId } from "./areas.ts";
import { clearOf } from "./forest.ts";

/** The areas floored as the Ember Forge. */
export const EMBER_FORGE_AREAS: readonly AreaId[] = ["ember"];
export const hasEmberForge = (area: AreaId) => EMBER_FORGE_AREAS.includes(area);

/** How the forge's ground is planned: at most so many of each feature, their
 * sizes in cells (smallest to largest) and how many cells apart they keep. */
export const EMBER_FORGE = {
  rocks: 55, rock: [0.9, 2.6], pools: 4, pool: [2.4, 3.6], vents: 10, shards: 12, scrap: 9, cracks: 14,
  apart: 0.8,
  /** Sparks a vent has in the air at once, and puffs of smoke. */
  sparks: 8, smoke: 4,
  /** Bubbles that may pop on a pool at once. */
  bubbles: 6,
} as const;

/** A basalt boulder: overlapping rounded lobes round (x, y); `seam` whether a
 * glowing crack runs through it. */
export type ForgeRock = { x: number; y: number; r: number; seed: number; seam: boolean; lobes: { x: number; y: number; r: number }[] };
/** A pool of lava, `r` cells across its middle. */
export type LavaPool = { x: number; y: number; r: number; seed: number };
/** A small cinder cone with a glowing mouth, `r` cells across its foot. */
export type Vent = { x: number; y: number; r: number; seed: number };
/** A cluster of obsidian shards. */
export type ObsidianCluster = { x: number; y: number; r: number; seed: number; shards: number };
/** What the dwarves left lying: a broken anvil, a stack of ingots, a cog
 * half sunk in the cinders or a heap of slag. */
export type ScrapKind = "anvil" | "ingots" | "cog" | "slag";
export type Scrap = { x: number; y: number; r: number; seed: number; kind: ScrapKind };
/** A glowing fissure: a jagged line of points (cells). */
export type Fissure = { seed: number; points: { x: number; y: number }[]; width: number };
/** The plan: `open` is 1 on each open-ground cell, which alone the cinders cover. */
export type EmberForgePlan = {
  open: Uint8Array; rocks: ForgeRock[]; pools: LavaPool[]; vents: Vent[]; shards: ObsidianCluster[]; scrap: Scrap[]; cracks: Fissure[];
};

const plans = new WeakMap<CityMap, EmberForgePlan>();

/** `map`'s forge ground, planned on first use. */
export function emberForgePlan(map: CityMap): EmberForgePlan {
  let plan = plans.get(map);
  if (!plan) plans.set(map, (plan = plan_(map)));
  return plan;
}

const SCRAP: readonly ScrapKind[] = ["anvil", "ingots", "cog", "slag", "slag"];

function plan_(map: CityMap): EmberForgePlan {
  const open = Uint8Array.from(map.type, (t) => (t === CellType.OUT ? 1 : 0));
  /** Open cells in a hashed order of their own for each kind of feature. */
  const spots = (salt: number) => {
    const out: [number, number, number][] = [];
    for (let cy = 0; cy < CELLS_H; cy++)
      for (let cx = 0; cx < CELLS_W; cx++) if (open[cellIndex(cx, cy)]) out.push([cx, cy, hash01(cx, cy, salt)]);
    return out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  };
  const taken: { x: number; y: number; r: number }[] = [];
  // Nothing is cut off by the board's edge: the wilds carry their own.
  const free = (x: number, y: number, r: number) => x - r > 0.2 && y - r > 0.2 && x + r < CELLS_W - 0.2 && y + r < CELLS_H - 0.2 && taken.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= (t.r + r + EMBER_FORGE.apart) ** 2);
  const range = (lo: number, hi: number, u: number) => lo + u * (hi - lo);

  const pools: LavaPool[] = [];
  for (const [cx, cy] of spots(901)) {
    if (pools.length >= EMBER_FORGE.pools) break;
    const r = range(...EMBER_FORGE.pool, hash01(cx, cy, 902)), x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r + 0.3) || !free(x, y, r + 4)) continue;
    pools.push({ x, y, r, seed: hash(cx, cy, 903) });
    taken.push({ x, y, r: r + 0.3 });
  }
  // Fissures: a wandering line from a start cell, every point on open ground.
  const cracks: Fissure[] = [];
  for (const [cx, cy] of spots(941)) {
    if (cracks.length >= EMBER_FORGE.cracks) break;
    const f = fissure(cx + 0.5, cy + 0.5, hash(cx, cy, 942), (x, y) => clearOf(map, x, y, 0.6) && free(x, y, 0.5));
    if (!f) continue;
    cracks.push(f);
    for (const p of f.points) taken.push({ x: p.x, y: p.y, r: 0.35 });
  }
  const vents: Vent[] = [];
  for (const [cx, cy] of spots(911)) {
    if (vents.length >= EMBER_FORGE.vents) break;
    const r = 1 + hash01(cx, cy, 912) * 0.6, x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r) || !free(x, y, r + 1.5)) continue;
    vents.push({ x, y, r, seed: hash(cx, cy, 913) });
    taken.push({ x, y, r });
  }
  const shards: ObsidianCluster[] = [];
  for (const [cx, cy] of spots(921)) {
    if (shards.length >= EMBER_FORGE.shards) break;
    const r = 0.6 + hash01(cx, cy, 922) * 0.7, x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r) || !free(x, y, r + 1)) continue;
    shards.push({ x, y, r, seed: hash(cx, cy, 923), shards: 2 + (hash(cx, cy, 924) % 4) });
    taken.push({ x, y, r });
  }
  const scrap: Scrap[] = [];
  for (const [cx, cy] of spots(931)) {
    if (scrap.length >= EMBER_FORGE.scrap) break;
    const kind = SCRAP[hash(cx, cy, 932) % SCRAP.length], r = kind === "slag" ? 0.8 + hash01(cx, cy, 933) * 0.6 : 0.9, x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r) || !free(x, y, r + 1.2)) continue;
    scrap.push({ x, y, r, seed: hash(cx, cy, 934), kind });
    taken.push({ x, y, r });
  }
  const rocks: ForgeRock[] = [];
  for (const [cx, cy] of spots(951)) {
    if (rocks.length >= EMBER_FORGE.rocks) break;
    const r = range(...EMBER_FORGE.rock, hash01(cx, cy, 952) ** 1.6), x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r) || !free(x, y, r)) continue;
    rocks.push(forgeRock(x, y, r, hash(cx, cy, 953)));
    taken.push({ x, y, r });
  }
  return { open, rocks, pools, vents, shards, scrap, cracks };
}

/** A fissure from (x, y): a zigzag of short jags about one heading, every
 * point where `ok` allows, or null (the wilds lay theirs out this way too). */
export function fissure(x: number, y: number, seed: number, ok: (x: number, y: number) => boolean): Fissure | null {
  const n = 6 + (seed % 5), heading = hash01(seed, 943) * Math.PI * 2, points = [{ x, y }];
  if (!ok(x, y)) return null;
  for (let k = 1; k < n; k++) {
    const a = heading + (hash01(seed, k, 944) - 0.5) * 1.9, step = 0.45 + hash01(seed, k, 945) * 0.6;
    x += Math.cos(a) * step; y += Math.sin(a) * step;
    if (!ok(x, y)) return null;
    points.push({ x, y });
  }
  return { seed, points, width: 0.8 + hash01(seed, 946) * 0.8 };
}

/** A basalt boulder of radius `r` cells at (x, y): its lobes and whether a
 * seam glows through it (the wilds lay theirs out this way too). */
export function forgeRock(x: number, y: number, r: number, seed: number): ForgeRock {
  const n = 2 + (seed % 3), lobes = [{ x, y, r: r * 0.72 }];
  for (let k = 1; k < n; k++) {
    const a = hash01(seed, k, 954) * Math.PI * 2, d = r * (0.3 + hash01(seed, k, 955) * 0.35);
    lobes.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, r: r * (0.38 + hash01(seed, k, 956) * 0.28) });
  }
  return { x, y, r, seed, seam: r > 1.1 && hash01(seed, 957) < 0.45, lobes };
}

/** Where spark `k` of vent `v` is at `t` seconds (cells), how strongly it
 * glows (0..1) and how far through its life it is: spat up out of the
 * mouth, rising and drifting, flickering, cooling from yellow to red. */
export function sparkAt(v: Vent, k: number, t: number) {
  const u = (salt: number) => hash01(v.seed, k, salt);
  const life = 1.4 + u(961) * 1.8, age = (t / life + u(962)) % 1;
  const rise = 1.6 + u(963) * 2.2, drift = (u(964) - 0.5) * 1.6 + 0.35;
  const x = v.x + (u(965) - 0.5) * v.r * 0.5 + drift * age + Math.sin(t * (2.1 + u(966) * 2) + u(967) * 6.28) * 0.12 * age;
  const y = v.y - v.r * 0.35 - rise * age * (1.2 - 0.4 * age);
  const flicker = 0.65 + 0.35 * Math.sin(t * (9 + u(968) * 7) + u(969) * 6.28);
  return { x, y, age, show: (1 - age) ** 1.3 * Math.min(1, age * 12) * flicker };
}

/** Where puff `k` of vent `v`'s smoke is at `t` seconds (cells), how big it
 * is (art pixels) and how much it shows: rising slowly, spreading, leaning
 * with the air, thinning out. */
export function smokeAt(v: Vent, k: number, t: number) {
  const u = (salt: number) => hash01(v.seed, k, salt);
  const life = 5 + u(971) * 3, age = (t / life + u(972)) % 1;
  const x = v.x + age * (0.9 + u(973) * 0.8) + Math.sin(t * 0.6 + u(974) * 6.28) * 0.2 * age;
  const y = v.y - v.r * 0.4 - age * (2.4 + u(975) * 1.2);
  return { x, y, size: 2 + Math.floor(age * 3), show: Math.sin(age * Math.PI) * (1 - age) };
}

/** Bubble `k` on pool `p` at `t` seconds: where (cells) and how far it has
 * swelled (0 none, 1 just bursting). */
export function bubbleAt(p: LavaPool, k: number, t: number) {
  const u = (salt: number) => hash01(p.seed, k, salt);
  const life = 2.2 + u(981) * 2.6, age = (t / life + u(982)) % 1, round = Math.floor(t / life + u(982));
  const a = hash01(p.seed, k, round, 983) * 6.28, d = Math.sqrt(hash01(p.seed, k, round, 984)) * p.r * 0.7;
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.85, swell: age < 0.75 ? 0 : (age - 0.75) / 0.25 };
}
