/** The city's shadows in the afternoon sun, as pixel art at `ART` pixels a
 * cell: one crisp shadow mask cast over a height map, so everything throws
 * its shadow on whatever lies below it, not just on the ground.
 *
 * The height map (`heights`, in art pixels of shadow length) stands the
 * houses up as gabled roofs (low at the eaves, rising to the ridge), the
 * city wall taller than any house with its hanging face sloping down to the
 * street, the keep's curtain, turrets and great tower, the other
 * structures, and the trees' domed canopies. The sun is to the upper left
 * and drops one height unit per art pixel stepped down and right, so a
 * house's eaves throw a short shadow, its gable ends a longer pointed one,
 * and the wall's shadow falls across the roofs beside it, shortened where
 * they rise toward it and running on past the ridge down the far slope.
 *
 * `shadowMask` is pure; `shadowCanvas` paints it for the city layer. Fallen
 * buildings cast nothing. Presentation only. */
import { CELLS_H, CELLS_W, cellInBounds, cellIndex } from "./grid.ts";
import type { Building, CityMap } from "./citygen.ts";
import { ART, treePixels } from "./park-art.ts";
import { hasTree, treeCanopy } from "./park-geometry.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;

/** Heights, in art pixels of shadow cast. */
export const HEIGHT = {
  /** A house's eaves, and how much its roof rises an art pixel in toward
   * the ridge (under one, so a slope never shades itself), up to `ridge`. */
  eave: 2.5, pitch: 0.6, ridge: 4.5,
  wall: 6,
  keep: { curtain: 6, court: 0.5, tower: 9, turret: 8 },
  tower: 7,
  hall: 4.5,
  /** A tree's canopy: its rim, and how much higher its crown stands. */
  tree: { rim: 3, crown: 2 },
};
/** The shadow's darkness, and at its very tip (the last half pixel), where
 * it thins out. */
const DARK = 0.36, TIP = 0.2;

/** The art-pixel height map of `map`, `standing` saying which buildings
 * still stand. */
export function heights(map: CityMap, standing: (b: Building) => boolean): Float32Array {
  const h = new Float32Array(W * H);
  const raise = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H && v > h[y * W + x]) h[y * W + x] = v;
  };
  for (const b of map.buildings) {
    if (!standing(b)) continue;
    if (b.kind === "wall") wall(map, b, raise, standing);
    else if (b.kind === "house") house(b, raise);
    else if (b.kind === "keep") keep(b, raise);
    else structure(b, b.kind.endsWith("Tower") ? HEIGHT.tower : HEIGHT.hall, raise);
  }
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      if (!hasTree(map, cx, cy)) continue;
      const t = treeCanopy(cx, cy), R = t.r * ART;
      treePixels(cx, cy, (x, y) => {
        const dx = x + 0.5 - t.x * ART, dy = y + 0.5 - t.y * ART, d = Math.min(1, Math.sqrt(dx * dx + dy * dy) / R);
        raise(x, y, HEIGHT.tree.rim + HEIGHT.tree.crown * Math.sqrt(1 - d * d));
      });
    }
  return h;
}

type Raise = (x: number, y: number, v: number) => void;

/** A house: a gabled roof along its long side, one art pixel in from its
 * lot (as `roofPixels` draws it). */
function house(b: Building, raise: Raise) {
  const r = b.rect, x0 = r.x * ART + 1, y0 = r.y * ART + 1, x1 = (r.x + r.w) * ART - 3, y1 = (r.y + r.h) * ART - 3;
  const along = r.w >= r.h;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const inward = along ? Math.min(y - y0, y1 - y) : Math.min(x - x0, x1 - x);
      raise(x, y, HEIGHT.eave + Math.min(HEIGHT.ridge - HEIGHT.eave, inward * HEIGHT.pitch));
    }
}

/** A wall stone, and its face hung over the ground below where the wall
 * has an open south side, sloping from the wall's top to the street. */
function wall(map: CityMap, b: Building, raise: Raise, standing: (b: Building) => boolean) {
  const cx = b.rect.x, cy = b.rect.y;
  for (let j = 0; j < ART; j++) for (let i = 0; i < ART; i++) raise(cx * ART + i, cy * ART + j, HEIGHT.wall);
  const below = cy + 1;
  const open = !cellInBounds(cx, below) || !(map.wall[cellIndex(cx, below)] === 1 && standing(map.buildings[map.owner[cellIndex(cx, below)]]));
  if (!open || below >= CELLS_H) return;
  const face = ART * 0.45;
  for (let j = 0; j < Math.ceil(face); j++)
    for (let i = 0; i < ART; i++) raise(cx * ART + i, below * ART + j, HEIGHT.wall * (1 - (j + 0.5) / face));
}

/** The keep: its curtain wall, the low courtyard inside, four turrets and
 * the great tower's hipped roof (the shapes of `keepPixels`). */
function keep(b: Building, raise: Raise) {
  const r = b.rect, n = 3 * ART, w = r.w * ART, hh = r.h * ART, K = HEIGHT.keep;
  const mid = n / 2 - 0.5;
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < w; x++) {
      // Sample the keep's own 3 × 3 cell art, whatever its box.
      const kx = Math.floor((x * n) / w), ky = Math.floor((y * n) / hh);
      if (kx < 1 || ky < 1 || kx > n - 2 || ky > n - 2) continue;
      const ring = Math.min(kx - 1, ky - 1, n - 2 - kx, n - 2 - ky);
      let v = ring <= 3 ? K.curtain : K.court;
      if (kx >= 7 && ky >= 7 && kx <= n - 8 && ky <= n - 8) v = K.tower + (4.5 - Math.max(Math.abs(kx - mid), Math.abs(ky - mid))) * 0.5;
      for (const [tx, ty] of [[4, 4], [n - 4, 4], [4, n - 4], [n - 4, n - 4]]) {
        const dx = kx + 0.5 - tx, dy = ky + 0.5 - ty, d = Math.sqrt(dx * dx + dy * dy);
        if (d <= 3.9) v = Math.max(v, K.turret + (3.9 - d) * 0.6);
      }
      raise(r.x * ART + x, r.y * ART + y, v);
    }
}

/** A tower or hall: a block one art pixel in from its lot. */
function structure(b: Building, v: number, raise: Raise) {
  const r = b.rect;
  for (let y = r.y * ART + 1; y < (r.y + r.h) * ART - 1; y++) for (let x = r.x * ART + 1; x < (r.x + r.w) * ART - 1; x++) raise(x, y, v);
}

/** The shadow over each art pixel: 0 in sun, 1 in shadow, 2 at a shadow's
 * thin tip. A pixel is shaded when anything up the sun's ray (up and left)
 * stands higher than the ray does there. */
export function shadowMask(h: Float32Array): Uint8Array {
  const out = new Uint8Array(W * H);
  // The highest any ray stands over each pixel, carried down each diagonal:
  // the pixel up-left's height or ray, whichever is higher, less one.
  const ray = new Float32Array(W * H).fill(-1);
  for (let y = 1; y < H; y++)
    for (let x = 1; x < W; x++) {
      const i = y * W + x, q = i - W - 1;
      const r = (ray[i] = Math.max(h[q], ray[q]) - 1);
      const over = r - h[i];
      if (over > 0) out[i] = over > 0.5 ? 1 : 2;
    }
  return out;
}

/** The mask as a canvas of translucent black, `W × H` art pixels. */
export function shadowCanvas(mask: Uint8Array): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  const img = c.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  const dark = Math.round(DARK * 255) << 24, tip = Math.round(TIP * 255) << 24;
  for (let i = 0; i < mask.length; i++) if (mask[i]) px[i] = (mask[i] === 1 ? dark : tip) >>> 0;
  c.putImageData(img, 0, 0);
  return cv;
}
