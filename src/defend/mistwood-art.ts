/** Draws the Mistwood (`mistwood.ts`) at `ART` pixels a cell: the forest
 * floor (`mistwoodFloorSteps`: deep moss over damp loam with leaf litter and
 * tiny pale flowers, the ancient trees' roots and their crowns' shadows, the
 * moonwells, the stone circle's carved ring, and standing on it the stones,
 * fairy rings, boulders, logs, stumps and ferns, each with its shadow, under
 * the units and the battle's darkness), the ancient trees' crowns over
 * everyone (`drawCrowns`, fading over anyone beneath them), then over the
 * darkness (`drawGlow`) what glows: the runes, the mushrooms and the wells
 * (`glow`) with soft halos breathing, and the will-o'-wisps drifting over
 * them. The pieces are drawn bare: their outline is added round them
 * (`stand`, `inked`) while scenery outlines are on. The wilds (`wilds.ts`)
 * lay the same moss (`fillMoss`, the same pixels in board coordinates, so
 * the board's edge is no seam) and stand the same pieces under a thickening
 * canopy. Presentation only; still under Reduce Motion. */
import { ART } from "./art-scale.ts";
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import {
  mistwoodPlan, MISTWOOD, wispAt,
  type AncientTree, type FairyRing, type FallenLog, type Lump, type Menhir, type MistwoodPlan, type Moonwell, type StoneCircle,
} from "./mistwood.ts";
import { haloSprite, piece, rgba, stand, wash, washer, type Img, type Piece } from "./ember-forge-art.ts";
import { artPen } from "./pixel-fx.ts";
import { sceneryOutlinesOn } from "./scenery-looks.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;

const darken = (v: number, k: number) =>
  ((v & 0xff000000) | (Math.round(((v >> 16) & 0xff) * k) << 16) | (Math.round(((v >> 8) & 0xff) * k) << 8) | Math.round((v & 0xff) * k)) >>> 0;

/** Moss, darkest to lightest; its lit tufts; damp loam; leaf litter; the
 * tiny pale flowers and the shade under them. */
const MOSS = [0x111c18, 0x15221c, 0x1a2a21, 0x1f3226, 0x253b2c, 0x2c4532];
const MOSS_LIT = [0x3a5a3c, 0x4c7048];
const LOAM = [0x1a1714, 0x211d18, 0x29241d];
const LITTER = [0x3e3020, 0x50402a, 0x2f3a22];
const FLOWER = [0xa8dcf0, 0xe0ecf0], FLOWER_SHADE = 0x1d3a3a;
/** The crowns, deepest shade to sunlit leaves; the moss hanging from them;
 * the pale blossoms glowing in them. */
const CANOPY = [0x0a1613, 0x0f1f1a, 0x152a22, 0x1c372b, 0x244534, 0x2f553f, 0x3e6a4e];
const HANG = [0x5d7a6b, 0x86a291];
const BLOOM = 0xa8e8ff;
/** Stone, shade to lit, and the moss on it; the runes, carved to glowing. */
const STONE = [0x161b1a, 0x222927, 0x2f3734, 0x3d4743, 0x4f5a55, 0x66726c];
const STONE_MOSS = [0x2c4a32, 0x3f6440];
export const RUNE = [0x1f5a56, 0x4fd0c4, 0xaefff2];
/** Bark, shade to lit; cut wood's rings; roots. */
const BARK = [0x120e0b, 0x1d1712, 0x29201a, 0x372b22, 0x47382c];
const WOOD = [0x3e3022, 0x5a4632, 0x7a6044];
const ROOT = [0x18120e, 0x2a2018, 0x3b2e22];
/** Ferns, shade to lit. */
const FERN = [0x10261a, 0x1f4429, 0x2f6236, 0x4c8446];
/** The mushrooms' caps (shade to lit), stems and the glow in them. */
const CAP = [0x484e74, 0x6c779e, 0x98a4c6], STEM = 0x8e8a7c, CAP_GLOW = 0x8fd0ff;
/** A moonwell's water, deep to its reflections; its glints; lily pads. */
const WATER = [0x07121a, 0x0c1d27, 0x163240, 0x24506a], GLINT = 0xbff6ff, WATER_GLOW = 0x2a7088;
const LILY = [0x1d4a2a, 0x2f6a38], LILY_FLOWER = 0xf0e6f4;
/** The outline drawn round each piece while scenery outlines are on. */
const INK = 0x050a08;
/** The halos' and wisps' colour. */
const HALO = "120,240,215";

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const clampI = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(v)));

const put = (img: Img, x: number, y: number, c: number) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x >= 0 && y >= 0 && x < img.w && y < img.h) img.px[y * img.w + x] = rgba(c);
};
const glowAt = (p: Piece & Img, x: number, y: number, c: number) => {
  x = Math.floor(x); y = Math.floor(y);
  if (p.glow && x >= 0 && y >= 0 && x < p.w && y < p.h) p.glow[y * p.w + x] = rgba(c);
};

/** The moss over a `w` by `h` buffer whose board corner is at (`ox`, `oy`),
 * only where `keep` (buffer pixels) says, yielding every `slice` rows:
 * tones of moss in clumps, patches of damp loam, lit tufts, then a few
 * fallen leaves and pale flowers a cell. Every pixel is a function of its
 * board coordinates alone, so the field and the wilds meet with no seam. */
export function* fillMoss(out: Uint32Array, w: number, h: number, ox: number, oy: number, keep: (X: number, Y: number) => boolean, slice = Infinity): Generator<void, void, void> {
  const x0 = -ox, y0 = -oy;
  const broad = washer(w, x0, 34, 1201), fine = washer(w, x0, 7, 1202), loam = washer(w, x0, 26, 1203), ragged = washer(w, x0, 6, 1204);
  for (let Y = 0; Y < h; Y++, Y % slice || (yield)) {
    const y = Y + y0;
    broad.row(y); fine.row(y); loam.row(y); ragged.row(y);
    for (let X = 0; X < w; X++) {
      if (!keep(X, Y)) continue;
      const x = X + x0;
      const v = broad.at(X) * 0.6 + fine.at(X) * 0.4 + (hash01(x, y, 1205) - 0.5) * 0.36;
      const l = loam.at(X) * 0.78 + ragged.at(X) * 0.22 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.03;
      let c = l > 0.73 ? LOAM[clampI(v * 3 - 0.5, 3)] : MOSS[clampI(v * MOSS.length - 0.5, MOSS.length)];
      if (l <= 0.7 && v > 0.62 && hash01(x, y, 1206) < 0.05) c = MOSS_LIT[hash01(x, y, 1207) < 0.3 ? 1 : 0];
      out[Y * w + X] = rgba(c);
    }
  }
  const cx0 = Math.floor(x0 / ART) - 1, cy0 = Math.floor(y0 / ART) - 1, cx1 = Math.floor((x0 + w) / ART), cy1 = Math.floor((y0 + h) / ART);
  const dot = (x: number, y: number, c: number) => {
    const X = x - x0, Y = y - y0;
    if (X >= 0 && Y >= 0 && X < w && Y < h && keep(X, Y)) out[Y * w + X] = rgba(c);
  };
  for (let cy = cy0; cy <= cy1; cy++, (cy - cy0) % 8 || (yield))
    for (let cx = cx0; cx <= cx1; cx++) {
      // A fallen leaf or two.
      for (let k = 0; k < 2; k++) {
        if (hash01(cx, cy, k, 1208) > 0.55) continue;
        const x = cx * ART + (hash(cx, cy, k, 1209) % ART), y = cy * ART + (hash(cx, cy, k, 1210) % ART), c = LITTER[hash(cx, cy, k, 1211) % 3];
        dot(x, y, c);
        dot(x + 1, y, c);
      }
      // Now and then a tiny pale flower, its shade under it.
      if (hash01(cx, cy, 1212) < 0.07) {
        const x = cx * ART + (hash(cx, cy, 1213) % ART), y = cy * ART + (hash(cx, cy, 1214) % ART);
        dot(x, y, FLOWER[hash(cx, cy, 1215) % 2]);
        dot(x, y + 1, FLOWER_SHADE);
      }
    }
}

/** The forest's canopy closed overhead far out in the wilds, where `keep`
 * says: clumps of leaves in shade over a broad dark wash, yielding every
 * `slice` rows (board coordinates, as `fillMoss`). */
export function* deepCanopy(out: Uint32Array, w: number, h: number, ox: number, oy: number, keep: (X: number, Y: number) => boolean, slice = Infinity): Generator<void, void, void> {
  const x0 = -ox, clump = washer(w, x0, 3.2, 1331), broad = washer(w, x0, 14, 1332);
  for (let Y = 0; Y < h; Y++, Y % slice || (yield)) {
    const y = Y - oy;
    clump.row(y); broad.row(y);
    for (let X = 0; X < w; X++) {
      if (!keep(X, Y)) continue;
      const x = X + x0, v = (clump.at(X) - 0.5) * 3 + (broad.at(X) - 0.5) * 2.2 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.5;
      out[Y * w + X] = rgba(CANOPY[clampI(2 + v, 6)]);
    }
  }
}

/** `p`'s pixels with the outline round them (while scenery outlines are on),
 * for pieces drawn on their own rather than stood on the ground. */
function inked(p: Piece): Piece {
  if (!sceneryOutlinesOn()) return p;
  const px = p.px.slice(), ink = rgba(INK), at = (i: number, j: number) => (i >= 0 && j >= 0 && i < p.w && j < p.h ? p.px[j * p.w + i] : 0);
  for (let j = 0; j < p.h; j++)
    for (let i = 0; i < p.w; i++)
      if (!p.px[j * p.w + i] && (at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1))) px[j * p.w + i] = ink;
  return { ...p, px };
}

/** An ancient tree's crown seen from above: overlapping clumps of leaves lit
 * from the upper left, ragged at the edge, strands of moss hanging from its
 * lower rim and a few pale blossoms glowing in it. */
export function crownPiece(t: AncientTree): Piece {
  const R = t.r * ART, S = Math.ceil(R * 2.3) + 8, p = piece(S, S, Math.floor(S / 2), Math.floor(S / 2), true);
  const hgt = new Float32Array(p.w * p.h), n = 7 + (t.seed % 5);
  const lobes = [{ x: 0, y: 0, r: R * 0.62 }];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (hash01(t.seed, k, 1221) - 0.5) * 0.7, d = R * (0.38 + hash01(t.seed, k, 1222) * 0.28);
    lobes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.9, r: R * (0.3 + hash01(t.seed, k, 1223) * 0.16) });
  }
  for (const l of lobes) {
    const lx = p.ax + l.x, ly = p.ay + l.y;
    for (let y = Math.max(0, Math.floor(ly - l.r - 2)); y < Math.min(p.h, Math.ceil(ly + l.r + 2)); y++)
      for (let x = Math.max(0, Math.floor(lx - l.r - 2)); x < Math.min(p.w, Math.ceil(lx + l.r + 2)); x++) {
        const d = Math.sqrt((x + 0.5 - lx) ** 2 + (y + 0.5 - ly) ** 2) / l.r + (hash01(x >> 1, y >> 1, t.seed) - 0.5) * 0.2;
        if (d >= 1) continue;
        const v = Math.sqrt(1 - d * d);
        if (v > hgt[y * p.w + x]) hgt[y * p.w + x] = v;
      }
  }
  const hAt = (x: number, y: number) => (x >= 0 && y >= 0 && x < p.w && y < p.h ? hgt[y * p.w + x] : 0);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      if (hgt[i] <= 0) continue;
      const gx = hAt(x + 1, y) - hAt(x - 1, y), gy = hAt(x, y + 1) - hAt(x, y - 1);
      // Clumps of leaves: a fine wash shading each one on its own.
      const clump = wash(x, y, 3.2, t.seed + 7) - 0.5;
      const lit = (gx * 0.6 + gy * 0.8) * 2.4 + hgt[i] * 1.1 + clump * 1.1 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.45;
      p.px[i] = rgba(CANOPY[clampI(1 + lit * 2.6, CANOPY.length)]);
      if (hgt[i] > 0.35 && lit > 1 && hash(x, y, t.seed, 1224) % 211 === 0) {
        p.px[i] = rgba(BLOOM);
        p.glow![i] = rgba(BLOOM);
      }
    }
  // Moss hanging from the lower rim.
  for (let x = 0; x < p.w; x++)
    for (let y = p.ay; y < p.h - 1; y++) {
      if (!(hgt[y * p.w + x] > 0 && !hgt[(y + 1) * p.w + x])) continue;
      if (hash(x, t.seed, 1225) % 3) continue;
      const len = 2 + (hash(x, t.seed, 1226) % 4);
      for (let k = 1; k <= len && y + k < p.h; k++) p.px[(y + k) * p.w + x] = rgba(HANG[k === len ? 1 : (k + x) & 1]);
    }
  return p;
}

/** A standing stone: tapering, rounded at the top, lit on its left, moss on
 * its head and its shaded side, a rune carved down its face. */
export function menhirPiece(m: Menhir): Piece {
  const h = Math.max(9, Math.round(m.h * ART)), w = 5 + (m.seed % 3), half = w / 2;
  const p = piece(w + 2, h + 1, Math.floor((w + 2) / 2), h, true);
  const top = p.ay - h, cx = p.ax;
  for (let j = 0; j < h; j++) {
    const round = j === 0 ? 0.55 : j === 1 ? 0.85 : 1, taper = 0.8 + 0.2 * (j / h), hw = half * round * taper;
    for (let i = Math.floor(-hw); i <= Math.ceil(hw); i++) {
      const off = i + 0.5;
      if (Math.abs(off) > hw) continue;
      const side = off / hw;
      let k = side < -0.4 ? 4 : side > 0.45 ? 1 : 3;
      if (j <= 1) k = 5;
      if (j === h - 1) k = Math.max(0, k - 2);
      let c = STONE[k];
      const x = cx + i, y = top + j;
      const moss = wash(x, y, 3.5, m.seed) + (j < h * 0.3 ? 0.18 : 0) + (side > 0.3 ? 0.1 : 0);
      if (moss > 0.72) c = STONE_MOSS[k >= 3 ? 1 : 0];
      else if (hash(x, y, m.seed, 1231) % 13 === 0) c = STONE[Math.max(0, k - 1)];
      put(p, x, y, c);
    }
  }
  // The rune: a stem down the middle of its face with branches off it.
  const r0 = top + Math.round(h * 0.28), r1 = top + Math.round(h * 0.72);
  for (let y = r0; y <= r1; y++) {
    put(p, cx, y, RUNE[1]);
    glowAt(p, cx, y, RUNE[2]);
    if ((y - r0) % 2 === 0 && hash(m.seed, y, 1232) % 3) {
      const s = hash(m.seed, y, 1233) % 2 ? 1 : -1;
      put(p, cx + s, y - (hash(m.seed, y, 1234) % 2), RUNE[1]);
      glowAt(p, cx + s, y, RUNE[1]);
    }
  }
  // A tuft of moss round its foot.
  for (const i of [-Math.ceil(half), Math.ceil(half) - 1]) put(p, cx + i, p.ay - 1, MOSS_LIT[0]);
  return p;
}

/** A fairy ring's mushroom: a pale cap on a short stem, its middle glowing. */
function mushroomPiece(seed: number): Piece {
  const big = seed % 3 === 0, cw = big ? 5 : 3, p = piece(cw, big ? 5 : 4, Math.floor(cw / 2), big ? 4 : 3, true);
  const cx = p.ax, foot = p.ay;
  put(p, cx, foot - 1, STEM);
  if (big) put(p, cx, foot - 2, STEM);
  const capY = foot - (big ? 3 : 2);
  for (let i = -Math.floor(cw / 2); i <= Math.floor(cw / 2); i++) put(p, cx + i, capY, i < 0 ? CAP[2] : i > 0 ? CAP[0] : CAP[1]);
  if (big) for (let i = -1; i <= 1; i++) put(p, cx + i, capY - 1, i < 0 ? CAP[2] : CAP[1]);
  glowAt(p, cx, capY, CAP_GLOW);
  if (big) glowAt(p, cx, capY - 1, CAP_GLOW);
  return p;
}

/** A clump of fern: fronds curling out from its heart, a leaflet either
 * side of each step, lit along their upper edges. */
export function fernPiece(f: Lump): Piece {
  const R = f.r * ART, S = Math.ceil(R * 2) + 4, p = piece(S, S, Math.floor(S / 2), Math.floor(S * 0.6));
  const n = 5 + (f.seed % 3);
  for (let k = 0; k < n; k++) {
    const a = -Math.PI * 0.95 + (k / (n - 1)) * Math.PI * 1.9 + (hash01(f.seed, k, 1241) - 0.5) * 0.4;
    const down = Math.sin(a) > 0.2, L = R * (down ? 0.55 : 0.8 + hash01(f.seed, k, 1242) * 0.25), bend = (hash01(f.seed, k, 1243) - 0.5) * 0.9;
    const dx = Math.cos(a), dy = Math.sin(a) * 0.75 - (down ? 0 : 0.25), px = -dy, py = dx;
    for (let s = 0; s <= L; s += 1) {
      const t = s / L, x = p.ax + dx * s + px * bend * t * t * L * 0.4, y = p.ay + dy * s + py * bend * t * t * L * 0.4;
      put(p, x, y, t < 0.15 ? FERN[0] : FERN[1]);
      if (Math.round(s) % 2 === 0 && t > 0.1) {
        const leaf = Math.max(1, Math.round((1 - t) * 2.4));
        for (let q = 1; q <= leaf; q++) {
          put(p, x + px * q, y + py * q, py * q < 0 ? FERN[3] : FERN[2]);
          put(p, x - px * q, y - py * q, -py * q < 0 ? FERN[3] : FERN[2]);
        }
      }
    }
  }
  return p;
}

/** A fallen log: a round bark body lit along its top, moss over it, its cut
 * end's rings showing and a few pale fungi glowing along its side. */
export function logPiece(g: FallenLog): Piece {
  const L = g.len * ART, R = 3 + (g.seed % 2), ext = Math.ceil(L / 2 + R + 2), p = piece(2 * ext, 2 * ext, ext, ext, true);
  const dx = Math.cos(g.angle), dy = Math.sin(g.angle), nx = -dy, ny = dx;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const ox = x + 0.5 - p.ax, oy = y + 0.5 - p.ay, t = ox * dx + oy * dy, d = ox * nx + oy * ny;
      if (Math.abs(t) > L / 2 || Math.abs(d) > R) continue;
      const up = d * ny; // How far down the screen across the log: lit above.
      if (t > L / 2 - 1.6) {
        // The cut end: its rings.
        const ring = Math.floor(Math.abs(d) * 1.2) % 2;
        p.px[y * p.w + x] = rgba(Math.abs(d) > R - 1 ? BARK[1] : WOOD[1 + ring]);
        continue;
      }
      let k = up < -R * 0.35 ? 4 : up > R * 0.45 ? 1 : 3;
      if (Math.abs(d) > R - 0.8 && up > 0) k = 0;
      if ((Math.round(d + 8) + g.seed) % 3 === 0 && hash(Math.round(t), g.seed, 1251) % 3) k = Math.max(0, k - 1);
      let c = BARK[k];
      if (up < R * 0.2 && wash(x, y, 3, g.seed) > 0.56) c = up < -R * 0.4 ? MOSS_LIT[0] : MOSS[5];
      p.px[y * p.w + x] = rgba(c);
    }
  // Pale fungi along its shaded side.
  for (let q = 0; q < 1 + (g.seed % 3); q++) {
    const t = (hash01(g.seed, q, 1252) - 0.5) * L * 0.7, side = ny >= 0 ? 1 : -1, d = side * (R - 0.5);
    const x = p.ax + dx * t + nx * d, y = p.ay + dy * t + ny * d;
    for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1]]) { put(p, x + i, y + j, j ? CAP[1] : CAP[2]); glowAt(p, x + i, y + j, CAP_GLOW); }
  }
  return p;
}

/** A mossy stump: its cut top's rings, bark down its sides lit on the left,
 * roots reaching out round its foot. */
export function stumpPiece(s: Lump): Piece {
  const R = s.r * ART, ry = Math.max(2, R * 0.55), body = 3, S = Math.ceil(R * 2) + 6;
  const p = piece(S, Math.ceil(ry * 2 + body + 4), Math.floor(S / 2), Math.ceil(ry * 2 + body));
  const cx = p.ax, cy = p.ay - body - ry;
  for (let i = -Math.ceil(R); i <= Math.ceil(R); i++) {
    const u = (i + 0.5) / R;
    if (Math.abs(u) >= 1) continue;
    const half = ry * Math.sqrt(1 - u * u);
    for (let j = Math.floor(-half); j <= Math.ceil(half + body); j++) {
      const x = cx + i, y = cy + j;
      if (j <= half) {
        if (j < -half) continue;
        const e = Math.sqrt(u * u + (j / ry) ** 2);
        const c = e > 0.82 ? (u < 0 ? MOSS[5] : BARK[2]) : WOOD[Math.floor(e * 6 + hash01(s.seed, 1261)) % 2 ? 1 : 0];
        put(p, x, y, hash(x, y, s.seed, 1262) % 17 === 0 ? WOOD[2] : c);
      } else put(p, x, y, BARK[u < -0.4 ? 3 : u > 0.4 ? 0 : 1 + (((i + s.seed) % 3) === 0 ? 0 : 1)]);
    }
  }
  for (let k = 0; k < 3; k++) {
    const side = k % 2 ? 1 : -1, len = 2 + (hash(s.seed, k, 1263) % 3);
    for (let q = 0; q < len; q++) put(p, cx + side * (Math.ceil(R) - 1 + q), p.ay - 1 - (q === 0 ? 1 : 0) + (k === 2 ? 0 : 0), ROOT[q ? 1 : 2]);
  }
  return p;
}

/** A mossy boulder from a few lobes, lit from the upper left, moss over its
 * top. */
export function boulderPiece(b: Lump): Piece {
  const R = Math.ceil(b.r * ART * 1.1) + 1, p = piece(2 * R, 2 * R, R, Math.round(R * 1.4));
  const hgt = new Float32Array(p.w * p.h), n = 2 + (b.seed % 3);
  const lobes = [{ x: 0, y: -R * 0.4, r: b.r * ART * 0.75 }];
  for (let k = 1; k < n; k++) {
    const a = hash01(b.seed, k, 1271) * Math.PI * 2, d = b.r * ART * (0.3 + hash01(b.seed, k, 1272) * 0.3);
    lobes.push({ x: Math.cos(a) * d, y: -R * 0.4 + Math.sin(a) * d * 0.7, r: b.r * ART * (0.4 + hash01(b.seed, k, 1273) * 0.25) });
  }
  for (const l of lobes) {
    const lx = p.ax + l.x, ly = p.ay + l.y;
    for (let y = Math.max(0, Math.floor(ly - l.r)); y < Math.min(p.h, Math.ceil(ly + l.r)); y++)
      for (let x = Math.max(0, Math.floor(lx - l.r)); x < Math.min(p.w, Math.ceil(lx + l.r)); x++) {
        const d = Math.sqrt((x + 0.5 - lx) ** 2 + (y + 0.5 - ly) ** 2) / l.r + (hash01(x >> 1, y >> 1, b.seed) - 0.5) * 0.14;
        if (d >= 1) continue;
        const v = Math.sqrt(1 - d * d);
        if (v > hgt[y * p.w + x]) hgt[y * p.w + x] = v;
      }
  }
  const hAt = (x: number, y: number) => (x >= 0 && y >= 0 && x < p.w && y < p.h ? hgt[y * p.w + x] : 0);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      if (hgt[i] <= 0) continue;
      const gx = hAt(x + 1, y) - hAt(x - 1, y), gy = hAt(x, y + 1) - hAt(x, y - 1);
      const lit = (gx * 0.6 + gy * 0.8) * 3 + hgt[i] * 0.7 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.5;
      let c = STONE[clampI(1.5 + lit * 2.2, STONE.length)];
      const moss = wash(x, y, 4, b.seed) * 0.7 + hgt[i] * 0.3 - gy * 0.8;
      if (moss > 0.62) c = STONE_MOSS[lit > 0.5 ? 1 : 0];
      p.px[i] = rgba(c);
    }
  return p;
}

/** A moonwell at art pixel (px, py) of `img`, `r` cells across, light in
 * `glow`: still dark water with pale reflections, lily pads and the moon's
 * glints, in a ring of mossy stones lit on the upper left. */
export function paintWell(img: Img, glow: Img | null, px: number, py: number, r: number, seed: number, ok: (X: number, Y: number) => boolean = () => true) {
  seed %= 100003;
  const rx = r * ART, ry = rx * 0.8, rim = 2.6;
  const pads = Array.from({ length: 2 + (seed % 3) }, (_, k) => {
    const a = hash01(seed, k, 1281) * 6.28, d = Math.sqrt(hash01(seed, k, 1282)) * 0.6;
    return { x: px + Math.cos(a) * rx * d, y: py + Math.sin(a) * ry * d, r: 1.6 + hash01(seed, k, 1283) * 1.2, flower: k === 0 };
  });
  for (let y = Math.floor(py - ry - rim - 1); y <= Math.ceil(py + ry + rim + 1); y++)
    for (let x = Math.floor(px - rx - rim - 1); x <= Math.ceil(px + rx + rim + 1); x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h || !ok(x, y)) continue;
      const dx = (x + 0.5 - px) / rx, dy = (y + 0.5 - py) / ry, e = Math.sqrt(dx * dx + dy * dy), q = y * img.w + x;
      const edge = 1 + rim / rx;
      if (e >= edge) continue;
      if (e >= 1) {
        // The rim's stones: a block every so far round, mortar between.
        const a = Math.atan2(dy, dx), block = Math.floor((a + Math.PI) * rx / 3.2 + hash01(seed, 1284) * 3);
        const gap = Math.abs(((a + Math.PI) * rx / 3.2 + hash01(seed, 1284) * 3) - block - 0.5) > 0.42;
        const lit = dx + dy < 0 ? 4 : 2, c = gap ? STONE[0] : hash(block, seed, 1285) % 4 === 0 ? STONE_MOSS[lit > 2 ? 1 : 0] : STONE[lit - (e > (1 + edge) / 2 ? 1 : 0)];
        img.px[q] = rgba(c);
        if (glow) glow.px[q] = 0;
        continue;
      }
      // The water, shadowed under its upper rim.
      const shade = dy < -0.55 ? 0 : 1, ref = wash(x, y * 2.2, 5, seed) + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.08;
      let c = WATER[ref > 0.66 ? 3 : ref > 0.5 ? 2 : shade];
      let g = (x + y) % 3 === 0 && e < 0.85 ? WATER_GLOW : 0;
      for (const pad of pads) {
        const d = Math.hypot(x + 0.5 - pad.x, (y + 0.5 - pad.y) * 1.2);
        if (d < pad.r && !(Math.abs(Math.atan2(y + 0.5 - pad.y, x + 0.5 - pad.x) - 0.6) < 0.4 && d > 0.6)) { c = LILY[d < pad.r * 0.5 && x < pad.x ? 1 : 0]; g = 0; }
        if (pad.flower && Math.floor(pad.x) === x && Math.floor(pad.y) === y) { c = LILY_FLOWER; g = LILY_FLOWER; }
      }
      if (c === WATER[2] && hash(x, y, seed, 1286) % 23 === 0) { c = GLINT; g = GLINT; }
      img.px[q] = rgba(c);
      if (glow) glow.px[q] = g ? rgba(g) : 0;
    }
}

/** An ancient tree's trunk and roots at art pixel (px, py) of `img`: a
 * broad dark bole ringed with moss, its roots winding out over the moss. */
export function paintRoots(img: Img, t: AncientTree, px: number, py: number, ok: (X: number, Y: number) => boolean = () => true) {
  const n = 5 + (t.seed % 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hash01(t.seed, k, 1291) * 0.8, len = ART * (1.2 + hash01(t.seed, k, 1292) * 0.9);
    let x = px, y = py, h = a;
    for (let s = 0; s < len; s += 0.7) {
      h += (hash01(t.seed, k, Math.floor(s), 1293) - 0.5) * 0.35;
      x += Math.cos(h) * 0.7; y += Math.sin(h) * 0.7 * 0.85;
      const wdt = 2.6 * (1 - s / len) + 0.6;
      for (let j = -Math.ceil(wdt); j <= Math.ceil(wdt); j++)
        for (let i = -Math.ceil(wdt); i <= Math.ceil(wdt); i++) {
          if (i * i + j * j > wdt * wdt * 0.6) continue;
          const X = Math.floor(x + i), Y = Math.floor(y + j);
          if (X < 0 || Y < 0 || X >= img.w || Y >= img.h || !ok(X, Y)) continue;
          const c = j < 0 ? ROOT[2] : j > 0 ? ROOT[0] : ROOT[1];
          img.px[Y * img.w + X] = rgba(hash(X, Y, t.seed, 1294) % 9 === 0 ? MOSS[5] : c);
        }
    }
  }
  const TR = ART * 0.7;
  for (let y = Math.floor(py - TR - 1); y <= Math.ceil(py + TR + 1); y++)
    for (let x = Math.floor(px - TR - 1); x <= Math.ceil(px + TR + 1); x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h || !ok(x, y)) continue;
      const dx = x + 0.5 - px, dy = y + 0.5 - py, d = Math.sqrt(dx * dx + dy * dy);
      if (d > TR + 1) continue;
      const c = d > TR ? MOSS[5] : d > TR - 1.5 ? (dx + dy < 0 ? BARK[4] : BARK[2]) : BARK[d < TR * 0.45 ? 0 : 1 + (Math.floor(d * 1.3) % 2)];
      img.px[y * img.w + x] = rgba(c);
    }
}

/** A crown's shadow over the floor, down and right of it: the floor's pixels
 * under it darkened, where `ok` allows. */
export function shadeUnder(img: Img, crown: Piece, x: number, y: number, R: number, ok: (X: number, Y: number) => boolean = () => true) {
  const x0 = Math.round(x + R * 0.35) - crown.ax, y0 = Math.round(y + R * 0.5) - crown.ay;
  for (let j = 0; j < crown.h; j++)
    for (let i = 0; i < crown.w; i++) {
      if (!crown.px[j * crown.w + i]) continue;
      const X = x0 + i, Y = y0 + j;
      if (X < 0 || Y < 0 || X >= img.w || Y >= img.h || !ok(X, Y)) continue;
      img.px[Y * img.w + X] = darken(img.px[Y * img.w + X], (X + Y) & 1 ? 0.6 : 0.66);
    }
}

/** The stone circle's carved ring in the floor, its runes glowing faintly. */
function paintCircleRing(img: Img, glow: Img, c: StoneCircle, ok: (X: number, Y: number) => boolean) {
  const rx = c.r * ART, ry = rx * 0.82, n = Math.round((Math.PI * 2 * rx) / 2.2);
  for (let k = 0; k < n; k++) {
    if (hash(c.seed, k, 1301) % 4 === 0) continue;
    const a = (k / n) * Math.PI * 2, X = Math.floor(c.x * ART + Math.cos(a) * rx * 0.72), Y = Math.floor(c.y * ART + Math.sin(a) * ry * 0.72);
    if (X < 0 || Y < 0 || X >= img.w || Y >= img.h || !ok(X, Y)) continue;
    img.px[Y * img.w + X] = rgba(RUNE[0]);
    glow.px[Y * img.w + X] = rgba(RUNE[1]);
  }
}

/** A fairy ring's ground greener and its mushrooms round it, as items. */
function ringItems(r: FairyRing) {
  const rx = r.r * ART, ry = rx * 0.82, n = Math.max(6, Math.round((Math.PI * 2 * rx) / 4.5));
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2 + (hash01(r.seed, k, 1311) - 0.5) * 0.3, d = 1 + (hash01(r.seed, k, 1312) - 0.5) * 0.15;
    return { x: r.x + (Math.cos(a) * rx * d) / ART, y: r.y + (Math.sin(a) * ry * d) / ART, seed: hash(r.seed, k, 1313) };
  });
}

/** Stands the wood's pieces on `img` (and their light in `glow`), back to
 * front, through `stand`, at art offset (ox, oy); one per `step` call. */
export function pieceItems(plan: Pick<MistwoodPlan, "stones" | "circles" | "rings" | "logs" | "stumps" | "boulders" | "ferns">) {
  const items: { y: number; x: number; p: () => Piece; drop: number }[] = [
    ...plan.stones.map((m) => ({ y: m.y, x: m.x, p: () => menhirPiece(m), drop: 2 })),
    ...plan.circles.flatMap((c) => c.stones.map((m) => ({ y: m.y, x: m.x, p: () => menhirPiece(m), drop: 2 }))),
    ...plan.rings.flatMap((r) => ringItems(r).map((m) => ({ y: m.y, x: m.x, p: () => mushroomPiece(m.seed), drop: 1 }))),
    ...plan.logs.map((g) => ({ y: g.y, x: g.x, p: () => logPiece(g), drop: 2 })),
    ...plan.stumps.map((s) => ({ y: s.y, x: s.x, p: () => stumpPiece(s), drop: 2 })),
    ...plan.boulders.map((b) => ({ y: b.y, x: b.x, p: () => boulderPiece(b), drop: b.r > 1.1 ? 2 : 1 })),
    ...plan.ferns.map((f) => ({ y: f.y, x: f.x, p: () => fernPiece(f), drop: 1 })),
  ];
  return items.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The wood's floor and its glowing pixels, a stage (or a slice of rows) a
 * step: the moss over every open cell, the roots, the crowns' shadows, the
 * wells and the circle's ring, then the standing pieces back to front. */
export function* mistwoodFloorSteps(plan: MistwoodPlan): Generator<void, { floor: Uint32Array; glow: Uint32Array }, void> {
  const img: Img = { px: new Uint32Array(W * H), w: W, h: H }, glow: Img = { px: new Uint32Array(W * H), w: W, h: H };
  const ok = (x: number, y: number) => plan.open[Math.floor(y / ART) * CELLS_W + Math.floor(x / ART)] === 1;
  yield* fillMoss(img.px, W, H, 0, 0, ok, 16);
  for (const t of plan.trees) paintRoots(img, t, t.x * ART, t.y * ART, ok);
  yield;
  for (const t of plan.trees) shadeUnder(img, crownPiece(t), t.x * ART, t.y * ART, t.r * ART, ok);
  yield;
  for (const w of plan.wells) paintWell(img, glow, w.x * ART, w.y * ART, w.r, w.seed, ok);
  for (const c of plan.circles) paintCircleRing(img, glow, c, ok);
  yield;
  for (const [k, it] of pieceItems(plan).entries()) {
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

/** A crown's alpha over its trunk, and while someone stands beneath it. */
const CROWN_ALPHA = 1, UNDER_ALPHA = 0.35;

export type MistwoodGlowOptions = { now: number; alpha: number; still: boolean; night: number; effects: boolean };

export class MistwoodArt {
  private map: CityMap | null = null;
  plan: MistwoodPlan | null = null;
  private floor: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private halo: HTMLCanvasElement | null = null;
  private crowns: { cv: HTMLCanvasElement; glow: HTMLCanvasElement | null; ax: number; ay: number }[] = [];
  private layer: HTMLCanvasElement | null = null;
  private fade: number[] = [];
  private lastNow = 0;
  private ink = true;
  private painting: { plan: MistwoodPlan; steps: Generator<void, { floor: Uint32Array; glow: Uint32Array }, void> } | null = null;

  /** Plans `map`'s wood (and repaints it) when the map changes, or when
   * scenery outlines are turned on or off. */
  sync(map: CityMap) {
    const ink = sceneryOutlinesOn();
    if (map === this.map && ink === this.ink) return;
    this.map = map;
    this.ink = ink;
    this.plan = mistwoodPlan(map);
    this.floor = this.glow = null;
    this.crowns = [];
    this.fade = this.plan.trees.map(() => CROWN_ALPHA);
    this.painting = null;
  }

  /** Plans `map`'s wood and paints, for about `ms`, its floor ahead of a
   * battle crossing into it; whether any is left. */
  prepare(map: CityMap, ms: number) {
    if (typeof document === "undefined") return false;
    this.sync(map);
    if (this.floor) return false;
    const end = performance.now() + ms, plan = this.plan!;
    if (this.painting?.plan !== plan) this.painting = { plan, steps: mistwoodFloorSteps(plan) };
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
      const steps = this.painting?.plan === this.plan ? this.painting.steps : mistwoodFloorSteps(this.plan);
      for (;;) { const r = steps.next(); if (r.done) { this.set(r.value); break; } }
    }
    return !!this.floor;
  }

  /** The wood's floor over the open ground. */
  drawFloor(c: CanvasRenderingContext2D, px: number, alpha: number) {
    if (!this.plan || alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= alpha;
    c.drawImage(this.floor!, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
  }

  /** The ancient trees' crowns over everyone, fading over anyone beneath
   * them, darkened by `shade` (drawn in board pixels at `px` a cell) like
   * the forest's. */
  drawCrowns(c: CanvasRenderingContext2D, px: number, o: { now: number; alpha: number; still: boolean; under: readonly { x: number; y: number }[]; shade?: (o: CanvasRenderingContext2D) => void }) {
    const plan = this.plan;
    if (!plan || !plan.trees.length || o.alpha <= 0 || typeof document === "undefined") return;
    if (!this.crowns.length)
      this.crowns = plan.trees.map((t) => {
        const p = inked(crownPiece(t));
        return { cv: canvasOf(p.px, p.w, p.h), glow: p.glow ? canvasOf(p.glow, p.w, p.h) : null, ax: p.ax, ay: p.ay };
      });
    const dt = this.lastNow ? Math.min(0.25, Math.max(0, (o.now - this.lastNow) / 1000)) : 1;
    this.lastNow = o.now;
    this.layer ??= Object.assign(document.createElement("canvas"), { width: W, height: H });
    const lc = this.layer.getContext("2d")!;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, W, H);
    lc.imageSmoothingEnabled = false;
    for (const [k, t] of plan.trees.entries()) {
      const beneath = o.under.some((u) => (u.x - t.x) ** 2 + (u.y - t.y) ** 2 < (t.r * 0.9) ** 2);
      const want = beneath ? UNDER_ALPHA : CROWN_ALPHA;
      this.fade[k] += (want - this.fade[k]) * (o.still ? 1 : Math.min(1, dt * 4));
      const s = this.crowns[k];
      lc.globalAlpha = this.fade[k];
      lc.drawImage(s.cv, Math.round(t.x * ART) - s.ax, Math.round(t.y * ART) - s.ay);
    }
    lc.globalAlpha = 1;
    if (o.shade) {
      lc.save();
      lc.setTransform(ART / px, 0, 0, ART / px, 0, 0);
      lc.globalCompositeOperation = "source-atop";
      o.shade(lc);
      lc.restore();
    }
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= o.alpha;
    c.drawImage(this.layer, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
  }

  /** What glows, over the battle's darkness: the runes, mushrooms and wells
   * breathing slowly, soft halos, the crowns' blossoms and the wisps. */
  drawGlow(c: CanvasRenderingContext2D, px: number, o: MistwoodGlowOptions) {
    const plan = this.plan;
    if (!plan || o.alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    this.halo ??= haloSprite(HALO);
    const t = o.still ? 0 : o.now / 1000, base = c.globalAlpha * o.alpha, night = Math.max(0, Math.min(1, o.night));
    const breathe = (phase: number, rate = 0.7) => (o.still ? 1 : 0.75 + 0.25 * Math.sin(t * rate + phase * 6.28));
    c.save();
    c.globalCompositeOperation = "lighter";
    c.imageSmoothingEnabled = false;
    c.globalAlpha = Math.min(1, base * (0.3 + 0.6 * night) * breathe(0.31, 0.5));
    c.drawImage(this.glow!, 0, 0, CELLS_W * px, CELLS_H * px);
    for (const [k, tr] of plan.trees.entries()) {
      const s = this.crowns[k];
      if (!s?.glow) continue;
      c.globalAlpha = Math.min(1, base * (0.25 + 0.6 * night) * (this.fade[k] ?? 1));
      c.drawImage(s.glow, (Math.round(tr.x * ART) - s.ax) * px / ART, (Math.round(tr.y * ART) - s.ay) * px / ART, s.cv.width * px / ART, s.cv.height * px / ART);
    }
    c.imageSmoothingEnabled = true;
    const halo = (x: number, y: number, r: number, k: number, phase: number) => {
      c.globalAlpha = Math.min(1, base * k * breathe(phase) * (0.25 + 0.75 * night));
      const s = r * px * 2;
      c.drawImage(this.halo!, x * px - s / 2, y * px - s / 2, s, s);
    };
    for (const m of plan.stones) halo(m.x, m.y - m.h * 0.5, 1.4, 0.35, hash01(m.seed, 1321));
    for (const cr of plan.circles) halo(cr.x, cr.y, cr.r * 1.3, 0.3, hash01(cr.seed, 1322));
    for (const w of plan.wells) halo(w.x, w.y, w.r * 2, 0.4, hash01(w.seed, 1323));
    for (const r of plan.rings) halo(r.x, r.y, r.r * 1.8, 0.25, hash01(r.seed, 1324));
    if (o.effects) {
      // Will-o'-wisps: a soft halo round a bright pixel, a faint glow under.
      for (const home of plan.homes)
        for (let k = 0; k < MISTWOOD.wisps; k++) {
          const w = wispAt(home, k, t), g = o.still ? 0.7 : w.glow;
          c.globalAlpha = Math.min(1, base * g * (0.45 + 0.55 * night));
          const s = px * (1.6 + night);
          c.drawImage(this.halo!, w.x * px - s / 2, w.y * px - s / 2, s, s);
        }
      c.globalCompositeOperation = "source-over";
      c.imageSmoothingEnabled = false;
      const dot = artPen(c, px);
      for (const home of plan.homes)
        for (let k = 0; k < MISTWOOD.wisps; k++) {
          const w = wispAt(home, k, t), g = o.still ? 0.7 : w.glow;
          c.globalAlpha = Math.min(1, base * (0.5 + 0.5 * g));
          c.fillStyle = g > 0.7 ? "#f2fffb" : "#b4f5e6";
          dot(Math.floor(w.x * ART), Math.floor(w.y * ART));
        }
    }
    c.restore();
  }
}
