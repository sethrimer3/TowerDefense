/** Ground weather drawn as pixel art beneath every combat silhouette. The
 * desert's dunes are one tiling sprite (`dunePixels`, `ART` pixels a cell)
 * of a few long, gentle swells (`duneHeights`), all one sand colour
 * (`SAND_COLOR`) made lighter or darker only by the day's sun: each pixel's
 * slope, lit `BUMP` times as steep as it stands, and the shadows the swells
 * cast when the sun is low (`castShadows`). The light follows the shared sky
 * (`easeDuneLight`: its heading, height and strength, snapped, the next
 * light's shadows swept a few hundred lines a frame so a relight never
 * stalls); a shading table per slope bin keeps the tile cheap to relight.
 * The HD Sand setting (`setDuneStyle`) swaps in the older detailed dunes:
 * the sim's own dune shapes with wind ripples, dithered in `HD_TONES`. It is
 * drawn with the city's ground, under the battle's darkness and tint, so
 * night darkens it and the day's colours wash over it like the rest of the
 * board; the wall's hanging faces are copied back over it. It is laid over
 * all the open ground outside the city at the field's drift, recomposed only
 * when the drift moves a whole art pixel, the light turns or the ground
 * changes. Over it `SandMarks` keeps what the battle did to the sand (trails
 * walked into the raised swells, craters blasted out of it) and repaints
 * only the marked pixels of the small chunks that changed. Sand blown into
 * the city and the Fungal Hollow's mist are painted at `RES` art pixels a
 * cell, the city's only over the cells holding any. Then the tumbleweeds,
 * black-outlined sprites in several sizes, over it. Presentation only: it
 * reads `sim.atmosphere` and changes nothing. */
import { CELLS_W, CELLS_H, CELL_COUNT, cellIndex, hash } from "./grid.ts";
import { DUNE_CREST, DUNE_PERIOD, WEED_SIZES, duneAt, periodicNoise, weatherNoise, type Atmosphere } from "./atmosphere.ts";
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
/** The sand's one colour: flat ground in full light. Every dune pixel is
 * this colour made lighter or darker by its light, nothing else. */
export const SAND_COLOR = [212, 160, 96] as const;
/** The high-definition dunes' tones (HD Sand), deep shadow to sunlit, warm
 * in the shade as real sand is. */
export const HD_TONES = [[112, 66, 40], [136, 84, 48], [160, 104, 58], [182, 124, 70], [202, 146, 84], [218, 166, 100], [232, 186, 120], [244, 208, 146], [252, 228, 176]];
/** Art pixels the swells stand over their troughs, at their tallest. */
export const DUNE_RELIEF = 9;
/** The HD dunes' height: a slip face about the angle of repose. */
export const HD_RELIEF = 26;
/** Cells from one swell's crest to the next (two to a field period, so it tiles). */
export const SWELL = 48;
/** Cells the crests lean per cell across (a whole number of swells a period). */
const SWELL_LEAN = .5;
/** Below this share of a dune's height the sand is the floor's flat sheet:
 * nothing walks a trail into it. */
export const FLOOR = .12;
/** The sun the dunes were lit by while there is no shared sky: in the
 * upper left, as the city's shadows fall. `x`, `y` point toward it. */
export const SUN = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
/** How much steeper the swells are lit and shadowed than they stand, so
 * their low rises read in the light; how far a slope brightens or darkens
 * the sand, and how much a cast shadow takes off. */
export const BUMP = 8, GAIN = .75, SHADE = .26;
/** Brightness steps the sand is snapped to (a little banding, pixel art). */
const LEVELS = 40;
/** The HD dunes' Lambert light: the sun's share across the ground and up,
 * low in the sky (the old fixed sun's). */
const HD_ACROSS = Math.SQRT2 / Math.sqrt(2.81), HD_UP = .9 / Math.sqrt(2.81);
const HD_LO = .16, HD_HI = .7;
/** Ordered dither thresholds, for the HD dunes' tones and the mist's thin edges. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);

/** The city's drifts' brightness: their thin edges, banks turned to the
 * wind and lee sides, the same sand as the dunes. */
const CITY_SAND = { edge: .86, bank: 1.08, lee: .92 };

/** Which dunes are drawn: "simple", one sand colour shaped only by light and
 * shadow; "hd", the detailed rippled dunes in their dithered tones. */
export type DuneStyle = "simple" | "hd";
let style: DuneStyle = "simple";
/** The light the dunes are shaded by: the heading toward the sun across the
 * ground (`x`, `y`, a unit vector), how high it stands (`rise`, the tangent
 * of its height, kept between `RISE`'s bounds; `across` and `up` its unit
 * vector's parts), and how strongly slopes show (`contrast`: 1 in full sun,
 * low at night). `key` names it, and the style. */
type Light = { x: number; y: number; rise: number; contrast: number; across: number; up: number; key: string };
/** Headings the light snaps to, the sun's height and contrast steps: the
 * tile is relit only when the snapped light changes, every few seconds
 * through a day. */
const HEADINGS = 32, RISES = 20, CONTRASTS = 6;
const RISE = { lo: .25, hi: 1 };
/** Below this contrast the sun is down: no cast shadows. */
const SHADOWS_FROM = .5;
/** The light for the shared sky's sun (`sun`, the direction its shadows
 * fall, as long as they are a unit of height, and their strength), or the
 * fixed one without a sky, snapped. */
function lightFor(sun?: Sun): Light {
  let x = SUN.x, y = SUN.y, contrast = 1, rise = .7;
  if (sun) {
    const l = Math.sqrt(sun.x * sun.x + sun.y * sun.y);
    if (l > 1e-6) { x = -sun.x / l; y = -sun.y / l; rise = 1 / l; }
    contrast = .3 + .7 * Math.min(1, sun.strength / .27);
  }
  rise = Math.max(RISE.lo, Math.min(RISE.hi, rise));
  const step = Math.round(Math.atan2(y, x) / (Math.PI * 2) * HEADINGS), level = Math.round(contrast * CONTRASTS);
  const r = Math.round((rise - RISE.lo) / (RISE.hi - RISE.lo) * RISES);
  const a = step / HEADINGS * Math.PI * 2, snapped = RISE.lo + r / RISES * (RISE.hi - RISE.lo), across = 1 / Math.sqrt(1 + snapped * snapped);
  return { x: Math.cos(a), y: Math.sin(a), rise: snapped, contrast: level / CONTRASTS, across, up: snapped * across,
    key: `${style}:${(step + HEADINGS) % HEADINGS}:${r}:${level}` };
}
/** The light the dunes are drawn in now. */
const light: Light = lightFor();
let lastSun: Sun | undefined;
/** The current light's cast shadows, and its shading table; null until read. */
let shadows: Uint8Array | null = null;
let table: Float32Array | null = null;
/** A relight under way (`easeDuneLight`): the next light's shadows, swept a
 * few hundred lines a frame. */
let job: ShadowJob | null = null;
function show(next: Light, cast: Uint8Array | null) {
  Object.assign(light, next);
  shadows = cast; table = null; job = null;
}
/** Turn the dunes' light to the shared sky's sun at once, or back to the
 * fixed one without a sky. Returns whether it changed. */
export function setDuneLight(sun?: Sun) {
  lastSun = sun;
  const next = lightFor(sun);
  if (next.key === light.key) return false;
  show(next, null);
  return true;
}
/** Turn the dunes' light toward the sky's sun a little a frame: the next
 * light's shadows are swept within `budget` ms a frame, and it is shown only
 * once they are done, so a relight never stalls a frame. Returns whether the
 * light shown changed. */
export function easeDuneLight(sun?: Sun, budget = 3) {
  lastSun = sun;
  const next = lightFor(sun);
  if (next.key === light.key) { job = null; return false; }
  if (style === "hd" || next.contrast < SHADOWS_FROM) { show(next, null); return true; }
  if (!job || job.light.key !== next.key) job = shadowJob(next);
  const end = performance.now() + budget;
  while (sweep(job, 32) && performance.now() < end);
  if (job.pass < job.passes) return false;
  show(job.light, shadowMask(job));
  return true;
}
/** Draw the simple dunes or the HD ones (the HD Sand setting), relit at
 * once. Returns whether it changed. */
export function setDuneStyle(hd: boolean) {
  const next: DuneStyle = hd ? "hd" : "simple";
  if (next === style) return false;
  style = next; light.key = ""; setDuneLight(lastSun);
  return true;
}
export function duneStyle() { return style; }
/** The current light's key, which changes whenever the dunes relight. */
export function duneLightKey() { return light.key; }
/** How tall the current dunes stand, in art pixels. */
export function duneRelief() { return style === "hd" ? HD_RELIEF : DUNE_RELIEF; }

/** How bright the simple sand is on a surface rising by (gx, gy) art pixels
 * a pixel, in or out of a cast shadow, in the current light: 1 on flat
 * ground, more on a face turned to the sun, less on one turned away. */
export function duneShade(gx: number, gy: number, shadowed = false) {
  const nx = -gx * BUMP, ny = -gy * BUMP;
  const dot = ((nx * light.x + ny * light.y) * light.across + light.up) / Math.sqrt(nx * nx + ny * ny + 1);
  let b = 1 + (dot - light.up) * GAIN * light.contrast;
  if (shadowed) b -= SHADE * light.contrast;
  return b;
}
/** The HD light on a surface rising by (gx, gy) art pixels a pixel: its
 * place between the darkest and lightest tones, before dithering. */
export function hdLight(gx: number, gy: number) {
  const l = (-(gx * light.x + gy * light.y) * HD_ACROSS + HD_UP) / Math.sqrt(gx * gx + gy * gy + 1);
  return (l - HD_LO) / (HD_HI - HD_LO) * (HD_TONES.length - 1);
}
const sandCache = new Map<number, number[]>();
/** The simple sand's colour at brightness `b`, snapped to `LEVELS` steps. */
function sandAt(b: number) {
  const step = Math.round(b * LEVELS);
  let col = sandCache.get(step);
  if (!col) {
    const k = step / LEVELS;
    col = [Math.min(255, Math.round(SAND_COLOR[0] * k)), Math.min(255, Math.round(SAND_COLOR[1] * k)), Math.min(255, Math.round(SAND_COLOR[2] * k))];
    sandCache.set(step, col);
  }
  return col;
}
/** The HD tone at light `f` for tile pixel (tx, ty): dithered, with a rare
 * grain a shade off. */
function hdTone(f: number, tx: number, ty: number) {
  let t = Math.round(f + BAYER[(ty & 3) * 4 + (tx & 3)] - .5);
  const speck = hash(tx, ty, 79) % 37;
  if (speck === 0) t++; else if (speck === 1) t--;
  return HD_TONES[t < 0 ? 0 : t >= HD_TONES.length ? HD_TONES.length - 1 : t];
}

/** Slope bins a side in the shading table: every slope on the tile falls in
 * one, so a pixel's shade is a lookup, and the trails' unmarked pixels look
 * theirs up the same way to match the tile exactly. */
const BINS = 256;
/** The current light's shade of each slope bin: simple sand's brightness,
 * out of shadow then in it; HD's tone place. */
function shadeTable() {
  if (table) return table;
  const { range } = slopes(), t = new Float32Array(BINS * BINS * 2);
  for (let by = 0; by < BINS; by++) for (let bx = 0; bx < BINS; bx++) {
    const gx = ((bx + .5) / BINS * 2 - 1) * range, gy = ((by + .5) / BINS * 2 - 1) * range, i = by * BINS + bx;
    if (style === "hd") t[i] = hdLight(gx, gy);
    else { t[i] = duneShade(gx, gy); t[BINS * BINS + i] = duneShade(gx, gy, true); }
  }
  return table = t;
}
/** The shading table's bin for slope (gx, gy) of the current dunes, -1 off it. */
function binOf(gx: number, gy: number, range: number) {
  if (gx < -range || gx > range || gy < -range || gy > range) return -1;
  const bx = Math.min(BINS - 1, Math.floor((gx / range + 1) * .5 * BINS)), by = Math.min(BINS - 1, Math.floor((gy / range + 1) * .5 * BINS));
  return by * BINS + bx;
}
/** A dune pixel's colour from its surface's slope (gx, gy) at tile pixel
 * (tx, ty), in the current style and light. */
function duneColor(gx: number, gy: number, tx: number, ty: number) {
  const range = slopes().range, bin = binOf(gx, gy, range);
  if (style === "hd") return hdTone(bin < 0 ? hdLight(gx, gy) : shadeTable()[bin], tx, ty);
  const shadowed = castShadows()[ty * DUNE_PERIOD * ART + tx] === 1;
  return sandAt(bin < 0 ? duneShade(gx, gy, shadowed) : shadeTable()[bin + (shadowed ? BINS * BINS : 0)]);
}

const heightCache: Record<DuneStyle, Float32Array | null> = { simple: null, hd: null };
/** The dunes' surface over one field period, art pixels high at `ART`
 * pixels a cell, in the current style. Simple: long, low, rounded swells
 * running across the wind, gently bent and a little taller in places. HD:
 * the sim's own dunes, with wind ripples across their windward sides. Tiles. */
export function duneHeights() {
  const done = heightCache[style];
  if (done) return done;
  const n = DUNE_PERIOD * ART, p = DUNE_PERIOD, h = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (style === "hd") {
      const d = duneAt((x + .5) / ART, (y + .5) / ART);
      let v = d.height * HD_RELIEF;
      if (d.wave < DUNE_CREST) {
        const s = d.wave / DUNE_CREST, fade = Math.min(1, s * 4, (1 - s) * 6);
        const wobble = periodicNoise(x / 32, y / 32, n / 32, n / 32, 830) * .7;
        v += Math.sin((d.phase * 17 + wobble) * Math.PI * 2) * .28 * fade * (.5 + d.amp * .5);
      }
      h[y * n + x] = v;
      continue;
    }
    const cx = (x + .5) / ART, cy = (y + .5) / ART;
    const bend = periodicNoise(cx / 32, cy / 32, p / 32, p / 32, 821) * .45;
    const amp = .65 + .35 * periodicNoise(cx / 48, cy / 48, p / 48, p / 48, 823);
    const phase = (cy - cx * SWELL_LEAN) / SWELL + bend;
    h[y * n + x] = (.5 - .5 * Math.cos(phase * Math.PI * 2)) * amp * DUNE_RELIEF;
  }
  return heightCache[style] = h;
}

const slopeCache: Record<DuneStyle, { bins: Int32Array; range: number } | null> = { simple: null, hd: null };
/** Every tile pixel's slope bin, and the steepest slope (`range`) the bins
 * span, read once a style. */
function slopes() {
  const done = slopeCache[style];
  if (done) return done;
  const n = DUNE_PERIOD * ART, h = duneHeights(), gx = new Float64Array(n * n), gy = new Float64Array(n * n);
  let range = 1e-3;
  for (let y = 0; y < n; y++) {
    const up = ((y + n - 1) % n) * n, down = ((y + 1) % n) * n, row = y * n;
    for (let x = 0; x < n; x++) {
      const a = (h[row + (x + 1) % n] - h[row + (x + n - 1) % n]) * .5, b = (h[down + x] - h[up + x]) * .5;
      gx[row + x] = a; gy[row + x] = b;
      range = Math.max(range, Math.abs(a), Math.abs(b));
    }
  }
  const bins = new Int32Array(n * n);
  for (let i = 0; i < n * n; i++) bins[i] = binOf(gx[i], gy[i], range);
  return slopeCache[style] = { bins, range };
}

type ShadowJob = { light: Light; top: Float32Array; pass: number; passes: number; step: number; drop: number; u: number; sa: number; sb: number; b0: Int32Array; b1: Int32Array };
/** A sweep of `l`'s cast shadows over the simple tile: from the sun's side
 * away from it, a line at a time along the sun's main axis, each pixel
 * carrying on the shadow's top (`top`, its swells lit `BUMP` times as steep)
 * from the pixel before it toward the sun, lowered by the sun's `rise` a
 * pixel; a lap of the tile and then as far again as the tallest shadow
 * reaches, so it wraps. */
function shadowJob(l: Light): ShadowJob {
  const n = DUNE_PERIOD * ART, alongX = Math.abs(l.x) >= Math.abs(l.y);
  const main = alongX ? l.x : l.y, side = alongX ? l.y : l.x;
  const step = main >= 0 ? 1 : -1, slant = side / Math.abs(main), drop = l.rise / BUMP / Math.abs(main);
  const shift = Math.floor(slant), b0 = new Int32Array(n), b1 = new Int32Array(n);
  // Lines run along the other axis: (a, b) is the pixel h[b * n + a] when the
  // sun's main axis is x, h[a * n + b] when it is y.
  const sa = alongX ? 1 : n, sb = alongX ? n : 1;
  for (let b = 0; b < n; b++) { b0[b] = (((b + shift) % n + n) % n) * sb; b1[b] = (((b + shift + 1) % n + n) % n) * sb; }
  return { light: l, top: new Float32Array(n * n), pass: 0, passes: n + Math.min(n, Math.ceil(duneRelief() / drop) + 2), step, drop, u: slant - shift, sa, sb, b0, b1 };
}
/** Up to `lines` more lines of the sweep; whether any are left. */
function sweep(j: ShadowJob, lines: number) {
  const n = DUNE_PERIOD * ART, h = duneHeights(), { top, b0, b1, sa, sb, drop, u } = j, v = 1 - u;
  for (const last = Math.min(j.passes, j.pass + lines); j.pass < last; j.pass++) {
    const a = j.step > 0 ? n - 1 - (j.pass % n) : j.pass % n, from = ((a + j.step) % n + n) % n;
    const ia = a * sa, fa = from * sa;
    for (let b = 0; b < n; b++) {
      const up = top[fa + b0[b]] * v + top[fa + b1[b]] * u - drop, i = ia + b * sb, own = h[i];
      top[i] = up > own ? up : own;
    }
  }
  return j.pass < j.passes;
}
/** The finished sweep's shadows: 1 where the shadow's top stands over the sand. */
function shadowMask(j: ShadowJob) {
  const n = DUNE_PERIOD * ART, h = duneHeights(), out = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = j.top[i] > h[i] + .05 ? 1 : 0;
  return out;
}
/** Which pixels of the simple dune tile lie in a shadow the swells cast in
 * the current light: 1 in shadow. None while the sun is down. */
export function castShadows() {
  if (shadows) return shadows;
  if (style === "hd" || light.contrast < SHADOWS_FROM) return shadows = new Uint8Array(DUNE_PERIOD * ART * DUNE_PERIOD * ART);
  const j = shadowJob({ ...light });
  sweep(j, Infinity);
  return shadows = shadowMask(j);
}

/** The tiling dune sprite, `DUNE_PERIOD * ART` pixels square, RGBA, opaque:
 * every pixel of `duneHeights` shaded by its slope in the current light and
 * style. Tiles seamlessly; pure. */
export function dunePixels() {
  const n = DUNE_PERIOD * ART, { bins } = slopes(), t = shadeTable(), out = new Uint8ClampedArray(n * n * 4);
  if (style === "hd") {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, k = i * 4, col = hdTone(t[bins[i]], x, y);
      out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = 255;
    }
    return { size: n, data: out };
  }
  // Each bin's colour packed once, then a lookup a pixel.
  const cast = castShadows(), colors = new Uint32Array(BINS * BINS * 2), words = new Uint32Array(out.buffer);
  const pack = new Uint8Array(colors.buffer);
  for (let b = 0; b < colors.length; b++) {
    const col = sandAt(t[b]);
    pack[b * 4] = col[0]; pack[b * 4 + 1] = col[1]; pack[b * 4 + 2] = col[2]; pack[b * 4 + 3] = 255;
  }
  for (let i = 0; i < n * n; i++) words[i] = colors[bins[i] + (cast[i] ? BINS * BINS : 0)];
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
const TRAILS = { simple: { depth: 1.4, lip: .6, step: 1.5, perFrame: 500 }, hd: { depth: 2.2, lip: .9, step: 1.5, perFrame: 500 } };
/** Craters: depth a cell of blast radius, deepest, and the rim's height. */
const CRATERS = { simple: { depth: 3, max: 8, rim: .5, reach: 1.7 }, hd: { depth: 4, max: 11, rim: .6, reach: 1.7 } };
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
    const TRAIL = TRAILS[style], relief = duneRelief();
    const reach = r + 1.6, x0 = Math.max(0, Math.floor(x - reach)), x1 = Math.min(BW - 1, Math.ceil(x + reach));
    const y0 = Math.max(0, Math.floor(y - reach)), y1 = Math.min(BH - 1, Math.ceil(y + reach));
    let any = false;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      if (!this.ground[(py >> 3) * CELLS_W + (px >> 3)]) continue;
      const k = (this.base(px, py) / relief - FLOOR) / .25;
      if (k <= 0) continue;
      const ox = px + .5 - x, oy = py + .5 - y, d = Math.sqrt(ox * ox + oy * oy), i = py * BW + px, w = k > 1 ? 1 : k;
      if (d < r) { const v = -TRAIL.depth * w * (1 - d * d / (r * r)); if (v < this.delta[i]) { this.delta[i] = v; any = true; } }
      else if (d < reach && this.delta[i] >= 0) { const v = TRAIL.lip * w * (1 - (d - r) / 1.6); if (v > this.delta[i]) { this.delta[i] = v; any = true; } }
    }
    if (any) this.touch(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  /** A blast's crater, `r` art pixels across, its sand thrown out into a rim. */
  crater(x: number, y: number, r: number) {
    const CRATER = CRATERS[style];
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
    const TRAIL = TRAILS[style];
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
    // A relight or a drift dirties every mark: catch up within a few frames.
    let budget = Math.max(PAINT_PER_FRAME, Math.ceil(this.dirty.size / 4));
    for (const k of this.dirty) {
      if (budget-- <= 0) break;
      this.dirty.delete(k);
      this.paintChunk(k);
      this.painted.push(k);
    }
  }

  /** One chunk: the marked dune pixels (and those beside them, whose slope a
   * mark changes) shaded as the tile is; clear elsewhere, so the tile shows.
   * A chunk with no marks left goes quiet, left clear. */
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
      // Only the marks and the pixels their slope reaches; the rest is left
      // clear so the dune tile shows through, never a square of old light.
      const near = delta[i] || (x > 0 && delta[i - 1]) || (x < BW - 1 && delta[i + 1]) || (y > 0 && delta[i - BW]) || (y < BH - 1 && delta[i + BW]);
      if (near && this.ground[c]) {
        const tx = ((x - this.ox) % n + n) % n, ty = ((y - this.oy) % n + n) % n;
        const m = (y - y0 + 1) * S + x - x0 + 1;
        const col = duneColor((surface[m + 1] - surface[m - 1]) * .5, (surface[m + S] - surface[m - S]) * .5, tx, ty);
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
  drawGround(c: CanvasRenderingContext2D, px: number, sim: DefendSim, reduceMotion: boolean, effects: boolean, sun?: Sun, hd = false) {
    const env = sim.atmosphere;
    if (!env || env.mode !== "sand") return;
    setDuneStyle(hd);
    easeDuneLight(sun);
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
        const col = sandAt(cover < .22 ? CITY_SAND.edge : slope[i] > .08 ? CITY_SAND.bank : slope[i] < -.08 ? CITY_SAND.lee : 1), k = (y * W + x) * 4;
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
