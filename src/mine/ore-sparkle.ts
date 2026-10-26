/** Ore glinting: with the Ore sense skill, copper, silver and gold within
 * `SPARKLE.reach` art pixels (two a cell) of a passage the crew has lit now
 * and then catch the light in a small pixel-art star of their own colour;
 * the ore heaped at the surface glints always (`heapGlint`).
 * Presentation only: the sites are found by a chamfer distance over the grid
 * when the world changes (`sparkleSites`), and each glint's moment is hashed
 * from its cell and the wall clock (`sparkleFrame`), so nothing is stepped. */
import { CELLS, COPPER, GOLD, H, SILVER, W, hash01, isOre, isPassable, type Material } from "./world.ts";
import type { RGB } from "./art.ts";
import type { Fine } from "./figures.ts";

export const SPARKLE = {
  /** How far from a lit passage ore may glint, in art pixels (two a cell). */
  reach: 30,
  /** Warm light a passage needs to count as lit: torches, lanterns and work
   * lamps, not a passing miner's hat lamp on its own. */
  lit: 0.55,
  /** Share of the ore cells in reach that ever glint. */
  share: 0.3,
  /** Each glinting cell's cycle, ms: a glint every `period` to `period + spread`. */
  period: 2600,
  spread: 3400,
  /** How long each of a glint's frames shows, ms. */
  frame: 110,
};

/** A glint's frames: a dot, a small cross, a star, a small cross, a dot.
 * Each is a list of art-pixel offsets, the core first. */
export const FRAMES: [number, number][][] = [
  [[0, 0]],
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]],
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
  [[0, 0]],
];

/** Each ore's glint: a bright arm and a near-white core. */
export const GLINT: Record<number, { arm: RGB; core: RGB }> = {
  [COPPER]: { arm: [236, 150, 96], core: [255, 222, 196] },
  [SILVER]: { arm: [214, 224, 240], core: [255, 255, 255] },
  [GOLD]: { arm: [255, 214, 96], core: [255, 248, 210] },
};

export type Sites = { cells: Int32Array; near: Float32Array };

/** Chamfer steps in art pixels: across a cell, and diagonally (about 2√2). */
const ORTH = 2, DIAG = 3;

/** The ore cells within reach of a lit passage below the surface, each with
 * how near it is (1 next to the light, falling to 0 at the reach). Only a
 * hashed `share` of them is kept, so the rest never glint. */
export function sparkleSites(cells: Uint8Array, warm: Float32Array, surface: ArrayLike<number>, seed: number): Sites {
  const reach = SPARKLE.reach, far = reach + 1;
  const dist = new Uint8Array(CELLS).fill(far);
  for (let i = 0; i < CELLS; i++) {
    const x = i % W, y = (i / W) | 0;
    if (y > surface[x] && warm[i] >= SPARKLE.lit && isPassable(cells[i] as Material)) dist[i] = 0;
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let d = dist[i];
      if (d === 0) continue;
      if (x > 0) d = Math.min(d, dist[i - 1] + ORTH);
      if (y > 0) {
        d = Math.min(d, dist[i - W] + ORTH);
        if (x > 0) d = Math.min(d, dist[i - W - 1] + DIAG);
        if (x < W - 1) d = Math.min(d, dist[i - W + 1] + DIAG);
      }
      dist[i] = Math.min(d, far);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let d = dist[i];
      if (d === 0) continue;
      if (x < W - 1) d = Math.min(d, dist[i + 1] + ORTH);
      if (y < H - 1) {
        d = Math.min(d, dist[i + W] + ORTH);
        if (x < W - 1) d = Math.min(d, dist[i + W + 1] + DIAG);
        if (x > 0) d = Math.min(d, dist[i + W - 1] + DIAG);
      }
      dist[i] = Math.min(d, far);
    }
  const found: number[] = [], near: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    if (dist[i] > reach || !isOre(cells[i] as Material)) continue;
    if (hash01(i % W, (i / W) | 0, seed + 91) >= SPARKLE.share) continue;
    found.push(i);
    near.push(1 - dist[i] / far);
  }
  return { cells: Int32Array.from(found), near: Float32Array.from(near) };
}

/** Which of `FRAMES` cell (x, y) shows at `time`, or -1 while it rests. */
export function sparkleFrame(x: number, y: number, seed: number, time: number) {
  const period = SPARKLE.period + hash01(x, y, seed + 92) * SPARKLE.spread;
  const t = (time + hash01(x, y, seed + 93) * period) % period;
  const f = Math.floor(t / SPARKLE.frame);
  return f < FRAMES.length ? f : -1;
}

/** Draws frame `f` of a glint of ore `m` at art pixel (x, y), its colours
 * dimmed to `k`. */
export function drawGlint(fine: Fine, x: number, y: number, m: number, f: number, k = 1) {
  const glint = GLINT[m];
  if (!glint) return;
  const rgb = (c: RGB) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`, arm = rgb(glint.arm), core = rgb(glint.core);
  for (const [dx, dy] of FRAMES[f]) fine(x + dx * 0.5, y + dy * 0.5, 0.5, 0.5, dx || dy ? arm : core);
}

/** Which frame lump `n` of a heap at column `x` shows at `time`, or -1:
 * about one lump in three glints now and then. */
export function heapGlint(n: number, x: number, time: number) {
  if (hash01(n, Math.floor(x), 95) >= 0.35) return -1;
  return sparkleFrame(n, Math.floor(x), 96, time);
}

/** Where in its cell (x, y) glints: one of its four art pixels. */
export function sparkleSpot(x: number, y: number, seed: number) {
  const q = Math.floor(hash01(x, y, seed + 94) * 4);
  return { x: x + (q & 1) * 0.5, y: y + (q >> 1) * 0.5 };
}
