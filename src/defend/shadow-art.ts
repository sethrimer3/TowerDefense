/** The city's shadows in the afternoon sun, as pixel art at `ART` pixels a
 * cell: one crisp shadow mask cast over a height map, so everything throws
 * its shadow on whatever lies below it, not just on the ground.
 *
 * The height map (`heights`, in art pixels of shadow length) stands the
 * houses up as gabled roofs (low at the eaves, rising to the ridge), the
 * city wall taller than any house with its hanging face sloping down to the
 * street, the keep's curtain, turrets and great tower, the other
 * structures (a gate only by its two towers), and the trees' domed canopies. The sun is to the upper left
 * and drops one height unit per art pixel stepped down and right, so a
 * house's eaves throw a short shadow, its gable ends a longer pointed one,
 * and the wall's shadow falls across the roofs beside it, shortened where
 * they rise toward it and running on past the ridge down the far slope.
 *
 * `shadowMask` is pure; `paintShadows` paints it into the city layer. Fallen
 * buildings cast nothing. Presentation only. */
import { CELLS_H, CELLS_W, cellInBounds, cellIndex } from "./grid.ts";
import type { Building, CityMap } from "./citygen.ts";
import { ART, treePixels } from "./park-art.ts";
import { hasTree, treeCanopy } from "./park-geometry.ts";
import { TOWER as GATE_TOWER } from "./gate-art.ts";
import { WOOD_POST, gateArtRect } from "./wood-gate-art.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;

/** Heights, in art pixels of shadow cast. */
export const HEIGHT = {
  /** A house's eaves, and how much its roof rises an art pixel in toward
   * the ridge (under one, so a slope never shades itself), up to `ridge`. */
  eave: 2.5, pitch: 0.6, ridge: 4.5,
  wall: 6,
  /** A wooden fence's rails and posts. */
  fence: { rail: 1.5, post: 2.5 },
  keep: { curtain: 6, court: 0.5, tower: 9, turret: 8 },
  tower: 7,
  hall: 4.5,
  /** A tree's canopy: its rim, and how much higher its crown stands. */
  tree: { rim: 3, crown: 2 },
};
/** The shadow's darkness, and at its very tip (the last half pixel), where
 * it thins out. */
const DARK = 0.36, TIP = 0.2;

/** Which art pixels a structure's sprite covers, from `x0`, `y0` (art
 * pixels on the board), `w` × `h` of them, 1 where it is solid. */
export type Footprint = { x0: number; y0: number; w: number; h: number; mask: Uint8Array };

/** The art-pixel height map of `map`, `standing` saying which buildings
 * still stand; `footprint`, where it has one, gives a structure's sprite,
 * so its shadow starts at the sprite's edge and takes its shape rather
 * than its lot's. */
export function heights(map: CityMap, standing: (b: Building) => boolean, footprint?: (b: Building) => Footprint | null): Float32Array {
  const h = new Float32Array(W * H);
  const raise = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H && v > h[y * W + x]) h[y * W + x] = v;
  };
  for (const b of map.buildings) {
    if (b.hidden || !standing(b)) continue;
    if (b.fence) fence(b, raise);
    else if (b.kind === "wall") wall(map, b, raise, standing);
    else if (b.kind === "house") house(b, raise);
    else if (b.kind === "keep") keep(b, raise);
    else if (b.kind === "gate") gate(b, raise);
    else {
      const v = b.kind === "wallBallista" ? HEIGHT.wall : b.kind.endsWith("Tower") ? HEIGHT.tower : HEIGHT.hall;
      const f = footprint?.(b);
      if (f) sprite(f, v, raise);
      else structure(b, v, raise);
    }
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

/** A wall stone, and its face hung over the open ground below where the wall
 * has an open south side, sloping from the wall's top to the street. */
function wall(map: CityMap, b: Building, raise: Raise, standing: (b: Building) => boolean) {
  const cx = b.rect.x, cy = b.rect.y;
  for (let j = 0; j < ART; j++) for (let i = 0; i < ART; i++) raise(cx * ART + i, cy * ART + j, HEIGHT.wall);
  const below = cy + 1;
  const open = !cellInBounds(cx, below) || !(map.wall[cellIndex(cx, below)] === 1 && standing(map.buildings[map.owner[cellIndex(cx, below)]]));
  if (!open || below >= CELLS_H) return;
  // A house or structure below stands in front of the face and hides it.
  const i0 = cellIndex(cx, below), owner = map.owner[i0];
  if (owner >= 0 && map.buildings[owner].kind !== "wall" && standing(map.buildings[owner])) return;
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

/** A tower or hall without its sprite's shape to hand (in Node, or before
 * its art loads): a block one art pixel in from its lot. */
function structure(b: Building, v: number, raise: Raise) {
  const r = b.rect;
  for (let y = r.y * ART + 1; y < (r.y + r.h) * ART - 1; y++) for (let x = r.x * ART + 1; x < (r.x + r.w) * ART - 1; x++) raise(x, y, v);
}

/** A structure standing as tall as `v` wherever its sprite is solid. */
function sprite(f: Footprint, v: number, raise: Raise) {
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.mask[y * f.w + x]) raise(f.x0 + x, f.y0 + y, v);
}

/** A wooden fence: its rails stand low and its posts a little higher. */
function fence(b: Building, raise: Raise) {
  for (const f of b.rails ?? [b.fence!]) {
    const n = Math.round(Math.max(Math.abs(f.x2 - f.x1), Math.abs(f.y2 - f.y1)) * ART);
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0, x = Math.floor((f.x1 + (f.x2 - f.x1) * t) * ART - 0.5), y = Math.floor((f.y1 + (f.y2 - f.y1) * t) * ART - 0.5);
      raise(x, y, HEIGHT.fence.rail);
    }
    for (const [px, py] of [[f.x1, f.y1], [f.x2, f.y2]])
      for (let j = -1; j <= 0; j++) for (let i = -1; i <= 0; i++) raise(Math.floor(px * ART) + i, Math.floor(py * ART) + j, HEIGHT.fence.post);
  }
}

/** A gate: only its two towers stand wall high; the passage between them,
 * its floor and its low doors, casts nothing, so the sun reaches through.
 * A wooden gate's posts stand as high as a fence's. */
function gate(b: Building, raise: Raise) {
  const r = gateArtRect(b), x0 = Math.round(r.x * ART), y0 = Math.round(r.y * ART), w = r.w * ART, h = r.h * ART;
  const across = b.gate?.side === "e" || b.gate?.side === "w";
  const long = across ? h : w, deep = across ? w : h;
  const tower = b.woodGate ? WOOD_POST : GATE_TOWER;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = across ? y : x, v = across ? x : y;
      if (u >= tower && u < long - tower) continue;
      if (!b.woodGate) raise(x0 + x, y0 + y, HEIGHT.wall);
      else if (Math.abs(v + 0.5 - deep / 2) < 3) raise(x0 + x, y0 + y, HEIGHT.fence.post);
    }
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

/** A directional height-map sweep. The dominant axis advances one whole
 * pixel, so both upstream samples have already been visited. Linear work
 * over the board; no per-pixel ray marches or scene readbacks. */
export function sunShadowMask(h: Float32Array, dx: number, dy: number): Uint8Array {
  const out = new Uint8Array(W * H), ray = new Float32Array(W * H);
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  if (!(length > .01) || !Number.isFinite(length)) return out;
  dx /= length; dy /= length;
  const drop = 1 / length, horizontal = Math.abs(dx) >= Math.abs(dy);
  const sample = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H ? Math.max(h[y * W + x], ray[y * W + x]) : 0;
  const write = (x: number, y: number) => {
    const u = horizontal ? y - dy : x - dx, low = Math.floor(u), part = u - low;
    const a = horizontal ? sample(x - dx, low) : sample(low, y - dy);
    const b = horizontal ? sample(x - dx, low + 1) : sample(low + 1, y - dy);
    const i = y * W + x, r = ray[i] = Math.max(0, a + (b - a) * part - drop), over = r - h[i];
    if (over > 0) out[i] = over > .5 ? 1 : 2;
  };
  if (horizontal) {
    const step = dx >= 0 ? 1 : -1;
    for (let x = step > 0 ? 0 : W - 1; x >= 0 && x < W; x += step) for (let y = 0; y < H; y++) write(x, y);
  } else {
    const step = dy >= 0 ? 1 : -1;
    for (let y = step > 0 ? 0 : H - 1; y >= 0 && y < H; y += step) for (let x = 0; x < W; x++) write(x, y);
  }
  return out;
}

/** Paints the mask in translucent black onto `c` at `px` canvas pixels a
 * cell, each art pixel's edges rounded to whole canvas pixels the way the
 * buildings' cells are (`Math.round(cx * px)`), so a shadow starts right
 * at the edge of what casts it, with no lit sliver between (a scaled
 * drawImage rounds them its own way). One rectangle a run along a row. */
export function paintShadows(c: CanvasRenderingContext2D, mask: Uint8Array, px: number) {
  const s = px / ART;
  for (const [v, a] of [[1, DARK], [2, TIP]] as const) {
    c.beginPath();
    for (let y = 0; y < H; y++) {
      const y0 = Math.round(y * s), y1 = Math.round((y + 1) * s);
      if (y1 === y0) continue;
      for (let x = 0, row = y * W; x < W; ) {
        if (mask[row + x] !== v) { x++; continue; }
        const x0 = x;
        while (x < W && mask[row + x] === v) x++;
        const l = Math.round(x0 * s);
        c.rect(l, y0, Math.round(x * s) - l, y1 - y0);
      }
    }
    c.fillStyle = `rgba(0,0,0,${a})`;
    c.fill();
  }
}
