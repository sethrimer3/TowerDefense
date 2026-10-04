/** Blasts and the cracks they leave, as pixel art at `ART` pixels a cell
 * inside the city's black outline:
 *
 * - **Explosion:** a ragged fireball, white-hot at its heart through yellow,
 *   orange and red to a rim of smoke lit from the upper left, inside a black
 *   outline, with a flash ring racing out and sparks and debris flung clear.
 *   As it burns out the fire cools to smoke that rises and breaks up. Baked
 *   once per size, look and frame (`FRAMES` over the effect's life).
 * - **Cracks:** a dithered patch of scorched ground and branching cracks
 *   outlined in black, glowing white and yellow at the blast's heart and red
 *   toward their tips, cooling through red to dark as they fade. Baked once
 *   per scorch and heat step.
 *
 * Presentation only: every pixel is hashed from the blast's seed. */
import { hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { bake, blit, FLAME, OUTLINE, SMOKE } from "./pixel-fx.ts";
import type { Effect, Scorch } from "./sim.ts";

type Ctx = CanvasRenderingContext2D;

/** Frames baked over an explosion's life, and looks per size. */
const FRAMES = 14;
const LOOKS = 6;
/** How long an explosion lasts (seconds), as the sim ages its effects. */
const BOOM_LIFE = 0.6;
/** Heat steps a scorch's cracks are baked at. */
const HEATS = 7;

const booms = new Map<string, { img: HTMLCanvasElement; ox: number; oy: number }>();

/** A blast `fx` at its age, centred where it went off. */
export function drawExplosion(c: Ctx, px: number, fx: Effect) {
  const k = Math.min(0.999, fx.t / BOOM_LIFE);
  const R = Math.max(3, Math.round(fx.r * ART)), look = ((fx.seed ?? 0) >>> 0) % LOOKS, frame = Math.floor(k * FRAMES);
  const key = `${R}:${look}:${frame}`;
  let s = booms.get(key);
  if (!s) {
    if (booms.size > 2000) booms.clear();
    s = bakeBoom(R, look, (frame + 0.5) / FRAMES);
    booms.set(key, s);
  }
  c.save();
  c.imageSmoothingEnabled = false;
  blit(c, px, s.img, Math.round(fx.x * ART) - s.ox, Math.round(fx.y * ART) - s.oy);
  c.restore();
}

/** One frame of an explosion of radius `R` art pixels, `k` through its life. */
function bakeBoom(R: number, look: number, k: number) {
  const E = Math.ceil(R * 2.2) + 2, N = 2 * E + 1;
  const grid: (string | null)[] = new Array(N * N).fill(null);
  const at = (x: number, y: number) => (x + E >= 0 && x + E < N && y + E >= 0 && y + E < N ? (y + E) * N + x + E : -1);
  // The fireball swells fast, then the smoke spreads a little and rises.
  const Rf = R * (0.3 + 0.7 * Math.sqrt(Math.min(1, k / 0.45))) * (1 + 0.2 * Math.max(0, k - 0.45));
  const rise = k * k * R * 0.45;
  const heat = 1.2 - 1.45 * k;
  const lobe = (a: number) => {
    const u = ((a / (Math.PI * 2)) * 9 + 9) % 9, i = Math.floor(u), f = u - i;
    return 1 + 0.24 * ((hash01(look, 1, i) - 0.5) * (1 - f) + (hash01(look, 1, (i + 1) % 9) - 0.5) * f) * 2;
  };
  const fade = Math.max(0, (k - 0.55) / 0.45);
  for (let y = -E; y <= E; y++)
    for (let x = -E; x <= E; x++) {
      const yy = y + rise;
      const d = Math.sqrt(x * x + yy * yy * 1.12) / (Rf * lobe(Math.atan2(yy, x))) + (hash01(look, 2, x, y) - 0.5) * 0.1;
      if (d > 1) continue;
      // Late on, the smoke breaks up in chunks.
      if (fade > 0 && hash01(look, 3, x >> 1, y >> 1) < fade * 1.15 - d * 0.2) continue;
      const T = heat * (1 - d * 0.85) + (hash01(look, 4, x, y) - 0.5) * 0.1;
      let col: string;
      if (T > 0.84) col = FLAME[4];
      else if (T > 0.64) col = FLAME[3];
      else if (T > 0.44) col = FLAME[2];
      else if (T > 0.27) col = FLAME[1];
      else if (T > 0.15) col = FLAME[0];
      else {
        // Smoke, lit from the upper left.
        const lit = (x + yy) / Rf;
        col = lit < -0.5 ? SMOKE[2] : lit < 0.2 ? SMOKE[1] : SMOKE[0];
      }
      grid[at(x, y)] = col;
    }
  // The black outline round everything filled.
  const outline: number[] = [];
  for (let y = -E; y <= E; y++)
    for (let x = -E; x <= E; x++) {
      if (grid[at(x, y)]) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) >= 0 && grid[at(x + dx, y + dy)] && grid[at(x + dx, y + dy)] !== OUTLINE) { near = true; break; }
      if (near) outline.push(at(x, y));
    }
  for (const i of outline) grid[i] = OUTLINE;
  // The flash ring racing out, dithered.
  if (k < 0.3) {
    const ring = R * (0.7 + k * 3.2);
    for (let y = -E; y <= E; y++)
      for (let x = -E; x <= E; x++) {
        const i = at(x, y);
        if (grid[i] || (x + y) & 1) continue;
        if (Math.abs(Math.sqrt(x * x + y * y * 1.12) - ring) < 0.7) grid[i] = k < 0.15 ? FLAME[4] : FLAME[3];
      }
  }
  // Sparks and debris flung clear, cooling as they fly.
  if (k < 0.85)
    for (let n = 0; n < 8 + R; n++) {
      const a = hash01(look, 5, n) * Math.PI * 2, far = R * (0.5 + hash01(look, 6, n) * 1.4) * Math.sqrt(k / 0.85) * 1.1;
      const x = Math.round(Math.cos(a) * far), y = Math.round(Math.sin(a) * far * 0.9 + k * k * R * 0.5);
      const i = at(x, y);
      if (i < 0 || (grid[i] && grid[i] !== OUTLINE && far < Rf)) continue;
      grid[i] = n % 4 === 0 ? SMOKE[0] : FLAME[Math.max(1, 4 - Math.floor(k * 5 + hash01(look, 7, n)))];
    }
  const { cv, c } = bake(N, N);
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue;
    c.fillStyle = grid[i]!;
    c.fillRect(i % N, Math.floor(i / N), 1, 1);
  }
  return { img: cv, ox: E, oy: E };
}

// ── Cracks ─────────────────────────────────────────────────────────────────

type ScorchArt = { char: HTMLCanvasElement; cracks: (HTMLCanvasElement | undefined)[]; pixels: Map<number, number>; E: number; used: number };
const scorchArt = new Map<string, ScorchArt>();
let drawn = 0;

/** Every scorch: its charred patch, then its glowing cracks. */
export function drawScorches(c: Ctx, px: number, scorches: readonly Scorch[]) {
  if (!scorches.length) return;
  drawn++;
  c.save();
  c.imageSmoothingEnabled = false;
  for (const sc of scorches) {
    const R = Math.max(3, Math.round(sc.r * ART)), key = `${sc.seed}:${R}`;
    let art = scorchArt.get(key);
    if (!art) scorchArt.set(key, (art = bakeScorch(sc, R)));
    art.used = drawn;
    const k = Math.min(1, sc.t / sc.life), heat = (1 - k) ** 1.1;
    const level = Math.round(heat * (HEATS - 1));
    const ax = Math.round(sc.x * ART) - art.E, ay = Math.round(sc.y * ART) - art.E;
    c.globalAlpha = 0.9 * (1 - k * k);
    blit(c, px, art.char, ax, ay);
    c.globalAlpha = Math.min(1, (1 - k) * 3);
    blit(c, px, (art.cracks[level] ??= bakeCracks(art, level / (HEATS - 1))), ax, ay);
  }
  c.restore();
  // Forget scorches long gone.
  if (scorchArt.size > scorches.length + 64) for (const [key, art] of scorchArt) if (art.used !== drawn) scorchArt.delete(key);
}

/** The charred patch and where each crack runs, with how far along it each
 * pixel lies (0 at the blast, 1 at a tip). */
function bakeScorch(sc: Scorch, R: number): ScorchArt {
  const E = R + 2, N = 2 * E + 1;
  const { cv, c } = bake(N, N);
  const P = R * 0.6;
  for (let y = -E; y <= E; y++)
    for (let x = -E; x <= E; x++) {
      const d = Math.sqrt(x * x + y * y * 1.2) / P;
      const edge = d + (hash01(sc.seed, x, y, 40) - 0.5) * 0.4;
      if (edge > 1 || hash01(sc.seed, x, y, 41) > 0.85 - edge * 0.5) continue;
      c.fillStyle = edge < 0.55 ? "#1a0f0a" : "#2e2018";
      c.fillRect(x + E, y + E, 1, 1);
    }
  const pixels = new Map<number, number>();
  const plot = (x: number, y: number, t: number) => {
    const ix = Math.round(x), iy = Math.round(y);
    if (Math.abs(ix) > E - 1 || Math.abs(iy) > E - 1) return;
    const i = (iy + E) * N + ix + E;
    pixels.set(i, Math.min(t, pixels.get(i) ?? 1));
    // Wider near the heart of the blast.
    if (t < 0.15) {
      const j = (iy + E) * N + ix + E + 1;
      pixels.set(j, Math.min(t + 0.05, pixels.get(j) ?? 1));
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, t0: number, t1: number) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
    for (let s = 0; s <= n; s++) plot(x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n, t0 + ((t1 - t0) * s) / n);
  };
  const arms = 5 + ((hash01(sc.seed, 30) * 3) | 0);
  for (let i = 0; i < arms; i++) {
    let a = (i / arms) * Math.PI * 2 + hash01(sc.seed, 31, i) * 0.9;
    let x = 0, y = 0;
    const len = R * (0.5 + hash01(sc.seed, 32, i) * 0.45), steps = 4;
    for (let j = 1; j <= steps; j++) {
      a += (hash01(sc.seed, 33, i * 7 + j) - 0.5) * 0.9;
      const nx = x + (Math.cos(a) * len) / steps, ny = y + (Math.sin(a) * len) / steps;
      line(x, y, nx, ny, (j - 1) / steps, j / steps);
      [x, y] = [nx, ny];
      if (j === 2 && hash01(sc.seed, 34, i) < 0.6) {
        const f = a + (hash01(sc.seed, 35, i) < 0.5 ? 0.9 : -0.9);
        line(x, y, x + Math.cos(f) * len * 0.3, y + Math.sin(f) * len * 0.3, 0.5, 0.9);
      }
    }
  }
  return { char: cv, cracks: [], pixels, E, used: drawn };
}

/** The cracks at `heat` (0 cold to 1 fresh): a black rim round a line
 * glowing hottest at the blast. */
function bakeCracks(art: ScorchArt, heat: number) {
  const N = 2 * art.E + 1;
  const { cv, c } = bake(N, N);
  c.fillStyle = OUTLINE;
  for (const i of art.pixels.keys())
    for (const j of [i - 1, i + 1, i - N, i + N]) if (!art.pixels.has(j)) c.fillRect(j % N, Math.floor(j / N), 1, 1);
  for (const [i, t] of art.pixels) {
    const g = heat * (1.15 - 0.75 * t);
    c.fillStyle = g > 0.85 ? FLAME[4] : g > 0.66 ? FLAME[3] : g > 0.46 ? FLAME[2] : g > 0.28 ? FLAME[1] : g > 0.12 ? FLAME[0] : "#3a2418";
    c.fillRect(i % N, Math.floor(i / N), 1, 1);
  }
  return cv;
}
