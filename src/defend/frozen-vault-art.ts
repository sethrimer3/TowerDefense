/** Draws the Frozen Vault (`frozen-vault.ts`) at `ART` pixels a cell, over
 * the snow's dunes (`atmosphere-art.ts` in the snow look): flat sheets of
 * frozen meltwater with a rim of snow, and standing out of the drifts spires
 * of blue ice, broken fluted pillars and their fallen drums capped with snow
 * and hung with icicles, slate rune stones and relics sealed in blocks of
 * ice, each with a soft blue shadow down and to the right (the floor is
 * clear elsewhere, so the dunes show through), under the units and the
 * battle's darkness. Then over the darkness (`drawGlow`) what shines: the
 * runes' carvings and the ice's cold light, breathing slowly, with soft
 * halos by night, and by day and night now and then a glint of light
 * catching the ice. The pieces are drawn bare: their outline is added round
 * them (`standOn`) while scenery outlines are on. The wilds (`wilds.ts`)
 * stand the same pieces past the board. Presentation only; still under
 * Reduce Motion. */
import { ART } from "./art-scale.ts";
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import {
  FROZEN_VAULT, frozenVaultPlan, glintAt,
  type FrozenVaultPlan, type IceSpire, type Relic, type RuneStone, type VaultPillar,
} from "./frozen-vault.ts";
import { haloSprite, piece, rgba, wash, type Img, type Piece } from "./ember-forge-art.ts";
import { artPen } from "./pixel-fx.ts";
import { sceneryOutlinesOn } from "./scenery-looks.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;

/** Ice, deepest blue to its white ridge. */
export const ICE = [0x203c6a, 0x3c68a2, 0x6a9ed2, 0xa4d2f2, 0xd8f2ff, 0xffffff];
/** The ice's own cold light. */
const ICE_GLOW = [0x2a6aa8, 0x58b4f0];
/** Snow lying on a piece, shade to sunlit. */
const SNOW = [0x8ca6d2, 0xc4d6ee, 0xeaf2fc, 0xffffff];
/** The vault's pale stone, shade to lit. */
const STONE = [0x2e3850, 0x435069, 0x5c6b86, 0x7d8ca6, 0xa2b0c6, 0xc6d0de];
/** Slate for the rune stones, shade to lit. */
const SLATE = [0x141a28, 0x1f2738, 0x2c364c, 0x3d4962, 0x56637e];
/** The runes' carving, and its light. */
const RUNE = [0x4cb8f4, 0xa8ecff];
const RUNE_GLOW = [0x3a9ee8, 0x9ee6ff];
/** Gold and steel seen through the ice. */
const GOLD = [0x6e6440, 0x9c8e58, 0xc8b878, 0xece0a8];
const STEEL = [0x5a6a86, 0x8c9cb8, 0xc0cee4];
/** The outline round a piece while scenery outlines are on; its shadow on the snow. */
const INK = 0x101828;
const SHADOW = rgba(0x1a2c5c, 84);
/** The halos' colour. */
const HALO = "120,200,255";

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];
const pick = (ramp: readonly number[], v: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(v)))];

/** Stands `p` with its foot at art pixel (x, y) of `img` (and its light in
 * `glow`): its shadow down and right (a translucent blue, so it falls on
 * the snow under the layer as on anything painted in it, only where `shade`
 * allows), then its outline while scenery outlines are on, then the piece;
 * only where `ok` allows. */
export function standOn(img: Img, glow: Img | null, p: Piece, x: number, y: number, ok: (X: number, Y: number) => boolean = () => true, drop = 2, shade = ok) {
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
      if (!img.px[q] && shade(X, Y) && (at(i - drop, j - drop) || at(i - 1, j - drop))) img.px[q] = SHADOW;
    }
}

/** Snow heaped round a piece's foot: a low mound `rx` pixels either side of
 * (cx, cy) in the piece, lit from the upper left, over what is there. */
function footDrift(p: Piece & Img, cx: number, cy: number, rx: number, seed: number) {
  const ry = Math.max(1.5, rx * 0.4);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + 1); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 0 || y < 0 || x >= p.w || y >= p.h) continue;
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry + (hash01(x, seed, 1201) - 0.5) * 0.5;
      if (dx * dx + dy * dy > 1 || y > cy) continue;
      const lit = -dx * 0.5 - dy * 0.8 + (dither(x, y) - 0.5) * 0.5;
      p.px[y * p.w + x] = rgba(pick(SNOW, 1.6 + lit * 1.6));
      if (p.glow) p.glow[y * p.w + x] = 0;
    }
}

/** A cluster of ice spires: tall shards leaning a little, each lit on its
 * left face, dim on its right, a white ridge up its middle and dark at its
 * edges, the cold light glowing in their cores; snow heaped round them. */
export function spirePiece(s: IceSpire): Piece {
  const R = s.r * ART, top = Math.ceil(R * 3.2) + 2, w = Math.ceil(R * 2.6) + 6;
  const p = piece(w, top + 4, Math.floor(w / 2), top, true);
  const shards = Array.from({ length: s.shards }, (_, k) => {
    const u = (salt: number) => hash01(s.seed, k, salt);
    return {
      bx: (u(1211) - 0.5) * R * 1.3, by: (u(1212) - 0.5) * R * 0.5,
      h: R * (k === 0 ? 2.6 + u(1213) * 0.5 : 1.2 + u(1213) * 1.3), hw: 1.4 + R * (0.16 + u(1214) * 0.12), lean: (u(1215) - 0.5) * 0.45,
    };
  }).sort((a, b) => a.by - b.by);
  for (const sh of shards) {
    const footY = p.ay + sh.by;
    for (let j = 0; j <= sh.h; j++) {
      const f = j / sh.h, half = sh.hw * Math.min(1, (1 - f) * 2.4), mid = p.ax + sh.bx + sh.lean * j, y = Math.round(footY - j);
      if (half < 0.3 || y < 0 || y >= p.h) continue;
      for (let x = Math.floor(mid - half); x <= Math.ceil(mid + half); x++) {
        const off = x + 0.5 - mid;
        if (Math.abs(off) > half || x < 0 || x >= p.w) continue;
        const q = y * p.w + x, edge = Math.abs(off) > half - 1;
        let c: number;
        if (Math.abs(off) < 0.6 && f > 0.08) c = ICE[5];
        else if (edge) c = off < 0 ? ICE[2] : ICE[0];
        else if (off < 0) c = dither(x, y) < 0.3 + f * 0.4 ? ICE[4] : ICE[3];
        else c = dither(x, y) < 0.25 ? ICE[2] : ICE[1];
        // A facet line across it, now and then.
        if (!edge && Math.abs(((j + off * 1.6) % 7) - 3.5) < 0.4 && f < 0.8 && hash(s.seed, Math.floor((j + off * 1.6) / 7), 1216) % 2) c = off < 0 ? ICE[5] : ICE[2];
        p.px[q] = rgba(c);
        p.glow![q] = !edge && Math.abs(off) < half * 0.6 ? rgba(ICE_GLOW[f > 0.4 ? 1 : 0]) : 0;
      }
    }
  }
  footDrift(p, p.ax, p.ay + 1, R * 1.1 + 2, s.seed);
  return p;
}

/** A pillar of the vault: standing, a fluted column broken off jaggedly,
 * on a plinth, capped with snow and hung with icicles; fallen, one of its
 * drums lying in the snow, its fluted end toward you, snow along its top. */
export function pillarPiece(v: VaultPillar): Piece {
  return v.fallen ? drumPiece(v) : columnPiece(v);
}

function columnPiece(v: VaultPillar): Piece {
  const R = v.r * ART, cw = Math.max(7, Math.round(R * 1.5)) | 1, tall = Math.round(R * (2.4 + hash01(v.seed, 1221) * 1.4));
  const w = cw + 6, p = piece(w, tall + 8, Math.floor(w / 2), tall + 5);
  const left = p.ax - (cw >> 1), foot = p.ay;
  const put = (x: number, y: number, c: number) => { if (x >= 0 && y >= 0 && x < p.w && y < p.h) p.px[y * p.w + x] = rgba(c); };
  // The broken top: each column of the shaft ends a little higher or lower.
  const tops: number[] = [];
  for (let i = 0; i < cw; i++) tops.push(foot - tall + Math.floor(hash01(v.seed, i, 1222) * 3) + Math.round(Math.abs(i - cw * hash01(v.seed, 1223)) * 0.5));
  // The plinth: two steps of dressed stone.
  for (let j = 0; j < 4; j++) {
    const ext = j < 2 ? 2 : 1, y = foot - j;
    for (let x = left - ext; x < left + cw + ext; x++) put(x, y, j === 1 || j === 3 ? STONE[x < left + cw / 2 ? 4 : 3] : STONE[x < left + cw / 3 ? 3 : 2]);
  }
  // The shaft: a cylinder lit from the left, every third column a groove.
  for (let i = 0; i < cw; i++) {
    const u = (i + 0.5) / cw, groove = i % 3 === 1 && i > 0 && i < cw - 1;
    const base = u < 0.2 ? 4 : u < 0.45 ? 3 : u < 0.75 ? 2 : 1;
    for (let y = tops[i]; y <= foot - 4; y++) {
      let c = STONE[groove ? Math.max(0, base - 1) : base];
      if (hash(i, y, v.seed, 1224) % 23 === 0) c = SNOW[1];
      put(left + i, y, c);
    }
    // The broken face, lighter, a pixel below the snow.
    put(left + i, tops[i], STONE[5]);
  }
  // Snow on the break, overhanging a pixel each side, icicles under its lip.
  for (let i = -1; i <= cw; i++) {
    const t = tops[Math.max(0, Math.min(cw - 1, i))], depth = i < 0 || i >= cw ? 1 : 2 + (hash(v.seed, i, 1225) % 2);
    for (let k = 0; k < depth; k++) put(left + i, t - 1 - k + (i < 0 || i >= cw ? 2 : 0), SNOW[k === depth - 1 ? (i < cw / 2 ? 3 : 2) : 1]);
    if ((i === -1 || i === cw || hash(v.seed, i, 1226) % 4 === 0) && i !== 0) {
      const n = 1 + (hash(v.seed, i, 1227) % 3), y0 = i < 0 || i >= cw ? t + 2 : t + 1;
      for (let k = 0; k < n; k++) put(left + i, y0 + k, k === n - 1 ? ICE[3] : ICE[4]);
    }
  }
  return p;
}

function drumPiece(v: VaultPillar): Piece {
  const R = v.r * ART, len = Math.round(R * 2.2), th = Math.max(6, Math.round(R * 1.1));
  const w = len + th + 4, p = piece(w, th + 5, Math.floor(w / 2), th + 1);
  const left = p.ax - Math.floor((len + th / 2) / 2), y0 = p.ay - th;
  const put = (x: number, y: number, c: number) => { if (x >= 0 && y >= 0 && x < p.w && y < p.h) p.px[y * p.w + x] = rgba(c); };
  // The body: lit along its top, darker underneath, flutes along it.
  for (let j = 0; j < th; j++) {
    const f = (j + 0.5) / th, base = f < 0.3 ? 4 : f < 0.55 ? 3 : f < 0.8 ? 2 : 1, groove = j % 3 === 1;
    for (let x = left; x < left + len; x++) put(x, y0 + j, STONE[groove ? Math.max(0, base - 1) : base]);
  }
  // Snow along its top, ragged.
  for (let x = left; x < left + len; x++) {
    const n = 1 + (hash(v.seed, x, 1231) % 3 === 0 ? 1 : 0);
    for (let k = 0; k < n; k++) put(x, y0 + k - 1, SNOW[k === 0 ? 3 : 2]);
  }
  // Its end toward you: a fluted round face, scalloped at the rim.
  const ex = left + len, rx = th / 2 * 0.55, ry = th / 2, cy = y0 + th / 2;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(ex - rx); x <= Math.ceil(ex + rx); x++) {
      const dx = (x + 0.5 - ex) / rx, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
      const scallop = 1 - 0.08 * Math.max(0, Math.cos(Math.atan2(dy, dx) * 8));
      if (d > scallop) continue;
      put(x, y, d > scallop - 0.25 ? STONE[2] : d < 0.3 ? STONE[3] : STONE[(x + y) & 1 ? 4 : 5]);
    }
  footDrift(p, p.ax, p.ay, len * 0.45, v.seed);
  return p;
}

/** Rune patterns, three by four: bit k is pixel (k % 3, k / 3 | 0). */
const GLYPHS = [0b010_111_010_010, 0b101_010_101_000, 0b111_100_111_001, 0b010_101_010_101, 0b110_011_110_000, 0b001_011_101_111, 0b100_110_100_111, 0b010_010_111_101];

/** A slate rune stone: a tall slab rounded at its top, lit on its left, its
 * carvings glowing ice blue down its face, snow on its crown and round its
 * foot. */
export function runePiece(r: RuneStone): Piece {
  const R = r.r * ART, sw = Math.max(6, Math.round(R * 1.5)), tall = Math.round(R * 3.1);
  const w = sw + 6, p = piece(w, tall + 4, Math.floor(w / 2), tall + 1, true);
  const left = p.ax - (sw >> 1), foot = p.ay, half = sw / 2, mid = left + half;
  const inside = (x: number, y: number) => {
    if (x < left || x >= left + sw || y > foot || y < foot - tall) return false;
    const dy = y - (foot - tall + half);
    return dy >= 0 || (x + 0.5 - mid) ** 2 + dy * dy <= half * half;
  };
  for (let y = foot - tall; y <= foot; y++)
    for (let x = left; x < left + sw; x++) {
      if (!inside(x, y)) continue;
      const u = (x + 0.5 - left) / sw, n = wash(x, y, 4, r.seed) - 0.5;
      p.px[y * p.w + x] = rgba(pick(SLATE, (u < 0.3 ? 3.4 : u < 0.7 ? 2.4 : 1.4) + n * 1.2 + (dither(x, y) - 0.5) * 0.4));
    }
  // The carvings, a column of runes down the face.
  const gx = Math.round(mid - 1.5);
  for (let gy = foot - tall + Math.round(half) + 2, k = 0; gy + 4 < foot - 1; gy += 5, k++) {
    const g = GLYPHS[hash(r.seed, k, 1241) % GLYPHS.length];
    for (let b = 0; b < 12; b++) {
      if (!(g >> (11 - b) & 1)) continue;
      const x = gx + (b % 3), y = gy + Math.floor(b / 3);
      if (!inside(x, y)) continue;
      const q = y * p.w + x;
      p.px[q] = rgba(RUNE[(x + y) & 1 ? 1 : 0]);
      p.glow![q] = rgba(RUNE_GLOW[(x + y) & 1 ? 1 : 0]);
    }
  }
  // Snow on its crown.
  for (let x = left; x < left + sw; x++) {
    let y = foot - tall;
    while (y < foot && !inside(x, y)) y++;
    const n = x === left || x === left + sw - 1 ? 1 : 2;
    for (let k = 0; k < n; k++) { const q = (y + k) * p.w + x; p.px[q] = rgba(SNOW[k === 0 ? (x < mid ? 3 : 2) : 1]); p.glow![q] = 0; }
  }
  footDrift(p, mid, foot + 1, half + 2.5, r.seed);
  return p;
}

/** A relic sealed in a block of ice: the block's pale top and clear front,
 * a streak of light across it, and inside it, dimmed blue by the ice, a
 * crown, an urn or a sword; snow drifted against its foot. */
export function relicPiece(r: Relic): Piece {
  const S = Math.max(9, Math.round(r.r * ART * 1.6)), lid = Math.max(3, Math.round(S * 0.35)), face = Math.round(S * 0.85);
  const w = S + 4, p = piece(w, lid + face + 3, Math.floor(w / 2), lid + face, true);
  const left = p.ax - (S >> 1), top = p.ay - lid - face, fy = top + lid;
  const put = (x: number, y: number, c: number, g = 0) => { if (x >= 0 && y >= 0 && x < p.w && y < p.h) { p.px[y * p.w + x] = rgba(c); p.glow![y * p.w + x] = g; } };
  for (let y = top; y < fy; y++) for (let x = left; x < left + S; x++) put(x, y, y === top || x === left ? ICE[5] : x === left + S - 1 ? ICE[3] : dither(x, y) < 0.5 ? ICE[4] : ICE[5]);
  for (let y = fy; y < fy + face; y++)
    for (let x = left; x < left + S; x++) {
      const f = (y - fy) / face, edge = x === left || x === left + S - 1 || y === fy + face - 1;
      put(x, y, edge ? (x === left ? ICE[3] : ICE[1]) : dither(x, y) < 0.35 + f * 0.3 ? ICE[2] : ICE[3], edge ? 0 : rgba(ICE_GLOW[0]));
    }
  // The relic, seen through the ice.
  const cx = left + S / 2, by = fy + face - 2, inner = (x: number, y: number, c: number) => {
    if (x > left && x < left + S - 1 && y > fy && y < fy + face - 1) put(x, y, c, 0);
  };
  if (r.kind === "crown") {
    const half = Math.max(2, Math.round(S * 0.28)), base = by - 1;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      inner(x, base, GOLD[1]); inner(x, base - 1, GOLD[2]);
      const k = x - Math.round(cx - half);
      if (k % 2 === 0) { inner(x, base - 2, GOLD[2]); inner(x, base - 3, GOLD[3]); }
    }
    inner(Math.round(cx), base - 1, 0x58c0e8);
  } else if (r.kind === "urn") {
    const ry = Math.max(2, Math.round(face * 0.3)), rx = Math.max(2, Math.round(S * 0.22)), cy = by - ry;
    for (let y = cy - ry; y <= by; y++) for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) inner(x, y, dx < -0.2 ? GOLD[3] : dx < 0.4 ? GOLD[2] : GOLD[1]);
    }
    for (let k = 1; k <= 2; k++) { inner(Math.round(cx) - 1, cy - ry - k, GOLD[2]); inner(Math.round(cx), cy - ry - k, GOLD[1]); }
    inner(Math.round(cx) - 2, cy - ry - 3, GOLD[2]); inner(Math.round(cx) + 1, cy - ry - 3, GOLD[1]);
  } else {
    const x = Math.round(cx) - 1, tip = fy + 2;
    for (let y = tip; y <= by - 3; y++) { inner(x, y, STEEL[2]); inner(x + 1, y, STEEL[1]); }
    for (let k = -2; k <= 3; k++) inner(x + k, by - 2, GOLD[2]);
    inner(x, by - 1, GOLD[1]); inner(x + 1, by - 1, GOLD[0]); inner(x, by, GOLD[3]);
  }
  // A streak of light across the front.
  for (let k = 0; k < face; k++) { const x = left + 2 + k, y = fy + face - 2 - k; if (x < left + S - 1 && y > fy) put(x, y, ICE[5], rgba(ICE_GLOW[1])); }
  footDrift(p, p.ax, p.ay + 1, S * 0.6 + 1, r.seed);
  return p;
}

/** A sheet of frozen meltwater, `r` cells across its middle, at art pixel
 * (x, y): blue ice clouded pale in patches, cracked, a darker band inside
 * its rim, the snow lying ragged round its edge; only where `ok` allows. */
export function paintIceSheet(img: Img, x: number, y: number, r: number, seed: number, ok: (X: number, Y: number) => boolean = () => true) {
  const rx = r * ART, ry = r * ART * 0.68;
  const cracks = Array.from({ length: 3 + (seed % 3) }, (_, k) => ({ a: hash01(seed, k, 1251) * Math.PI, o: (hash01(seed, k, 1252) - 0.5) * 0.8 }));
  for (let Y = Math.floor(y - ry - 2); Y <= Math.ceil(y + ry + 2); Y++)
    for (let X = Math.floor(x - rx - 2); X <= Math.ceil(x + rx + 2); X++) {
      if (X < 0 || Y < 0 || X >= img.w || Y >= img.h || !ok(X, Y)) continue;
      const dx = (X + 0.5 - x) / rx, dy = (Y + 0.5 - y) / ry, d = Math.sqrt(dx * dx + dy * dy) + (wash(X, Y, 5, seed) - 0.5) * 0.22;
      if (d > 1.12) continue;
      const q = Y * img.w + X;
      if (d > 0.96) { if ((X + Y) & 1 || d < 1.04) img.px[q] = rgba(SNOW[dx + dy < 0 ? 2 : 3]); continue; }
      if (d > 0.86) { img.px[q] = rgba(ICE[d > 0.92 && dx + dy > 0.2 ? 4 : 1]); continue; }
      let v = 2.3 + (wash(X, Y, 7, seed + 1) - 0.5) * 2.4 + (dither(X, Y) - 0.5) * 0.6 - dy * 0.4;
      for (const c of cracks) {
        const along = dx * Math.cos(c.a) + dy * Math.sin(c.a), across = -dx * Math.sin(c.a) + dy * Math.cos(c.a) - c.o + Math.sin(along * 7 + seed) * 0.05;
        if (Math.abs(across) < 0.045) v = 0.6;
        else if (Math.abs(across - 0.06) < 0.03) v = Math.max(v, 4.2);
      }
      img.px[q] = rgba(pick(ICE, v));
    }
}

/** What stands on the vault's ground, back to front: a piece maker, its
 * foot and its shadow's reach. */
export function vaultItems(plan: Pick<FrozenVaultPlan, "spires" | "pillars" | "runes" | "relics">) {
  return [
    ...plan.spires.map((s) => ({ y: s.y, x: s.x, p: () => spirePiece(s), drop: s.r > 1 ? 3 : 2 })),
    ...plan.pillars.map((v) => ({ y: v.y, x: v.x, p: () => pillarPiece(v), drop: 2 })),
    ...plan.runes.map((r) => ({ y: r.y, x: r.x, p: () => runePiece(r), drop: 2 })),
    ...plan.relics.map((r) => ({ y: r.y, x: r.x, p: () => relicPiece(r), drop: 2 })),
  ].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The vault's floor layer and its glowing pixels, a stage a step: the ice
 * sheets, then the standing pieces back to front, clear elsewhere. */
export function* vaultFloorSteps(plan: FrozenVaultPlan): Generator<void, { floor: Uint32Array; glow: Uint32Array }, void> {
  const img: Img = { px: new Uint32Array(W * H), w: W, h: H }, glow: Img = { px: new Uint32Array(W * H), w: W, h: H };
  const ok = (x: number, y: number) => plan.open[Math.floor(y / ART) * CELLS_W + Math.floor(x / ART)] === 1;
  for (const s of plan.sheets) paintIceSheet(img, s.x * ART, s.y * ART, s.r, s.seed, ok);
  yield;
  // The standing pieces may rise over the city's cells behind them.
  for (const [k, it] of vaultItems(plan).entries()) {
    standOn(img, glow, it.p(), it.x * ART, it.y * ART, () => true, it.drop, ok);
    if (k % 8 === 7) yield;
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

export type VaultGlowOptions = { now: number; alpha: number; still: boolean; night: number; effects: boolean };

export class FrozenVaultArt {
  private map: CityMap | null = null;
  plan: FrozenVaultPlan | null = null;
  private floor: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private halo: HTMLCanvasElement | null = null;
  private ink = true;
  private painting: { plan: FrozenVaultPlan; steps: Generator<void, { floor: Uint32Array; glow: Uint32Array }, void> } | null = null;

  /** Plans `map`'s vault (and repaints it) when the map changes, or when
   * scenery outlines are turned on or off. */
  sync(map: CityMap) {
    const ink = sceneryOutlinesOn();
    if (map === this.map && ink === this.ink) return;
    this.map = map;
    this.ink = ink;
    this.plan = frozenVaultPlan(map);
    this.floor = this.glow = null;
    this.painting = null;
  }

  /** Plans `map`'s vault and paints, for about `ms`, its layer ahead of a
   * battle crossing into it; whether any is left. */
  prepare(map: CityMap, ms: number) {
    if (typeof document === "undefined") return false;
    this.sync(map);
    if (this.floor) return false;
    const end = performance.now() + ms, plan = this.plan!;
    if (this.painting?.plan !== plan) this.painting = { plan, steps: vaultFloorSteps(plan) };
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
      const steps = this.painting?.plan === this.plan ? this.painting.steps : vaultFloorSteps(this.plan);
      for (;;) { const r = steps.next(); if (r.done) { this.set(r.value); break; } }
    }
    return !!this.floor;
  }

  /** The vault's pieces over the snow. */
  drawFloor(c: CanvasRenderingContext2D, px: number, alpha: number) {
    if (!this.plan || alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= alpha;
    c.drawImage(this.floor!, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
  }

  /** What shines, over the battle's darkness: the runes and the ice's cold
   * light breathing slowly, soft halos by night, and the glints. */
  drawGlow(c: CanvasRenderingContext2D, px: number, o: VaultGlowOptions) {
    const plan = this.plan;
    if (!plan || o.alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    this.halo ??= haloSprite(HALO);
    const t = o.still ? 0 : o.now / 1000, base = c.globalAlpha * o.alpha, night = Math.max(0, Math.min(1, o.night));
    const breathe = (phase: number) => (o.still ? 1 : 0.78 + 0.22 * Math.sin(t * 0.7 + phase * 6.28));
    c.save();
    c.globalCompositeOperation = "lighter";
    c.imageSmoothingEnabled = false;
    c.globalAlpha = Math.min(1, base * (0.12 + 0.6 * night) * breathe(0.3));
    c.drawImage(this.glow!, 0, 0, CELLS_W * px, CELLS_H * px);
    if (night > 0.02) {
      c.imageSmoothingEnabled = true;
      const halo = (x: number, y: number, r: number, k: number, phase: number) => {
        c.globalAlpha = Math.min(1, base * k * breathe(phase) * night);
        const s = r * px * 2;
        c.drawImage(this.halo!, x * px - s / 2, y * px - s / 2, s, s);
      };
      for (const r of plan.runes) halo(r.x, r.y - r.r * 1.6, 1.8, 0.7, hash01(r.seed, 1261));
      for (const s of plan.spires) halo(s.x, s.y - s.r * 1.2, s.r * 1.8, 0.35, hash01(s.seed, 1262));
      for (const r of plan.relics) halo(r.x, r.y - r.r * 0.6, 1.4, 0.3, hash01(r.seed, 1263));
      c.imageSmoothingEnabled = false;
    }
    if (o.effects && !o.still) {
      const dot = artPen(c, px);
      for (let k = 0; k < FROZEN_VAULT.glints; k++) {
        const g = glintAt(plan, k, t);
        if (!g || g.show <= 0.05) continue;
        const x = Math.floor(g.x * ART), y = Math.floor(g.y * ART);
        c.globalAlpha = Math.min(1, base * g.show);
        c.fillStyle = "#ffffff";
        dot(x, y);
        if (g.show > 0.5) { c.fillStyle = "#bfe8ff"; dot(x - 1, y); dot(x + 1, y); dot(x, y - 1); dot(x, y + 1); }
      }
    }
    c.restore();
  }
}
