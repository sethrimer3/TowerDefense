/** The forest outside Mossbound Ruins' walls: trees, rocks and dirt pads
 * filling the open ground round the city, planned from the map alone (each
 * cell's own hashes, so a placed tower only clears the trees it stands on),
 * and the trees a battle blows up, each leaving a crater of turned earth
 * and a stump. Presentation only: nothing walks round a tree or is slowed
 * by one, so the battle and its replays are untouched; `forest-art.ts`
 * draws it. */
import { CELLS_H, CELLS_W, cellInBounds, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import type { AreaId } from "./areas.ts";

/** The areas with a forest outside their walls. */
export const FOREST_AREAS: readonly AreaId[] = ["moss"];
export const hasForest = (area: AreaId) => FOREST_AREAS.includes(area);

/** How the forest is planned. `cell` is the coarse noise grid (cells) the
 * thickets and glades follow; a cell holds a tree with `base` + `thick` ×
 * the noise there; rocks and pads are seeded in the cells left over. */
export const FOREST = { cell: 7, base: 0.22, thick: 0.62, rock: 0.07, pad: 0.035, clear: 0.15 };
/** Tree kinds: round broadleaf, star-shaped pine and low bush. */
export type TreeKind = "oak" | "pine" | "bush";
/** How many sprite variants each kind is baked in. */
export const VARIANTS = 10;

/** A tree: its canopy's centre and radius in cells, its look, and its own
 * sway phase. `id` is its place in `trees`. */
export type ForestTree = { id: number; x: number; y: number; r: number; kind: TreeKind; variant: number; phase: number };
export type Rock = { x: number; y: number; size: number; seed: number };
export type Pad = { x: number; y: number; r: number; seed: number };
export type ForestPlan = { trees: ForestTree[]; rocks: Rock[]; pads: Pad[] };

/** A canopy radius for each kind and variant, in cells. */
export function canopyRadius(kind: TreeKind, variant: number) {
  const u = hash01(variant, kind.length, 401);
  return kind === "bush" ? 0.28 + u * 0.12 : kind === "pine" ? 0.42 + u * 0.2 : 0.48 + u * 0.26;
}

/** Smooth value noise on the coarse grid, 0..1. */
function thicket(x: number, y: number) {
  const s = FOREST.cell, gx = x / s, gy = y / s, ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const v = (a: number, b: number) => hash01(a, b, 411);
  const top = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * ux, bottom = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * ux;
  return top + (bottom - top) * uy;
}

/** Whether every cell a disc at (x, y) of radius `r` (cells) touches, with
 * `FOREST.clear` to spare, is open ground (off the board counts). */
export function clearOf(map: CityMap, x: number, y: number, r: number) {
  const reach = r + FOREST.clear;
  for (let cy = Math.floor(y - reach); cy <= Math.floor(y + reach); cy++)
    for (let cx = Math.floor(x - reach); cx <= Math.floor(x + reach); cx++) {
      if (!cellInBounds(cx, cy)) continue;
      // The nearest point of the cell to the disc's middle.
      const nx = Math.max(cx, Math.min(cx + 1, x)) - x, ny = Math.max(cy, Math.min(cy + 1, y)) - y;
      if (nx * nx + ny * ny >= reach * reach) continue;
      if (map.type[cellIndex(cx, cy)] !== CellType.OUT) return false;
    }
  return true;
}

const plans = new WeakMap<CityMap, ForestPlan>();

/** `map`'s forest, planned on first use. */
export function forestPlan(map: CityMap): ForestPlan {
  let plan = plans.get(map);
  if (!plan) plans.set(map, (plan = plan_(map)));
  return plan;
}

function plan_(map: CityMap): ForestPlan {
  const trees: ForestTree[] = [], rocks: Rock[] = [], pads: Pad[] = [];
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      if (map.type[cellIndex(cx, cy)] !== CellType.OUT) continue;
      const dense = thicket(cx + 0.5, cy + 0.5);
      if (hash01(cx, cy, 402) < FOREST.base + FOREST.thick * dense) {
        // Thickets grow pines and oaks, their edges bushes.
        const roll = hash01(cx, cy, 403);
        const kind: TreeKind = roll < 0.18 + (1 - dense) * 0.2 ? "bush" : roll < 0.6 ? "oak" : "pine";
        const variant = hash(cx, cy, 404) % VARIANTS, r = canopyRadius(kind, variant);
        const x = cx + 0.25 + hash01(cx, cy, 405) * 0.5, y = cy + 0.25 + hash01(cx, cy, 406) * 0.5;
        if (clearOf(map, x, y, r)) {
          trees.push({ id: trees.length, x, y, r, kind, variant, phase: hash01(cx, cy, 407) * Math.PI * 2 });
          continue;
        }
      }
      if (hash01(cx, cy, 408) < FOREST.rock) {
        const size = 0.18 + hash01(cx, cy, 409) * 0.3, x = cx + 0.3 + hash01(cx, cy, 410) * 0.4, y = cy + 0.3 + hash01(cx, cy, 412) * 0.4;
        if (clearOf(map, x, y, size)) rocks.push({ x, y, size, seed: hash(cx, cy, 413) });
      }
      // Bare dirt pads, mostly in the glades.
      if (hash01(cx, cy, 414) < FOREST.pad * (1.6 - dense)) {
        const r = 0.7 + hash01(cx, cy, 415) * 1.3, x = cx + 0.5, y = cy + 0.5;
        if (clearOf(map, x, y, r * 0.6)) pads.push({ x, y, r, seed: hash(cx, cy, 416) });
      }
    }
  // Drawn back to front, so a canopy lower on the board stands over the one behind.
  trees.sort((a, b) => a.y - b.y || a.x - b.x);
  trees.forEach((t, i) => (t.id = i));
  return { trees, rocks, pads };
}

/** A tree blown up: where it stood, and the cause, for its debris. */
export type Felled = { tree: ForestTree; fromX: number; fromY: number; force: number };
/** The crater a felled tree leaves. */
export type Crater = { x: number; y: number; r: number; seed: number };

/** The battle's toll on the forest: which trees are down, and the craters
 * they left. A fresh one for every run. */
export class ForestDamage {
  readonly down: Uint8Array;
  readonly craters: Crater[] = [];
  /** Bumped whenever a tree falls, for the art to repaint the ground. */
  version = 0;
  /** The trees by the cell their middle stands in. */
  private byCell = new Map<number, ForestTree[]>();
  constructor(readonly plan: ForestPlan) {
    this.down = new Uint8Array(plan.trees.length);
    for (const t of plan.trees) {
      const k = cellIndex(Math.floor(t.x), Math.floor(t.y)), list = this.byCell.get(k);
      if (list) list.push(t);
      else this.byCell.set(k, [t]);
    }
  }

  standing(t: ForestTree) {
    return !this.down[t.id];
  }

  /** A blast of radius `r` at (x, y): every standing tree whose canopy it
   * reaches past halfway is blown up. */
  blast(x: number, y: number, r: number, force = 1): Felled[] {
    return this.fell(x - r, y - r, x + r, y + r, (t) => {
      const dx = t.x - x, dy = t.y - y, reach = r + t.r * 0.5;
      return dx * dx + dy * dy < reach * reach;
    }, x, y, force);
  }

  /** A cut along the segment (x0, y0)-(x1, y1), `width` cells either side:
   * a valkyrie's charge or the Hero's dash. */
  cut(x0: number, y0: number, x1: number, y1: number, width: number): Felled[] {
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
    return this.fell(Math.min(x0, x1) - width, Math.min(y0, y1) - width, Math.max(x0, x1) + width, Math.max(y0, y1) + width, (t) => {
      const u = Math.max(0, Math.min(1, ((t.x - x0) * dx + (t.y - y0) * dy) / len2));
      const ex = x0 + dx * u - t.x, ey = y0 + dy * u - t.y, reach = width + t.r * 0.5;
      return ex * ex + ey * ey < reach * reach;
    }, x0, y0, 0.8);
  }

  /** Fells the standing trees `hit` picks among those whose middle lies in
   * the box (cells), widened by the largest canopy. */
  private fell(x0: number, y0: number, x1: number, y1: number, hit: (t: ForestTree) => boolean, fromX: number, fromY: number, force: number): Felled[] {
    const out: Felled[] = [];
    const cx0 = Math.max(0, Math.floor(x0 - 1)), cy0 = Math.max(0, Math.floor(y0 - 1));
    const cx1 = Math.min(CELLS_W - 1, Math.floor(x1 + 1)), cy1 = Math.min(CELLS_H - 1, Math.floor(y1 + 1));
    const near: ForestTree[] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) near.push(...(this.byCell.get(cellIndex(cx, cy)) ?? []));
    near.sort((a, b) => a.id - b.id);
    for (const t of near) {
      if (this.down[t.id] || !hit(t)) continue;
      this.down[t.id] = 1;
      this.craters.push({ x: t.x, y: t.y, r: t.r * 1.8 + 0.3, seed: hash(t.id, 417) });
      out.push({ tree: t, fromX, fromY, force });
    }
    if (out.length) this.version++;
    return out;
  }
}
