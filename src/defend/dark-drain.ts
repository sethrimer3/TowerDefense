/** Presentation-only crowd estimate. Fixed board buckets and a small reusable
 * alpha field; no pairwise enemy queries, scene copies, filters or readbacks. */
import { ENEMIES } from "./catalog.ts";
import { CELLS_W, CELLS_H } from "./grid.ts";
import type { DefendSim, Enemy } from "./sim.ts";

export const DARK_DRAIN = { bucket: 4, samples: 2, threshold: 10, full: 60, radius: 7, interval: 100, contrast: .3 } as const;
const COLS = Math.ceil(CELLS_W / DARK_DRAIN.bucket), ROWS = Math.ceil(CELLS_H / DARK_DRAIN.bucket);
export const DRAIN_W = CELLS_W * DARK_DRAIN.samples, DRAIN_H = CELLS_H * DARK_DRAIN.samples;
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Stable radial falloff, including an exactly transparent outer edge. */
export function drainFalloff(distance: number, radius: number) {
  return smooth(Math.max(0, Math.min(1, (1 - distance / radius) / .92)));
}

// Lookup by normalized squared distance: no square roots in the field loop.
const FALLOFF = Float32Array.from({ length: 1025 }, (_, i) => drainFalloff(Math.sqrt(i / 1024), 1));

export class DarkDensity {
  readonly field = new Float32Array(DRAIN_W * DRAIN_H);
  private counts = new Uint32Array(COLS * ROWS);
  private xs = new Float64Array(COLS * ROWS);
  private ys = new Float64Array(COLS * ROWS);
  active = false;

  update(enemies: readonly Enemy[]) {
    const { counts, xs, ys, field } = this;
    counts.fill(0); xs.fill(0); ys.fill(0); field.fill(0); this.active = false;
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
      if (count < DARK_DRAIN.threshold) continue;
      const strength = Math.min(1, (count - DARK_DRAIN.threshold + 1) / (DARK_DRAIN.full - DARK_DRAIN.threshold + 1));
      const i = by * COLS + bx, cx = xs[i] / counts[i], cy = ys[i] / counts[i];
      const radius = DARK_DRAIN.radius + 3 * strength;
      const left = Math.max(0, Math.floor((cx - radius) * DARK_DRAIN.samples));
      const right = Math.min(DRAIN_W - 1, Math.ceil((cx + radius) * DARK_DRAIN.samples));
      const top = Math.max(0, Math.floor((cy - radius) * DARK_DRAIN.samples));
      const bottom = Math.min(DRAIN_H - 1, Math.ceil((cy + radius) * DARK_DRAIN.samples));
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
      this.active = true;
    }
    return this.active;
  }
}

/** Gray source with saturation blending drains chroma while preserving scene
 * detail. A second, 30%-strength gray wash reduces contrast around mid-gray.
 * At full density saturation is zero (exceeding the requested 30% reduction),
 * and contrast is 70%. UI/inspection overlays are painted afterward. */
export class DarkDrain {
  readonly density = new DarkDensity();
  private canvas: HTMLCanvasElement | null = null;
  private pixels: ImageData | null = null;
  private sim: DefendSim | null = null;
  private sampled = -Infinity;
  private time = -Infinity;

  draw(c: CanvasRenderingContext2D, px: number, sim: DefendSim | null, now: number) {
    if (!sim) { this.sim = null; return; }
    if (sim !== this.sim || now < this.sampled || now - this.sampled >= DARK_DRAIN.interval && sim.time !== this.time) {
      this.sim = sim; this.sampled = now; this.time = sim.time;
      this.density.update(sim.enemies);
      if (this.density.active) {
        this.canvas ??= Object.assign(document.createElement("canvas"), { width: DRAIN_W, height: DRAIN_H });
        const off = this.canvas.getContext("2d")!;
        this.pixels ??= off.createImageData(DRAIN_W, DRAIN_H);
        const d = this.pixels.data;
        for (let i = 0; i < this.density.field.length; i++) {
          d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 128;
          d[i * 4 + 3] = Math.round(this.density.field[i] * 255);
        }
        off.putImageData(this.pixels, 0, 0);
      }
    }
    if (!this.density.active || !this.canvas) return;
    c.save();
    c.imageSmoothingEnabled = true;
    c.globalCompositeOperation = "saturation";
    c.drawImage(this.canvas, 0, 0, CELLS_W * px, CELLS_H * px);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha *= DARK_DRAIN.contrast;
    c.drawImage(this.canvas, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
  }
}
