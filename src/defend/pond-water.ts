/** Life on the city's ponds, after the dungeon's pools: water drips from the
 * trees that overhang them (a falling drop, its shadow sharpening, a splash,
 * then spreading rings), rain stipples them with rings, and the bank, its
 * trees and the houses beside it are mirrored into the water, wavering with
 * a faint idle shimmer and pushed about by every ring that passes.
 *
 * The mirror image is cut from the cached city layer, flipped about each
 * column's shoreline, then copied back in thin strips shifted by the
 * ripples, tinted by the water and masked to it. All plain image copies:
 * no pixel readback. Presentation only. */
import { CELLS_W, cellInBounds, cellIndex, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { POND, POND_WATER, hasTree, pondPath, treeCanopy } from "./city-layer.ts";
import { defendRandom } from "./grid.ts";

/** Seconds a drip takes to fall from the leaves. */
const DRIP_FALL = 0.55;
/** Seconds a ring spreads before it fades out, and how fast (cells a second). */
const RING_LIFE = 1.8;
const RING_SPEED = 0.55;
/** Reflection tuning: opacity, how far the water tints it, and how far (in
 * cells) the shimmer and the ripples push its strips around. */
const REFLECTION = { alpha: 0.55, tint: 0.4, shimmer: 0.03, rippleShift: 0.08, rippleWidth: 0.25 };

/** A drip point under a canopy: where it lands (cells), how high it falls
 * from (cells), and its cycle (s). */
type Drip = { x: number; y: number; z: number; period: number; phase: number };
/** A ring spreading from (x, y) since `t0` (s). */
type Ring = { x: number; y: number; t0: number };
/** One pond: its water cells, its bounding box in cells, and for each
 * column the row its open water starts (the mirror line). */
type Pond = { cells: [number, number][]; x0: number; x1: number; y0: number; y1: number; shore: Map<number, number> };

export type WaterFrame = {
  c: CanvasRenderingContext2D;
  /** Canvas pixels per cell (the camera is already applied). */
  px: number;
  now: number;
  /** Rain falling on the city. */
  rain: boolean;
  reduceMotion: boolean;
  /** The cached city layer, at `layerScale` times the canvas resolution. */
  layer: HTMLCanvasElement;
  layerScale: number;
};

export class PondWater {
  private map: CityMap | null = null;
  private ponds: Pond[] = [];
  private drips: Drip[] = [];
  private rings: Ring[] = [];
  private rainDue = 0;
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
    this.ponds = findPonds(map);
    this.drips = this.ponds.flatMap((p) => dripsFor(map, p));
    this.rings = [];
    this.maskKey = "";
    this.builtKey = "";
  }

  /** How many drip points the ponds have (tests, tuning). */
  get dripCount() {
    return this.drips.length;
  }
  get pondCount() {
    return this.ponds.length;
  }

  draw(f: WaterFrame) {
    if (!this.ponds.length || typeof document === "undefined") return;
    const t = f.now / 1000;
    this.spawn(f, t);
    const waves = f.reduceMotion ? [] : this.waves(t);
    this.drawReflections(f, t, waves);
    this.drawSurface(f, t, waves);
  }

  // ── Rings ─────────────────────────────────────────────────────────────
  /** Rain rings, a few a second per pond cell's worth of open water. */
  private spawn(f: WaterFrame, t: number) {
    this.rings = this.rings.filter((r) => t - r.t0 < RING_LIFE && t >= r.t0);
    if (!f.rain || f.reduceMotion) return;
    // Catch up at most a second (a hidden tab or a pause never floods the ponds).
    if (this.rainDue === 0 || this.rainDue > t + 1 || this.rainDue < t - 1) this.rainDue = t;
    const cells = this.ponds.reduce((n, p) => n + p.cells.length, 0);
    while (this.rainDue <= t) {
      this.rainDue += 1 / (cells * 1.6);
      const pond = this.ponds[Math.floor(this.rand() * this.ponds.length)];
      const [cx, cy] = pond.cells[Math.floor(this.rand() * pond.cells.length)];
      this.rings.push({ x: cx + 0.15 + this.rand() * 0.7, y: cy + 0.15 + this.rand() * 0.7, t0: this.rainDue });
      if (this.rings.length > 160) this.rings.shift();
    }
  }

  /** Every ring spreading right now (rain and drips): centre, radius and strength. */
  private waves(t: number) {
    const out: { x: number; y: number; r: number; fade: number }[] = [];
    for (const r of this.rings) {
      const age = t - r.t0;
      out.push({ x: r.x, y: r.y, r: age * RING_SPEED * 0.7, fade: 1 - age / (RING_LIFE * 0.7) });
    }
    for (const d of this.drips) {
      const age = ((t + d.phase) % d.period) - DRIP_FALL;
      if (age >= 0 && age < RING_LIFE) out.push({ x: d.x, y: d.y, r: age * RING_SPEED, fade: 1 - age / RING_LIFE });
    }
    return out.filter((w) => w.fade > 0);
  }

  // ── Reflections ──────────────────────────────────────────────────────
  private drawReflections(f: WaterFrame, t: number, waves: { x: number; y: number; r: number; fade: number }[]) {
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

  /** Opaque where there is open water. */
  private ensureMask(f: WaterFrame, box: { x: number; y: number; w: number; h: number; key: string }) {
    if (!this.mask) this.mask = document.createElement("canvas");
    if (this.maskKey === box.key) return this.mask;
    this.maskKey = box.key;
    this.mask.width = box.w;
    this.mask.height = box.h;
    const m = this.mask.getContext("2d")!;
    m.translate(-box.x, -box.y);
    m.fillStyle = "#fff";
    pondPath(m, f.px, this.ponds.flatMap((p) => p.cells), POND.open);
    m.fill();
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
      }
    m.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The mirror copied back in thin rows, each shifted by the shimmer and
   * the rings passing through it, then tinted and masked to the water. */
  private compose(f: WaterFrame, box: { x: number; y: number; w: number; h: number }, mask: HTMLCanvasElement, time: number, waves: { x: number; y: number; r: number; fade: number }[]) {
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

  // ── The surface: rings, drops and splashes ────────────────────────────
  private drawSurface(f: WaterFrame, t: number, waves: { x: number; y: number; r: number; fade: number }[]) {
    const { c, px } = f;
    c.save();
    pondPath(c, px, this.ponds.flatMap((p) => p.cells), POND.open);
    c.clip();
    const line = Math.max(1, px * 0.06);
    c.lineWidth = line;
    for (const w of waves) {
      if (w.r <= 0.02) continue;
      c.strokeStyle = `rgba(186,222,236,${(w.fade * 0.6).toFixed(2)})`;
      c.beginPath();
      c.ellipse(w.x * px, w.y * px, w.r * px, w.r * px * 0.8, 0, 0, Math.PI * 2);
      c.stroke();
      if (w.r > 0.12) {
        c.strokeStyle = `rgba(130,176,196,${(w.fade * 0.4).toFixed(2)})`;
        c.beginPath();
        c.ellipse(w.x * px, w.y * px, (w.r - 0.1) * px, (w.r - 0.1) * px * 0.8, 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.restore();
    // Drops fall from the leaves, over the bank as well as the water.
    if (!f.reduceMotion) for (const d of this.drips) this.drawDrop(c, px, d, (t + d.phase) % d.period);
  }

  /** A drip: falling from the leaves with its shadow sharpening below, then
   * a few droplets thrown up where it lands. */
  private drawDrop(c: CanvasRenderingContext2D, px: number, d: Drip, local: number) {
    const dot = Math.max(1, Math.round(px * 0.08));
    if (local < DRIP_FALL) {
      const k = local / DRIP_FALL;
      if (k > 0.3) {
        c.fillStyle = `rgba(0,0,0,${(0.35 * k).toFixed(2)})`;
        c.fillRect(Math.round(d.x * px), Math.round(d.y * px), dot, dot);
      }
      const y = d.y - d.z * (1 - k * k);
      c.fillStyle = "rgba(200,232,244,0.9)";
      c.fillRect(Math.round(d.x * px), Math.round(y * px) - dot, dot, dot * 2);
      return;
    }
    const age = local - DRIP_FALL;
    if (age > 0.18) return;
    const up = age * 20;
    c.fillStyle = "rgba(200,232,244,0.9)";
    for (const [dx, dy] of [[-1, -1], [1, -1], [-2, 0], [2, 0]])
      c.fillRect(Math.round(d.x * px + dx * dot * (1 + up)), Math.round(d.y * px + (dy - up) * dot), dot, dot);
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

/** Drip points where a tree's canopy overhangs the pond's water, and one
 * slow drip in the open water for a pond no tree reaches. */
function dripsFor(map: CityMap, pond: Pond): Drip[] {
  const water = new Set(pond.cells.map(([x, y]) => cellIndex(x, y)));
  const drips: Drip[] = [];
  const trees = new Set<number>();
  for (const [x, y] of pond.cells)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (hasTree(map, x + dx, y + dy)) trees.add(cellIndex(x + dx, y + dy));
  for (const i of trees) {
    const tx = i % CELLS_W, ty = (i - tx) / CELLS_W, canopy = treeCanopy(tx, ty);
    // Points around the canopy's edge that hang over water.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + hash01(tx, ty, 400) * 6.28;
      const x = canopy.x + Math.cos(a) * canopy.r * 0.8, y = canopy.y + Math.sin(a) * canopy.r * 0.8;
      if (!water.has(cellIndex(Math.floor(x), Math.floor(y))) || hash01(tx, ty, 401 + k) > 0.5) continue;
      drips.push({ x, y, z: 0.5 + hash01(tx, ty, 410 + k) * 0.3, period: 2.4 + hash01(tx, ty, 420 + k) * 4, phase: hash01(tx, ty, 430 + k) * 7 });
    }
  }
  if (!drips.length) {
    const [x, y] = pond.cells[Math.floor(hash01(pond.x0, pond.y0, 440) * pond.cells.length)];
    drips.push({ x: x + 0.5, y: y + 0.5, z: 0.7, period: 5 + hash01(x, y, 441) * 3, phase: hash01(x, y, 442) * 8 });
  }
  return drips;
}
