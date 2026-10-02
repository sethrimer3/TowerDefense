/** Wind-blown grass for the city's parks, after the forest grass outside the
 * old Tower: each park cell carries a few clumps of pixel blades that sway in
 * the wind, bow under gusts rolling across the city (harder in the rain),
 * part around anyone walking through them, and wobble back after they pass.
 *
 * Blades are planned per cell from its position (presentation only: they
 * never change the city), kept clear of tree canopies, pond shores and the
 * park edges worn to bare dirt (`ground-art.ts`), and
 * written into one pixel buffer at `ART` pixels per cell covering the parks,
 * then drawn scaled up with smoothing off, so thousands of blades cost one
 * image copy. The buffer is rebuilt at most 30 times a second. */
import { CELLS_H, CELLS_W, cellInBounds, cellIndex, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { POND, hasTree, pondDisc, treeCanopy } from "./park-geometry.ts";
import { bareAt, groundArt } from "./ground-art.ts";

/** Blade pixels per cell. */
const ART = 8;
type Blade = { i: number; j: number; h: number; color: number; phase: number; flower: number; splay: number };
/** Dark root to bright tip, matched to the painted park grass. */
const COLORS = ["#2a4322", "#335226", "#3f652e", "#4d7837", "#5f8e46", "#76a85a"];
const FLOWERS = ["#e8d57a", "#e6e1d6", "#c96a5a", "#b7a3d6"];
const PALETTE = [...COLORS, ...FLOWERS];
/** The palette as little-endian RGBA words for the pixel buffer. */
const PALETTE32 = Uint32Array.from(PALETTE, (hex) => {
  const v = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0;
});
/** Blade bend by height: CURVE[h][k] = (k / h)^1.5. */
const CURVE = Array.from({ length: 8 }, (_, h) => Float32Array.from({ length: h + 1 }, (_, k) => (h ? Math.pow(k / h, 1.5) : 0)));
/** How hard the wind blows, in pixels of lean at a blade's tip. */
const WIND = { calm: 0.8, cloud: 1.1, rain: 1.7 };

/** Someone standing or walking in the parks: position and size in cells. */
export type Walker = { x: number; y: number; size: number };

export type GrassFrame = {
  c: CanvasRenderingContext2D;
  /** Canvas pixels per cell (the camera is already applied). */
  px: number;
  now: number;
  dt: number;
  wind: keyof typeof WIND;
  walkers: readonly Walker[];
  reduceMotion: boolean;
};

export class ParkGrass {
  private map: CityMap | null = null;
  private plans: (Blade[] | null)[] = [];
  private area: { x0: number; x1: number; y0: number; y1: number } | null = null;
  /** Recent disturbance per cell (0..1), for the wobble after someone passes. */
  private stir = new Map<number, number>();
  private buffer: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; px: Uint32Array } | null = null;
  private builtAt = -Infinity;

  /** Plans the blades for `map` (once per city). */
  sync(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.stir.clear();
    this.builtAt = -Infinity;
    this.plans = Array.from({ length: CELLS_W * CELLS_H }, (_, i) => plan(map, i % CELLS_W, Math.floor(i / CELLS_W)));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    this.plans.forEach((b, i) => {
      if (!b?.length) return;
      const x = i % CELLS_W, y = Math.floor(i / CELLS_W);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    });
    this.area = x0 === Infinity ? null : { x0, x1, y0, y1 };
  }

  /** How many blades the parks hold (tests, tuning). */
  get bladeCount() {
    return this.plans.reduce((n, b) => n + (b?.length ?? 0), 0);
  }

  draw(f: GrassFrame) {
    const area = this.area;
    if (!area) return;
    this.settle(f);
    const buf = this.pixelBuffer((area.x1 - area.x0 + 3) * ART, (area.y1 - area.y0 + 2) * ART);
    if (!buf) return;
    const ox = (area.x0 - 1) * ART, oy = (area.y0 - 1) * ART;
    if (f.reduceMotion ? this.builtAt === -Infinity : f.now - this.builtAt >= 1000 / 30) {
      this.builtAt = f.now;
      this.paint(buf, ox, oy, f);
      buf.ctx.putImageData(buf.img, 0, 0);
    }
    const c = f.c;
    c.save();
    c.scale(f.px / ART, f.px / ART);
    c.imageSmoothingEnabled = false;
    c.drawImage(buf.canvas, ox, oy);
    c.restore();
  }

  /** Walking through grass stirs it; it settles over a second or two. */
  private settle(f: GrassFrame) {
    for (const [k, e] of this.stir) {
      const next = e * Math.exp(-f.dt * 1.8);
      if (next < 0.01) this.stir.delete(k);
      else this.stir.set(k, next);
    }
    if (f.reduceMotion) return;
    for (const w of f.walkers) {
      const i = cellIndex(Math.floor(w.x), Math.floor(w.y));
      if (this.plans[i]?.length) this.stir.set(i, Math.min(1, (this.stir.get(i) ?? 0) + f.dt * 4));
    }
  }

  private paint(buf: NonNullable<ParkGrass["buffer"]>, ox: number, oy: number, f: GrassFrame) {
    const { px, img } = buf, W = img.width, H = img.height;
    px.fill(0);
    const put = (color: number, x: number, y: number, h: number) => {
      const bx = x - ox;
      if (bx < 0 || bx >= W) return;
      for (let yy = Math.max(0, y - oy), end = Math.min(H, y - oy + h); yy < end; yy++) px[yy * W + bx] = PALETTE32[color];
    };
    const near = nearbyWalkers(f.walkers);
    const t = f.now / 1000, wind = WIND[f.wind];
    for (let i = 0; i < this.plans.length; i++) {
      const list = this.plans[i];
      if (!list?.length) continue;
      const cx = i % CELLS_W, cy = (i - cx) / CELLS_W;
      const stir = this.stir.get(i) ?? 0, walkers = near.get(i);
      for (const b of list) {
        const gx = cx * ART + b.i, gy = cy * ART + b.j;
        let lean: number;
        if (f.reduceMotion) lean = b.splay + wind * 0.35;
        else {
          // Steady lean, a slow sway, and gusts that sweep across in bands.
          const sway = Math.sin(t * 2.1 + b.phase + gx * 0.06) * 0.5 + Math.sin(t * 3.7 + b.phase * 2) * 0.2;
          const band = Math.sin(gx * 0.021 + gy * 0.009 - t * 1.6);
          const gust = Math.pow(Math.max(0, band), 3) * 1.6;
          lean = b.splay + wind * (0.35 + sway * 0.45 + gust) + stir * Math.sin(t * 12 + b.phase) * 1.6;
        }
        // Parted and pressed down around whoever walks through.
        let press = 0;
        for (const w of walkers ?? []) {
          const dx = gx - w.x * ART, dy = gy - w.y * ART, reach = w.size * ART + 3;
          const k = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy * 2.25) / reach);
          if (k > press) press = k;
          lean += k * 3 * (dx >= 0 ? 1 : -1);
        }
        const height = Math.max(1, Math.round(b.h * (1 - press * 0.5)));
        // Runs of pixels that share a column, shaded dark at the root and
        // light at the tip.
        const curve = CURVE[b.h];
        let lastX = gx, start = 0;
        for (let k = 0; k <= height; k++) {
          const bx = k === height ? NaN : gx + Math.round(lean * curve[k]);
          if (bx === lastX && k !== height) continue;
          if (k > start) put(start === 0 ? b.color % 2 : k >= height - 1 ? b.color + 2 : b.color + 1, lastX, gy - k + 1, k - start);
          start = k;
          lastX = bx;
        }
        if (b.flower) put(COLORS.length + b.flower - 1, gx + Math.round(lean * curve[height - 1]), gy - height, 1);
      }
    }
  }

  private pixelBuffer(w: number, h: number) {
    if (typeof document === "undefined") return null;
    if (!this.buffer || this.buffer.img.width !== w || this.buffer.img.height !== h) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const img = ctx.createImageData(w, h);
      this.buffer = { canvas, ctx, img, px: new Uint32Array(img.data.buffer) };
      this.builtAt = -Infinity;
    }
    return this.buffer;
  }
}

/** Walkers by the cells they can bend blades in: their own and the eight around. */
function nearbyWalkers(walkers: readonly Walker[]) {
  const out = new Map<number, Walker[]>();
  for (const w of walkers)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.floor(w.x) + dx, y = Math.floor(w.y) + dy;
        if (!cellInBounds(x, y)) continue;
        const i = cellIndex(x, y);
        const list = out.get(i);
        if (list) list.push(w);
        else out.set(i, [w]);
      }
  return out;
}

/** Park cell (cx, cy)'s blades: clumps of two to four fanning out from one
 * root, none under a tree's canopy, on a pond's shore or on bare dirt, none reaching out
 * of the cell's top unless the cell above is park too. */
function plan(map: CityMap, cx: number, cy: number): Blade[] | null {
  if (map.type[cellIndex(cx, cy)] !== CellType.PARK) return null;
  const r = (k: number) => hash01(cx, cy, 300 + k);
  const openAbove = cellInBounds(cx, cy - 1) && map.type[cellIndex(cx, cy - 1)] === CellType.PARK;
  const blocked = covers(map, cx, cy), ground = groundArt(map);
  const out: Blade[] = [];
  const clumps = 2 + Math.floor(r(0) * 3);
  for (let k = 1; k <= clumps; k++) {
    const i = 1 + Math.floor(r(k) * 6), j = 3 + Math.floor(r(k + 20) * 5);
    const tall = 2 + Math.floor(r(k + 40) * 3), color = Math.floor(r(k + 60) * 4), phase = r(k + 80) * Math.PI * 2;
    const n = 2 + Math.floor(r(k + 100) * 3);
    for (let q = 0; q < n; q++) {
      const side = q - (n - 1) / 2, bi = i + Math.round(side);
      let h = Math.max(2, tall - Math.abs(Math.round(side * 2)));
      if (!openAbove) h = Math.min(h, j);
      if (bi < 0 || bi >= ART || bareAt(ground, cx * ART + bi, cy * ART + j) || blocked(cx + bi / ART, cy + j / ART) || blocked(cx + bi / ART, cy + (j - h) / ART)) continue;
      out.push({
        i: bi, j, h, color: Math.max(0, color - (q % 2)), phase: phase + q * 0.35, splay: side * 0.9,
        flower: q === 0 && r(k + 120) < 0.12 ? 1 + Math.floor(r(k + 140) * FLOWERS.length) : 0,
      });
    }
  }
  return out.sort((a, b) => a.j - b.j);
}

/** Whether a point (in cells) near (cx, cy) lies under a tree's canopy or
 * on a pond's outlined shore. */
function covers(map: CityMap, cx: number, cy: number) {
  const discs: { x: number; y: number; r: number }[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy;
      if (!cellInBounds(x, y)) continue;
      if (hasTree(map, x, y)) {
        const t = treeCanopy(x, y);
        discs.push({ x: t.x, y: t.y, r: t.r + 0.1 });
      }
      if (map.type[cellIndex(x, y)] === CellType.WATER) discs.push(pondDisc(x, y, POND.outline + 0.04));
    }
  return (x: number, y: number) => discs.some((d) => (x - d.x) ** 2 + (y - d.y) ** 2 < d.r * d.r);
}
