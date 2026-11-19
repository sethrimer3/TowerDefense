/** The Obsidian Palace (zone 8, area id `obsidian`): the Blight Prince's
 * throne room, the Dark One's son's palace, cut halfway out of an obsidian
 * cave veined with gold. Toward the north edge the cave has been worked
 * into a palace: polished obsidian slabs inlaid with gold, a purple carpet
 * running down the middle from the Prince's throne on its dais, a
 * colonnade along it whose pillars grow less finished the further they are
 * from the throne. Down each side, just outside the building field, ten
 * torches stand unlit, one more catching violet fire each wave of the
 * zone until all twenty burn on its last. To the south the cave is still
 * raw: glassy black rock with veins of gold, obsidian shards, roughed-out
 * monoliths and stacks of quarried blocks waiting to be laid. Planned from
 * the map alone (each cell's own hashes), presentation only: nothing here
 * blocks, slows or draws from the battle's random stream. `palace-art.ts`
 * draws it. */
import { BUILD_MARGIN, CELLS_H, CELLS_W, SUB, cellIndex, hash, hash01 } from "./grid.ts";
import { WAVES_PER_AREA } from "./areas.ts";
import { CellType, type CityMap } from "./citygen.ts";
import type { AreaId } from "./areas.ts";
import { clearOf } from "./forest.ts";

/** The areas floored as the Blight Prince's palace. */
export const PALACE_AREAS: readonly AreaId[] = ["obsidian"];
export const hasPalace = (area: AreaId) => PALACE_AREAS.includes(area);

/** Cells from the board's edge to the building field's. */
const EDGE = BUILD_MARGIN * SUB;

/** How the palace is planned. */
export const PALACE = {
  /** The throne's foot (cells): down the middle, at the top, just outside
   * the building field. (The zone's boss will rise from it.) */
  throne: { x: CELLS_W / 2, y: EDGE - 0.1 },
  /** The torches: so many down each side, `inset` cells outside the
   * building field, evenly spaced along it. */
  torches: { each: 10, inset: 2 },
  /** The carpet's half width and where it ends (cells). */
  carpet: { half: 2, end: 44 },
  /** The colonnade: how far each row stands from the carpet's middle, and
   * the rows (cells down from the throne's foot). */
  colonnade: { off: 7.5, rows: [6, 13, 20, 27] },
  /** At most so many of each piece placed about the cave. */
  crystals: 9, blocks: 4, monoliths: 2,
  apart: 1.2,
  /** Gold glints twinkling at once at most, and how often each comes round (s). */
  glints: 140, glintEvery: [2.5, 7] as const,
} as const;

/** A pillar standing `r` cells from its middle to a side: `stage` 0
 * finished (a banner on it, maybe), 1 half carved in its scaffold, 2 only
 * roughed out of the rock. */
export type Pillar = { x: number; y: number; r: number; seed: number; stage: 0 | 1 | 2; banner: boolean };
/** A torch on an obsidian stand, lit (violet) from the `order`th wave of
 * the zone on. */
export type Torch = { x: number; y: number; r: number; seed: number; order: number };
/** A cluster of obsidian shards growing out of the floor. */
export type Crystal = { x: number; y: number; r: number; seed: number };
/** Quarried obsidian blocks stacked waiting to be laid. */
export type Blocks = { x: number; y: number; r: number; seed: number };
/** The Blight Prince's throne on its dais, its foot at (x, y). */
export type Throne = { x: number; y: number; r: number; seed: number };
/** The plan: `open` is 1 on each open-ground cell, which alone the floor covers. */
export type PalacePlan = {
  open: Uint8Array; throne: Throne; pillars: Pillar[]; torches: Torch[]; crystals: Crystal[]; blocks: Blocks[];
};

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function noise(x: number, y: number, salt: number) {
  const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash01(ix, iy, salt), b = hash01(ix + 1, iy, salt), c = hash01(ix, iy + 1, salt), d = hash01(ix + 1, iy + 1, salt);
  return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
}

/** How worked the cave is at (x, y) cells, board coordinates (on or off
 * the board): above 0.5 it has been laid with the palace's floor. Most
 * worked toward the throne and along the carpet, raw to the south and out
 * past the board toward the cave's walls. */
export function workAt(x: number, y: number) {
  const north = 1 - Math.max(0, Math.min(1, y / CELLS_H));
  const aisle = Math.exp(-(((x - CELLS_W / 2) / 13) ** 2)) * (y < PALACE.carpet.end + 6 ? 1 : 0.4);
  const dx = x < 0 ? -x : x > CELLS_W ? x - CELLS_W : 0, dy = y < 0 ? -y : y > CELLS_H ? y - CELLS_H : 0, out = Math.hypot(dx, dy);
  return 0.12 + 0.62 * north + 0.3 * aisle + (noise(x / 13, y / 13, 1701) - 0.5) * 0.55 + (noise(x / 4, y / 4, 1702) - 0.5) * 0.12 - smooth(0, 14, out) * 0.6;
}

/** Whether the slab (2 × 2 cells) at slab (sx, sy) has been laid. */
export function slabLaid(sx: number, sy: number) {
  return workAt(sx * 2 + 1, sy * 2 + 1) + (hash01(sx, sy, 1703) - 0.5) * 0.22 > 0.5;
}

/** Whether (x, y) cells lies on the carpet down from `throne`. */
export const onCarpet = (throne: { x: number; y: number }, x: number, y: number) =>
  Math.abs(x - throne.x) < PALACE.carpet.half && y >= throne.y - 0.5 && y < PALACE.carpet.end;

const plans = new WeakMap<CityMap, PalacePlan>();

/** `map`'s palace, planned on first use. */
export function palacePlan(map: CityMap): PalacePlan {
  let plan = plans.get(map);
  if (!plan) plans.set(map, (plan = plan_(map)));
  return plan;
}

function plan_(map: CityMap): PalacePlan {
  const open = Uint8Array.from(map.type, (t) => (t === CellType.OUT ? 1 : 0));
  const throne: Throne = { x: PALACE.throne.x, y: PALACE.throne.y, r: 6, seed: 1711 };
  const torches = palaceTorches();
  const taken: { x: number; y: number; r: number }[] = [{ x: throne.x, y: throne.y - 3.5, r: 6.5 }, ...torches];
  const inside = (x: number, y: number, r: number) => x - r > 0.2 && y - r > 0.2 && x + r < CELLS_W - 0.2 && y + r < CELLS_H - 0.2;
  const free = (x: number, y: number, r: number) => inside(x, y, r) && !aisle(x, y, r)
    && taken.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= (t.r + r + PALACE.apart) ** 2);
  const aisle = (x: number, y: number, r: number) => Math.abs(x - throne.x) < PALACE.carpet.half + r + 0.8 && y < PALACE.carpet.end + r;
  // The colonnade, finished near the throne and less so further down.
  const pillars: Pillar[] = [];
  PALACE.colonnade.rows.forEach((dy, k) => {
    const y = throne.y + dy;
    if (y > PALACE.carpet.end) return;
    for (const side of [-1, 1]) {
      const x = throne.x + side * PALACE.colonnade.off, seed = hash(k, side, 1712);
      const stage = (k < 2 ? 0 : k === 2 ? 1 : 2) as Pillar["stage"];
      const p = { x, y, r: 1, seed, stage, banner: stage === 0 };
      if (!clearOf(map, x, y, 0.8)) continue;
      pillars.push(p);
      taken.push({ x, y, r: 1 });
    }
  });
  const spots = (salt: number) => {
    const out: [number, number, number][] = [];
    for (let cy = 0; cy < CELLS_H; cy++)
      for (let cx = 0; cx < CELLS_W; cx++) if (open[cellIndex(cx, cy)]) out.push([cx, cy, hash01(cx, cy, salt)]);
    return out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  };
  const place = <T extends { x: number; y: number; r: number }>(salt: number, max: number, make: (cx: number, cy: number) => T | null) => {
    const out: T[] = [];
    for (const [cx, cy] of spots(salt)) {
      if (out.length >= max) break;
      const t = make(cx, cy);
      if (!t || !clearOf(map, t.x, t.y, t.r) || !free(t.x, t.y, t.r)) continue;
      out.push(t);
      taken.push({ x: t.x, y: t.y, r: t.r });
    }
    return out;
  };
  const monoliths = place(1716, PALACE.monoliths, (cx, cy) => {
    const w = workAt(cx + 0.5, cy + 0.5);
    return w > 0.3 && w < 0.55 ? { x: cx + 0.5, y: cy + 0.5, r: 1, seed: hash(cx, cy, 1717), stage: 2 as const, banner: false } : null;
  });
  pillars.push(...monoliths);
  const blocks = place(1718, PALACE.blocks, (cx, cy) => {
    const w = workAt(cx + 0.5, cy + 0.5);
    return w > 0.38 && w < 0.62 ? { x: cx + 0.5, y: cy + 0.5, r: 1.1, seed: hash(cx, cy, 1719) } : null;
  });
  const crystals = place(1720, PALACE.crystals, (cx, cy) =>
    workAt(cx + 0.5, cy + 0.5) < 0.42 ? { x: cx + 0.5, y: cy + 0.5, r: 0.7 + hash01(cx, cy, 1721) * 0.5, seed: hash(cx, cy, 1722) } : null);
  return { open, throne, pillars, torches, crystals, blocks };
}

/** The torches down each side, the same on every map: mirrored, evenly
 * spaced along the building field, lit in turn from the top down,
 * alternating sides. */
export function palaceTorches(): Torch[] {
  const { each, inset } = PALACE.torches, out: Torch[] = [];
  for (let k = 0; k < each; k++)
    for (const side of [0, 1]) {
      const x = side ? CELLS_W - EDGE + inset : EDGE - inset, y = EDGE + ((CELLS_H - 2 * EDGE) * (k + 0.5)) / each;
      out.push({ x, y, r: 0.8, seed: hash(k, side, 1713), order: k * 2 + side });
    }
  return out;
}

/** How many torches burn: one for each wave of the zone fought so far,
 * counting `wave` itself while it is being `fought`. */
export function torchesLit(wave: number, fought: boolean) {
  const at = (((wave - 1) % WAVES_PER_AREA) + WAVES_PER_AREA) % WAVES_PER_AREA;
  return Math.min(PALACE.torches.each * 2, at + (fought ? 1 : 0));
}

/** Glint `k` of `n` at `t` seconds: 0 dark, up to 1 at its brightest; each
 * flashes briefly once round its own period. */
export function glintAt(k: number, t: number) {
  const [lo, hi] = PALACE.glintEvery, period = lo + hash01(k, 1731) * (hi - lo);
  const at = (t + hash01(k, 1732) * period) % period, flash = 0.35;
  return at < flash ? Math.sin((at / flash) * Math.PI) : 0;
}

/** How a brazier's fire burns at `t` seconds (0.6..1), flickering. */
export function flicker(seed: number, t: number) {
  const u = (s: number) => hash01(seed, s);
  return 0.78 + 0.12 * Math.sin(t * (7 + u(1741) * 3) + u(1742) * 6.28) + 0.1 * Math.sin(t * (13 + u(1743) * 5) + u(1744) * 6.28);
}
