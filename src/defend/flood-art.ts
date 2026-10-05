/** The magic boats' water as it is drawn: pixel art at `ART` pixels a cell,
 * like the parks' ponds, in the same bands (a black outline, a wet muddy
 * bank, shallows, open water and a deeper heart), with the bank mirrored
 * into it as on the ponds, wavering with the shimmer.
 *
 * Over the water: rings spreading from the boat's wake, raindrops' rings
 * when it rains, moving crests and the odd magical sparkle; buildings the
 * water sank going down into it (`paintStanding`, clipped to their lot and
 * drawn deeper and bluer until gone) amid bubbles and a burst of rings, and
 * wisps of steam where the water dries. As each pool dries the city layer's
 * rubble shows through. Presentation only: everything is drawn from the
 * sim's floods and sinkings and hashes of the battle's time. */
import { CELLS_H, CELLS_W, hash01 } from "./grid.ts";
import { paintStanding } from "./city-layer.ts";
import type { AreaId } from "./areas.ts";
import { HOLD, SINK_SECONDS, floodRadius } from "./boats.ts";
import type { DefendSim } from "./sim.ts";

/** Art pixels a cell (the ponds' scale). */
const ART = 8;
const W = CELLS_W * ART, H = CELLS_H * ART;

const abgr = (hex: number, a = 255) => ((a << 24) | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >> 16) & 0xff)) >>> 0;
/** Bands by depth in art pixels, edge first, as the ponds'. */
const OUTLINE = abgr(0x0b0907), BANK = abgr(0x3a3524), SHALLOWS = abgr(0x2a5550), OPEN = abgr(0x2b5d71), DEEP = abgr(0x244f66);
const CREST = abgr(0x4f8fa8), GLINT = abgr(0x9cc8d6), SPARK = abgr(0xe4f8ff), ARCANE = abgr(0xb9a6ff);
/** Where each band begins, in art pixels from the edge. */
const BANDS = { bank: 1, shallows: 2.2, open: 4.5, deep: 10 };
const REFLECTION = { alpha: 0.5, tint: 0.4 };

export type FloodFrame = {
  area?: AreaId;
  c: CanvasRenderingContext2D;
  /** Canvas pixels a cell (the camera already applied). */
  px: number;
  sim: DefendSim;
  rain: boolean;
  reduceMotion: boolean;
  /** Mirror the bank into the water (off with the effects setting). */
  reflections: boolean;
  /** The cached city layer, at `layerScale` times the canvas resolution. */
  layer: HTMLCanvasElement;
  layerScale: number;
};

type Box = { x: number; y: number; w: number; h: number };
type Raster = { pixels: Uint32Array<ArrayBuffer>; image: ImageData };

export class FloodArt {
  private depth = new Float32Array(W * H);
  private rasters: Partial<Record<"base" | "top" | "mask", Raster>> = {};
  private base: HTMLCanvasElement | null = null;
  private top: HTMLCanvasElement | null = null;
  private mask: HTMLCanvasElement | null = null;
  private mirror: HTMLCanvasElement | null = null;
  private out: HTMLCanvasElement | null = null;

  draw(f: FloodFrame) {
    const { sim } = f;
    if ((!sim.floods.length && !sim.sinkings.length) || typeof document === "undefined") return;
    const t = f.reduceMotion ? 0 : sim.time;
    const box = this.box(sim);
    if (box) {
      this.fill(sim, box);
      const { base, top, mask } = this.paint(f, box, t);
      this.blit(f.c, f.px, base, box);
      if (f.reflections) this.reflect(f, box, mask, t);
      this.sinking(f, t);
      this.blit(f.c, f.px, top, box);
      this.steam(f, t);
    } else this.sinking(f, t);
  }

  /** The art-pixel box round every pool, on the board. */
  private box(sim: DefendSim): Box | null {
    if (!sim.floods.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const fl of sim.floods) {
      const r = floodRadius(fl);
      x0 = Math.min(x0, fl.x - r); x1 = Math.max(x1, fl.x + r);
      y0 = Math.min(y0, fl.y - r); y1 = Math.max(y1, fl.y + r);
    }
    const x = Math.max(0, Math.floor(x0 * ART) - 2), y = Math.max(0, Math.floor(y0 * ART) - 2);
    const w = Math.min(W, Math.ceil(x1 * ART) + 3) - x, h = Math.min(H, Math.ceil(y1 * ART) + 3) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
  }

  /** How deep each art pixel lies inside the water, in art pixels (below 0
   * outside it): the deepest of the pools over it. */
  private fill(sim: DefendSim, box: Box) {
    const d = this.depth;
    for (let y = box.y; y < box.y + box.h; y++) d.fill(-1, y * W + box.x, y * W + box.x + box.w);
    for (const fl of sim.floods) {
      const r = floodRadius(fl) * ART;
      if (r <= 0) continue;
      const cx = fl.x * ART, cy = fl.y * ART;
      const xa = Math.max(box.x, Math.floor(cx - r)), xb = Math.min(box.x + box.w - 1, Math.ceil(cx + r));
      const ya = Math.max(box.y, Math.floor(cy - r)), yb = Math.min(box.y + box.h - 1, Math.ceil(cy + r));
      for (let y = ya; y <= yb; y++) {
        const oy = y + 0.5 - cy;
        for (let x = xa; x <= xb; x++) {
          const ox = x + 0.5 - cx, v = r - Math.sqrt(ox * ox + oy * oy), i = y * W + x;
          if (v > d[i]) d[i] = v;
        }
      }
    }
  }

  private at(x: number, y: number) {
    return x >= 0 && y >= 0 && x < W && y < H ? this.depth[y * W + x] : -1;
  }

  /** The water in its bands (`base`), what moves on it (`top`) and its open
   * water as a mask for the reflection. */
  private paint(f: FloodFrame, box: Box, t: number) {
    const base = this.raster("base", box), top = this.raster("top", box), mask = this.raster("mask", box);
    const tick = Math.floor(t * 5);
    for (let j = 0; j < box.h; j++)
      for (let i = 0; i < box.w; i++) {
        const x = box.x + i, y = box.y + j, k = j * box.w + i;
        let d = this.depth[y * W + x];
        if (d < 0) continue;
        // Standing walls and the keep rise out of the water, banked round.
        const cx = x >> 3, cy = y >> 3, ox = x & 7, oy = y & 7, solid = f.sim.solid;
        if (solid[cy * CELLS_W + cx]) { this.depth[y * W + x] = -1; continue; }
        if (cx > 0 && solid[cy * CELLS_W + cx - 1]) d = Math.min(d, ox + 0.5);
        if (cx < CELLS_W - 1 && solid[cy * CELLS_W + cx + 1]) d = Math.min(d, ART - ox - 0.5);
        if (cy > 0 && solid[(cy - 1) * CELLS_W + cx]) d = Math.min(d, oy + 0.5);
        if (cy < CELLS_H - 1 && solid[(cy + 1) * CELLS_W + cx]) d = Math.min(d, ART - oy - 0.5);
        this.depth[y * W + x] = d;
        // Band edges broken by a checker dither, as on the ponds.
        const e = d + ((x + y) & 1 ? 0.35 : -0.35);
        base[k] = e < BANDS.bank ? OUTLINE : e < BANDS.shallows ? BANK : e < BANDS.open ? SHALLOWS : e < BANDS.deep ? OPEN : DEEP;
        if (d < BANDS.shallows) continue;
        mask[k] = 0xffffffff;
        if (t) {
          const s = Math.sin(x * 0.45 + t * 1.7) + Math.sin(y * 0.6 - t * 1.3 + x * 0.15);
          if (s > 1.72 && d > BANDS.open) top[k] = CREST;
          const h = hash01(x, y, tick);
          if (h < 0.0025) top[k] = h < 0.0007 ? ARCANE : SPARK;
        }
      }
    const ring = (x: number, y: number, r: number, alpha: number, color = GLINT) => {
      if (alpha <= 0) return;
      ringPixels(x * ART, y * ART, r * ART, (px, py) => {
        const i = px - box.x, j = py - box.y;
        if (i < 0 || j < 0 || i >= box.w || j >= box.h || !mask[j * box.w + i]) return;
        top[j * box.w + i] = blend(base[j * box.w + i], color, alpha);
      });
    };
    if (t) this.rings(f, ring, t);
    return { base: this.toCanvas("base", box), top: this.toCanvas("top", box), mask: this.toCanvas("mask", box) };
  }

  /** Rings: the boat's wake, raindrops, and the burst where something sank. */
  private rings(f: FloodFrame, ring: (x: number, y: number, r: number, alpha: number, color?: number) => void, t: number) {
    const { sim } = f;
    for (const fl of sim.floods)
      if (fl.t < 1.6 && hash01(fl.boat, Math.round(fl.x * 64), Math.round(fl.y * 64)) < 0.3) ring(fl.x, fl.y, fl.t * 0.9, 0.55 * (1 - fl.t / 1.6));
    for (const s of sim.sinkings) {
      const r = sim.map.buildings[s.building].rect;
      // Rings rolling out from where it went down, then many small ones
      // bubbling up all over its lot.
      const big = Math.max(r.w, r.h) / 2;
      for (let k = 0; k < 3; k++) {
        const age = s.t - k * 0.35;
        if (age > 0 && age < 1.8) ring(r.x + r.w / 2, r.y + r.h / 2, big * 0.6 + age * 1.3, 0.95 * (1 - age / 1.8), SPARK);
      }
      for (let k = 0; k < 10 + r.w * r.h * 3; k++) {
        const age = s.t - hash01(s.building, k) * 2.4;
        if (age <= 0 || age >= 1.2) continue;
        ring(r.x + hash01(s.building, k, 1) * r.w, r.y + hash01(s.building, k, 2) * r.h, 0.05 + age * 0.9, 0.9 * (1 - age / 1.2), k % 4 ? GLINT : SPARK);
      }
    }
    if (!f.rain) return;
    const seen = new Set<number>();
    for (const fl of sim.floods) {
      const cx = Math.floor(fl.x), cy = Math.floor(fl.y), R = Math.ceil(floodRadius(fl));
      for (let y = cy - R; y <= cy + R; y++)
        for (let x = cx - R; x <= cx + R; x++) {
          const cell = y * CELLS_W + x;
          if (seen.has(cell) || this.at(x * ART + 4, y * ART + 4) < BANDS.shallows) continue;
          seen.add(cell);
          const phase = t * 1.6 + hash01(cell, 5), n = Math.floor(phase), age = (phase - n) / 1.6;
          if (age < 0.85) ring(x + hash01(cell, n, 1), y + hash01(cell, n, 2), age * 0.6, 0.5 * (1 - age / 0.85));
        }
    }
  }

  /** Write straight into reusable ImageData storage, without a second RGBA
   * allocation and copy for each layer. Capacity grows only up to the board. */
  private raster(which: "base" | "top" | "mask", box: Box): Uint32Array {
    const n = box.w * box.h;
    let raster = this.rasters[which];
    if (!raster || raster.image.width !== box.w || raster.image.height !== box.h) {
      const pixels = raster && raster.pixels.length >= n ? raster.pixels
        : new Uint32Array(Math.min(W * H, Math.max(n, (raster?.pixels.length ?? 0) * 2)));
      const image = new ImageData(new Uint8ClampedArray(pixels.buffer, 0, n * 4), box.w, box.h);
      raster = this.rasters[which] = { pixels, image };
    }
    raster.pixels.fill(0, 0, n);
    return raster.pixels;
  }

  private toCanvas(which: "base" | "top" | "mask", box: Box) {
    const cv = (this[which] ??= document.createElement("canvas"));
    if (cv.width !== box.w || cv.height !== box.h) {
      cv.width = box.w;
      cv.height = box.h;
    }
    const g = cv.getContext("2d")!;
    g.putImageData(this.rasters[which]!.image, 0, 0);
    return cv;
  }

  /** An art-pixel canvas drawn up over its box, crisp. */
  private blit(c: CanvasRenderingContext2D, px: number, cv: HTMLCanvasElement, box: Box) {
    const s = px / ART;
    c.save();
    c.imageSmoothingEnabled = false;
    c.drawImage(cv, box.x * s, box.y * s, box.w * s, box.h * s);
    c.restore();
  }

  /** What stands above each column's waterline, flipped down into the
   * water, shifted row by row with the shimmer, tinted and masked to it. */
  private reflect(f: FloodFrame, box: Box, mask: HTMLCanvasElement, t: number) {
    const mirror = (this.mirror ??= document.createElement("canvas"));
    const out = (this.out ??= document.createElement("canvas"));
    for (const cv of [mirror, out]) if (cv.width !== box.w || cv.height !== box.h) { cv.width = box.w; cv.height = box.h; }
    const m = mirror.getContext("2d")!, k = (f.px * f.layerScale) / ART;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, box.w, box.h);
    m.imageSmoothingEnabled = false;
    for (let i = 0; i < box.w; i++) {
      const x = box.x + i;
      let top = -1;
      for (let y = box.y; y < box.y + box.h; y++) if (this.depth[y * W + x] >= BANDS.shallows) { top = y; break; }
      if (top < 0) continue;
      const depth = box.y + box.h - top, sy = Math.max(0, top - depth), sh = top - sy;
      if (sh <= 0) continue;
      m.setTransform(1, 0, 0, -1, -box.x, 2 * top - box.y);
      m.drawImage(f.layer, x * k, sy * k, k, sh * k, x, sy, 1, sh);
    }
    m.setTransform(1, 0, 0, 1, 0, 0);
    const o = out.getContext("2d")!;
    o.globalCompositeOperation = "source-over";
    o.clearRect(0, 0, box.w, box.h);
    o.imageSmoothingEnabled = false;
    for (let j = 0; j < box.h; j++) {
      const shift = t ? Math.round(Math.sin(t * 2.3 + (box.y + j) * 0.65) * 0.7 + Math.sin(t * 3.7 + (box.y + j) * 1.2) * 0.4) : 0;
      o.drawImage(mirror, 0, j, box.w, 1, shift, j, box.w, 1);
    }
    o.globalCompositeOperation = "source-atop";
    o.globalAlpha = REFLECTION.tint;
    o.fillStyle = "#2b5d71";
    o.fillRect(0, 0, box.w, box.h);
    o.globalAlpha = 1;
    o.globalCompositeOperation = "destination-in";
    o.drawImage(mask, 0, 0);
    o.globalCompositeOperation = "source-over";
    f.c.save();
    f.c.globalAlpha = REFLECTION.alpha;
    this.blit(f.c, f.px, out, box);
    f.c.restore();
  }

  /** Buildings going under: drawn whole, sliding down into their lot,
   * deeper and bluer until gone, bubbling. */
  private sinking(f: FloodFrame, t: number) {
    const { c, px, sim } = f;
    for (const s of sim.sinkings) {
      if (s.t >= SINK_SECONDS) continue;
      const b = sim.map.buildings[s.building], r = b.rect, k = s.t / SINK_SECONDS;
      const x = Math.round(r.x * px), y = Math.round(r.y * px);
      const w = Math.round((r.x + r.w) * px) - x, h = Math.round((r.y + r.h) * px) - y;
      c.save();
      c.beginPath();
      c.rect(x, y, w, h);
      c.clip();
      // It lurches as it goes, then slides down out of sight.
      const lurch = f.reduceMotion ? 0 : Math.sin(s.t * 18 + s.building) * px * 0.04 * (1 - k);
      c.translate(lurch, Math.round(k * Math.sqrt(k) * h * 0.95));
      c.globalAlpha = 1 - k * k * k;
      paintStanding(c, px, sim.map, b, f.area);
      c.restore();
      c.save();
      c.beginPath();
      c.rect(x, y, w, h);
      c.clip();
      c.fillStyle = `rgba(43,93,113,${(0.1 + k * 0.8).toFixed(3)})`;
      c.fillRect(x, y, w, h);
      c.restore();
      // Foam where the water closes round it, and bubbles breaking.
      const p = Math.max(1, Math.round(px / ART));
      c.fillStyle = `rgba(232,246,250,${(0.85 * (1 - k)).toFixed(3)})`;
      for (let n = 0; n < (r.w + r.h) * 6; n++) {
        const u = hash01(s.building, n, 7), side = n % 4;
        const fx = side < 2 ? r.x + u * r.w : r.x + (side === 2 ? 0 : r.w), fy = side < 2 ? r.y + (side === 0 ? 0 : r.h) : r.y + u * r.h;
        if (hash01(s.building, n, Math.floor(t * 10)) < 0.6) c.fillRect(Math.round(fx * px) - p, Math.round(fy * px) - p, p * 2, p);
      }
      for (let n = 0; n < r.w * r.h * 3; n++) {
        if (hash01(s.building, n, Math.floor(t * 8), 3) > 0.35 + k * 0.4) continue;
        const bx = r.x + hash01(s.building, n, 4, Math.floor(t * 8)) * r.w, by = r.y + hash01(s.building, n, 5, Math.floor(t * 8)) * r.h;
        c.fillRect(Math.round(bx * px), Math.round(by * px), p, p);
      }
    }
  }

  /** Wisps of steam rising where the water is drying. */
  private steam(f: FloodFrame, t: number) {
    if (!t) return;
    const { c, px, sim } = f, p = Math.max(1, Math.round(px / ART));
    for (const fl of sim.floods) {
      if (fl.t < fl.life * HOLD || hash01(fl.boat, Math.round(fl.x * 64), Math.round(fl.y * 64), 9) > 0.35) continue;
      const r = floodRadius(fl), dry = (fl.t - fl.life * HOLD) / (fl.life * (1 - HOLD));
      for (let n = 0; n < 3; n++) {
        const a = hash01(fl.boat, n, Math.round(fl.x * 64)) * Math.PI * 2, rise = ((t * 0.6 + n / 3) % 1);
        const x = fl.x + Math.cos(a) * r, y = fl.y + Math.sin(a) * r * 0.8 - rise * 0.6;
        c.fillStyle = `rgba(226,232,236,${(0.4 * (1 - rise) * (1 - dry)).toFixed(3)})`;
        c.fillRect(Math.round(x * px), Math.round(y * px), p * 2, p * 2);
      }
    }
  }
}

/** `color` laid over `under` at `alpha` (both ABGR). */
function blend(under: number, color: number, alpha: number) {
  const a = Math.min(1, alpha);
  const mix = (s: number) => Math.round(((under >> s) & 0xff) * (1 - a) + ((color >> s) & 0xff) * a);
  return ((0xff << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)) >>> 0;
}

/** The art pixels of a ring centred (x, y) of radius `r` (art pixels),
 * flattened for the top-down view as on the ponds. */
function ringPixels(x: number, y: number, r: number, put: (x: number, y: number) => void) {
  if (r < 0.75) return put(Math.floor(x), Math.floor(y));
  const steps = Math.max(8, Math.ceil(r * 6));
  let lx = NaN, ly = NaN;
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2;
    const px = Math.floor(x + Math.cos(a) * r), py = Math.floor(y + Math.sin(a) * r * 0.62);
    if (px === lx && py === ly) continue;
    lx = px;
    ly = py;
    put(px, py);
  }
}
