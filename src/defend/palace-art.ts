/** Draws the Obsidian Palace (`palace.ts`), the Blight Prince's throne
 * room, at `ART` pixels a cell: the floor (`palaceFloorSteps`: raw
 * obsidian, glassy with rippled sheen and veined with gold, which toward the
 * throne has been laid with polished slabs in a checker, gold inlaid along
 * their seams with the veins polished through them; the purple carpet down
 * the middle; and on it, back to front with their shadows, the throne on its
 * dais (drawn live, rising past the board's top edge), the colonnade, the
 * torches down each side, roughed-out monoliths, stacked blocks and
 * obsidian shards), then over the battle's darkness (`drawGlow`) what
 * shines: the lit torches' violet fire, the throne's amethyst, the gold veins
 * at night, glints twinkling along the gold and gold dust drifting up. The
 * pieces are drawn bare: their outline is added round them while scenery
 * outlines are on. The wilds (`palaceWildsSteps`, `paintHallWalls`) carry
 * the floor and its pieces on past the board to the cave's walls, black
 * glass shot through with gold. Presentation only; still under Reduce
 * Motion. */
import { ART } from "./art-scale.ts";
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import {
  flicker, glintAt, onCarpet, palacePlan, PALACE, slabLaid, workAt,
  type Blocks, type Crystal, type PalacePlan, type Pillar, type Throne, type Torch,
} from "./palace.ts";
import { haloSprite, rgba, wash, washer, type Img } from "./ember-forge-art.ts";
import { artPen, puff } from "./pixel-fx.ts";
import { sceneryOutlinesOn } from "./scenery-looks.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;

const darken = (v: number, k: number) =>
  ((v & 0xff000000) | (Math.round(((v >> 16) & 0xff) * k) << 16) | (Math.round(((v >> 8) & 0xff) * k) << 8) | Math.round((v & 0xff) * k)) >>> 0;

/** Raw obsidian, darkest to lightest, and its glassy sheen. */
export const OBS = [0x060608, 0x0a0a0d, 0x0f0e13, 0x15141a, 0x1c1a22, 0x24222b];
export const SHEEN = [0x2b2a34, 0x45434f, 0x8e8b9c];
/** Gold, shade to shine. */
export const GOLD = [0x4a300a, 0x8a5e12, 0xc99424, 0xf2cc5a, 0xfff0b0];
/** The laid slabs: their dark edge, the checker's two bodies, the bevel. */
const SLAB = [0x070609, 0x0f0e13, 0x16151b, 0x26242e];
/** The Prince's dark red velvet: carpet, cushions, banners. */
const VELVET = [0x240607, 0x3c0b0e, 0x561217, 0x721c20];
/** Violet fire, hot to cool. */
const FIRE = ["#fff0ff", "#eab0ff", "#bc72f4", "#8238cc", "#4a1a8e"];
/** Amethyst: shade, body, light. */
const GEM = [0x4a1478, 0x9a3ee0, 0xeab8ff];
/** Scaffold wood, shade to lit; a mason's chalk line. */
const WOOD = [0x24160c, 0x3e2614, 0x5e3c20];
const CHALK = 0x8a84a4;
/** The outline drawn round each piece while scenery outlines are on. */
const INK = 0x030205;
/** The halos' colours: the fire's violet, the gold's warmth. */
const VIOLET_HALO = "170,90,255";
const GOLD_HALO = "255,196,90";

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

/** Slab size in art pixels. */
const SLAB_PX = 2 * ART;

/** The palace's floor over a `w` by `h` buffer whose board corner is at
 * (`ox`, `oy`), only where `keep` (buffer pixels) says, yielding every
 * `slice` rows: raw obsidian in clumps with glassy ripples of sheen and
 * winding veins of gold, and wherever the cave has been worked (`slabLaid`)
 * polished slabs in a checker, gold inlaid along their seams, studs at
 * their corners, a long reflection across each and the gold veins polished
 * through. The veins' light goes into `glow`, and some of their gold into
 * `glints` (board art pixels) for the twinkles. Every pixel is a function
 * of its board coordinates alone, so the field and the wilds meet with no
 * seam. */
export function* fillPalaceFloor(out: Uint32Array, w: number, h: number, ox: number, oy: number, keep: (X: number, Y: number) => boolean, slice = Infinity, glow: Uint32Array | null = null, glints: number[] | null = null): Generator<void, void, void> {
  const x0 = -ox, y0 = -oy;
  const broad = washer(w, x0, 34, 1801), fine = washer(w, x0, 7, 1802), ripple = washer(w, x0, 26, 1803);
  const vein = washer(w, x0, 72, 1804), bend = washer(w, x0, 15, 1805), where = washer(w, x0, 58, 1806), hair = washer(w, x0, 21, 1807);
  const sx0 = Math.floor(x0 / SLAB_PX), slabs = Math.ceil(w / SLAB_PX) + 2, laid = new Uint8Array(slabs), crack = new Float32Array(slabs);
  let rowSlab = NaN;
  for (let Y = 0; Y < h; Y++, Y % slice || (yield)) {
    const y = Y + y0, sy = Math.floor(y / SLAB_PX), v = y - sy * SLAB_PX;
    if (sy !== rowSlab) {
      rowSlab = sy;
      for (let k = 0; k < slabs; k++) {
        const sx = sx0 + k;
        laid[k] = slabLaid(sx, sy) ? 1 : 0;
        // Slabs at the edge of the work, freshly laid and some cracked.
        const wv = workAt(sx * 2 + 1, sy * 2 + 1);
        crack[k] = laid[k] && wv < 0.58 && hash01(sx, sy, 1808) < 0.45 ? 1 : 0;
      }
    }
    broad.row(y); fine.row(y); ripple.row(y); vein.row(y); bend.row(y); where.row(y); hair.row(y);
    for (let X = 0; X < w; X++) {
      if (!keep(X, Y)) continue;
      const x = X + x0, i = Y * w + X;
      // The gold veins, as the Nadir's: contour lines of noise, bent, only
      // where `where` lets them run, tapering out at its edge.
      const m = where.at(X), k = Math.max(0, (m - 0.42) / 0.58);
      const a = Math.abs(vein.at(X) + (bend.at(X) - 0.5) * 0.09 - 0.5) + (hash01(x, y, 1809) - 0.5) * 0.002;
      const veinEdge = a < 0.008 * k, veinCore = a < 0.0035 * k, hairline = !veinEdge && m > 0.6 && Math.abs(hair.at(X) - 0.5) < 0.004;
      const sk = Math.floor(x / SLAB_PX) - sx0;
      let c: number;
      if (laid[sk]) {
        const u = x - Math.floor(x / SLAB_PX) * SLAB_PX, sx = sx0 + sk;
        if (u === 0 || v === 0) {
          // The seams, dark between the slabs.
          c = SLAB[0];
        } else if (u === 1 || v === 1) c = SLAB[3];
        else if (u === SLAB_PX - 1 || v === SLAB_PX - 1) c = SLAB[0];
        else {
          const light = (sx + sy) & 1;
          c = light ? SLAB[2] : SLAB[1];
          // A long reflection across the polish, the same way on every slab.
          const r = (u + v + (hash(sx, sy, 1811) % 3)) % SLAB_PX;
          if (light && (r === 10 || (r === 11 && (x & 1)))) c = SLAB[3];
          else if (!light && r === 10 && (x + y) & 1) c = SLAB[2];
          if (veinCore) c = GOLD[3];
          else if (veinEdge) c = GOLD[1];
          if (crack[sk] && Math.abs(wash(x, y, 5, 1812 + sk) - 0.5) < 0.025) c = SLAB[0];
        }
        if (veinCore && glow && u && v) glow[i] = rgba(GOLD[2]);
      } else {
        const t = broad.at(X) * 0.6 + fine.at(X) * 0.4 + (hash01(x, y, 1813) - 0.5) * 0.3;
        c = OBS[Math.max(0, Math.min(OBS.length - 1, Math.floor(t * OBS.length)))];
        // Glassy ripples, as obsidian breaks: rings of sheen round the
        // broad noise's hills, brightest on the hills themselves.
        const f = (ripple.at(X) * 9 + fine.at(X) * 0.35) % 1;
        if (f < 0.05) c = broad.at(X) > 0.56 && f < 0.022 ? SHEEN[1] : SHEEN[0];
        if (veinCore) c = GOLD[3];
        else if (veinEdge) c = a < 0.011 * k ? GOLD[2] : GOLD[0];
        else if (hairline) c = GOLD[0];
        if (hash01(x, y, 1814) < 0.0005) c = GOLD[3];
        if (veinCore && glow) glow[i] = rgba(GOLD[2]);
      }
      if (veinCore && glints && hash01(x, y, 1815) < 0.06) glints.push(x, y);
      out[i] = rgba(c);
    }
  }
}

/** The carpet down the middle from the throne, over open ground: purple
 * with gold borders, lozenges woven down it, a gold fringe at its end. */
export function paintCarpet(img: Img, throne: Throne, ok: (X: number, Y: number) => boolean) {
  const half = PALACE.carpet.half * ART, xs = Math.round(throne.x * ART) - half, ys = Math.round((throne.y - 0.5) * ART), ye = PALACE.carpet.end * ART;
  for (let y = ys; y < ye; y++)
    for (let x = xs; x < xs + 2 * half; x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h || !ok(x, y) || !onCarpet(throne, (x + 0.5) / ART, (y + 0.5) / ART)) continue;
      const u = x - xs, v = y - ys, last = ye - 1 - y, wd = 2 * half;
      let c: number;
      if (last === 0) { if (u % 2) continue; c = GOLD[2]; }
      else if (last === 1) c = GOLD[1];
      else if (u === 0 || u === wd - 1) c = GOLD[0];
      else if (u === 1 || u === wd - 2) c = GOLD[2];
      else if (u === 2) c = VELVET[0];
      else {
        const p = Math.abs(u - (wd - 1) / 2) + Math.abs((v % 24) - 12);
        c = p < 1.5 ? GOLD[3] : p >= 7 && p < 8 ? GOLD[1] : p < 7 ? VELVET[2] : VELVET[1];
        if (c === VELVET[1] && (u + v) % 4 === 0) c = VELVET[0];
      }
      img.px[y * img.w + x] = rgba(c);
    }
}

/** A piece standing up from the floor, drawn as the city's buildings are,
 * its south faces showing: its pixels, its light, and how high (art
 * pixels) each pixel stands, which sets its shadow. */
export type Standing = { px: Uint32Array; glow: Uint32Array; ht: Float32Array; w: number; h: number; ax: number; ay: number };
function standing(left: number, right: number, up: number): Standing & { set: (x: number, j: number, c: number, g?: number) => void } {
  const w = left + right + 5, h = up + 4, ax = left + 2, ay = up + 1;
  const px = new Uint32Array(w * h), glow = new Uint32Array(w * h), ht = new Float32Array(w * h);
  return {
    px, glow, ht, w, h, ax, ay,
    /** Paints the pixel `x` right of the foot's middle and `j` up from it. */
    set(x: number, j: number, c: number, g = 0) {
      const i = Math.round(ax + x), k = Math.round(ay - j);
      if (i < 0 || k < 0 || i >= w || k >= h) return;
      const q = k * w + i;
      px[q] = rgba(c);
      glow[q] = g ? rgba(g) : 0;
      ht[q] = Math.max(0, j);
    },
  };
}

/** How the light falls on a round surface `n` (-1..1) across it, lit from
 * the upper left: -0.6..1. */
const roundLight = (n: number) => -0.6 * n + 0.8 * Math.sqrt(Math.max(0, 1 - n * n));

/** A finished pillar: a plinth, a fluted shaft of polished obsidian with a
 * gold band at its foot and neck and maybe a vein of gold through it, a
 * gold-trimmed capital, and maybe the Prince's banner hanging from it.
 * Half carved (stage 1), the top is still rough rock in a timber
 * scaffold; roughed out (stage 2), it is a monolith with the mason's chalk
 * lines on it. */
export function pillarPiece(p: Pillar): Standing {
  const Hs = 22 + (p.seed % 5), s = standing(10, 10, Hs + 14);
  const veined = p.seed % 3 === 0, vx = -3 + (p.seed % 7);
  const shaft = (j: number, top: number) => {
    for (let x = -5; x <= 5; x++) {
      const n = x / 5.6, l = roundLight(n);
      let t = Math.max(0, Math.min(5, Math.round((l + 0.25) * 3.6)));
      if (x === -3 || x === 0 || x === 3) t = Math.max(0, t - 1);
      const ramp = [OBS[1], OBS[2], OBS[3], OBS[5], SHEEN[0], SHEEN[1]];
      let c = l > 0.97 ? SHEEN[2] : ramp[t];
      const band = j === 5 || j === 6 || j === top - 1 || j === top - 2;
      if (band) c = GOLD[Math.max(1, Math.min(4, 1 + Math.round((l + 0.6) * 1.9)))];
      else if (veined && Math.abs(x - vx - (j - 5) * 0.35 + Math.sin(j * 0.5) * 0.6) < 0.55) c = l > 0.5 ? GOLD[3] : GOLD[2];
      s.set(x, j, c);
    }
  };
  const box = (x0: number, x1: number, j0: number, face: number, depth: number, trim = true) => {
    for (let j = j0; j < j0 + face; j++)
      for (let x = x0; x <= x1; x++) s.set(x, j, trim && j === j0 + face - 1 ? GOLD[3] : trim && j === j0 && x % 4 === 0 ? GOLD[2] : x === x0 ? OBS[4] : OBS[3]);
    for (let j = j0 + face; j < j0 + face + depth; j++)
      for (let x = x0; x <= x1; x++) s.set(x, j, x === x0 || j === j0 + face + depth - 1 ? SHEEN[0] : (x + j) & 1 ? OBS[5] : OBS[4]);
  };
  if (p.stage === 2) {
    // A monolith roughed out of the rock, the chalk lines where it will be cut.
    const top = Math.round(Hs * 0.85);
    for (let j = 0; j <= top; j++) {
      const taper = j > top - 4 ? top - j : 4, jag = (hash(p.seed, j >> 1, 1820) % 3) - 1;
      const L = -6 - (taper < 4 ? 0 : jag) + (taper < 4 ? 4 - taper : 0), R = 6 + (hash(p.seed, j >> 1, 1821) % 2) - (taper < 4 ? 4 - taper : 0);
      for (let x = L; x <= R; x++) {
        const n = (x - (L + R) / 2) / ((R - L) / 2 + 0.5), l = -0.7 * n + 0.3 + (bayer(x + 8, j) - 0.5) * 0.5;
        let c = l > 0.55 ? OBS[5] : l > 0.2 ? OBS[4] : l > -0.2 ? OBS[3] : OBS[2];
        if (j > top - 3) c = j === top ? SHEEN[0] : OBS[5];
        if (hash(p.seed, x, j, 1822) % 19 === 0) c = SHEEN[1];
        if ((x === -4 || x === 4) && j > 2 && j < top - 3 && (j & 3) !== 0) c = CHALK;
        if (veined && Math.abs(x - vx * 0.5 - j * 0.3) < 0.6 && j < top - 2) c = GOLD[2];
        s.set(x, j, c);
      }
    }
    for (const [x, j] of [[-8, 0], [7, 1], [9, 0], [-9, 1]]) s.set(x, j, OBS[4]);
    return s;
  }
  // The plinth.
  box(-7, 7, 0, 3, 3);
  if (p.stage === 1) {
    // Carved up to half way, rough above, in its scaffold.
    const carved = 5 + Math.round(Hs * 0.5);
    shaft(5, 1e9);
    for (let j = 5; j < carved; j++) shaft(j, carved + 3);
    for (let j = carved; j <= Hs + 8; j++) {
      const L = -6 - (hash(p.seed, j >> 1, 1823) % 2), R = 6 + (hash(p.seed, j >> 1, 1824) % 2);
      for (let x = L; x <= R; x++) {
        const l = -0.7 * (x / 6) + 0.2 + (bayer(x + 8, j) - 0.5) * 0.5;
        let c = j >= Hs + 6 ? (j === Hs + 8 ? SHEEN[0] : OBS[5]) : l > 0.5 ? OBS[5] : l > 0 ? OBS[4] : OBS[2];
        if (hash(p.seed, x, j, 1825) % 13 === 0) c = SHEEN[2];
        s.set(x, j, c);
      }
    }
    // The scaffold: two poles and a plank across the front.
    for (let j = 0; j <= Hs + 10; j++) { s.set(-9, j, WOOD[2]); s.set(9, j, WOOD[1]); }
    const pl = carved + 1;
    for (let x = -10; x <= 10; x++) { s.set(x, pl + 1, WOOD[2]); s.set(x, pl, (x & 3) === 0 ? WOOD[0] : WOOD[1]); }
    return s;
  }
  for (let j = 5; j < Hs + 5; j++) shaft(j, Hs + 5);
  box(-7, 7, Hs + 5, 3, 4);
  if (p.banner) {
    // The Prince's banner: purple, edged in gold, a gold crown on it,
    // its foot cut in a swallowtail.
    const top = Hs + 4, len = 13;
    for (let j = top; j > top - len; j--) {
      const from = top - j;
      for (let x = -3; x <= 3; x++) {
        if (from >= len - 2 && Math.abs(x) <= len - 1 - from) continue;
        let c = x === -3 || x === 3 ? GOLD[1] : x === -1 ? VELVET[3] : x === 2 ? VELVET[1] : VELVET[2];
        if (from >= 3 && from <= 5) {
          const crown = [[-2, 0, 2], [-2, -1, 0, 1, 2], [-2, -1, 0, 1, 2]][from - 3];
          if (crown.includes(x)) c = from === 3 ? GOLD[3] : GOLD[2];
        }
        s.set(x, j, c);
      }
    }
  }
  return s;
}

/** A torch: a gold cup on a tall obsidian stand banded in gold, its
 * coals dead until it is lit (its fire and embers are drawn live,
 * `PalaceArt.drawGlow`, at `TORCH_TOP` up from its foot). */
export const TORCH_TOP = 17;
export function torchPiece(t: Torch): Standing {
  const s = standing(6, 6, TORCH_TOP + 4);
  for (let x = -3; x <= 3; x++) { s.set(x, 0, x === -3 ? GOLD[2] : GOLD[1]); s.set(x, 1, x < 0 ? GOLD[3] : GOLD[2]); }
  for (let j = 2; j <= TORCH_TOP - 4; j++)
    for (let x = -1; x <= 1; x++) s.set(x, j, j === 5 || j === TORCH_TOP - 6 ? GOLD[x < 0 ? 3 : 2] : x < 0 ? OBS[5] : x > 0 ? OBS[2] : OBS[4]);
  for (let j = TORCH_TOP - 3; j <= TORCH_TOP - 1; j++) {
    const r = j - (TORCH_TOP - 5);
    for (let x = -r; x <= r; x++) s.set(x, j, GOLD[x < -r / 2 ? 3 : x > r / 2 ? 1 : 2]);
  }
  // The rim and the dead coals inside it.
  for (let x = -4; x <= 4; x++)
    for (let dj = -2; dj <= 2; dj++) {
      const e = (x / 4.5) ** 2 + (dj / 2.2) ** 2;
      if (e > 1) continue;
      const rim = e > 0.45;
      s.set(x, TORCH_TOP + dj, rim ? (dj > 0 ? GOLD[2] : GOLD[3]) : hash(t.seed, x, dj, 1826) % 3 ? OBS[2] : SHEEN[0]);
    }
  return s;
}

/** A cluster of obsidian shards growing out of the floor, back to front:
 * black glass, lit down their left faces, a bright ridge, gold flecks at
 * their roots. */
export function crystalPiece(c: Crystal): Standing {
  const n = 3 + (c.seed % 3), tall = Math.round(c.r * 22), s = standing(12, 12, tall + 6);
  const shards = Array.from({ length: n }, (_, k) => ({
    bx: (hash01(c.seed, k, 1827) - 0.5) * 12, hgt: Math.round(tall * (0.45 + hash01(c.seed, k, 1828) * 0.55)),
    wd: 3 + (hash(c.seed, k, 1829) % 3), lean: (hash01(c.seed, k, 1830) - 0.5) * 0.7,
  })).sort((a, b) => b.hgt - a.hgt);
  for (const sh of shards)
    for (let j = 0; j <= sh.hgt; j++) {
      const hw = (sh.wd / 2) * (1 - (j / (sh.hgt + 1)) ** 1.4), cx = sh.bx + sh.lean * j;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const d = x - cx;
        let col = d < -0.6 ? (d < -hw + 0.8 ? SHEEN[0] : OBS[5]) : d > 0.6 ? OBS[1] : SHEEN[1];
        if (j >= sh.hgt - 1) col = SHEEN[2];
        if (j < 2 && hash(c.seed, x, j, 1831) % 4 === 0) col = GOLD[2];
        s.set(x, j, col);
      }
    }
  return s;
}

/** Quarried blocks of obsidian stacked waiting to be laid, banded in gold
 * where the vein ran through them, a few chips round their foot. */
export function blocksPiece(b: Blocks): Standing {
  const s = standing(12, 12, 18);
  const box = (x0: number, x1: number, j0: number, face: number, depth: number, band: boolean) => {
    for (let j = j0; j < j0 + face; j++)
      for (let x = x0; x <= x1; x++) s.set(x, j, band && j === j0 + 2 ? GOLD[x === x0 ? 3 : 2] : x === x0 ? OBS[4] : x === x1 ? OBS[1] : OBS[2]);
    for (let j = j0 + face; j < j0 + face + depth; j++)
      for (let x = x0; x <= x1; x++) s.set(x, j, j === j0 + face ? SHEEN[0] : x === x0 ? SHEEN[0] : hash(b.seed, x, j, 1832) % 9 ? OBS[4] : SHEEN[1]);
  };
  const bands = hash(b.seed, 1833);
  box(-10, -1, 0, 5, 4, (bands & 1) === 1);
  box(1, 10, 0, 5, 4, (bands & 2) === 2);
  if (b.seed % 4) box(-6, 4, 6, 5, 4, (bands & 4) === 4);
  for (const [x, j] of [[-12, 0], [12, 1], [11, 0], [-13, 1], [0, -1]]) s.set(x, Math.max(0, j), OBS[4]);
  return s;
}

/** The Blight Prince's throne on its dais: three tiers of polished
 * obsidian trimmed and studded in gold, the carpet running up them, and on
 * top the throne, its tall back velvet framed in gold with the Prince's
 * crown on it, a crown of black glass spikes tipped with gold above, an
 * amethyst burning at its heart, a cushioned seat between gold-capped arms. */
export function thronePiece(t: Throne): Standing {
  const s = standing(50, 50, 70);
  const tier = (half: number, j0: number) => {
    for (let j = j0; j < j0 + 3; j++)
      for (let x = -half; x <= half; x++)
        s.set(x, j, j === j0 + 2 ? GOLD[3] : j === j0 + 1 && x % 6 === 0 ? GOLD[2] : hash(t.seed, x, j, 1834) % 23 === 0 ? GOLD[1] : x < -half + 2 ? OBS[4] : OBS[3]);
    for (let j = j0 + 3; j < j0 + 11; j++)
      for (let x = -half; x <= half; x++) {
        const r = (x + 60 - (j - j0)) % 14;
        s.set(x, j, x === -half || x === half ? GOLD[2] : j === j0 + 3 ? SHEEN[0] : r === 0 ? SLAB[3] : (x + j) & 1 ? SLAB[2] : SLAB[1]);
      }
  };
  tier(48, 0); tier(38, 7); tier(28, 14);
  // The carpet up the steps.
  for (let j = 0; j <= 24; j++)
    for (let x = -9; x <= 9; x++) {
      const front = j % 7 < 3 && j < 17;
      s.set(x, j, Math.abs(x) === 9 ? GOLD[2] : Math.abs(x) === 8 ? GOLD[1] : front ? VELVET[1] : VELVET[2]);
    }
  // The back: velvet in a gold frame, the Prince's crown worked on it.
  for (let j = 26; j <= 56; j++)
    for (let x = -13; x <= 13; x++) {
      const frame = Math.abs(x) >= 12 || j >= 55;
      let c = frame ? (x < 0 ? GOLD[3] : GOLD[2]) : x === -11 ? VELVET[3] : x === 11 ? VELVET[0] : (x + (j >> 1)) % 5 === 0 ? VELVET[1] : VELVET[2];
      if (!frame && j >= 38 && j <= 42) {
        const row = j - 38, crown = [[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5], [-5, 5], [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5], [-5, -4, -3, -1, 0, 1, 3, 4, 5], [-5, -3, 0, 3, 5]][row];
        if (crown.includes(x)) c = row === 4 ? GOLD[4] : GOLD[3 - (row & 1)];
      }
      s.set(x, j, c);
    }
  // The crown of spikes above it, gold tipped.
  for (const [cx, hgt] of [[-11, 5], [-6, 8], [0, 12], [6, 8], [11, 5]])
    for (let j = 0; j < hgt; j++) {
      const hw = Math.round((1 - j / hgt) * 2.4);
      for (let x = cx - hw; x <= cx + hw; x++) s.set(x, 57 + j, j === hgt - 1 ? GOLD[4] : x < cx ? SHEEN[0] : x > cx ? OBS[1] : OBS[4]);
    }
  // The amethyst at its heart.
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 3) continue;
      const c = dx + dy < -1 ? GEM[2] : dx + dy > 1 ? GEM[0] : GEM[1];
      s.set(dx, GEM_AT + dy, c, c === GEM[0] ? GEM[1] : GEM[2]);
    }
  // The seat: obsidian trimmed in gold under a purple cushion.
  for (let j = 19; j <= 27; j++)
    for (let x = -11; x <= 11; x++) s.set(x, j, j >= 24 ? (j === 27 ? VELVET[3] : VELVET[2]) : j === 23 ? GOLD[3] : x < -9 ? OBS[4] : OBS[3]);
  // The arms, gold capped.
  for (const side of [-1, 1])
    for (let j = 19; j <= 32; j++)
      for (let x = 12; x <= 17; x++) {
        const X = side * x, lit = side < 0 ? x === 17 : x === 12;
        s.set(X, j, j >= 30 ? (j === 32 ? GOLD[4] : GOLD[2]) : j === 29 ? GOLD[3] : lit ? OBS[5] : OBS[3]);
      }
  return s;
}
/** How far up from the throne's foot its amethyst is (art pixels). */
export const GEM_AT = 49;

/** Stands `p` with its foot at art pixel (x, y) of `img` (and its light in
 * `glow`): first its shadow, each pixel's thrown down and right as far as
 * it stands high, then its outline (while scenery outlines are on), then
 * the piece itself; only on pixels `ok` allows. */
export function standPiece(img: Img, glow: Img | null, p: Standing, x: number, y: number, ok: (X: number, Y: number) => boolean) {
  const x0 = Math.round(x) - p.ax, y0 = Math.round(y) - p.ay, ink = sceneryOutlinesOn() ? rgba(INK) : 0;
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < p.w && j < p.h ? p.px[j * p.w + i] : 0);
  const shade = new Set<number>();
  for (let j = 0; j < p.h; j++)
    for (let i = 0; i < p.w; i++) {
      const k = j * p.w + i;
      if (!p.px[k]) continue;
      // Where the pixel stands on the floor, and its shadow away from it.
      const hp = p.ht[k], gx = x0 + i, gy = y0 + j + hp;
      for (let t = 0; t <= hp * 0.85 + 1; t++) {
        const X = Math.round(gx + t * 0.75), Y = Math.round(gy + t * 0.32);
        if (X >= 0 && Y >= 0 && X < img.w && Y < img.h && !at(X - x0, Y - y0)) shade.add(Y * img.w + X);
      }
    }
  for (const q of shade) {
    const X = q % img.w, Y = (q - X) / img.w;
    if (ok(X, Y)) img.px[q] = darken(img.px[q], (X + Y) & 1 ? 0.42 : 0.5);
  }
  for (let j = -1; j <= p.h; j++)
    for (let i = -1; i <= p.w; i++) {
      const X = x0 + i, Y = y0 + j;
      if (X < 0 || Y < 0 || X >= img.w || Y >= img.h || !ok(X, Y)) continue;
      const q = Y * img.w + X, v = at(i, j);
      if (v) {
        img.px[q] = v;
        if (glow) glow.px[q] = p.glow[j * p.w + i];
      } else if (ink && (at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1))) {
        img.px[q] = ink;
        if (glow) glow.px[q] = 0;
      }
    }
}

type Item = { y: number; draw: (img: Img, glow: Img | null, ox: number, oy: number, ok: (X: number, Y: number) => boolean) => void };
/** The standing pieces back to front. */
export function palaceItems(plan: Pick<PalacePlan, "pillars" | "crystals" | "blocks"> & { torches?: Torch[] }): Item[] {
  const item = <T extends { x: number; y: number }>(p: T, make: (p: T) => Standing) => ({
    y: p.y, draw: (img: Img, glow: Img | null, ox: number, oy: number, ok: (X: number, Y: number) => boolean) => standPiece(img, glow, make(p), p.x * ART + ox, p.y * ART + oy, ok),
  });
  return [
    ...plan.pillars.map((p) => item(p, pillarPiece)),
    ...(plan.torches ?? []).map((t) => item(t, torchPiece)),
    ...plan.crystals.map((c) => item(c, crystalPiece)),
    ...plan.blocks.map((b) => item(b, blocksPiece)),
  ].sort((a, b) => a.y - b.y);
}

/** The floor and its glowing pixels, a stage (or a slice of rows) a step:
 * the ground over every open cell, the carpet on it, then the pieces back
 * to front; with the gold the glints twinkle on (board art pixels, x then y). */
export function* palaceFloorSteps(plan: PalacePlan): Generator<void, { floor: Uint32Array; glow: Uint32Array; glints: Int16Array }, void> {
  const img: Img = { px: new Uint32Array(W * H), w: W, h: H }, glow: Img = { px: new Uint32Array(W * H), w: W, h: H };
  const ok = (x: number, y: number) => plan.open[Math.floor(y / ART) * CELLS_W + Math.floor(x / ART)] === 1;
  const spots: number[] = [];
  yield* fillPalaceFloor(img.px, W, H, 0, 0, ok, 16, glow.px, spots);
  paintCarpet(img, plan.throne, ok);
  yield;
  for (const it of palaceItems(plan)) it.draw(img, glow, 0, 0, ok);
  yield;
  // The glints: an even pick of the gold, at most `PALACE.glints`.
  const n = spots.length / 2, step = Math.max(1, n / PALACE.glints), glints: number[] = [];
  for (let k = 0; k < n && glints.length < PALACE.glints * 2; k += step) {
    const q = Math.floor(k) * 2;
    glints.push(spots[q], spots[q + 1]);
  }
  return { floor: img.px, glow: glow.px, glints: Int16Array.from(glints) };
}

function canvasOf(pixels: Uint32Array, w: number, h: number) {
  const cv = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = cv.getContext("2d")!, img = ctx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(pixels);
  ctx.putImageData(img, 0, 0);
  return cv;
}

export type PalaceGlowOptions = { now: number; alpha: number; still: boolean; night: number; effects: boolean;
  /** How many torches burn (`torchesLit`). */
  lit: number };

/** The throne baked for drawing live (it rises past the board's top
 * edge): its pixels, its light, its shadow (opaque black, drawn faint),
 * and where its foot is in them. */
export function throneSprite(t: Throne) {
  const p = thronePiece(t), padR = 60, padB = 24, w = p.w + padR, h = p.h + padB;
  const img: Img = { px: new Uint32Array(w * h), w, h }, glow: Img = { px: new Uint32Array(w * h), w, h };
  standPiece(img, glow, p, p.ax, p.ay, () => true);
  // The shadow, thrown as `standPiece` throws it, kept apart.
  const shadow = new Uint32Array(w * h), black = rgba(0);
  for (let j = 0; j < p.h; j++)
    for (let i = 0; i < p.w; i++) {
      const k = j * p.w + i;
      if (!p.px[k]) continue;
      const hp = p.ht[k];
      for (let q = 0; q <= hp * 0.85 + 1; q++) {
        const X = Math.round(i + q * 0.75), Y = Math.round(j + hp + q * 0.32);
        if (X < w && Y < h && !img.px[Y * w + X]) shadow[Y * w + X] = black;
      }
    }
  return { px: img.px, glow: glow.px, shadow, w, h, ax: p.ax, ay: p.ay };
}

/** How long a torch flares as it catches (ms). */
const CATCH_MS = 900;

export class PalaceArt {
  private map: CityMap | null = null;
  plan: PalacePlan | null = null;
  private floor: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private glints: Int16Array | null = null;
  private violet: HTMLCanvasElement | null = null;
  private gold: HTMLCanvasElement | null = null;
  private ink = true;
  private painting: { plan: PalacePlan; steps: ReturnType<typeof palaceFloorSteps> } | null = null;
  private throne: { look: HTMLCanvasElement; light: HTMLCanvasElement; shadow: HTMLCanvasElement; ax: number; ay: number } | null = null;
  /** How many torches burned when last drawn, and when each caught. */
  private litNow = -1;
  private caught: number[] = [];

  /** Plans `map`'s palace (and repaints it) when the map changes, or when
   * scenery outlines are turned on or off. */
  sync(map: CityMap) {
    const ink = sceneryOutlinesOn();
    if (map === this.map && ink === this.ink) return;
    this.map = map;
    this.ink = ink;
    this.plan = palacePlan(map);
    this.floor = this.glow = null;
    this.glints = null;
    this.painting = null;
    this.throne = null;
  }

  /** Plans `map`'s palace and paints, for about `ms`, its floor ahead of a
   * battle crossing into it; whether any is left. */
  prepare(map: CityMap, ms: number) {
    if (typeof document === "undefined") return false;
    this.sync(map);
    if (this.floor) return false;
    const end = performance.now() + ms, plan = this.plan!;
    if (this.painting?.plan !== plan) this.painting = { plan, steps: palaceFloorSteps(plan) };
    for (;;) {
      const r = this.painting.steps.next();
      if (r.done) { this.set(r.value); return false; }
      if (performance.now() >= end) return true;
    }
  }

  private set(v: { floor: Uint32Array; glow: Uint32Array; glints: Int16Array }) {
    this.floor = canvasOf(v.floor, W, H);
    this.glow = canvasOf(v.glow, W, H);
    this.glints = v.glints;
    this.painting = null;
  }

  private ready() {
    if (!this.floor && this.plan) {
      const steps = this.painting?.plan === this.plan ? this.painting.steps : palaceFloorSteps(this.plan);
      for (;;) { const r = steps.next(); if (r.done) { this.set(r.value); break; } }
    }
    return !!this.floor;
  }

  /** The floor over the open cells, then the throne with its shadow. */
  drawFloor(c: CanvasRenderingContext2D, px: number, alpha: number) {
    if (!this.plan || alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= alpha;
    c.drawImage(this.floor!, 0, 0, CELLS_W * px, CELLS_H * px);
    const th = this.throneLooks(), t = this.plan.throne, k = px / ART;
    const X = (Math.round(t.x * ART) - th.ax) * k, Y = (Math.round(t.y * ART) - th.ay) * k, w = th.look.width * k, h = th.look.height * k;
    const a = c.globalAlpha;
    c.globalAlpha = a * 0.5;
    c.drawImage(th.shadow, X, Y, w, h);
    c.globalAlpha = a;
    c.drawImage(th.look, X, Y, w, h);
    c.restore();
  }

  private throneLooks() {
    if (!this.throne) {
      const s = throneSprite(this.plan!.throne);
      this.throne = { look: canvasOf(s.px, s.w, s.h), light: canvasOf(s.glow, s.w, s.h), shadow: canvasOf(s.shadow, s.w, s.h), ax: s.ax, ay: s.ay };
    }
    return this.throne;
  }

  /** Notes when each torch caught, for its flare. */
  private catchUp(lit: number, now: number) {
    if (this.litNow < 0 || lit < this.litNow) this.caught = Array.from({ length: lit }, () => -Infinity);
    else for (let k = this.litNow; k < lit; k++) this.caught[k] = now;
    this.litNow = lit;
  }

  /** What shines, over the battle's darkness: the gold veins (at night),
   * the lit torches' violet fire and halos, the throne's amethyst, glints
   * twinkling along the gold and gold dust drifting up. */
  drawGlow(c: CanvasRenderingContext2D, px: number, o: PalaceGlowOptions) {
    const plan = this.plan;
    if (!plan || o.alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    this.violet ??= haloSprite(VIOLET_HALO);
    this.gold ??= haloSprite(GOLD_HALO);
    const t = o.still ? 0 : o.now / 1000, base = c.globalAlpha * o.alpha, night = Math.max(0, Math.min(1, o.night));
    c.save();
    c.globalCompositeOperation = "lighter";
    c.imageSmoothingEnabled = false;
    c.globalAlpha = Math.min(1, base * (0.12 + 0.55 * night));
    c.drawImage(this.glow!, 0, 0, CELLS_W * px, CELLS_H * px);
    c.imageSmoothingEnabled = true;
    const halo = (sprite: HTMLCanvasElement, x: number, y: number, r: number, k: number) => {
      c.globalAlpha = Math.min(1, base * k);
      const s = r * px * 2;
      c.drawImage(sprite, x * px - s / 2, y * px - s / 2, s, s);
    };
    this.catchUp(o.lit, o.now);
    // The torches burning, each flaring as it catches.
    const burning = plan.torches.filter((b) => b.order < o.lit), flare = (b: Torch) => (o.still ? 0 : Math.max(0, 1 - (o.now - (this.caught[b.order] ?? -Infinity)) / CATCH_MS));
    for (const b of burning) {
      const f = o.still ? 0.85 : flicker(b.seed, t), fl = flare(b);
      halo(this.violet, b.x, b.y - TORCH_TOP / ART, 3.2 + f + fl * 4, (0.35 + 0.6 * night) * f + fl * 0.8);
    }
    // The throne's amethyst, beating slowly.
    const th = plan.throne, beat = o.still ? 0.6 : 0.5 + 0.5 * Math.sin(t * 1.7);
    halo(this.violet, th.x, th.y - GEM_AT / ART, 2.4 + beat, (0.3 + 0.5 * night) * (0.6 + 0.4 * beat));
    halo(this.gold, th.x, th.y - 3.5, 7, 0.12 + 0.2 * night);
    c.imageSmoothingEnabled = false;
    const dot = artPen(c, px);
    // The throne's amethyst.
    {
      const th = this.throneLooks(), k = px / ART;
      c.globalAlpha = Math.min(1, base * (0.35 + 0.65 * night));
      c.drawImage(th.light, (Math.round(plan.throne.x * ART) - th.ax) * k, (Math.round(plan.throne.y * ART) - th.ay) * k, th.light.width * k, th.light.height * k);
    }
    // The torches' fire: tongues of violet rising and shrinking, taller as
    // each catches.
    c.globalCompositeOperation = "source-over";
    for (const b of burning) {
      const bx = Math.round(b.x * ART), by = Math.round(b.y * ART) - TORCH_TOP - 1, tall = 1 + flare(b) * 1.2;
      c.globalAlpha = Math.min(1, base);
      c.fillStyle = FIRE[3];
      dot(bx - 2, by, 5, 2);
      for (let k = 0; k < 9; k++) {
        const u = (s: number) => hash01(b.seed, k, s);
        const age = (t * (1.1 + u(1840) * 0.8) + u(1841)) % 1;
        const x = bx + (u(1842) - 0.5) * 5 * (1 - age) + Math.sin(t * 5 + k) * 1.2 * age, y = by - age * (8 + u(1843) * 4) * tall;
        const r = Math.round((1 - age) * 2.2 - 0.3);
        c.fillStyle = age < 0.18 ? FIRE[0] : age < 0.42 ? FIRE[1] : age < 0.7 ? FIRE[2] : FIRE[3];
        puff(dot, Math.round(x), Math.round(y), Math.max(0, r));
      }
    }
    c.globalCompositeOperation = "lighter";
    // Glints twinkling along the gold.
    const g = this.glints!;
    for (let k = 0; k * 2 < g.length; k++) {
      const v = o.still ? 0 : glintAt(k, t);
      if (v < 0.05) continue;
      const x = g[k * 2], y = g[k * 2 + 1], arm = Math.round(v * 2.4);
      c.globalAlpha = Math.min(1, base * v);
      c.fillStyle = "#fff4c4";
      dot(x, y);
      c.fillStyle = "#ffcf5a";
      for (let a = 1; a <= arm; a++) { dot(x - a, y); dot(x + a, y); dot(x, y - a); dot(x, y + a); }
    }
    if (o.effects && !o.still) {
      // Gold dust drifting up through the hall, and violet sparks off the fires.
      for (let a = 0; a < 40; a++) {
        const u = (s: number) => hash01(a, s);
        const life = 8 + u(1851) * 7, age = (t / life + u(1852)) % 1, round = Math.floor(t / life + u(1852));
        const x = hash01(a, round, 1853) * CELLS_W, y0 = hash01(a, round, 1854) * CELLS_H;
        if (!plan.open[Math.floor(y0) * CELLS_W + Math.floor(x)]) continue;
        c.globalAlpha = Math.min(1, base * Math.sin(age * Math.PI) * 0.6);
        c.fillStyle = a % 4 ? "#d8a838" : "#fff0a0";
        dot(Math.floor((x + Math.sin(t * 0.6 + a) * 0.25) * ART), Math.floor((y0 - age * 3) * ART));
      }
      for (const b of burning)
        for (let k = 0; k < 4; k++) {
          const u = (s: number) => hash01(b.seed, k, s);
          const age = (t * (0.45 + u(1855) * 0.3) + u(1856)) % 1;
          c.globalAlpha = Math.min(1, base * (1 - age));
          c.fillStyle = FIRE[2];
          dot(Math.round(b.x * ART + (u(1857) - 0.5) * 8 + Math.sin(t * 3 + k) * 2 * age), Math.round(b.y * ART - TORCH_TOP - 6 - age * 22));
        }
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- the wilds

/** The pieces standing about the cave past the board, as
 * `palaceWildsSteps` paints them. */
export type PalaceWilds = { pillars: Pillar[]; crystals: Crystal[]; blocks: Blocks[] };

/** Plans the pieces past the board, `margin` cells past every edge, clear
 * of the cave's walls (`wall(x, y)` in cells): finished pillars where the
 * floor is laid, half-carved and roughed-out ones at its edge, shards and
 * blocks out in the raw rock. */
export function palaceWilds(margin: number, wall: (x: number, y: number) => boolean): PalaceWilds {
  const out: PalaceWilds = { pillars: [], crystals: [], blocks: [] };
  const taken: { x: number; y: number; r: number }[] = [];
  const off = (x: number, y: number) => { const dx = x < 0 ? -x : x > CELLS_W ? x - CELLS_W : 0, dy = y < 0 ? -y : y > CELLS_H ? y - CELLS_H : 0; return Math.hypot(dx, dy); };
  for (let cy = -margin; cy < CELLS_H + margin; cy++)
    for (let cx = -margin; cx < CELLS_W + margin; cx++) {
      const x = cx + 0.5, y = cy + 0.5, d = off(x, y);
      if (d < 2.5 || d > 40) continue;
      const u = hash01(cx, cy, 1861);
      if (u > 0.012) continue;
      const seed = hash(cx, cy, 1862), w = workAt(x, y), r = 1.4;
      if (wall(x, y) || wall(x, y + 2) || wall(x - 1.5, y) || wall(x + 1.5, y) || wall(x, y - 3)) continue;
      if (taken.some((t) => (t.x - x) ** 2 + (t.y - y) ** 2 < (t.r + r + 2) ** 2)) continue;
      taken.push({ x, y, r });
      if (w > 0.62) {
        out.pillars.push({ x, y, r: 1, seed, stage: 0, banner: hash01(seed, 1863) < 0.4 });
      } else if (w > 0.45) {
        if (u < 0.005) out.blocks.push({ x, y, r: 1.1, seed });
        else out.pillars.push({ x, y, r: 1, seed, stage: u < 0.008 ? 1 : 2, banner: false });
      } else if (u < 0.002) out.blocks.push({ x, y, r: 1.1, seed });
      else out.crystals.push({ x, y, r: 0.7 + hash01(seed, 1864) * 0.7, seed });
    }
  return out;
}

/** The palace's floor and pieces carried on round the board into `out`
 * (their light into `glow`), a `gw` by `gh` buffer with the board's corner
 * at (`ox`, `oy`) and the board `bw` by `bh` pixels, `margin` cells round
 * it, clear of `wall` (cells). The walls themselves are `paintHallWalls`. */
export function* palaceWildsSteps(out: Uint32Array, glow: Uint32Array, gw: number, gh: number, ox: number, oy: number, bw: number, bh: number, margin: number, slice: number, wall: (x: number, y: number) => boolean): Generator<void, void, void> {
  const offField = (X: number, Y: number) => !(X >= ox && Y >= oy && X < ox + bw && Y < oy + bh);
  yield* fillPalaceFloor(out, gw, gh, ox, oy, offField, slice, glow);
  yield;
  const img: Img = { px: out, w: gw, h: gh }, light: Img = { px: glow, w: gw, h: gh };
  const items = palaceItems(palaceWilds(margin, wall));
  for (let k = 0; k < items.length; k++, k % 32 || (yield)) items[k].draw(img, light, ox, oy, offField);
}

/** The cave's walls into `out` (and their inscriptions' light into
 * `glow`), from the wilds' mountain heights `H` where `f` is above 0: a
 * strange jumble of obsidian cubes stacked in columns of every height,
 * each cube's top and south face showing, bevelled, a few of them cut
 * with golden inscriptions; loose cubes lying at the walls' foot; outlined
 * while scenery outlines are on. */
export function* paintHallWalls(out: Uint32Array, glow: Uint32Array, gw: number, gh: number, Hs: Float32Array, f: Float32Array, slice: number): Generator<void, void, void> {
  const C = CUBE.size, FH = CUBE.face, nx = Math.ceil(gw / C), ny = Math.ceil(gh / C);
  const ramp = [0x020203, 0x060608, 0x0b0b0e, 0x121116, 0x1e1d24, 0x2a2832, 0x393643, 0x4c4958].map((c) => rgba(c));
  const shine = rgba(SHEEN[1]), gold = GOLD.map((c) => rgba(c)), lit = rgba(GOLD[2]), ink = rgba(INK);
  const level = new Uint8Array(nx * ny);
  const at = (X: number, Y: number) => f[Math.min(gh - 1, Y) * gw + Math.min(gw - 1, X)];
  for (let gy = 0; gy < ny; gy++)
    for (let gx = 0; gx < nx; gx++) {
      const X = gx * C + (C >> 1), Y = gy * C + (C >> 1), i = Math.min(gh - 1, Y) * gw + Math.min(gw - 1, X);
      if (f[i] > 0) {
        let n = 1 + Math.floor(Hs[i] / 20 + (hash01(gx, gy, 1881) - 0.35) * 3.4);
        if (hash01(gx, gy, 1882) < 0.05) n -= 2;
        level[gy * nx + gx] = Math.max(1, Math.min(CUBE.most, n));
      } else if (hash01(gx, gy, 1883) < 0.22 && (at(X + C, Y) > 0 || at(Math.max(0, X - C), Y) > 0 || at(X, Y + C) > 0 || at(X, Math.max(0, Y - C)) > 0))
        level[gy * nx + gx] = 1;
    }
  yield;
  const solid = new Uint8Array(gw * gh);
  const put = (X: number, Y: number, c: number, g = 0) => {
    if (X < 0 || Y < 0 || X >= gw || Y >= gh) return;
    const i = Y * gw + X;
    out[i] = c; glow[i] = g; solid[i] = 1;
  };
  const glyph = (seed: number, X0: number, Y0: number) => {
    const rows = GLYPHS[seed % GLYPHS.length];
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") put(X0 + i, Y0 + j, gold[3], lit); });
  };
  for (let gy = 0; gy < ny; gy++, gy % 4 || (yield))
    for (let gx = 0; gx < nx; gx++) {
      const n = level[gy * nx + gx];
      if (!n) continue;
      const X0 = gx * C, foot = gy * C + C;
      // The south faces, the bottom cube first.
      for (let L = 1; L <= n; L++) {
        const top = foot - L * FH, seed = hash(gx, gy, L, 1884), tone = 2 + (seed % 3 === 0 ? 1 : 0) - (L === 1 ? 1 : 0);
        for (let v = 0; v < FH; v++)
          for (let u = 0; u < C; u++) {
            const t = v < FH / 2 && (u + v) & 1 ? tone : v < 2 ? tone : Math.max(1, tone - 1);
            put(X0 + u, top + v, v === 0 ? ramp[tone + 3] : v === FH - 1 ? ramp[0] : u === 0 ? ramp[tone + 1] : u === C - 1 ? ramp[0] : ramp[t]);
          }
        if (hash01(seed, 1885) < CUBE.inscribed) glyph(seed, X0 + 5, top + 2);
      }
      // The top face.
      const y0 = foot - n * FH - C, seed = hash(gx, gy, 1886), tone = 5 + (seed % 4 === 0 ? 1 : 0) - (seed % 5 === 0 ? 1 : 0);
      for (let v = 0; v < C; v++)
        for (let u = 0; u < C; u++) {
          let c = u === 0 || v === 0 ? (u + v < 3 ? shine : ramp[7]) : u === C - 1 || v === C - 1 ? ramp[3] : ramp[tone];
          if (u > 1 && v > 1 && u < C - 1 && v < C - 1 && u + v === 11) c = ramp[Math.min(7, tone + 1)];
          put(X0 + u, y0 + v, c);
        }
      if (hash01(seed, 1887) < CUBE.inscribed * 0.6) glyph(seed, X0 + 5, y0 + 5);
    }
  if (!sceneryOutlinesOn()) return;
  // The outline round the walls where they meet the floor.
  for (let Y = 1; Y < gh - 1; Y++, Y % (slice * 4) || (yield))
    for (let X = 1; X < gw - 1; X++) {
      const i = Y * gw + X;
      if (!solid[i] && (solid[i - 1] || solid[i + 1] || solid[i - gw] || solid[i + gw])) { out[i] = ink; glow[i] = 0; }
    }
}

/** The walls' cubes: their size (art pixels across the top), the height
 * of their south face, the most stacked in a column, and the share cut
 * with an inscription. */
export const CUBE = { size: 16, face: 12, most: 9, inscribed: 0.03 } as const;
/** The inscriptions, golden runes five pixels square. */
const GLYPHS = [
  ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  ["#####", "#...#", "#.#.#", "#...#", "#####"],
  ["..#..", ".###.", "#.#.#", "..#..", "..#.."],
  ["###..", "#....", "####.", "...#.", "..##."],
  [".###.", "#...#", "#.#.#", "#...#", ".#.#."],
  ["#.#.#", "#.#.#", "#####", "..#..", ".###."],
];
