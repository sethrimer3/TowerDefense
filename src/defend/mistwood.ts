/** The Mistwood (zone 5, area id `fungal`, once the Fungal Hollow): the open
 * ground outside the walls is an old, misty forest floor of deep moss and
 * damp loam, with a few great ancient trees whose crowns hang over it,
 * standing stones carved with glowing runes (now and then a ring of them),
 * fairy rings of pale mushrooms, mossy boulders, fallen logs, stumps, fern
 * clumps and small still moonwells, will-o'-wisps drifting over them. The
 * mist itself is weather (`atmosphere.ts`). Planned from the map alone (each
 * cell's own hashes), presentation only: nothing here blocks, slows or draws
 * from the battle's random stream. `mistwood-art.ts` draws it. */
import { CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import type { AreaId } from "./areas.ts";
import { clearOf } from "./forest.ts";

/** The areas floored as the Mistwood. */
export const MISTWOOD_AREAS: readonly AreaId[] = ["fungal"];
export const hasMistwood = (area: AreaId) => MISTWOOD_AREAS.includes(area);

/** How the wood's ground is planned: at most so many of each feature, their
 * sizes in cells (smallest to largest) and how many cells apart they keep. */
export const MISTWOOD = {
  trees: 7, crown: [2.2, 3.4], stones: 8, circle: [2.2, 2.8], rings: 5, ring: [0.8, 1.3], wells: 2, well: [1, 1.4],
  logs: 6, log: [1.8, 3.2], stumps: 6, boulders: 16, boulder: [0.6, 1.6], ferns: 30,
  apart: 0.7,
  /** Will-o'-wisps drifting round each stone, ring, well and stone circle. */
  wisps: 2,
} as const;

/** An ancient tree: its trunk at (x, y), its crown `r` cells across its middle. */
export type AncientTree = { x: number; y: number; r: number; seed: number };
/** A standing stone carved with a rune; `h` its height in cells. */
export type Menhir = { x: number; y: number; h: number; seed: number };
/** A ring of standing stones round a clearing, `r` cells out. */
export type StoneCircle = { x: number; y: number; r: number; seed: number; stones: Menhir[] };
/** A fairy ring of pale mushrooms, `r` cells out. */
export type FairyRing = { x: number; y: number; r: number; seed: number };
/** A still pool rimmed with stones, `r` cells across its middle. */
export type Moonwell = { x: number; y: number; r: number; seed: number };
/** A fallen log, `len` cells long, lying at `angle` (radians). */
export type FallenLog = { x: number; y: number; len: number; angle: number; seed: number };
/** A stump, a mossy boulder or a fern clump, `r` cells across. */
export type Lump = { x: number; y: number; r: number; seed: number };
/** Where wisps gather: what they drift round, and how far out. */
export type WispHome = { x: number; y: number; r: number; seed: number };
/** The plan: `open` is 1 on each open-ground cell, which alone the moss covers. */
export type MistwoodPlan = {
  open: Uint8Array; trees: AncientTree[]; stones: Menhir[]; circles: StoneCircle[]; rings: FairyRing[]; wells: Moonwell[];
  logs: FallenLog[]; stumps: Lump[]; boulders: Lump[]; ferns: Lump[]; homes: WispHome[];
};

const plans = new WeakMap<CityMap, MistwoodPlan>();

/** `map`'s wood, planned on first use. */
export function mistwoodPlan(map: CityMap): MistwoodPlan {
  let plan = plans.get(map);
  if (!plan) plans.set(map, (plan = plan_(map)));
  return plan;
}

function plan_(map: CityMap): MistwoodPlan {
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
  const inside = (x: number, y: number, r: number) => x - r > 0.2 && y - r > 0.2 && x + r < CELLS_W - 0.2 && y + r < CELLS_H - 0.2;
  const free = (x: number, y: number, r: number) => inside(x, y, r) && taken.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= (t.r + r + MISTWOOD.apart) ** 2);
  const range = (lo: number, hi: number, u: number) => lo + u * (hi - lo);
  const homes: WispHome[] = [];

  // The ancient trees: only their trunks and roots take ground; their crowns
  // hang over the rest (and may reach a little over a wall).
  const trees: AncientTree[] = [];
  for (const [cx, cy] of spots(1101)) {
    if (trees.length >= MISTWOOD.trees) break;
    const r = range(...MISTWOOD.crown, hash01(cx, cy, 1102)), x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, 1) || !inside(x, y, r * 0.8)) continue;
    if (trees.some((t) => (t.x - x) ** 2 + (t.y - y) ** 2 < (t.r + r + 0.5) ** 2)) continue;
    trees.push({ x, y, r, seed: hash(cx, cy, 1103) });
    taken.push({ x, y, r: 1.4 });
  }
  const circles: StoneCircle[] = [];
  for (const [cx, cy] of spots(1111)) {
    if (circles.length >= 1) break;
    const r = range(...MISTWOOD.circle, hash01(cx, cy, 1112)), x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r + 0.6) || !free(x, y, r + 0.8)) continue;
    const seed = hash(cx, cy, 1113), n = 5 + (seed % 3), turn = hash01(seed, 1114) * Math.PI * 2;
    const stones = Array.from({ length: n }, (_, k) => {
      const a = turn + (k / n) * Math.PI * 2 + (hash01(seed, k, 1115) - 0.5) * 0.3;
      return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.82, h: 1 + hash01(seed, k, 1116) * 0.7, seed: hash(seed, k, 1117) };
    });
    circles.push({ x, y, r, seed, stones });
    taken.push({ x, y, r: r + 0.6 });
    homes.push({ x, y, r: r * 0.6, seed });
  }
  const wells: Moonwell[] = [];
  for (const [cx, cy] of spots(1121)) {
    if (wells.length >= MISTWOOD.wells) break;
    const r = range(...MISTWOOD.well, hash01(cx, cy, 1122)), x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r + 0.3) || !free(x, y, r + 2)) continue;
    const seed = hash(cx, cy, 1123);
    wells.push({ x, y, r, seed });
    taken.push({ x, y, r: r + 0.4 });
    homes.push({ x, y, r: r + 0.6, seed });
  }
  const stones: Menhir[] = [];
  for (const [cx, cy] of spots(1131)) {
    if (stones.length >= MISTWOOD.stones) break;
    const h = 1.6 + hash01(cx, cy, 1132) * 1.1, x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, 0.6) || !free(x, y, 1.6)) continue;
    const seed = hash(cx, cy, 1133);
    stones.push({ x, y, h, seed });
    taken.push({ x, y, r: 0.6 });
    if (seed % 2 === 0) homes.push({ x, y: y - h * 0.5, r: 1.1, seed });
  }
  const rings: FairyRing[] = [];
  for (const [cx, cy] of spots(1141)) {
    if (rings.length >= MISTWOOD.rings) break;
    const r = range(...MISTWOOD.ring, hash01(cx, cy, 1142)), x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r) || !free(x, y, r + 0.4)) continue;
    const seed = hash(cx, cy, 1143);
    rings.push({ x, y, r, seed });
    taken.push({ x, y, r: r + 0.2 });
    if (seed % 3 !== 0) homes.push({ x, y, r: r * 0.7, seed });
  }
  const logs: FallenLog[] = [];
  for (const [cx, cy] of spots(1151)) {
    if (logs.length >= MISTWOOD.logs) break;
    const len = range(...MISTWOOD.log, hash01(cx, cy, 1152)), x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, len * 0.55) || !free(x, y, len * 0.55)) continue;
    logs.push({ x, y, len, angle: (hash01(cx, cy, 1153) - 0.5) * 1.3, seed: hash(cx, cy, 1154) });
    taken.push({ x, y, r: len * 0.5 });
  }
  const lumps = (n: number, salt: number, lo: number, hi: number, gap: number, skew = 1) => {
    const out: Lump[] = [];
    for (const [cx, cy] of spots(salt)) {
      if (out.length >= n) break;
      const r = range(lo, hi, hash01(cx, cy, salt + 1) ** skew), x = cx + 0.2 + hash01(cx, cy, salt + 2) * 0.6, y = cy + 0.2 + hash01(cx, cy, salt + 3) * 0.6;
      if (!clearOf(map, x, y, r) || !free(x, y, r + gap)) continue;
      out.push({ x, y, r, seed: hash(cx, cy, salt + 4) });
      taken.push({ x, y, r });
    }
    return out;
  };
  const stumps = lumps(MISTWOOD.stumps, 1161, 0.55, 0.85, 0.6);
  const boulders = lumps(MISTWOOD.boulders, 1171, ...MISTWOOD.boulder, 0.3, 1.8);
  const ferns = lumps(MISTWOOD.ferns, 1181, 0.6, 1, 0);
  return { open, trees, stones, circles, rings, wells, logs, stumps, boulders, ferns, homes };
}

/** Where wisp `k` of `home` is at `t` seconds (cells), how high it floats
 * (cells, for its faint shadow) and how brightly it glows (0..1): drifting
 * slow loops round its home, bobbing, its light swelling and dimming. */
export function wispAt(home: WispHome, k: number, t: number) {
  const u = (salt: number) => hash01(home.seed, k, salt);
  const a = u(1191) * Math.PI * 2 + t * (0.15 + u(1192) * 0.2) * (u(1193) < 0.5 ? -1 : 1), p = u(1194) * Math.PI * 2;
  const reach = home.r + 0.4 + u(1195) * 0.8;
  const x = home.x + Math.cos(a) * reach + Math.sin(t * 0.43 + p) * 0.35;
  const y = home.y + Math.sin(a) * reach * 0.7 + Math.cos(t * 0.31 + p * 1.3) * 0.25;
  const lift = 0.8 + 0.25 * Math.sin(t * 1.1 + p);
  const s = Math.sin(t * (0.5 + u(1196) * 0.4) + p);
  return { x, y: y - lift, lift, glow: 0.45 + 0.55 * Math.max(0, s) ** 1.4 };
}
