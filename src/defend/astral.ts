/** The Astral Sanctuary (zone 9, area id `astral`): the city stands on an
 * island of land floating in open sky, and the land grows round wherever the
 * keep stands: lush meadow close to it, thinning to bare earth and stone
 * toward the far edges, and past the board (`astral-art.ts`'s
 * `skyWildsSteps`) the island bulging out on the keep's side and breaking off
 * over the sky everywhere else. On the board: holes through the island onto
 * the sky beneath, white standing stones carved with golden stars, round
 * star dials, pale crystal clusters and little islets hovering over the
 * grass. Planned from the map alone (each cell's own hashes and the keep's
 * place), presentation only: nothing here blocks, slows or draws from the
 * battle's random stream. `astral-art.ts` draws it. */
import { CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import type { AreaId } from "./areas.ts";
import { clearOf } from "./forest.ts";

/** The areas floored as floating sky islands. */
export const ASTRAL_AREAS: readonly AreaId[] = ["astral"];
export const hasAstral = (area: AreaId) => ASTRAL_AREAS.includes(area);

/** How the island is planned: at most so many of each feature, how many
 * cells apart they keep, and how the land grows round the keep. */
export const ASTRAL = {
  holes: 3, stones: 6, dials: 2, crystals: 6, islets: 7,
  apart: 0.9,
  /** Cells from the keep within which the meadow is lush, and past which it
   * has thinned to bare earth and stone. */
  lush: 26, bare: 62,
  /** The island's lobe round the keep past the board: its radius in cells,
   * and how far that wanders. */
  lobe: 50, lobeWander: 12,
  /** Star motes rising off the meadow at once. */
  motes: 28,
} as const;

/** A hole through the island onto the sky beneath, `r` cells across. */
export type SkyHole = { x: number; y: number; r: number; seed: number };
/** A white standing stone, `r` cells from its middle to its far end, long
 * along `angle`. */
export type StarStone = { x: number; y: number; r: number; seed: number; angle: number };
/** A round star dial laid flat in the grass. */
export type StarDial = { x: number; y: number; r: number; seed: number };
/** A cluster of pale crystals. */
export type SkyCrystal = { x: number; y: number; r: number; seed: number };
/** A little islet hovering `lift` cells over the grass, its shadow beneath it. */
export type Islet = { x: number; y: number; r: number; seed: number; lift: number; crystal: boolean };
/** The plan: `open` is 1 on each open-ground cell, which alone the meadow
 * covers; `keep` is the keep's middle (cells), round which the land grows. */
export type AstralPlan = {
  open: Uint8Array; keep: { x: number; y: number };
  holes: SkyHole[]; stones: StarStone[]; dials: StarDial[]; crystals: SkyCrystal[]; islets: Islet[];
};

const plans = new WeakMap<CityMap, AstralPlan>();

/** The keep's middle on `map`, in cells (the board's middle without one). */
export function keepCenter(map: CityMap) {
  const k = map.buildings.find((b) => b.kind === "keep");
  return k ? { x: k.rect.x + k.rect.w / 2, y: k.rect.y + k.rect.h / 2 } : { x: CELLS_W / 2, y: CELLS_H / 2 };
}

/** How lush the meadow is (cells) at (x, y) with the keep at `keep`: 1 near
 * it, falling to 0 toward the far edges, wandering a little. */
export function lushness(x: number, y: number, keep: { x: number; y: number }, wander = 0.5) {
  const d = Math.hypot(x - keep.x, y - keep.y) + (wander - 0.5) * 16;
  return Math.max(0, Math.min(1, 1 - (d - ASTRAL.lush) / (ASTRAL.bare - ASTRAL.lush)));
}

/** `map`'s island, planned on first use. */
export function astralPlan(map: CityMap): AstralPlan {
  let plan = plans.get(map);
  if (!plan) plans.set(map, (plan = plan_(map)));
  return plan;
}

function plan_(map: CityMap): AstralPlan {
  const open = Uint8Array.from(map.type, (t) => (t === CellType.OUT ? 1 : 0));
  const spots = (salt: number) => {
    const out: [number, number, number][] = [];
    for (let cy = 0; cy < CELLS_H; cy++)
      for (let cx = 0; cx < CELLS_W; cx++) if (open[cellIndex(cx, cy)]) out.push([cx, cy, hash01(cx, cy, salt)]);
    return out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  };
  const taken: { x: number; y: number; r: number }[] = [];
  // Nothing is cut off by the board's edge.
  const free = (x: number, y: number, r: number) => x - r > 0.2 && y - r > 0.2 && x + r < CELLS_W - 0.2 && y + r < CELLS_H - 0.2
    && taken.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= (t.r + r + ASTRAL.apart) ** 2);
  const place = <T extends { x: number; y: number; r: number }>(salt: number, max: number, make: (cx: number, cy: number) => T | null, pad = 0) => {
    const out: T[] = [];
    for (const [cx, cy] of spots(salt)) {
      if (out.length >= max) break;
      const t = make(cx, cy);
      if (!t || !clearOf(map, t.x, t.y, t.r) || !free(t.x, t.y, t.r + pad)) continue;
      out.push(t);
      taken.push({ x: t.x, y: t.y, r: t.r });
    }
    return out;
  };
  const holes = place(1701, ASTRAL.holes, (cx, cy) => ({ x: cx + 0.5, y: cy + 0.5, r: 1.8 + hash01(cx, cy, 1702) * 1.2, seed: hash(cx, cy, 1703) }), 0.8);
  const dials = place(1711, ASTRAL.dials, (cx, cy) => ({ x: cx + 0.5, y: cy + 0.5, r: 1.3 + hash01(cx, cy, 1712) * 0.4, seed: hash(cx, cy, 1713) }), 0.6);
  const stones = place(1721, ASTRAL.stones, (cx, cy) => stoneAt(cx + 0.5, cy + 0.5, hash(cx, cy, 1722)), 0.6);
  const crystals = place(1731, ASTRAL.crystals, (cx, cy) => ({ x: cx + 0.5, y: cy + 0.5, r: 0.85 + hash01(cx, cy, 1732) * 0.45, seed: hash(cx, cy, 1733) }), 0.4);
  const islets = place(1741, ASTRAL.islets, (cx, cy) => isletAt(cx + 0.5, cy + 0.5, hash(cx, cy, 1742)), 1);
  return { open, keep: keepCenter(map), holes, stones, dials, crystals, islets };
}

/** A standing stone at (x, y) (the wilds stand theirs this way too). */
export function stoneAt(x: number, y: number, seed: number): StarStone {
  return { x, y, r: 0.9 + hash01(seed, 1723) * 0.45, seed, angle: (hash01(seed, 1724) - 0.5) * 0.9 };
}
/** An islet at (x, y). */
export function isletAt(x: number, y: number, seed: number): Islet {
  return { x, y, r: 0.8 + hash01(seed, 1743) * 0.55, seed, lift: 1 + hash01(seed, 1744) * 1.4, crystal: hash01(seed, 1745) < 0.3 };
}

/** Where islet `f` is at `t` seconds: how far it has bobbed up (cells) and
 * drifted round its spot. */
export function hoverAt(f: Islet, t: number) {
  const u = (salt: number) => hash01(f.seed, salt);
  const bob = Math.sin(t * (0.5 + u(1746) * 0.5) + u(1747) * 6.28) * 0.15;
  const orbit = t * (0.08 + u(1748) * 0.12) * (u(1749) < 0.5 ? -1 : 1) + u(1750) * 6.28, wander = 0.1 + u(1751) * 0.12;
  return { x: f.x + Math.cos(orbit) * wander, y: f.y + Math.sin(orbit) * wander * 0.7, lift: f.lift + bob };
}

/** Star mote `k` rising off the meadow at `t` seconds: where it is (cells)
 * and how much it shows (0 while it is over no open ground). */
export function moteAt(plan: Pick<AstralPlan, "open">, k: number, t: number) {
  const u = (salt: number) => hash01(k, salt);
  const life = 6 + u(1761) * 6, age = (t / life + u(1762)) % 1, round = Math.floor(t / life + u(1762));
  const x = hash01(k, round, 1763) * CELLS_W, y0 = hash01(k, round, 1764) * CELLS_H;
  const show = plan.open[Math.floor(y0) * CELLS_W + Math.floor(x)] ? Math.sin(age * Math.PI) : 0;
  return { x: x + Math.sin(t * 0.6 + k) * 0.2, y: y0 - age * 2, show, twinkle: 0.6 + 0.4 * Math.sin(t * 5 + k * 1.7) };
}

/** Whether (X, Y), in cells, is on the island past the board with the keep
 * at `keep`: a ragged rim round the board's edge, and a great lobe round the
 * keep that bulges out on its side. `rim` and `lobe` are noise (0..1). */
export function islandLand(x: number, y: number, keep: { x: number; y: number }, rim: number, rough: number, lobe: number) {
  const dx = x < 0 ? -x : x > CELLS_W ? x - CELLS_W : 0, dy = y < 0 ? -y : y > CELLS_H ? y - CELLS_H : 0;
  if (!dx && !dy) return true;
  const d = Math.hypot(dx, dy);
  if (d < 1.2 + rim * 6 + rough * 1.2) return true;
  return Math.hypot(x - keep.x, (y - keep.y) * 1.1) < ASTRAL.lobe + (lobe - 0.5) * 2 * ASTRAL.lobeWander + rough * 1.5;
}
