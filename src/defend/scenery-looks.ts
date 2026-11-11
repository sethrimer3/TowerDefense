/** Two looks of the scenery the player can choose in Settings:
 *
 * - **Scenery outlines** (`sceneryOutlines`, on by default): the forest's
 *   trees, bushes, stumps, rocks and mountains, the parks' trees and the
 *   wilds' trees, rocks and ranges are drawn inside a black outline. Off,
 *   they are drawn bare; units and buildings keep theirs. Toggling it
 *   redraws every sprite cache (`bumpPixelArt`).
 * - **Still air** (`stillAir`, off by default): the grass and trees stop
 *   swaying in the wind and stir only near enemies. `stirWind` keeps how
 *   stirred each tile is (0 still to 1 fully windblown), rising quickly as
 *   enemies come near and settling slowly once they have gone, and
 *   `windAt`/`windInCell` scale the wind by it.
 *
 * Presentation only; nothing here touches the battle. */
import { CELLS_H, CELLS_W, SUB, TILES_H, TILES_W } from "./grid.ts";
import { bumpPixelArt } from "./pixel-sprites.ts";

let outlines = true;
/** Whether scenery is drawn with its black outline. */
export const sceneryOutlinesOn = () => outlines;
export function setSceneryOutlines(on: boolean) {
  if (on === outlines) return;
  outlines = on;
  bumpPixelArt();
}

let still = false;
/** Whether the grass and trees move only near enemies. */
export const stillAirOn = () => still;
export function setStillAir(on: boolean) {
  if (on === still) return;
  still = on;
  tiles.fill(0);
  cells.fill(0);
  quiet = true;
}

/** Tiles from an enemy at which the wind is at full strength, and past
 * which it is still. */
export const STIR = { full: 1, reach: 2.5, rise: 3, settle: 0.7 };

const tiles = new Float32Array(TILES_W * TILES_H);
const cells = new Float32Array(CELLS_W * CELLS_H);
const occupied = new Uint8Array(TILES_W * TILES_H);
let quiet = true;

/** Moves each tile's stir `dt` seconds toward where `enemies` (positions in
 * cells) now are. A no-op unless still air is on. */
export function stirWind(enemies: readonly { x: number; y: number; raidProxy?: unknown }[], dt: number) {
  if (!still) return;
  occupied.fill(0);
  const near: number[] = [];
  for (const e of enemies) {
    if (e.raidProxy) continue;
    const tx = Math.floor(e.x / SUB), ty = Math.floor(e.y / SUB);
    if (tx < 0 || ty < 0 || tx >= TILES_W || ty >= TILES_H) continue;
    const i = ty * TILES_W + tx;
    if (!occupied[i]) { occupied[i] = 1; near.push(tx, ty); }
  }
  if (quiet && !near.length) return;
  const up = 1 - Math.exp(-Math.max(0, dt) * STIR.rise), down = 1 - Math.exp(-Math.max(0, dt) * STIR.settle);
  let any = false;
  for (let ty = 0; ty < TILES_H; ty++)
    for (let tx = 0; tx < TILES_W; tx++) {
      let d2 = Infinity;
      for (let k = 0; k < near.length; k += 2) {
        const dx = near[k] - tx, dy = near[k + 1] - ty, e = dx * dx + dy * dy;
        if (e < d2) d2 = e;
      }
      const d = Math.sqrt(d2), goal = Math.max(0, Math.min(1, (STIR.reach - d) / (STIR.reach - STIR.full)));
      const i = ty * TILES_W + tx, v = tiles[i];
      let next = v + (goal - v) * (goal > v ? up : down);
      if (next < 0.005) next = 0;
      tiles[i] = next;
      if (next) any = true;
    }
  quiet = !any;
  // Smoothed down to cells, between the tiles' middles.
  for (let cy = 0; cy < CELLS_H; cy++) {
    const fy = Math.max(0, Math.min(TILES_H - 1, (cy + 0.5) / SUB - 0.5)), y0 = Math.floor(fy), y1 = Math.min(TILES_H - 1, y0 + 1), v = fy - y0;
    for (let cx = 0; cx < CELLS_W; cx++) {
      const fx = Math.max(0, Math.min(TILES_W - 1, (cx + 0.5) / SUB - 0.5)), x0 = Math.floor(fx), x1 = Math.min(TILES_W - 1, x0 + 1), u = fx - x0;
      const top = tiles[y0 * TILES_W + x0] * (1 - u) + tiles[y0 * TILES_W + x1] * u;
      const bottom = tiles[y1 * TILES_W + x0] * (1 - u) + tiles[y1 * TILES_W + x1] * u;
      cells[cy * CELLS_W + cx] = top * (1 - v) + bottom * v;
    }
  }
}

/** How much of the wind reaches cell index `i` (1 unless still air is on). */
export const windInCell = (i: number) => (still ? cells[i] : 1);

/** How much of the wind reaches (x, y) in cells, on the board or past its
 * edge (the wilds take the nearest edge cell's, fading out over a tile). */
export function windAt(x: number, y: number) {
  if (!still) return 1;
  if (quiet) return 0;
  const cx = Math.max(0, Math.min(CELLS_W - 1, Math.floor(x))), cy = Math.max(0, Math.min(CELLS_H - 1, Math.floor(y)));
  const out = Math.max(0, -x, -y, x - CELLS_W, y - CELLS_H);
  const fade = Math.max(0, 1 - out / SUB);
  return fade && cells[cy * CELLS_W + cx] * fade;
}

/** `px` (w × h) with a clear pixel's border all round. */
export function padPixels(px: Uint32Array, w: number, h: number) {
  const W = w + 2, data = new Uint32Array(W * (h + 2));
  for (let y = 0; y < h; y++) data.set(px.subarray(y * w, y * w + w), (y + 1) * W + 1);
  return { data, w: W, h: h + 2 };
}