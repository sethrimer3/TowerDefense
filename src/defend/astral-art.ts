/** Draws the Astral Sanctuary's floating island (`astral.ts`) at `ART`
 * pixels a cell: the floor (`astralFloorSteps`: meadow grass, lush with
 * flowers round the keep and thinning to bare earth and pebbles toward the
 * far edges, golden star-flowers in it, holes through the island onto the
 * sky beneath, and on it white standing stones carved with golden stars,
 * round star dials and pale crystal clusters, each with its shadow), then
 * live over it (`drawLive`) little islets hovering over the grass with their
 * shadows beneath them; then over the darkness (`drawGlow`) what glows: the
 * star-flowers, runes, dials and crystals breathing, halos by night and star
 * motes rising off the meadow. The pieces are drawn bare: their outline is
 * added round them while scenery outlines are on. The wilds
 * (`skyWildsSteps`) carry the meadow on round the board, bulging out round
 * the keep, until the island breaks off over open sky, its earth and rock
 * hanging beneath it, roots trailing, a waterfall pouring off its edge, its
 * shadow falling on the clouds below, and more islets floating out there,
 * some with a tree, a stone or crystals on them. Presentation only; still
 * under Reduce Motion. */
import { ART } from "./art-scale.ts";
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import {
  astralPlan, ASTRAL, hoverAt, islandLand, lushness, moteAt, stoneAt,
  type AstralPlan, type Islet, type SkyCrystal, type SkyHole, type StarDial, type StarStone,
} from "./astral.ts";
import { haloSprite, rgba, wash, washer, type Img } from "./ember-forge-art.ts";
import { setTall, standToward, tall, type Tall } from "./nadir-art.ts";
import { artPen } from "./pixel-fx.ts";
import { sceneryOutlinesOn } from "./scenery-looks.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;

const darken = (v: number, k: number) =>
  ((v & 0xff000000) | (Math.round(((v >> 16) & 0xff) * k) << 16) | (Math.round(((v >> 8) & 0xff) * k) << 8) | Math.round((v & 0xff) * k)) >>> 0;
const clampI = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));

/** The meadow's grass, darkest to lightest: a fresh green, a little cool. */
const GRASS = [0x1f3f2c, 0x284d33, 0x335d3b, 0x406f43, 0x4f824b, 0x629655, 0x7aab62, 0x95c172];
/** Drier grass, far from the keep. */
const DRY = [0x2e3d26, 0x3b4b2c, 0x4a5a33, 0x5b6a3b, 0x6e7c45, 0x84904f, 0x9ca45e, 0xb6ba72];
/** Bare earth where the grass has thinned out, and its pebbles. */
const EARTH = [0x4a3b2e, 0x5a4838, 0x6b5743, 0x7d6850, 0x93805f];
const PEBBLE = [0x6e7280, 0x9aa0ae, 0xc4c9d4];
/** Flowers: white petals, pale blue petals, a yellow eye, and the golden
 * star-flowers that glow. */
const PETAL = [0xf4f1e6, 0xb9d1f2];
const EYE = 0xf2c84a;
const STAR = [0xc89a40, 0xffe08a, 0xfff6cc];
/** White stone, shade to lit. */
const MARBLE = [0x4e5466, 0x707890, 0x98a0b6, 0xbec5d6, 0xdfe4ee, 0xf8faff];
/** Gold: dark, body, light. */
const GOLD = [0x7a5a20, 0xc89a40, 0xffe08a];
/** The dials' lapis. */
const LAPIS = [0x16224c, 0x22336c, 0x30478c];
/** Crystals: deep, body, light, shine. */
const CRYSTAL = [0x4a64a6, 0x7c9ede, 0xb6d2fa, 0xf2f8ff];
/** The sky beneath, deep to bright, and its clouds, shade to lit. */
export const SKY = [0x4f86c6, 0x5c93d0, 0x6aa1da, 0x79afe2, 0x89bde9, 0x9bcaef];
const CLOUD = [0x93add2, 0xb2c8e4, 0xd2e0f2, 0xeef4fb, 0xffffff];
/** The island's underside: earth, then bands of blue-grey rock. */
const UNDER = [0x1e1612, 0x2c211a, 0x3c2d22, 0x4d3b2c, 0x5f4a37, 0x705a44];
const ROCK = [0x2e3240, 0x41475a, 0x575f76, 0x6e7790];
const ROOT = 0x2a1c12;
/** Falling water: shade, body, foam. */
const WATER = [0x7fb2e6, 0xbcdcf6, 0xf4faff];
/** Leaves for the islets' trees, shade to lit, and their trunks. */
const LEAF = [0x1d3a26, 0x28502f, 0x356538, 0x467c42, 0x5c9450, 0x78ad62];
/** The outline drawn round each piece while scenery outlines are on. */
const INK = 0x14181e;
/** The halos' colour. */
const HALO = "255,214,130";

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

/** Whether a flower's eye lies at (x, y), and which: 0 none, 1 white, 2
 * blue, 3 a golden star-flower. */
function flowerAt(x: number, y: number, dense: number) {
  const u = hash01(x, y, 1801);
  if (u < 0.0011 * dense) return u < 0.00022 * dense ? 3 : u < 0.0006 * dense ? 1 : 2;
  return 0;
}

/** The meadow over a `w` by `h` buffer whose board corner is at (`ox`,
 * `oy`), only where `keep` (buffer pixels) says, yielding every `slice`
 * rows: grass in clumps with light blade tips, flowers and golden
 * star-flowers (their light into `glow`), thinning to bare earth with pebbles
 * the further it lies from the keep at `home` (cells). Every pixel is a
 * function of its board coordinates and the keep alone, so the field and the
 * wilds meet with no seam. */
export function* fillMeadow(out: Uint32Array, w: number, h: number, ox: number, oy: number, keep: (X: number, Y: number) => boolean, home: { x: number; y: number }, slice = Infinity, glow: Uint32Array | null = null): Generator<void, void, void> {
  const x0 = -ox, y0 = -oy;
  const broad = washer(w, x0, 34, 1811), fine = washer(w, x0, 8, 1812), bare = washer(w, x0, 15, 1813), wander = washer(w, x0, 120, 1814), bloom = washer(w, x0, 40, 1815);
  for (let Y = 0; Y < h; Y++, Y % slice || (yield)) {
    const y = Y + y0;
    broad.row(y); fine.row(y); bare.row(y); wander.row(y); bloom.row(y);
    for (let X = 0; X < w; X++) {
      if (!keep(X, Y)) continue;
      const x = X + x0, i = Y * w + X;
      const lush = lushness(x / ART, y / ART, home, wander.at(X));
      // Bare earth breaking through where the grass has thinned.
      const b = bare.at(X) + (hash01(x >> 1, y >> 1, 1816) - 0.5) * 0.08;
      if (b > 0.6 + lush * 0.6) {
        const e = clampI(Math.floor((fine.at(X) * 0.6 + hash01(x, y, 1817) * 0.4) * EARTH.length), EARTH.length);
        const p = hash01(x, y, 1818);
        out[i] = rgba(p < 0.006 ? PEBBLE[p < 0.002 ? 2 : 1] : hash01(x - 1, y - 1, 1818) < 0.006 ? PEBBLE[0] : EARTH[e]);
        continue;
      }
      // The grass: clumps, darker at the bare earth's edge and where it is
      // sparse, its blade tips catching the light.
      const v = broad.at(X) * 0.5 + fine.at(X) * 0.3 + (hash01(x, y, 1819) - 0.5) * 0.22 + lush * 0.2 - Math.max(0, b - 0.5 - lush * 0.6) * 2;
      let t = clampI(Math.floor(v * 6) + 1, GRASS.length);
      if (hash01(x, y, 1820) < 0.05) t = clampI(t + 2, GRASS.length);
      else if (hash01(x, y - 1, 1820) < 0.05) t = clampI(t - 1, GRASS.length);
      // Drier further from the keep, the two meeting in a dithered edge.
      const dry = (0.5 - lush) / 0.3 + (broad.at(X) - 0.5) * 0.8;
      let c = dry > 0.5 + (bayer(x, y) - 0.5) * 0.5 ? DRY[t] : GRASS[t];
      // Flowers, thick where the meadow blooms near the keep.
      const dense = lush * lush * (0.3 + bloom.at(X) * 1.6);
      if (dense > 0.02) {
        const f = flowerAt(x, y, dense);
        if (f) {
          c = f === 3 ? STAR[2] : EYE;
          if (glow && f === 3) glow[i] = rgba(STAR[1]);
        } else {
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const g = flowerAt(x + dx, y + dy, dense);
            if (!g) continue;
            c = g === 3 ? STAR[1] : PETAL[g - 1];
            if (glow && g === 3) glow[i] = rgba(STAR[0]);
            break;
          }
        }
      }
      out[i] = rgba(c);
    }
  }
}

/** A white standing stone from above, long along its angle: its top face
 * lit from the upper left, a golden star carved in the middle. Tall, so
 * its shadow reaches far. */
export function stonePiece(s: StarStone): Tall {
  const L = Math.max(9, Math.round(s.r * ART * 2)), Wd = Math.max(6, Math.round(L * 0.5)), S = L + 4;
  const p = tall(S, S, Math.floor(S / 2), Math.floor(S / 2), true), ca = Math.cos(s.angle), sa = Math.sin(s.angle);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const dx = i + 0.5 - S / 2, dy = j + 0.5 - S / 2, u = dx * sa - dy * ca, v = dx * ca + dy * sa;
      // A rounded slab, its top end rounder.
      const hu = L / 2, hv = Wd / 2, ru = Math.abs(u) / hu, rv = Math.abs(v) / hv;
      if (ru ** 4 + rv ** 2 >= 1) continue;
      const edge = ru ** 4 + rv ** 2 > 0.6;
      let tone = edge ? (dx + dy < 0 ? 5 : 1) : 3 + (dx + dy < -1 ? 1 : 0);
      if (!edge && hash(s.seed, i, j, 1821) % 11 === 0) tone -= 1;
      let c = MARBLE[tone], g = 0;
      // The carved star: a plus and its diagonals, small.
      const su = Math.round(u), sv = Math.round(v), star = (su === 0 && Math.abs(sv) <= 1) || (sv === 0 && Math.abs(su) <= 2) || (Math.abs(su) === 1 && Math.abs(sv) === 1 && L > 10);
      if (star && !edge) { c = su === 0 && sv === 0 ? GOLD[2] : GOLD[1]; g = GOLD[2]; }
      setTall(p, p.ax - Math.floor(S / 2) + i, p.ay - Math.floor(S / 2) + j, c, edge ? 0.8 : 1, g);
    }
  return p;
}

/** A round star dial laid flat: a white stone ring round lapis, a golden
 * eight-pointed star in it and golden marks round the ring. */
export function dialPiece(d: StarDial): Tall {
  const R = Math.max(6, Math.round(d.r * ART)), S = 2 * R + 2, c = S / 2, p = tall(S, S, Math.floor(c), Math.floor(c), true);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const dx = i + 0.5 - c, dy = j + 0.5 - c, r = Math.hypot(dx, dy);
      if (r >= R) continue;
      const a = Math.atan2(dy, dx);
      let col: number, g = 0;
      if (r > R - 2.2) {
        col = MARBLE[r > R - 1 ? (dx + dy < 0 ? 4 : 1) : 3];
        // The hour marks.
        const m = ((a / (Math.PI * 2)) * 16 + 16) % 1;
        if (r <= R - 1 && (m < 0.18 || m > 0.82)) { col = GOLD[1]; g = GOLD[1]; }
      } else if (r > R - 3) col = MARBLE[1];
      else {
        // The star: eight points, the four long ones reaching the ring.
        const k = Math.abs(Math.cos(a * 4)), arm = (R - 3) * (0.38 + 0.62 * k ** 6) * (Math.abs(Math.cos(a * 2)) > 0.7 ? 1 : 0.7);
        if (r < arm) { col = r < 1.2 ? GOLD[2] : (Math.sin(a * 8) > 0 ? GOLD[1] : GOLD[0]); g = r < 1.2 ? GOLD[2] : GOLD[1]; }
        else col = hash(d.seed, i, j, 1831) % 17 === 0 ? 0xc8d4ff : LAPIS[r > R - 4.5 ? 0 : (dx + dy < 0 ? 2 : 1)];
      }
      setTall(p, p.ax - Math.floor(c) + i, p.ay - Math.floor(c) + j, col, 0.06, g);
    }
  return p;
}

/** A cluster of pale crystals from above: a few long shards fanning out
 * from the middle, each lit on its upper-left face, tallest at its root. */
export function crystalPiece(k: SkyCrystal, scale = 1): Tall {
  const R = Math.max(4, Math.round(k.r * ART * 1.3 * scale)), S = 2 * R + 3, c = S / 2, p = tall(S, S, Math.floor(c), Math.floor(c), true);
  const n = 4 + (k.seed % 3);
  for (let s = 0; s < n; s++) {
    const a = -Math.PI / 2 + (s / (n - 1) - 0.5) * 2.6 + (hash01(k.seed, s, 1841) - 0.5) * 0.5, len = R * (0.55 + hash01(k.seed, s, 1842) * 0.45), wd = 1.2 + hash01(k.seed, s, 1843) * 1.4;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const dx = i + 0.5 - c, dy = j + 0.5 - c, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        if (u < -1 || u > len) continue;
        const half = wd * (u < len * 0.7 ? 1 : (len - u) / (len * 0.3));
        if (Math.abs(v) > half) continue;
        // Its two faces: the one toward the upper left lit.
        const nx = -sa * Math.sign(v || 1), ny = ca * Math.sign(v || 1), lit = -(nx * 0.6 + ny * 0.8);
        const tone = Math.abs(v) < 0.5 ? 3 : lit > 0 ? 2 : 1;
        setTall(p, p.ax - Math.floor(c) + i, p.ay - Math.floor(c) + j, CRYSTAL[tone], 1 - Math.max(0, u) / len * 0.7, CRYSTAL[tone > 1 ? 2 : 1]);
      }
  }
  return p;
}

/** A small tree from above: a lumpy round crown lit from the upper left. */
function treePiece(seed: number, r: number): Tall {
  const R = Math.max(4, Math.round(r * ART)), S = 2 * R + 4, c = S / 2, p = tall(S, S, Math.floor(c), Math.floor(c));
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const dx = i + 0.5 - c, dy = j + 0.5 - c, n = (wash(i, j, 3, seed % 9973) - 0.5) * 0.45, d = Math.hypot(dx, dy) / R + n;
      if (d >= 1) continue;
      const lit = -(dx * 0.6 + dy * 0.8) / R + Math.sqrt(Math.max(0, 1 - d * d)) * 0.5 + (bayer(i, j) - 0.5) * 0.5;
      const tone = clampI(Math.round(2 + lit * 2.6), LEAF.length);
      setTall(p, p.ax - Math.floor(c) + i, p.ay - Math.floor(c) + j, LEAF[tone], 1 - d * 0.4);
    }
  return p;
}

/** A hole through the island at art offset (ox, oy) of `img`: the sky
 * beneath showing through it with a wisp of cloud, the island's earth and
 * rock seen going down its far (north) side, roots trailing, its rim
 * darkened. */
export function paintHole(img: Img, h: SkyHole, ox: number, oy: number, ok: (X: number, Y: number) => boolean = () => true) {
  const cx = h.x * ART + ox, cy = h.y * ART + oy, R = h.r * ART, reach = Math.ceil(R * 1.4) + 3;
  const inside = (x: number, y: number) => {
    const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.15, rr = R * (0.8 + 0.4 * wash(x - ox, y - oy, Math.max(3, R * 0.5), h.seed % 9973));
    return dx * dx + dy * dy < rr * rr;
  };
  const wall = Math.max(3, Math.round(R * 0.55));
  for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++)
    for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h || !ok(x, y)) continue;
      const q = y * img.w + x;
      if (!inside(x, y)) {
        // The rim, and a little shade round it.
        if (inside(x, y + 1) || inside(x + 1, y) || inside(x - 1, y)) img.px[q] = darken(img.px[q], 0.55);
        else if (inside(x, y - 1)) img.px[q] = rgba(INK);
        continue;
      }
      // How far down the far side this is.
      let k = 0;
      while (k < wall && inside(x, y - k - 1)) k++;
      if (k < wall) {
        const band = Math.floor((k + wash(x, 0, 5, 1851) * 3) / 2.5);
        let c = k < 2 ? UNDER[3 + (k === 0 ? 1 : 0)] : band % 3 === 2 ? ROCK[clampI(3 - Math.floor(k / 2), ROCK.length)] : UNDER[clampI(4 - k, UNDER.length)];
        if (k >= 1 && hash01(x, 1852 + h.seed % 97) < 0.15 && k < wall * 0.8) c = ROOT;
        img.px[q] = rgba(c);
      } else {
        const n = wash(x - ox, y - oy, 9, 1853 + (h.seed % 97));
        img.px[q] = rgba(n > 0.66 ? CLOUD[n > 0.75 ? 3 : 2] : SKY[clampI(Math.floor(2 + n * 2 + (bayer(x, y) - 0.5)), SKY.length)]);
      }
    }
}

/** The floor and its glowing pixels, a stage (or a slice of rows) a step:
 * the meadow over every open cell, the holes in it, then the pieces back to
 * front. */
export function* astralFloorSteps(plan: AstralPlan): Generator<void, { floor: Uint32Array; glow: Uint32Array }, void> {
  const img: Img = { px: new Uint32Array(W * H), w: W, h: H }, glow: Img = { px: new Uint32Array(W * H), w: W, h: H };
  const ok = (x: number, y: number) => plan.open[Math.floor(y / ART) * CELLS_W + Math.floor(x / ART)] === 1;
  yield* fillMeadow(img.px, W, H, 0, 0, ok, plan.keep, 16, glow.px);
  for (const h of plan.holes) paintHole(img, h, 0, 0, ok);
  yield;
  for (const it of astralItems(plan)) it.draw(img, glow, 0, 0, ok);
  yield;
  return { floor: img.px, glow: glow.px };
}

type Item = { y: number; draw: (img: Img, glow: Img | null, ox: number, oy: number, ok: (X: number, Y: number) => boolean) => void };
/** The standing pieces back to front, each with its shadow down and right. */
export function astralItems(plan: Pick<AstralPlan, "stones" | "dials" | "crystals"> & { trees?: { x: number; y: number; r: number; seed: number }[] }): Item[] {
  const at = (p: Tall, x: number, y: number, len: number) => (img: Img, glow: Img | null, ox: number, oy: number, ok: (X: number, Y: number) => boolean) =>
    standToward(img, glow, p, x * ART + ox, y * ART + oy, ok, 0.7, 0.7, len, 0.62);
  return [
    ...plan.dials.map((d) => ({ y: d.y - 9, draw: at(dialPiece(d), d.x, d.y, 1) })),
    ...plan.stones.map((s) => ({ y: s.y, draw: at(stonePiece(s), s.x, s.y, 12) })),
    ...plan.crystals.map((k) => ({ y: k.y, draw: at(crystalPiece(k), k.x, k.y, 7) })),
    ...(plan.trees ?? []).map((t) => ({ y: t.y, draw: at(treePiece(t.seed, t.r), t.x, t.y, 7) })),
  ].sort((a, b) => a.y - b.y);
}

/** An islet from above: a round top of grass (or crystals growing from
 * it) with its earth hanging to a point beneath. */
export function isletPixels(f: Islet) {
  const R = f.r * ART, S = Math.ceil(R * 1.3) * 2 + 2, deep = Math.ceil(R * 1.6), c = S / 2, w = S, h = S + deep, px = new Uint32Array(w * h);
  const top = (i: number, j: number) => {
    const dx = i + 0.5 - c, dy = (j + 0.5 - c) * 1.2, n = (hash01(i >> 1, j >> 1, f.seed % 9973) - 0.5) * 0.25;
    return Math.hypot(dx, dy) / R + n < 1;
  };
  // The earth beneath, hanging to a point.
  for (let i = 0; i < w; i++) {
    let bottom = -1;
    for (let j = S - 1; j >= 0; j--) if (top(i, j)) { bottom = j; break; }
    if (bottom < 0) continue;
    const dx = Math.abs(i + 0.5 - c) / R, len = Math.max(1, Math.round(deep * (1 - dx * dx) * (0.8 + 0.4 * hash01(i >> 1, f.seed % 9973, 1861))));
    for (let k = 1; k <= len; k++) {
      const q = (bottom + k) * w + i, f2 = k / len;
      let tone = clampI(Math.round(4 - f2 * 3.4 + (bayer(i, k) - 0.5)), UNDER.length);
      if (i + 0.5 < c) tone = clampI(tone + 1, UNDER.length);
      px[q] = rgba(Math.floor(k / 3 + hash01(i, 1862) * 2) % 4 === 3 ? ROCK[clampI(tone - 1, ROCK.length)] : UNDER[tone]);
    }
  }
  for (let j = 0; j < S; j++)
    for (let i = 0; i < w; i++) {
      if (!top(i, j)) continue;
      const dx = i + 0.5 - c, dy = j + 0.5 - c, lit = -(dx * 0.6 + dy * 0.8) / R;
      let col = GRASS[clampI(Math.round(4 + lit * 2.5 + (hash01(i, j, f.seed % 9973) - 0.5) * 1.5), GRASS.length)];
      if (!top(i, j + 1)) col = GRASS[1];
      if (hash01(i, j, 1863) < 0.03) col = PETAL[0];
      px[j * w + i] = rgba(col);
    }
  if (f.crystal) {
    const k = crystalPiece({ x: 0, y: 0, r: f.r * 0.6, seed: f.seed });
    const x0 = Math.floor(c) - k.ax, y0 = Math.floor(c) - k.ay - 1;
    for (let j = 0; j < k.h; j++)
      for (let i = 0; i < k.w; i++) {
        const v = k.px[j * k.w + i], X = x0 + i, Y = y0 + j;
        if (v && X >= 0 && Y >= 0 && X < w && Y < h) px[Y * w + X] = v;
      }
  }
  // Its outline, while scenery outlines are on.
  if (sceneryOutlinesOn()) {
    const src = px.slice();
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (src[j * w + i]) continue;
        if ((i > 0 && src[j * w + i - 1]) || (i + 1 < w && src[j * w + i + 1]) || (j > 0 && src[(j - 1) * w + i]) || (j + 1 < h && src[(j + 1) * w + i])) px[j * w + i] = rgba(INK);
      }
  }
  return { px, w, h, ax: Math.floor(c), ay: Math.floor(c), topR: R };
}

function canvasOf(pixels: Uint32Array, w: number, h: number) {
  const cv = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = cv.getContext("2d")!, img = ctx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(pixels);
  ctx.putImageData(img, 0, 0);
  return cv;
}
/** An islet's shadow on the grass: a soft-edged oval as wide as its top. */
function shadowOf(R: number) {
  const S = Math.ceil(R * 1.2) * 2 + 2, c = S / 2, px = new Uint32Array(S * S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const d = Math.hypot(i + 0.5 - c, (j + 0.5 - c) * 1.4) / R;
      if (d < 1 && (d < 0.8 || (i + j) & 1)) px[j * S + i] = 0xff000000;
    }
  return { canvas: canvasOf(px, S, S), half: Math.floor(c) };
}

export type AstralLiveFrame = { now: number; alpha: number; still: boolean };
export type AstralGlowOptions = { now: number; alpha: number; still: boolean; night: number; effects: boolean };

export class AstralArt {
  private map: CityMap | null = null;
  plan: AstralPlan | null = null;
  private floor: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private halo: HTMLCanvasElement | null = null;
  private ink = true;
  private painting: { plan: AstralPlan; steps: Generator<void, { floor: Uint32Array; glow: Uint32Array }, void> } | null = null;
  private islets = new Map<number, { look: HTMLCanvasElement; shadow: HTMLCanvasElement; ax: number; ay: number; half: number }>();

  /** Plans `map`'s island (and repaints it) when the map changes, or when
   * scenery outlines are turned on or off. */
  sync(map: CityMap) {
    const ink = sceneryOutlinesOn();
    if (map === this.map && ink === this.ink) return;
    this.map = map;
    if (ink !== this.ink) this.islets.clear();
    this.ink = ink;
    this.plan = astralPlan(map);
    this.floor = this.glow = null;
    this.painting = null;
  }

  /** Plans `map`'s island and paints, for about `ms`, its floor ahead of a
   * battle crossing into it; whether any is left. */
  prepare(map: CityMap, ms: number) {
    if (typeof document === "undefined") return false;
    this.sync(map);
    if (this.floor) return false;
    const end = performance.now() + ms, plan = this.plan!;
    if (this.painting?.plan !== plan) this.painting = { plan, steps: astralFloorSteps(plan) };
    for (;;) {
      const r = this.painting.steps.next();
      if (r.done) { this.set(r.value); return false; }
      if (performance.now() >= end) return true;
    }
  }

  private set(v: { floor: Uint32Array; glow: Uint32Array }) {
    this.floor = canvasOf(v.floor, W, H);
    this.glow = canvasOf(v.glow, W, H);
    this.painting = null;
  }

  private ready() {
    if (!this.floor && this.plan) {
      const steps = this.painting?.plan === this.plan ? this.painting.steps : astralFloorSteps(this.plan);
      for (;;) { const r = steps.next(); if (r.done) { this.set(r.value); break; } }
    }
    return !!this.floor;
  }

  /** The meadow over the open cells. */
  drawFloor(c: CanvasRenderingContext2D, px: number, alpha: number) {
    if (!this.plan || alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= alpha;
    c.drawImage(this.floor!, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
  }

  /** The islets hovering over the grass, their shadows beneath them. */
  drawLive(c: CanvasRenderingContext2D, px: number, f: AstralLiveFrame) {
    const plan = this.plan;
    if (!plan || f.alpha <= 0 || typeof document === "undefined") return;
    const t = f.still ? 0 : f.now / 1000, k = px / ART;
    c.save();
    c.imageSmoothingEnabled = false;
    const blit = (cv: HTMLCanvasElement, X: number, Y: number) => c.drawImage(cv, X * k, Y * k, cv.width * k, cv.height * k);
    const base = c.globalAlpha * f.alpha;
    for (const fl of plan.islets) {
      let s = this.islets.get(fl.seed);
      if (!s) {
        const p = isletPixels(fl), sh = shadowOf(p.topR);
        s = { look: canvasOf(p.px, p.w, p.h), shadow: sh.canvas, ax: p.ax, ay: p.ay, half: sh.half };
        this.islets.set(fl.seed, s);
      }
      const at = hoverAt(fl, t), X = Math.round(at.x * ART), Y = Math.round(at.y * ART);
      // The shadow falls down and right of it, further the higher it floats.
      c.globalAlpha = base * 0.28;
      blit(s.shadow, X - s.half + Math.round(at.lift * 3), Y - s.half + Math.round(at.lift * 4));
      c.globalAlpha = base;
      blit(s.look, X - s.ax, Y - s.ay - Math.round(at.lift * 4));
    }
    c.restore();
  }

  /** What glows, over the battle's darkness: the star-flowers, runes, dials
   * and crystals breathing, halos by night, star motes rising. */
  drawGlow(c: CanvasRenderingContext2D, px: number, o: AstralGlowOptions) {
    const plan = this.plan;
    if (!plan || o.alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    this.halo ??= haloSprite(HALO);
    const t = o.still ? 0 : o.now / 1000, base = c.globalAlpha * o.alpha, night = Math.max(0, Math.min(1, o.night));
    const breathe = o.still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.1);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.imageSmoothingEnabled = false;
    c.globalAlpha = Math.min(1, base * (0.12 + 0.6 * night) * (0.7 + 0.3 * breathe));
    c.drawImage(this.glow!, 0, 0, CELLS_W * px, CELLS_H * px);
    c.imageSmoothingEnabled = true;
    const halo = (x: number, y: number, r: number, k: number) => {
      c.globalAlpha = Math.min(1, base * k * (0.1 + 0.9 * night) * (0.6 + 0.4 * breathe));
      const s = r * px * 2;
      c.drawImage(this.halo!, x * px - s / 2, y * px - s / 2, s, s);
    };
    for (const d of plan.dials) halo(d.x, d.y, d.r * 1.6, 0.6);
    for (const k of plan.crystals) halo(k.x, k.y, 1.4, 0.55);
    for (const s of plan.stones) halo(s.x, s.y, 0.9, 0.35);
    for (const fl of plan.islets) if (fl.crystal) { const at = hoverAt(fl, t); halo(at.x, at.y - at.lift * 0.5, 1.2, 0.5); }
    c.imageSmoothingEnabled = false;
    if (o.effects && !o.still) {
      const dot = artPen(c, px);
      for (let m = 0; m < ASTRAL.motes; m++) {
        const s = moteAt(plan, m, t);
        if (s.show <= 0.04) continue;
        c.globalAlpha = Math.min(1, base * s.show * s.twinkle * (0.35 + 0.65 * night));
        c.fillStyle = m % 3 ? "#ffe8a0" : "#d8e8ff";
        dot(Math.floor(s.x * ART), Math.floor(s.y * ART));
      }
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- the wilds

/** An islet out in the sky past the field, `r` cells across, perhaps with
 * a tree, a standing stone or crystals on it. */
export type SkyIsle = { x: number; y: number; r: number; seed: number };

/** Plans the islets in the sky, `margin` cells past every edge: more of
 * them, and bigger, further out. Those the island would touch are left out
 * when painted. */
export function skyIsles(margin: number): SkyIsle[] {
  const out: SkyIsle[] = [];
  const off = (x: number, y: number) => { const dx = x < 0 ? -x : x > CELLS_W ? x - CELLS_W : 0, dy = y < 0 ? -y : y > CELLS_H ? y - CELLS_H : 0; return Math.hypot(dx, dy); };
  for (let cy = -margin; cy < CELLS_H + margin; cy++)
    for (let cx = -margin; cx < CELLS_W + margin; cx++) {
      const x = cx + 0.5, y = cy + 0.5;
      if (off(x, y) < 8) continue;
      const u = hash01(cx, cy, 1871);
      const big = u < 0.0011, r = big ? 2.2 + hash01(cx, cy, 1872) * 3 : 0.5 + hash01(cx, cy, 1872) * 1.1;
      if (!big && u >= 0.0028) continue;
      if (out.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + r + 3) ** 2)) continue;
      out.push({ x, y, r, seed: hash(cx, cy, 1873) });
    }
  return out;
}

/** The open sky, painted once: bright blue, deepening further out, with
 * two layers of cloud below, the nearer white and lit from the upper left
 * and shading its underside, the further paler and bluer under the nearer's
 * shadows; and the odd star that shows only by night (into `glow`). */
const skies = new Map<string, { px: Uint32Array; glow: Uint32Array }>();
function* skySteps(gw: number, gh: number, ox: number, oy: number, bw: number, bh: number, slice: number): Generator<void, { px: Uint32Array; glow: Uint32Array }, void> {
  const key = `${gw}x${gh}:${ox},${oy}`, made = skies.get(key);
  if (made) return made;
  const px = new Uint32Array(gw * gh), glow = new Uint32Array(gw * gh);
  // The near clouds' field, kept whole so each pixel can look up and left
  // (for its light) and down and right (for its shade and shadow).
  const near = new Float32Array(gw * gh);
  {
    const a = washer(gw, 0, 150, 1881), b = washer(gw, 0, 52, 1882), c = washer(gw, 0, 16, 1883);
    for (let Y = 0; Y < gh; Y++, Y % slice || (yield)) {
      a.row(Y); b.row(Y); c.row(Y);
      for (let X = 0; X < gw; X++) near[Y * gw + X] = a.at(X) * 0.58 + b.at(X) * 0.34 + c.at(X) * 0.08;
    }
  }
  const N = 0.6, at = (X: number, Y: number) => (X < 0 || Y < 0 || X >= gw || Y >= gh ? 0 : near[Y * gw + X]);
  const far = washer(gw, 0, 90, 1884), farFine = washer(gw, 0, 24, 1885), broad = washer(gw, 0, 260, 1886);
  for (let Y = 0; Y < gh; Y++, Y % slice || (yield)) {
    far.row(Y); farFine.row(Y); broad.row(Y);
    const dy = Y < oy ? oy - Y : Y >= oy + bh ? Y - oy - bh : 0;
    for (let X = 0; X < gw; X++) {
      const i = Y * gw + X, n = near[i];
      if (n > N) {
        // A near cloud: its edge toward the light bright, toward the shade grey.
        const lit = at(X - 3, Y - 3) < N, shade = at(X + 3, Y + 4) < N, deep = at(X + 2, Y + 2) < N + 0.015;
        const tone = lit ? 4 : shade ? 1 : deep ? 2 : 3;
        px[i] = rgba(CLOUD[tone]);
        continue;
      }
      const dx = X < ox ? ox - X : X >= ox + bw ? X - ox - bw : 0, d = Math.hypot(dx, dy) / ART;
      const f = far.at(X) * 0.7 + farFine.at(X) * 0.3;
      // The sky, a step deeper further out, dithered between its bands.
      const tone = clampI(Math.floor(4.4 + broad.at(X) * 1.4 - d / 40), SKY.length);
      let c = rgba(SKY[tone]);
      // The far clouds: a pale haze a little lighter than the sky round them.
      if (f > 0.6 + (bayer(X, Y) - 0.5) * 0.02) c = rgba(f > 0.67 ? CLOUD[2] : SKY[SKY.length - 1]);
      // The near clouds' shadows on what lies below them.
      if (at(X - 9, Y - 12) > N + 0.02) c = darken(c, 0.9);
      px[i] = c;
      const s = hash01(X, Y, 1887);
      if (s < 0.00025) glow[i] = rgba(s < 0.00008 ? 0xfff2c0 : 0x9ab8ff);
    }
  }
  const out = { px, glow };
  skies.set(key, out);
  return out;
}

/** The sky round the field into `out` (and its light into `glow`), a `gw`
 * by `gh` buffer with the board's corner at (`ox`, `oy`) and the board `bw`
 * by `bh` pixels, `margin` cells round it, with the keep at `keep` (cells):
 * the island's meadow carried on past the board, a ragged rim all round and
 * a great lobe round the keep, then breaking off over open sky with its
 * earth and rock hanging beneath, roots trailing and a waterfall pouring off
 * its south edge, its shadow on the clouds; and the islets floating out
 * there, some with a tree, a standing stone or crystals on them. */
export function* skyWildsSteps(out: Uint32Array, glow: Uint32Array, gw: number, gh: number, ox: number, oy: number, bw: number, bh: number, margin: number, slice: number, keep: { x: number; y: number }): Generator<void, void, void> {
  const sky = yield* skySteps(gw, gh, ox, oy, bw, bh, slice);
  out.set(sky.px);
  glow.set(sky.glow);
  const onBoard = (X: number, Y: number) => X >= ox && Y >= oy && X < ox + bw && Y < oy + bh;
  // The island's reach: the board and its rim, and the lobe round the keep.
  const lobe = (ASTRAL.lobe + ASTRAL.lobeWander + 3) * ART;
  const bx0 = Math.max(0, Math.min(ox - 7 * ART, Math.floor(ox + keep.x * ART - lobe))), bx1 = Math.min(gw, Math.max(ox + bw + 7 * ART, Math.ceil(ox + keep.x * ART + lobe)));
  const by0 = Math.max(0, Math.min(oy - 7 * ART, Math.floor(oy + keep.y * ART - lobe / 1.1))), by1 = Math.min(gh, Math.max(oy + bh + 7 * ART, Math.ceil(oy + keep.y * ART + lobe / 1.1)));
  // Which pixels are land: 1 the island, 2 an islet.
  const land = new Uint8Array(gw * gh);
  {
    const rim = washer(gw, -ox, 7 * ART, 1891), rough = washer(gw, -ox, 2 * ART, 1892), wide = washer(gw, -ox, 18 * ART, 1893);
    for (let Y = by0; Y < by1; Y++, Y % slice || (yield)) {
      rim.row(Y - oy); rough.row(Y - oy); wide.row(Y - oy);
      for (let X = bx0; X < bx1; X++)
        if (onBoard(X, Y) || islandLand((X - ox) / ART, (Y - oy) / ART, keep, rim.at(X), rough.at(X), wide.at(X))) land[Y * gw + X] = 1;
    }
  }
  const landAt = (X: number, Y: number) => X >= 0 && Y >= 0 && X < gw && Y < gh && land[Y * gw + X] === 1;
  // The islets the island leaves room for.
  const isles = skyIsles(margin).filter((s) => {
    const cx = s.x * ART + ox, cy = s.y * ART + oy, R = (s.r + 4) * ART;
    for (let a = 0; a < 16; a++) if (landAt(Math.round(cx + Math.cos(a / 16 * 6.283) * R), Math.round(cy + Math.sin(a / 16 * 6.283) * R))) return false;
    return !landAt(Math.round(cx), Math.round(cy));
  });
  const boxes: [number, number, number, number][] = [[bx0, by0, bx1, by1]];
  for (const s of isles) {
    const R = s.r * ART, cx = s.x * ART + ox, cy = s.y * ART + oy;
    const x0 = Math.max(0, Math.floor(cx - R * 1.3)), x1 = Math.min(gw, Math.ceil(cx + R * 1.3)), y0 = Math.max(0, Math.floor(cy - R * 1.3)), y1 = Math.min(gh, Math.ceil(cy + R * 1.3));
    for (let Y = y0; Y < y1; Y++)
      for (let X = x0; X < x1; X++) {
        const rr = R * (0.78 + 0.44 * wash(X, Y, Math.max(3, R * 0.6), s.seed % 9973));
        if ((X + 0.5 - cx) ** 2 + ((Y + 0.5 - cy) * 1.15) ** 2 < rr * rr) land[Y * gw + X] = 2;
      }
    boxes.push([x0, y0, x1, y1]);
  }
  yield;
  // The land's shadow on the sky and clouds, down and right of it.
  const SX = 7 * ART, SY = 10 * ART;
  // (The island's only: the islets float too high to throw theirs on them.)
  for (const [x0, y0, x1, y1] of boxes.slice(0, 1))
    for (let Y = y0 + SY; Y < Math.min(gh, y1 + SY); Y++, Y % (slice * 2) || (yield))
      for (let X = x0 + SX; X < Math.min(gw, x1 + SX); X++) {
        const i = Y * gw + X;
        if (land[i] || onBoard(X, Y) || !land[(Y - SY) * gw + X - SX]) continue;
        out[i] = darken(out[i], 0.8);
      }
  // The earth hanging under each edge that faces down: as deep as the land
  // above it runs (so an islet hangs to a point), at most a jagged depth
  // that wanders along the edge.
  const under = new Uint8Array(gw * gh), depthAt = new Uint16Array(gw * gh), topAt = new Uint16Array(gw * gh);
  const hangs = (x0: number, y0: number, x1: number, y1: number, big: boolean) => {
    for (let X = x0; X < x1; X++) {
      let run = 0, left = 0, top = 0;
      const most = big ? ART * (7 + 9 * wash(X, 0, 60, 1894)) + (hash01(X >> 1, 1895) - 0.5) * 8 : Infinity;
      for (let Y = y0; Y < Math.min(gh, y1 + (big ? 20 * ART : (y1 - y0) * 2)); Y++) {
        const i = Y * gw + X;
        if (land[i]) { run++; left = 0; continue; }
        if (run) { left = Math.max(2, Math.min(run * (big ? 0.3 : 0.95), most)); top = Y; run = 0; }
        if (left > 0 && Y - top < left) { under[i] = 1; depthAt[i] = Math.min(65535, Math.round(((Y - top) / left) * 1000)); topAt[i] = Math.min(65535, Y - top); }
        else left = 0;
      }
    }
  };
  boxes.forEach(([x0, y0, x1, y1], n) => hangs(x0, y0, x1, y1, n === 0));
  yield;
  const band = washer(gw, 0, 9, 1896);
  for (const [x0, y0, x1, y1] of boxes) {
    for (let Y = y0; Y < Math.min(gh, y1 + 24 * ART); Y++, Y % slice || (yield)) {
      band.row(Y);
      for (let X = x0; X < x1; X++) {
        const i = Y * gw + X;
        if (!under[i] || land[i] || onBoard(X, Y)) continue;
        const q = depthAt[i] / 1000, k = topAt[i], strata = Math.floor((Y + band.at(X) * 6) / 3) % 3;
        let tone = Math.round(4.6 - q * 4 + (hash01(X >> 1, 1897) - 0.5) * 1.2 + (bayer(X, Y) - 0.5) * 0.8);
        if (!under[i - 1]) tone += 1; else if (X + 1 < gw && !under[i + 1]) tone -= 1;
        let c = strata === 2 && k > 3 ? ROCK[clampI(tone - 2, ROCK.length)] : UNDER[clampI(tone, UNDER.length)];
        // Grass hanging over the lip, and roots trailing down.
        if (k === 0 && hash01(X, 1898) < 0.5) c = GRASS[1];
        else if (k > 1 && q < 0.7 && hash01(X, 1899) < 0.08) c = ROOT;
        if (q < 0.04 && k > 1) c = UNDER[0];
        out[i] = rgba(c);
      }
    }
  }
  // Roots trailing on past the earth's lowest point now and then.
  for (const [x0, , x1] of boxes)
    for (let X = x0; X < x1; X++) {
      if (hash01(X, 1900) > 0.05) continue;
      let Y = gh - 1;
      for (; Y > 0; Y--) if (under[Y * gw + X]) break;
      if (Y <= 0 || land[Y * gw + X]) continue;
      const len = 2 + Math.floor(hash01(X, 1901) * 8);
      for (let k = 1; k <= len && Y + k < gh; k++) out[(Y + k) * gw + X + (k > len / 2 && hash01(X, 1902) < 0.5 ? 1 : 0)] = rgba(ROOT);
    }
  yield;
  // The meadow on the land, as on the field.
  const ground = (X: number, Y: number) => land[Y * gw + X] > 0 && !onBoard(X, Y);
  for (const [x0, y0, x1, y1] of boxes) {
    const w = x1 - x0, h = y1 - y0, buf = new Uint32Array(w * h), lit = new Uint32Array(w * h);
    for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) buf[Y * w + X] = out[(Y + y0) * gw + X + x0];
    yield* fillMeadow(buf, w, h, ox - x0, oy - y0, (X, Y) => ground(X + x0, Y + y0), keep, slice, lit);
    for (let Y = 0; Y < h; Y++)
      for (let X = 0; X < w; X++) {
        if (!ground(X + x0, Y + y0)) continue;
        out[(Y + y0) * gw + X + x0] = buf[Y * w + X];
        if (lit[Y * w + X]) glow[(Y + y0) * gw + X + x0] = lit[Y * w + X];
      }
  }
  // The land's edge where it breaks off: lit along the top, dark below.
  for (const [x0, y0, x1, y1] of boxes)
    for (let Y = Math.max(1, y0); Y < Math.min(gh - 1, y1); Y++)
      for (let X = Math.max(1, x0); X < Math.min(gw - 1, x1); X++) {
        const i = Y * gw + X;
        if (!land[i] || onBoard(X, Y)) continue;
        if (!land[i + gw]) out[i] = rgba(GRASS[2]);
        else if (!land[i - gw] || !land[i - 1] || !land[i + 1]) out[i] = rgba(!land[i - gw] ? GRASS[6] : !land[i - 1] ? GRASS[5] : GRASS[1]);
      }
  yield;
  // A waterfall pouring off the island's south edge, below the keep and to
  // one side of it, falling into mist far below.
  {
    const X0 = Math.round(ox + (keep.x + (hash01(Math.round(keep.x), Math.round(keep.y), 1903) < 0.5 ? -1 : 1) * (9 + hash01(Math.round(keep.x), 1904) * 8)) * ART);
    let top = -1;
    if (X0 > 4 && X0 < gw - 8) for (let Y = by1 - 1; Y > oy + bh; Y--) if (land[Y * gw + X0] === 1) { top = Y + 1; break; }
    if (top > 0) {
      const wide = 5, fall = 34 * ART;
      for (let k = 0; k < fall && top + k < gh; k++) {
        const spread = k / fall, Y = top + k;
        for (let dx = -Math.floor(spread * 6); dx < wide + Math.floor(spread * 6); dx++) {
          const X = X0 + dx;
          if (X < 0 || X >= gw || land[Y * gw + X] === 1) continue;
          const core = dx >= 0 && dx < wide, fade = core ? spread ** 1.6 : 0.4 + spread * 0.6;
          if (hash01(X, Y >> 1, 1905) < fade) continue;
          const streak = (Y + Math.floor(hash01(X, 1906) * 9)) % 7;
          out[Y * gw + X] = rgba(dx === 0 || dx === wide - 1 ? WATER[0] : streak < 2 ? WATER[2] : WATER[1]);
        }
      }
      // The mist where it vanishes.
      for (let j = -3 * ART; j < 4 * ART; j++)
        for (let i = -4 * ART; i < 5 * ART + wide; i++) {
          const X = X0 + i, Y = top + fall + j;
          if (X < 0 || Y < 0 || X >= gw || Y >= gh || land[Y * gw + X]) continue;
          const d = Math.hypot((i - wide / 2) / (4.5 * ART), j / (3.5 * ART)) + (wash(X, Y, 6, 1907) - 0.5) * 0.5;
          if (d < 1 && bayer(X, Y) < 1 - d) out[Y * gw + X] = rgba(d < 0.5 ? CLOUD[4] : CLOUD[3]);
        }
    }
  }
  // What stands on the islets, and a few stones, crystals and trees on the
  // island's lobe past the board.
  const img: Img = { px: out, w: gw, h: gh }, light: Img = { px: glow, w: gw, h: gh };
  const stones: StarStone[] = [], crystals: SkyCrystal[] = [], trees: { x: number; y: number; r: number; seed: number }[] = [];
  for (const s of isles) {
    if (s.r < 1.6) continue;
    const kind = s.seed % 4;
    if (kind === 0) stones.push(stoneAt(s.x, s.y, s.seed));
    else if (kind === 1) crystals.push({ x: s.x, y: s.y, r: 0.7 + hash01(s.seed, 1908) * 0.3, seed: s.seed });
    else trees.push({ x: s.x, y: s.y, r: 0.9 + hash01(s.seed, 1909) * 0.6, seed: s.seed });
  }
  for (let cy = Math.floor((by0 - oy) / ART); cy < (by1 - oy) / ART; cy++)
    for (let cx = Math.floor((bx0 - ox) / ART); cx < (bx1 - ox) / ART; cx++) {
      const u = hash01(cx, cy, 1910);
      if (u > 0.006 || (cx >= -1 && cy >= -1 && cx <= CELLS_W && cy <= CELLS_H)) continue;
      const X = Math.round((cx + 0.5) * ART) + ox, Y = Math.round((cy + 0.5) * ART) + oy, R = 2.2 * ART;
      if (![[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]].every(([dx, dy]) => landAt(X + dx, Y + dy))) continue;
      const seed = hash(cx, cy, 1911);
      if (u < 0.0035) trees.push({ x: cx + 0.5, y: cy + 0.5, r: 0.9 + hash01(seed, 1909) * 0.7, seed });
      else if (u < 0.005) stones.push(stoneAt(cx + 0.5, cy + 0.5, seed));
      else crystals.push({ x: cx + 0.5, y: cy + 0.5, r: 0.6 + hash01(seed, 1908) * 0.3, seed });
    }
  for (const it of astralItems({ stones, crystals, dials: [], trees })) it.draw(img, light, ox, oy, ground);
}
