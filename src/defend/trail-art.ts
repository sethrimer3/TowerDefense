/** The worn monster trails (`trails.ts`) as pixel art, `ART` pixels a cell.
 *
 * - **Forest trails** are painted into the forest's own floor (`paintRoads`,
 *   from `forest-art.ts`'s `paintFloor`): bare trodden earth down the middle
 *   giving way to grass in an uneven, blotchy gradient (`roadPixel`). The
 *   live grass keeps off the dirt, as it does off any dirt.
 * - **Sand trails** are carved out of the Amber Desert's dunes
 *   (`sandTrailCanvases`): `cut` takes the sand away so the flagstones
 *   beneath show, thinning out over the edge in a dither; `banks` is the sand
 *   sloping down into the trail either side, lit or shaded by which way it
 *   faces the sun, with grains blown back over the tiles and the trail's
 *   sandstone rocks.
 *
 * Both read the same distance map (`trailField`): for each art pixel, how far
 * it lies from the nearest trail's middle as a share of that trail's half
 * width, and that trail's wear. */
import { CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { ART } from "./art-scale.ts";
import { segmentDistance, type TrailLine, type TrailPlan } from "./trails.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { rgba } from "./damage-art.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;
/** How far past a trail's half width (as a share of it) its ragged edge may reach. */
const FRINGE = 1.25;
/** How many half widths off a trail's middle its distance map reaches. */
export const FIELD_REACH = 9.1;

/** Each art pixel's distance from the nearest trail's middle as a share of
 * its half width (`t`, Infinity far from any), and that trail's wear. */
export type TrailField = { t: Float32Array; level: Float32Array };
const fields = new WeakMap<TrailPlan, TrailField>();

/** `plan`'s distance map, made on first use. */
export function trailField(plan: TrailPlan): TrailField {
  let f = fields.get(plan);
  if (f) return f;
  fields.set(plan, (f = distanceField(plan.lines, W, H, 0, 0)));
  return f;
}

/** `trailField` for any lines over a `w` by `h` art pixel box whose corner
 * lies (`ox`, `oy`) art pixels before the board's. */
function distanceField(lines: readonly TrailLine[], w: number, h: number, ox: number, oy: number): TrailField {
  const t = new Float32Array(w * h).fill(Infinity), level = new Float32Array(w * h);
  for (const line of lines) {
    // Far enough out for the dunes' run down to the trail (`TAPER` in atmosphere-art.ts).
    const R = line.half * ART, reach = R * FIELD_REACH + 1;
    const pts = line.points.map((p) => ({ x: p.x * ART + ox, y: p.y * ART + oy }));
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach)), x1 = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x) + reach));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach)), y1 = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y) + reach));
      for (let Y = y0; Y <= y1; Y++)
        for (let X = x0; X <= x1; X++) {
          const i = Y * w + X, v = segmentDistance(X + 0.5, Y + 0.5, a, b) / R;
          if (v < t[i]) (t[i] = v), (level[i] = line.level);
        }
    }
  }
  return { t, level };
}

/** A trail's ragged edge at art pixel (X, Y): about 1, wavering slowly along
 * it and a pixel in and out. */
const edgeAt = (X: number, Y: number, seed: number) =>
  0.92 + 0.1 * Math.sin(X * 0.21 + Y * 0.17 + seed) + 0.06 * Math.sin(X * 0.07 - Y * 0.11 + seed * 2) + (hash01(X, Y, seed, 920) - 0.5) * 0.12;

/** Dirt for the trails, dark trodden earth to dry and dusty, and the
 * grassy earth where the grass is taking it back. */
const ROAD = [0x4c3e2f, 0x5a4937, 0x67543e, 0x735f46, 0x806b50];
const GRASSY = [0x55532f, 0x5d5a34];
const STONES = [0x8a7a62, 0x3a3026];

/** Paints the trails into the forest floor `out` (`W × H`) within the box,
 * on the open cells only. */
export function paintRoads(out: Uint32Array, plan: TrailPlan, open: Uint8Array, box: { x0: number; y0: number; x1: number; y1: number }) {
  const { t } = trailField(plan);
  for (let Y = box.y0; Y < box.y1; Y++)
    for (let X = box.x0, i = Y * W + X; X < box.x1; X++, i++) {
      if (t[i] > FRINGE || !open[cellIndex(Math.floor(X / ART), Math.floor(Y / ART))]) continue;
      const c = roadPixel(t[i], X, Y);
      if (c) out[i] = c;
    }
}

/** Blotchy noise, 0..1, about `s` art pixels across. */
const blotch = (X: number, Y: number, s: number, salt: number) => {
  const gx = X / s, gy = Y / s, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const v = (a: number, b: number) => hash01(a, b, salt);
  const top = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * fx, bottom = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * fx;
  return top + (bottom - top) * fy;
};

/** A trail's pixel at board art pixel (X, Y), `v` of its half width from its
 * middle: bare trodden earth down the middle, giving way to grass in an
 * uneven, blotchy gradient toward the edge (grassy earth, then more and
 * more grass), or 0 where the grass shows. The wilds (`wilds.ts`) carry the
 * trails on past the board with it. */
export function roadPixel(v: number, X: number, Y: number): number {
  if (v > FRINGE) return 0;
  const u = v / edgeAt(X, Y, 3);
  if (u >= 1.05) return 0;
  // How bare the ground is: all dirt in the middle, none past the edge, the
  // line between wandering in blotches.
  const bare = Math.max(0, Math.min(1, (1 - u) / 0.55 + (blotch(X, Y, 5, 922) - 0.5) * 0.7));
  const h = hash(X, Y, 921), r = hash01(X, Y, 924);
  if (r >= bare) return 0;
  // A few tufts survive even in the middle.
  if (u < 0.5 && h % 37 === 0) return 0;
  if (bare - r < 0.18) return rgba(GRASSY[h & 1]);
  // Trodden darker down the middle, dustier toward the sides.
  const worn = 1 - u + (blotch(X, Y, 3, 925) - 0.5) * 0.5;
  let c = ROAD[Math.max(0, Math.min(4, Math.round(4 - worn * 3.2 + (h % 3) - 1)))];
  if (h % 53 === 0) c = STONES[0];
  else if (h % 53 === 1) c = STONES[1];
  return rgba(c);
}

/** As `paintRoads`, for lines (cells, `half` wide) into any `ow × oh` buffer
 * whose board corner is at (ox, oy) art pixels; `keep` says which pixels
 * the road may cover. The pixels it covered. */
export function paintRoadLines(out: Uint32Array, ow: number, oh: number, ox: number, oy: number, lines: readonly { points: readonly { x: number; y: number }[]; half: number }[], keep: (i: number) => boolean): number[] {
  const t = new Map<number, number>();
  for (const line of lines) {
    // Far enough out for the dunes' run down to the trail (`TAPER` in atmosphere-art.ts).
    const R = line.half * ART, reach = R * FIELD_REACH + 1;
    const pts = line.points.map((p) => ({ x: p.x * ART + ox, y: p.y * ART + oy }));
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      for (let Y = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach)); Y <= Math.min(oh - 1, Math.ceil(Math.max(a.y, b.y) + reach)); Y++)
        for (let X = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach)); X <= Math.min(ow - 1, Math.ceil(Math.max(a.x, b.x) + reach)); X++) {
          const i = Y * ow + X, v = segmentDistance(X + 0.5, Y + 0.5, a, b) / R;
          if (v < (t.get(i) ?? FRINGE)) t.set(i, v);
        }
    }
  }
  const covered: number[] = [];
  for (const [i, v] of t) {
    if (!keep(i)) continue;
    const c = roadPixel(v, (i % ow) - ox, Math.floor(i / ow) - oy);
    if (c) (out[i] = c), covered.push(i);
  }
  return covered;
}

const cuts = new WeakMap<TrailPlan, { cut: HTMLCanvasElement; banks: HTMLCanvasElement }>();
const ids = new WeakMap<TrailPlan, number>();
let nextId = 1;
/** A number for each plan, for caches keyed on which trails they drew. */
export function trailId(plan: TrailPlan) {
  let id = ids.get(plan);
  if (!id) ids.set(plan, (id = nextId++));
  return id;
}

/** The desert trails' two images, made once for each plan: `cut`, the
 * sand to take out of the dunes (alpha), so the old flagstones beneath show
 * along the trail, the sand thinning over them at its edges; and `banks`,
 * the sand sloping down into the trail either side, lit and shaded by the
 * sun from the upper left, with the trail's rocks. */
export function sandTrailCanvases(plan: TrailPlan, map: CityMap) {
  let c = cuts.get(plan);
  if (c) return c;
  const make = (fill: (d: Uint8ClampedArray) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!, image = ctx.createImageData(W, H);
    fill(image.data);
    ctx.putImageData(image, 0, 0);
    return canvas;
  };
  c = { cut: make((d) => sandCutPixels(plan, map, d)), banks: make((d) => sandBankPixels(plan, map, d)) };
  cuts.set(plan, c);
  return c;
}

/** How much sand the trail takes off art pixel (X, Y), 0..1: all of it down
 * the middle, thinning out over the edge in a dither. */
function carved(v: number, X: number, Y: number) {
  const u = v / edgeAt(X, Y, 5);
  const k = Math.max(0, Math.min(1, (0.95 - u) / 0.35 + (blotch(X, Y, 6, 926) - 0.5) * 0.4));
  return k >= 1 ? 1 : k <= 0 ? 0 : k > BAYER[(Y & 3) * 4 + (X & 3)] ? 1 : 0;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);
const open = (map: CityMap, X: number, Y: number) => map.type[cellIndex(Math.floor(X / ART), Math.floor(Y / ART))] === CellType.OUT;

/** The cut's alpha into `data`. */
export function sandCutPixels(plan: TrailPlan, map: CityMap, data: Uint8ClampedArray) {
  return cutPixels(trailField(plan).t, W, H, 0, 0, (X, Y) => open(map, X, Y), data);
}
/** The cut's alpha over a box (`distanceField`'s), only where `open`. */
function cutPixels(t: Float32Array, w: number, h: number, ox: number, oy: number, isOpen: (X: number, Y: number) => boolean, data: Uint8ClampedArray) {
  for (let y = 0; y < h; y++)
    for (let x = 0, i = y * w; x < w; x++, i++) {
      const X = x - ox, Y = y - oy;
      if (t[i] < FRINGE && isOpen(X, Y) && carved(t[i], X, Y)) data[i * 4 + 3] = 255;
    }
  return data;
}

/** The banks' sand into `data`: on the sand left beside the trail, a slope
 * down toward its middle, the face toward the sun lit and the face away
 * shaded, steepest at the lip; and drifted grains spilling onto the tiles. */
export function sandBankPixels(plan: TrailPlan, map: CityMap, data: Uint8ClampedArray) {
  bankPixels(trailField(plan).t, W, H, 0, 0, (X, Y) => open(map, X, Y), data);
  for (const r of plan.rocks) trailRock(data, r.x * ART, r.y * ART, r.r * ART, hash(Math.round(r.x * 8), Math.round(r.y * 8), 925));
  return data;
}
/** The banks over a box (`distanceField`'s), only where `open`. */
function bankPixels(t: Float32Array, w: number, h: number, ox: number, oy: number, isOpen: (X: number, Y: number) => boolean, data: Uint8ClampedArray) {
  const W = w, SUN = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
  for (let y = 1; y < h - 1; y++)
    for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) {
      const v = t[i], X = x - ox, Y = y - oy;
      if (v > FRINGE + 0.4 || !isOpen(X, Y)) continue;
      const o = i * 4;
      if (v < FRINGE && carved(v, X, Y)) {
        // Grains blown back over the tiles near the lip.
        if (v > 0.55 && hash01(X, Y, 927) < (v - 0.55) * 0.5) (data[o] = 200), (data[o + 1] = 148), (data[o + 2] = 88), (data[o + 3] = 200);
        continue;
      }
      // The bank's slope: down toward the trail's middle (falling `t`).
      const gx = (t[i + 1] - t[i - 1]) / 2, gy = (t[i + W] - t[i - W]) / 2, g = Math.hypot(gx, gy);
      if (!(g > 0) || !Number.isFinite(g)) continue;
      const steep = Math.max(0, 1 - Math.max(0, v - 0.75) / 0.85);
      // The face looks toward the trail (-gradient): lit when that is the sun's way.
      const lit = (-(gx / g) * SUN.x - (gy / g) * SUN.y) * steep;
      // Dithered, not a smooth wash, so the bank keeps the sand's grain.
      const a = Math.min(1, Math.abs(lit) * 0.75);
      if (a < 0.04 || a < BAYER[(Y & 3) * 4 + (X & 3)] * 0.9 + (hash01(X, Y, 929) - 0.5) * 0.25) continue;
      const c = lit > 0 ? [252, 214, 150] : [96, 58, 30];
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = lit > 0 ? 120 : 140;
    }
  return data;
}

/** Sand trails carried on past the board (`roadReach`'s lines, in board
 * cells), cut and banked exactly as on the field (`sandTrailCanvases`) and
 * hashed in board coordinates, so they run on with no seam: for each run
 * of lines leaving the top or the bottom edge, its box in art pixels from
 * the board's corner, its trail distances (`t`), the sand to erase there
 * and the banks to lay over it. Nothing on the board itself. */
export function sandReachCanvases(lines: readonly TrailLine[]) {
  const out: { x: number; y: number; w: number; h: number; t: Float32Array; cut: HTMLCanvasElement; banks: HTMLCanvasElement }[] = [];
  for (const up of [true, false]) {
    const group = lines.filter((l) => (l.points[l.points.length - 1].y < CELLS_H / 2) === up);
    if (!group.length) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of group) for (const p of l.points) {
      const r = l.half * FIELD_REACH + 1;
      x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r); y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
    }
    const X0 = Math.floor(x0 * ART), Y0 = Math.floor(y0 * ART), w = Math.ceil(x1 * ART) - X0, h = Math.ceil(y1 * ART) - Y0;
    const { t } = distanceField(group, w, h, -X0, -Y0);
    const off = (X: number, Y: number) => X < 0 || Y < 0 || X >= W || Y >= H;
    const make = (fill: (d: Uint8ClampedArray) => void) => {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!, image = ctx.createImageData(w, h);
      fill(image.data);
      ctx.putImageData(image, 0, 0);
      return canvas;
    };
    out.push({ x: X0, y: Y0, w, h, t, cut: make((d) => cutPixels(t, w, h, -X0, -Y0, off, d)), banks: make((d) => bankPixels(t, w, h, -X0, -Y0, off, d)) });
  }
  return out;
}

/** Sandstone, shadow to sunlit, and the rock's dark rim. */
const SANDSTONE = [[132, 84, 48], [168, 112, 64], [196, 140, 84], [222, 172, 112]] as const, RIM = [92, 56, 34] as const;

/** A weathered sandstone rock at art pixel (x, y), `R` across, that a trail
 * bends round: a lumpy disc lit from the upper left, a dark rim, its shadow
 * down and to the right. */
function trailRock(data: Uint8ClampedArray, x: number, y: number, R: number, seed: number) {
  const ph = hash01(seed, 927) * 6.28;
  const put = (X: number, Y: number, c: readonly number[], a = 255) => {
    if (X < 0 || Y < 0 || X >= W || Y >= H) return;
    const o = (Y * W + X) * 4;
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = a;
  };
  const rim = (dx: number, dy: number) => R * (0.85 + 0.12 * Math.sin(Math.atan2(dy, dx) * 3 + ph) + 0.06 * Math.sin(Math.atan2(dy, dx) * 5 + ph * 2));
  const inside = (dx: number, dy: number) => Math.hypot(dx, dy) < rim(dx, dy);
  const x0 = Math.floor(x - R - 2), x1 = Math.ceil(x + R + 3), y0 = Math.floor(y - R - 2), y1 = Math.ceil(y + R + 3);
  // Its shadow first, two pixels down and right.
  for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++)
    if (inside(X + 0.5 - x - 2, Y + 0.5 - y - 2) && !inside(X + 0.5 - x, Y + 0.5 - y)) put(X, Y, RIM, 110);
  for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
    const dx = X + 0.5 - x, dy = Y + 0.5 - y;
    if (!inside(dx, dy)) continue;
    if (!inside(dx - 1, dy) || !inside(dx + 1, dy) || !inside(dx, dy - 1) || !inside(dx, dy + 1)) { put(X, Y, RIM); continue; }
    const lit = (-dx - dy) / (R * 1.4) + (hash01(X, Y, seed, 928) - 0.5) * 0.5;
    put(X, Y, SANDSTONE[Math.max(0, Math.min(3, Math.round(1.5 + lit * 1.6)))]);
  }
}

/** Whether art pixel (X, Y) lies on a trail of `plan` (tests). */
export function onTrailPixel(plan: TrailPlan, X: number, Y: number) {
  return X >= 0 && Y >= 0 && X < W && Y < H && trailField(plan).t[Y * W + X] < 1;
}
