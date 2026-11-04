/** The Crystal Caves (zone 3, area id `drowned`): the open ground outside the
 * walls is a cavern floor of dark gravel, with slick black and dark grey rock
 * formations, now and then a cluster of glowing deep purple or pale blue
 * crystals, glowing light blue ponds, glowing mushrooms puffing spores, and
 * shafts of daylight falling through holes in the cave's ceiling onto patches
 * of the floor. Planned from the map alone (each cell's own hashes),
 * presentation only: nothing here blocks, slows or draws from the battle's
 * random stream. `crystal-caves-art.ts` draws it. */
import { CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import type { AreaId } from "./areas.ts";
import { clearOf } from "./forest.ts";
import type { Sun } from "../daylight.ts";

/** The areas floored as the Crystal Caves. */
export const CRYSTAL_CAVES_AREAS: readonly AreaId[] = ["drowned"];
export const hasCrystalCaves = (area: AreaId) => CRYSTAL_CAVES_AREAS.includes(area);

/** How the caves are planned: at most so many of each feature, their sizes
 * in cells (smallest to largest) and how many cells apart they keep. */
export const CRYSTAL_CAVES = {
  rocks: 70, rock: [1.2, 3.6], ponds: 4, pond: [2.2, 3.4], crystals: 18, mushrooms: 20,
  shafts: 4, shaft: [2.6, 3.8], shaftApart: 16, apart: 0.8,
  /** Spores a mushroom cluster has in the air at once. */
  spores: 7,
  /** Dust motes drifting in each shaft. */
  dust: 26,
} as const;

/** A rock formation: overlapping rounded lobes round (x, y). */
export type RockFormation = { x: number; y: number; r: number; seed: number; lobes: { x: number; y: number; r: number }[] };
/** A glowing pond, `r` cells across its middle. */
export type CavePond = { x: number; y: number; r: number; seed: number };
/** A cluster of crystal shards, deep purple (`blue` false) or pale blue. */
export type CrystalCluster = { x: number; y: number; r: number; seed: number; blue: boolean; shards: number };
/** A cluster of glowing mushrooms, teal (`hue` 0) or lilac (1). */
export type MushroomCluster = { x: number; y: number; r: number; seed: number; hue: 0 | 1; caps: { x: number; y: number; r: number }[] };
/** A patch of daylight on the floor under a hole in the ceiling. */
export type LightShaft = { x: number; y: number; r: number; seed: number };
/** The plan: `open` is 1 on each open-ground cell, which alone the gravel covers. */
export type CrystalCavesPlan = {
  open: Uint8Array; rocks: RockFormation[]; ponds: CavePond[]; crystals: CrystalCluster[]; mushrooms: MushroomCluster[]; shafts: LightShaft[];
};

const plans = new WeakMap<CityMap, CrystalCavesPlan>();

/** `map`'s caves, planned on first use. */
export function crystalCavesPlan(map: CityMap): CrystalCavesPlan {
  let plan = plans.get(map);
  if (!plan) plans.set(map, (plan = plan_(map)));
  return plan;
}

function plan_(map: CityMap): CrystalCavesPlan {
  const open = Uint8Array.from(map.type, (t) => (t === CellType.OUT ? 1 : 0));
  /** Open cells in a hashed order of their own for each kind of feature. */
  const spots = (salt: number) => {
    const out: [number, number, number][] = [];
    for (let cy = 0; cy < CELLS_H; cy++)
      for (let cx = 0; cx < CELLS_W; cx++) if (open[cellIndex(cx, cy)]) out.push([cx, cy, hash01(cx, cy, salt)]);
    return out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  };
  const taken: { x: number; y: number; r: number }[] = [];
  const free = (x: number, y: number, r: number) => taken.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= (t.r + r + CRYSTAL_CAVES.apart) ** 2);
  const range = (lo: number, hi: number, u: number) => lo + u * (hi - lo);

  const ponds: CavePond[] = [];
  for (const [cx, cy] of spots(801)) {
    if (ponds.length >= CRYSTAL_CAVES.ponds) break;
    const r = range(...CRYSTAL_CAVES.pond, hash01(cx, cy, 802)), x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r) || !free(x, y, r + 3)) continue;
    ponds.push({ x, y, r, seed: hash(cx, cy, 803) });
    taken.push({ x, y, r });
  }
  const crystals: CrystalCluster[] = [];
  for (const [cx, cy] of spots(811)) {
    if (crystals.length >= CRYSTAL_CAVES.crystals) break;
    const r = 1 + hash01(cx, cy, 812) * 1.1, x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r) || !free(x, y, r + 2)) continue;
    crystals.push({ x, y, r, seed: hash(cx, cy, 813), blue: hash01(cx, cy, 814) < 0.45, shards: 3 + (hash(cx, cy, 815) % 4) });
    taken.push({ x, y, r });
  }
  const mushrooms: MushroomCluster[] = [];
  for (const [cx, cy] of spots(821)) {
    if (mushrooms.length >= CRYSTAL_CAVES.mushrooms) break;
    const r = 0.7 + hash01(cx, cy, 822) * 0.6, x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r) || !free(x, y, r + 1)) continue;
    const seed = hash(cx, cy, 823), n = 3 + (seed % 5), caps: MushroomCluster["caps"] = [];
    for (let k = 0; k < n; k++) {
      const a = hash01(seed, k, 824) * Math.PI * 2, d = Math.sqrt(hash01(seed, k, 825)) * r;
      caps.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, r: 0.18 + hash01(seed, k, 826) * 0.22 });
    }
    caps.sort((a, b) => a.y - b.y);
    mushrooms.push({ x, y, r, seed, hue: hash01(cx, cy, 827) < 0.65 ? 0 : 1, caps });
    taken.push({ x, y, r });
  }
  const rocks: RockFormation[] = [];
  for (const [cx, cy] of spots(831)) {
    if (rocks.length >= CRYSTAL_CAVES.rocks) break;
    const r = range(...CRYSTAL_CAVES.rock, hash01(cx, cy, 832) ** 1.5), x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r) || !free(x, y, r)) continue;
    const seed = hash(cx, cy, 833), n = 2 + (seed % 4), lobes = [{ x, y, r: r * 0.7 }];
    for (let k = 1; k < n; k++) {
      const a = hash01(seed, k, 834) * Math.PI * 2, d = r * (0.3 + hash01(seed, k, 835) * 0.4);
      lobes.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: r * (0.35 + hash01(seed, k, 836) * 0.3) });
    }
    rocks.push({ x, y, r, seed, lobes });
    taken.push({ x, y, r });
  }
  // The light falls where it falls: on gravel, rock or water alike, but the
  // holes in the ceiling are far apart.
  const shafts: LightShaft[] = [];
  for (const [cx, cy] of spots(841)) {
    if (shafts.length >= CRYSTAL_CAVES.shafts) break;
    const r = range(...CRYSTAL_CAVES.shaft, hash01(cx, cy, 842)), x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r * 0.6)) continue;
    // No holes under the open sky, nor so near its edge that they merge.
    if (y - r - 4 < openingEdge(x)) continue;
    if (shafts.some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < CRYSTAL_CAVES.shaftApart ** 2)) continue;
    shafts.push({ x, y, r, seed: hash(cx, cy, 843) });
  }
  return { open, rocks, ponds, crystals, mushrooms, shafts };
}

/** The great opening in the cave's roof over the top of the board: how far
 * down its edge comes (as a share of the board's height) and how much it
 * wanders either way, in cells. */
export const CAVE_OPENING = { depth: 0.36, wobble: 11, dust: 70 } as const;

/** Smooth value noise along x at `period` cells, -1..1. */
function noise1(x: number, period: number, salt: number) {
  const u = x / period, i = Math.floor(u), f = u - i, k = f * f * (3 - 2 * f);
  const a = hash01(i, 0, salt) * 2 - 1, b = hash01(i + 1, 0, salt) * 2 - 1;
  return a + (b - a) * k;
}

/** How far down (cells) the opening's ragged edge comes at `x` (cells; any
 * x, so it carries on past the board's sides): broad bays and spurs with
 * smaller jags along them, like a broken cave mouth. Past it the roof goes
 * on; above it is open sky. */
export function openingEdge(x: number) {
  const n = noise1(x, 17, 871) + 0.55 * noise1(x, 6.5, 872) + 0.3 * noise1(x, 2.4, 873) + 0.14 * noise1(x, 0.9, 874);
  return CELLS_H * CAVE_OPENING.depth + (n / 1.99) * CAVE_OPENING.wobble;
}

/** Where dust mote `k` in the opening's light is at `t` seconds (cells),
 * drifting slowly on the air, before `shift` (cells) moves the light. */
export function openingDustAt(k: number, t: number) {
  const u = (salt: number) => hash01(k, 877, salt);
  const x = (u(1) * CELLS_W + t * (u(2) - 0.5) * 0.25 + Math.sin(t * (0.1 + u(3) * 0.15) + u(4) * 6.28) * 0.8 + CELLS_W * 4) % CELLS_W;
  const y = u(5) * CELLS_H * (CAVE_OPENING.depth + 0.04) + Math.sin(t * (0.08 + u(6) * 0.12) + u(7) * 6.28) * 1.2;
  return { x, y, twinkle: 0.55 + 0.45 * Math.sin(t * (1.1 + u(8) * 1.4) + u(9) * 6.28) };
}

/** Where spore `k` of mushroom cluster `m` is at `t` seconds (cells) and how
 * strongly it shows, 0..1: puffed up off a cap, rising and drifting slowly,
 * wobbling, fading in and out. */
export function sporeAt(m: MushroomCluster, k: number, t: number) {
  const u = (salt: number) => hash01(m.seed, k, salt);
  const life = 4 + u(851) * 4, age = (t / life + u(852)) % 1;
  const cap = m.caps[Math.floor(u(853) * m.caps.length)] ?? m;
  const rise = 1.2 + u(854) * 1.6, drift = (u(855) - 0.5) * 1.4;
  const x = cap.x + drift * age + Math.sin(t * (0.9 + u(856)) + u(857) * 6.28) * 0.18 * age;
  const y = cap.y - 0.15 - rise * age;
  return { x, y, show: Math.sin(age * Math.PI) ** 1.2 };
}

/** The direction daylight travels down a shaft without a sky to follow (a
 * fixture, a preview): from the upper left, as the board's light falls. A
 * unit vector pointing back up the shaft toward its hole. */
export const SHAFT_UP = { x: -0.42, y: -0.91 } as const;
/** How far up the shaft shows without a sky, in cells. */
export const SHAFT_LENGTH = 16;
/** How high the cave's ceiling is over its floor, in cells: how far a hole's
 * patch of light slides for each cell a building's shadow would reach. */
export const CAVE_CEILING = 3;

/** How the holes' light falls at the moment: `up` the unit vector back up a
 * beam toward its hole, `length` how far up it shows (cells), `shift` how far
 * each patch has slid from under its hole (cells) and `day` the sun's
 * strength, 0..1. */
export type ShaftLight = { up: { x: number; y: number }; length: number; shift: { x: number; y: number }; day: number };

/** The holes' light under the shared sky's `sun` (whose `x`, `y` is the way
 * and length a building's shadow falls): the patches slide away from the sun
 * as it crosses the sky, the beams lean toward it, long and slanting when it
 * is low, short and steep at noon. Without a sun, the fixed look. */
export function shaftLight(sun?: Sun): ShaftLight {
  if (!sun) return { up: SHAFT_UP, length: SHAFT_LENGTH, shift: { x: 0, y: 0 }, day: 1 };
  const m = Math.sqrt(sun.x * sun.x + sun.y * sun.y) || 1;
  return {
    up: { x: -sun.x / m, y: -sun.y / m },
    length: Math.min(20, Math.max(5, 5 + m * 6.5)),
    shift: { x: sun.x * CAVE_CEILING, y: sun.y * CAVE_CEILING },
    day: Math.min(1, Math.max(0, sun.strength / 0.27)),
  };
}

/** Where dust mote `k` of shaft `s` is at `t` seconds (cells) and how
 * brightly the light catches it, 0..1: drifting slowly up and down the beam,
 * only lit while inside it. */
export function dustAt(s: LightShaft, k: number, t: number, light: ShaftLight = shaftLight()) {
  const u = (salt: number) => hash01(s.seed, k, salt);
  const along = (u(861) + t * (0.004 + u(862) * 0.01) * (u(863) < 0.5 ? -1 : 1) + 4) % 1;
  const across = Math.sin(t * (0.15 + u(864) * 0.2) + u(865) * 6.28) * 0.75 + (u(866) - 0.5) * 0.5;
  const up = light.up, d = along * light.length * 0.85, w = s.r * 0.9 * (1 + along * 0.2);
  const fx = s.x + light.shift.x, fy = s.y + light.shift.y;
  const x = fx + up.x * d - up.y * across * w, y = fy + up.y * d + up.x * across * w;
  const edge = Math.min(1, along / 0.1, (1 - along) / 0.25);
  const twinkle = 0.55 + 0.45 * Math.sin(t * (1.3 + u(867) * 1.5) + u(868) * 6.28);
  return { x, y, show: Math.max(0, edge) * Math.exp(-across * across * 1.6) * twinkle };
}
