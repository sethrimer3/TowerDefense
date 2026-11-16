/** Draws the Ember Forge (`ember-forge.ts`) at `ART` pixels a cell: the
 * volcanic floor (`emberFloorSteps`: dark cinders with pumice and pale ash,
 * glowing fissures, lava pools under drifting crust, and standing on it the
 * cinder cones, basalt boulders, obsidian and the dwarves' scrap, each with
 * its shadow, under the units and the battle's darkness), then over the
 * darkness (`drawGlow`) what glows: the lava's own light (`glow`) with soft
 * halos breathing like a forge, bubbles bursting on the pools, sparks spat
 * from the vents and their smoke. The pieces are drawn bare: their outline
 * is added round them (`stand`) while scenery outlines are on. The wilds
 * (`wilds.ts`) lay the same cinders (`fillCinder`, the same pixels in board
 * coordinates, so the board's edge is no seam) and stand the same pieces.
 * Presentation only; still under Reduce Motion. */
import { ART } from "./art-scale.ts";
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import {
  bubbleAt, emberForgePlan, EMBER_FORGE, smokeAt, sparkAt,
  type EmberForgePlan, type Fissure, type ForgeRock, type ObsidianCluster, type Scrap, type Vent,
} from "./ember-forge.ts";
import { artPen } from "./pixel-fx.ts";
import { sceneryOutlinesOn } from "./scenery-looks.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;

/** RGB to packed ABGR (canvas pixel order), opaque unless `a` given. */
export const rgba = (hex: number, a = 255) => ((a << 24) | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >> 16) & 0xff)) >>> 0;
const darken = (v: number, k: number) =>
  ((v & 0xff000000) | (Math.round(((v >> 16) & 0xff) * k) << 16) | (Math.round(((v >> 8) & 0xff) * k) << 8) | Math.round((v & 0xff) * k)) >>> 0;

/** Cinders, darkest to lightest; pale ash; pumice pebbles; a live ember. */
const CINDER = [0x120d0c, 0x171110, 0x1c1513, 0x221916, 0x281e1a, 0x2f231e];
const ASH = [0x2b2422, 0x332b28, 0x3c3330];
const PUMICE = { lit: 0x5a4a40, mid: 0x3d302a, dark: 0x0a0707 };
const SPECK = 0xd0581c;
/** Lava, coolest to hottest. */
export const LAVA = [0x7a1a0a, 0xb4300e, 0xe25412, 0xff861c, 0xffbe48, 0xfff08c];
/** Crust drifting on a pool, and the pool's cooled basalt rim. */
const CRUST = [0x1a0e0b, 0x261410, 0x34201a];
const RIM = { lit: 0x3d2c25, mid: 0x251a16, dark: 0x0d0907 };
/** Basalt boulders and cinder cones, foot to top. */
const BASALT = [0x0f0b0a, 0x181210, 0x221a17, 0x2d2420, 0x3b302b, 0x4c3f38];
const CONE = [0x1b1311, 0x281c18, 0x37281f, 0x4a3628, 0x5e4533];
const SULPHUR = [0x8f7a22, 0xd2bb44];
/** Obsidian: shade, body, lit, glint; and the lava's glint in it. */
const OBSIDIAN = [0x0f0a15, 0x1e1629, 0x3a2d50, 0xb4a6dc];
const LAVA_GLINT = 0xff9a4a;
/** Iron (deepest shade to highlight), rust, and the ingots' metals. */
const IRON = [0x141418, 0x2a2b31, 0x464851, 0x6e717c, 0x9da1ad];
const RUST = [0x5a2a14, 0x8a4520];
const METALS = [[0x4a2e0c, 0x80561a, 0xc68e2a, 0xf2c85a], [0x4a1e10, 0x7e3a1e, 0xb8623a, 0xe89a6a]];
/** Slag, dark to light. */
const SLAG = [0x1a1210, 0x2a1d17, 0x3b2a1f, 0x4e3a2a, 0x66503a];
/** The outline drawn round each piece while scenery outlines are on. */
const INK = 0x0a0605;
/** The halos' colour. */
const HALO = "255,120,40";

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** A buffer of art pixels; `ok` (if given) says which may be painted. */
export type Img = { px: Uint32Array; w: number; h: number };
const put = (img: Img, x: number, y: number, c: number) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x >= 0 && y >= 0 && x < img.w && y < img.h) img.px[y * img.w + x] = rgba(c);
};

/** `wash(x, y, scale, salt)` (smooth value noise, 0..1, features `scale`
 * pixels apart) along a row of `w` pixels from `x0`: each column's lattice
 * cell worked out once, the lattice's hashes once a row (`row`, then `at`). */
function washer(w: number, x0: number, scale: number, salt: number) {
  const ixs = new Int32Array(w), sxs = new Float64Array(w);
  for (let X = 0; X < w; X++) {
    const fx = (X + x0) / scale, ix = Math.floor(fx), tx = fx - ix;
    ixs[X] = ix; sxs[X] = tx * tx * (3 - 2 * tx);
  }
  const lo = ixs[0], n = ixs[w - 1] - lo + 2;
  const top = new Float64Array(n), bottom = new Float64Array(n);
  let rowAt = NaN, sy = 0;
  return {
    row(y: number) {
      const fy = y / scale, iy = Math.floor(fy), ty = fy - iy;
      sy = ty * ty * (3 - 2 * ty);
      if (iy !== rowAt) {
        rowAt = iy;
        for (let k = 0; k < n; k++) (top[k] = hash01(lo + k, iy, salt)), (bottom[k] = hash01(lo + k, iy + 1, salt));
      }
    },
    at(X: number) {
      const k = ixs[X] - lo, sx = sxs[X];
      const a = top[k], b = top[k + 1], c = bottom[k], d = bottom[k + 1];
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    },
  };
}
/** Smooth value noise, 0..1, with features `scale` pixels apart. */
function wash(x: number, y: number, scale: number, salt: number) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash01(ix, iy, salt), b = hash01(ix + 1, iy, salt), c = hash01(ix, iy + 1, salt), d = hash01(ix + 1, iy + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** The cinder ground over a `w` by `h` buffer whose board corner is at
 * (`ox`, `oy`), only where `keep` (buffer pixels) says, yielding every
 * `slice` rows: tones of cinder in clumps, drifts of pale ash, pumice
 * pebbles lit from the upper left and now and then a live ember. Every
 * pixel is a function of its board coordinates alone, so the field and the
 * wilds meet with no seam. */
export function* fillCinder(out: Uint32Array, w: number, h: number, ox: number, oy: number, keep: (X: number, Y: number) => boolean, slice = Infinity): Generator<void, void, void> {
  const x0 = -ox, y0 = -oy;
  const broad = washer(w, x0, 36, 990), fine = washer(w, x0, 8, 991), ash = washer(w, x0, 30, 992), ragged = washer(w, x0, 7, 998);
  for (let Y = 0; Y < h; Y++, Y % slice || (yield)) {
    const y = Y + y0;
    broad.row(y); fine.row(y); ash.row(y); ragged.row(y);
    for (let X = 0; X < w; X++) {
      if (!keep(X, Y)) continue;
      const x = X + x0;
      const v = broad.at(X) * 0.62 + fine.at(X) * 0.38 + (hash01(x, y, 993) - 0.5) * 0.42;
      const a = ash.at(X) * 0.75 + ragged.at(X) * 0.25 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.03;
      const c = a > 0.7
        ? ASH[Math.max(0, Math.min(2, Math.floor(v * 3)))]
        : CINDER[Math.max(0, Math.min(CINDER.length - 1, Math.floor(v * CINDER.length)))];
      out[Y * w + X] = rgba(hash01(x, y, 994) < 0.00025 ? SPECK : c);
    }
  }
  // A pumice pebble a cell.
  const cx0 = Math.floor(x0 / ART) - 1, cy0 = Math.floor(y0 / ART) - 1, cx1 = Math.floor((x0 + w) / ART), cy1 = Math.floor((y0 + h) / ART);
  const dot = (x: number, y: number, c: number) => {
    const X = x - x0, Y = y - y0;
    if (X >= 0 && Y >= 0 && X < w && Y < h && keep(X, Y)) out[Y * w + X] = rgba(c);
  };
  for (let cy = cy0; cy <= cy1; cy++, (cy - cy0) % 8 || (yield))
    for (let cx = cx0; cx <= cx1; cx++)
      for (let k = 0; k < 1; k++) {
        const x = cx * ART + (hash(cx, cy, k, 995) % ART), y = cy * ART + (hash(cx, cy, k, 996) % ART), big = hash(cx, cy, k, 997) % 3 === 0;
        dot(x, y, big ? PUMICE.lit : PUMICE.mid);
        if (big) { dot(x + 1, y, PUMICE.mid); dot(x, y + 1, PUMICE.mid); }
        dot(x + 1, y + 1, PUMICE.dark);
      }
}

/** A piece standing on the ground: its pixels (0 clear), its glowing pixels
 * (or null), its size, and where its foot's middle is in it. */
export type Piece = { px: Uint32Array; glow: Uint32Array | null; w: number; h: number; ax: number; ay: number };
const PAD = 2;
function piece(w: number, h: number, ax: number, ay: number, glows = false): Piece & Img {
  w += 2 * PAD; h += 2 * PAD;
  return { px: new Uint32Array(w * h), glow: glows ? new Uint32Array(w * h) : null, w, h, ax: ax + PAD, ay: ay + PAD };
}

/** Stands `p` with its foot at art pixel (x, y) of `img` (and its light in
 * `glow`): first its shadow down and right over the ground, then its
 * outline (while scenery outlines are on), then the piece itself; only on
 * pixels `ok` allows. */
export function stand(img: Img, glow: Img | null, p: Piece, x: number, y: number, ok: (X: number, Y: number) => boolean = () => true, drop = 2) {
  const x0 = Math.round(x) - p.ax, y0 = Math.round(y) - p.ay, ink = sceneryOutlinesOn() ? rgba(INK) : 0;
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < p.w && j < p.h ? p.px[j * p.w + i] : 0);
  for (let j = 0; j < p.h + drop; j++)
    for (let i = 0; i < p.w + drop; i++) {
      const X = x0 + i, Y = y0 + j;
      if (X < 0 || Y < 0 || X >= img.w || Y >= img.h || !ok(X, Y)) continue;
      const q = Y * img.w + X, v = at(i, j);
      if (v) {
        img.px[q] = v;
        if (glow) glow.px[q] = p.glow?.[j * p.w + i] ?? 0;
        continue;
      }
      if (ink && (at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1))) { img.px[q] = ink; if (glow) glow.px[q] = 0; continue; }
      if (at(i - drop, j - drop) || at(i - 1, j - drop)) img.px[q] = darken(img.px[q], (X + Y) & 1 ? 0.55 : 0.62);
    }
}

/** A basalt boulder from its lobes: shaded by its slope toward the upper
 * left, a glowing seam through it if it has one. */
export function rockPiece(r: ForgeRock): Piece {
  const R = Math.ceil(r.r * ART * 1.2) + 1, p = piece(2 * R, 2 * R, R, R, r.seam);
  const cx = r.x * ART, cy = r.y * ART, h = new Float32Array(p.w * p.h);
  for (const l of r.lobes) {
    const LR = l.r * ART, lx = (l.x * ART - cx) + p.ax, ly = (l.y * ART - cy) + p.ay;
    for (let y = Math.max(0, Math.floor(ly - LR)); y < Math.min(p.h, Math.ceil(ly + LR)); y++)
      for (let x = Math.max(0, Math.floor(lx - LR)); x < Math.min(p.w, Math.ceil(lx + LR)); x++) {
        const n = (hash01(x >> 1, y >> 1, r.seed) - 0.5) * 0.14;
        const d = Math.sqrt((x + 0.5 - lx) ** 2 + (y + 0.5 - ly) ** 2) / LR + n;
        if (d >= 1) continue;
        const v = Math.sqrt(1 - d * d);
        if (v > h[y * p.w + x]) h[y * p.w + x] = v;
      }
  }
  const hAt = (x: number, y: number) => (x >= 0 && y >= 0 && x < p.w && y < p.h ? h[y * p.w + x] : 0);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      if (h[i] <= 0) continue;
      const gx = hAt(x + 1, y) - hAt(x - 1, y), gy = hAt(x, y + 1) - hAt(x, y - 1);
      const lit = (gx * 0.6 + gy * 0.8) * 3 + h[i] * 0.7 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.5;
      let c = BASALT[Math.max(0, Math.min(BASALT.length - 1, Math.round(1 + lit * 2.2)))];
      // Pitted: vesicles here and there.
      if (hash(x + Math.round(cx), y + Math.round(cy), r.seed, 958) % 17 === 0) c = BASALT[0];
      p.px[i] = rgba(c);
      if (r.seam && h[i] > 0.2 && Math.abs(wash(x, y, 6, r.seed) - 0.5) < 0.05) {
        const hot = Math.abs(wash(x, y, 6, r.seed) - 0.5) < 0.022;
        p.px[i] = rgba(hot ? LAVA[3] : LAVA[1]);
        p.glow![i] = rgba(hot ? LAVA[4] : LAVA[2]);
      }
    }
  return p;
}

/** A cinder cone: a little mound lit on its left, its mouth glowing, a
 * crust of sulphur round the lip. */
export function ventPiece(v: Vent): Piece {
  const R = v.r * ART, top = Math.round(R * 0.8), base = Math.round(R * 0.35), w = Math.ceil(2 * R) + 2;
  const p = piece(w, top + base + 2, Math.floor(w / 2), top + 1, true), mouth = Math.max(1.5, R * 0.3);
  for (let j = -top; j <= base; j++) {
    const f = (j + top) / (top + base), half = j <= 0 ? mouth + 0.6 + (R - mouth - 0.6) * f ** 0.8 : R * Math.sqrt(Math.max(0, 1 - (j / (base + 0.5)) ** 2));
    for (let i = -Math.ceil(half); i <= Math.ceil(half); i++) {
      const off = i + 0.5;
      if (Math.abs(off) > half) continue;
      const side = off / Math.max(1, half), k = -side * 1.1 + (1 - f) * 0.6 + (BAYER4[((j + 8) & 3) * 4 + ((i + 8) & 3)] - 0.5) * 0.5;
      const c = CONE[Math.max(0, Math.min(CONE.length - 1, Math.round(1.5 + k * 1.6)))];
      put(p, p.ax + i, p.ay + j, c);
    }
  }
  // The mouth: a glowing hollow in the top.
  const my = p.ay - top + 1, mh = Math.max(1, Math.round(mouth * 0.45));
  for (let j = -mh; j <= mh; j++)
    for (let i = -Math.ceil(mouth); i <= Math.ceil(mouth); i++) {
      const d = ((i + 0.5) / mouth) ** 2 + (j / (mh + 0.5)) ** 2;
      if (d >= 1) continue;
      const c = d < 0.3 ? LAVA[4] : d < 0.65 ? LAVA[3] : LAVA[1], X = p.ax + i, Y = my + j;
      put(p, X, Y, c);
      p.glow![Y * p.w + X] = rgba(d < 0.3 ? LAVA[5] : LAVA[3]);
    }
  for (let k = 0; k < 4; k++) {
    const i = Math.round((hash01(v.seed, k, 914) - 0.5) * mouth * 3.2), j = my + mh + (hash(v.seed, k, 915) % 2);
    put(p, p.ax + i, j, SULPHUR[k % 2]);
  }
  return p;
}

/** A cluster of obsidian shards, back to front: black glass, a pale glint
 * down each lit face, now and then the lava's orange caught in it. */
export function shardPiece(c: ObsidianCluster): Piece {
  const S = Math.ceil(c.r * ART * 2.2) + 2, p = piece(S, S, Math.floor(S / 2), Math.floor(S * 0.72));
  const shards = [];
  for (let k = 0; k < c.shards; k++) {
    const u = (salt: number) => hash01(c.seed, k, salt);
    const a = (u(925) - 0.5) * c.r * ART * 1.3, b = (u(926) - 0.5) * c.r * ART * 0.5;
    shards.push({ bx: p.ax + a, by: p.ay + b, tall: (k === 0 ? 1 : 0.5 + u(927) * 0.4) * c.r * ART * 1.3, lean: (a / (c.r * ART)) * 0.45 + (u(928) - 0.5) * 0.4, w: 1.4 + u(929) * 1.6 });
  }
  shards.sort((s, t) => s.by - t.by);
  for (const [n, s] of shards.entries()) {
    for (let j = 0; j <= Math.ceil(s.tall); j++) {
      const f = j / s.tall, y = Math.round(s.by - j), cx = s.bx + s.lean * j, half = s.w * Math.min(1, (1 - f) * 1.8);
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const off = x + 0.5 - cx;
        if (Math.abs(off) > half) continue;
        const tone = off < -0.5 ? 2 : off > 0.5 ? 0 : 1;
        put(p, x, y, tone === 2 && (x + y) % 3 === 0 ? OBSIDIAN[3] : OBSIDIAN[tone]);
      }
    }
    put(p, s.bx + s.lean * s.tall * 0.7 - 0.5, s.by - s.tall * 0.7, hash(c.seed, n, 930) % 3 === 0 ? LAVA_GLINT : OBSIDIAN[3]);
  }
  return p;
}

/** Templates for the scrap, a letter a pixel: `l` lit, `m` mid, `d` shade,
 * `s` deepest shade, `h` highlight, `r` rust. */
const ANVIL = [
  "..hhhhhhhhhhh.",
  "lllllllllllllm",
  ".mmmmlllllllmd",
  "...ddmmmmmmmdd",
  ".....dmmmmd...",
  ".....dmmmmd...",
  "....dmmmmmmd..",
  "...ssddddddss.",
];
const INGOT = [".hlll.", "lllllm", "mmmmmd"];

function template(p: Piece & Img, rows: readonly string[], x0: number, y0: number, pal: Record<string, number>, rust = 0, seed = 0) {
  for (const [j, row] of rows.entries())
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === ".") continue;
      const c = rust && ch !== "h" && hash(seed, i, j, 935) % 100 < rust ? RUST[hash(seed, i, j, 936) % 2] : pal[ch];
      put(p, x0 + i, y0 + j, c);
    }
}

/** A piece of the dwarves' scrap. */
export function scrapPiece(s: Scrap): Piece {
  const iron = { s: IRON[0], d: IRON[1], m: IRON[2], l: IRON[3], h: IRON[4], r: RUST[1] };
  if (s.kind === "anvil") {
    const p = piece(14, 8, 7, 7);
    template(p, ANVIL, p.ax - 7, p.ay - 7, iron, 12, s.seed);
    return p;
  }
  if (s.kind === "ingots") {
    const m = METALS[s.seed % 2], pal = { s: m[0], d: m[0], m: m[1], l: m[2], h: m[3] };
    const p = piece(13, 6, 6, 5);
    template(p, INGOT, p.ax - 6, p.ay - 2, pal);
    template(p, INGOT, p.ax + 1, p.ay - 2, pal);
    template(p, INGOT, p.ax - 3, p.ay - 5, pal);
    return p;
  }
  if (s.kind === "cog") {
    // A cog lying tilted in the cinders, its lower edge sunk out of sight.
    const R = 5.5, p = piece(15, 10, 7, 6), teeth = 8, turn = hash01(s.seed, 937) * 6.28;
    for (let j = -7; j <= 4; j++)
      for (let i = -7; i <= 7; i++) {
        const x = i + 0.5, y = (j + 0.5) / 0.72, d = Math.sqrt(x * x + y * y), a = Math.atan2(y, x) + turn;
        const tooth = Math.cos(a * teeth) > 0.35 ? 1.3 : 0;
        if (d > R + tooth || d < 1.6) continue;
        if (j >= 3 && hash(s.seed, i, 938) % 3) continue;
        const lit = -(x + y) / (R * 1.4), ring = d > R - 0.9 && d <= R ? -0.5 : d < 2.6 ? -0.8 : 0;
        const k = Math.max(0, Math.min(4, Math.round(2.2 + lit * 1.4 + ring)));
        put(p, p.ax + i, p.ay + j, hash(s.seed, i, j, 939) % 9 === 0 ? RUST[0] : IRON[k]);
      }
    return p;
  }
  // A heap of slag, glowing bits still in it.
  const R = Math.ceil(s.r * ART) + 1, p = piece(2 * R, 2 * R, R, Math.round(R * 1.3), true);
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      const x = (i + 0.5) / (s.r * ART), y = (j + 0.5) / (s.r * ART * 0.8);
      const lump = 0.14 * Math.sin(5 * Math.atan2(y, x) + (s.seed % 7)) + (hash01(i >> 1, j >> 1, s.seed) - 0.5) * 0.18;
      const d = Math.sqrt(x * x + y * y) + lump;
      if (d >= 1) continue;
      const hgt = 1 - d, X = p.ax + i, Y = p.ay - Math.round(R * 0.3) + j;
      const lit = -(x * 0.6 + y * 0.8) * 1.2 + hgt + (BAYER4[((j + 8) & 3) * 4 + ((i + 8) & 3)] - 0.5) * 0.6;
      put(p, X, Y, SLAG[Math.max(0, Math.min(SLAG.length - 1, Math.round(1.2 + lit * 1.8)))]);
      if (hgt > 0.3 && hash(s.seed, i, j, 940) % 13 === 0) {
        put(p, X, Y, LAVA[2]);
        if (Y >= 0 && Y < p.h && X >= 0 && X < p.w) p.glow![Y * p.w + X] = rgba(LAVA[3]);
      }
    }
  return p;
}

/** A pool of lava at art pixel (px, py) in `img`, `r` cells across, light in
 * `glow`: hot in the middle under drifting plates of black crust, a dark
 * red lip, a ring of cooled basalt lit on its upper left. */
export function paintPool(img: Img, glow: Img | null, px: number, py: number, r: number, seed: number, ok: (X: number, Y: number) => boolean = () => true) {
  seed %= 100003;
  const R = r * ART + 4;
  for (let y = Math.floor(py - R); y < Math.ceil(py + R); y++)
    for (let x = Math.floor(px - R); x < Math.ceil(px + R); x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h || !ok(x, y)) continue;
      const dx = x + 0.5 - px, dy = y + 0.5 - py, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
      const e = r * ART * (1 + 0.1 * Math.sin(3 * a + (seed % 7)) + 0.06 * Math.sin(5 * a + (seed % 11)));
      if (d >= e + 3) continue;
      const q = y * img.w + x;
      if (d >= e + 1) {
        img.px[q] = rgba(d >= e + 2.4 ? RIM.dark : dx + dy < 0 ? RIM.lit : RIM.mid);
        continue;
      }
      if (d >= e) {
        img.px[q] = rgba(LAVA[0]);
        if (glow) glow.px[q] = rgba(LAVA[1]);
        continue;
      }
      // Plates of black crust drifting on it, thickest toward the shore,
      // cracked apart by glowing seams.
      const k = 1 - d / e, crust = wash(x, y, 7, seed) * 0.55 + wash(x, y, 3, seed + 1) * 0.25 + (1 - k) * 0.45 + (hash01(x, y, seed) - 0.5) * 0.05;
      if (crust > 0.62) {
        img.px[q] = rgba(crust > 0.67 ? CRUST[crust > 0.9 ? 0 : (x + y) & 1 && crust < 0.78 ? 2 : 1] : LAVA[1]);
        if (glow && crust <= 0.67) glow.px[q] = rgba(LAVA[2]);
        continue;
      }
      const heat = (0.62 - crust) / 0.62 + BAYER4[(y & 3) * 4 + (x & 3)] * 0.12;
      const tone = heat > 0.62 ? 5 : heat > 0.42 ? 4 : heat > 0.2 ? 3 : 2;
      img.px[q] = rgba(LAVA[tone]);
      if (glow) glow.px[q] = rgba(LAVA[Math.max(1, tone - 1)]);
    }
}

/** A glowing fissure through the ground at art offset (ox, oy) of `img`:
 * white-hot down its middle, red at its lips, the ground scorched beside
 * it, narrowing at each end. */
export function paintFissure(img: Img, glow: Img | null, f: Fissure, ox: number, oy: number, ok: (X: number, Y: number) => boolean = () => true) {
  const pts = f.points.map((p) => ({ x: p.x * ART + ox, y: p.y * ART + oy }));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const half = f.width * 1.6, reach = half + 2;
  const segs = pts.length - 1;
  for (let y = Math.floor(y0 - reach); y <= Math.ceil(y1 + reach); y++)
    for (let x = Math.floor(x0 - reach); x <= Math.ceil(x1 + reach); x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h || !ok(x, y)) continue;
      // The nearest point on the line, and how far along it (0..1).
      let best = Infinity, along = 0;
      for (let s = 0; s < segs; s++) {
        const a = pts[s], b = pts[s + 1], vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((x + 0.5 - a.x) * vx + (y + 0.5 - a.y) * vy) / L));
        const d = (x + 0.5 - a.x - vx * t) ** 2 + (y + 0.5 - a.y - vy * t) ** 2;
        if (d < best) { best = d; along = (s + t) / segs; }
      }
      const d = Math.sqrt(best) + (hash01(x, y, f.seed) - 0.5) * 0.7, w = half * Math.min(1, Math.sin(Math.PI * along) * 1.6 + 0.15), q = y * img.w + x;
      if (d < w * 0.38) { img.px[q] = rgba(LAVA[4]); if (glow) glow.px[q] = rgba(LAVA[5]); }
      else if (d < w * 0.72) { img.px[q] = rgba(LAVA[2]); if (glow) glow.px[q] = rgba(LAVA[3]); }
      else if (d < w) { img.px[q] = rgba(LAVA[0]); if (glow) glow.px[q] = rgba(LAVA[1]); }
      else if (d < w + 1.6 && ((x + y) & 1 || d < w + 0.8)) img.px[q] = darken(img.px[q], 0.6);
    }
}

/** The forge's floor and its glowing pixels, a stage (or a slice of rows) a
 * step: the cinders over every open cell, the fissures and pools in them,
 * then the standing pieces back to front. */
export function* emberFloorSteps(plan: EmberForgePlan): Generator<void, { floor: Uint32Array; glow: Uint32Array }, void> {
  const img: Img = { px: new Uint32Array(W * H), w: W, h: H }, glow: Img = { px: new Uint32Array(W * H), w: W, h: H };
  const ok = (x: number, y: number) => plan.open[Math.floor(y / ART) * CELLS_W + Math.floor(x / ART)] === 1;
  yield* fillCinder(img.px, W, H, 0, 0, ok, 16);
  for (const f of plan.cracks) paintFissure(img, glow, f, 0, 0, ok);
  yield;
  for (const p of plan.pools) paintPool(img, glow, p.x * ART, p.y * ART, p.r, p.seed, ok);
  yield;
  const items: { y: number; p: () => Piece; x: number; drop: number }[] = [
    ...plan.rocks.map((r) => ({ y: r.y, x: r.x, p: () => rockPiece(r), drop: r.r > 1.2 ? 2 : 1 })),
    ...plan.vents.map((v) => ({ y: v.y, x: v.x, p: () => ventPiece(v), drop: 1 })),
    ...plan.shards.map((s) => ({ y: s.y, x: s.x, p: () => shardPiece(s), drop: 1 })),
    ...plan.scrap.map((s) => ({ y: s.y, x: s.x, p: () => scrapPiece(s), drop: 1 })),
  ].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const [k, it] of items.entries()) {
    stand(img, glow, it.p(), it.x * ART, it.y * ART, ok, it.drop);
    if (k % 16 === 15) yield;
  }
  return { floor: img.px, glow: glow.px };
}

function canvasOf(pixels: Uint32Array, w: number, h: number) {
  const cv = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = cv.getContext("2d")!, img = ctx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(pixels);
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** A soft round glow, for the halos (smoothed when drawn). */
export function haloSprite(rgb: string) {
  const cv = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const ctx = cv.getContext("2d")!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `rgba(${rgb},0.5)`);
  g.addColorStop(0.45, `rgba(${rgb},0.18)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return cv;
}

/** Spark colours, hot to cool. */
const SPARK = ["#fff2a0", "#ffc04a", "#ff8a1e", "#e2481a", "#a82a10"];

export type ForgeGlowOptions = { now: number; alpha: number; still: boolean; night: number; effects: boolean };

export class EmberForgeArt {
  private map: CityMap | null = null;
  plan: EmberForgePlan | null = null;
  private floor: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private halo: HTMLCanvasElement | null = null;
  private ink = true;
  private painting: { plan: EmberForgePlan; steps: Generator<void, { floor: Uint32Array; glow: Uint32Array }, void> } | null = null;

  /** Plans `map`'s forge ground (and repaints it) when the map changes, or
   * when scenery outlines are turned on or off. */
  sync(map: CityMap) {
    const ink = sceneryOutlinesOn();
    if (map === this.map && ink === this.ink) return;
    this.map = map;
    this.ink = ink;
    this.plan = emberForgePlan(map);
    this.floor = this.glow = null;
    this.painting = null;
  }

  /** Plans `map`'s forge and paints, for about `ms`, its floor ahead of a
   * battle crossing into it; whether any is left. */
  prepare(map: CityMap, ms: number) {
    if (typeof document === "undefined") return false;
    this.sync(map);
    if (this.floor) return false;
    const end = performance.now() + ms, plan = this.plan!;
    if (this.painting?.plan !== plan) this.painting = { plan, steps: emberFloorSteps(plan) };
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
      const steps = this.painting?.plan === this.plan ? this.painting.steps : emberFloorSteps(this.plan);
      for (;;) { const r = steps.next(); if (r.done) { this.set(r.value); break; } }
    }
    return !!this.floor;
  }

  /** The forge's floor over the open ground. */
  drawFloor(c: CanvasRenderingContext2D, px: number, alpha: number) {
    if (!this.plan || alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= alpha;
    c.drawImage(this.floor!, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
  }

  /** What glows, over the battle's darkness: the lava's own light breathing
   * like a forge, soft halos, bubbles on the pools, the vents' sparks and
   * their smoke. */
  drawGlow(c: CanvasRenderingContext2D, px: number, o: ForgeGlowOptions) {
    const plan = this.plan;
    if (!plan || o.alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    this.halo ??= haloSprite(HALO);
    const t = o.still ? 0 : o.now / 1000, base = c.globalAlpha * o.alpha, night = Math.max(0, Math.min(1, o.night));
    const breathe = (phase: number, rate = 0.9) => (o.still ? 1 : 0.8 + 0.2 * Math.sin(t * rate + phase * 6.28) + 0.06 * Math.sin(t * 3.1 + phase * 17));
    c.save();
    c.globalCompositeOperation = "lighter";
    c.imageSmoothingEnabled = false;
    c.globalAlpha = Math.min(1, base * (0.22 + 0.62 * night) * breathe(0.13, 0.6));
    c.drawImage(this.glow!, 0, 0, CELLS_W * px, CELLS_H * px);
    c.imageSmoothingEnabled = true;
    const halo = (x: number, y: number, r: number, k: number, phase: number) => {
      c.globalAlpha = Math.min(1, base * k * breathe(phase) * (0.18 + 0.82 * night));
      const s = r * px * 2;
      c.drawImage(this.halo!, x * px - s / 2, y * px - s / 2, s, s);
    };
    for (const p of plan.pools) halo(p.x, p.y, p.r * 2.8, 0.8, hash01(p.seed, 985));
    for (const v of plan.vents) halo(v.x, v.y - v.r * 0.6, v.r * 2.4, 0.6, hash01(v.seed, 986));
    for (const f of plan.cracks) {
      const n = f.points.length, a = f.points[Math.floor(n / 3)], b = f.points[Math.floor((2 * n) / 3)];
      halo(a.x, a.y, 1.6 + f.width, 0.45, hash01(f.seed, 987));
      halo(b.x, b.y, 1.6 + f.width, 0.45, hash01(f.seed, 988));
    }
    for (const r of plan.rocks) if (r.seam) halo(r.x, r.y, r.r * 1.6, 0.3, hash01(r.seed, 989));
    c.imageSmoothingEnabled = false;
    const dot = artPen(c, px);
    if (o.effects) {
      // Bubbles swelling and bursting on the pools.
      for (const p of plan.pools)
        for (let k = 0; k < EMBER_FORGE.bubbles; k++) {
          const b = bubbleAt(p, k, t);
          if (o.still ? k % 2 : b.swell <= 0) continue;
          const x = Math.floor(b.x * ART), y = Math.floor(b.y * ART), s = o.still ? 0.5 : b.swell;
          c.globalAlpha = Math.min(1, base * (1 - s * 0.6));
          c.fillStyle = LAVA_HEX[5];
          dot(x, y);
          if (s > 0.5) { c.fillStyle = LAVA_HEX[4]; dot(x - 1, y); dot(x + 1, y); dot(x, y - 1); }
        }
      if (!o.still) {
        // Smoke from the vents, drawn plainly so it greys what it crosses.
        c.globalCompositeOperation = "source-over";
        for (const v of plan.vents)
          for (let k = 0; k < EMBER_FORGE.smoke; k++) {
            const s = smokeAt(v, k, t);
            if (s.show <= 0.03) continue;
            c.globalAlpha = Math.min(1, base * s.show * 0.32);
            c.fillStyle = "#4a4240";
            dot(Math.floor(s.x * ART), Math.floor(s.y * ART), s.size, s.size);
          }
        // Sparks spat from the vents and off the pools.
        c.globalCompositeOperation = "lighter";
        for (const v of plan.vents)
          for (let k = 0; k < EMBER_FORGE.sparks; k++) {
            const s = sparkAt(v, k, t);
            if (s.show <= 0.04) continue;
            c.globalAlpha = Math.min(1, base * s.show);
            c.fillStyle = SPARK[Math.min(SPARK.length - 1, Math.floor(s.age * SPARK.length))];
            dot(Math.floor(s.x * ART), Math.floor(s.y * ART));
          }
        for (const p of plan.pools)
          for (let k = 0; k < 4; k++) {
            const s = sparkAt({ x: p.x, y: p.y + 0.3, r: p.r * 1.4, seed: p.seed }, k, t * 0.7);
            if (s.show <= 0.04) continue;
            c.globalAlpha = Math.min(1, base * s.show * 0.8);
            c.fillStyle = SPARK[Math.min(SPARK.length - 1, 1 + Math.floor(s.age * (SPARK.length - 1)))];
            dot(Math.floor(s.x * ART), Math.floor(s.y * ART));
          }
      }
    }
    c.restore();
  }
}
const LAVA_HEX = LAVA.map((v) => "#" + v.toString(16).padStart(6, "0"));
