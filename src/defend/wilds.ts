/** The wilds: the country past the battlefield's edge, which no one enters.
 * The field is a square (`grid.ts`); zoomed all the way out it fills the
 * view along its tighter side, and the rest of the view (beside it on a
 * wide screen, above and below it on a tall one) shows the wilds, so the
 * view is never dark.
 *
 * They carry on the field's own ground, so the board's edge is no seam: in
 * Mossbound Ruins the forest's lawn (`lawnCell`), its trees (planned by the
 * forest's own rules, `thicket` and `FOREST.big`, thinning out from the
 * edge, swaying like the field's) and its waving grass (`planCell`, swayed
 * as `forest-grass.ts` sways it); elsewhere the area's flagstones
 * (`paintFloorTile`). Over that ground the forest's rocks (`rockSprite`)
 * scatter, then crowd, grow into boulders and close into the forest's small
 * mountains (`mountainOf`) farther out, in each area recoloured to its own
 * stone (red layered sandstone in the Amber Desert). Trees of the field
 * whose crowns reach past the board are finished out here too.
 *
 * Presentation only: nothing in the battle reads it, and its randomness is
 * a fixed hash. The still ground is painted once (per area, for the stone's
 * colours) at `ART` pixels a cell into a canvas reaching `MARGIN` cells past
 * every edge; the grass and the crowns are painted at most 30 times a
 * second into strips covering only what the view shows of the wilds. */

import type { AreaId } from "./areas.ts";
import { CELLS_H, CELLS_W, SUB, TILES_H, TILES_W, hash, hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { FOREST, VARIANTS, canopyRadius, hasForest, thicket, type ForestDamage, type ForestPlan, type ForestTree, type TreeKind, type TreeSize } from "./forest.ts";
import { darken, lawnCell, leanOf, mountainOf, outlinedSprite, rockSprite, stampInto, treeSprite, type Sprite } from "./forest-art.ts";
import { planCell } from "./forest-grass.ts";
import { CURVE, PALETTE32, SHADOW, WIND } from "./park-grass.ts";
import { paintFloorTile } from "./city-layer.ts";

/** Cells of wilds past each edge of the field: enough to fill an
 * ultra-wide or very tall view beside the square at its fit. */
export const MARGIN = 72;

/** The wilds' extent in art pixels, and where the board's corner sits in it. */
const GW = (CELLS_W + 2 * MARGIN) * ART, GH = (CELLS_H + 2 * MARGIN) * ART, OX = MARGIN * ART, OY = MARGIN * ART;
const BW = CELLS_W * ART, BH = CELLS_H * ART;

/** Cells from the field's edge to cell (cx, cy)'s middle (0 on the board). */
export function beyond(cx: number, cy: number) {
  const x = cx + 0.5, y = cy + 0.5;
  const dx = x < 0 ? -x : x > CELLS_W ? x - CELLS_W : 0, dy = y < 0 ? -y : y > CELLS_H ? y - CELLS_H : 0;
  return Math.sqrt(dx * dx + dy * dy);
}
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const onBoard = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < CELLS_W && cy < CELLS_H;

/** A stone: the forest's rock sprite at (x, y) cells, `size` cells across. */
export type WildRock = { x: number; y: number; size: number; seed: number };
/** A hill: the forest's small mountain over a heap of cells. */
export type WildHill = { cells: { x: number; y: number }[]; seed: number; y: number };
/** The wilds' layout, the same in every area: hills, rocks and (where the
 * area has a forest) trees, back to front. */
export type WildsPlan = { hills: WildHill[]; rocks: WildRock[]; trees: ForestTree[] };

let planned: WildsPlan | null = null;

/** Lays the wilds out, once (in cells, eight a tile): hills rising from
 * about a tile and a half out, more and bigger until they close over
 * everything some six tiles out; rocks scattered from the field's edge,
 * more and bigger the farther out; trees by the forest's own rules,
 * thinning out from two tiles to six. */
export function wildsPlan(): WildsPlan {
  if (planned) return planned;
  const N = CELLS_W + 2 * MARGIN, M = CELLS_H + 2 * MARGIN;
  const taken = new Uint8Array(N * M), at = (cx: number, cy: number) => (cy + MARGIN) * N + cx + MARGIN;
  const inside = (cx: number, cy: number) => cx >= -MARGIN && cy >= -MARGIN && cx < CELLS_W + MARGIN && cy < CELLS_H + MARGIN;
  // Hills on a jittered grid, bigger the farther out.
  const hills: WildHill[] = [], S = 6;
  for (let gy = -Math.ceil(MARGIN / S) - 1; gy * S < CELLS_H + MARGIN + S; gy++)
    for (let gx = -Math.ceil(MARGIN / S) - 1; gx * S < CELLS_W + MARGIN + S; gx++) {
      const x = gx * S + hash01(gx, gy, 701) * S, y = gy * S + hash01(gx, gy, 702) * S;
      const d = beyond(Math.floor(x), Math.floor(y));
      if (d < 12 || hash01(gx, gy, 703) > 0.12 + 0.88 * smooth(14, 50, d)) continue;
      const R = Math.min(12, 2 + (d - 12) * 0.22) * (0.75 + hash01(gx, gy, 704) * 0.5), ph = hash01(gx, gy, 705) * 6.28;
      const cells: { x: number; y: number }[] = [];
      for (let cy = Math.floor(y - R * 1.3); cy <= y + R * 1.3; cy++)
        for (let cx = Math.floor(x - R * 1.3); cx <= x + R * 1.3; cx++) {
          if (!inside(cx, cy) || beyond(cx, cy) < 8) continue;
          const dx = cx + 0.5 - x, dy = cy + 0.5 - y, a = Math.atan2(dy, dx);
          const rim = R * (1 + 0.22 * Math.sin(a * 3 + ph) + 0.1 * Math.sin(a * 5 - ph * 2));
          if (dx * dx + dy * dy < rim * rim) cells.push({ x: cx, y: cy });
        }
      if (cells.length < 4) continue;
      for (const c of cells) taken[at(c.x, c.y)] = 1;
      hills.push({ cells, seed: hash(gx, gy, 706) % 100000, y: y + R });
    }
  hills.sort((a, b) => a.y - b.y);
  // Rocks in the open between them.
  const rocks: WildRock[] = [];
  for (let cy = -MARGIN; cy < CELLS_H + MARGIN; cy++)
    for (let cx = -MARGIN; cx < CELLS_W + MARGIN; cx++) {
      if (onBoard(cx, cy) || taken[at(cx, cy)]) continue;
      const d = beyond(cx, cy);
      if (hash01(cx, cy, 711) >= FOREST.rock + 0.25 * smooth(8, 50, d)) continue;
      const grow = smooth(6, 44, d), size = 0.18 + hash01(cx, cy, 712) * 0.3 + grow * hash01(cx, cy, 713) * 1.7;
      rocks.push({ x: cx + 0.3 + hash01(cx, cy, 714) * 0.4, y: cy + 0.3 + hash01(cx, cy, 715) * 0.4, size: Math.round(size * 8) / 8, seed: hash(cx, cy, 716) % 64 });
      if (size > 0.9) taken[at(cx, cy)] = 1;
    }
  rocks.sort((a, b) => a.y - b.y);
  // Trees as the forest plants them, thinning out from the edge.
  const trees: ForestTree[] = [], keep: { x: number; y: number; r: number }[] = [];
  const clear = (x: number, y: number, r: number) => {
    for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++)
      for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) if (onBoard(cx, cy) || !inside(cx, cy) || taken[at(cx, cy)]) return false;
    return !keep.some((k) => (x - k.x) ** 2 + (y - k.y) ** 2 < (k.r + r * 0.6) ** 2);
  };
  for (const size of [3, 2, 1] as const)
    for (let cy = -MARGIN; cy < CELLS_H + MARGIN; cy++)
      for (let cx = -MARGIN; cx < CELLS_W + MARGIN; cx++) {
        const d = beyond(cx, cy);
        if (d === 0 || d > 48) continue;
        const fade = 1 - smooth(18, 48, d);
        if (hash01(cx, cy, 440 + size) >= FOREST.big[size] * (0.4 + thicket(cx + 0.5, cy + 0.5) * 1.6) * fade) continue;
        const kind: TreeKind = hash01(cx, cy, 444) < 0.55 ? "oak" : "pine";
        const variant = hash(cx, cy, 445) % VARIANTS, r = canopyRadius(kind, variant, size as TreeSize);
        const x = cx + 0.25 + hash01(cx, cy, 446) * 0.5, y = cy + 0.25 + hash01(cx, cy, 447) * 0.5;
        if (!clear(x, y, r)) continue;
        trees.push({ id: 0, x, y, r, kind, size, variant, phase: hash01(cx, cy, 448) * Math.PI * 2 });
        keep.push({ x, y, r: r * 0.7 });
      }
  trees.sort((a, b) => a.y - b.y || a.x - b.x);
  trees.forEach((t, i) => (t.id = i));
  return (planned = { hills, rocks, trees });
}

/** An area's stone, dark to light, and the tint on its gentlest slopes
 * (moss, snow, dust), for recolouring the forest's grey; `strata` darkens
 * horizontal bands, as in layered sandstone. */
type Stone = { ramp: number[]; top: number[]; strata?: number };
const STONES: Partial<Record<AreaId, Stone>> = {
  desert: { ramp: [0x5a2410, 0x7c3518, 0xa04a22, 0xbd5f2e, 0xd77b42, 0xeb9d60], top: [0xc9884c, 0xe0a868], strata: 0.16 },
  drowned: { ramp: [0x1a2230, 0x263244, 0x34445c, 0x465a76, 0x5d7594, 0x7d95b2], top: [0x3d6f86, 0x5fa3bd] },
  ember: { ramp: [0x1c1515, 0x2a2121, 0x3a2e2d, 0x4d3d3b, 0x63504c, 0x7d6560], top: [0x8a3b1e, 0xc4602a] },
  fungal: { ramp: [0x2c1f28, 0x3e2c38, 0x52394a, 0x684a5e, 0x815e75, 0x9c7790], top: [0x8a4f76, 0xb06e98] },
  frozen: { ramp: [0x3a5268, 0x4d6a84, 0x6886a0, 0x86a6bf, 0xa9c6db, 0xcde2ef], top: [0xdcecf6, 0xf4fbff] },
  crystal: { ramp: [0x241a33, 0x33264a, 0x45345f, 0x5a4478, 0x725894, 0x9076b4], top: [0x8f62c2, 0xbf96e8] },
  obsidian: { ramp: [0x0e0b0e, 0x181418, 0x231d22, 0x30282e, 0x40363d, 0x54484f], top: [0x3d2f3a, 0x55434f] },
  astral: { ramp: [0x3e3a30, 0x544e40, 0x6d6652, 0x878067, 0xa49c80, 0xc4bc9c], top: [0x5d6c96, 0x8697c4] },
  nadir: { ramp: [0x120f19, 0x1b1625, 0x251e33, 0x312842, 0x3f3455, 0x51446c], top: [0x3a2c55, 0x52407a] },
  magic: { ramp: [0x2e3a3a, 0x3e4e4e, 0x506565, 0x667e7c, 0x80999a, 0x9db8b4], top: [0x3f8a5c, 0x63b27e] },
};

/** Recolours the forest's grey stone and moss in `px` to `stone` (outlines
 * and shadows kept); strata by art row `Y` (relative). */
function recolour(px: Uint32Array, w: number, stone: Stone) {
  for (let i = 0; i < px.length; i++) {
    const p = px[i], a = p >>> 24;
    if (a < 255) continue;
    const r = p & 0xff, g = (p >> 8) & 0xff, b = (p >> 16) & 0xff, lum = 0.3 * r + 0.55 * g + 0.15 * b;
    if (lum < 22) continue;
    const mossy = g > r + 14 && g > b + 14;
    let c = mossy ? stone.top[lum > 90 ? 1 : 0] : stone.ramp[Math.max(0, Math.min(5, Math.round(((lum - 34) / 130) * 5)))];
    if (stone.strata && !mossy) {
      const Y = Math.floor(i / w), band = Math.floor(Y / 3) % 5;
      if (band === 0 || (band === 3 && ((i % w) + Y) % 2)) c = shadeHex(c, 1 - stone.strata);
    }
    px[i] = ((255 << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
  }
}
const shadeHex = (c: number, k: number) => (Math.round(((c >> 16) & 0xff) * k) << 16) | (Math.round(((c >> 8) & 0xff) * k) << 8) | Math.round((c & 0xff) * k);

/** The wilds' still ground in art pixels over the whole extent: in the
 * forest its lawn, else clear (the flagstones are drawn under it); then
 * rocks and hills with their shadows, and in the forest the trees'
 * shadows. `turf` marks the lawn pixels left (where blades grow), `shaded`
 * those under a tree's shadow. */
export function paintWilds(forest: boolean, stone?: Stone) {
  const out = new Uint32Array(GW * GH), plan = wildsPlan();
  if (forest)
    for (let cy = -MARGIN; cy < CELLS_H + MARGIN; cy++)
      for (let cx = -MARGIN; cx < CELLS_W + MARGIN; cx++) {
        if (onBoard(cx, cy)) continue;
        lawnCell(cx, cy, (X, Y, c) => {
          X += OX; Y += OY;
          if (X >= 0 && Y >= 0 && X < GW && Y < GH) out[Y * GW + X] = c;
        });
      }
  const lawn = forest ? out.slice() : null;
  // Rocks and hills, back to front, each with its shadow down and right.
  const items: { y: number; draw: () => void }[] = [];
  for (const r of plan.rocks)
    items.push({ y: r.y, draw: () => {
      const s = rockSprite(r.size, r.seed), x0 = Math.round(r.x * ART) - s.ox + OX, y0 = Math.round(r.y * ART) - s.oy + OY;
      stampInto(out, GW, GH, s, x0 + (r.size > 1 ? 2 : 1), y0 + (r.size > 1 ? 2 : 1), true);
      stampInto(out, GW, GH, s, x0, y0, false);
    } });
  for (const h of plan.hills)
    items.push({ y: h.y, draw: () => {
      const s = mountainOf(h.cells, h.seed), X0 = s.x + OX, Y0 = s.y + OY;
      for (let y = 0; y < s.h; y++)
        for (let x = 0; x < s.w; x++) {
          if (!s.px[y * s.w + x]) continue;
          for (const k of [2, 4]) {
            const sx = x + k, sy = y + k, X = X0 + sx, Y = Y0 + sy;
            if ((sx < s.w && sy < s.h && s.px[sy * s.w + sx]) || X < 0 || Y < 0 || X >= GW || Y >= GH || (k === 4 && (X + Y) & 1)) continue;
            out[Y * GW + X] = darken(out[Y * GW + X]);
          }
        }
      stampInto(out, GW, GH, s, X0, Y0, false);
      for (const g of s.crags) {
        const sp = rockSprite(Math.round((0.9 + Math.min(1.2, g.deep / 14) + hash01(g.seed, 515) * 0.3) * 4) / 4, g.seed % 64);
        const gx = Math.round(g.x * ART) - sp.ox + OX, gy = Math.round(g.y * ART) - sp.oy + OY;
        stampInto(out, GW, GH, sp, gx + 2, gy + 2, true);
        stampInto(out, GW, GH, sp, gx, gy, false);
      }
    } });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  if (stone) recolour(out, GW, stone);
  const turf = new Uint8Array(GW * GH), shaded = new Uint8Array(GW * GH);
  if (lawn) {
    for (let i = 0; i < out.length; i++) turf[i] = out[i] !== 0 && out[i] === lawn[i] ? 1 : 0;
    // The trees' shadows, as the forest casts them.
    for (const t of plan.trees) {
      const s = outlinedSprite(treeSprite(t.kind, t.variant, 0, t.size)), R = t.r * ART;
      const x0 = Math.round(t.x * ART) - s.ox + Math.round(R * 0.35) + 1 + OX, y0 = Math.round(t.y * ART) - s.oy + Math.round(R * 0.5) + 1 + OY;
      for (let y = 0; y < s.h; y++)
        for (let x = 0; x < s.w; x++) {
          if (!s.px[y * s.w + x]) continue;
          const X = x0 + x, Y = y0 + y, i = Y * GW + X;
          if (X < 0 || Y < 0 || X >= GW || Y >= GH || shaded[i] || (X >= OX && Y >= OY && X < OX + BW && Y < OY + BH)) continue;
          shaded[i] = 1;
          out[i] = darken(out[i]);
        }
    }
  }
  return { px: out, turf, shaded };
}

/** The waving blades of the wilds' lawn, as flat arrays: each blade's root
 * (art pixels, wilds coordinates), height, colour and splay, and the parts
 * of its sway that don't change with time (as `forest-grass.ts`'s
 * `Swaying`), bucketed by cell row and column for the strips in view. */
type Blades = { gx: Int16Array; gy: Int16Array; h: Uint8Array; color: Uint8Array; splay: Float32Array; s1: Float32Array; c1: Float32Array; s2: Float32Array; c2: Float32Array; s3: Float32Array; c3: Float32Array; start: Int32Array };

function planBlades(turf: Uint8Array, plan: WildsPlan): Blades {
  const N = CELLS_W + 2 * MARGIN, M = CELLS_H + 2 * MARGIN;
  const crowns: { x: number; y: number; r: number }[][] = Array.from({ length: N * M }, () => []);
  for (const t of plan.trees) {
    const r = t.r * 0.85;
    for (let cy = Math.floor(t.y - r); cy <= Math.floor(t.y + r); cy++)
      for (let cx = Math.floor(t.x - r); cx <= Math.floor(t.x + r); cx++)
        if (cx >= -MARGIN && cy >= -MARGIN && cx < CELLS_W + MARGIN && cy < CELLS_H + MARGIN) crowns[(cy + MARGIN) * N + cx + MARGIN].push({ x: t.x, y: t.y, r });
  }
  const list: number[][] = [];
  const start = new Int32Array(N * M + 1);
  let n = 0;
  for (let cy = -MARGIN; cy < CELLS_H + MARGIN; cy++)
    for (let cx = -MARGIN; cx < CELLS_W + MARGIN; cx++) {
      const k = (cy + MARGIN) * N + cx + MARGIN;
      start[k] = n;
      if (onBoard(cx, cy) || beyond(cx, cy) > 64) continue;
      const blades = planCell(cx, cy, (x, y) => {
        const X = Math.floor(x * ART) + OX, Y = Math.floor(y * ART) + OY;
        if (X < 0 || Y < 0 || X >= GW || Y >= GH || !turf[Y * GW + X]) return -2;
        return crowns[k].some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r) ? -2 : -1;
      });
      for (const b of blades) {
        const gx = (cx + MARGIN) * ART + b.i, gy = (cy + MARGIN) * ART + b.j;
        list.push([gx, gy, b.h, b.color, b.splay, b.phase]);
        n++;
      }
    }
  start[N * M] = n;
  const o: Blades = {
    gx: new Int16Array(n), gy: new Int16Array(n), h: new Uint8Array(n), color: new Uint8Array(n), splay: new Float32Array(n),
    s1: new Float32Array(n), c1: new Float32Array(n), s2: new Float32Array(n), c2: new Float32Array(n), s3: new Float32Array(n), c3: new Float32Array(n), start,
  };
  list.forEach(([gx, gy, h, color, splay, phase], k) => {
    // As the forest's: its sway's phase from its root on the board's grid.
    const bx = gx - OX, by = gy - OY, a1 = phase + bx * 0.06, a2 = phase * 2, a3 = bx * 0.021 + by * 0.009;
    o.gx[k] = gx, o.gy[k] = gy, o.h[k] = h, o.color[k] = color, o.splay[k] = splay;
    o.s1[k] = Math.sin(a1), o.c1[k] = Math.cos(a1), o.s2[k] = Math.sin(a2), o.c2[k] = Math.cos(a2), o.s3[k] = Math.sin(a3), o.c3[k] = Math.cos(a3);
  });
  return o;
}

/** A sprite's rows as runs of solid pixels (row, first, past-last). */
const runCache = new WeakMap<Sprite, Int16Array>();
function runs(s: Sprite) {
  let r = runCache.get(s);
  if (r) return r;
  const out: number[] = [];
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      if (!s.px[y * s.w + x]) continue;
      let e = x;
      while (e < s.w && s.px[y * s.w + e]) e++;
      out.push(y, x, e);
      x = e;
    }
  runCache.set(s, (r = Int16Array.from(out)));
  return r;
}

/** A box of art pixels in wilds coordinates, `x1`/`y1` exclusive. */
type Box = { x0: number; y0: number; x1: number; y1: number };
type Strip = { box: Box; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; px: Uint32Array };

/** What a frame of the wilds needs from the battle. */
export type WildsFrame = {
  area: AreaId; px: number; cam: { s: number; x: number; y: number }; night: number; now: number;
  /** The grass's wind (`park-grass.ts`) and the trees' (as the forest's crowns lean). */
  grassWind: keyof typeof WIND; treeWind: number; reduceMotion: boolean; effects: boolean;
  /** The field's forest, whose crowns past the board's edge are finished here. */
  forest?: { plan: ForestPlan; damage: ForestDamage | null } | null;
};

/** Draws the wilds, kept by the renderer. */
export class Wilds {
  private grounds = new Map<string, { canvas: HTMLCanvasElement; turf: Uint8Array; shaded: Uint8Array }>();
  private blades: Blades | null = null;
  private strips: Strip[] = [];
  private builtAt = -Infinity;
  private builtKey = "";
  /** The field's trees whose crowns reach past the board, by plan. */
  private overhang = new WeakMap<ForestPlan, ForestTree[]>();

  private ground(forest: boolean, area: AreaId) {
    const key = forest ? "forest" : area;
    let g = this.grounds.get(key);
    if (g) return g;
    const painted = paintWilds(forest, forest ? undefined : STONES[area]);
    const canvas = document.createElement("canvas");
    canvas.width = GW;
    canvas.height = GH;
    const ctx = canvas.getContext("2d")!, img = ctx.createImageData(GW, GH);
    new Uint32Array(img.data.buffer).set(painted.px);
    ctx.putImageData(img, 0, 0);
    g = { canvas, turf: painted.turf, shaded: painted.shaded };
    this.grounds.set(key, g);
    return g;
  }

  draw(ctx: CanvasRenderingContext2D, f: WildsFrame) {
    if (typeof document === "undefined") return;
    const forest = hasForest(f.area), k = (f.px * f.cam.s) / ART, cw = ctx.canvas.width, ch = ctx.canvas.height;
    // The wilds in view, in art pixels (wilds coordinates).
    const view: Box = {
      x0: Math.max(0, Math.floor(-f.cam.x / k) + OX), y0: Math.max(0, Math.floor(-f.cam.y / k) + OY),
      x1: Math.min(GW, Math.ceil((cw - f.cam.x) / k) + OX), y1: Math.min(GH, Math.ceil((ch - f.cam.y) / k) + OY),
    };
    if (view.x0 >= OX && view.y0 >= OY && view.x1 <= OX + BW && view.y1 <= OY + BH) return;
    const toX = (X: number) => f.cam.x + (X - OX) * k, toY = (Y: number) => f.cam.y + (Y - OY) * k;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (!forest) this.floor(ctx, f, view, toX, toY, k);
    const g = this.ground(forest, f.area);
    const blit = (src: CanvasImageSource, b: Box, sx = b.x0, sy = b.y0) => {
      const x = Math.round(toX(b.x0)), y = Math.round(toY(b.y0));
      ctx.drawImage(src, sx, sy, b.x1 - b.x0, b.y1 - b.y0, x, y, Math.round(toX(b.x1)) - x, Math.round(toY(b.y1)) - y);
    };
    blit(g.canvas, view);
    if (forest && f.effects) this.life(ctx, f, g, view, blit);
    if (f.night > 0.001) {
      ctx.fillStyle = `rgba(6,8,18,${Math.min(0.82, f.night * 0.78).toFixed(3)})`;
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.restore();
  }

  /** The area's flagstones past the board, tile by tile, under the stone. */
  private floor(ctx: CanvasRenderingContext2D, f: WildsFrame, view: Box, toX: (X: number) => number, toY: (Y: number) => number, k: number) {
    const T = SUB * ART;
    for (let ty = Math.floor((view.y0 - OY) / T); ty * T < view.y1 - OY; ty++)
      for (let tx = Math.floor((view.x0 - OX) / T); tx * T < view.x1 - OX; tx++) {
        if (tx >= 0 && ty >= 0 && tx < TILES_W && ty < TILES_H) continue;
        const x = Math.round(toX(tx * T + OX)), y = Math.round(toY(ty * T + OY)), w = Math.round(toX((tx + 1) * T + OX)) - x, h = Math.round(toY((ty + 1) * T + OY)) - y;
        ctx.fillStyle = "#17181b";
        ctx.fillRect(x, y, w, h);
        paintFloorTile(ctx, f.area, tx, ty, x, y, w, h);
      }
    if (f.area === "nadir") {
      ctx.fillStyle = "rgba(17,8,32,0.48)";
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    void k;
  }

  /** The forest's waving grass and swaying crowns over the wilds in view,
   * painted into strips round the board at most 30 times a second. */
  private life(ctx: CanvasRenderingContext2D, f: WildsFrame, g: { turf: Uint8Array; shaded: Uint8Array }, view: Box, blit: (src: CanvasImageSource, b: Box, sx?: number, sy?: number) => void) {
    this.blades ??= planBlades(g.turf, wildsPlan());
    // The view less the board: above, below, left and right of it.
    const boxes: Box[] = [
      { x0: view.x0, y0: view.y0, x1: view.x1, y1: Math.min(view.y1, OY) },
      { x0: view.x0, y0: Math.max(view.y0, OY + BH), x1: view.x1, y1: view.y1 },
      { x0: view.x0, y0: Math.max(view.y0, OY), x1: Math.min(view.x1, OX), y1: Math.min(view.y1, OY + BH) },
      { x0: Math.max(view.x0, OX + BW), y0: Math.max(view.y0, OY), x1: view.x1, y1: Math.min(view.y1, OY + BH) },
    ].filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
    const key = boxes.map((b) => `${b.x0},${b.y0},${b.x1},${b.y1}`).join(";") + (f.forest?.plan ? "f" : "");
    const due = f.reduceMotion ? f.now - this.builtAt >= 500 : f.now - this.builtAt >= 1000 / 30;
    if (key !== this.builtKey || due) {
      this.builtAt = f.now;
      this.builtKey = key;
      this.strips = boxes.map((b, i) => this.strip(i, b));
      const t = f.reduceMotion ? 0 : f.now / 1000;
      for (const s of this.strips) {
        s.px.fill(0);
        this.paintBlades(s, g.shaded, t, WIND[f.grassWind]);
        this.paintCrowns(s, f, t);
        s.ctx.putImageData(s.img, 0, 0);
      }
    }
    for (const s of this.strips) blit(s.canvas, s.box, 0, 0);
  }

  private strip(i: number, box: Box): Strip {
    const w = box.x1 - box.x0, h = box.y1 - box.y0, old = this.strips[i];
    if (old && old.img.width === w && old.img.height === h) return { ...old, box };
    const canvas = old?.canvas ?? document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!, img = ctx.createImageData(w, h);
    return { box, canvas, ctx, img, px: new Uint32Array(img.data.buffer) };
  }

  /** As `ForestGrass.paint`, with no one walking through. */
  private paintBlades(s: Strip, shaded: Uint8Array, t: number, wind: number) {
    const b = this.blades!, N = CELLS_W + 2 * MARGIN, { box, px } = s, w = box.x1 - box.x0;
    const S1 = Math.sin(t * 2.1), C1 = Math.cos(t * 2.1), S2 = Math.sin(t * 3.7), C2 = Math.cos(t * 3.7), S3 = Math.sin(-t * 1.6), C3 = Math.cos(-t * 1.6);
    const cx0 = Math.max(0, Math.floor(box.x0 / ART) - 1), cx1 = Math.min(N - 1, Math.floor((box.x1 - 1) / ART) + 1);
    const cy0 = Math.max(0, Math.floor(box.y0 / ART)), cy1 = Math.min(CELLS_H + 2 * MARGIN - 1, Math.floor((box.y1 - 1) / ART) + 1);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let k = b.start[cy * N + cx0], e = b.start[cy * N + cx1 + 1]; k < e; k++) {
        const gx = b.gx[k], gy = b.gy[k];
        if (gy - b.h[k] + 1 >= box.y1 || gy < box.y0) continue;
        const shade = shaded[gy * GW + gx] ? SHADOW : 0;
        const sway = (b.s1[k] * C1 + b.c1[k] * S1) * 0.5 + (b.s2[k] * C2 + b.c2[k] * S2) * 0.2;
        const band = b.s3[k] * C3 + b.c3[k] * S3, gust = band > 0 ? band * band * band * 1.6 : 0;
        const lean = b.splay[k] + wind * (0.35 + sway * 0.45 + gust);
        const h = b.h[k], curve = CURVE[h], color = b.color[k];
        let lastX = gx, start = 0;
        for (let q = 1; q <= h; q++) {
          const bx = q === h ? -1 : gx + Math.round(lean * curve[q]);
          if (q !== h && bx === lastX) continue;
          if (lastX >= box.x0 && lastX < box.x1) {
            const colour = PALETTE32[shade + (start === 0 ? color % 2 : q >= h - 1 ? color + 2 : color + 1)];
            for (let y = Math.max(box.y0, gy - q + 1), end = Math.min(box.y1, gy - start + 1); y < end; y++) px[(y - box.y0) * w + lastX - box.x0] = colour;
          }
          start = q;
          lastX = bx;
        }
      }
  }

  /** The wilds' trees, and the field's whose crowns reach past the board,
   * leaning as the forest's do. */
  private paintCrowns(s: Strip, f: WildsFrame, t: number) {
    const { box, px } = s, w = box.x1 - box.x0;
    const draw = (tree: ForestTree) => {
      const sp = outlinedSprite(treeSprite(tree.kind, tree.variant, leanOf(tree, t, f.treeWind), tree.size)), r = runs(sp);
      const sx = Math.round(tree.x * ART) - sp.ox + OX, sy = Math.round(tree.y * ART) - sp.oy + OY;
      if (sx >= box.x1 || sy >= box.y1 || sx + sp.w <= box.x0 || sy + sp.h <= box.y0) return;
      for (let q = 0; q < r.length; q += 3) {
        const Y = sy + r[q];
        if (Y < box.y0 || Y >= box.y1) continue;
        const row = r[q] * sp.w, xa = Math.max(r[q + 1], box.x0 - sx), xb = Math.min(r[q + 2], box.x1 - sx), at = (Y - box.y0) * w + sx - box.x0;
        for (let x = xa; x < xb; x++) px[at + x] = sp.px[row + x];
      }
    };
    const field = f.forest?.plan;
    if (field) {
      let reach = this.overhang.get(field);
      if (!reach) {
        reach = field.trees.filter((tr) => tr.x - tr.r * 1.4 < 0 || tr.y - tr.r * 1.4 < 0 || tr.x + tr.r * 1.4 > CELLS_W || tr.y + tr.r * 1.4 > CELLS_H);
        this.overhang.set(field, reach);
      }
      const damage = f.forest!.damage;
      for (const tr of reach) if (!damage || damage.standing(tr)) draw(tr);
    }
    for (const tr of wildsPlan().trees) draw(tr);
  }
}
