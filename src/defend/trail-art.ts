/** The worn monster trails (`trails.ts`) as pixel art, `ART` pixels a cell.
 *
 * - **Country roads** are painted into the forest's own floor
 *   (`paintRoads`, from `forest-art.ts`'s `paintFloor`): packed dirt with two
 *   darker wheel ruts and a strip of grass left down the middle, its edges
 *   ragged where the grass creeps back over, a pebble here and there. The
 *   live grass keeps off it, as it does off any dirt.
 * - **Galton trails** are a see-through layer laid over the Amber Desert's
 *   dunes (`galtonCanvas`): sand packed flatter and a little darker the more
 *   worn the trail, scuffed with footprints, its edge dithered into the
 *   dunes, so the dunes' light and shadow still show through.
 *
 * Both read the same distance map (`trailField`): for each art pixel, how far
 * it lies from the nearest trail's middle as a share of that trail's half
 * width, and that trail's wear. */
import { CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { ART } from "./art-scale.ts";
import { segmentDistance, type TrailPlan } from "./trails.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { rgba } from "./damage-art.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;
/** How far past a trail's half width (as a share of it) its ragged edge may reach. */
const FRINGE = 1.25;

/** Each art pixel's distance from the nearest trail's middle as a share of
 * its half width (`t`, Infinity far from any), and that trail's wear. */
export type TrailField = { t: Float32Array; level: Float32Array };
const fields = new WeakMap<TrailPlan, TrailField>();

/** `plan`'s distance map, made on first use. */
export function trailField(plan: TrailPlan): TrailField {
  let f = fields.get(plan);
  if (f) return f;
  const t = new Float32Array(W * H).fill(Infinity), level = new Float32Array(W * H);
  for (const line of plan.lines) {
    const R = line.half * ART, reach = R * FRINGE + 1;
    const pts = line.points.map((p) => ({ x: p.x * ART, y: p.y * ART }));
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach)), x1 = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x) + reach));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach)), y1 = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y) + reach));
      for (let Y = y0; Y <= y1; Y++)
        for (let X = x0; X <= x1; X++) {
          const i = Y * W + X, v = segmentDistance(X + 0.5, Y + 0.5, a, b) / R;
          if (v < t[i]) (t[i] = v), (level[i] = line.level);
        }
    }
  }
  fields.set(plan, (f = { t, level }));
  return f;
}

/** A trail's ragged edge at art pixel (X, Y): about 1, wavering slowly along
 * it and a pixel in and out. */
const edgeAt = (X: number, Y: number, seed: number) =>
  0.92 + 0.1 * Math.sin(X * 0.21 + Y * 0.17 + seed) + 0.06 * Math.sin(X * 0.07 - Y * 0.11 + seed * 2) + (hash01(X, Y, seed, 920) - 0.5) * 0.12;

/** Dirt for the roads: rut dark to packed light. */
const ROAD = [0x4c3e2f, 0x5c4b39, 0x6e5a42, 0x7c6749, 0x8b7656];
const STONES = [0x8a7a62, 0x3a3026];

/** Paints the country roads into the forest floor `out` (`W × H`) within the
 * box, on the open cells only; the grass is left down the road's middle and
 * where it creeps over its edge. */
export function paintRoads(out: Uint32Array, plan: TrailPlan, open: Uint8Array, box: { x0: number; y0: number; x1: number; y1: number }) {
  const { t } = trailField(plan);
  for (let Y = box.y0; Y < box.y1; Y++)
    for (let X = box.x0, i = Y * W + X; X < box.x1; X++, i++) {
      if (t[i] > FRINGE || !open[cellIndex(Math.floor(X / ART), Math.floor(Y / ART))]) continue;
      const c = roadPixel(t[i], X, Y);
      if (c) out[i] = c;
    }
}

/** A road's pixel at board art pixel (X, Y), `v` of its half width from its
 * middle: dirt, a rut or a pebble, or 0 where the grass shows through. The
 * wilds (`wilds.ts`) carry the roads on past the board with it. */
export function roadPixel(v: number, X: number, Y: number): number {
  if (v > FRINGE) return 0;
  const edge = edgeAt(X, Y, 3), h = hash(X, Y, 921);
  if (v >= edge) return 0;
  // The outermost pixels, every other one, let the grass through.
  if (v > edge - 0.12 && (X + Y + (h & 1)) & 1) return 0;
  // A strip of grass down the middle, ragged at its sides, worn through in places.
  const strip = 0.2 + (hash01(Math.floor(X / 3), Math.floor(Y / 3), 922) - 0.5) * 0.12;
  if (v < strip && h % 5 !== 0) return 0;
  let tone: number;
  if (v > 0.32 && v < 0.62) tone = h % 4 === 0 ? 1 : 0; // the wheel ruts
  else if (v >= edge - 0.2) tone = h % 3 === 0 ? 2 : 3; // packed earth at the shoulders
  else tone = h % 5 === 0 ? 2 : h % 7 === 0 ? 4 : 3;
  let c = ROAD[tone];
  if (h % 41 === 0) c = STONES[0];
  else if (h % 41 === 1) c = STONES[1];
  return rgba(c);
}

/** As `paintRoads`, for lines (cells, `half` wide) into any `ow × oh` buffer
 * whose board corner is at (ox, oy) art pixels; `keep` says which pixels
 * the road may cover. The pixels it covered. */
export function paintRoadLines(out: Uint32Array, ow: number, oh: number, ox: number, oy: number, lines: readonly { points: readonly { x: number; y: number }[]; half: number }[], keep: (i: number) => boolean): number[] {
  const t = new Map<number, number>();
  for (const line of lines) {
    const R = line.half * ART, reach = R * FRINGE + 1;
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

/** The Galton trails' colours: packed sand, darker footprints. */
const PACKED = [150, 104, 58] as const, PRINT = [118, 78, 44] as const;

const canvases = new WeakMap<TrailPlan, HTMLCanvasElement>();

/** The Galton trails as a see-through image over the dunes, `ART` pixels a
 * cell, made once for each plan; only on `map`'s open ground. */
export function galtonCanvas(plan: TrailPlan, map: CityMap): HTMLCanvasElement {
  let canvas = canvases.get(plan);
  if (canvas) return canvas;
  canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d")!, image = c.createImageData(W, H);
  galtonPixels(plan, map, image.data);
  c.putImageData(image, 0, 0);
  canvases.set(plan, canvas);
  return canvas;
}

/** The Galton trails' RGBA pixels into `data` (`W × H`). */
export function galtonPixels(plan: TrailPlan, map: CityMap, data: Uint8ClampedArray) {
  const { t, level } = trailField(plan);
  for (let Y = 0; Y < H; Y++)
    for (let X = 0, i = Y * W; X < W; X++, i++) {
      const v = t[i];
      if (v > FRINGE || map.type[cellIndex(Math.floor(X / ART), Math.floor(Y / ART))] !== CellType.OUT) continue;
      const edge = edgeAt(X, Y, 5), h = hash(X, Y, 923);
      if (v >= edge || (v > edge - 0.18 && (X + Y + (h & 1)) & 1)) continue;
      const wear = level[i];
      // Packed flatter toward the middle, the more so the more it's walked.
      let a = (0.06 + 0.5 * wear) * (1 - 0.35 * Math.max(0, v - 0.3) / 0.7), col: readonly number[] = PACKED;
      // Footprints scuffed in along the worn middle.
      if (v < 0.75 && (h % 13 === 0 || (h % 13 === 1 && hash01(X + 1, Y, 924) < 0.5))) (col = PRINT), (a = 0.15 + 0.5 * wear);
      const o = i * 4;
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = Math.round(a * 255);
    }
  for (const p of plan.pegs) pegRock(data, p.x * ART, p.y * ART, hash(Math.round(p.x * 8), Math.round(p.y * 8), 925));
  return data;
}

/** Sandstone, shadow to sunlit, and the rock's dark rim. */
const SANDSTONE = [[132, 84, 48], [168, 112, 64], [196, 140, 84], [222, 172, 112]] as const, RIM = [92, 56, 34] as const;

/** A weathered sandstone rock at art pixel (x, y), the Galton pin a trail
 * parts round: a lumpy disc lit from the upper left, a dark rim, its shadow
 * down and to the right. */
function pegRock(data: Uint8ClampedArray, x: number, y: number, seed: number) {
  const R = 6 + hash01(seed, 926) * 2.5, ph = hash01(seed, 927) * 6.28;
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
