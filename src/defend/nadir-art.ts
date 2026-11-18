/** Draws the Nadir (`nadir.ts`) at `ART` pixels a cell: the floor
 * (`nadirFloorSteps`: black ground veined with dark red, skewed patches of
 * checkered tiles that belong nowhere, rifts torn open onto the void, and on
 * it black pyramids casting their shadows toward the light, stairs to
 * nowhere and stairs sinking into the ground, trapdoors with red light round
 * them, the eyes' sockets), then live over it (`drawLive`) the eyes,
 * watching the nearest walker and blinking, and the hovering stones and
 * cubes with their shadows thrown every which way, all under the units and
 * the battle's darkness; then over the darkness (`drawGlow`) what glows: the
 * veins beating like a heart, the rifts' lips, motes spiralling down into
 * the rifts, specks of ash falling upward, the eyes' red irises. The pieces
 * are drawn bare: their outline is added round them while scenery outlines
 * are on. The wilds (`voidWildsSteps`) lay the same ground on round the
 * board until it breaks off over the void, its rock hanging below, with
 * more broken pieces of it floating out there in a black and dark red
 * nebula. Presentation only; still under Reduce Motion. */
import { ART } from "./art-scale.ts";
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import {
  eyeLook, eyeOpen, floatAt, heartbeat, moteAt, nadirPlan, NADIR, riftAt, stairAt,
  type Floater, type GroundEye, type NadirPlan, type Pyramid, type Rift, type Stair, type Trapdoor,
} from "./nadir.ts";
import { haloSprite, piece, rgba, wash, washer, type Img, type Piece } from "./ember-forge-art.ts";
import { artPen } from "./pixel-fx.ts";
import { sceneryOutlinesOn } from "./scenery-looks.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;

const darken = (v: number, k: number) =>
  ((v & 0xff000000) | (Math.round(((v >> 16) & 0xff) * k) << 16) | (Math.round(((v >> 8) & 0xff) * k) << 8) | Math.round((v & 0xff) * k)) >>> 0;

/** The ground, darkest to lightest. */
const GROUND = [0x0b0708, 0x100a0b, 0x150c0d, 0x1b1011, 0x221415, 0x2a191a];
/** The veins: their dark edge, their core, and the core's light. */
const VEIN = [0x3c0b10, 0x6e141a, 0xa82028];
/** The checkered tiles that belong nowhere. */
const CHECK = [0x0a0506, 0x2a1416];
/** The void: black, through deep red. */
export const VOID = [0x020102, 0x050203, 0x090305, 0x0f0408, 0x18060b, 0x24080e, 0x320a12];
/** A rift's lip, cool to hot, and the scorch round it. */
const LIP = [0x4a0a10, 0x8e161e, 0xd23a3a];
const SCORCH = 0x070304;
/** Black stone for the pyramids, the stairs and the floaters, shade to lit. */
const STONE = [0x060304, 0x120a0b, 0x231416, 0x3a2224, 0x5a3436, 0x7c4c4c];
/** Red light: dim, bright, hot. */
const RED = [0x5a0c12, 0xb01c24, 0xff5a4a];
/** The trapdoors' wood and iron. */
const WOOD = [0x1e0e0b, 0x2c150f, 0x3a1c14, 0x4a2619];
const IRON = [0x141012, 0x2a2426, 0x4a4244, 0x7a7072];
/** The eyes: lid, sclera (shade, lit), iris (rim, body) and its light. */
const LID = [0x2a1012, 0x3e1a1c, 0x522426];
const SCLERA = [0x6a5852, 0x9a8a80];
const IRIS = [0x4a0608, 0xa01418, 0xe0402c];
/** The rock hanging under the ground where it breaks off, banded. */
const UNDER = [0x060203, 0x100607, 0x1c0b0c, 0x2a1213, 0x3a1a1b, 0x4c2222];
/** The outline drawn round each piece while scenery outlines are on. */
const INK = 0x030102;
/** The halos' colour. */
const HALO = "190,20,30";

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

/** The Nadir's ground over a `w` by `h` buffer whose board corner is at
 * (`ox`, `oy`), only where `keep` (buffer pixels) says, yielding every
 * `slice` rows: black ground in clumps, winding veins of dark red (their
 * light into `glow`), and here and there a skewed patch of checkered tiles.
 * Every pixel is a function of its board coordinates alone, so the field
 * and the wilds meet with no seam. */
export function* fillVoidstone(out: Uint32Array, w: number, h: number, ox: number, oy: number, keep: (X: number, Y: number) => boolean, slice = Infinity, glow: Uint32Array | null = null): Generator<void, void, void> {
  const x0 = -ox, y0 = -oy;
  const broad = washer(w, x0, 30, 1601), fine = washer(w, x0, 7, 1602), vein = washer(w, x0, 26, 1603), thin = washer(w, x0, 11, 1604);
  const where = washer(w, x0, 44, 1605), tiles = washer(w, x0, 52, 1606);
  for (let Y = 0; Y < h; Y++, Y % slice || (yield)) {
    const y = Y + y0;
    broad.row(y); fine.row(y); vein.row(y); thin.row(y); where.row(y); tiles.row(y);
    for (let X = 0; X < w; X++) {
      if (!keep(X, Y)) continue;
      const x = X + x0, i = Y * w + X;
      const v = broad.at(X) * 0.6 + fine.at(X) * 0.4 + (hash01(x, y, 1607) - 0.5) * 0.4;
      let c = GROUND[Math.max(0, Math.min(GROUND.length - 1, Math.floor(v * GROUND.length)))];
      // Checkered tiles, skewed, with ragged edges.
      if (tiles.at(X) + (hash01(x >> 2, y >> 2, 1608) - 0.5) * 0.06 > 0.8) c = CHECK[((x + (y >> 3)) >> 2) + (y >> 2) & 1];
      // The veins: the noise's contour lines, bent by finer noise, only
      // where `where` lets them run and tapering out at its edge, so they
      // start and stop like cracks.
      const m = where.at(X), k = Math.max(0, (m - 0.42) / 0.58);
      const a = Math.abs(vein.at(X) + (fine.at(X) - 0.5) * 0.1 - 0.5) + (hash01(x, y, 1610) - 0.5) * 0.004, b = Math.abs(thin.at(X) - 0.5);
      if (a < 0.015 * k) {
        const core = a < 0.006 * k;
        c = core ? VEIN[1] : VEIN[0];
        if (glow) glow[i] = rgba(core ? VEIN[2] : VEIN[1]);
      } else if (b < 0.008 && m < 0.3) c = VEIN[0];
      if (hash01(x, y, 1609) < 0.00012) c = RED[1];
      out[i] = rgba(c);
    }
  }
}

/** A piece that stands up from the ground: `ht` is how high each pixel is
 * (0..1), which sets how long its shadow is there. */
export type Tall = Piece & Img & { ht: Float32Array };
export function tall(w: number, h: number, ax: number, ay: number, glows = false): Tall {
  const p = piece(w, h, ax, ay, glows);
  return Object.assign(p, { ht: new Float32Array(p.w * p.h) });
}
export const setTall = (p: Tall, x: number, y: number, c: number, ht = 0, glow = 0) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
  const i = y * p.w + x;
  p.px[i] = rgba(c);
  p.ht[i] = ht;
  if (p.glow) p.glow[i] = glow ? rgba(glow) : 0;
};

/** Stands `p` with its foot at art pixel (x, y) of `img` (and its light in
 * `glow`): first its shadow, thrown `len` pixels (times each pixel's
 * height, plus one) toward (`sx`, `sy`), then its outline (while scenery
 * outlines are on), then the piece itself; only on pixels `ok` allows. */
export function standToward(img: Img, glow: Img | null, p: Tall, x: number, y: number, ok: (X: number, Y: number) => boolean, sx: number, sy: number, len: number, dark = 0.38) {
  const x0 = Math.round(x) - p.ax, y0 = Math.round(y) - p.ay, ink = sceneryOutlinesOn() ? rgba(INK) : 0;
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < p.w && j < p.h ? p.px[j * p.w + i] : 0);
  const shade = new Set<number>();
  for (let j = 0; j < p.h; j++)
    for (let i = 0; i < p.w; i++) {
      const k = j * p.w + i;
      if (!p.px[k]) continue;
      const L = 1 + p.ht[k] * len;
      for (let s = 1; s <= L; s++) {
        const X = x0 + i + Math.round(sx * s), Y = y0 + j + Math.round(sy * s);
        if (X >= 0 && Y >= 0 && X < img.w && Y < img.h && !at(X - x0, Y - y0)) shade.add(Y * img.w + X);
      }
    }
  for (const q of shade) {
    const X = q % img.w, Y = (q - X) / img.w;
    if (ok(X, Y)) img.px[q] = darken(img.px[q], (X + Y) & 1 ? dark : dark + 0.08);
  }
  for (let j = -1; j <= p.h; j++)
    for (let i = -1; i <= p.w; i++) {
      const X = x0 + i, Y = y0 + j;
      if (X < 0 || Y < 0 || X >= img.w || Y >= img.h || !ok(X, Y)) continue;
      const q = Y * img.w + X, v = at(i, j);
      if (v) {
        img.px[q] = v;
        if (glow) glow.px[q] = p.glow?.[j * p.w + i] ?? 0;
      } else if (ink && (at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1))) {
        img.px[q] = ink;
        if (glow) glow.px[q] = 0;
      }
    }
}

/** A black pyramid seen from above: four faces, the north and west lit,
 * a bright edge up the north-west ridge, faint red runes carved in its
 * faces and a red light at its point. */
export function pyramidPiece(py: Pyramid): Tall {
  const S = Math.max(9, Math.round(py.r * ART * 2)), half = S / 2, p = tall(S, S, Math.floor(S / 2), Math.floor(S / 2), true);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const dx = i + 0.5 - half, dy = j + 0.5 - half, ax = Math.abs(dx), ay = Math.abs(dy);
      const ht = 1 - Math.max(ax, ay) / half;
      let tone = ax >= ay ? (dx < 0 ? 3 : 1) : dy < 0 ? 4 : 0;
      if (Math.abs(ax - ay) < 0.6) tone = dx < 0 && dy < 0 ? 5 : dx < 0 || dy < 0 ? 2 : 0;
      tone = Math.max(0, Math.min(5, tone + (bayer(i, j) - 0.5 > 0.3 && tone > 0 && tone < 5 ? -1 : 0)));
      let c = STONE[tone], g = 0;
      if (ht > 0.15 && ht < 0.75 && Math.abs(ax - ay) > 1.2 && hash(py.seed, i, j, 1514) % 14 === 0) { c = RED[0]; g = RED[0]; }
      setTall(p, p.ax - Math.floor(half) + i, p.ay - Math.floor(half) + j, c, ht, g);
    }
  const m = Math.floor(half) - 1;
  for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) setTall(p, p.ax - Math.floor(half) + m + i, p.ay - Math.floor(half) + m + j, i + j === 0 ? RED[2] : RED[1], 1, RED[2]);
  return p;
}

/** A flight of stairs from above, climbing toward its `dir`: each tread
 * lighter than the one below, its front edge catching the light and the
 * step above shading its back; or, sinking, each darker into the black,
 * a red light at the bottom. */
export function stairPiece(s: Stair): Tall {
  const D = 4, L = s.steps * D, Wd = 11 + (s.seed % 3), side = s.dir % 2 === 1;
  const w = side ? L : Wd, h = side ? Wd : L, p = tall(w, h, Math.floor(w / 2), Math.floor(h / 2), s.sinks);
  for (let j = 0; j < L; j++)
    for (let i = 0; i < Wd; i++) {
      // Canonical: climbing toward the top (row 0 the highest step).
      const k = Math.floor((L - 1 - j) / D), row = j % D, f = s.steps > 1 ? k / (s.steps - 1) : 1;
      let tone: number, glow = 0;
      if (s.sinks) {
        tone = Math.round(4 - f * 4.4);
        if (row === D - 1) tone += 1;
        if (k === s.steps - 1 && row < 2) { tone = -1; glow = RED[0]; }
      } else {
        tone = 1 + Math.round(f * 3);
        if (row === D - 1) tone += 1;
        else if (row === 0 && k < s.steps - 1) tone -= 1;
      }
      const edge = i === 0 ? -1 : i === Wd - 1 ? 1 : 0;
      // Turned into place: dir 0 climbs up, 1 right, 2 down, 3 left.
      const [X, Y] = s.dir === 0 ? [i, j] : s.dir === 1 ? [L - 1 - j, i] : s.dir === 2 ? [Wd - 1 - i, L - 1 - j] : [j, Wd - 1 - i];
      // The side rails, lit on whichever side faces the upper left.
      if (edge) tone = (side ? Y < h / 2 : X < w / 2) ? 4 : 0;
      const c = tone < 0 ? RED[0] : STONE[Math.max(0, Math.min(5, tone))];
      setTall(p, p.ax - Math.floor(w / 2) + X, p.ay - Math.floor(h / 2) + Y, c, s.sinks ? 0 : (k + 1) / s.steps, glow);
    }
  return p;
}

/** A trapdoor lying in the open: an iron frame round planks bound with
 * iron, a ring to lift it by, ajar along one edge with red light there. */
export function doorPiece(d: Trapdoor): Tall {
  const cw = 12, ch = 16, w = d.turned ? ch : cw, h = d.turned ? cw : ch, p = tall(w, h, Math.floor(w / 2), Math.floor(h / 2), true);
  for (let j = 0; j < ch; j++)
    for (let i = 0; i < cw; i++) {
      let c: number, g = 0;
      if (i === 0 || j === 0 || i === cw - 1 || j === ch - 1) c = i === 0 || j === 0 ? IRON[2] : IRON[1];
      else if (j === ch - 2) { c = i % 3 === 1 ? RED[2] : RED[1]; g = RED[2]; }
      else if (j === 3 || j === ch - 6) c = i === 1 || i === cw - 2 ? IRON[3] : IRON[1];
      else if (i % 3 === 0) c = WOOD[0];
      else c = hash(d.seed, i, j, 1534) % 7 === 0 ? WOOD[1] : WOOD[(i % 3 === 1 ? 3 : 2) - ((i / 3) | 0) % 2];
      const [X, Y] = d.turned ? [j, cw - 1 - i] : [i, j];
      setTall(p, p.ax - Math.floor(w / 2) + X, p.ay - Math.floor(h / 2) + Y, c, 0.15, g);
    }
  // The ring.
  const rx = d.turned ? 8 : 8, ry = d.turned ? 4 : 8;
  for (const [i, j] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) setTall(p, p.ax - Math.floor(w / 2) + rx + i, p.ay - Math.floor(h / 2) + ry + j, IRON[3], 0.2);
  return p;
}

/** An eye `r` cells across from its middle to a corner, `open` (0..1),
 * looking (`lx`, `ly`, -1..1): its pixels in a `w` × `h` buffer, the eye's
 * middle at (`ax`, `ay`), and its light (the iris) apart. Shut, it is lids
 * meeting in a dark slit; open, a pale eye, red veined, with a red iris and
 * a slit pupil. */
export function eyePixels(r: number, open: number, lx: number, ly: number, seed: number) {
  const R = Math.max(3, Math.round(r * ART)), Hh = Math.max(2, R * 0.55), w = 2 * R + 3, h = Math.ceil(Hh) * 2 + 3, ax = R + 1, ay = Math.ceil(Hh) + 1;
  const px = new Uint32Array(w * h), glow = new Uint32Array(w * h);
  const irisR = Math.max(1.6, R * 0.48), ix = lx * R * 0.4, iy = ly * Hh * 0.3;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = i + 0.5 - ax, y = j + 0.5 - ay, edge = Hh * (1 - (x / R) ** 2);
      if (edge <= 0) continue;
      const ay2 = Math.abs(y);
      if (ay2 > edge + 1) continue;
      const q = j * w + i;
      // The lid's rim round the socket.
      if (ay2 > edge) { px[q] = rgba(y < 0 ? LID[1] : LID[0]); continue; }
      const gap = edge * open;
      if (ay2 >= gap) {
        // The lids, the top one lit, meeting in a dark slit.
        px[q] = rgba(open < 0.2 && ay2 < 0.75 ? INK : y < 0 ? (ay2 > edge - 1 ? LID[1] : LID[2]) : LID[1]);
        continue;
      }
      const d = Math.hypot(x - ix, (y - iy) * 1.15);
      if (d < irisR) {
        const pupil = Math.abs(x - ix) < 0.75 && Math.abs(y - iy) < irisR * 0.95;
        const shine = Math.round(x - ix + irisR * 0.45) === 0 && Math.round(y - iy + irisR * 0.45) === 0;
        px[q] = rgba(pupil ? INK : shine ? 0xffd8c8 : d > irisR - 1 ? IRIS[0] : IRIS[1]);
        if (!pupil) glow[q] = rgba(shine ? IRIS[2] : IRIS[1]);
        continue;
      }
      const veined = hash(seed, i, j, 1548) % 9 === 0 && Math.abs(x) > R * 0.45;
      px[q] = rgba(veined ? RED[0] : ay2 > gap - 1 || x > R * 0.5 ? SCLERA[0] : SCLERA[1]);
    }
  return { px, glow, w, h, ax, ay };
}

/** A rift torn in the ground at art offset (ox, oy) of `img`: black void
 * down its middle with faint red stars and nebula in it, a lip glowing red
 * hot, scorched ground round it, narrowing at each end. */
export function paintRift(img: Img, glow: Img | null, r: Rift, ox: number, oy: number, ok: (X: number, Y: number) => boolean = () => true) {
  const cx = r.x * ART + ox, cy = r.y * ART + oy, ca = Math.cos(r.angle), sa = Math.sin(r.angle);
  const half = (r.len * ART) / 2, wide = (r.w * ART) / 2, reach = half + 3;
  for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++)
    for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h || !ok(x, y)) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      const f = u / half;
      if (Math.abs(f) >= 1.15) continue;
      const hw = wide * Math.max(0, 1 - f * f) ** 0.7 * (0.75 + 0.5 * wash(u + 40, 0, 4, r.seed % 9973)), d = Math.abs(v) + (hash01(x, y, r.seed % 9973) - 0.5) * 0.8;
      const q = y * img.w + x;
      if (d < hw - 1.2) {
        const s = hash01(x, y, 1506);
        img.px[q] = rgba(s < 0.004 ? RED[2] : s < 0.02 ? VOID[5] : wash(x, y, 5, r.seed % 9973) > 0.62 ? VOID[3] : VOID[0]);
        if (glow && s < 0.004) glow.px[q] = rgba(RED[1]);
      } else if (d < hw) {
        const hot = d < hw - 0.6;
        img.px[q] = rgba(hot ? LIP[2] : LIP[1]);
        if (glow) glow.px[q] = rgba(hot ? RED[2] : LIP[1]);
      } else if (d < hw + 1.2 && hw > 0.4) {
        img.px[q] = rgba(d < hw + 0.6 ? LIP[0] : SCORCH);
        if (glow) glow.px[q] = rgba(LIP[0]);
      } else if (d < hw + 2.4 && hw > 0.4 && (x + y) & 1) img.px[q] = darken(img.px[q], 0.6);
    }
}

/** An eye's socket baked into the ground: its rim, so the live eye
 * (`NadirArt.drawLive`) sits in it. */
function paintSocket(img: Img, e: GroundEye, ok: (X: number, Y: number) => boolean) {
  const R = Math.max(3, Math.round(e.r * ART)), Hh = Math.max(2, R * 0.55), cx = Math.round(e.x * ART), cy = Math.round(e.y * ART);
  for (let y = Math.floor(cy - Hh - 3); y <= Math.ceil(cy + Hh + 3); y++)
    for (let x = cx - R - 3; x <= cx + R + 3; x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h || !ok(x, y)) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, edge = (Hh + 2) * (1 - (dx / (R + 2)) ** 2);
      if (edge > 0 && Math.abs(dy) < edge) img.px[y * img.w + x] = darken(img.px[y * img.w + x], 0.6);
    }
}

/** The floor and its glowing pixels, a stage (or a slice of rows) a step:
 * the ground over every open cell, the rifts and sockets in it, then the
 * pieces back to front. */
export function* nadirFloorSteps(plan: NadirPlan): Generator<void, { floor: Uint32Array; glow: Uint32Array }, void> {
  const img: Img = { px: new Uint32Array(W * H), w: W, h: H }, glow: Img = { px: new Uint32Array(W * H), w: W, h: H };
  const ok = (x: number, y: number) => plan.open[Math.floor(y / ART) * CELLS_W + Math.floor(x / ART)] === 1;
  yield* fillVoidstone(img.px, W, H, 0, 0, ok, 16, glow.px);
  for (const r of plan.rifts) paintRift(img, glow, r, 0, 0, ok);
  yield;
  for (const e of plan.eyes) paintSocket(img, e, ok);
  for (const it of nadirItems(plan)) it.draw(img, glow, 0, 0, ok);
  yield;
  return { floor: img.px, glow: glow.px };
}

type Item = { y: number; draw: (img: Img, glow: Img | null, ox: number, oy: number, ok: (X: number, Y: number) => boolean) => void };
/** The standing pieces back to front, each with its shadow: the pyramids'
 * cast toward the light (up and left), the rest away from it. */
export function nadirItems(plan: Pick<NadirPlan, "pyramids" | "stairs" | "doors">): Item[] {
  return [
    ...plan.pyramids.map((py) => ({ y: py.y, draw: (img: Img, glow: Img | null, ox: number, oy: number, ok: (X: number, Y: number) => boolean) => {
      const p = pyramidPiece(py);
      standToward(img, glow, p, py.x * ART + ox, py.y * ART + oy, ok, -0.75, -0.66, p.w * 0.9);
    } })),
    ...plan.stairs.map((s) => ({ y: s.y, draw: (img: Img, glow: Img | null, ox: number, oy: number, ok: (X: number, Y: number) => boolean) => {
      standToward(img, glow, stairPiece(s), s.x * ART + ox, s.y * ART + oy, ok, 0.7, 0.7, 6);
    } })),
    ...plan.doors.map((d) => ({ y: d.y, draw: (img: Img, glow: Img | null, ox: number, oy: number, ok: (X: number, Y: number) => boolean) => {
      standToward(img, glow, doorPiece(d), d.x * ART + ox, d.y * ART + oy, ok, 0.7, 0.7, 1);
    } })),
  ].sort((a, b) => a.y - b.y);
}

/** A hovering stone from above: a lumpy rock shaded from the upper left. */
export function floaterPixels(f: Floater, turn: number) {
  const R = f.r * ART, S = Math.ceil(R * 1.5) * 2 + 2, c = S / 2, px = new Uint32Array(S * S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const dx = i + 0.5 - c, dy = j + 0.5 - c;
      let tone: number;
      if (f.cube) {
        // A perfect cube, turning: its top face, bevelled, the edges facing
        // the upper left lit.
        const ct = Math.cos(turn), st = Math.sin(turn), u = dx * ct + dy * st, v = -dx * st + dy * ct, s = R;
        if (Math.abs(u) >= s || Math.abs(v) >= s) continue;
        const eu = Math.abs(u) > s - 1.1, ev = Math.abs(v) > s - 1.1;
        if (!eu && !ev) { tone = Math.abs(u) < 1.1 && Math.abs(v) < 1.1 ? -1 : Math.abs(Math.abs(u) - s * 0.5) < 0.5 && Math.abs(v) < s * 0.5 ? -2 : 2; }
        else {
          const nx = eu ? Math.sign(u) * ct : -Math.sign(v) * st, ny = eu ? Math.sign(u) * st : Math.sign(v) * ct;
          const lit = -(nx * 0.6 + ny * 0.8);
          tone = lit > 0.3 ? 5 : lit < -0.3 ? 0 : 3;
        }
      } else {
        const n = (hash01(i >> 1, j >> 1, f.seed % 9973) - 0.5) * 0.3, d = Math.hypot(dx, dy) / R + n;
        if (d >= 1) continue;
        const lit = -(dx * 0.6 + dy * 0.8) / R + Math.sqrt(1 - d * d) * 0.6 + (bayer(i, j) - 0.5) * 0.4;
        tone = Math.max(0, Math.min(5, Math.round(1.8 + lit * 2.4)));
        // A red crack across it.
        if (d < 0.8 && Math.abs(wash(i, j, 4, f.seed % 9973) - 0.5) < 0.04) tone = -1;
      }
      px[j * S + i] = rgba(tone === -1 ? RED[1] : tone === -2 ? RED[0] : STONE[tone]);
    }
  return { px, w: S, h: S, ax: Math.floor(c), ay: Math.floor(c) };
}

function canvasOf(pixels: Uint32Array, w: number, h: number) {
  const cv = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = cv.getContext("2d")!, img = ctx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(pixels);
  ctx.putImageData(img, 0, 0);
  return cv;
}
/** `pixels` as a canvas, every pixel black at its own opacity (a shadow). */
function silhouette(pixels: Uint32Array, w: number, h: number) {
  const out = new Uint32Array(pixels.length);
  for (let i = 0; i < out.length; i++) if (pixels[i]) out[i] = 0xff000000;
  return canvasOf(out, w, h);
}

export type NadirLiveFrame = { now: number; alpha: number; still: boolean; walkers: readonly { x: number; y: number }[] };
export type NadirGlowOptions = { now: number; alpha: number; still: boolean; night: number; effects: boolean };

/** How many turns a cube's look is cut into. */
const TURNS = 24;

export class NadirArt {
  private map: CityMap | null = null;
  plan: NadirPlan | null = null;
  private floor: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private halo: HTMLCanvasElement | null = null;
  private ink = true;
  private painting: { plan: NadirPlan; steps: Generator<void, { floor: Uint32Array; glow: Uint32Array }, void> } | null = null;
  /** Each eye's looks by state, and each floater's (a cube's by turn). */
  private eyeLooks = new Map<string, { look: HTMLCanvasElement; light: HTMLCanvasElement; ax: number; ay: number }>();
  private floatLooks = new Map<string, { look: HTMLCanvasElement; shadow: HTMLCanvasElement; ax: number; ay: number }>();
  /** How open each eye was when last drawn, for its glow. */
  private eyesNow: { open: number; key: string }[] = [];

  /** Plans `map`'s ground (and repaints it) when the map changes, or when
   * scenery outlines are turned on or off. */
  sync(map: CityMap) {
    const ink = sceneryOutlinesOn();
    if (map === this.map && ink === this.ink) return;
    this.map = map;
    this.ink = ink;
    this.plan = nadirPlan(map);
    this.floor = this.glow = null;
    this.painting = null;
    this.eyesNow = [];
  }

  /** Plans `map`'s ground and paints, for about `ms`, its floor ahead of a
   * battle crossing into it; whether any is left. */
  prepare(map: CityMap, ms: number) {
    if (typeof document === "undefined") return false;
    this.sync(map);
    if (this.floor) return false;
    const end = performance.now() + ms, plan = this.plan!;
    if (this.painting?.plan !== plan) this.painting = { plan, steps: nadirFloorSteps(plan) };
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
      const steps = this.painting?.plan === this.plan ? this.painting.steps : nadirFloorSteps(this.plan);
      for (;;) { const r = steps.next(); if (r.done) { this.set(r.value); break; } }
    }
    return !!this.floor;
  }

  /** The ground over the open cells. */
  drawFloor(c: CanvasRenderingContext2D, px: number, alpha: number) {
    if (!this.plan || alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= alpha;
    c.drawImage(this.floor!, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
  }

  /** The eyes, watching and blinking, and the floaters with their shadows. */
  drawLive(c: CanvasRenderingContext2D, px: number, f: NadirLiveFrame) {
    const plan = this.plan;
    if (!plan || f.alpha <= 0 || typeof document === "undefined") return;
    const t = f.now / 1000, k = px / ART;
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= f.alpha;
    const blit = (cv: HTMLCanvasElement, X: number, Y: number) => c.drawImage(cv, X * k, Y * k, cv.width * k, cv.height * k);
    this.eyesNow = plan.eyes.map((e, n) => {
      const look = eyeLook(e, f.still ? 0 : t, f.walkers), open = f.still ? (look.near < NADIR.flinch ? 0 : 1) : eyeOpen(e, t, look.near);
      const step = Math.round(open * 4), lx = Math.round(look.x * 2) / 2, ly = Math.round(look.y * 2) / 2, key = `${n}:${step}:${lx}:${ly}`;
      let s = this.eyeLooks.get(key);
      if (!s) {
        const p = eyePixels(e.r, step / 4, lx, ly, e.seed);
        s = { look: canvasOf(p.px, p.w, p.h), light: canvasOf(p.glow, p.w, p.h), ax: p.ax, ay: p.ay };
        this.eyeLooks.set(key, s);
      }
      blit(s.look, Math.round(e.x * ART) - s.ax, Math.round(e.y * ART) - s.ay);
      return { open: step / 4, key };
    });
    for (const fl of plan.floaters) {
      const at = floatAt(fl, f.still ? 0 : t), turn = fl.cube ? Math.round((((at.turn % 6.2832) + 6.2832) % 6.2832) / 6.2832 * TURNS) % TURNS : 0;
      const key = `${fl.seed}:${turn}`;
      let s = this.floatLooks.get(key);
      if (!s) {
        const p = floaterPixels(fl, (turn / TURNS) * Math.PI * 2);
        s = { look: canvasOf(p.px, p.w, p.h), shadow: silhouette(p.px, p.w, p.h), ax: p.ax, ay: p.ay };
        this.floatLooks.set(key, s);
      }
      // Its shadow thrown its own way, further the higher it floats.
      const X = Math.round(at.x * ART) - s.ax, Y = Math.round(at.y * ART) - s.ay, reach = at.lift * ART * 0.7;
      c.globalAlpha = f.alpha * 0.45;
      blit(s.shadow, X + Math.round(Math.cos(fl.angle) * reach), Y + Math.round(Math.sin(fl.angle) * reach));
      c.globalAlpha = f.alpha;
      blit(s.look, X, Y - Math.round(at.lift * 3));
    }
    c.restore();
  }

  /** What glows, over the battle's darkness: the veins and the rifts beating
   * like a heart, halos, motes spiralling into the rifts, ash falling
   * upward, the eyes' irises. */
  drawGlow(c: CanvasRenderingContext2D, px: number, o: NadirGlowOptions) {
    const plan = this.plan;
    if (!plan || o.alpha <= 0 || typeof document === "undefined" || !this.ready()) return;
    this.halo ??= haloSprite(HALO);
    const t = o.still ? 0 : o.now / 1000, base = c.globalAlpha * o.alpha, night = Math.max(0, Math.min(1, o.night));
    const beat = o.still ? 0.5 : heartbeat(t);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.imageSmoothingEnabled = false;
    c.globalAlpha = Math.min(1, base * (0.2 + 0.5 * night) * (0.5 + 0.5 * beat));
    c.drawImage(this.glow!, 0, 0, CELLS_W * px, CELLS_H * px);
    c.imageSmoothingEnabled = true;
    const halo = (x: number, y: number, r: number, k: number) => {
      c.globalAlpha = Math.min(1, base * k * (0.25 + 0.75 * night) * (0.6 + 0.4 * beat));
      const s = r * px * 2;
      c.drawImage(this.halo!, x * px - s / 2, y * px - s / 2, s, s);
    };
    for (const r of plan.rifts) halo(r.x, r.y, r.len * 0.9, 0.9);
    for (const d of plan.doors) halo(d.x, d.y, 1.6, 0.6);
    for (const p of plan.pyramids) halo(p.x, p.y, 0.8, 0.5);
    // A dull red light under each floater, as if it hung on it.
    for (const fl of plan.floaters) {
      const at = floatAt(fl, t);
      halo(at.x, at.y, fl.r * 2.2, 0.35);
    }
    c.imageSmoothingEnabled = false;
    // The eyes' irises, as open as they were drawn.
    const k = px / ART;
    plan.eyes.forEach((e, n) => {
      const now = this.eyesNow[n], s = now && this.eyeLooks.get(now.key);
      if (!s || now.open <= 0) return;
      c.globalAlpha = Math.min(1, base * (0.35 + 0.65 * night));
      c.drawImage(s.light, (Math.round(e.x * ART) - s.ax) * k, (Math.round(e.y * ART) - s.ay) * k, s.light.width * k, s.light.height * k);
    });
    if (o.effects && !o.still) {
      const dot = artPen(c, px);
      // Motes drawn down into the rifts.
      for (const r of plan.rifts)
        for (let m = 0; m < NADIR.motes; m++) {
          const s = moteAt(r, m, t);
          if (s.show <= 0.04) continue;
          c.globalAlpha = Math.min(1, base * s.show * 0.9);
          c.fillStyle = m % 3 ? "#c0242c" : "#ff6a50";
          dot(Math.floor(s.x * ART), Math.floor(s.y * ART));
        }
      // Ash falling upward off the ground.
      c.fillStyle = "#7a1a20";
      for (let a = 0; a < 36; a++) {
        const u = (salt: number) => hash01(a, salt);
        const life = 7 + u(1581) * 6, age = (t / life + u(1582)) % 1, round = Math.floor(t / life + u(1582));
        const x = hash01(a, round, 1583) * CELLS_W, y0 = hash01(a, round, 1584) * CELLS_H;
        const ci = Math.floor(y0) * CELLS_W + Math.floor(x);
        if (!plan.open[ci]) continue;
        c.globalAlpha = Math.min(1, base * Math.sin(age * Math.PI) * 0.7);
        dot(Math.floor((x + Math.sin(t * 0.8 + a) * 0.15) * ART), Math.floor((y0 - age * 2.5) * ART));
      }
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- the wilds

/** The pieces of the Nadir's ground floating out in the void past the
 * field, and what stands on them, as `voidWildsSteps` paints them. */
export type VoidIsle = { x: number; y: number; r: number; seed: number };
export type VoidWilds = { isles: VoidIsle[]; rifts: Rift[]; pyramids: Pyramid[]; stairs: Stair[]; doors: Trapdoor[]; eyes: (GroundEye & { open: number })[] };

/** Plans the floating pieces of ground in the wilds, `margin` cells past
 * every edge: more of them, and bigger, further out. */
export function voidWilds(margin: number): VoidWilds {
  const out: VoidWilds = { isles: [], rifts: [], pyramids: [], stairs: [], doors: [], eyes: [] };
  const off = (x: number, y: number) => { const dx = x < 0 ? -x : x > CELLS_W ? x - CELLS_W : 0, dy = y < 0 ? -y : y > CELLS_H ? y - CELLS_H : 0; return Math.hypot(dx, dy); };
  for (let cy = -margin; cy < CELLS_H + margin; cy++)
    for (let cx = -margin; cx < CELLS_W + margin; cx++) {
      const x = cx + 0.5, y = cy + 0.5, d = off(x, y);
      if (d < 8) continue;
      const u = hash01(cx, cy, 1611), seed = hash(cx, cy, 1612);
      const big = u < 0.0018, r = big ? 1.6 + hash01(cx, cy, 1613) * 2.6 : 0.35 + hash01(cx, cy, 1613) * 0.8;
      if (!big && u >= 0.009) continue;
      if (off(x, y) - r < 6) continue;
      if (out.isles.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + r + 2.5) ** 2)) continue;
      out.isles.push({ x, y, r, seed });
      if (!big || r < 2.2) continue;
      // Something on it.
      const kind = seed % 5;
      if (kind === 0) out.pyramids.push({ x, y, r: 0.8 + hash01(seed, 1614) * 0.3, seed });
      else if (kind === 1) out.stairs.push(stairAt(x, y, seed));
      else if (kind === 2) out.rifts.push(riftAt(x, y, Math.min(r * 1.2, 3), seed));
      else if (kind === 3) out.eyes.push({ x, y, r: 0.7 + hash01(seed, 1615) * 0.4, seed, open: hash01(seed, 1616) < 0.6 ? 1 : 0 });
      else out.doors.push({ x, y, r: 0.95, seed, turned: hash01(seed, 1617) < 0.5 });
    }
  return out;
}

/** The void round the field into `out` (and its light into `glow`), a
 * `gw` by `gh` buffer with the board's corner at (`ox`, `oy`) and the
 * board `bw` by `bh` pixels, `margin` cells round it: the field's ground
 * carried on a ragged way past its edge, then breaking off, with banded
 * rock hanging under every edge that faces down; pieces of the ground
 * floating out in the void, some with a pyramid, stairs, a rift, a trapdoor
 * or an eye on them; and the void itself, black with slow clouds of dark
 * red and the odd red star. */
export function* voidWildsSteps(out: Uint32Array, glow: Uint32Array, gw: number, gh: number, ox: number, oy: number, bw: number, bh: number, margin: number, slice: number): Generator<void, void, void> {
  const onBoard = (X: number, Y: number) => X >= ox && Y >= oy && X < ox + bw && Y < oy + bh;
  // Which pixels are ground: 1 the field's own carried on, 2 a floating piece.
  const land = new Uint8Array(gw * gh);
  {
    const rim = washer(gw, -ox, 7 * ART, 1621), rough = washer(gw, -ox, 2 * ART, 1622);
    for (let Y = 0; Y < gh; Y++, Y % slice || (yield)) {
      rim.row(Y - oy); rough.row(Y - oy);
      const dy = Y < oy ? oy - Y : Y >= oy + bh ? Y - oy - bh + 1 : 0;
      for (let X = 0; X < gw; X++) {
        const dx = X < ox ? ox - X : X >= ox + bw ? X - ox - bw + 1 : 0;
        if (!dx && !dy) { land[Y * gw + X] = 1; continue; }
        const d = Math.hypot(dx, dy) / ART;
        if (d > 10) continue;
        if (d < 0.8 + rim.at(X) * 7 + rough.at(X) * 1.2) land[Y * gw + X] = 1;
      }
    }
  }
  const plan = voidWilds(margin);
  for (const s of plan.isles) {
    const R = s.r * ART, cx = s.x * ART + ox, cy = s.y * ART + oy;
    for (let Y = Math.max(0, Math.floor(cy - R * 1.3)); Y < Math.min(gh, Math.ceil(cy + R * 1.3)); Y++)
      for (let X = Math.max(0, Math.floor(cx - R * 1.3)); X < Math.min(gw, Math.ceil(cx + R * 1.3)); X++) {
        const rr = R * (0.75 + 0.5 * wash(X, Y, Math.max(3, R * 0.6), s.seed % 9973));
        if ((X + 0.5 - cx) ** 2 + ((Y + 0.5 - cy) * 1.15) ** 2 < rr * rr) land[Y * gw + X] = 2;
      }
  }
  yield;
  // The rock hanging under each edge that faces down: as deep as the ground
  // above it runs (so a small piece hangs to a point), at most a jagged
  // depth that wanders along the edge.
  const under = new Uint8Array(gw * gh), depthAt = new Uint16Array(gw * gh);
  for (let X = 0; X < gw; X++, X % (slice * 4) || (yield)) {
    let run = 0, left = 0, top = 0;
    const most = ART * (2.2 + 5 * wash(X, 0, 26, 1623)) + (hash01(X >> 1, 1624) - 0.5) * 8 + (hash01(X >> 2, 1625) < 0.12 ? ART * 1.5 * hash01(X >> 2, 1626) : 0);
    for (let Y = 0; Y < gh; Y++) {
      const i = Y * gw + X;
      if (land[i]) { run++; left = 0; continue; }
      if (run) { left = Math.max(2, Math.min(run * 0.9, most)); top = Y; run = 0; }
      if (left > 0 && Y - top < left) { under[i] = 1; depthAt[i] = Math.min(65535, Math.round(((Y - top) / left) * 1000)); }
      else left = 0;
    }
  }
  // The void, then the hanging rock, then the ground.
  const neb = washer(gw, 0, 220, 1631), mid = washer(gw, 0, 80, 1632), wisp = washer(gw, 0, 30, 1633), band = washer(gw, 0, 9, 1634);
  for (let Y = 0; Y < gh; Y++, Y % slice || (yield)) {
    neb.row(Y); mid.row(Y); wisp.row(Y); band.row(Y);
    for (let X = 0; X < gw; X++) {
      const i = Y * gw + X;
      if (land[i] || onBoard(X, Y)) continue;
      if (under[i]) {
        const q = depthAt[i] / 1000, strata = Math.floor((Y + band.at(X) * 6) / 3) & 1;
        let tone = Math.round(4 - q * 3.6 + (strata ? 0 : -0.5) + (hash01(X >> 1, 1627) - 0.5) * 1.2 + (bayer(X, Y) - 0.5) * 0.8);
        if (!under[i - 1]) tone += 1; else if (X + 1 < gw && !under[i + 1]) tone -= 1;
        if (q < 0.06) tone = 0;
        let c = UNDER[Math.max(0, Math.min(UNDER.length - 1, tone))];
        if (q > 0.12 && hash01(X, Y, 1635) < 0.012) { c = RED[0]; glow[i] = rgba(RED[1]); }
        out[i] = rgba(c);
        continue;
      }
      const n = neb.at(X) * 0.55 + mid.at(X) * 0.3 + wisp.at(X) * 0.15, fil = Math.abs(wisp.at(X) - 0.5) < 0.025 && n > 0.5 ? 0.6 : 0;
      const tone = Math.max(0, Math.min(VOID.length - 1, Math.floor((n - 0.47) * 16 + fil + (bayer(X, Y) - 0.5) * 0.9)));
      const s = hash01(X, Y, 1636);
      out[i] = rgba(s < 0.00012 ? 0xe07070 : s < 0.0007 ? 0x6a2a2c : VOID[tone]);
      if (s < 0.00012) glow[i] = rgba(RED[1]);
    }
  }
  // The ground on the land, a function of board coordinates as on the field.
  const offField = (X: number, Y: number) => !onBoard(X, Y);
  const ground = (X: number, Y: number) => land[Y * gw + X] > 0 && offField(X, Y);
  yield* fillVoidstone(out, gw, gh, ox, oy, ground, slice, glow);
  // Each piece's edge where it breaks off, darkened.
  for (let Y = 1; Y < gh - 1; Y++, Y % (slice * 4) || (yield))
    for (let X = 1; X < gw - 1; X++) {
      const i = Y * gw + X;
      if (!land[i] || onBoard(X, Y)) continue;
      if (!land[i + gw] || !land[i - 1] || !land[i + 1] || !land[i - gw]) out[i] = rgba(!land[i - gw] || !land[i - 1] ? UNDER[3] : INK);
    }
  const img: Img = { px: out, w: gw, h: gh }, light: Img = { px: glow, w: gw, h: gh };
  for (const r of plan.rifts) paintRift(img, light, r, ox, oy, ground);
  for (const it of nadirItems(plan)) it.draw(img, light, ox, oy, ground);
  // The eyes out there, never blinking, looking at the field.
  for (const e of plan.eyes) {
    const dx = CELLS_W / 2 - e.x, dy = CELLS_H / 2 - e.y, d = Math.hypot(dx, dy) || 1;
    const p = eyePixels(e.r, e.open, dx / d, dy / d, e.seed), X0 = Math.round(e.x * ART) + ox - p.ax, Y0 = Math.round(e.y * ART) + oy - p.ay;
    for (let j = 0; j < p.h; j++)
      for (let i = 0; i < p.w; i++) {
        const v = p.px[j * p.w + i], X = X0 + i, Y = Y0 + j;
        if (!v || X < 0 || Y < 0 || X >= gw || Y >= gh || !ground(X, Y)) continue;
        out[Y * gw + X] = v;
        glow[Y * gw + X] = p.glow[j * p.w + i];
      }
  }
}
