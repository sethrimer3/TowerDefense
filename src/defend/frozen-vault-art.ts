/** Draws the Highlands (`frozen-vault.ts`) at `ART` pixels a cell, over
 * the snow's dunes (`atmosphere-art.ts` in the snow look), seen from above
 * like the rest of the board's art: flat sheets of frozen meltwater with a
 * rim of snow, and out of the drifts clusters of ice crystals, the broken
 * tops of fluted pillars on their plinths and their fallen drums, slate rune
 * slabs and relics sealed in blocks of ice, each with a soft blue shadow
 * down and to the right (the floor is
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

/** A square piece `2R + 1` pixels across centred on its middle, seen from
 * above. */
const square = (R: number, glows = false) => piece(2 * R + 1, 2 * R + 1, R, R, glows);
/** Light from the upper left on a face whose outward slope points (nx, ny):
 * 1 facing the light, -1 away. */
const facing = (nx: number, ny: number) => {
  const l = Math.hypot(nx, ny) || 1;
  return (-nx * 0.6 - ny * 0.8) / l;
};

/** Snow lying in a soft patch over part of a piece (seen from above): a
 * lumpy disc round (cx, cy), `r` pixels, lit from the upper left, only on
 * pixels the piece already covers. */
function snowPatch(p: Piece & Img, cx: number, cy: number, r: number, seed: number) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (x < 0 || y < 0 || x >= p.w || y >= p.h || !p.px[y * p.w + x]) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / r + (wash(x, y, 3, seed) - 0.5) * 0.5;
      if (d > 1) continue;
      const lit = (-dx * 0.6 - dy * 0.8) / r * 0.9 + (dither(x, y) - 0.5) * 0.4;
      p.px[y * p.w + x] = rgba(pick(SNOW, d > 0.8 ? 1 + lit : 2.2 + lit));
      if (p.glow) p.glow[y * p.w + x] = 0;
    }
}

/** A cluster of ice crystals seen from above: long six-sided shards
 * splayed out from a common root, each split down its ridge into a face
 * lit from the upper left and a face in shade, a white ridge line, dark
 * edges, and the tallest one in the middle seen end on, a hexagon of
 * facets; their cold light glows in their cores. */
export function spirePiece(s: IceSpire): Piece {
  const R = Math.ceil(s.r * ART * 1.25) + 2, p = square(R, true), c = R + 0.5;
  const shards = Array.from({ length: s.shards + 1 }, (_, k) => {
    const u = (salt: number) => hash01(s.seed, k, salt);
    const a = (k / (s.shards + 1)) * Math.PI * 2 + u(1211) * 1.2;
    return { a, len: (R - 1) * (0.55 + u(1212) * 0.45), w: 1.6 + s.r * ART * (0.12 + u(1213) * 0.08) };
  });
  // Back to front: the shards reaching up the picture first.
  shards.sort((a, b) => Math.sin(a.a) - Math.sin(b.a));
  const paint = (x: number, y: number, col: number, g: number) => { const q = y * p.w + x; p.px[q] = rgba(col); p.glow![q] = g ? rgba(g) : 0; };
  for (const sh of shards) {
    const ca = Math.cos(sh.a), sa = Math.sin(sh.a);
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, along = dx * ca + dy * sa, across = -dx * sa + dy * ca;
        if (along < 0 || along > sh.len) continue;
        const f = along / sh.len, half = sh.w * Math.min(1, (1 - f) * 2.6);
        if (Math.abs(across) > half) continue;
        const edge = Math.abs(across) > half - 0.9;
        // The face on the light's side of the ridge is lit.
        const side = facing(-sa * Math.sign(across || 1), ca * Math.sign(across || 1));
        let col: number;
        if (Math.abs(across) < 0.55) col = ICE[5];
        else if (edge) col = side > 0 ? ICE[2] : ICE[0];
        else col = side > 0 ? (dither(x, y) < 0.55 ? ICE[4] : ICE[3]) : (dither(x, y) < 0.3 ? ICE[2] : ICE[1]);
        paint(x, y, col, !edge && f < 0.7 ? ICE_GLOW[f < 0.35 ? 1 : 0] : 0);
      }
  }
  // The middle crystal, end on: a hexagon of six facets round its point.
  const hr = Math.max(2.2, s.r * ART * 0.42), turn = hash01(s.seed, 1214) * 1.05;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx) - turn, sector = Math.floor((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 3)) % 6;
      const mid = turn + (sector + 0.5) * (Math.PI / 3), apothem = hr * Math.cos(Math.PI / 6);
      if (d * Math.cos(Math.atan2(dy, dx) - mid) > apothem) continue;
      const lit = facing(Math.cos(mid), Math.sin(mid)), rim = d * Math.cos(Math.atan2(dy, dx) - mid) > apothem - 1;
      paint(x, y, rim ? (lit > 0 ? ICE[3] : ICE[0]) : d < 1 ? ICE[5] : pick(ICE, 2.6 + lit * 2), ICE_GLOW[1]);
    }
  return p;
}

/** A pillar of the vault seen from above: standing, the broken top of a
 * fluted column (its scalloped rim, the break's rough face, snow lying on
 * it) on a square plinth whose lit edges catch the light; fallen, one of its
 * drums lying in the snow, rounded across its width, fluted along it, snow
 * along its top. */
export function pillarPiece(v: VaultPillar): Piece {
  return v.fallen ? drumPiece(v) : columnPiece(v);
}

function columnPiece(v: VaultPillar): Piece {
  const r = Math.max(3.5, v.r * ART * 0.62), half = Math.ceil(r + 2), R = half + 1, p = square(R), c = R + 0.5;
  const put = (x: number, y: number, col: number) => { p.px[y * p.w + x] = rgba(col); };
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      // The plinth: a square slab, bevelled, its upper and left edges lit.
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= half) {
        const e = half - Math.max(Math.abs(dx), Math.abs(dy));
        put(x, y, e < 1 ? (dx < 0 && Math.abs(dx) >= Math.abs(dy) || dy < 0 && Math.abs(dy) > Math.abs(dx) ? STONE[4] : STONE[1]) : STONE[(x + y) & 1 ? 2 : 3]);
      }
      const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      // The shaft's rim, scalloped by its flutes.
      const rim = r * (1 - 0.07 * Math.max(0, Math.cos(a * 10)));
      if (d > rim) continue;
      if (d > rim - 1.1) { put(x, y, facing(dx, dy) > 0 ? STONE[4] : STONE[1]); continue; }
      // The break: rough, lit and shaded in facets.
      const n = wash(x, y, 2.5, v.seed) - 0.5;
      put(x, y, pick(STONE, 3.2 + facing(dx, dy) * (d / r) * 1.4 + n * 2.2));
    }
  snowPatch(p, c - r * 0.25 + (hash01(v.seed, 1221) - 0.5) * r * 0.4, c - r * 0.2, r * (0.38 + hash01(v.seed, 1222) * 0.2), v.seed);
  return p;
}

function drumPiece(v: VaultPillar): Piece {
  const len = Math.round(v.r * ART * 1.9), wid = Math.max(5, Math.round(v.r * ART * 0.95)), R = Math.ceil(Math.hypot(len, wid) / 2) + 1;
  const p = square(R), c = R + 0.5, a = (hash01(v.seed, 1231) - 0.5) * 1.4, ca = Math.cos(a), sa = Math.sin(a);
  // Which way across the drum faces the light.
  const toLight = facing(-sa, ca) > 0 ? 1 : -1;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, along = dx * ca + dy * sa, across = -dx * sa + dy * ca;
      if (Math.abs(along) > len / 2 || Math.abs(across) > wid / 2) continue;
      const u = across / (wid / 2), end = Math.abs(along) > len / 2 - 1.2;
      // Rounded across its width: brightest toward the light, dark under.
      let lvl = 3 - u * toLight * 1.6 - Math.abs(u) ** 3 * 1.2;
      // Flutes run along it.
      if (Math.round((across + wid) * 1.4) % 3 === 0) lvl -= 0.8;
      if (end) lvl = along < 0 === facing(ca, sa) < 0 ? lvl + 0.6 : lvl - 1;
      const q = y * p.w + x;
      p.px[q] = rgba(pick(STONE, lvl + (dither(x, y) - 0.5) * 0.5));
      // Snow along its top.
      if (u * toLight < -0.15 && u * toLight > -0.75 + wash(x, y, 3, v.seed) * 0.3 && !end) p.px[q] = rgba(SNOW[u * toLight < -0.45 ? 3 : 2]);
    }
  return p;
}

/** Rune patterns, three by four: bit k is pixel (k % 3, k / 3 | 0). */
const GLYPHS = [0b010_111_010_010, 0b101_010_101_000, 0b111_100_111_001, 0b010_101_010_101, 0b110_011_110_000, 0b001_011_101_111, 0b100_110_100_111, 0b010_010_111_101];

/** A slate rune slab lying flat in the snow, seen from above: bevelled,
 * its upper and left edges lit and its lower and right in shade, rows of
 * runes cut into its face glowing ice blue, snow drifted over a corner. */
export function runePiece(r: RuneStone): Piece {
  const sw = Math.max(11, Math.round(r.r * ART * 1.9)), sh = Math.round(sw * 1.35), R = Math.ceil(Math.hypot(sw, sh) / 2) + 1;
  const p = square(R, true), c = R + 0.5, a = (hash01(r.seed, 1240) - 0.5) * 0.5, ca = Math.cos(a), sa = Math.sin(a);
  const local = (x: number, y: number) => { const dx = x + 0.5 - c, dy = y + 0.5 - c; return { u: dx * ca + dy * sa, v: -dx * sa + dy * ca }; };
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const { u, v } = local(x, y), eu = sw / 2 - Math.abs(u), ev = sh / 2 - Math.abs(v);
      // Chipped corners.
      if (eu < 0 || ev < 0 || eu + ev < 1.5) continue;
      const q = y * p.w + x, n = wash(x, y, 4, r.seed) - 0.5;
      if (Math.min(eu, ev) < 1) p.px[q] = rgba((eu < ev ? facing(u, 0) : facing(0, v)) > 0 ? SLATE[4] : SLATE[0]);
      else p.px[q] = rgba(pick(SLATE, 2.3 + n * 1.4 + (dither(x, y) - 0.5) * 0.4));
    }
  // The runes, in two columns down the face.
  const cols = sw >= 12 ? 2 : 1;
  for (let k = 0, row = 0; row * 5 + 4 <= sh - 4; row++)
    for (let col = 0; col < cols; col++, k++) {
      const g = GLYPHS[hash(r.seed, k, 1241) % GLYPHS.length];
      const u0 = (cols === 2 ? (col ? 1 : -4) : -1.5), v0 = -sh / 2 + 2.5 + row * 5;
      for (let b = 0; b < 12; b++) {
        if (!(g >> (11 - b) & 1)) continue;
        const u = u0 + (b % 3) + 0.5, v = v0 + Math.floor(b / 3) + 0.5;
        const x = Math.floor(c + u * ca - v * sa), y = Math.floor(c + u * sa + v * ca), q = y * p.w + x;
        if (x < 0 || y < 0 || x >= p.w || y >= p.h || !p.px[q]) continue;
        p.px[q] = rgba(RUNE[(x + y) & 1 ? 1 : 0]);
        p.glow![q] = rgba(RUNE_GLOW[(x + y) & 1 ? 1 : 0]);
      }
    }
  // Snow over one corner.
  const corner = hash(r.seed, 1242) % 4, su = (corner & 1 ? 1 : -1) * sw / 2, sv = (corner & 2 ? 1 : -1) * sh / 2;
  snowPatch(p, c + su * ca - sv * sa, c + su * sa + sv * ca, sw * 0.42, r.seed);
  return p;
}

/** A relic sealed in a block of ice, seen from above: the block's square
 * top, bevelled bright on its upper and left edges, clear blue inside with
 * a streak of light across it, and in it, dimmed by the ice, a crown (a
 * ring of points), an urn (its round body and mouth) or a sword (blade and
 * crossguard). */
export function relicPiece(r: Relic): Piece {
  const S = Math.max(13, Math.round(r.r * ART * 2)), half = S / 2, R = Math.ceil(half) + 1, p = square(R, true), c = R + 0.5;
  const put = (x: number, y: number, col: number, g = 0) => { if (x >= 0 && y >= 0 && x < p.w && y < p.h) { p.px[y * p.w + x] = rgba(col); p.glow![y * p.w + x] = g; } };
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, e = half - Math.max(Math.abs(dx), Math.abs(dy));
      if (e < 0) continue;
      const lit = Math.abs(dx) >= Math.abs(dy) ? facing(dx, 0) : facing(0, dy);
      if (e < 1) put(x, y, lit > 0 ? ICE[5] : ICE[1]);
      else if (e < 2) put(x, y, lit > 0 ? ICE[4] : ICE[2]);
      else put(x, y, dither(x, y) < 0.4 ? ICE[3] : ICE[2], rgba(ICE_GLOW[0]));
    }
  const inner = (x: number, y: number, col: number) => {
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    if (half - Math.max(Math.abs(dx), Math.abs(dy)) >= 2) put(x, y, col);
  };
  const cx = Math.floor(c), cy = Math.floor(c);
  if (r.kind === "crown") {
    const rr = Math.max(2.5, S * 0.24);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const point = Math.cos(a * 5) > 0.6 && d < rr + 1.6;
      if ((d > rr - 1 && d < rr + 0.6) || (point && d >= rr)) inner(x, y, facing(dx, dy) > 0 ? GOLD[3] : GOLD[1]);
    }
    inner(cx, cy, 0x58c0e8);
  } else if (r.kind === "urn") {
    const rr = Math.max(2.5, S * 0.26);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      if (d < rr) inner(x, y, d < rr * 0.38 ? GOLD[0] : d < rr * 0.6 ? GOLD[2] : pick(GOLD, 2 + facing(dx, dy) * 1.2));
    }
  } else {
    const L = Math.round(S * 0.32);
    for (let k = -L; k <= L; k++) { inner(cx, cy + k, k < L - 2 ? STEEL[2] : GOLD[2]); inner(cx + 1, cy + k, k < L - 2 ? STEEL[1] : GOLD[1]); }
    for (let k = -2; k <= 3; k++) inner(cx + k, cy + L - 3, GOLD[k < 1 ? 3 : 2]);
  }
  // A streak of light across the top.
  for (let k = -half + 3; k < half - 3; k++) put(Math.floor(c + k), Math.floor(c - k - 1), ICE[5], rgba(ICE_GLOW[1]));
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
    ...plan.spires.map((s) => ({ y: s.y, x: s.x, p: () => spirePiece(s), drop: s.r > 1 ? 4 : 3 })),
    ...plan.pillars.map((v) => ({ y: v.y, x: v.x, p: () => pillarPiece(v), drop: v.fallen ? 2 : 4 })),
    ...plan.runes.map((r) => ({ y: r.y, x: r.x, p: () => runePiece(r), drop: 1 })),
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
