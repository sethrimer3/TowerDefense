/** Paints the Ambush world map as pixel art: each zone's ground in its own palette, dithered into
 * the next across a wavy border, lit from the upper left over rolling height, with its lowlands
 * (water, lava, ice, void) and its little standing landmarks (trees, crystals, peaks, spires) each
 * outlined in ink and casting a shadow, under a parchment wash with burnt edges like an old
 * treasure map. Also the level markers. Works on plain pixel buffers, so it runs without a DOM.
 * Presentation only. */
import { hash, hash01 } from "../defend/grid.ts";
import type { AreaId } from "../defend/areas.ts";
import type { LevelPoint } from "./levels.ts";
import type { MapZone, WorldLayout } from "./world-map.ts";

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pack = ([r, g, b]: Rgb, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round) as Rgb;
const PARCHMENT = hex("#e9d3a0");
/** Every colour leans a little toward the parchment it is painted on. */
const ink = (h: string, wash = 0.16) => pack(mixRgb(hex(h), PARCHMENT, wash));
export const INK = pack(hex("#1a120b"));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** A small sprite: packed colours, 0 clear. */
export class Spr {
  px: Uint32Array;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.px = new Uint32Array(w * h);
  }
  set(x: number, y: number, c: number) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : 0;
  }
}
/** The sprite one pixel larger all round, ringed in ink wherever it meets clear pixels. */
export function outlined(s: Spr, color = INK): Spr {
  const o = new Spr(s.w + 2, s.h + 2);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) o.px[(y + 1) * o.w + x + 1] = s.px[y * s.w + x];
  for (let y = 0; y < o.h; y++)
    for (let x = 0; x < o.w; x++)
      if (!o.px[y * o.w + x] && (s.get(x - 2, y - 1) || s.get(x, y - 1) || s.get(x - 1, y - 2) || s.get(x - 1, y))) o.px[y * o.w + x] = color;
  return o;
}
/** Picks dark, mid or light for a light value from -1 (away from the sun) to 1, dithered at the edges. */
const tone = (c: readonly number[], l: number, x: number, y: number) => {
  const v = l + (bayer(x, y) - 0.5) * 0.4;
  return v > 0.32 ? c[2] : v < -0.3 ? c[0] : c[1];
};

type Rand = (n: number) => number;
type Cols = readonly number[];
// --- Landmarks. Each is drawn with its base at the bottom middle, lit from the upper left. ---
function tree(r: Rand, c: Cols, trunk: number) {
  const R = 3 + Math.floor(r(1) * 3),
    s = new Spr(2 * R + 1, 2 * R + 4);
  for (let y = 2 * R; y < s.h; y++) s.set(R, y, trunk), s.set(R + 1, y, trunk);
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const bump = hash01(x + 9, y + 9, r(2) * 1e6) * 0.9;
      if (x * x + y * y > R * R + R * 0.6 - bump) continue;
      s.set(R + x, R + y, tone(c, -(x * 0.55 + y * 0.85) / R + (bump - 0.45) * 0.4, x, y));
    }
  return s;
}
function pine(r: Rand, c: Cols, trunk: number, snow?: number) {
  const H = 9 + Math.floor(r(1) * 5),
    half = Math.ceil(H * 0.33),
    s = new Spr(half * 2 + 1, H + 2);
  for (let y = 0; y < H; y++) {
    const hw = Math.max(0, Math.round(((y + 1) / H) * half) - (y % 3 === 2 && y > 2 ? 1 : 0));
    for (let x = -hw; x <= hw; x++) s.set(half + x, y, snow && x === -hw && y % 3 !== 2 ? snow : tone(c, x < 0 ? 0.6 : x === 0 ? 0 : -0.7, x, y));
  }
  s.set(half, H, trunk), s.set(half, H + 1, trunk);
  return s;
}
function peak(r: Rand, c: Cols, cap?: number, crater?: number) {
  const W = 16 + Math.floor(r(1) * 12),
    H = Math.round(W * 0.55 + r(2) * 4),
    top = crater ? Math.round(H * 0.22) : 0,
    px = Math.round(W * (0.38 + 0.24 * r(3))),
    s = new Spr(W, H - top);
  for (let y = top; y < H; y++) {
    const k = (y + 1) / H,
      jag = Math.round((hash01(y, r(4) * 1e6) - 0.5) * 2);
    const lx = Math.round(px - px * k) + jag,
      rx = Math.round(px + (W - 1 - px) * k) - jag;
    const ridge = px + Math.round((y - H / 2) * 0.25 + (hash01(y, 3, r(5) * 1e6) - 0.5) * 1.5);
    for (let x = lx; x <= rx; x++) {
      const lit = x < ridge ? 0.55 - (x - lx) / (W * 1.4) : -0.75;
      let col = tone(c, lit, x, y);
      if (cap && y < H * 0.36 + jag * 2 && !crater) col = x < ridge ? cap : pack(mixRgb(unpack(cap), unpack(c[0]), 0.35));
      if (crater && y === top) col = x > lx + 1 && x < rx - 1 ? crater : c[0];
      if (crater && y === top + 1 && x > lx + 2 && x < rx - 2 && hash01(x, y, 7) < 0.5) col = crater;
      s.set(x, y - top, col);
    }
  }
  return s;
}
function unpack(c: number): Rgb {
  return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255];
}
function mesa(r: Rand, c: Cols) {
  const W = 14 + Math.floor(r(1) * 9),
    H = 7 + Math.floor(r(2) * 4),
    s = new Spr(W, H);
  for (let y = 0; y < H; y++) {
    const inset = Math.round((1 - y / H) * W * 0.22);
    for (let x = inset; x < W - inset; x++) {
      const right = x > W * 0.72;
      s.set(x, y, y === 0 ? c[2] : right ? c[0] : (y >> 1) % 2 ? c[1] : tone(c, 0.2, x, y));
    }
  }
  return s;
}
function shards(r: Rand, c: Cols, count: number, tall: number) {
  const n = count + Math.floor(r(1) * 2),
    W = n * 3 + 3,
    H = tall + 4,
    s = new Spr(W, H);
  for (let k = 0; k < n; k++) {
    const h = Math.round(tall * (0.45 + 0.55 * r(10 + k))) - (k % 2 ? 2 : 0),
      x0 = 1 + k * 3 + Math.round(r(20 + k)),
      lean = r(30 + k) - 0.5;
    for (let y = 0; y < h; y++) {
      const cx = x0 + Math.round(lean * (h - y) * 0.35),
        narrow = y < 2;
      for (let x = narrow ? 1 : 0; x < (narrow ? 2 : 3); x++) s.set(cx + x, H - 1 - y, x === 0 ? c[2] : x === 1 ? c[1] : c[0]);
      if (y === h - 3 && c[3]) s.set(cx, H - 1 - y, c[3]);
    }
  }
  return s;
}
function mushroom(r: Rand, cap: Cols, stem: number, spot: number) {
  const R = 3 + Math.floor(r(1) * 3),
    stemH = 3 + Math.floor(r(2) * 3),
    s = new Spr(2 * R + 1, R + stemH + 1);
  for (let y = R; y < s.h; y++) s.set(R, y, stem), s.set(R - 1, y, stem), s.set(R + 1, y, pack(mixRgb(unpack(stem), [60, 40, 30], 0.35)));
  for (let y = -R; y <= 0; y++)
    for (let x = -R; x <= R; x++) {
      if (x * x + y * y * 1.6 > R * R + 1) continue;
      const spotty = hash01(x + 5, y + 5, r(3) * 1e6) < 0.16 && y < 0;
      s.set(R + x, R + y, spotty ? spot : tone(cap, -(x * 0.6 + y * 0.9) / R - 0.2, x, y));
    }
  return s;
}
function cactus(r: Rand, c: Cols) {
  const H = 7 + Math.floor(r(1) * 4),
    s = new Spr(9, H);
  const col = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) s.set(x, y, c[2]), s.set(x + 1, y, c[1]), s.set(x + 2, y, c[0]);
  };
  col(3, 0, H - 1);
  const ay = 2 + Math.floor(r(2) * 3);
  col(0, ay - 2, ay + 1);
  s.set(1, ay + 1, c[1]), s.set(2, ay + 1, c[1]);
  if (r(3) < 0.6) {
    col(6, ay - 1, ay + 2);
    s.set(6, ay + 2, c[1]);
  }
  return s;
}
function rock(r: Rand, c: Cols) {
  const W = 5 + Math.floor(r(1) * 5),
    H = 3 + Math.floor(r(2) * 3),
    s = new Spr(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = (x - (W - 1) / 2) / (W / 2),
        ny = (y - (H - 1)) / H;
      if (nx * nx + ny * ny > 1.05) continue;
      s.set(x, y, tone(c, -(nx * 0.6 + ny * 0.9) - 0.3, x, y));
    }
  return s;
}
function pillar(r: Rand, c: Cols) {
  const H = 6 + Math.floor(r(1) * 6),
    s = new Spr(5, H);
  for (let x = 1; x <= 3; x++) {
    const top = Math.floor(r(2 + x) * 4);
    for (let y = top; y < H - 1; y++) s.set(x, y, x === 1 ? c[2] : x === 2 ? c[1] : c[0]);
  }
  for (let x = 0; x < 5; x++) s.set(x, H - 1, x < 2 ? c[1] : c[0]);
  return s;
}
function tower(r: Rand, c: Cols, roof: number) {
  const W = 5 + 2 * Math.floor(r(1) * 2),
    H = 9 + Math.floor(r(2) * 5),
    peaked = r(3) < 0.5,
    capH = peaked ? Math.ceil(W / 2) + 1 : 1,
    s = new Spr(W + 2, H + capH);
  for (let y = capH; y < s.h; y++) for (let x = 1; x <= W; x++) s.set(x, y, x <= 2 ? c[2] : x >= W ? c[0] : c[1]);
  s.set(Math.floor(W / 2) + 1, capH + 3, INK);
  if (peaked) {
    for (let y = 0; y < capH; y++) {
      const hw = Math.round(((y + 1) / capH) * (W / 2 + 1));
      for (let x = -hw; x <= hw; x++) s.set(Math.floor(W / 2) + 1 + x, y, x < 0 ? roof : pack(mixRgb(unpack(roof), [0, 0, 0], 0.35)));
    }
  } else for (let x = 0; x < W + 2; x += 2) s.set(x, 0, x < 3 ? c[2] : c[1]), s.set(x, capH, c[1]);
  return s;
}
function deadTree(r: Rand, c: Cols) {
  const H = 8 + Math.floor(r(1) * 5),
    s = new Spr(11, H);
  for (let y = 2; y < H; y++) s.set(5, y, c[1]), s.set(6, y, c[0]);
  for (let k = 0; k < 3; k++) {
    const y0 = 2 + Math.floor(r(2 + k) * (H - 5)),
      dir = k % 2 ? 1 : -1,
      len = 2 + Math.floor(r(6 + k) * 3);
    for (let i = 1; i <= len; i++) s.set(5 + dir * i + (dir > 0 ? 1 : 0), y0 - i, c[dir > 0 ? 0 : 2]);
  }
  s.set(5, 1, c[2]), s.set(5, 0, c[2]);
  return s;
}

type Feature = { kind: string; weight: number; make: (r: Rand) => Spr; big?: boolean };
/** How one zone paints: four ground tones dark to light, optional lowland fill below a height,
 * a surface detail and its landmarks. */
type Biome = {
  ground: number[];
  low?: { deep: number; shallow: number; level: number };
  detail?: "speckle" | "ripples" | "cracks" | "stars";
  detailColor?: number;
  density: number;
  features: Feature[];
};
const cols = (...h: string[]) => h.map((c) => ink(c, 0.08));
const groundOf = (...h: string[]) => h.map((c) => ink(c));
/** Dark grounds take less of the parchment, so the deep zones stay dark. */
const darkGround = (...h: string[]) => h.map((c) => ink(c, 0.06));
function biomeFor(zone: MapZone): Biome {
  const id: AreaId = zone.area;
  const stone = cols("#6f6a5e", "#9a9484", "#c4bca6");
  switch (id) {
    case "moss":
      return {
        ground: groundOf("#3e5a2c", "#5b7f3a", "#7a9c4a", "#9cb860"),
        low: { deep: ink("#2f5f73"), shallow: ink("#4d8aa0"), level: 0.3 },
        detail: "speckle",
        detailColor: ink("#c9d98a"),
        density: 0.6,
        features: [
          { kind: "tree", weight: 5, make: (r) => tree(r, cols("#24421f", "#3a6b2c", "#5f9a3e"), ink("#5a3d22")) },
          { kind: "pillar", weight: 1.5, make: (r) => pillar(r, stone) },
          { kind: "rock", weight: 1, make: (r) => rock(r, stone) },
        ],
      };
    case "desert":
      return {
        ground: groundOf("#b8823e", "#d4a256", "#e6bd6e", "#f3d68e"),
        detail: "ripples",
        density: 0.35,
        features: [
          { kind: "cactus", weight: 2, make: (r) => cactus(r, cols("#3f6a35", "#5b8f45", "#82b660")) },
          { kind: "mesa", weight: 1.3, big: true, make: (r) => mesa(r, cols("#8a4f2a", "#b06a38", "#d08a4c")) },
          { kind: "rock", weight: 1, make: (r) => rock(r, cols("#8a6a44", "#a98758", "#c9a774")) },
        ],
      };
    case "drowned":
      return {
        ground: groundOf("#26303e", "#36445a", "#4a5d76", "#617a96"),
        low: { deep: ink("#1c4a66"), shallow: ink("#3a86b0"), level: 0.29 },
        detail: "speckle",
        detailColor: ink("#7fb6d8"),
        density: 0.5,
        features: [
          { kind: "crystal", weight: 2.5, make: (r) => shards(r, cols("#2c6f9a", "#58b4e0", "#a8e6ff", "#ffffff"), 2, 10) },
          { kind: "spire", weight: 1.5, make: (r) => shards(r, cols("#2a2f3a", "#454d5e", "#646f86"), 1, 9) },
          { kind: "rock", weight: 1, make: (r) => rock(r, cols("#2a2f3a", "#454d5e", "#646f86")) },
        ],
      };
    case "ember":
      return {
        ground: groundOf("#3a1f1a", "#55302a", "#714036", "#8e5444"),
        low: { deep: ink("#c2401c", 0.05), shallow: ink("#ff8a2a", 0.05), level: 0.28 },
        detail: "cracks",
        detailColor: ink("#ff9a3a", 0.05),
        density: 0.4,
        features: [
          { kind: "volcano", weight: 1.2, big: true, make: (r) => peak(r, cols("#3a2420", "#5c3a30", "#7e5244"), undefined, ink("#ff7a22", 0.05)) },
          { kind: "rock", weight: 1.5, make: (r) => rock(r, cols("#3a2420", "#5c3a30", "#7e5244")) },
          { kind: "spire", weight: 1, make: (r) => shards(r, cols("#2a1a18", "#4a2e28", "#6a4438"), 1, 8) },
        ],
      };
    case "frozen":
      return {
        ground: groundOf("#8fa6bb", "#b6c9d8", "#d6e3ec", "#f1f7fb"),
        low: { deep: ink("#6fa3c6"), shallow: ink("#a9d4ec"), level: 0.27 },
        density: 0.5,
        features: [
          { kind: "mountain", weight: 1.6, big: true, make: (r) => peak(r, cols("#4f6478", "#71879c", "#9bb0c2"), ink("#f4f9ff", 0)) },
          { kind: "pine", weight: 2.5, make: (r) => pine(r, cols("#1f3d36", "#2f5a4b", "#4a7d63"), ink("#4a3424"), ink("#f4f9ff", 0)) },
          { kind: "rock", weight: 0.6, make: (r) => rock(r, cols("#4f6478", "#71879c", "#9bb0c2")) },
        ],
      };
    case "fungal":
      return {
        ground: groundOf("#2a4a44", "#3a6258", "#4f7c6c", "#69998a"),
        low: { deep: ink("#24474e"), shallow: ink("#3f6f72"), level: 0.3 },
        detail: "speckle",
        detailColor: ink("#b4e0cc"),
        density: 0.6,
        features: [
          { kind: "mushroom", weight: 2.2, make: (r) => mushroom(r, cols("#7a2c3c", "#b54a5a", "#e07c7c"), ink("#e6dcc2"), ink("#fff2e0", 0)) },
          { kind: "tree", weight: 2, make: (r) => tree(r, cols("#1a3a34", "#2b5a4c", "#46806a"), ink("#3e2e22")) },
        ],
      };
    case "crystal":
      return {
        ground: groundOf("#3b2a4e", "#523a6a", "#6b4f88", "#8868a8"),
        detail: "speckle",
        detailColor: ink("#c9a4ef"),
        density: 0.55,
        features: [
          { kind: "crystal", weight: 3, make: (r) => shards(r, cols("#6a3a9a", "#a46ad8", "#dcb0ff", "#ffffff"), 2, 12) },
          { kind: "rock", weight: 1, make: (r) => rock(r, cols("#2e2240", "#46345e", "#5e4a7a")) },
        ],
      };
    case "obsidian":
      return {
        ground: darkGround("#2a2228", "#3a3038", "#4c4048", "#605058"),
        detail: "cracks",
        detailColor: ink("#a26a8a", 0.05),
        density: 0.45,
        features: [
          { kind: "spire", weight: 2, make: (r) => shards(r, cols("#18141a", "#2c2430", "#4a3e50"), 1, 13) },
          { kind: "tower", weight: 1.2, make: (r) => tower(r, cols("#3c343c", "#5a5058", "#7e7280"), ink("#6a2a3a", 0.05)) },
          { kind: "rock", weight: 1, make: (r) => rock(r, cols("#221c22", "#3a3038", "#564a54")) },
        ],
      };
    case "astral":
      return {
        ground: darkGround("#1c2748", "#273562", "#33457c", "#435a96"),
        low: { deep: ink("#080c1c", 0), shallow: ink("#141c3a", 0.05), level: 0.3 },
        detail: "stars",
        detailColor: ink("#fff4c8", 0),
        density: 0.24,
        features: [
          { kind: "tower", weight: 0.8, make: (r) => tower(r, cols("#8a86a8", "#b4b0cc", "#e0dcf0"), ink("#e4d299", 0.05)) },
          { kind: "crystal", weight: 1, make: (r) => shards(r, cols("#a08040", "#e4d299", "#fff6d0", "#ffffff"), 1, 9) },
          { kind: "rock", weight: 1, make: (r) => rock(r, cols("#3a4570", "#55639a", "#7a88c0")) },
        ],
      };
    case "nadir":
      return {
        ground: darkGround("#1a0c0e", "#2a1216", "#3a1a1e", "#4c2428"),
        low: { deep: ink("#4a0a10", 0.05), shallow: ink("#8a1a1e", 0.05), level: 0.3 },
        detail: "cracks",
        detailColor: ink("#d0403a", 0.05),
        density: 0.45,
        features: [
          { kind: "spire", weight: 2, make: (r) => shards(r, cols("#0e0608", "#24100f", "#40201c"), 2, 12) },
          { kind: "deadTree", weight: 2, make: (r) => deadTree(r, cols("#120808", "#2a1414", "#46241e")) },
        ],
      };
    default: {
      // A zone the map has no palette for yet still paints, from its area's colours.
      const d = hex(zone.dark),
        l = hex(zone.color),
        at = (t: number) => pack(mixRgb(mixRgb(d, l, t), PARCHMENT, 0.16));
      return { ground: [at(0.35), at(0.5), at(0.65), at(0.8)], density: 0.35, features: [{ kind: "rock", weight: 1, make: (r) => rock(r, [at(0.1), at(0.3), at(0.5)]) }] };
    }
  }
}

/** A quick hash of three integers to [0, 1), for the per-pixel work (the shared `hash01` takes any
 * number of arguments and is slower in these loops). */
function h3(a: number, b: number, c: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c ^ 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1] on a lattice of `cell` pixels. */
function vnoise(x: number, y: number, cell: number, seed: number) {
  const gx = x / cell,
    gy = y / cell,
    ix = Math.floor(gx),
    iy = Math.floor(gy),
    fx = gx - ix,
    fy = gy - iy,
    sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = h3(seed, ix, iy),
    b = h3(seed, ix + 1, iy),
    c = h3(seed, ix, iy + 1),
    d = h3(seed, ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** `vnoise` over a whole w × h sheet at once: the lattice hashed once, then only blended. */
function noiseField(w: number, h: number, cell: number, seed: number) {
  const lw = Math.floor((w - 1) / cell) + 2,
    lh = Math.floor((h - 1) / cell) + 2,
    lattice = new Float32Array(lw * lh),
    out = new Float32Array(w * h),
    ease = new Float32Array(cell);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) lattice[y * lw + x] = h3(seed, x, y);
  for (let i = 0; i < cell; i++) {
    const f = i / cell;
    ease[i] = f * f * (3 - 2 * f);
  }
  for (let y = 0; y < h; y++) {
    const iy = Math.floor(y / cell),
      sy = ease[y - iy * cell];
    for (let x = 0; x < w; x++) {
      const ix = Math.floor(x / cell),
        sx = ease[x - ix * cell],
        k = iy * lw + ix,
        a = lattice[k],
        b = lattice[k + 1],
        c = lattice[k + lw],
        d = lattice[k + lw + 1];
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

/** How far a border wanders from its straight line, at a point across the map. */
const wander = (k: number, cross: number) => 9 * Math.sin(cross * 0.05 + k * 1.7) + 4 * Math.sin(cross * 0.13 + k * 0.6);
const wanders = new WeakMap<WorldLayout, Float32Array>();
/** Every border's wander at every whole pixel across, worked out once a layout. */
function wanderTable(layout: WorldLayout) {
  let table = wanders.get(layout);
  if (!table) {
    table = new Float32Array(layout.zones.length * layout.across);
    for (let k = 0; k < layout.zones.length; k++) for (let c = 0; c < layout.across; c++) table[k * layout.across + c] = layout.zones[k].from + wander(k, c);
    wanders.set(layout, table);
  }
  return table;
}
/** The zone painted at a map point: its own, or across a border's dithered band, its neighbour's. */
export function zoneAt(layout: WorldLayout, along: number, cross: number, x: number, y: number, noise = vnoise(x, y, 5, 81)) {
  const band = 12,
    rag = (noise - 0.5) * 12,
    table = wanderTable(layout),
    c = Math.max(0, Math.min(layout.across - 1, Math.round(cross)));
  let zone = 0,
    near = Infinity,
    border = 0;
  for (let j = 1; j < layout.zones.length; j++) {
    const d = along - table[j * layout.across + c] + rag;
    if (d >= 0) zone = j;
    if (Math.abs(d) < Math.abs(near)) ((near = d), (border = j));
  }
  if (border && Math.abs(near) < band) return bayer(x, y) < (near + band) / (2 * band) ? border : border - 1;
  return zone;
}

export type Rect = { x: number; y: number; w: number; h: number };
const along = (l: WorldLayout, x: number, y: number) => (l.axis === "y" ? l.length - 1 - y : x);
const crossOf = (l: WorldLayout, x: number, y: number) => (l.axis === "y" ? x : y);

/** Paints the whole map into `out` (layout.w × layout.h packed RGBA). `clear` are rectangles (the
 * labels) kept free of landmarks. Every level's marker and every path keeps the ground around it
 * dry and bare, shown or not, so revealing them never moves the land. */
export function paintWorld(layout: WorldLayout, out: Uint32Array, clear: readonly Rect[] = [], compass?: LevelPoint) {
  const { w, h } = layout,
    biomes = layout.zones.map(biomeFor);
  // How near every pixel is to the way: 1 under it, fading to 0 some pixels off.
  const near = new Float32Array(w * h);
  const stamp = (p: LevelPoint, r: number) => {
    for (let y = Math.max(0, Math.floor(p.y - r)); y <= Math.min(h - 1, Math.ceil(p.y + r)); y++)
      for (let x = Math.max(0, Math.floor(p.x - r)); x <= Math.min(w - 1, Math.ceil(p.x + r)); x++) {
        const v = 1 - Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) / r;
        if (v > near[y * w + x]) near[y * w + x] = v;
      }
  };
  for (const path of layout.paths) for (let i = 0; i < path.length; i += 2) stamp(path[i], 9);
  for (const n of layout.nodes) stamp(n, 16);
  // Rolling height, raised where the way runs so lakes and lava keep their distance.
  const height = new Float32Array(w * h),
    broad = noiseField(w, h, 34, 11),
    hills = noiseField(w, h, 13, 12),
    bumps = noiseField(w, h, 5, 13),
    blotches = noiseField(w, h, 7, 21),
    ripples = noiseField(w, h, 16, 31),
    veins = noiseField(w, h, 19, 51),
    rags = noiseField(w, h, 5, 81);
  for (let i = 0; i < w * h; i++) height[i] = broad[i] * 0.62 + hills[i] * 0.28 + bumps[i] * 0.1 + near[i] * 0.35;
  const H = (x: number, y: number) => height[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  const zoneOf = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        z = zoneAt(layout, along(layout, x, y), crossOf(layout, x, y), x, y, rags[i]);
      zoneOf[i] = z;
      const b = biomes[z],
        hv = height[i];
      let c: number;
      if (b.low && hv < b.low.level) c = hv < b.low.level - 0.045 ? b.low.deep : b.low.shallow;
      else if (b.low && hv < b.low.level + 0.012) c = b.ground[0];
      else {
        const slope = (H(x - 1, y - 1) - H(x + 1, y + 1)) * 9,
          blotch = (blotches[i] - 0.5) * 1.1;
        let t = Math.round(1.35 + slope + blotch + (bayer(x, y) - 0.5) * 0.8);
        if (b.detail === "ripples" && (y * 0.9 + x * 0.3 + ripples[i] * 14) % 6 < 1) t -= 1;
        t = Math.max(0, Math.min(3, t));
        c = b.ground[t];
        if (b.detail === "speckle" && h3(x, y, 41) < 0.03) c = b.detailColor!;
        if (b.detail === "stars") {
          const s = h3(x, y, 43);
          if (s < 0.005) c = b.detailColor!;
          else if (s < 0.012) c = b.ground[3];
        }
        if (b.detail === "cracks" && near[i] < 0.2) {
          const v = Math.abs(veins[i] - 0.5);
          if (v < 0.014) c = b.detailColor!;
          else if (v < 0.03) c = b.ground[0];
        }
      }
      out[i] = c;
    }
  // Landmarks on a jittered grid, kept clear of the way, the labels and the sheet's edge, drawn back to front.
  const placed: { x: number; y: number; s: Spr }[] = [],
    cell = 11,
    edge = 8;
  const free = (x: number, y: number) =>
    x >= edge && y >= edge && x < w - edge && y < h - edge && near[y * w + x] <= 0 && !clear.some((r) => x >= r.x - 3 && x < r.x + r.w + 3 && y >= r.y - 3 && y < r.y + r.h + 3);
  for (let gy = 0; gy < h; gy += cell)
    for (let gx = 0; gx < w; gx += cell) {
      const r: Rand = (n) => hash01(gx, gy, 0x5eed, n),
        x = Math.floor(gx + r(1) * cell),
        y = Math.floor(gy + r(2) * cell);
      if (x >= w || y >= h || !free(x, y)) continue;
      const b = biomes[zoneOf[y * w + x]],
        hv = height[y * w + x];
      if ((b.low && hv < b.low.level + 0.03) || r(3) > b.density) continue;
      const total = b.features.reduce((n, f) => n + f.weight, 0);
      let pick = r(4) * total,
        f = b.features[0];
      for (const g of b.features) if ((pick -= g.weight) < 0) ((f = g), (pick = Infinity));
      const s = outlined(f.make((n) => hash01(gx, gy, 0xfea7, n)));
      const x0 = x - Math.floor(s.w / 2),
        y0 = y - s.h + 1;
      // Its whole footprint must be free too.
      if (![x0, x0 + s.w - 1, x].every((px) => free(Math.max(0, Math.min(w - 1, px)), y) && free(Math.max(0, Math.min(w - 1, px)), Math.max(0, y0))))
        continue;
      placed.push({ x: x0, y: y0, s });
    }
  placed.sort((a, b) => a.y + a.s.h - (b.y + b.s.h));
  for (const p of placed) {
    shadow(out, w, h, p.x + p.s.w / 2 + 2, p.y + p.s.h - 1, p.s.w / 2 + 1);
    blit(out, w, h, p.s, p.x, p.y);
  }
  if (compass) paintCompass(out, w, h, compass.x, compass.y);
  parchment(layout, out);
}
function shadow(out: Uint32Array, w: number, h: number, cx: number, cy: number, rx: number) {
  const ry = Math.max(1.5, rx * 0.32);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      out[y * w + x] = darken(out[y * w + x], 0.72);
    }
}
const channel = (v: number, k: number) => Math.min(255, Math.round(v * k));
const darken = (c: number, k: number) => ((c & 0xff000000) | (channel((c >>> 16) & 255, k) << 16) | (channel((c >>> 8) & 255, k) << 8) | channel(c & 255, k)) >>> 0;
export function blit(out: Uint32Array, w: number, h: number, s: Spr, x0: number, y0: number) {
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const c = s.px[y * s.w + x],
        X = x0 + x,
        Y = y0 + y;
      if (c && X >= 0 && Y >= 0 && X < w && Y < h) out[Y * w + X] = c;
    }
}
/** Paper grain over everything, a darkening toward the edges and a burnt, ragged rim. */
function parchment(layout: WorldLayout, out: Uint32Array) {
  const { w, h } = layout,
    burnt = pack(hex("#4a2c14"));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        rim = Math.min(x, y, w - 1 - x, h - 1 - y),
        rag = rim < 7 ? 2 + Math.floor(vnoise(x + y, x - y, 6, 61) * 4) : 6;
      if (rim < rag - 1) {
        out[i] = 0;
        continue;
      }
      if (rim < rag + 1) {
        out[i] = burnt;
        continue;
      }
      let k = 1 + (h3(x, y, 71) - 0.5) * 0.06;
      if (rim < 18) k *= 0.72 + 0.28 * (rim / 18) + (bayer(x, y) - 0.5) * 0.06;
      out[i] = darken(out[i], Math.min(1.08, k)) | 0xff000000;
    }
}

/** A level's marker: a stone plinth seen from above and in front, with a planted flag once won or
 * a red X where the next level waits. Its plinth's middle is at `MARKER_DISC`. */
export const MARKER_DISC = { x: 10, y: 19 };
export function markerSprite(state: "won" | "next", flag: string): Spr {
  const s = new Spr(19, 23),
    cx = 9,
    cy = 18,
    stone = cols("#5c5448", "#8a8070", "#b8ad96"),
    rx = 7,
    ry = 3;
  for (let y = cy - ry; y <= cy + ry + 3; y++)
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / (rx + 0.5),
        top = dx * dx + ((y - cy) / (ry + 0.5)) ** 2 <= 1,
        side = !top && y > cy && dx * dx + ((y - cy - 3) / (ry + 0.5)) ** 2 <= 1;
      if (top) s.set(x, y, tone(stone, -dx * 0.7 - (y - cy) * 0.15 + 0.2, x, y));
      else if (side) s.set(x, y, x < cx - 2 ? stone[1] : stone[0]);
    }
  if (state === "next") {
    const red = ink("#b3261e", 0),
      light = ink("#e8574a", 0);
    for (let i = -3; i <= 3; i++) {
      const y1 = cy + Math.round(i * 0.5);
      s.set(cx + i, y1, i < 0 ? light : red), s.set(cx + i + 1, y1, red);
      s.set(cx + i, cy - Math.round(i * 0.5), i < 0 ? light : red), s.set(cx + i + 1, cy - Math.round(i * 0.5), red);
    }
  } else {
    const pole = ink("#5a3d22", 0),
      f = hex(flag),
      lit = pack(mixRgb(f, [255, 255, 255], 0.3)),
      mid = pack(f),
      dark = pack(mixRgb(f, [0, 0, 0], 0.35));
    for (let y = 2; y <= cy; y++) s.set(cx, y, pole);
    s.set(cx, 1, ink("#f2c14e", 0));
    for (let y = 2; y <= 7; y++)
      for (let x = cx + 1; x <= cx + 7; x++) {
        if (x >= cx + 6 && (y === 4 || y === 5)) continue; // the swallowtail's notch
        s.set(x, y, y === 2 ? lit : y >= 6 ? dark : mid);
      }
  }
  return outlined(s);
}

/** A compass rose in the map maker's ink: four long points (north in red) and four short, an N
 * over the top. `x`, `y` is its top left; it is `COMPASS` pixels square. */
export const COMPASS = 34;
function paintCompass(out: Uint32Array, w: number, h: number, x0: number, y0: number) {
  const s = new Spr(27, 27),
    c = 13,
    paper = [ink("#f6e8c4", 0), ink("#a88a5c", 0)],
    red = [ink("#d2493a", 0), ink("#7a1f16", 0)];
  const point = (dx: number, dy: number, len: number, half: number, cols: number[]) => {
    for (let t = 0; t <= len; t++) {
      const hw = Math.round(((len - t) / len) * half);
      // Across the point, perpendicular to its direction; one side catches the light.
      for (let k = -hw; k <= hw; k++) s.set(c + dx * t - dy * k, c + dy * t + dx * k, k < 0 ? cols[0] : cols[1]);
    }
  };
  for (const [dx, dy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    for (let t = 1; t <= 7; t++) s.set(c + dx * t, c + dy * t, paper[t < 4 ? 0 : 1]), s.set(c + dx * t - dx, c + dy * t, paper[1]);
  point(0, 1, 12, 3, paper);
  point(1, 0, 12, 3, paper);
  point(-1, 0, 12, 3, paper);
  point(0, -1, 12, 3, red);
  const o = outlined(s),
    dot = Object.assign(new Spr(1, 1), { px: new Uint32Array([INK]) });
  shadow(out, w, h, x0 + 18, y0 + 32, 11);
  blit(out, w, h, o, x0 + 2, y0 + 5);
  const N = ["X..X", "XX.X", "X.XX", "X..X", "X..X"];
  N.forEach((row, y) => [...row].forEach((p, x) => p === "X" && blit(out, w, h, dot, x0 + 15 + x, y0 + y - 1)));
}

/** The path's dots: a dab of red ink with a darker lower right. */
export function paintDot(out: Uint32Array, w: number, h: number, p: LevelPoint) {
  const red = pack(hex("#a8281c")),
    dark = pack(hex("#5e140c"));
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = c;
  };
  put(p.x, p.y, red), put(p.x + 1, p.y, red), put(p.x, p.y + 1, red), put(p.x + 1, p.y + 1, dark);
}

/** A cheap fingerprint of a painted map, for tests. */
export const fingerprint = (px: Uint32Array) => px.reduce((a, c, i) => (i % 7 ? a : hash(a, c)), 0);
