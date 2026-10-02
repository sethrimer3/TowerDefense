/** Damage and rubble for DEFEND's pixel art: what a structure, house or
 * wall stone looks like below 75%, 50% and 25% of its hit points, and the
 * rubble left when it falls (the keep has its own, `structure-art.ts`).
 *
 * Every sprite is a `W × H` buffer of little-endian RGBA at `ART` pixels a
 * cell. Damage is painted over the whole sprite stage by stage, each stage
 * seeded from the building and adding to the one before: cracks, chipped
 * edges and soot, then holes and scorching, then a caved-in hole with
 * embers and fallen stone. It only repaints drawn pixels, so a damaged
 * building covers exactly what it covered whole. Presentation only: pure,
 * and seeded by hashing, never from a random stream. */
import { hash, hash01 } from "./grid.ts";

export const OUTLINE = 0x0b0907;
export const HOLE = 0x15110e;
const SOOT = 0x2e2925;
const RAFTER = [0x3e2a18, 0x6a4728];
const EMBER = [0xc8542a, 0xf0a040];
/** Fallen stone, dark to lit. */
export const STONE = [0x5f5a51, 0x8f897d, 0xb7b0a2];

/** A building's damage stage at `hp` of `max` hit points: 0 from 75% up,
 * then 1, 2 and 3 below 75%, 50% and 25%. (Rubble is for a fallen one.) */
export function damageStage(hp: number, max: number) {
  const f = max > 0 ? hp / max : 1;
  return f >= 0.75 ? 0 : f >= 0.5 ? 1 : f >= 0.25 ? 2 : 3;
}

/** Opaque little-endian RGBA for 0xRRGGBB, at `alpha`. */
export const rgba = (c: number, alpha = 255) => ((alpha << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** `c` darkened (or lightened) by `f`. */
export function shade(c: number, f: number) {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 0xff) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A pixel buffer being painted: `get` reads 0xRRGGBB, -1 where empty. */
export type Pix = {
  w: number;
  h: number;
  out: Uint32Array;
  set: (x: number, y: number, c: number) => void;
  get: (x: number, y: number) => number;
};

export function pixels(out: Uint32Array, w: number, h: number): Pix {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  return {
    w,
    h,
    out,
    set: (x, y, c) => {
      if (inside(x, y)) out[y * w + x] = rgba(c);
    },
    get: (x, y) => {
      if (!inside(x, y) || !out[y * w + x]) return -1;
      const v = out[y * w + x];
      return ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
    },
  };
}

/** How a sprite takes damage: the tones of its fallen pieces (dark, mid,
 * lit), and whether a hole shows rafters (a roof) or a dark pit. */
export type Material = { tones: readonly number[]; roofed: boolean };

/** Pixels that are drawn and not outline. */
const body = (p: Pix, x: number, y: number) => {
  const c = p.get(x, y);
  return c >= 0 && c !== OUTLINE;
};

/** A seeded pick of a drawn, non-outline pixel at least `margin` pixels
 * from anything empty (null if there is none). */
function spot(p: Pix, seed: number, margin = 1): [number, number] | null {
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(hash01(seed, k, 1) * p.w), y = Math.floor(hash01(seed, k, 2) * p.h);
    if (!body(p, x, y)) continue;
    let ok = true;
    for (let oy = -margin; oy <= margin && ok; oy++) for (let ox = -margin; ox <= margin && ok; ox++) ok = p.get(x + ox, y + oy) >= 0;
    if (ok) return [x, y];
  }
  return null;
}

/** A crack: a jagged run of outline-dark pixels wandering one diagonal
 * way across the drawn pixels, the pixel below-right of each a touch
 * darker so it reads as a split. */
function crack(p: Pix, seed: number, len: number) {
  const s = spot(p, seed);
  if (!s) return;
  let [x, y] = s;
  const dx = hash01(seed, 3) < 0.5 ? 1 : -1, dy = hash01(seed, 4) < 0.5 ? 1 : -1;
  for (let i = 0; i < len; i++) {
    if (!body(p, x, y)) break;
    p.set(x, y, OUTLINE);
    if (body(p, x + 1, y + 1)) p.set(x + 1, y + 1, shade(p.get(x + 1, y + 1), 0.8));
    const r = hash01(seed, i, 5);
    if (r < 0.45) x += dx;
    else if (r < 0.9) y += dy;
    else (x += dx), (y += dy);
  }
}

/** Darkens the drawn pixels within `r` of (cx, cy), raggedly. */
function scorch(p: Pix, cx: number, cy: number, r: number, seed: number, f = 0.62) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d > r || !body(p, x, y)) continue;
      if (d > r * 0.6 && hash(x, y, seed) % 2) continue;
      p.set(x, y, shade(p.get(x, y), f));
    }
}

/** A chipped edge: a drawn pixel beside the outline knocked back to it,
 * and the pixel inside it scorched. */
function chip(p: Pix, seed: number) {
  for (let k = 0; k < 60; k++) {
    const x = Math.floor(hash01(seed, k, 6) * p.w), y = Math.floor(hash01(seed, k, 7) * p.h);
    if (!body(p, x, y)) continue;
    const toward = ORTHO.find(([ox, oy]) => p.get(x + ox, y + oy) === OUTLINE && p.get(x + ox * 2, y + oy * 2) < 0);
    if (!toward) continue;
    p.set(x, y, OUTLINE);
    if (body(p, x - toward[0], y - toward[1])) p.set(x - toward[0], y - toward[1], shade(p.get(x - toward[0], y - toward[1]), 0.6));
    return;
  }
}

/** A hole of radius `r` through the top: dark inside, charred round its
 * lip, with rafters across it on a roof and, burning, embers. */
function hole(p: Pix, cx: number, cy: number, r: number, m: Material, seed: number, burning: boolean) {
  scorch(p, cx, cy, r + 1, seed, 0.66);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d > r || p.get(x, y) < 0) continue;
      if (d > r - 0.9) p.set(x, y, OUTLINE);
      else if (m.roofed && (x - y + 60) % 3 === 0) p.set(x, y, RAFTER[(x + y) & 1]);
      else if (burning && hash(x, y, seed, 9) % 5 === 0) p.set(x, y, EMBER[hash(x, y, seed, 10) & 1]);
      else p.set(x, y, HOLE);
    }
}

/** A fallen chunk of material: centre, radius and tones (dark, mid, lit). */
export type Chunk = readonly [number, number, number, readonly number[]];

/** Fallen chunks heaped together, later ones over earlier: each lit from
 * the upper left with a dark crease where it meets the next, and one black
 * outline round the whole pile. */
export function pile(p: Pix, chunks: readonly Chunk[]) {
  const { w, h } = p, id = new Int16Array(w * h).fill(-1);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? id[y * w + x] : -1);
  chunks.forEach(([cx, cy, r], k) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++)
        if ((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy) <= r * r) id[y * w + x] = k;
  });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = id[y * w + x];
      if (k < 0) {
        let edge = false;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) edge ||= at(x + ox, y + oy) >= 0;
        if (edge) p.set(x, y, OUTLINE);
        continue;
      }
      const [cx, cy, r, tones] = chunks[k];
      const crease = [at(x + 1, y), at(x, y + 1)].some((o) => o >= 0 && o !== k);
      const lean = x + 0.5 - cx + (y + 0.5 - cy);
      p.set(x, y, crease ? shade(tones[0], 0.7) : lean < -r * 0.4 ? tones[2] : lean > r * 0.4 ? tones[0] : tones[1]);
    }
}

/** A charred beam from (x, y), `len` pixels along (dx, dy), outlined. */
export function beam(p: Pix, x: number, y: number, len: number, dx: number, dy: number) {
  for (let i = 0; i < len; i++)
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) p.set(x + dx * i + ox, y + dy * i + oy, OUTLINE);
  for (let i = 0; i < len; i++) p.set(x + dx * i, y + dy * i, RAFTER[i % 3 === 1 ? 1 : 0]);
}

const ORTHO: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Paints damage `stage` (0 to 3) over the sprite in `p`, seeded by
 * `seed`. Bigger sprites take proportionally more of each mark. */
export function damage(p: Pix, stage: number, seed: number, m: Material) {
  const many = Math.max(1, Math.round((p.w * p.h) / 300));
  // Marks shrink on small sprites (a tower's 16 pixels, a wall stone's 8).
  const z = Math.max(0.45, Math.min(1.3, Math.sqrt(p.w * p.h) / 24));
  const at = (s: number, k: number) => spot(p, hash(seed, s, k, 11), 2);
  for (let s = 1; s <= stage; s++) {
    const n = (k: number) => hash(seed, s, k, 12);
    if (s === 1) {
      for (let k = 0; k < 2 * many; k++) crack(p, n(k), Math.round((4 + (n(k) % 3)) * z));
      for (let k = 0; k < 2 * many; k++) chip(p, n(k + 20));
      const c = at(s, 0);
      if (c) scorch(p, c[0], c[1], 1.6 * z, n(30), 0.72);
    } else if (s === 2) {
      for (let k = 0; k < 2 * many; k++) crack(p, n(k), Math.round((5 + (n(k) % 3)) * z));
      for (let k = 0; k < many; k++) {
        const c = at(s, k);
        if (c) hole(p, c[0], c[1], (1.4 + hash01(n(k), 13) * 0.5) * z, m, n(k + 40), false);
      }
      for (let k = 0; k < 2 * many; k++) {
        const c = at(s, k + 10);
        if (c) scorch(p, c[0], c[1], 2.4 * z, n(k + 50), 0.7);
      }
      for (let k = 0; k < many; k++) chip(p, n(k + 60));
    } else {
      for (let k = 0; k < many; k++) {
        const c = at(s, k);
        if (c) hole(p, c[0], c[1], (2.2 + hash01(n(k), 14) * 0.8) * z, m, n(k + 40), true);
      }
      for (let k = 0; k < 2 * many; k++) crack(p, n(k), Math.round(6 * z));
      for (let k = 0; k < 3 * many; k++) chip(p, n(k + 60));
      const chunks: Chunk[] = [];
      for (let k = 0; k < (z < 1 ? 1 : 2) * many; k++) {
        const c = at(s, k + 20);
        if (c) chunks.push([c[0] + 0.5, c[1] + 0.5, (1 + hash01(n(k), 15) * 0.6) * Math.max(0.8, z), m.tones]);
      }
      if (chunks.length) pileOver(p, chunks);
    }
  }
}

/** A pile drawn only over pixels already drawn, so the silhouette holds. */
function pileOver(p: Pix, chunks: readonly Chunk[]) {
  const copy = new Uint32Array(p.out), q = pixels(copy, p.w, p.h);
  pile(q, chunks);
  for (let i = 0; i < copy.length; i++) if (p.out[i]) p.out[i] = copy[i];
}

/** What a fallen building leaves: its footprint and what it was made of. */
export type Ruin = {
  /** The footprint's corners (inclusive), in art pixels. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** A round footprint (towers drawn round). */
  round?: boolean;
  /** The walls' stone, dark to lit, and what the top was (roof tiles, timber
   * or slate), dark to lit. */
  stone: readonly number[];
  top: readonly number[];
  /** Charred beams in the heap. */
  beams: boolean;
};

/** A fallen building as `w × h` RGBA pixels: scorched, ash-strewn ground
 * over the footprint (the gravel showing through), stumps of its walls
 * still standing with outline-capped broken ends, a heap of stone and
 * roofing in the middle with charred beams, and a few embers. */
export function rubblePixels(w: number, h: number, seed: number, r: Ruin): Uint32Array {
  const out = new Uint32Array(w * h), p = pixels(out, w, h);
  const cx = (r.x0 + r.x1 + 1) / 2, cy = (r.y0 + r.y1 + 1) / 2;
  const rad = Math.min(r.x1 - r.x0 + 1, r.y1 - r.y0 + 1) / 2;
  const inFoot = (x: number, y: number) =>
    r.round ? (x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy) <= rad * rad : x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  // Ash and soot over the footprint.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inFoot(x, y)) continue;
      const v = hash(x, y, seed, 21) % 9;
      if (v < 2) p.set(x, y, SOOT);
      else if (v < 4) p.set(x, y, shade(r.stone[0], 0.75));
    }
  // The stumps: the footprint's two-pixel rim, standing in runs.
  const rimDepth = (x: number, y: number) => {
    if (!inFoot(x, y)) return -1;
    if (r.round) return Math.floor(rad - Math.sqrt((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy)));
    return Math.min(x - r.x0, y - r.y0, r.x1 - x, r.y1 - y);
  };
  const run = (x: number, y: number) => {
    const a = r.round ? Math.floor(((Math.atan2(y + 0.5 - cy, x + 0.5 - cx) + Math.PI) / (2 * Math.PI)) * 8) : (y - r.y0 <= 1 || r.y1 - y <= 1 ? Math.floor(x / 4) : Math.floor(y / 4)) * 4 + (x - r.x0 <= 1 ? 0 : r.x1 - x <= 1 ? 1 : y - r.y0 <= 1 ? 2 : 3);
    return hash(a, seed, 23) % 5 < 3;
  };
  const wall = (x: number, y: number) => {
    const d = rimDepth(x, y);
    return d >= 0 && d <= 1;
  };
  const stands = (x: number, y: number) => wall(x, y) && run(x, y);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!stands(x, y)) continue;
      const end = ORTHO.some(([dx, dy]) => wall(x + dx, y + dy) && !stands(x + dx, y + dy));
      const outer = rimDepth(x, y) === 0;
      p.set(x, y, end || outer ? OUTLINE : x + y < cx + cy ? r.stone[2] : r.stone[1]);
    }
  // The heap: stone and roofing, biggest first, over a beam or two.
  const span = rad - 1.5;
  if (r.beams) beam(p, Math.round(cx - span * 0.6), Math.round(cy - span * 0.5), Math.max(3, Math.round(span)), 1, 1);
  const count = Math.max(4, Math.round(((r.x1 - r.x0) * (r.y1 - r.y0)) / 22));
  const heap: Chunk[] = Array.from({ length: count }, (_, k) => {
    const ang = hash01(seed, k, 24) * Math.PI * 2, rr = Math.sqrt(hash01(seed, k, 25));
    const hx = ((r.x1 - r.x0) / 2 - 2) * rr, hy = ((r.y1 - r.y0) / 2 - 2) * rr;
    const size = 1.3 + hash01(seed, k, 26) * Math.min(1.8, span * 0.4) * (1.2 - rr * 0.5);
    return [cx + Math.cos(ang) * hx, cy + Math.sin(ang) * hy, size, k % 3 === 0 ? r.top : r.stone] as const;
  });
  pile(p, heap.sort((a, b) => b[2] - a[2]));
  if (r.beams && span >= 4) beam(p, Math.round(cx + span * 0.4), Math.round(cy - span * 0.4), Math.round(span * 0.7), 0, 1);
  // Embers glowing in the heap.
  for (let k = 0; k < count; k++) {
    const x = Math.round(cx + (hash01(seed, k, 27) - 0.5) * span * 1.4), y = Math.round(cy + (hash01(seed, k, 28) - 0.5) * span * 1.4);
    if (body(p, x, y) && hash(seed, k, 29) % 3 === 0) p.set(x, y, EMBER[(x + y) & 1]);
  }
  return out;
}

// ── Wall stones ───────────────────────────────────────────────────────────
//
// A wall stone is drawn from the hand-drawn cap sprite, so its damage is an
// overlay of one cell's art pixels: cracks and chips in the dark, scorches
// as translucent black, and broken-off pieces lying on top.

const WALL_SEED = 0x6d1;

/** The damage over one wall stone at `stage`, as `size × size` RGBA
 * pixels, transparent where the stone shows through. */
export function wallDamagePixels(stage: number, seed: number, size: number): Uint32Array {
  const PLAIN = 0x808080, out = new Uint32Array(size * size).fill(rgba(PLAIN)), p = pixels(out, size, size);
  damage(p, stage, hash(seed, WALL_SEED), { tones: STONE, roofed: false });
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    const r = v & 0xff, g = (v >> 8) & 0xff, b = (v >> 16) & 0xff;
    if (r === g && g === b && r !== 0) {
      // Grey: the plain stone, or the stone scorched.
      out[i] = r >= 0x80 ? 0 : rgba(0, Math.round((1 - r / 0x80) * 255));
    }
  }
  return out;
}

/** A fallen wall stone as `size × size` RGBA pixels: broken blocks lying
 * on the gravel, with grit and a tuft of the cap's moss. */
export function wallRubblePixels(seed: number, size: number): Uint32Array {
  const out = new Uint32Array(size * size), p = pixels(out, size, size);
  const MOSSY = [0x46542b, 0x5b6a35, 0x71803f];
  const n = 2 + (hash(seed, 31) % 2);
  const chunks: Chunk[] = Array.from({ length: n }, (_, k) => [
    1.5 + hash01(seed, k, 32) * (size - 3),
    1.5 + hash01(seed, k, 33) * (size - 3),
    1.2 + hash01(seed, k, 34) * 0.9,
    k === 0 && hash01(seed, 35) < 0.5 ? MOSSY : STONE,
  ]);
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(hash01(seed, k, 36) * size), y = Math.floor(hash01(seed, k, 37) * size);
    p.set(x, y, STONE[hash(seed, k, 38) % 2]);
  }
  pile(p, chunks);
  return out;
}

// ── Sprites ───────────────────────────────────────────────────────────────

const cache = new Map<string, HTMLCanvasElement>();

/** A cached canvas of `w × h` art pixels made by `make` (null outside a
 * browser), keyed by `key`. */
export function sprite(key: string, w: number, h: number, make: () => Uint32Array): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  let cv = cache.get(key);
  if (!cv) {
    if (cache.size > 4000) cache.clear();
    cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d")!;
    const img = c.createImageData(w, h);
    new Uint32Array(img.data.buffer).set(make());
    c.putImageData(img, 0, 0);
    cache.set(key, cv);
  }
  return cv;
}

/** Draws a sprite up over a box of canvas pixels, smoothing off. */
export function drawSprite(c: CanvasRenderingContext2D, cv: HTMLCanvasElement | null, x: number, y: number, w: number, h: number) {
  if (!cv) return;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(cv, x, y, w, h);
  c.restore();
}
