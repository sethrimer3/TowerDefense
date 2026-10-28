/** The Ambush rivers as pixel art, made to read as the same water as the
 * forest's lakes (`forest-art.ts`'s `lake`): a muddy bank and black outline
 * along soft, wandering shores, water shading from teal shallows over sand
 * to the deep, the bank's shadow from the upper left, a pale lip of light
 * along the far bank, lily pads in the slack water and reeds in the
 * shallows (`paintRiver`). The river's cells (`CityMap.river`) step a cell
 * at a time; its shores are those steps smoothed (`riverShape`), wobbled
 * along their length.
 *
 * Over it, live (`RiverLife`): the current, pale and dark streaks drifting
 * downstream, quickest in the middle, and glints twinkling; rain rings in
 * the rain; and the shadows of small fish, wandering about the open water
 * and darting off and down out of sight from anyone walking near, coming
 * back up a while later. In the cold the open water is iced over instead,
 * as the ponds' is. Nothing shows under the bridges.
 *
 * Presentation only: the river's cells are the battle's, and the fish and
 * rings draw from `defendRandom("effects")`. */
import { CELLS_H, CELLS_W, cellIndex, defendRandom, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { BANK, FOAM, GLINT, LILY, REED, SAND, WATER, WATER_OUTLINE, bayer } from "./water-palette.ts";
import { artPen } from "./pixel-fx.ts";

/** Art pixels a cell, as `park-art.ts`'s `ART` (not imported: park-art
 * paints the rivers through this module). */
export const RIVER_ART = 8;
const ART = RIVER_ART;
const W = CELLS_W * ART, H = CELLS_H * ART;

/** A river's cells: in each column, its first row and how many rows deep. */
export type RiverBed = { top: number[]; depth: number[] };

/** A river's smoothed shores: in each art column, where the shape starts
 * and ends (art pixels; the water itself starts 1.5 pixels in), its seed
 * and which way it flows (+1 east, -1 west). */
export type RiverShape = { top: Float32Array; bot: Float32Array; seed: number; flow: 1 | -1 };

/** How far (cells) the shores are smoothed either side, and how much they
 * wobble (art pixels). */
const SHORE = { smooth: 1.6, wobble: 1.2 };
/** Water tones across the river: art pixels in from the outline a tone. */
const TONE_STEP = 2.6;

const shapes = new WeakMap<RiverBed, RiverShape>();

/** `bed`'s smoothed shores, made once. */
export function riverShape(bed: RiverBed): RiverShape {
  let s = shapes.get(bed);
  if (s) return s;
  const top = new Float32Array(W), bot = new Float32Array(W);
  let seed = 7;
  for (let x = 0; x < bed.top.length; x++) seed = hash(seed, bed.top[x], bed.depth[x]);
  const n = bed.top.length;
  for (let X = 0; X < W; X++) {
    // A smooth bump of a kernel over the cells' steps, so each step
    // becomes a gentle curve across a cell or two either side.
    const u = (X + 0.5) / ART - 0.5;
    let st = 0, sb = 0, sw = 0;
    for (let x = Math.max(0, Math.floor(u - SHORE.smooth)); x <= Math.min(n - 1, Math.ceil(u + SHORE.smooth)); x++) {
      const d = (x - u) / SHORE.smooth;
      if (d * d >= 1) continue;
      const w = (1 - d * d) * (1 - d * d);
      st += w * bed.top[x];
      sb += w * (bed.top[x] + bed.depth[x]);
      sw += w;
    }
    const k = Math.min(n - 1, Math.max(0, Math.round(u)));
    const t = sw ? st / sw : bed.top[k], b = sw ? sb / sw : bed.top[k] + bed.depth[k];
    const ph = (seed % 1000) / 100;
    top[X] = t * ART + SHORE.wobble * (Math.sin(X * 0.19 + ph) * 0.7 + Math.sin(X * 0.47 + ph * 2.3) * 0.3);
    bot[X] = b * ART + SHORE.wobble * (Math.sin(X * 0.23 + ph * 1.7) * 0.7 + Math.sin(X * 0.41 + ph * 0.6) * 0.3);
  }
  s = { top, bot, seed, flow: seed % 2 ? 1 : -1 };
  shapes.set(bed, s);
  return s;
}

/** How far (art pixels) inside the river pixel (X, Y) lies: negative out
 * on the bank, 0 at the shape's edge. */
export function riverDepth(s: RiverShape, X: number, Y: number) {
  const x = X < 0 ? 0 : X >= W ? W - 1 : X;
  return Math.min(Y + 0.5 - s.top[x], s.bot[x] - Y - 0.5);
}

/** Whether cell `i` of `map` is the river's own water (bridged or not). */
export function riverCell(map: CityMap, i: number) {
  const r = map.river;
  if (!r) return false;
  const x = i % CELLS_W, y = (i - x) / CELLS_W;
  return y >= r.top[x] && y < r.top[x] + r.depth[x];
}

/** Which cells the river's art may cover: open ground (1) and its own
 * water (2, which it covers whole), and the bridges' cells when `bridges`
 * (whose decks are drawn over it). */
export function riverCanvas(map: CityMap, bridges: boolean) {
  const out = new Uint8Array(CELLS_W * CELLS_H);
  for (let i = 0; i < out.length; i++) {
    const t = map.type[i], b = map.bridges?.[i] ?? 0;
    out[i] = b ? (bridges ? 2 : 0) : t === CellType.WATER ? 2 : t === CellType.OUT ? 1 : 0;
  }
  return out;
}

/** Opaque little-endian RGBA for 0xRRGGBB. */
const rgba = (c: number) => ((255 << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** Paints river `s` into `out` (`W × H` art pixels) within `box`
 * (`x1`/`y1` exclusive), only on cells `cells` marks. */
export function paintRiver(out: Uint32Array, s: RiverShape, cells: Uint8Array, box: { x0: number; y0: number; x1: number; y1: number }) {
  const x0 = Math.max(0, box.x0), x1 = Math.min(W, box.x1);
  const ok = (X: number, Y: number) => X >= x0 && X < x1 && Y >= box.y0 && Y < box.y1 && Y >= 0 && Y < H && cells[cellIndex(Math.floor(X / ART), Math.floor(Y / ART))] > 0;
  const water = (X: number, Y: number) => cells[cellIndex(Math.floor(X / ART), Math.floor(Y / ART))] === 2;
  const wet = (X: number, Y: number) => riverDepth(s, X, Y) >= 1.5;
  for (let X = x0; X < x1; X++) {
    const ya = Math.max(box.y0, 0, Math.floor(s.top[X] - 8)), yb = Math.min(box.y1, H, Math.ceil(s.bot[X] + 8));
    for (let Y = ya; Y < yb; Y++) {
      if (!ok(X, Y)) continue;
      const e = riverDepth(s, X, Y);
      const odd = (X + Y) & 1, hsh = hash(X, Y, s.seed, 481);
      let c: number;
      // The river's own cells are covered whole: where the smoothed shore
      // cuts a cell's corner off, the bank widens over it.
      if (e < -2) { if (!water(X, Y)) continue; c = BANK[hsh % 4 ? 1 : 0]; }
      else if (e < -1) { if (odd && !water(X, Y)) continue; c = BANK[0]; }
      else if (e < 0.5) c = BANK[hsh % 3 ? 1 : 2];
      else if (e < 1.5) c = WATER_OUTLINE;
      else {
        const t = Math.min(WATER.length - 1, Math.max(0, (e - 1.5) / TONE_STEP)) + bayer(X, Y) - 0.5;
        let k = Math.max(0, Math.min(WATER.length - 1, Math.round(t)));
        if (k === 0 && hsh % 9 === 0) { out[Y * W + X] = rgba(SAND); continue; }
        // The bank's shadow from the upper left; the light it catches opposite.
        if (!wet(X - 3, Y - 3)) k = Math.min(WATER.length - 1, k + 2);
        else if (!wet(X + 2, Y + 2) && e < 4) { out[Y * W + X] = rgba(odd ? FOAM : WATER[0]); continue; }
        // Long ripple lines combed out along the current.
        const wave = Math.sin(Y * 0.9 + Math.sin(X * 0.11 + s.seed) * 2.2 + X * 0.07);
        if (e > 5 && wave > 0.88 && (X & 1)) k = Math.max(0, k - 1);
        c = WATER[k];
      }
      out[Y * W + X] = rgba(c);
    }
  }
  // Lily pads in the slack water near the banks, one in a few in flower.
  for (let k = 0; k < Math.round(W / 64); k++) {
    const X = Math.floor(hash01(s.seed, k, 482) * W), side = hash(s.seed, k, 483) % 2;
    const Y = Math.round(side ? s.top[X] + 6 + hash01(s.seed, k, 484) * 2 : s.bot[X] - 7 - hash01(s.seed, k, 484) * 2);
    if (riverDepth(s, X, Y) < 4.5) continue;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > 5 || !ok(X + dx, Y + dy) || (dx > 0 && dy === 0)) continue;
        out[(Y + dy) * W + X + dx] = rgba(d2 > 3 ? LILY[0] : dx + dy < 0 ? LILY[2] : LILY[1]);
      }
    if (k % 3 === 0 && ok(X - 1, Y - 1)) out[(Y - 1) * W + X - 1] = rgba(0xf2c4d6);
  }
  // Reeds in clumps along the shallows: dark tufts with pale tips.
  for (let k = 0; k < Math.round(W / 22); k++) {
    const X = Math.floor(hash01(s.seed, k, 485) * W), side = hash(s.seed, k, 486) % 2;
    const Y = Math.round(side ? s.top[X] + 2.5 + hash01(s.seed, k, 489) * 1.5 : s.bot[X] - 2.5 - hash01(s.seed, k, 489) * 1.5);
    for (let j = 0; j < 6; j++) {
      const rx = X + (hash(s.seed, k, j, 487) % 5) - 2, ry = Y + (hash(s.seed, k, j, 488) % 3) - 1, e = riverDepth(s, rx, ry);
      if (e < 1.5 || e > 4.5 || !ok(rx, ry) || !ok(rx, ry - 1)) continue;
      out[ry * W + rx] = rgba(REED[0]);
      out[(ry - 1) * W + rx] = rgba(j % 3 ? REED[1] : REED[2]);
    }
  }
}

/** The current: how many streaks to an art pixel of river, how fast they
 * drift (art pixels a second, in the middle; half that at the banks), and
 * how strongly they show. */
const CURRENT = { per: 1 / 4, speed: 9, alpha: 0.7 };
/** Fish: one to so many art pixels of river, their cruising and darting
 * speeds (art pixels a second), how near (cells) a walker scares them,
 * how long a fright lasts, and how long they keep down after (s). */
const FISH = { per: 1 / 46, cruise: 4, dart: 30, fear: 2.4, flee: 0.7, hide: [4, 9] as const, alpha: 0.58 };
/** Rain rings: how many fall a second on each art pixel of river, and how
 * long one spreads (s). */
const RAIN = { rate: 1 / 260, life: 0.7 };
/** Pixels nearer a bank than this (art pixels) are not open water. */
const OPEN_FROM = 3;

/** A streak of the current: where it started along the river, how far
 * across (0 one bank, 1 the other), its length and its fade's phase. */
type Streak = { u: number; v: number; len: number; phase: number; rate: number; light: boolean };
type Fish = { x: number; y: number; dir: number; turn: number; speed: number; size: number; fear: number; hide: number; alpha: number; wiggle: number };
type Drop = { x: number; y: number; t0: number };

export type RiverFrame = {
  c: CanvasRenderingContext2D;
  /** Canvas pixels per cell (the camera is already applied). */
  px: number;
  /** The wall clock, ms. */
  now: number;
  dt: number;
  rain: boolean;
  cold: boolean;
  /** Cells heat has opened in the ice. */
  thawed?: ReadonlySet<number>;
  /** People and enemies on foot, in cells: the fish flee them. */
  walkers: readonly { x: number; y: number }[];
  reduceMotion: boolean;
};

const fx = defendRandom("effects");

/** The river's live water, kept by the renderer. */
export class RiverLife {
  private map: CityMap | null = null;
  private shape: RiverShape | null = null;
  /** 1 on art pixels of open water, off the banks and the bridges. */
  private open = new Uint8Array(0);
  private streaks: Streak[] = [];
  private glints: { x: number; y: number; len: number; phase: number; rate: number }[] = [];
  private fish: Fish[] = [];
  private drops: Drop[] = [];
  private rainDue = 0;
  private ice: HTMLCanvasElement | null = null;
  /** The rows (cells) a walker frightening a fish could stand in, and
   * those standing there this frame. */
  private band: [number, number] = [0, 0];
  private close: { x: number; y: number }[] = [];
  private iceKey = -1;

  /** Readies the river of `map` (none for a map without one). */
  sync(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.ice = null;
    this.drops = [];
    if (!map.river) {
      this.shape = null;
      this.streaks = [], this.glints = [], this.fish = [];
      return;
    }
    const s = (this.shape = riverShape(map.river)), cells = riverCanvas(map, false);
    let lo = Infinity, hi = -Infinity;
    for (let X = 0; X < W; X++) lo = Math.min(lo, s.top[X]), hi = Math.max(hi, s.bot[X]);
    this.band = [lo / ART - FISH.fear * 1.5, hi / ART + FISH.fear * 1.5];
    this.open = new Uint8Array(W * H);
    for (let X = 0; X < W; X++)
      for (let Y = Math.max(0, Math.floor(s.top[X])); Y < Math.min(H, Math.ceil(s.bot[X])); Y++)
        if (riverDepth(s, X, Y) >= OPEN_FROM && cells[cellIndex(Math.floor(X / ART), Math.floor(Y / ART))] === 2) this.open[Y * W + X] = 1;
    this.streaks = Array.from({ length: Math.round(W * CURRENT.per) }, (_, k) => ({
      u: hash01(s.seed, k, 601) * W, v: 0.12 + hash01(s.seed, k, 602) * 0.76, len: 2 + (hash(s.seed, k, 603) % 4),
      phase: hash01(s.seed, k, 604) * 6.28, rate: 0.5 + hash01(s.seed, k, 605) * 0.9, light: hash(s.seed, k, 606) % 3 !== 0,
    }));
    this.glints = [];
    for (let k = 0; k < Math.round(W / 22); k++) {
      const x = Math.floor(hash01(s.seed, k, 607) * W), y = Math.round(s.top[x] + (s.bot[x] - s.top[x]) * (0.25 + hash01(s.seed, k, 608) * 0.5));
      if (this.openAt(x, y)) this.glints.push({ x, y, len: 1 + (hash(s.seed, k, 609) % 3), phase: hash01(s.seed, k, 610) * 6.28, rate: 0.6 + hash01(s.seed, k, 611) * 1.2 });
    }
    this.fish = [];
    for (let k = 0; k < Math.max(2, Math.round(W * FISH.per)); k++) {
      const f = this.newFish(hash01(s.seed, k, 612), hash01(s.seed, k, 613));
      if (f) this.fish.push(f);
    }
  }

  private openAt(X: number, Y: number) {
    X = Math.round(X), Y = Math.round(Y);
    return X >= 0 && Y >= 0 && X < W && Y < H && this.open[Y * W + X] === 1;
  }

  /** A fish somewhere along the river (`a` 0..1 along it, `b` across),
   * if that spot is open water. */
  private newFish(a: number, b: number): Fish | null {
    const s = this.shape!;
    for (let tries = 0; tries < 6; tries++) {
      const x = Math.floor(((a + tries * 0.137) % 1) * W), y = s.top[x] + (s.bot[x] - s.top[x]) * (0.3 + b * 0.4);
      if (!this.openAt(x, y)) continue;
      return { x, y, dir: s.flow > 0 ? Math.PI : 0, turn: 0, speed: FISH.cruise * (0.6 + b * 0.6), size: 1 + Math.round(b * 2) % 2, fear: 0, hide: 0, alpha: 1, wiggle: a * 9 };
    }
    return null;
  }

  /** The current, glints, rain rings and fish over the river (or its ice). */
  draw(f: RiverFrame) {
    if (!this.shape || !this.map) return;
    const t = f.now / 1000, dt = Math.min(0.1, Math.max(0, f.dt));
    if (f.cold) return this.drawIce(f);
    if (!f.reduceMotion) this.swim(f, dt);
    const c = f.c, dot = artPen(c, f.px), s = this.shape, still = f.reduceMotion ? 0 : t;
    c.save();
    // The current: streaks drifting downstream, quicker in the middle,
    // each fading in and out so none can be followed for long.
    for (const k of this.streaks) {
      const v = Math.sin(still * k.rate + k.phase);
      if (v < 0.2) continue;
      const mid = 1 - (2 * k.v - 1) * (2 * k.v - 1);
      const X = Math.floor((((k.u + s.flow * still * CURRENT.speed * (0.5 + 0.5 * mid)) % W) + W) % W);
      const Y = Math.round(s.top[X] + (s.bot[X] - s.top[X]) * k.v);
      c.globalAlpha = CURRENT.alpha * Math.min(1, (v - 0.2) * 2.5) * (k.light ? 1 : 0.7);
      c.fillStyle = k.light ? "#8fc6c4" : "#112a40";
      for (let j = 0; j < k.len; j++) {
        const x = X - s.flow * j;
        if (this.openAt(x, Y)) dot(x, Y);
      }
    }
    // Glints twinkling, drifting a little downstream as they shine.
    c.fillStyle = `#${GLINT.toString(16)}`;
    for (const g of this.glints) {
      const v = Math.sin(still * g.rate + g.phase);
      if (v < 0.6) continue;
      c.globalAlpha = Math.min(1, (v - 0.6) * 4);
      const x = g.x + Math.round(s.flow * (v - 0.6) * 4);
      if (this.openAt(x, g.y)) dot(x, g.y, v > 0.92 ? g.len + 1 : g.len, 1);
    }
    if (!f.reduceMotion) this.drawRain(f, t, dot);
    this.drawFish(f, dot);
    c.restore();
  }

  /** Moves the fish: cruising about, turning back from the banks, darting
   * off from anyone near and keeping down a while after. */
  private swim(f: RiverFrame, dt: number) {
    const s = this.shape!;
    // Only those walking near the river can frighten its fish.
    this.close.length = 0;
    for (const w of f.walkers) if (w.y >= this.band[0] && w.y <= this.band[1]) this.close.push(w);
    for (let k = 0; k < this.fish.length; k++) {
      const p = this.fish[k];
      if (p.hide > 0) {
        p.hide -= dt;
        if (p.hide > 0) continue;
        const n = this.newFish(fx(), fx());
        if (!n || this.near(f, n.x, n.y, FISH.fear * 1.5)) { p.hide = 1; continue; }
        Object.assign(p, n, { alpha: 0 });
        continue;
      }
      // Frightened by anyone walking close: dart away from them, then dive.
      const w = this.near(f, p.x, p.y, FISH.fear);
      if (w && p.fear <= 0) {
        p.fear = FISH.flee;
        p.dir = Math.atan2(p.y - w.y * ART, p.x - w.x * ART) + (fx() - 0.5) * 0.8;
      }
      if (p.fear > 0) {
        p.fear -= dt;
        p.alpha = Math.max(0, p.alpha - dt / FISH.flee);
        if (p.fear <= 0 || p.alpha <= 0) { p.hide = FISH.hide[0] + fx() * (FISH.hide[1] - FISH.hide[0]); p.fear = 0; continue; }
      } else {
        p.alpha = Math.min(1, p.alpha + dt * 0.6);
        // A lazy wander, mostly holding against the current.
        if (fx() < dt * 0.5) p.turn = (fx() - 0.5) * 1.6;
        p.dir += p.turn * dt;
      }
      const speed = p.fear > 0 ? FISH.dart : p.speed, step = speed * dt;
      let nx = p.x + Math.cos(p.dir) * step, ny = p.y + Math.sin(p.dir) * step;
      if (!this.openAt(nx, ny)) {
        // Turn back toward the middle of the river.
        const X = Math.max(0, Math.min(W - 1, Math.round(p.x))), mid = (s.top[X] + s.bot[X]) / 2;
        p.dir = Math.atan2(mid - p.y, (s.flow > 0 ? -1 : 1) * 4 * (fx() + 0.2));
        nx = p.x, ny = p.y;
      }
      // The current carries them a little.
      const cx = nx + s.flow * dt * 1.5;
      if (this.openAt(cx, ny)) nx = cx;
      p.x = nx, p.y = ny;
      p.wiggle += dt * (p.fear > 0 ? 22 : 6);
    }
  }

  /** The walker nearest (x, y) (art pixels) within `reach` cells, if any. */
  private near(f: RiverFrame, x: number, y: number, reach: number) {
    let best: { x: number; y: number } | null = null, bd = reach * reach;
    for (const w of this.close) {
      const dx = w.x - x / ART, dy = w.y - y / ART, d = dx * dx + dy * dy;
      if (d < bd) bd = d, best = w;
    }
    return best;
  }

  /** Each fish's shadow: a dark slip of a body, a forked tail swinging. */
  private drawFish(f: RiverFrame, dot: ReturnType<typeof artPen>) {
    const c = f.c;
    c.fillStyle = "#06141e";
    for (const p of this.fish) {
      if (p.hide > 0 || p.alpha <= 0.02) continue;
      c.globalAlpha = FISH.alpha * p.alpha;
      const ux = Math.cos(p.dir), uy = Math.sin(p.dir), swing = Math.sin(p.wiggle) * 0.6;
      const L = 4 + p.size;
      const seen = new Set<number>();
      const put = (x: number, y: number) => {
        const X = Math.round(x), Y = Math.round(y), key = Y * W + X;
        if (seen.has(key) || !this.openAt(X, Y)) return;
        seen.add(key);
        dot(X, Y);
      };
      for (let d = -L + 1; d <= 1; d++) {
        // Thickest just behind the head, the tail end swinging.
        const sway = d < -1 ? swing * (-1 - d) * 0.5 : 0;
        const bx = p.x + ux * d - uy * sway, by = p.y + uy * d + ux * sway;
        put(bx, by);
        if (d >= -2 - p.size && d <= 0) put(bx - uy * 0.9, by + ux * 0.9);
      }
      // The tail's fork.
      const tx = p.x - ux * L - uy * swing * L * 0.4, ty = p.y - uy * L + ux * swing * L * 0.4;
      put(tx - uy, ty + ux);
      put(tx + uy, ty - ux);
    }
  }

  /** Rain rings: tiny diamonds of pale pixels spreading on the water. */
  private drawRain(f: RiverFrame, t: number, dot: ReturnType<typeof artPen>) {
    const s = this.shape!, c = f.c;
    this.drops = this.drops.filter((d) => t >= d.t0 && t - d.t0 < RAIN.life);
    if (f.rain) {
      this.rainDue += Math.min(0.1, Math.max(0, f.dt)) * W * 10 * RAIN.rate;
      while (this.rainDue >= 1 && this.drops.length < 160) {
        this.rainDue--;
        const X = Math.floor(fx() * W), Y = Math.round(s.top[X] + (s.bot[X] - s.top[X]) * fx());
        if (this.openAt(X, Y)) this.drops.push({ x: X, y: Y, t0: t });
      }
    } else this.rainDue = 0;
    c.fillStyle = "#a8d4d2";
    for (const d of this.drops) {
      const a = (t - d.t0) / RAIN.life, r = Math.round(a * 3);
      c.globalAlpha = 0.5 * (1 - a);
      if (!r) { if (this.openAt(d.x, d.y)) dot(d.x, d.y); continue; }
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) if (this.openAt(d.x + dx, d.y + dy)) dot(d.x + dx, d.y + dy);
    }
  }

  /** In the cold the open water ices over as the ponds' does, except where
   * heat has opened it. */
  private drawIce(f: RiverFrame) {
    if (typeof document === "undefined") return;
    const count = f.thawed?.size ?? 0;
    if (!this.ice || this.iceKey !== count) {
      this.iceKey = count;
      const cv = (this.ice ??= document.createElement("canvas"));
      cv.width = W, cv.height = H;
      const c = cv.getContext("2d")!;
      c.clearRect(0, 0, W, H);
      for (let i = 0; i < this.open.length; i++) {
        if (!this.open[i]) continue;
        const x = i % W, y = (i - x) / W;
        if (f.thawed?.has(cellIndex(Math.floor(x / ART), Math.floor(y / ART)))) continue;
        const edge = !this.openAt(x - 1, y) || !this.openAt(x, y - 1);
        c.fillStyle = edge || (x + Math.floor(y / 3)) % 37 === 0 ? "#d7eef3" : (Math.floor(x / 17) + Math.floor(y / 13)) % 3 ? "#86b9ce" : "#72a5bf";
        c.fillRect(x, y, 1, 1);
      }
    }
    f.c.save();
    f.c.imageSmoothingEnabled = false;
    f.c.drawImage(this.ice, 0, 0, (W * f.px) / ART, (H * f.px) / ART);
    f.c.restore();
  }

  /** The fish, for tests: where each is (art pixels) and whether it is
   * showing. */
  get shoal(): readonly { x: number; y: number; hidden: boolean; scared: boolean }[] {
    return this.fish.map((p) => ({ x: p.x, y: p.y, hidden: p.hide > 0, scared: p.fear > 0 }));
  }

  /** Steps the fish alone, for tests (no drawing). */
  step(f: Omit<RiverFrame, "c" | "px">) {
    if (this.shape && !f.reduceMotion && !f.cold) this.swim(f as RiverFrame, Math.min(0.1, Math.max(0, f.dt)));
  }

  /** Whether art pixel (X, Y) is open river water. */
  isOpen(X: number, Y: number) {
    return this.openAt(X, Y);
  }
}
