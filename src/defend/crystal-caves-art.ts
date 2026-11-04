/** Draws the Crystal Caves (`crystal-caves.ts`) at `ART` pixels a cell: the
 * cavern floor (`cavePixels`: dark gravel, slick black and grey rock
 * formations with their shadows, the ponds, crystals and mushrooms, under the
 * units and the battle's darkness), then over the darkness (`drawGlow`) what
 * glows: the crystals', ponds' and mushrooms' own light (`glowPixels`) with
 * soft halos, the ponds' glints, spores puffed off the mushrooms, and the
 * daylight falling through the ceiling's holes in soft shafts full of dust
 * onto bright patches of floor, pale moonlight by night. Presentation only;
 * still under Reduce Motion. */
import { ART } from "./art-scale.ts";
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import {
  CAVE_OPENING, crystalCavesPlan, CRYSTAL_CAVES, dustAt, openingDustAt, openingEdge, shaftLight, sporeAt, type ShaftLight,
  type CrystalCavesPlan, type CrystalCluster, type LightShaft, type MushroomCluster,
} from "./crystal-caves.ts";
import { artPen } from "./pixel-fx.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;

const rgba = (hex: number, a = 255) => ((a << 24) | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >> 16) & 0xff)) >>> 0;
/** Gravel tones, darkest to lightest, picked by a slow wash plus grain. */
const GRAVEL = [0x101114, 0x131418, 0x16171c, 0x191b20, 0x1d1f25, 0x212329];
const PEBBLE = { lit: 0x30333c, mid: 0x25272e, dark: 0x0b0c0e };
/** Smooth value noise, 0..1, with features `scale` pixels apart. */
function wash(x: number, y: number, scale: number, salt: number) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash01(ix, iy, salt), b = hash01(ix + 1, iy, salt), c = hash01(ix, iy + 1, salt), d = hash01(ix + 1, iy + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** Rock from its foot to its top, then its glossy highlights. */
const ROCK = [0x0b0c0f, 0x121419, 0x191c22, 0x22262e, 0x2d323c, 0x3a404c];
const GLOSS = [0x4c5464, 0x7e8a9e, 0xc4cede];
/** Pond water from its edge to its middle, and its wet stone bank. */
const POND = [0x2a78a8, 0x3c9ccc, 0x56b8e2, 0x78ccee, 0xa6e2f8];
const BANK = [0x0a0c0f, 0x1d2a33, 0x2c4250];
/** Crystal faces: outline, shade, body, lit, edge. */
const VIOLET = [0x0d0614, 0x3c1670, 0x6a2fb4, 0xa66ae8, 0xe4cbff];
const ICE = [0x060d16, 0x1d4f84, 0x3f8fd0, 0x86d0f6, 0xdcf6ff];
/** Mushroom caps: rim, cap, lit, spot; and their stems. */
const CAPS = [[0x10403e, 0x2fa894, 0x7aeccf, 0xd8fff2], [0x3a1858, 0x9a62d8, 0xcfa2f6, 0xf6e8ff]];
const STEM = [0x6c7a78, 0xa8b8b2];
/** The halos' and spores' colours, by what glows. */
const HALO = { violet: "180,110,255", ice: "140,210,255", pond: "130,215,255", teal: "110,240,210", lilac: "200,160,255" } as const;

type Img = { px: Uint32Array; w: number; h: number };
const set = (img: Img, x: number, y: number, c: number) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x >= 0 && y >= 0 && x < img.w && y < img.h) img.px[y * img.w + x] = rgba(c);
};
const darken = (v: number, k: number) =>
  (v & 0xff000000) | (Math.round(((v >> 16) & 0xff) * k) << 16) | (Math.round(((v >> 8) & 0xff) * k) << 8) | Math.round((v & 0xff) * k);

/** A pond's wobbling edge, in pixels from its middle, at angle `a`. */
const pondEdge = (r: number, seed: number, a: number) =>
  r * ART * (1 + 0.1 * Math.sin(3 * a + (seed % 7)) + 0.06 * Math.sin(5 * a + (seed % 11)));

/** Every pixel the rocks rise over: their height, 0 at the foot to 1 at the top. */
function rockHeights(plan: CrystalCavesPlan) {
  const h = new Float32Array(W * H);
  for (const r of plan.rocks)
    for (const l of r.lobes) {
      const R = l.r * ART, lx = l.x * ART, ly = l.y * ART;
      for (let y = Math.max(0, Math.floor(ly - R)); y < Math.min(H, Math.ceil(ly + R)); y++)
        for (let x = Math.max(0, Math.floor(lx - R)); x < Math.min(W, Math.ceil(lx + R)); x++) {
          const n = (hash01(x >> 1, y >> 1, r.seed) - 0.5) * 0.12;
          const d = Math.sqrt((x + 0.5 - lx) ** 2 + (y + 0.5 - ly) ** 2) / R + n;
          if (d >= 1) continue;
          const v = Math.sqrt(1 - d * d);
          if (v > h[y * W + x]) h[y * W + x] = v;
        }
    }
  return h;
}

/** The cavern floor over every open cell, as RGBA. */
export function cavePixels(plan: CrystalCavesPlan): Uint32Array {
  const img: Img = { px: new Uint32Array(W * H), w: W, h: H };
  const out = img.px;
  const openAt = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && plan.open[Math.floor(y / ART) * CELLS_W + Math.floor(x / ART)] === 1;
  // Gravel, in clumps of tone, with pebbles lit from the upper left.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (openAt(x, y)) {
        const v = wash(x, y, 40, 860) * 0.65 + wash(x, y, 9, 861) * 0.35 + (hash01(x, y, 862) - 0.5) * 0.45;
        out[y * W + x] = rgba(GRAVEL[Math.max(0, Math.min(GRAVEL.length - 1, Math.floor(v * GRAVEL.length)))]);
      }
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      if (!plan.open[cy * CELLS_W + cx]) continue;
      for (let k = 0; k < 3; k++) {
        const x = cx * ART + (hash(cx, cy, k, 863) % ART), y = cy * ART + (hash(cx, cy, k, 864) % ART);
        const big = hash(cx, cy, k, 865) % 3 === 0;
        if (!openAt(x, y)) continue;
        set(img, x, y, big ? PEBBLE.lit : PEBBLE.mid);
        if (big && openAt(x + 1, y)) set(img, x + 1, y, PEBBLE.mid);
        if (big && openAt(x, y + 1)) set(img, x, y + 1, PEBBLE.mid);
        if (openAt(x + 1, y + 1)) set(img, x + 1, y + 1, PEBBLE.dark);
      }
    }
  // The rocks: shaded by their slope toward the upper left, glossy where it
  // faces the light, outlined at their foot, casting a shadow down and right.
  const h = rockHeights(plan);
  const hAt = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? h[y * W + x] : 0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!openAt(x, y)) continue;
      if (h[i] <= 0) {
        if (hAt(x - 2, y - 3) > 0 || hAt(x - 1, y - 2) > 0) out[i] = darken(out[i], (x + y) & 1 ? 0.55 : 0.62);
        continue;
      }
      const edge = hAt(x - 1, y) <= 0 || hAt(x + 1, y) <= 0 || hAt(x, y - 1) <= 0 || hAt(x, y + 1) <= 0;
      if (edge) { out[i] = rgba(0x050608); continue; }
      const gx = hAt(x + 1, y) - hAt(x - 1, y), gy = hAt(x, y + 1) - hAt(x, y - 1);
      const lit = -(gx * -0.6 + gy * -0.8) * 3.2 + h[i] * 0.6;
      const tone = Math.max(0, Math.min(ROCK.length - 1, Math.round(1 + lit * 2.4 + (hash(x, y, 866) % 3 === 0 ? 0.4 : 0))));
      out[i] = rgba(ROCK[tone]);
      // Slick: a glossy streak where the rock turns to the light.
      if (lit > 0.95 && h[i] > 0.45) out[i] = rgba(GLOSS[lit > 1.45 ? 2 : lit > 1.2 ? 1 : 0]);
    }
  for (const p of plan.ponds) paintPond(img, p.x * ART, p.y * ART, p.r, p.seed, false);
  for (const c of plan.crystals) paintCrystals(img, c, false);
  for (const m of plan.mushrooms) paintMushrooms(img, m, false);
  return out;
}

/** What glows of the floor, as RGBA: the ponds' water, the crystals and the
 * mushroom caps, drawn again over the battle's darkness. */
export function glowPixels(plan: CrystalCavesPlan): Uint32Array {
  const img: Img = { px: new Uint32Array(W * H), w: W, h: H };
  for (const p of plan.ponds) paintPond(img, p.x * ART, p.y * ART, p.r, p.seed, true);
  for (const c of plan.crystals) paintCrystals(img, c, true);
  for (const m of plan.mushrooms) paintMushrooms(img, m, true);
  return img.px;
}

function paintPond(img: Img, px: number, py: number, r: number, seed: number, glow: boolean) {
  const R = r * ART * 1.2;
  for (let y = Math.floor(py - R); y < Math.ceil(py + R); y++)
    for (let x = Math.floor(px - R); x < Math.ceil(px + R); x++) {
      const dx = x + 0.5 - px, dy = y + 0.5 - py, d = Math.sqrt(dx * dx + dy * dy);
      const e = pondEdge(r, seed, Math.atan2(dy, dx));
      if (d >= e + 2) continue;
      if (d >= e) {
        if (!glow) set(img, x, y, d >= e + 1 ? BANK[0] : BANK[dx + dy < 0 ? 1 : 2]);
        continue;
      }
      const k = 1 - d / e, dither = (x + y) & 1 ? 0.06 : 0;
      const tone = Math.min(POND.length - 1, Math.floor((k + dither) * POND.length * 0.95));
      // The bank's shadow over the water's upper left edge.
      const shade = k < 0.18 && dx + dy < -e * 0.4;
      // Ripples: short pale dashes across the water, here and there.
      const ripple = k > 0.2 && k < 0.85 && hash(Math.floor(x / 4), y, seed) % 23 === 0;
      const tone2 = ripple ? Math.min(POND.length - 1, tone + 1) : tone;
      set(img, x, y, shade ? (glow ? POND[0] : 0x1f5e86) : glow ? POND[Math.max(0, tone2 - 2)] : POND[tone2]);
    }
}

/** A cluster's shards, back to front: thin pointed prisms leaning out from
 * its foot, each lit down its left face, dark down its right, outlined. */
function paintCrystals(img: Img, c: CrystalCluster, glow: boolean) {
  const pal = c.blue ? ICE : VIOLET;
  const shards = [];
  for (let k = 0; k < c.shards; k++) {
    const u = (salt: number) => hash01(c.seed, k, salt);
    const a = (u(871) - 0.5) * c.r * ART * 1.2, b = (u(872) - 0.5) * c.r * ART * 0.6;
    shards.push({
      bx: c.x * ART + a, by: c.y * ART + b + 2,
      tall: (k === 0 ? 1 : 0.55 + u(873) * 0.35) * c.r * ART * 1.5,
      lean: (a / (c.r * ART)) * 0.5 + (u(874) - 0.5) * 0.3,
      w: 1.6 + u(875) * 1.6,
    });
  }
  shards.sort((s, t) => s.by - t.by);
  for (const s of shards) {
    const pts: [number, number, boolean, number][] = [];
    for (let j = 0; j <= Math.ceil(s.tall); j++) {
      const f = j / s.tall, y = Math.round(s.by - j), cx = s.bx + s.lean * j;
      const half = s.w * Math.min(1, (1 - f) * 2.2);
      for (let x = Math.floor(cx - half - 1); x <= Math.ceil(cx + half + 1); x++) {
        const off = x + 0.5 - cx;
        if (Math.abs(off) > half + 1) continue;
        pts.push([x, y, Math.abs(off) > half, off]);
      }
    }
    for (const [x, y, rim] of pts) if (rim && !glow) set(img, x, y, pal[0]);
    for (const [x, y, rim, off] of pts) {
      if (rim) continue;
      const tone = off < -0.6 ? 3 : off > 0.6 ? 1 : 2;
      set(img, x, y, tone === 3 && hash(x, y, 876) % 4 === 0 ? pal[4] : pal[tone]);
    }
    // A bright glint near the tip.
    set(img, s.bx + s.lean * s.tall * 0.75 - 0.5, s.by - s.tall * 0.75, pal[4]);
  }
  // Grit heaped round the foot.
  if (!glow)
    for (let k = 0; k < 6; k++) {
      const x = c.x * ART + (hash01(c.seed, k, 877) - 0.5) * c.r * ART * 1.6, y = c.y * ART + 2 + hash01(c.seed, k, 878) * 3;
      set(img, x, y, k % 2 ? pal[1] : 0x2a2c34);
    }
}

/** A cluster's mushrooms, back to front: a short pale stem under a round
 * glowing cap, lit on its upper left, a spot or two on top. */
function paintMushrooms(img: Img, m: MushroomCluster, glow: boolean) {
  const pal = CAPS[m.hue];
  for (const [k, cap] of m.caps.entries()) {
    const cx = cap.x * ART, cy = cap.y * ART, R = Math.max(1.3, cap.r * ART);
    if (!glow) {
      set(img, cx, cy + R * 0.5 + 1, STEM[1]);
      set(img, cx, cy + R * 0.5 + 2, STEM[0]);
      set(img, cx + 1, cy + R * 0.5 + 2, 0x0c0d10);
    }
    for (let y = Math.floor(cy - R - 1); y <= Math.ceil(cy + R * 0.6 + 1); y++)
      for (let x = Math.floor(cx - R - 1); x <= Math.ceil(cx + R + 1); x++) {
        const dx = (x + 0.5 - cx) / R, dy = (y + 0.5 - cy) / (R * 0.75), d = dx * dx + dy * dy;
        if (d >= 1.45) continue;
        if (d >= 1) { if (!glow) set(img, x, y, 0x06080a); continue; }
        const lit = -dx * 0.6 - dy * 0.8;
        set(img, x, y, d > 0.7 ? pal[0] : lit > 0.35 ? pal[2] : pal[1]);
      }
    if (R > 2) set(img, cx + (hash(m.seed, k, 879) % 2), cy - 1, pal[3]);
  }
}

/** How much of shaft `s`'s daylight falls on pixel (x, y), 0..1, in steps,
 * dithered at the patch's ragged edge. */
export function sunAt(s: LightShaft, x: number, y: number) {
  const dx = (x + 0.5 - s.x * ART) / 1.12, dy = y + 0.5 - s.y * ART, a = Math.atan2(dy, dx);
  const e = s.r * ART * (1 + 0.07 * Math.sin(3 * a + (s.seed % 9)) + 0.05 * Math.sin(7 * a + (s.seed % 13)));
  const d = Math.sqrt(dx * dx + dy * dy) / e;
  const d2 = (x + y) & 1;
  return d < 0.55 ? 1 : d < 0.8 ? 0.8 : d < 0.95 ? 0.6 : d < 1.08 ? (d2 ? 0.4 : 0) : d < 1.2 && (x + 2 * y) % 4 === 0 ? 0.25 : 0;
}

/** How much of the sky's light falls through the great opening onto pixel
 * (x, y) (art pixels, any x and y; above the board all of it), 0..1 in
 * steps, dithered along its ragged edge. */
export function openingLight(x: number, y: number) {
  const d = openingEdge((x + 0.5) / ART) * ART - (y + 0.5);
  return d > 14 ? 1 : d > 9 ? 0.85 : d > 5 ? 0.7 : d > 2 ? 0.55 : d > 0 ? 0.4 : d > -3 ? ((x + y) & 1 ? 0.25 : 0) : d > -6 && (x + 2 * y) % 4 === 0 ? 0.15 : 0;
}

/** Padding (art pixels) round the opening's light mask, so it still covers
 * the board's top and sides when the sun slides it. */
const OPEN_PAD = 64;

/** The opening's light as a white mask (alpha the light), `OPEN_PAD` wider
 * each side and taller above than the board, down to its deepest edge. */
function openingPixels() {
  const w = W + 2 * OPEN_PAD, h = OPEN_PAD + Math.ceil((CELLS_H * CAVE_OPENING.depth + CAVE_OPENING.wobble + 1) * ART);
  const out = new Uint32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = openingLight(x - OPEN_PAD, y - OPEN_PAD);
      if (k > 0) out[y * w + x] = rgba(0xfff4dc, Math.round(255 * k));
    }
  return { pixels: out, w, h };
}

/** The whole floor as a shaft's daylight would light it: what each patch
 * shows through its shape, wherever it has slid to (empty off the floor). */
export function sunlitFloor(floor: Uint32Array): Uint32Array {
  return floor.map((v) => (v ? sunlit(v, 1) : 0));
}

/** Pixel `v` (RGBA) lit warm by `s` of a shaft's daylight. */
function sunlit(v: number, s: number) {
  const ch = (c: number, warm: number) => Math.min(255, Math.round(c * (1 + 1.5 * s) + warm * s));
  // Packed ABGR: blue in the high byte, red in the low.
  return (v & 0xff000000) | (ch((v >> 16) & 0xff, 14) << 16) | (ch((v >> 8) & 0xff, 46) << 8) | ch(v & 0xff, 72);
}

/** A daylight patch's sprite: the same shape `sunAt` lights the floor in,
 * pale, `size` pixels square, for moonlight (or a little extra) over the
 * battle's darkness. */
function patchPixels(s: LightShaft) {
  const size = Math.ceil(2 * s.r * ART * 1.3 + 2), x0 = Math.floor(s.x * ART - size / 2), y0 = Math.floor(s.y * ART - size / 2);
  const out = new Uint32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const k = sunAt(s, x0 + x, y0 + y);
      if (k > 0) out[y * size + x] = rgba(0xfff4dc, Math.round(255 * k));
    }
  return { pixels: out, size, x0, y0 };
}

/** The shaft's soft column of light, baked once: `along` its length from the
 * floor (canvas top) to the ceiling (bottom), `across` its halo. */
export function columnField(along: number, across: number) {
  if (along < 0 || along > 1 || across <= -1 || across >= 1) return 0;
  const sigma = 0.32 + along * 0.12;
  const foot = Math.min(1, along / 0.05 + 0.35), top = Math.min(1, (1 - along) / 0.45);
  return Math.exp(-(across * across) / (2 * sigma * sigma)) * foot * top * top * (0.55 + 0.45 * (1 - along));
}

function canvasOf(pixels: Uint32Array, w: number, h: number) {
  const cv = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = cv.getContext("2d")!, img = ctx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(pixels);
  ctx.putImageData(img, 0, 0);
  return cv;
}

function haloSprite(rgb: string) {
  const cv = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const ctx = cv.getContext("2d")!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `rgba(${rgb},0.55)`);
  g.addColorStop(0.4, `rgba(${rgb},0.22)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return cv;
}

function columnSprite() {
  const w = 48, h = 160, cv = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = cv.getContext("2d")!, img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const f = columnField((y + 0.5) / h, (x + 0.5) / (w / 2) - 1), o = (y * w + x) * 4;
      img.data[o] = 255; img.data[o + 1] = 236; img.data[o + 2] = 196;
      img.data[o + 3] = Math.round(255 * f);
    }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export type CaveGlowOptions = { now: number; alpha: number; still: boolean; night: number; effects: boolean; light?: ShaftLight };

export class CrystalCavesArt {
  private map: CityMap | null = null;
  plan: CrystalCavesPlan | null = null;
  private floor: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private halos = new Map<string, HTMLCanvasElement>();
  private patches: { cv: HTMLCanvasElement; x0: number; y0: number }[] = [];
  private column: HTMLCanvasElement | null = null;
  private lit: HTMLCanvasElement | null = null;
  private sunPatches: { cv: HTMLCanvasElement; key: string }[] = [];
  private openMask: HTMLCanvasElement | null = null;
  private opening: { cv: HTMLCanvasElement; key: string } | null = null;

  /** Plans `map`'s caves (and repaints their floor) when the map changes. */
  sync(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.plan = crystalCavesPlan(map);
    this.floor = this.glow = this.lit = null;
    this.patches = [];
    this.sunPatches = [];
    this.opening = null;
  }

  private mask() {
    if (!this.openMask) { const m = openingPixels(); this.openMask = canvasOf(m.pixels, m.w, m.h); }
    return this.openMask;
  }

  private patchSprites() {
    if (!this.patches.length && this.plan)
      this.patches = this.plan.shafts.map((s) => { const p = patchPixels(s); return { cv: canvasOf(p.pixels, p.size, p.size), x0: p.x0, y0: p.y0 }; });
    return this.patches;
  }

  /** The cavern floor over the open ground, and the patches of daylight lit
   * into it where `light` has them now (slid away from under their holes as
   * the sun crosses the sky; only floor shows them). */
  drawFloor(c: CanvasRenderingContext2D, px: number, alpha: number, light: ShaftLight = shaftLight()) {
    if (!this.plan || alpha <= 0 || typeof document === "undefined") return;
    if (!this.floor) {
      const floor = cavePixels(this.plan);
      this.floor = canvasOf(floor, W, H);
      this.lit = canvasOf(sunlitFloor(floor), W, H);
    }
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= alpha;
    c.drawImage(this.floor, 0, 0, CELLS_W * px, CELLS_H * px);
    const ox = Math.round(light.shift.x * ART), oy = Math.round(light.shift.y * ART), key = `${ox}:${oy}`;
    c.globalAlpha *= 0.3 + 0.7 * light.day;
    // The sky through the great opening, its edge's shadow sliding with the
    // sun like the patches.
    if (!this.opening) this.opening = { cv: Object.assign(document.createElement("canvas"), { width: W, height: H }), key: "" };
    if (this.opening.key !== key) {
      const sc = this.opening.cv.getContext("2d")!;
      sc.globalCompositeOperation = "copy";
      sc.drawImage(this.mask(), ox - OPEN_PAD, oy - OPEN_PAD);
      sc.globalCompositeOperation = "source-in";
      sc.drawImage(this.lit!, 0, 0);
      this.opening.key = key;
    }
    c.save();
    c.globalAlpha *= 0.55;
    c.drawImage(this.opening.cv, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
    for (const [i, patch] of this.patchSprites().entries()) {
      const size = patch.cv.width, x0 = patch.x0 + ox, y0 = patch.y0 + oy;
      let sp = this.sunPatches[i];
      if (!sp) sp = this.sunPatches[i] = { cv: Object.assign(document.createElement("canvas"), { width: size, height: size }), key: "" };
      if (sp.key !== key) {
        // The patch's shape, filled with the lit floor under where it lies.
        const sc = sp.cv.getContext("2d")!;
        sc.globalCompositeOperation = "copy";
        sc.drawImage(patch.cv, 0, 0);
        sc.globalCompositeOperation = "source-in";
        sc.drawImage(this.lit!, -x0, -y0);
        sp.key = key;
      }
      c.drawImage(sp.cv, (x0 / ART) * px, (y0 / ART) * px, (size / ART) * px, (size / ART) * px);
    }
    c.restore();
  }

  private halo(rgb: string) {
    let h = this.halos.get(rgb);
    if (!h) this.halos.set(rgb, (h = haloSprite(rgb)));
    return h;
  }

  /** Everything that glows, over the battle's darkness: the crystals', ponds'
   * and mushrooms' own light and halos, the ponds' glints, the spores, and
   * the shafts of daylight (moonlight by `night`) with their dust. */
  drawGlow(c: CanvasRenderingContext2D, px: number, o: CaveGlowOptions) {
    const plan = this.plan;
    if (!plan || o.alpha <= 0 || typeof document === "undefined") return;
    this.glow ??= canvasOf(glowPixels(plan), W, H);
    this.column ??= columnSprite();
    const light = o.light ?? shaftLight(), ox = Math.round(light.shift.x * ART), oy = Math.round(light.shift.y * ART);
    this.patchSprites();
    const t = o.still ? 0 : o.now / 1000, base = c.globalAlpha * o.alpha;
    const night = Math.max(0, Math.min(1, o.night));
    c.save();
    c.globalCompositeOperation = "lighter";
    // The glowing pixels themselves, brighter the darker it is.
    c.imageSmoothingEnabled = false;
    c.globalAlpha = base * (0.15 + 0.6 * night);
    c.drawImage(this.glow, 0, 0, CELLS_W * px, CELLS_H * px);
    // Soft halos, each breathing slowly.
    c.imageSmoothingEnabled = true;
    const halo = (x: number, y: number, r: number, rgb: string, k: number, phase: number) => {
      const breathe = o.still ? 1 : 0.82 + 0.18 * Math.sin(t * 0.7 + phase * 6.28);
      c.globalAlpha = Math.min(1, base * k * breathe * (0.55 + 0.45 * night));
      const s = r * px * 2;
      c.drawImage(this.halo(rgb), x * px - s / 2, y * px - s / 2, s, s);
    };
    for (const p of plan.ponds) halo(p.x, p.y, p.r * 2.6, HALO.pond, 0.4, hash01(p.seed, 880));
    for (const cr of plan.crystals) halo(cr.x, cr.y - cr.r * 0.6, cr.r * 3.4, cr.blue ? HALO.ice : HALO.violet, 0.9, hash01(cr.seed, 881));
    for (const m of plan.mushrooms) halo(m.x, m.y, m.r * 2.8, m.hue ? HALO.lilac : HALO.teal, 0.75, hash01(m.seed, 882));
    // The daylight: a bright patch on the floor and a soft column of light
    // rising from it toward its hole, warm by day, pale and dim by night.
    const sway = (s: LightShaft) => (o.still ? 1 : 0.9 + 0.1 * Math.sin(t * 0.21 + hash01(s.seed, 883) * 6.28));
    const theta = Math.atan2(-light.up.x, light.up.y);
    for (const [i, s] of plan.shafts.entries()) {
      const k = sway(s) * (1 - 0.72 * night), fx = s.x + ox / ART, fy = s.y + oy / ART;
      c.globalCompositeOperation = "screen";
      c.globalAlpha = Math.min(1, base * 0.46 * k);
      c.save();
      c.translate(fx * px, fy * px);
      c.rotate(theta);
      const w = s.r * px * 1.9;
      c.drawImage(this.column, -w, -s.r * px * 0.3, 2 * w, light.length * px);
      c.restore();
      c.globalCompositeOperation = "lighter";
      // The patch itself is lit in the floor; over the darkness it shows a
      // little, and by night as pale moonlight.
      const patch = this.patches[i], size = (patch.cv.width / ART) * px;
      c.imageSmoothingEnabled = false;
      c.globalAlpha = Math.min(1, base * (0.06 + 0.16 * night) * sway(s));
      c.drawImage(patch.cv, ((patch.x0 + ox) / ART) * px, ((patch.y0 + oy) / ART) * px, size, size);
      c.imageSmoothingEnabled = true;
      halo(fx, fy, s.r * 2.4, night > 0.5 ? "200,220,255" : "255,236,190", 0.45 * k, hash01(s.seed, 884));
    }
    // The opening by night: pale moonlight, a little by day.
    c.globalCompositeOperation = "lighter";
    c.imageSmoothingEnabled = false;
    c.globalAlpha = Math.min(1, base * (0.04 + 0.13 * night));
    const m = this.mask();
    c.drawImage(m, ((ox - OPEN_PAD) / ART) * px, ((oy - OPEN_PAD) / ART) * px, (m.width / ART) * px, (m.height / ART) * px);
    // Pixel details: pond glints, spores and dust, on the art grid.
    c.globalCompositeOperation = "lighter";
    c.imageSmoothingEnabled = false;
    const dot = artPen(c, px);
    if (o.effects) {
      for (const p of plan.ponds)
        for (let k = 0; k < 6; k++) {
          const u = (salt: number) => hash01(p.seed, k, salt);
          const a = u(885) * 6.28, d = Math.sqrt(u(886)) * p.r * 0.75;
          const on = o.still ? (k % 2 ? 0 : 0.6) : Math.max(0, Math.sin(t * (0.8 + u(887)) + u(888) * 6.28)) ** 3;
          if (on <= 0.05) continue;
          c.globalAlpha = base * on;
          c.fillStyle = "#e8fbff";
          dot(Math.floor((p.x + Math.cos(a) * d) * ART), Math.floor((p.y + Math.sin(a) * d) * ART));
        }
      for (const m of plan.mushrooms)
        for (let k = 0; k < CRYSTAL_CAVES.spores; k++) {
          const s = sporeAt(m, k, t);
          if (s.show <= 0.04) continue;
          c.globalAlpha = Math.min(1, base * s.show * (0.6 + 0.4 * night));
          c.fillStyle = m.hue ? "#e2c8ff" : "#b8ffe8";
          dot(Math.floor(s.x * ART), Math.floor(s.y * ART));
        }
      if (!o.still)
        for (let j = 0; j < CAVE_OPENING.dust; j++) {
          const d = openingDustAt(j, t), x = Math.floor(d.x * ART), y = Math.floor(d.y * ART);
          const lit = openingLight(x - ox, y - oy);
          if (lit < 0.5 || y < 0) continue;
          c.globalAlpha = Math.min(1, base * d.twinkle * 0.55 * (1 - 0.72 * night));
          c.fillStyle = night > 0.5 ? "#dfe8ff" : "#fff2d0";
          dot(x, y);
        }
      if (!o.still)
        for (const s of plan.shafts) {
          const k = 1 - 0.72 * night;
          for (let j = 0; j < CRYSTAL_CAVES.dust; j++) {
            const d = dustAt(s, j, t, light);
            if (d.show <= 0.04) continue;
            c.globalAlpha = Math.min(1, base * d.show * 0.7 * k);
            c.fillStyle = night > 0.5 ? "#dfe8ff" : "#fff2d0";
            dot(Math.floor(d.x * ART), Math.floor(d.y * ART));
          }
        }
    }
    c.restore();
  }
}
