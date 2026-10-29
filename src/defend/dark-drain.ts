/** Presentation-only crowd estimate. Fixed board buckets and a small reusable
 * alpha field; no pairwise enemy queries, scene copies, filters or readbacks. */
import { ENEMIES } from "./catalog.ts";
import { CELLS_W, CELLS_H } from "./grid.ts";
import type { DefendSim, Enemy } from "./sim.ts";

export const DARK_DRAIN = { bucket: 4, samples: 2, threshold: 10, full: 60, radius: 7, interval: 100, contrast: .3, onset: .22 } as const;
export const DARK_GLOW = { rgb: [148, 8, 38], opacity: .65, radius: 2.5 } as const;
const COLS = Math.ceil(CELLS_W / DARK_DRAIN.bucket), ROWS = Math.ceil(CELLS_H / DARK_DRAIN.bucket);
export const DRAIN_W = CELLS_W * DARK_DRAIN.samples, DRAIN_H = CELLS_H * DARK_DRAIN.samples;
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Stable radial falloff, including an exactly transparent outer edge. */
export function drainFalloff(distance: number, radius: number) {
  return smooth(Math.max(0, Math.min(1, (1 - distance / radius) / .92)));
}

// Lookup by normalized squared distance: no square roots in the field loop.
const FALLOFF = Float32Array.from({ length: 1025 }, (_, i) => drainFalloff(Math.sqrt(i / 1024), 1));

type Bounds = { x: number; y: number; w: number; h: number };

export class DarkDensity {
  readonly field = new Float32Array(DRAIN_W * DRAIN_H);
  readonly glow = new Float32Array(DRAIN_W * DRAIN_H);
  private counts = new Uint32Array(COLS * ROWS);
  private xs = new Float64Array(COLS * ROWS);
  private ys = new Float64Array(COLS * ROWS);
  bounds: Bounds | null = null;
  glowBounds: Bounds | null = null;
  active = false;
  glowing = false;

  update(enemies: readonly Enemy[]) {
    const { counts, xs, ys, field, glow } = this;
    counts.fill(0); xs.fill(0); ys.fill(0); field.fill(0); glow.fill(0); this.bounds = this.glowBounds = null; this.active = this.glowing = false;
    for (const e of enemies) {
      if (e.hp <= 0 || e.raidProxy || e.fortressPart || ENEMIES[e.kind].faction !== "darkOne") continue;
      if (!(e.x >= 0 && e.x < CELLS_W && e.y >= 0 && e.y < CELLS_H)) continue;
      const i = Math.floor(e.y / DARK_DRAIN.bucket) * COLS + Math.floor(e.x / DARK_DRAIN.bucket);
      counts[i]++; xs[i] += e.x; ys[i] += e.y;
    }
    for (let by = 0; by < ROWS; by++) for (let bx = 0; bx < COLS; bx++) {
      if (!counts[by * COLS + bx]) continue;
      // A local 3 x 3 neighborhood crosses bucket boundaries. Each occupied
      // bucket emits once at its own centroid; max blending prevents seams and
      // overlapping weak groups from unexpectedly becoming fully gray.
      let count = 0;
      for (let y = Math.max(0, by - 1); y <= Math.min(ROWS - 1, by + 1); y++)
        for (let x = Math.max(0, bx - 1); x <= Math.min(COLS - 1, bx + 1); x++) count += counts[y * COLS + x];
      const i = by * COLS + bx, cx = xs[i] / counts[i], cy = ys[i] / counts[i];
      // A visible onset, then a gently easing rise; the previous 1/51 onset
      // was almost imperceptible in the opening wave's already muted forest.
      const progress = Math.min(1, Math.max(0, (count - DARK_DRAIN.threshold) / (DARK_DRAIN.full - DARK_DRAIN.threshold)));
      if (count >= DARK_DRAIN.threshold) {
        const strength = DARK_DRAIN.onset + (1 - DARK_DRAIN.onset) * Math.sqrt(progress);
        this.emit(field, cx, cy, DARK_DRAIN.radius + 3 * strength, strength);
        this.active = true;
      }
      // Even one dark enemy has a quiet night halo. Crowds merge through the
      // same bounded max-blended field, rather than stacking per-unit lights.
      const heat = Math.min(1, Math.sqrt(count / DARK_DRAIN.full));
      this.emit(glow, cx, cy, DARK_GLOW.radius + 3 * heat, .12 + .88 * heat);
      this.glowing = true;
    }
    return this.active;
  }

  private emit(field: Float32Array, cx: number, cy: number, radius: number, strength: number) {
    const left = Math.max(0, Math.floor((cx - radius) * DARK_DRAIN.samples));
    const right = Math.min(DRAIN_W - 1, Math.ceil((cx + radius) * DARK_DRAIN.samples));
    const top = Math.max(0, Math.floor((cy - radius) * DARK_DRAIN.samples));
    const bottom = Math.min(DRAIN_H - 1, Math.ceil((cy + radius) * DARK_DRAIN.samples));
    // Include interpolation's edge texel. Clip compositing to the affected
    // world region so a small group does not require a full-viewport blend.
    const x = Math.max(0, left - 1) / DARK_DRAIN.samples, y = Math.max(0, top - 1) / DARK_DRAIN.samples;
    const rightEdge = Math.min(DRAIN_W, right + 2) / DARK_DRAIN.samples;
    const bottomEdge = Math.min(DRAIN_H, bottom + 2) / DARK_DRAIN.samples;
    const key = field === this.glow ? "glowBounds" : "bounds", old = this[key];
    if (old) {
      const r = Math.max(rightEdge, old.x + old.w), b = Math.max(bottomEdge, old.y + old.h);
      old.x = Math.min(x, old.x); old.y = Math.min(y, old.y); old.w = r - old.x; old.h = b - old.y;
    } else this[key] = { x, y, w: rightEdge - x, h: bottomEdge - y };
    const scale = 1024 / (radius * radius);
    for (let y = top; y <= bottom; y++) {
      const dy = (y + .5) / DARK_DRAIN.samples - cy, row = y * DRAIN_W;
      for (let x = left; x <= right; x++) {
        const dx = (x + .5) / DARK_DRAIN.samples - cx;
        const lookup = Math.floor((dx * dx + dy * dy) * scale);
        if (lookup >= FALLOFF.length) continue;
        const value = strength * FALLOFF[lookup], index = row + x;
        if (value > field[index]) field[index] = value;
      }
    }
  }
}

/** Gray source with saturation blending drains chroma while preserving scene
 * detail. A second, 30%-strength gray wash reduces contrast around mid-gray.
 * At full density saturation is zero (exceeding the requested 30% reduction),
 * and contrast is 70%. UI/inspection overlays are painted afterward. */
export class DarkDrain {
  readonly density = new DarkDensity();
  private canvas: HTMLCanvasElement | null = null;
  private glowCanvas: HTMLCanvasElement | null = null;
  private mask: HTMLCanvasElement | null = null;
  private pixels: ImageData | null = null;
  private sim: DefendSim | null = null;
  private sampled = -Infinity;
  private time = -Infinity;

  /** Called before combat is painted, so the renderer knows whether to keep
   * its unit/shot alpha. Paused frames reuse both density and raster storage. */
  prepare(sim: DefendSim | null, now: number, night = 0) {
    if (!sim) { this.sim = null; this.density.active = this.density.glowing = false; return false; }
    if (sim !== this.sim || now < this.sampled || now - this.sampled >= DARK_DRAIN.interval && sim.time !== this.time) {
      this.sim = sim; this.sampled = now; this.time = sim.time;
      this.density.update(sim.enemies);
      if (this.density.active) this.canvas = this.raster(this.canvas, this.density.field, [128, 128, 128]);
      if (this.density.glowing) this.glowCanvas = this.raster(this.glowCanvas, this.density.glow, DARK_GLOW.rgb);
    }
    return this.density.active || night > 0 && this.density.glowing;
  }

  private raster(canvas: HTMLCanvasElement | null, field: Float32Array, rgb: readonly number[]) {
    canvas ??= Object.assign(document.createElement("canvas"), { width: DRAIN_W, height: DRAIN_H });
    const off = canvas.getContext("2d")!;
    this.pixels ??= off.createImageData(DRAIN_W, DRAIN_H);
    const d = this.pixels.data;
    for (let i = 0; i < field.length; i++) {
      d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2];
      d[i * 4 + 3] = Math.round(field[i] * 255);
    }
    off.putImageData(this.pixels, 0, 0);
    return canvas;
  }

  /** Keep the existing canopy/structure draw order. Remove actual combat
   * sprite alpha from the effect mask, never from the scenery itself. No
   * scene snapshot, pixel readback, filter or per-enemy light is involved. */
  private protectedMask(c: CanvasRenderingContext2D, px: number, source: HTMLCanvasElement, bounds: Bounds, actors?: HTMLCanvasElement | null) {
    if (!actors) return source;
    this.mask ??= document.createElement("canvas");
    if (this.mask.width !== c.canvas.width || this.mask.height !== c.canvas.height) {
      this.mask.width = c.canvas.width; this.mask.height = c.canvas.height;
    }
    const off = this.mask.getContext("2d")!;
    off.setTransform(1, 0, 0, 1, 0, 0); off.clearRect(0, 0, this.mask.width, this.mask.height);
    off.globalCompositeOperation = "source-over"; off.imageSmoothingEnabled = true;
    off.save(); off.setTransform(c.getTransform()); this.clip(off, px, bounds); off.drawImage(source, 0, 0, CELLS_W * px, CELLS_H * px);
    off.setTransform(1, 0, 0, 1, 0, 0); off.globalCompositeOperation = "destination-out";
    off.drawImage(actors, 0, 0); off.restore(); off.globalCompositeOperation = "source-over";
    return this.mask;
  }

  private clip(c: CanvasRenderingContext2D, px: number, b: Bounds) {
    c.beginPath(); c.rect(b.x * px, b.y * px, b.w * px, b.h * px); c.clip();
  }

  draw(c: CanvasRenderingContext2D, px: number, sim: DefendSim | null, now: number, night = 0, actors?: HTMLCanvasElement | null) {
    if (!this.prepare(sim, now, night)) return;
    const paint = (source: HTMLCanvasElement, operation: GlobalCompositeOperation, bounds: Bounds, alpha = 1) => {
      c.save(); this.clip(c, px, bounds);
      if (actors) c.setTransform(1, 0, 0, 1, 0, 0);
      c.imageSmoothingEnabled = true; c.globalCompositeOperation = operation; c.globalAlpha *= alpha;
      if (actors) c.drawImage(source, 0, 0);
      else c.drawImage(source, 0, 0, CELLS_W * px, CELLS_H * px);
      c.restore();
    };
    if (this.density.active && this.canvas && this.density.bounds) {
      const mask = this.protectedMask(c, px, this.canvas, this.density.bounds, actors);
      paint(mask, "saturation", this.density.bounds);
      paint(mask, "source-over", this.density.bounds, DARK_DRAIN.contrast);
    }
    if (night > 0 && this.density.glowing && this.glowCanvas && this.density.glowBounds) {
      const mask = this.protectedMask(c, px, this.glowCanvas, this.density.glowBounds, actors);
      paint(mask, "source-over", this.density.glowBounds, Math.min(1, night) * DARK_GLOW.opacity);
    }
  }
}
