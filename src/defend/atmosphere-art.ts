/** Ground weather drawn as pixel art beneath every combat silhouette: the
 * desert's dunes and the Fungal Hollow's mist painted at `RES` art pixels a
 * cell into one board-sized image (repainted at most once a weather step),
 * then the blowing grains and the tumbleweeds, black-outlined sprites, over
 * it. Presentation only: it reads `sim.atmosphere` and changes nothing. */
import { CELLS_W, CELLS_H, cellIndex } from "./grid.ts";
import { weatherNoise, type Atmosphere } from "./atmosphere.ts";
import { ART } from "./park-art.ts";
import { OUTLINE, artPen, bake, blit } from "./pixel-fx.ts";
import type { DefendSim } from "./sim.ts";

/** Art pixels a cell in the weather image. */
const RES = 4;
const W = CELLS_W * RES, H = CELLS_H * RES;
/** A tiling noise texture, so the image never calls the noise per pixel. */
const TEX = 64;
/** Ordered dither thresholds, for the thin edges of dunes and mist. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
/** Sand, shadowed to lit. */
const SAND = [[138, 92, 46], [176, 126, 66], [204, 158, 88], [226, 188, 116], [242, 214, 150]];
/** The mist's tint, and the brightest swirl in it. */
const MIST = [206, 214, 222], SPORE = [232, 196, 220];

let texture: Float32Array | null = null;
function noiseTexture() {
  if (texture) return texture;
  texture = new Float32Array(TEX * TEX);
  // Wrapping value noise: the lattice repeats every 8 texels.
  const period = 8, cell = TEX / period;
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const n = weatherNoise(x / cell, y / cell), wx = weatherNoise((x - TEX) / cell, y / cell);
    const ny = weatherNoise(x / cell, (y - TEX) / cell), wxy = weatherNoise((x - TEX) / cell, (y - TEX) / cell);
    const u = x / TEX, v = y / TEX;
    texture[y * TEX + x] = (n * (1 - u) + wx * u) * (1 - v) + (ny * (1 - u) + wxy * u) * v;
  }
  return texture;
}
const tex = (t: Float32Array, x: number, y: number) => t[((y & (TEX - 1)) * TEX) + (x & (TEX - 1))];

/** Bilinear weights between cell centres for each art pixel column (and,
 * the same way, row): the two cells either side and the share of the second. */
function axis(n: number, cells: number) {
  const a = new Int32Array(n), b = new Int32Array(n), w = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const f = (p + .5) / RES - .5, c0 = Math.max(0, Math.min(cells - 1, Math.floor(f)));
    a[p] = c0; b[p] = Math.min(cells - 1, c0 + 1); w[p] = Math.max(0, Math.min(1, f - c0));
  }
  return { a, b, w };
}
const XS = axis(W, CELLS_W), YS = axis(H, CELLS_H);

/** A field's value at art pixel (x, y), bilinear between cell centres. */
function sample(field: Float32Array, x: number, y: number) {
  const u = XS.w[x], v = YS.w[y], r0 = YS.a[y] * CELLS_W, r1 = YS.b[y] * CELLS_W, x0 = XS.a[x], x1 = XS.b[x];
  const top = field[r0 + x0] + (field[r0 + x1] - field[r0 + x0]) * u;
  const bottom = field[r1 + x0] + (field[r1 + x1] - field[r1 + x0]) * u;
  return top + (bottom - top) * v;
}

/** One tumbleweed frame, `size` art pixels across: a scraggly ring of twigs
 * with spokes turned by `angle`, in a black outline. */
export function tumbleweedPixels(angle: number, size = 11) {
  const r = (size - 3) / 2, c = (size - 1) / 2, px: (string | null)[] = new Array(size * size).fill(null);
  const spokes = 5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - c, dy = (y - c) / .9, d = Math.sqrt(dx * dx + dy * dy);
    if (d > r + .4) continue;
    const a = Math.atan2(dy, dx) - angle;
    const ring = d > r - 1.1 && ((Math.floor((a + 7) * 3) + x * 3 + y) % 4 !== 0);
    let spoke = false;
    for (let k = 0; k < spokes && !spoke; k++) {
      const s = angle + k * Math.PI * 2 / spokes + (k % 2) * .5;
      spoke = Math.abs(dx * Math.sin(s) - dy * Math.cos(s)) < .55 && dx * Math.cos(s) + dy * Math.sin(s) > -r * .3;
    }
    if (ring || spoke) px[y * size + x] = (x + y * 2) % 3 ? "#b08850" : "#d6b474";
  }
  // Outline every twig where it meets the air.
  const out = px.slice();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (px[y * size + x]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
      const nx = x + ox, ny = y + oy;
      return nx >= 0 && ny >= 0 && nx < size && ny < size && px[ny * size + nx];
    });
    if (near) out[y * size + x] = OUTLINE;
  }
  return { size, px: out };
}

/** Frames over a fifth of a turn, after which the five spokes repeat. */
const WEED_FRAMES = 6;
/** A tumbleweed's size in art pixels, about two cells. */
const WEED = 15;
let weedSprites: HTMLCanvasElement[] | null = null;
function weeds() {
  if (weedSprites) return weedSprites;
  weedSprites = [];
  for (let f = 0; f < WEED_FRAMES; f++) {
    const { size, px } = tumbleweedPixels(f * Math.PI * 2 / (WEED_FRAMES * 5), WEED);
    const { cv, c } = bake(size, size);
    for (let i = 0; i < px.length; i++) if (px[i]) { c.fillStyle = px[i]!; c.fillRect(i % size, Math.floor(i / size), 1, 1); }
    weedSprites.push(cv);
  }
  return weedSprites;
}

export class AtmosphereArt {
  private canvas: HTMLCanvasElement | null = null;
  private data: ImageData | null = null;
  private sim: DefendSim | null = null;
  private key = "";
  private slope = new Float32Array(CELLS_W * CELLS_H);

  draw(c: CanvasRenderingContext2D, px: number, sim: DefendSim, reduceMotion: boolean, effects: boolean) {
    const env = sim.atmosphere;
    if (!env || (!env.mode && !env.sand.some(v => v > 0))) return;
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = W; this.canvas.height = H;
      this.data = this.canvas.getContext("2d")!.createImageData(W, H);
    }
    const key = `${env.time.toFixed(2)}:${env.mode}:${reduceMotion}:${effects}`;
    if (sim !== this.sim || key !== this.key) {
      this.sim = sim; this.key = key;
      this.paint(env, reduceMotion, effects);
      this.canvas.getContext("2d")!.putImageData(this.data!, 0, 0);
    }
    c.save();
    c.imageSmoothingEnabled = false;
    c.drawImage(this.canvas, 0, 0, CELLS_W * px, CELLS_H * px);
    if (effects && env.mode === "sand") this.drawBlowing(c, px, env, reduceMotion);
    if (effects && env.mode === "mist" && !reduceMotion) this.drawSpores(c, px, env);
    c.restore();
  }

  /** The dunes and the mist, a pixel at a time. */
  private paint(env: Atmosphere, reduceMotion: boolean, effects: boolean) {
    const out = this.data!.data, t = noiseTexture(), mist = env.mode === "mist";
    const s = env.sand, wind = env.wind;
    const drift = reduceMotion ? 0 : env.time;
    // Ripples run across the wind; a lit face toward the upper left.
    const wl = Math.sqrt(wind.x * wind.x + wind.y * wind.y) || 1, rx = wind.x / wl, ry = wind.y / wl;
    // Each cell's slope toward the lower right: positive faces the light.
    const slope = this.slope;
    for (let cy = 0; cy < CELLS_H; cy++) for (let cx = 0; cx < CELLS_W; cx++) {
      const at = (x: number, y: number) => s[cellIndex(Math.max(0, Math.min(CELLS_W - 1, x)), Math.max(0, Math.min(CELLS_H - 1, y)))];
      slope[cellIndex(cx, cy)] = (at(cx + 1, cy) - at(cx - 1, cy) + at(cx, cy + 1) - at(cx, cy - 1)) * .5;
    }
    out.fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cx = (x / RES) | 0, cy = (y / RES) | 0, i = cellIndex(cx, cy), k = (y * W + x) * 4;
      if (!env.passage[i]) continue;
      const dither = BAYER[(y & 3) * 4 + (x & 3)];
      const grain = tex(t, x, y);
      const depth = env.passage[i] === 1 ? sample(s, x, y) : 0;
      if (depth > .06) {
        // Thin sand breaks up into dithered drifts; deep sand covers the floor.
        const cover = (depth - .12) / .3 + (grain - .5) * .6;
        if (cover >= dither) {
          const ripple = depth > .3 ? (((x * rx + y * ry) * .45 + grain * 2.2) % 3 + 3) % 3 : 1.5;
          let tone = 2 + Math.round(sample(slope, x, y) * 6 + (grain - .5) * .8);
          if (ripple < .7) tone += 1; else if (ripple < 1.2) tone -= 1;
          if (cover < dither + .15) tone = Math.min(tone, 1);
          const col = SAND[Math.max(0, Math.min(4, tone))];
          out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = 255;
          continue;
        }
      }
      if (!mist || !effects) continue;
      const air = sample(env.air, x, y);
      if (air < .02) continue;
      // The swirl shifts the texture under it, so vortices visibly turn it.
      const ox = env.vx[i] * 6 + drift * (wind.x * 3 + 1.5), oy = env.vy[i] * 6 + drift * (wind.y * 3 + .6);
      const n = tex(t, Math.floor(x * .5 + ox), Math.floor(y * .5 + oy)) * .6 + tex(t, Math.floor(x * .25 - ox * .5 + 17), Math.floor(y * .25 - oy * .4 + 5)) * .4;
      const density = air * (.35 + n * 1.1);
      const level = Math.min(3, Math.floor(density * 3.2 + dither * .9));
      if (level <= 0) continue;
      const col = level === 3 ? SPORE : MIST;
      out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = [0, 34, 58, 84][level];
    }
  }

  /** Grains streaking along the wind, and the tumbleweeds bouncing past. */
  private drawBlowing(c: CanvasRenderingContext2D, px: number, env: Atmosphere, reduceMotion: boolean) {
    const dot = artPen(c, px), wind = env.wind;
    if (!reduceMotion) {
      for (let n = 0; n < env.grains.length; n++) {
        const p = env.grains[n];
        // Each simulated grain draws three: itself and two following it.
        for (let g = 0; g < 3; g++) {
          const ox = g ? ((n * 7 + g * 13) % 9) / 3 - 1.5 : 0, oy = g ? ((n * 5 + g * 11) % 9) / 3 - 1.5 : 0;
          const x = (p.x + ox) * ART, y = (p.y + oy) * ART;
          if (x < 0 || y < 0 || x >= CELLS_W * ART || y >= CELLS_H * ART) continue;
          c.fillStyle = (n + g) % 3 ? "rgba(236,204,140,.75)" : "rgba(196,150,86,.8)";
          dot(Math.round(x), Math.round(y));
          dot(Math.round(x - wind.x * 2), Math.round(y - wind.y * 2));
          if ((n + g) % 2) dot(Math.round(x - wind.x * 4), Math.round(y - wind.y * 4));
        }
      }
    }
    const frames = weeds();
    for (const p of env.weeds) {
      const turn = reduceMotion ? 0 : p.turn;
      const frame = frames[((Math.floor(turn * 2) % WEED_FRAMES) + WEED_FRAMES) % WEED_FRAMES];
      const hop = reduceMotion ? 0 : Math.abs(Math.sin(turn * 1.3)) * 3;
      const ax = Math.round(p.x * ART) - (WEED >> 1), ay = Math.round(p.y * ART) - WEED + 3;
      c.fillStyle = "rgba(40,24,10,.28)";
      dot(ax + 3, ay + WEED - 2, WEED - 6, 2);
      blit(c, px, frame, ax, ay - Math.round(hop));
    }
  }

  /** A few pink spores floating in the thickest mist. */
  private drawSpores(c: CanvasRenderingContext2D, px: number, env: Atmosphere) {
    const dot = artPen(c, px);
    c.fillStyle = "rgba(240,190,222,.7)";
    for (let n = 0; n < 90; n++) {
      const bx = ((n * 37) % CELLS_W) + .5, by = ((n * 53) % CELLS_H) + .5;
      const x = bx + Math.sin(env.time * .4 + n) * 1.5 + env.time * env.wind.x * .15, y = by + Math.cos(env.time * .3 + n * 1.7) * 1.5 + env.time * env.wind.y * .15;
      const wx = ((x % CELLS_W) + CELLS_W) % CELLS_W, wy = ((y % CELLS_H) + CELLS_H) % CELLS_H;
      if (env.air[cellIndex(wx | 0, wy | 0)] < .25) continue;
      dot(Math.round(wx * ART), Math.round(wy * ART));
    }
  }
}
