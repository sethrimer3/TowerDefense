/** Life on the city's ponds, after the dungeon's pools. When it rains,
 * drops fall all over the open water, each a faint pixel ring that spreads
 * and fades; when it doesn't, ducks paddle about (`pond-ducks.ts`), now
 * and then leaving a ring of their own. The bank, its trees and the houses
 * beside it are mirrored into the water, wavering with a faint idle
 * shimmer and pushed about by every ring that passes.
 *
 * Everything keeps to the open water of the pixel-art ponds (`park-art.ts`)
 * and is drawn on their pixel grid. The mirror image is cut from the cached
 * city layer, flipped about each column's shoreline, then copied back in
 * thin strips shifted by the ripples, tinted by the water and masked to
 * it: plain image copies, no pixel readback. Presentation only. */
import { CELLS_W, cellInBounds, cellIndex, defendRandom } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { POND, POND_WATER } from "./park-geometry.ts";
import { ART, openAt, parkArt, type ParkArt } from "./park-art.ts";
import { Ducks, type Walker } from "./pond-ducks.ts";

/** Rain rings: how long one spreads (s), how fast (cells a second), how
 * many fall a second on each cell of water, and how strongly they show. */
const RAIN = { life: 0.85, speed: 0.6, rate: 2.6, alpha: 0.5 };
/** A duck's ring: slower, wider and a little stronger, but rare. */
const WAKE = { life: 1.6, speed: 0.42, alpha: 0.34 };
/** Reflection tuning: opacity, how far the water tints it, and how far (in
 * cells) the shimmer and the ripples push its strips around. */
const REFLECTION = { alpha: 0.55, tint: 0.4, shimmer: 0.03, rippleShift: 0.05, rippleWidth: 0.2 };

/** A ring spreading from (x, y) since `t0` (s): rain's or a duck's. */
type Ring = { x: number; y: number; t0: number; kind: "rain" | "wake"; k: number };
type Wave = { x: number; y: number; r: number; fade: number };
/** One pond: its water cells, its bounding box in cells, and for each
 * column the row its open water starts (the mirror line). */
export type Pond = { cells: [number, number][]; x0: number; x1: number; y0: number; y1: number; shore: Map<number, number> };

export type WaterFrame = {
  c: CanvasRenderingContext2D;
  /** Canvas pixels per cell (the camera is already applied). */
  px: number;
  now: number;
  /** Rain falling on the city. */
  rain: boolean;
  /** How far night has fallen (0..1): ducks sleep at night. */
  night: number;
  /** People and enemies on foot, whom the ducks keep away from. */
  walkers: readonly Walker[];
  reduceMotion: boolean;
  /** The cached city layer, at `layerScale` times the canvas resolution. */
  layer: HTMLCanvasElement;
  layerScale: number;
};

export class PondWater {
  private map: CityMap | null = null;
  private art: ParkArt | null = null;
  private ponds: Pond[] = [];
  private rings: Ring[] = [];
  readonly ducks = new Ducks();
  private rainDue = 0;
  private lastNow = 0;
  private rand = defendRandom("effects");
  private mask: HTMLCanvasElement | null = null;
  private mirror: HTMLCanvasElement | null = null;
  private out: HTMLCanvasElement | null = null;
  private maskKey = "";
  private builtAt = -Infinity;
  private builtKey = "";

  sync(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.art = parkArt(map);
    this.ponds = findPonds(map);
    this.ducks.sync(this.ponds, this.art, this.rand);
    this.rings = [];
    this.maskKey = "";
    this.builtKey = "";
  }

  get pondCount() {
    return this.ponds.length;
  }

  draw(f: WaterFrame) {
    if (!this.ponds.length || !this.art || typeof document === "undefined") return;
    const t = f.now / 1000;
    const dt = this.lastNow ? Math.min(0.1, Math.max(0, t - this.lastNow)) : 0;
    this.lastNow = t;
    this.rings = this.rings.filter((r) => t >= r.t0 && t - r.t0 < (r.kind === "rain" ? RAIN.life : WAKE.life));
    if (f.rain) this.rainOn(f, t);
    else this.rainDue = 0;
    // Ducks shelter from the rain; out in the dry they paddle about.
    if (!f.rain) this.ducks.update(dt, f, (x, y, k) => this.rings.push({ x, y, t0: t, kind: "wake", k }));
    const waves = f.reduceMotion ? [] : this.waves(t);
    this.drawReflections(f, t, waves);
    this.drawRings(f, t);
    if (!f.rain) this.ducks.draw(f.c, f.px, f.now, this.art);
  }

  // ── Rings ─────────────────────────────────────────────────────────────
  /** Rain all over the open water: a few drops a second on every cell. */
  private rainOn(f: WaterFrame, t: number) {
    if (f.reduceMotion) return;
    // Catch up at most a second (a hidden tab or a pause never floods the ponds).
    if (this.rainDue === 0 || this.rainDue > t + 1 || this.rainDue < t - 1) this.rainDue = t;
    const cells = this.ponds.reduce((n, p) => n + p.cells.length, 0);
    while (this.rainDue <= t) {
      this.rainDue += 1 / (cells * RAIN.rate);
      const pond = this.ponds[Math.floor(this.rand() * this.ponds.length)];
      const [cx, cy] = pond.cells[Math.floor(this.rand() * pond.cells.length)];
      const x = cx + this.rand(), y = cy + this.rand();
      if (!openAt(this.art!, Math.floor(x * ART), Math.floor(y * ART))) continue;
      this.rings.push({ x, y, t0: this.rainDue, kind: "rain", k: 0.6 + this.rand() * 0.4 });
      if (this.rings.length > 220) this.rings.shift();
    }
  }

  /** Every ring spreading right now: centre, radius and strength. */
  private waves(t: number): Wave[] {
    const out: Wave[] = [];
    for (const r of this.rings) {
      const kind = r.kind === "rain" ? RAIN : WAKE, age = t - r.t0;
      out.push({ x: r.x, y: r.y, r: age * kind.speed, fade: (1 - age / kind.life) * r.k * (r.kind === "rain" ? 0.5 : 1) });
    }
    return out.filter((w) => w.fade > 0);
  }

  /** Each ring as a flattened ring of art pixels, only on open water. */
  private drawRings(f: WaterFrame, t: number) {
    const { c, px } = f, s = px / ART;
    c.save();
    for (const r of this.rings) {
      const kind = r.kind === "rain" ? RAIN : WAKE, age = t - r.t0, fade = 1 - age / kind.life;
      const R = age * kind.speed * ART;
      c.fillStyle = `rgba(196,228,240,${(kind.alpha * fade * r.k).toFixed(3)})`;
      ringPixels(r.x * ART, r.y * ART, R, (x, y) => {
        if (openAt(this.art!, x, y)) c.fillRect(x * s, y * s, s, s);
      });
    }
    c.restore();
  }

  // ── Reflections ──────────────────────────────────────────────────────
  private drawReflections(f: WaterFrame, t: number, waves: Wave[]) {
    const { px } = f;
    const box = this.box(px);
    if (!box) return;
    const mask = this.ensureMask(f, box);
    // Redrawn at most 30 times a second while rings pass, ten times a second
    // for the idle shimmer, and not at all while nothing moves.
    const tick = f.reduceMotion ? 0 : Math.floor(t * 10);
    const key = `${box.key}|${f.layer.width}|${tick}`;
    if (key !== this.builtKey || (waves.length && f.now - this.builtAt >= 1000 / 30)) {
      this.builtKey = key;
      this.builtAt = f.now;
      this.paintMirror(f, box);
      this.compose(f, box, mask, f.reduceMotion ? 0 : tick / 10, waves);
    }
    const c = f.c;
    c.save();
    c.globalAlpha = REFLECTION.alpha;
    c.drawImage(this.out!, box.x, box.y, box.w, box.h);
    c.restore();
  }

  /** The canvas-pixel box around every pond, whole pixels. */
  private box(px: number) {
    if (!this.ponds.length) return null;
    const x0 = Math.min(...this.ponds.map((p) => p.x0)) - 1, x1 = Math.max(...this.ponds.map((p) => p.x1)) + 2;
    const y0 = Math.min(...this.ponds.map((p) => p.y0)) - 1, y1 = Math.max(...this.ponds.map((p) => p.y1)) + 2;
    const x = Math.floor(x0 * px), y = Math.floor(y0 * px);
    const w = Math.ceil(x1 * px) - x, h = Math.ceil(y1 * px) - y;
    return { x, y, w, h, key: `${x},${y},${w},${h}` };
  }

  /** Opaque where there is open water: the pixel art's own mask, cut to the box. */
  private ensureMask(f: WaterFrame, box: { x: number; y: number; w: number; h: number; key: string }) {
    if (!this.mask) this.mask = document.createElement("canvas");
    if (this.maskKey === box.key) return this.mask;
    this.maskKey = box.key;
    this.mask.width = box.w;
    this.mask.height = box.h;
    const m = this.mask.getContext("2d")!;
    m.imageSmoothingEnabled = false;
    const k = ART / f.px;
    if (this.art?.mask) m.drawImage(this.art.mask, box.x * k, box.y * k, box.w * k, box.h * k, 0, 0, box.w, box.h);
    return this.mask;
  }

  /** What stands above each column's shoreline, flipped down into the water. */
  private paintMirror(f: WaterFrame, box: { x: number; y: number; w: number; h: number }) {
    const mirror = (this.mirror ??= document.createElement("canvas"));
    if (mirror.width !== box.w || mirror.height !== box.h) {
      mirror.width = box.w;
      mirror.height = box.h;
    }
    const m = mirror.getContext("2d")!, { px, layer, layerScale: k } = f;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, box.w, box.h);
    m.imageSmoothingEnabled = false;
    for (const pond of this.ponds)
      for (const [cx, top] of pond.shore) {
        // Mirror about the top of the open water in this column.
        const line = (top + 0.5 - POND.open * 0.9) * px;
        const depth = (pond.y1 + 1) * px - line;
        const sx = Math.floor(cx * px), sw = Math.ceil((cx + 1) * px) - sx;
        const sy = Math.max(0, line - depth);
        const sh = line - sy;
        if (sh <= 0) continue;
        m.setTransform(1, 0, 0, -1, -box.x, 2 * line - box.y);
        m.drawImage(layer, sx * k, sy * k, sw * k, sh * k, sx, sy, sw, sh);
        // The trees stand apart from the city layer, over the walkers.
        const a = ART / px, trees = this.art?.canopies;
        if (trees) m.drawImage(trees, sx * a, sy * a, sw * a, sh * a, sx, sy, sw, sh);
      }
    m.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The mirror copied back in thin rows, each shifted by the shimmer and
   * the rings passing through it, then tinted and masked to the water. */
  private compose(f: WaterFrame, box: { x: number; y: number; w: number; h: number }, mask: HTMLCanvasElement, time: number, waves: Wave[]) {
    const out = (this.out ??= document.createElement("canvas"));
    if (out.width !== box.w || out.height !== box.h) {
      out.width = box.w;
      out.height = box.h;
    }
    const o = out.getContext("2d")!, { px } = f;
    o.globalCompositeOperation = "source-over";
    o.clearRect(0, 0, box.w, box.h);
    o.imageSmoothingEnabled = false;
    const strip = Math.max(1, Math.round(px / 8));
    for (let y = 0; y < box.h; y += strip) {
      const cy = (box.y + y + strip / 2) / px;
      let shift = time ? Math.sin(time * 2.3 + cy * 5.1) * REFLECTION.shimmer + Math.sin(time * 3.7 + cy * 9.3) * REFLECTION.shimmer * 0.5 : 0;
      for (const w of waves) {
        const dy = Math.abs(cy - w.y);
        if (dy > w.r + REFLECTION.rippleWidth) continue;
        // A ring crosses this row where its circle does; push the row
        // sideways there, more the stronger the ring.
        const half = Math.sqrt(Math.max(0, w.r * w.r - dy * dy));
        const k = Math.max(0, 1 - Math.abs(dy - w.r) / REFLECTION.rippleWidth) + (half > 0 ? 0.3 : 0);
        shift += Math.sin((w.r - dy) * 18) * REFLECTION.rippleShift * w.fade * Math.min(1, k);
      }
      o.drawImage(this.mirror!, 0, y, box.w, strip, Math.round(shift * px), y, box.w, strip);
    }
    o.globalCompositeOperation = "source-atop";
    o.globalAlpha = REFLECTION.tint;
    o.fillStyle = POND_WATER;
    o.fillRect(0, 0, box.w, box.h);
    o.globalAlpha = 1;
    o.globalCompositeOperation = "destination-in";
    o.drawImage(mask, 0, 0);
    o.globalCompositeOperation = "source-over";
  }

}

/** The city's ponds: each connected group of water cells. */
function findPonds(map: CityMap): Pond[] {
  const seen = new Set<number>(), ponds: Pond[] = [];
  for (let i = 0; i < map.type.length; i++) {
    if (map.type[i] !== CellType.WATER || seen.has(i)) continue;
    const cells: [number, number][] = [], queue = [i];
    seen.add(i);
    while (queue.length) {
      const j = queue.pop()!, x = j % CELLS_W, y = (j - x) / CELLS_W;
      cells.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!cellInBounds(nx, ny)) continue;
        const k = cellIndex(nx, ny);
        if (map.type[k] === CellType.WATER && !seen.has(k)) {
          seen.add(k);
          queue.push(k);
        }
      }
    }
    const shore = new Map<number, number>();
    for (const [x, y] of cells) shore.set(x, Math.min(shore.get(x) ?? Infinity, y));
    ponds.push({
      cells, shore,
      x0: Math.min(...cells.map((c) => c[0])), x1: Math.max(...cells.map((c) => c[0])),
      y0: Math.min(...cells.map((c) => c[1])), y1: Math.max(...cells.map((c) => c[1])),
    });
  }
  return ponds;
}

/** The art pixels of a ring centred (x, y) of radius `r` (art pixels),
 * flattened for the top-down view; a fresh one is a single pixel. */
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

