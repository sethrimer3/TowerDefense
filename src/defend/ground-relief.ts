/** A bump map for the flagstones outside the city, so the light of fires,
 * blasts, torches and ice catches the stones' edges and the ground reads
 * as 3D: the side of each stone facing a light brightens, the side facing
 * away darkens.
 *
 * The height of the ground is taken from the flagstone art itself (its
 * brightness, softened), and its slope baked once into four masks, one per
 * facing (east, west, south, north), each opaque where the ground faces
 * that way. A light lights a mask through a weight sprite: its falloff
 * times how squarely that facing looks at the light from each point around
 * it. So every pixel is lit by its own direction to the light, with only a
 * few image copies per light and no per-frame pixel work.
 *
 * Fixed lights (tower fires, lanterns) are baked together once; moving
 * ones (flames, ice, blasts, hand torches) are drawn each frame. Only
 * ground outside the city has the masks: inside, the gravel's stones have
 * their own relief (`DefendLighting.drawRelief`). */
import { CELLS_H, CELLS_W, cellIndex } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { floorArtLoaded, paintFloor } from "./city-layer.ts";
import type { AreaId } from "./areas.ts";

/** A light on the relief: centre and reach (cells), strength, and colour. */
export type ReliefLight = { x: number; y: number; r: number; k: number; color: string };

/** Facings, as the unit direction a slope faces. */
const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** The light's height over the ground, as a share of its reach: lower is
 * more grazing (longer, stronger relief). */
const LIGHT_HEIGHT = 0.22;
/** Weight sprite resolution. */
const SPRITE = 96;
/** How strongly lit and shaded slopes show. */
const LIT = 0.85, SHADE = 0.6;
/** Bounded sprite memory, measured in RGBA pixels (32 MiB maximum). */
const CACHE_PIXELS = 8 * 1024 * 1024;
type LightSprite = { passes: HTMLCanvasElement[]; pixels: number };

export class GroundRelief {
  private masks: HTMLCanvasElement[] = [];
  private weights: HTMLCanvasElement[] = [];
  private outside = new Uint8Array(CELLS_W * CELLS_H);
  private key = "";
  private sprites = new Map<string, LightSprite>();
  private spritePixels = 0;
  private map: CityMap | null = null;
  private fixed: HTMLCanvasElement | null = null;
  private fixedKey = "";
  /** The board's size in canvas pixels, as of the last `sync`. */
  private size = { W: 0, H: 0 };

  /** Bakes the masks for `map` at `px` canvas pixels a cell, if anything
   * they depend on changed. False until there is a DOM and the floor art. */
  sync(map: CityMap, px: number, W: number, H: number, area: AreaId = "moss") {
    if (typeof document === "undefined") return false;
    const key = `${W}x${H}:${area}:${floorArtLoaded(area)}`;
    if (map === this.map && key === this.key) return this.masks.length === 4;
    this.map = map;
    this.key = key;
    this.fixedKey = "";
    this.sprites.clear(); this.spritePixels = 0;
    this.size = { W, H };
    for (let i = 0; i < this.outside.length; i++) this.outside[i] = map.type[i] === CellType.OUT ? 1 : 0;
    this.masks = bakeMasks(this.outside, px, W, H, area);
    if (!this.weights.length) this.weights = AXES.map(([ax, ay]) => weightSprite(ax, ay));
    return this.masks.length === 4;
  }

  /** Whether a light at (x, y) of reach r touches the ground outside. */
  private reaches(l: ReliefLight) {
    const x0 = Math.max(0, Math.floor(l.x - l.r)), x1 = Math.min(CELLS_W - 1, Math.ceil(l.x + l.r));
    const y0 = Math.max(0, Math.floor(l.y - l.r)), y1 = Math.min(CELLS_H - 1, Math.ceil(l.y + l.r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.outside[cellIndex(x, y)]) return true;
    return false;
  }

  /** The fixed lights' relief, baked once per `version` (they go out and
   * come back with their buildings), then the moving lights over it. */
  draw(c: CanvasRenderingContext2D, px: number, fixed: { version: string; lights: () => ReliefLight[] }, moving: ReliefLight[], alpha: number) {
    if (this.masks.length !== 4) return;
    const { W, H } = this.size;
    const fixedKey = `${this.key}|${fixed.version}`;
    if (fixedKey !== this.fixedKey) {
      this.fixedKey = fixedKey;
      this.fixed ??= document.createElement("canvas");
      this.fixed.width = W;
      this.fixed.height = H;
      const f = this.fixed.getContext("2d")!;
      for (const l of fixed.lights()) if (this.reaches(l)) this.light(f, px, l);
    }
    c.save();
    c.globalAlpha = alpha;
    c.drawImage(this.fixed!, 0, 0);
    c.restore();
    for (const l of moving) if (l.k > 0.02 && this.reaches(l)) this.light(c, px, { ...l, k: l.k * alpha });
  }

  /** One light: for each facing, its mask times the light's weight, tinted
   * by the light where the ground faces it and darkened where it faces away. */
  private light(c: CanvasRenderingContext2D, px: number, l: ReliefLight) {
    const R = l.r * px;
    const x0 = Math.max(0, Math.floor(l.x * px - R)), y0 = Math.max(0, Math.floor(l.y * px - R));
    const x1 = Math.min(this.size.W, Math.ceil(l.x * px + R)), y1 = Math.min(this.size.H, Math.ceil(l.y * px + R));
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    // Brightness changes independently of the masks, so fading bolts reuse
    // their exact sprites. Do not quantize positions, colours or reach.
    const key = `${px}:${l.x}:${l.y}:${l.r}:${l.color}`;
    let sprite = this.sprites.get(key);
    if (sprite) { this.sprites.delete(key); this.sprites.set(key, sprite); }
    else {
      const pixels = w * h * 8;
      let recycled: LightSprite | undefined;
      while (this.sprites.size && (this.sprites.size >= 256 || this.spritePixels + pixels > CACHE_PIXELS)) {
        const oldest = this.sprites.keys().next().value!;
        const entry = this.sprites.get(oldest)!;
        this.sprites.delete(oldest); this.spritePixels -= entry.pixels;
        recycled ??= entry;
      }
      const passes = recycled?.passes ?? Array.from({ length: 8 }, () => document.createElement('canvas'));
      const sx = l.x * px - R - x0, sy = l.y * px - R - y0;
      for (let a = 0; a < 8; a++) {
        const s = passes[a]; s.width = w; s.height = h;
        const g = s.getContext('2d', { willReadFrequently: true })!;
        const axis = a >> 1;
        g.drawImage(this.masks[a % 2 ? axis ^ 1 : axis], x0, y0, w, h, 0, 0, w, h);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(this.weights[axis], sx, sy, R * 2, R * 2);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = a % 2 ? '#000' : l.color;
        g.fillRect(0, 0, w, h);
      }
      sprite = { passes, pixels };
      // An oversized one-off blast is drawn but never retained.
      if (pixels <= CACHE_PIXELS) { this.sprites.set(key, sprite); this.spritePixels += pixels; }
    }
    c.save();
    for (let a = 0; a < 4; a++) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.min(1, l.k * LIT);
      c.drawImage(sprite.passes[a * 2], x0, y0);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = Math.min(1, l.k * SHADE);
      c.drawImage(sprite.passes[a * 2 + 1], x0, y0);
    }
    c.restore();
  }
}

/** The four facing masks, from the flagstones' brightness as height. */
function bakeMasks(outside: Uint8Array, px: number, W: number, H: number, area: AreaId): HTMLCanvasElement[] {
  const floor = document.createElement("canvas");
  floor.width = W;
  floor.height = H;
  const fc = floor.getContext("2d", { willReadFrequently: true });
  if (!fc) return [];
  paintFloor(fc, px, area);
  const rgba = fc.getImageData(0, 0, W, H).data;
  const height = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) height[i] = (rgba[i * 4] * 0.3 + rgba[i * 4 + 1] * 0.59 + rgba[i * 4 + 2] * 0.11) / 255;
  // Soften the art's speckle so the slopes follow the stones, not the noise.
  const soft = boxBlur(boxBlur(height, W, H, Math.max(1, Math.round(px * 0.06))), W, H, 1);
  const { gx, gy } = slopes(soft, W, H);
  const gain = 1 / Math.max(1e-4, percentile(gx, gy, 0.96));
  const out = AXES.map(() => new ImageData(W, H));
  for (let y = 0; y < H; y++) {
    const cy = Math.min(CELLS_H - 1, Math.floor(y / px));
    for (let x = 0; x < W; x++) {
      const cx = Math.min(CELLS_W - 1, Math.floor(x / px));
      if (!outside[cellIndex(cx, cy)]) continue;
      const i = y * W + x;
      // Height rising to the east means the surface faces west, and so on.
      const face = [-gx[i], gx[i], -gy[i], gy[i]];
      for (let a = 0; a < 4; a++) {
        const v = Math.min(1, Math.max(0, face[a] * gain));
        if (v <= 0.02) continue;
        const d = out[a].data;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
        d[i * 4 + 3] = v * 255;
      }
    }
  }
  return out.map((img) => {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    cv.getContext("2d", { willReadFrequently: true })!.putImageData(img, 0, 0);
    return cv;
  });
}

/** Sobel slopes of `h`. */
function slopes(h: Float32Array, W: number, H: number) {
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const a = h[i - W - 1], b = h[i - W], c = h[i - W + 1], d = h[i - 1], f = h[i + 1], g = h[i + W - 1], k = h[i + W], m = h[i + W + 1];
      gx[i] = (c + 2 * f + m - a - 2 * d - g) / 8;
      gy[i] = (g + 2 * k + m - a - 2 * b - c) / 8;
    }
  return { gx, gy };
}

/** The `q` quantile of the slopes' size, from a sample. */
function percentile(gx: Float32Array, gy: Float32Array, q: number) {
  const step = Math.max(1, Math.floor(gx.length / 20000)), sample: number[] = [];
  for (let i = 0; i < gx.length; i += step) {
    const v = Math.max(Math.abs(gx[i]), Math.abs(gy[i]));
    if (v > 0) sample.push(v);
  }
  sample.sort((a, b) => a - b);
  return sample[Math.floor(sample.length * q)] ?? 0;
}

/** A separable box blur of radius `r`. */
function boxBlur(src: Float32Array, W: number, H: number, r: number) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = r * 2 + 1;
  for (let y = 0; y < H; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = sum / n;
      sum += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = sum / n;
      sum += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

/** How squarely ground facing (ax, ay) looks at a light at the sprite's
 * centre, from each point around it, times the light's falloff. */
function weightSprite(ax: number, ay: number) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = SPRITE;
  const c = cv.getContext("2d", { willReadFrequently: true })!;
  const img = c.createImageData(SPRITE, SPRITE);
  for (let y = 0; y < SPRITE; y++)
    for (let x = 0; x < SPRITE; x++) {
      const ox = (x + 0.5) / (SPRITE / 2) - 1, oy = (y + 0.5) / (SPRITE / 2) - 1;
      const d = Math.sqrt(ox * ox + oy * oy);
      if (d >= 1) continue;
      // The direction from this point to the light, lifted a little off the ground.
      const len = Math.sqrt(d * d + LIGHT_HEIGHT * LIGHT_HEIGHT);
      const facing = Math.max(0, (-ox * ax - oy * ay) / len);
      const v = facing * Math.pow(1 - d, 1.1);
      const k = (y * SPRITE + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.min(255, v * 255 * 1.6);
    }
  c.putImageData(img, 0, 0);
  return cv;
}
