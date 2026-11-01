/** Ground weather drawn as pixel art beneath every combat silhouette. The
 * desert's dunes are one tiling sprite (`dunePixels`, `ART` pixels a cell)
 * of a few long, gentle swells (`duneHeights`), every pixel shaded by its
 * slope toward the day's sun (`setDuneLight`: its heading and how strongly
 * it shades, from the shared sky) in a handful of flat sand tones, no
 * dithering, so it reads as simple pixel art. It is drawn with the city's
 * ground, under the battle's darkness and tint, so night darkens it and the
 * day's colours wash over it like the rest of the board; the wall's hanging
 * faces are copied back over it. It is laid over all the open ground
 * outside the city at the field's drift, recomposed only when the drift
 * moves a whole art pixel, the light turns or the ground changes. Over it
 * `SandMarks` keeps what the battle did to the sand (trails walked into the
 * raised swells, craters blasted out of it) and repaints only the small
 * chunks that changed. Sand blown into the city and the Fungal Hollow's
 * mist are painted at `RES` art pixels a cell, the city's only over the
 * cells holding any. Then the tumbleweeds, black-outlined sprites in
 * several sizes, over it. Presentation only: it reads `sim.atmosphere` and
 * changes nothing. */
import { CELLS_W, CELLS_H, CELL_COUNT, cellIndex, hash } from "./grid.ts";
import { DUNE_PERIOD, WEED_SIZES, periodicNoise, weatherNoise, type Atmosphere } from "./atmosphere.ts";
import { ENEMIES } from "./catalog.ts";
import { ART } from "./park-art.ts";
import { OUTLINE, artPen, bake, blit } from "./pixel-fx.ts";
import type { DefendSim, Effect } from "./sim.ts";
import type { Sun } from "../daylight.ts";

/** Art pixels a cell in the weather image. */
const RES = 4;
const W = CELLS_W * RES, H = CELLS_H * RES;
/** The board in art pixels, as the dunes are drawn. */
const BW = CELLS_W * ART, BH = CELLS_H * ART;
/** A tiling noise texture, so the image never calls the noise per pixel. */
const TEX = 64;
/** Ordered dither thresholds, for the mist's thin edges. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
/** The sand's few flat tones, shade to sunlit; the middle one is flat ground. */
export const DUNE_TONES = [[150, 98, 54], [184, 130, 72], [212, 160, 96], [232, 188, 124], [246, 212, 154]];
const MID = 2;
/** Art pixels the swells stand over their troughs, at their tallest. */
export const DUNE_RELIEF = 9;
/** Cells from one swell's crest to the next (two to a field period, so it tiles). */
export const SWELL = 48;
/** Cells the crests lean per cell across (a whole number of swells a period). */
const SWELL_LEAN = .5;
/** Below this share of a swell's height the sand is the floor's flat sheet:
 * nothing walks a trail into it. */
export const FLOOR = .12;
/** The sun the dunes were lit by while there is no shared sky: low in the
 * upper left, as the city's shadows fall. `x`, `y` point toward it. */
export const SUN = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };

/** The light the dunes are shaded by: the heading toward the sun across the
 * ground (`x`, `y`, a unit vector) and how strongly slopes show (`contrast`:
 * 1 in full sun, low at night when only the dark's flat glow is left). */
const light = { x: SUN.x, y: SUN.y, contrast: 1, key: "" };
/** Headings the light snaps to, and contrast steps: the tile is relit only
 * when the snapped light changes, every several seconds through a day. */
const HEADINGS = 32, CONTRASTS = 6;
/** Turn the dunes' light to the shared sky's sun (`sun`, the direction its
 * shadows fall and their strength), or back to the fixed one without a sky.
 * Returns whether it changed. */
export function setDuneLight(sun?: Sun) {
  let x = SUN.x, y = SUN.y, contrast = 1;
  if (sun) {
    const l = Math.sqrt(sun.x * sun.x + sun.y * sun.y);
    if (l > 1e-6) { x = -sun.x / l; y = -sun.y / l; }
    contrast = .3 + .7 * Math.min(1, sun.strength / .27);
  }
  const step = Math.round(Math.atan2(y, x) / (Math.PI * 2) * HEADINGS), level = Math.round(contrast * CONTRASTS);
  const key = `${(step + HEADINGS) % HEADINGS}:${level}`;
  if (key === light.key) return false;
  const a = step / HEADINGS * Math.PI * 2;
  light.x = Math.cos(a); light.y = Math.sin(a); light.contrast = level / CONTRASTS; light.key = key;
  return true;
}
setDuneLight();
/** The current light's key, which changes whenever the dunes relight. */
export function duneLightKey() { return light.key; }

/** How a surface rising by (gx, gy) art pixels a pixel faces the sun: 1 a
 * steep face toward it, -1 one turned away, 0 flat, at full contrast. */
export function sunlight(gx: number, gy: number) {
  const s = -(gx * light.x + gy * light.y) / slopeScale();
  return s > 1 ? 1 : s < -1 ? -1 : s;
}
/** The tone a pixel takes in that light, with a rare grain a shade off. */
function duneTone(s: number, tx: number, ty: number) {
  let t = Math.round(MID + s * light.contrast * 2.3);
  if (hash(tx, ty, 79) % 293 === 0) t--;
  return DUNE_TONES[t < 0 ? 0 : t >= DUNE_TONES.length ? DUNE_TONES.length - 1 : t];
}

let heights: Float32Array | null = null;
let steepest = 0;
/** The swells' surface over one field period, art pixels high at `ART`
 * pixels a cell: long, low, rounded rises and falls running across the
 * wind, gently bent and a little taller in places. Tiles. */
export function duneHeights() {
  if (heights) return heights;
  const n = DUNE_PERIOD * ART, p = DUNE_PERIOD;
  heights = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const cx = (x + .5) / ART, cy = (y + .5) / ART;
    const bend = periodicNoise(cx / 32, cy / 32, p / 32, p / 32, 821) * .45;
    const amp = .65 + .35 * periodicNoise(cx / 48, cy / 48, p / 48, p / 48, 823);
    const phase = (cy - cx * SWELL_LEAN) / SWELL + bend;
    heights[y * n + x] = (.5 - .5 * Math.cos(phase * Math.PI * 2)) * amp * DUNE_RELIEF;
  }
  return heights;
}
/** The steepest slope of the swells, which full shade is measured against. */
function slopeScale() {
  if (steepest) return steepest;
  const n = DUNE_PERIOD * ART, h = duneHeights();
  let most = 1e-3;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const gx = (h[y * n + (x + 1) % n] - h[y * n + (x + n - 1) % n]) * .5, gy = (h[((y + 1) % n) * n + x] - h[((y + n - 1) % n) * n + x]) * .5;
    const g = Math.sqrt(gx * gx + gy * gy);
    if (g > most) most = g;
  }
  return steepest = most;
}

/** The tiling dune sprite, `DUNE_PERIOD * ART` pixels square, RGBA, opaque:
 * every pixel of `duneHeights` shaded by its slope in the current light.
 * Tiles seamlessly; pure. */
export function dunePixels() {
  const n = DUNE_PERIOD * ART, h = duneHeights(), out = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    const up = ((y + n - 1) % n) * n, down = ((y + 1) % n) * n, row = y * n;
    for (let x = 0; x < n; x++) {
      const l = (x + n - 1) % n, r = (x + 1) % n;
      const col = duneTone(sunlight((h[row + r] - h[row + l]) * .5, (h[down + x] - h[up + x]) * .5), x, y);
      const k = (row + x) * 4;
      out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = 255;
    }
  }
  return { size: n, data: out };
}
let duneSprite: HTMLCanvasElement | null = null;
let duneSpriteKey = "";
function dunes() {
  if (duneSprite && duneSpriteKey === light.key) return duneSprite;
  const { size, data } = dunePixels();
  if (!duneSprite) { duneSprite = document.createElement("canvas"); duneSprite.width = duneSprite.height = size; }
  const c = duneSprite.getContext("2d")!, image = c.createImageData(size, size);
  image.data.set(data);
  c.putImageData(image, 0, 0);
  duneSpriteKey = light.key;
  return duneSprite;
}

/** Art pixels a side of one of `SandMarks`' chunks. */
export const CHUNK = 16;
const CW = BW / CHUNK, CH = BH / CHUNK;
/** Trails: how deep a footprint presses into a full swell, and the lip it
 * pushes up either side; how many units print a frame at most. */
const TRAIL = { depth: 1.4, lip: .6, step: 1.5, perFrame: 500 };
/** Craters: depth a cell of blast radius, deepest, and the rim's height. */
const CRATER = { depth: 3, max: 8, rim: .5, reach: 1.7 };
/** The wind fills marks back in: every `every` seconds of battle a chunk's
 * marks keep `keep` of their depth, and go once shallower than `gone`. */
const HEAL = { every: 2.5, keep: .9, gone: .25, perFrame: 48 };
/** Chunks repainted a frame at most; the rest wait their turn. */
const PAINT_PER_FRAME = 48;

/** What the battle does to the dunes, as art pixels over the board: an
 * RGBA image of `CHUNK`-square chunks, of which only those holding marks
 * are painted (the rest clear, so the dune tile shows) and only those whose
 * marks, drift, light or ground changed are repainted (`dirty`, at most
 * `PAINT_PER_FRAME` a frame). Heights are kept as `delta`, art pixels added
 * to the drifting dunes' surface where they lie on the board, so a trail
 * stays put while the dune creeps under it, and the wind smooths them away
 * chunk by chunk. Pure: no canvas. */
export class SandMarks {
  readonly pixels = new Uint8ClampedArray(BW * BH * 4);
  readonly delta = new Float32Array(BW * BH);
  /** Chunks holding marks, and those to repaint. */
  readonly active = new Set<number>();
  readonly dirty = new Set<number>();
  /** Chunks painted since the caller last took them, to upload. */
  readonly painted: number[] = [];
  private surface = new Float32Array((CHUNK + 2) * (CHUNK + 2));
  private healed = new Float32Array(CW * CH);
  private seen = new WeakSet<Effect>();
  private printed = new WeakMap<object, { x: number; y: number }>();
  private cursor = 0;
  private ox = 0;
  private oy = 0;
  private lightKey = light.key;
  private ground: Uint8Array = new Uint8Array(CELL_COUNT);

  /** The dunes' own height at board art pixel (x, y), under the drift. */
  base(x: number, y: number) {
    const n = DUNE_PERIOD * ART, h = duneHeights();
    return h[(((y - this.oy) % n + n) % n) * n + (((x - this.ox) % n + n) % n)];
  }

  /** Where the dunes lie and the drift they lie at; a change (or the light
   * turning) repaints every mark. */
  setGround(ground: Uint8Array, ox: number, oy: number, changed: boolean) {
    this.ground = ground;
    if (!changed && ox === this.ox && oy === this.oy && this.lightKey === light.key) return;
    this.ox = ox; this.oy = oy; this.lightKey = light.key;
    for (const k of this.active) this.dirty.add(k);
  }

  private touch(x0: number, y0: number, x1: number, y1: number) {
    for (let cy = Math.max(0, Math.floor(y0 / CHUNK)); cy <= Math.min(CH - 1, Math.floor(y1 / CHUNK)); cy++)
      for (let cx = Math.max(0, Math.floor(x0 / CHUNK)); cx <= Math.min(CW - 1, Math.floor(x1 / CHUNK)); cx++) {
        const k = cy * CW + cx;
        if (!this.active.has(k)) { this.active.add(k); this.healed[k] = this.time; }
        this.dirty.add(k);
      }
  }
  private time = 0;

  /** A footprint at board art pixel (x, y), `r` across: pressed into a
   * swell as deep as it stands above the floor's sheet, a lip either side. */
  print(x: number, y: number, r: number) {
    const reach = r + 1.6, x0 = Math.max(0, Math.floor(x - reach)), x1 = Math.min(BW - 1, Math.ceil(x + reach));
    const y0 = Math.max(0, Math.floor(y - reach)), y1 = Math.min(BH - 1, Math.ceil(y + reach));
    let any = false;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      if (!this.ground[(py >> 3) * CELLS_W + (px >> 3)]) continue;
      const k = (this.base(px, py) / DUNE_RELIEF - FLOOR) / .25;
      if (k <= 0) continue;
      const ox = px + .5 - x, oy = py + .5 - y, d = Math.sqrt(ox * ox + oy * oy), i = py * BW + px, w = k > 1 ? 1 : k;
      if (d < r) { const v = -TRAIL.depth * w * (1 - d * d / (r * r)); if (v < this.delta[i]) { this.delta[i] = v; any = true; } }
      else if (d < reach && this.delta[i] >= 0) { const v = TRAIL.lip * w * (1 - (d - r) / 1.6); if (v > this.delta[i]) { this.delta[i] = v; any = true; } }
    }
    if (any) this.touch(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  /** A blast's crater, `r` art pixels across, its sand thrown out into a rim. */
  crater(x: number, y: number, r: number) {
    const depth = Math.min(CRATER.max, r / ART * CRATER.depth), reach = r * CRATER.reach;
    const x0 = Math.max(0, Math.floor(x - reach)), x1 = Math.min(BW - 1, Math.ceil(x + reach));
    const y0 = Math.max(0, Math.floor(y - reach)), y1 = Math.min(BH - 1, Math.ceil(y + reach));
    let any = false;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      if (!this.ground[(py >> 3) * CELLS_W + (px >> 3)]) continue;
      const ox = px + .5 - x, oy = py + .5 - y, d = Math.sqrt(ox * ox + oy * oy), i = py * BW + px;
      if (d < r) { const v = -depth * (1 - d * d / (r * r)); if (v < this.delta[i]) { this.delta[i] = v; any = true; } }
      else if (d < reach) {
        const t = 1 - (d - r) / (reach - r), v = depth * CRATER.rim * t * t;
        if (this.delta[i] > -.5 && v > this.delta[i]) { this.delta[i] = v; any = true; }
      }
    }
    if (any) this.touch(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  /** One frame: new craters from the battle's blasts, trails from whoever
   * walks the dunes, the wind smoothing old marks, then the chunks that
   * changed repainted. */
  update(sim: DefendSim) {
    this.time = sim.time;
    for (const e of sim.effects) if (e.kind === "boom" && !this.seen.has(e)) {
      this.seen.add(e);
      this.crater(e.x * ART, e.y * ART, Math.max(.6, e.r * .8) * ART);
    }
    this.walk(sim);
    this.heal();
    this.paint();
  }

  /** Trails: each walker prints a footprint every `TRAIL.step` art pixels it
   * goes over the dunes, a bounded few hundred a frame, taken in turn. */
  private walk(sim: DefendSim) {
    let budget = TRAIL.perFrame;
    const lists = [sim.enemies, sim.soldiers, sim.civilians] as { x: number; y: number; hp: number; kind?: string; perch?: unknown }[][];
    const total = lists[0].length + lists[1].length + lists[2].length;
    if (!total) return;
    let n = this.cursor % total;
    for (let seen = 0; seen < total && budget > 0; seen++, n = (n + 1) % total) {
      let u: { x: number; y: number; hp: number; kind?: string; perch?: unknown };
      if (n < lists[0].length) u = lists[0][n];
      else if (n < lists[0].length + lists[1].length) u = lists[1][n - lists[0].length];
      else u = lists[2][n - lists[0].length - lists[1].length];
      if (u.hp <= 0 || u.perch) continue;
      const cx = Math.floor(u.x), cy = Math.floor(u.y);
      if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H || !this.ground[cy * CELLS_W + cx]) continue;
      const def = n < lists[0].length ? ENEMIES[u.kind as keyof typeof ENEMIES] : undefined;
      if (def?.flying) continue;
      const x = u.x * ART, y = u.y * ART, last = this.printed.get(u);
      if (last) {
        const dx = x - last.x, dy = y - last.y;
        if (dx * dx + dy * dy < TRAIL.step * TRAIL.step) continue;
        last.x = x; last.y = y;
      } else this.printed.set(u, { x, y });
      const r = def ? Math.max(1.2, Math.min(6, def.size * ART * .3)) : 1.3;
      this.print(x, y, r);
      budget--;
    }
    this.cursor = n;
  }

  /** The wind fills marks back in, a chunk at a time every `HEAL.every`
   * seconds of battle; a chunk left with nothing goes quiet. */
  private heal() {
    let budget = HEAL.perFrame;
    for (const k of this.active) {
      if (budget <= 0) break;
      if (this.time - this.healed[k] < HEAL.every) continue;
      this.healed[k] = this.time; budget--;
      const x0 = (k % CW) * CHUNK, y0 = Math.floor(k / CW) * CHUNK;
      for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) {
        const i = y * BW + x, v = this.delta[i] * HEAL.keep;
        this.delta[i] = v > -HEAL.gone && v < HEAL.gone ? 0 : v;
      }
      this.dirty.add(k);
    }
  }

  /** Repaint the dirty chunks, a bounded number a frame. */
  private paint() {
    let budget = PAINT_PER_FRAME;
    for (const k of this.dirty) {
      if (budget-- <= 0) break;
      this.dirty.delete(k);
      this.paintChunk(k);
      this.painted.push(k);
    }
  }

  /** One chunk: over the dunes their surface with its marks, shaded as the
   * tile is (so an unmarked pixel matches it exactly); clear elsewhere. A
   * chunk with no marks left goes quiet, left clear. */
  paintChunk(k: number) {
    const x0 = (k % CW) * CHUNK, y0 = Math.floor(k / CW) * CHUNK, out = this.pixels, delta = this.delta;
    const n = DUNE_PERIOD * ART;
    let keep = false;
    // The surface over the chunk and a pixel round it, read once.
    const S = CHUNK + 2, surface = this.surface;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = Math.max(0, Math.min(BW - 1, x0 + i - 1)), y = Math.max(0, Math.min(BH - 1, y0 + j - 1));
      surface[j * S + i] = this.base(x, y) + delta[y * BW + x];
    }
    for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) {
      const i = y * BW + x, o = i * 4, c = (y >> 3) * CELLS_W + (x >> 3);
      if (delta[i]) keep = true;
      if (this.ground[c]) {
        const tx = ((x - this.ox) % n + n) % n, ty = ((y - this.oy) % n + n) % n;
        const m = (y - y0 + 1) * S + x - x0 + 1;
        const col = duneTone(sunlight((surface[m + 1] - surface[m - 1]) * .5, (surface[m + S] - surface[m - S]) * .5), tx, ty);
        out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255;
      } else out[o + 3] = 0;
    }
    if (!keep) this.active.delete(k);
  }
}

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
/** Each size of tumbleweed across, in art pixels: a tuft of a cell up to
 * a great ball of nearly three. */
export const WEED_PX = [9, 12, 15, 21];
let weedSprites: HTMLCanvasElement[][] | null = null;
function weeds() {
  if (weedSprites) return weedSprites;
  weedSprites = [];
  for (let s = 0; s < WEED_SIZES; s++) {
    const frames: HTMLCanvasElement[] = [];
    for (let f = 0; f < WEED_FRAMES; f++) {
      const { size, px } = tumbleweedPixels(f * Math.PI * 2 / (WEED_FRAMES * 5) + s * .7, WEED_PX[s]);
      const { cv, c } = bake(size, size);
      for (let i = 0; i < px.length; i++) if (px[i]) { c.fillStyle = px[i]!; c.fillRect(i % size, Math.floor(i / size), 1, 1); }
      frames.push(cv);
    }
    weedSprites.push(frames);
  }
  return weedSprites;
}

export class AtmosphereArt {
  /** City sand and mist, `RES` art pixels a cell. */
  private canvas: HTMLCanvasElement | null = null;
  private data: ImageData | null = null;
  private sim: DefendSim | null = null;
  private key = "";
  /** Art pixels of the city sand last painted, cleared before the next. */
  private painted: number[] = [];
  private shown = false;
  private misty = false;
  private slope = new Float32Array(CELL_COUNT);
  /** Trails, craters and the spill over the wall, and their image. */
  readonly marks = new SandMarks();
  private marksCanvas: HTMLCanvasElement | null = null;
  private marksImage: ImageData | null = null;
  private marksShown = false;
  private gateCells = new Uint8Array(CELL_COUNT);
  private gateMap: unknown = null;
  /** The dunes laid over the open ground, `ART` pixels a cell. */
  private dunes: HTMLCanvasElement | null = null;
  private duneKey = "";
  /** Which cells the dunes may cover, one pixel a cell, and what it was built from. */
  private mask: HTMLCanvasElement | null = null;
  private ground = new Uint8Array(CELL_COUNT);

  /** The desert's ground: the dunes in the day's light, the battle's marks
   * in them, the sand blown into the city and the tumbleweeds. Drawn with
   * the city's ground, before the battle's darkness and tint, so they light
   * and darken with the rest of the board. `sun` is the shared sky's, absent
   * without one. */
  drawGround(c: CanvasRenderingContext2D, px: number, sim: DefendSim, reduceMotion: boolean, effects: boolean, sun?: Sun) {
    const env = sim.atmosphere;
    if (!env || env.mode !== "sand") return;
    setDuneLight(sun);
    c.save();
    c.imageSmoothingEnabled = false;
    c.drawImage(this.composeDunes(env, sim, reduceMotion), 0, 0, CELLS_W * px, CELLS_H * px);
    const marks = this.drawMarks(sim);
    if (marks) c.drawImage(marks, 0, 0, CELLS_W * px, CELLS_H * px);
    const layer = this.layer(env, sim, reduceMotion, effects);
    if (layer) c.drawImage(layer, 0, 0, CELLS_W * px, CELLS_H * px);
    this.drawBlowing(c, px, env, reduceMotion);
    c.restore();
  }

  /** The Fungal Hollow's mist and spores, over the battle's lighting. */
  draw(c: CanvasRenderingContext2D, px: number, sim: DefendSim, reduceMotion: boolean, effects: boolean) {
    const env = sim.atmosphere;
    if (!env || env.mode !== "mist") return;
    c.save();
    c.imageSmoothingEnabled = false;
    const layer = this.layer(env, sim, reduceMotion, effects);
    if (layer) c.drawImage(layer, 0, 0, CELLS_W * px, CELLS_H * px);
    if (effects && !reduceMotion) this.drawSpores(c, px, env);
    c.restore();
  }

  /** The dune sprite tiled at the field's drift and cut to the open ground
   * outside the city: a handful of image copies, and only when the drift
   * has moved a whole art pixel (every couple of seconds) or the ground has
   * changed under it. */
  private composeDunes(env: Atmosphere, sim: DefendSim, reduceMotion: boolean) {
    const w = CELLS_W * ART, h = CELLS_H * ART;
    if (!this.dunes) {
      this.dunes = document.createElement("canvas");
      this.dunes.width = w; this.dunes.height = h;
      this.mask = document.createElement("canvas");
      this.mask.width = CELLS_W; this.mask.height = CELLS_H;
      this.ground.fill(2);
    }
    // Gates stand clear of the dunes, open or shut (the sand pours through
    // into the city's own drifts).
    if (this.gateMap !== sim.map) {
      this.gateMap = sim.map; this.gateCells.fill(0);
      for (const b of sim.map.buildings) if (b.kind === "gate") for (const i of b.cells) this.gateCells[i] = 1;
    }
    let changed = false;
    for (let i = 0; i < CELL_COUNT; i++) {
      const open = env.passage[i] === 1 && !sim.map.city[i] && !this.gateCells[i] ? 1 : 0;
      if (open !== this.ground[i]) { this.ground[i] = open; changed = true; }
    }
    if (changed) {
      const m = this.mask!.getContext("2d")!, image = m.createImageData(CELLS_W, CELLS_H);
      for (let i = 0; i < CELL_COUNT; i++) image.data[i * 4 + 3] = this.ground[i] * 255;
      m.putImageData(image, 0, 0);
    }
    const tile = dunes(), size = tile.width;
    const ox = reduceMotion ? 0 : Math.round(env.drift.x * ART), oy = reduceMotion ? 0 : Math.round(env.drift.y * ART);
    const key = `${ox}:${oy}:${light.key}`;
    this.marks.setGround(this.ground, ox, oy, changed);
    if (!changed && key === this.duneKey) return this.dunes;
    this.duneKey = key;
    const d = this.dunes.getContext("2d")!;
    d.globalCompositeOperation = "source-over";
    d.clearRect(0, 0, w, h);
    const sx = ((ox % size) + size) % size, sy = ((oy % size) + size) % size;
    for (let y = sy - size; y < h; y += size) for (let x = sx - size; x < w; x += size) d.drawImage(tile, x, y);
    d.globalCompositeOperation = "destination-in";
    d.imageSmoothingEnabled = false;
    d.drawImage(this.mask!, 0, 0, w, h);
    d.globalCompositeOperation = "source-over";
    return this.dunes;
  }

  /** The marks' image, uploading only the chunks repainted this frame;
   * null while there are none. */
  private drawMarks(sim: DefendSim) {
    const marks = this.marks;
    marks.update(sim);
    if (!this.marksCanvas) {
      this.marksCanvas = document.createElement("canvas");
      this.marksCanvas.width = BW; this.marksCanvas.height = BH;
      this.marksImage = new ImageData(marks.pixels, BW, BH);
    }
    if (marks.painted.length) {
      const c = this.marksCanvas.getContext("2d")!, cw = BW / CHUNK;
      for (const k of marks.painted) c.putImageData(this.marksImage!, 0, 0, (k % cw) * CHUNK, Math.floor(k / cw) * CHUNK, CHUNK, CHUNK);
      marks.painted.length = 0;
      this.marksShown = true;
    }
    if (!marks.active.size && !marks.dirty.size) this.marksShown = false;
    return this.marksShown ? this.marksCanvas : null;
  }

  /** Sand blown into the city and the mist, repainted at most four times a
   * simulated second; null while there is neither. */
  private layer(env: Atmosphere, sim: DefendSim, reduceMotion: boolean, effects: boolean) {
    const mist = env.mode === "mist" && effects;
    const key = mist ? `m${env.time.toFixed(2)}:${reduceMotion}` : `s${Math.floor(env.time * 4)}:${env.version > 0}`;
    if (sim === this.sim && key === this.key) return this.shown ? this.canvas : null;
    this.sim = sim; this.key = key;
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = W; this.canvas.height = H;
      this.data = this.canvas.getContext("2d")!.createImageData(W, H);
    }
    const out = this.data!.data;
    if (mist) { out.fill(0); this.painted.length = 0; this.paintMist(env, reduceMotion); this.shown = true; this.misty = true; }
    else {
      // Leaving the mist: clear it all, and upload the cleared image once.
      if (this.misty) { out.fill(0); this.misty = false; }
      const had = this.painted.length || this.shown;
      for (const k of this.painted) out[k + 3] = 0;
      this.painted.length = 0;
      this.paintCitySand(env, sim);
      this.shown = this.painted.length > 0;
      // Nothing was there and nothing is: the upload can be skipped.
      if (!had && !this.shown) return null;
    }
    this.canvas.getContext("2d")!.putImageData(this.data!, 0, 0);
    return this.shown ? this.canvas : null;
  }

  /** Sand inside the city, a pixel at a time but only over the cells near
   * any: flat drifts in the dunes' tones, a shade darker at their edges and
   * on the side turned from the wind, lighter where they bank up. */
  private paintCitySand(env: Atmosphere, sim: DefendSim) {
    const out = this.data!.data, t = noiseTexture(), s = env.sand, slope = this.slope;
    const at = (x: number, y: number) => s[cellIndex(Math.max(0, Math.min(CELLS_W - 1, x)), Math.max(0, Math.min(CELLS_H - 1, y)))];
    for (let cy = 0; cy < CELLS_H; cy++) for (let cx = 0; cx < CELLS_W; cx++) {
      const i = cellIndex(cx, cy);
      if (!sim.map.city[i] || env.passage[i] !== 1) continue;
      if (Math.max(at(cx, cy), at(cx + 1, cy), at(cx - 1, cy), at(cx, cy + 1), at(cx, cy - 1)) <= .06) continue;
      slope[i] = (at(cx + 1, cy) - at(cx - 1, cy) + at(cx, cy + 1) - at(cx, cy - 1)) * .5;
      for (let y = cy * RES; y < cy * RES + RES; y++) for (let x = cx * RES; x < cx * RES + RES; x++) {
        const cover = sample(s, x, y) + (tex(t, x, y) - .5) * .12;
        if (cover < .16) continue;
        let tone = MID + (slope[i] > .08 ? 1 : slope[i] < -.08 ? -1 : 0);
        if (cover < .22) tone = MID - 1;
        const col = DUNE_TONES[Math.max(0, Math.min(DUNE_TONES.length - 1, tone))], k = (y * W + x) * 4;
        out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = 255;
        this.painted.push(k);
      }
    }
  }

  /** The mist, a pixel at a time. */
  private paintMist(env: Atmosphere, reduceMotion: boolean) {
    const out = this.data!.data, t = noiseTexture(), wind = env.wind;
    const drift = reduceMotion ? 0 : env.time;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = cellIndex((x / RES) | 0, (y / RES) | 0), k = (y * W + x) * 4;
      if (!env.passage[i]) continue;
      const air = sample(env.air, x, y);
      if (air < .02) continue;
      const dither = BAYER[(y & 3) * 4 + (x & 3)];
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

  /** The tumbleweeds bouncing past, each with its shadow. */
  private drawBlowing(c: CanvasRenderingContext2D, px: number, env: Atmosphere, reduceMotion: boolean) {
    const dot = artPen(c, px), sprites = weeds();
    for (const p of env.weeds) {
      const frames = sprites[Math.max(0, Math.min(WEED_SIZES - 1, p.size))], size = WEED_PX[p.size] ?? WEED_PX[0];
      const turn = reduceMotion ? 0 : p.turn;
      // The small ones spin faster and hop less.
      const frame = frames[((Math.floor(turn * 2 * WEED_PX[2] / size) % WEED_FRAMES) + WEED_FRAMES) % WEED_FRAMES];
      const hop = reduceMotion ? 0 : Math.abs(Math.sin(turn * 1.3 * WEED_PX[2] / size)) * size * .2;
      const ax = Math.round(p.x * ART) - (size >> 1), ay = Math.round(p.y * ART) - size + 3;
      c.fillStyle = "rgba(40,24,10,.28)";
      dot(ax + 2, ay + size - 2, size - 4, 2);
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
