/** The wilds outside Mossbound Ruins' walls: large to huge old oaks and
 * pines seen from above, rocks, dirt pads, rare meadows and flower fields
 * and a few lakes filling the open ground round the city, planned from the
 * map alone (each cell's own hashes, so a placed tower only clears what it
 * stands on), and the trees a battle blows up, each leaving a crater of
 * turned earth and a stump. All of it is presentation only but the
 * boulders (`boulderPlan`): those, alone, in clusters or heaped into small
 * mountains, block ground units in the battle (`DefendSim.syncBoulders`).
 * `forest-art.ts` draws it. */
import { CELLS_H, CELLS_W, SUB, cellInBounds, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import type { AreaId } from "./areas.ts";

/** The areas with a forest outside their walls. */
export const FOREST_AREAS: readonly AreaId[] = ["moss"];
export const hasForest = (area: AreaId) => FOREST_AREAS.includes(area);

/** How the forest is planned. `cell` is the coarse noise grid (cells) the
 * thickets and glades follow; `big` is each tree size's chance a cell
 * (thickets raise it, glades lower it); rocks and pads are seeded in the
 * cells left over; `lakes` and `meadows` how many of each. */
export const FOREST = {
  cell: 7, rock: 0.04, pad: 0.03, clear: 0.15,
  big: [0, 0.11, 0.045, 0.018],
  lakes: 3, meadows: 6,
};
/** Tree kinds: round broadleaf, star-shaped pine and low bush. */
export type TreeKind = "oak" | "pine" | "bush";
/** Tree sizes: ordinary (no longer planted), large, larger and huge. */
export type TreeSize = 0 | 1 | 2 | 3;
/** How many sprite variants each kind and size is baked in. */
export const VARIANTS = 10;
/** The smallest blast radius (cells) that fells a tree of each size; a
 * cut fells only ordinary and large ones. */
export const TOUGH = [0, 0.5, 0.9, 1.4];

/** A tree: its canopy's centre and radius in cells, its look, and its own
 * sway phase. `id` is its place in `trees`. */
export type ForestTree = { id: number; x: number; y: number; r: number; kind: TreeKind; size: TreeSize; variant: number; phase: number };
export type Rock = { x: number; y: number; size: number; seed: number };
export type Pad = { x: number; y: number; r: number; seed: number };
/** A lake: the union of its discs (cells). */
export type Lake = { discs: { x: number; y: number; r: number }[]; seed: number };
/** A meadow of long grass, in flower or not. */
export type Meadow = { x: number; y: number; r: number; seed: number; flowers: boolean };
export type ForestPlan = { trees: ForestTree[]; rocks: Rock[]; pads: Pad[]; lakes: Lake[]; meadows: Meadow[]; boulders: Boulder[] };

/** A canopy radius for each kind, size and variant, in cells. */
export function canopyRadius(kind: TreeKind, variant: number, size: TreeSize = 0) {
  const u = hash01(variant, kind.length, size, 401);
  if (size === 3) return (kind === "pine" ? 1.9 : 2.1) + u * 0.5;
  if (size === 2) return (kind === "pine" ? 1.3 : 1.4) + u * 0.3;
  if (size === 1) return (kind === "pine" ? 0.85 : 0.9) + u * 0.25;
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

/** A boulder or a cluster of them: the cells it blocks. */
export type Boulder = { cells: number[]; seed: number };
/** Boulders: a cell's chance of starting one, how far (cells) they keep
 * from anything but open ground and from each other, and the spawn rows
 * they keep out of; `mountains` how many small mountains, each `peak`
 * cells at most. */
export const BOULDERS = { chance: 0.006, clear: 2, apart: 3, top: SUB, mountains: 5, peak: [20, 40] };
/** A heap this many cells or more is drawn as a small mountain. */
export const MOUNTAIN = 9;

const boulderPlans = new WeakMap<CityMap, Boulder[]>();

/** `map`'s boulders, planned on first use: a lone boulder (one cell or a
 * 2 × 2 block) or a cluster of three to six cells, on open ground kept
 * `BOULDERS.clear` cells from the city, its walls and every structure, out
 * of the spawn rows, and `apart` cells from each other, so they can never
 * wall in ground or block the way to the city. */
export function boulderPlan(map: CityMap): Boulder[] {
  let plan = boulderPlans.get(map);
  if (plan) return plan;
  plan = [];
  const taken = new Uint8Array(CELLS_W * CELLS_H);
  const open = (x: number, y: number) => {
    for (let dy = -BOULDERS.clear; dy <= BOULDERS.clear; dy++)
      for (let dx = -BOULDERS.clear; dx <= BOULDERS.clear; dx++) {
        const cx = x + dx, cy = y + dy;
        if (cellInBounds(cx, cy) && map.type[cellIndex(cx, cy)] !== CellType.OUT) return false;
      }
    for (let dy = -BOULDERS.apart; dy <= BOULDERS.apart; dy++)
      for (let dx = -BOULDERS.apart; dx <= BOULDERS.apart; dx++)
        if (cellInBounds(x + dx, y + dy) && taken[cellIndex(x + dx, y + dy)]) return false;
    return y >= BOULDERS.top && cellInBounds(x, y);
  };
  // A heap grows a cell at a time from a cell already in it, toward its
  // middle more than away, so it stays round; any ground it closes round is
  // filled, so nothing is walled in.
  const grow = (cx: number, cy: number, want: number) => {
    const cells: [number, number][] = [[cx, cy]];
    const has = (x: number, y: number) => cells.some(([a, b]) => a === x && b === y);
    // Of a few cells beside it, the one most hemmed in by the heap.
    const hemmed = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].filter(([dx, dy]) => has(x + dx, y + dy)).length;
    for (let k = 0; cells.length < want && k < want * 8; k++) {
      let best: [number, number] | null = null, score = -1;
      for (let j = 0; j < 4; j++) {
        const [bx, by] = cells[hash(cx, cy, k, j, 504) % cells.length];
        const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][hash(cx, cy, k, j, 505) % 4];
        const nx = bx + dx, ny = by + dy;
        if (has(nx, ny) || !open(nx, ny)) continue;
        const v = hemmed(nx, ny);
        if (v > score) score = v, best = [nx, ny];
      }
      if (best) cells.push(best);
    }
    let x0 = cx, y0 = cy, x1 = cx, y1 = cy;
    for (const [x, y] of cells) x0 = Math.min(x0, x), y0 = Math.min(y0, y), x1 = Math.max(x1, x), y1 = Math.max(y1, y);
    const w = x1 - x0 + 3, h = y1 - y0 + 3, out = new Uint8Array(w * h), todo = [0];
    for (const [x, y] of cells) out[(y - y0 + 1) * w + x - x0 + 1] = 2;
    out[0] = 1;
    while (todo.length) {
      const i = todo.pop()!, x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || out[n]) continue;
        out[n] = 1;
        todo.push(n);
      }
    }
    for (let i = 0; i < out.length; i++) if (!out[i]) cells.push([x0 - 1 + (i % w), y0 - 1 + Math.floor(i / w)]);
    for (const [x, y] of cells) taken[cellIndex(x, y)] = 1;
    plan.push({ cells: cells.map(([x, y]) => cellIndex(x, y)), seed: hash(cx, cy, 506) });
  };
  // A few small mountains first, at spots tried in a hashed order.
  const spots: [number, number, number][] = [];
  for (let cy = BOULDERS.top; cy < CELLS_H; cy++) for (let cx = 0; cx < CELLS_W; cx++) spots.push([cx, cy, hash01(cx, cy, 507)]);
  spots.sort((a, b) => a[2] - b[2]);
  let mountains = 0;
  for (const [cx, cy] of spots) {
    if (mountains >= BOULDERS.mountains) break;
    // Room for its heart: a 3 × 3 of open ground.
    let room = true;
    for (let dy = -1; dy <= 1 && room; dy++) for (let dx = -1; dx <= 1 && room; dx++) room = open(cx + dx, cy + dy);
    if (!room) continue;
    const [lo, hi] = BOULDERS.peak, want = lo + (hash(cx, cy, 508) % (hi - lo + 1));
    grow(cx, cy, want);
    mountains++;
  }
  // Then lone boulders, 2 × 2 blocks, clusters and rocky heaps.
  for (let cy = BOULDERS.top; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      if (hash01(cx, cy, 501) >= BOULDERS.chance || !open(cx, cy)) continue;
      const roll = hash01(cx, cy, 502);
      if (roll < 0.3) {
        taken[cellIndex(cx, cy)] = 1;
        plan.push({ cells: [cellIndex(cx, cy)], seed: hash(cx, cy, 506) });
      } else if (roll < 0.5) {
        const cells = [[cx, cy], ...([[1, 0], [0, 1], [1, 1]] as const).map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => open(x, y))];
        for (const [x, y] of cells) taken[cellIndex(x, y)] = 1;
        plan.push({ cells: cells.map(([x, y]) => cellIndex(x, y)), seed: hash(cx, cy, 506) });
      } else grow(cx, cy, roll < 0.8 ? 3 + (hash(cx, cy, 503) % 4) : 7 + (hash(cx, cy, 503) % 6));
    }
  boulderPlans.set(map, plan);
  return plan;
}

const plans = new WeakMap<CityMap, ForestPlan>();

/** `map`'s forest, planned on first use. */
export function forestPlan(map: CityMap): ForestPlan {
  let plan = plans.get(map);
  if (!plan) plans.set(map, (plan = plan_(map)));
  return plan;
}

/** Whether (x, y) lies within `pad` cells of any of the discs. */
const inDiscs = (discs: readonly { x: number; y: number; r: number }[], x: number, y: number, pad = 0) =>
  discs.some((d) => (x - d.x) ** 2 + (y - d.y) ** 2 < (d.r + pad) ** 2);

function plan_(map: CityMap): ForestPlan {
  const trees: ForestTree[] = [], rocks: Rock[] = [], pads: Pad[] = [], lakes: Lake[] = [], meadows: Meadow[] = [];
  const boulders = boulderPlan(map);
  // What keeps the rest away: lakes, meadows, big canopies and the boulders.
  const keep: { x: number; y: number; r: number }[] = [];
  const stones: { x: number; y: number; r: number }[] = [];
  for (const b of boulders) for (const c of b.cells) stones.push({ x: (c % CELLS_W) + 0.5, y: Math.floor(c / CELLS_W) + 0.5, r: 0.8 });
  const each = (visit: (cx: number, cy: number) => void) => {
    for (let cy = 0; cy < CELLS_H; cy++) for (let cx = 0; cx < CELLS_W; cx++) if (map.type[cellIndex(cx, cy)] === CellType.OUT) visit(cx, cy);
  };
  // Spots tried in an order of their own hashes, glades first, so a few
  // picked aren't all in the board's top rows.
  const spots = (key: number) => {
    const out: [number, number, number][] = [];
    each((cx, cy) => out.push([cx, cy, hash01(cx, cy, key) * (0.4 + thicket(cx + 0.5, cy + 0.5))]));
    return out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  };
  // A few lakes, each a cluster of discs, in the glades.
  for (const [cx, cy] of spots(420)) {
    if (lakes.length >= FOREST.lakes) break;
    const R = 2.2 + hash01(cx, cy, 421) * 2.6, x = cx + 0.5, y = cy + 0.5;
    const discs = [{ x, y, r: R }];
    for (let k = 0; k < 3; k++) {
      const a = hash01(cx, cy, k, 422) * Math.PI * 2, d = R * (0.5 + hash01(cx, cy, k, 423) * 0.4);
      discs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, r: R * (0.45 + hash01(cx, cy, k, 424) * 0.35) });
    }
    if (!discs.every((d) => clearOf(map, d.x, d.y, d.r + 0.6)) || discs.some((d) => inDiscs(keep, d.x, d.y, d.r + 6) || inDiscs(stones, d.x, d.y, d.r + 0.5))) continue;
    lakes.push({ discs, seed: hash(cx, cy, 425) });
    keep.push(...discs.map((d) => ({ ...d, r: d.r + 0.4 })));
  }
  // Rare meadows of long grass, half of them in flower.
  for (const [cx, cy] of spots(430)) {
    if (meadows.length >= FOREST.meadows) break;
    const r = 2 + hash01(cx, cy, 431) * 2.5, x = cx + 0.5, y = cy + 0.5;
    if (!clearOf(map, x, y, r * 0.6) || inDiscs(keep, x, y, r + 4) || inDiscs(stones, x, y, r * 0.5)) continue;
    meadows.push({ x, y, r, seed: hash(cx, cy, 432), flowers: hash01(cx, cy, 433) < 0.5 });
    keep.push({ x, y, r: r * 0.85 });
  }
  // Trees, huge to large, each keeping the ground under it.
  for (const size of [3, 2, 1] as const)
    each((cx, cy) => {
      if (hash01(cx, cy, 440 + size) >= FOREST.big[size] * (0.4 + thicket(cx + 0.5, cy + 0.5) * 1.6)) return;
      const kind: TreeKind = hash01(cx, cy, 444) < 0.55 ? "oak" : "pine";
      const variant = hash(cx, cy, 445) % VARIANTS, r = canopyRadius(kind, variant, size);
      const x = cx + 0.25 + hash01(cx, cy, 446) * 0.5, y = cy + 0.25 + hash01(cx, cy, 447) * 0.5;
      if (!clearOf(map, x, y, r) || inDiscs(keep, x, y, r * 0.6) || inDiscs(stones, x, y, r * 0.6)) return;
      trees.push({ id: 0, x, y, r, kind, size, variant, phase: hash01(cx, cy, 448) * Math.PI * 2 });
      keep.push({ x, y, r: r * 0.7 });
    });
  // Rocks and bare pads in the ground the trees leave.
  each((cx, cy) => {
    const x0 = cx + 0.5, y0 = cy + 0.5;
    if (inDiscs(keep, x0, y0) || inDiscs(stones, x0, y0)) return;
    const dense = thicket(x0, y0);
    if (hash01(cx, cy, 408) < FOREST.rock) {
      const size = 0.18 + hash01(cx, cy, 409) * 0.3, x = cx + 0.3 + hash01(cx, cy, 410) * 0.4, y = cy + 0.3 + hash01(cx, cy, 412) * 0.4;
      if (clearOf(map, x, y, size)) rocks.push({ x, y, size, seed: hash(cx, cy, 413) });
    }
    // Bare dirt pads, mostly in the glades.
    if (hash01(cx, cy, 414) < FOREST.pad * (1.6 - dense)) {
      const r = 0.7 + hash01(cx, cy, 415) * 1.3, x = cx + 0.5, y = cy + 0.5;
      if (clearOf(map, x, y, r * 0.6) && !inDiscs(keep, x, y, r * 0.5)) pads.push({ x, y, r, seed: hash(cx, cy, 416) });
    }
  });
  // Drawn back to front, so a canopy lower on the board stands over the one behind.
  trees.sort((a, b) => a.y - b.y || a.x - b.x);
  trees.forEach((t, i) => (t.id = i));
  return { trees, rocks, pads, lakes, meadows, boulders };
}

/** A tree blown up: where it stood, and the cause, for its debris. */
export type Felled = { tree: ForestTree; fromX: number; fromY: number; force: number };
/** The crater a felled tree leaves. */
export type Crater = { x: number; y: number; r: number; seed: number; size: TreeSize };

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
      return r >= TOUGH[t.size] && dx * dx + dy * dy < reach * reach;
    }, x, y, force);
  }

  /** A cut along the segment (x0, y0)-(x1, y1), `width` cells either side:
   * a valkyrie's charge or the Hero's dash. */
  cut(x0: number, y0: number, x1: number, y1: number, width: number): Felled[] {
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
    return this.fell(Math.min(x0, x1) - width, Math.min(y0, y1) - width, Math.max(x0, x1) + width, Math.max(y0, y1) + width, (t) => {
      const u = Math.max(0, Math.min(1, ((t.x - x0) * dx + (t.y - y0) * dy) / len2));
      const ex = x0 + dx * u - t.x, ey = y0 + dy * u - t.y, reach = width + t.r * 0.5;
      return t.size <= 1 && ex * ex + ey * ey < reach * reach;
    }, x0, y0, 0.8);
  }

  /** Fells the standing trees `hit` picks among those whose middle lies in
   * the box (cells), widened by half the largest canopy. */
  private fell(x0: number, y0: number, x1: number, y1: number, hit: (t: ForestTree) => boolean, fromX: number, fromY: number, force: number): Felled[] {
    const out: Felled[] = [];
    const cx0 = Math.max(0, Math.floor(x0 - 2)), cy0 = Math.max(0, Math.floor(y0 - 2));
    const cx1 = Math.min(CELLS_W - 1, Math.floor(x1 + 2)), cy1 = Math.min(CELLS_H - 1, Math.floor(y1 + 2));
    const near: ForestTree[] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) near.push(...(this.byCell.get(cellIndex(cx, cy)) ?? []));
    near.sort((a, b) => a.id - b.id);
    for (const t of near) {
      if (this.down[t.id] || !hit(t)) continue;
      this.down[t.id] = 1;
      this.craters.push({ x: t.x, y: t.y, r: t.size ? t.r * 1.25 + 0.4 : t.r * 1.8 + 0.3, seed: hash(t.id, 417), size: t.size });
      out.push({ tree: t, fromX, fromY, force });
    }
    if (out.length) this.version++;
    return out;
  }
}
