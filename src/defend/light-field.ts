/** The battle's darkness and glow, summed each frame on the light bakes'
 * own lattice (`RES` samples a cell) instead of drawing every pool scaled
 * up onto two board-sized canvases. A frame's work is a few hundred
 * thousand multiplies here and three scaled draws of the results (the
 * darkness, the glow, the torches), where drawing each pool filtered its
 * pixels four times over (two swayed bakes, two layers) and each hand
 * torch's once more.
 *
 * It keeps the canvas recipe's arithmetic: the darkness starts as the
 * ambient overlay and each light carves `1 - alpha × level` out of it
 * (destination-out), the glow adds each light's premultiplied candle colour
 * (lighter, clamped). Hand torches are summed on a layer of their own,
 * which the lighting draws up to the board and keeps to open ground at full
 * resolution, so torchlight still stops crisply at a wall. Every
 * bake's samples lie on this lattice already (their corners are whole
 * cells), so the only resampling is the flames' sub-pixel bob. Pure typed
 * arrays: no canvas, so Node tests can run it. */
import { CELLS_H, CELLS_W } from "./grid.ts";
import { glowColor, lightFalloff } from "../torch-light.ts";

/** Samples per cell, in the light bakes and this field. */
export const RES = 3;
export const FIELD_W = CELLS_W * RES;
export const FIELD_H = CELLS_H * RES;

/** One light's pool as its two bakes (leaning left and right), `cols` ×
 * `rows` samples from cell (`left`, `top`): per sample each bake's alpha
 * (0–1) and premultiplied candle colour (0–255), eight numbers, and per row
 * the span of samples where either holds any light. */
export type PoolSamples = { argb: Float32Array; spans: Int32Array; cols: number; rows: number; left: number; top: number };

/** A light's two bakes' levels (0–1 a sample, `cols` a row) as samples,
 * each in the candle colour of its level, quantized as a canvas holding
 * them would be. */
export function poolSamples(bakes: readonly [Float32Array, Float32Array], cols: number, color: (v: number) => number[]): Pick<PoolSamples, "argb" | "spans"> {
  const n = bakes[0].length,
    rows = n / cols;
  const argb = new Float32Array(n * 8);
  const spans = new Int32Array(rows * 2);
  const px = new Uint8ClampedArray(4);
  for (let y = 0; y < rows; y++) {
    let first = cols,
      last = 0;
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      bakes.forEach((values, side) => {
        const v = values[i];
        if (v <= 0.003) return;
        const [r, g, b] = color(v);
        px[0] = r;
        px[1] = g;
        px[2] = b;
        px[3] = Math.min(255, v * 255);
        if (!px[3]) return;
        const a = px[3] / 255;
        argb.set([a, px[0] * a, px[1] * a, px[2] * a], i * 8 + side * 4);
        first = Math.min(first, x);
        last = x + 1;
      });
    }
    spans[y * 2] = first;
    spans[y * 2 + 1] = Math.max(first, last);
  }
  return { argb, spans };
}

export class LightField {
  /** How much of the darkness each sample keeps, 1 = untouched. */
  readonly keep = new Float32Array(FIELD_W * FIELD_H);
  /** The glow, premultiplied, 0–255 a channel (clamped when painted). */
  readonly glow = [0, 1, 2, 3].map(() => new Float32Array(FIELD_W * FIELD_H));
  /** The hand torches' layer, and the frame each sample was last lit. */
  private dyn = [0, 1, 2, 3].map(() => new Float32Array(FIELD_W * FIELD_H));
  private stamp = new Int32Array(FIELD_W * FIELD_H);
  private frame = 0;

  /** Start a frame: no light yet. */
  clear() {
    this.keep.fill(1);
    for (const ch of this.glow) ch.fill(0);
    this.frame++;
  }

  /** Adds a light's pool shifted down `shift` samples (the flame's bob):
   * each bake carves its `dark` × its alpha out of the darkness and adds
   * its `glow` × its colour to the glow (0 leaves a bake out). */
  addPool(p: PoolSamples, shift: number, dark0: number, glow0: number, dark1: number, glow1: number) {
    const base = Math.floor(shift),
      f = shift - base;
    const y0 = p.top * RES;
    const gy0 = Math.max(0, y0 + base),
      gy1 = Math.min(FIELD_H, y0 + base + p.rows + 1);
    for (let gy = gy0; gy < gy1; gy++) {
      // Rows i and i - 1 of the pool, weighted as a bilinear draw would.
      const i = gy - y0 - base;
      const wi = i < p.rows ? 1 - f : 0,
        wj = i > 0 ? f : 0;
      if (wi) this.addRow(p, gy, i, wi, dark0, glow0, dark1, glow1, wj ? i - 1 : -1, wj);
      else if (wj) this.addRow(p, gy, i - 1, wj, dark0, glow0, dark1, glow1, -1, 0);
    }
  }

  /** Pool row `i` (weight `wi`), and row `j` (weight `wj`) when `j` is
   * not -1, into field row `gy`. */
  private addRow(p: PoolSamples, gy: number, i: number, wi: number, d0: number, g0: number, d1: number, g1: number, j: number, wj: number) {
    const keep = this.keep,
      [gr, gg, gb, ga] = this.glow;
    const { argb, spans, cols } = p;
    const x0 = p.left * RES;
    let first = spans[i * 2],
      last = spans[i * 2 + 1];
    if (j >= 0 && spans[j * 2] < spans[j * 2 + 1]) {
      first = Math.min(first, spans[j * 2]);
      last = Math.max(last, spans[j * 2 + 1]);
    }
    const gx0 = Math.max(0, x0 + first),
      gx1 = Math.min(FIELD_W, x0 + last);
    // Sample offsets (×8) of rows i and j at the field's column 0.
    const ki = (i * cols - x0) * 8,
      kj = j >= 0 ? (j * cols - x0) * 8 : ki;
    if (j < 0) wj = 0;
    let o = gy * FIELD_W + gx0;
    for (let gx = gx0; gx < gx1; gx++, o++) {
      const u = ki + gx * 8,
        v = kj + gx * 8;
      const a0 = argb[u] * wi + argb[v] * wj,
        a1 = argb[u + 4] * wi + argb[v + 4] * wj;
      if (!a0 && !a1) continue;
      keep[o] *= (1 - d0 * a0) * (1 - d1 * a1);
      ga[o] += (g0 * a0 + g1 * a1) * 255;
      gr[o] += g0 * (argb[u + 1] * wi + argb[v + 1] * wj) + g1 * (argb[u + 5] * wi + argb[v + 5] * wj);
      gg[o] += g0 * (argb[u + 2] * wi + argb[v + 2] * wj) + g1 * (argb[u + 6] * wi + argb[v + 6] * wj);
      gb[o] += g0 * (argb[u + 3] * wi + argb[v + 3] * wj) + g1 * (argb[u + 7] * wi + argb[v + 7] * wj);
    }
  }

  /** Adds a hand torch at cell (x, y) reaching `reach` cells at `alpha`
   * onto the torches' layer (summed as `lighter` sums, clamped when
   * painted): the candle palette's soft pool, `TORCH_STEPS` levels deep. */
  addTorch(x: number, y: number, reach: number, alpha: number) {
    if (reach <= 0 || alpha <= 0) return;
    const [dr, dg, db, da] = this.dyn;
    const lut = torchLut();
    const gy0 = Math.max(0, Math.floor((y - reach) * RES)),
      gy1 = Math.min(FIELD_H, Math.ceil((y + reach) * RES));
    const scale = TORCH_STEPS / reach,
      reach2 = reach * reach;
    for (let gy = gy0; gy < gy1; gy++) {
      const dy = (gy + 0.5) / RES - y;
      if (dy * dy >= reach2) continue;
      // The row's samples within reach.
      const half = Math.sqrt(reach2 - dy * dy);
      const gx0 = Math.max(0, Math.floor((x - half) * RES)),
        gx1 = Math.min(FIELD_W, Math.ceil((x + half) * RES));
      for (let gx = gx0; gx < gx1; gx++) {
        const dx = (gx + 0.5) / RES - x;
        const step = (Math.sqrt(dx * dx + dy * dy) * scale) | 0;
        if (step >= TORCH_STEPS) continue;
        const o = gy * FIELD_W + gx;
        if (this.stamp[o] !== this.frame) {
          this.stamp[o] = this.frame;
          dr[o] = dg[o] = db[o] = da[o] = 0;
        }
        const l = step * 4;
        da[o] += alpha * lut[l] * 255;
        dr[o] += alpha * lut[l + 1];
        dg[o] += alpha * lut[l + 2];
        db[o] += alpha * lut[l + 3];
      }
    }
  }

  /** The torches' layer as pixels (see `paintSum`), clamped at once: a
   * torch's pool has no hard edge for a clamp to cut, as a pool cut off by
   * a wall has. */
  paintTorches(out: Uint8ClampedArray) {
    paintSum(out, this.dyn, 0, this.stamp, this.frame);
  }

  /** The darkness as pixels: colour `rgb` at `alpha` (0–1) where nothing
   * carved it. */
  paintDark(out: Uint8ClampedArray, rgb: readonly number[], alpha: number) {
    const a0 = Math.round(alpha * 255);
    const keep = this.keep;
    for (let i = 0, k = 0; i < keep.length; i++, k += 4) {
      out[k] = rgb[0];
      out[k + 1] = rgb[1];
      out[k + 2] = rgb[2];
      out[k + 3] = a0 * keep[i];
    }
  }

  /** The glow as pixels (see `paintSum`). */
  paintGlow(out: Uint8ClampedArray) {
    return paintSum(out, this.glow, MAX_DOUBLINGS);
  }
}

/** Most doublings a summed layer is painted with. */
const MAX_DOUBLINGS = 2;

/** A summed layer (premultiplied, 0–255 a channel) as unpremultiplied
 * pixels, only the samples stamped `frame` when `stamp` is given. `lighter`
 * clamps each channel only once the pools are drawn up to the board, so a
 * saturated sum still spreads full brightness into its edge pixels: where
 * the sum goes past 255 it is painted halved (or quartered, at most `most`
 * doublings), and the
 * number of doublings returned says how many times the drawn-up layer must
 * be added onto itself. */
function paintSum(out: Uint8ClampedArray, [r, g, b, a]: Float32Array[], most: number, stamp?: Int32Array, frame = 0) {
  const live = (i: number) => !stamp || stamp[i] === frame;
  let max = 0;
  if (most) for (let i = 0; i < a.length; i++) if (a[i] > max && live(i)) max = a[i];
  let doublings = 0;
  while (doublings < most && max > 255 << doublings) doublings++;
  const scale = 1 / (1 << doublings);
  for (let i = 0, k = 0; i < a.length; i++, k += 4) {
    const al = live(i) ? Math.min(255, a[i] * scale) : 0;
    if (al <= 0) {
      out[k] = out[k + 1] = out[k + 2] = out[k + 3] = 0;
      continue;
    }
    const s = (255 / al) * scale;
    out[k] = Math.min(255 / scale, r[i]) * s;
    out[k + 1] = Math.min(255 / scale, g[i]) * s;
    out[k + 2] = Math.min(255 / scale, b[i]) * s;
    out[k + 3] = al;
  }
  return doublings;
}

/** Levels from a hand torch's flame to its rim. */
const TORCH_STEPS = 1024;
let lut: Float32Array | null = null;
/** Per level step: alpha (0–1), then premultiplied candle colour (0–255). */
function torchLut() {
  if (lut) return lut;
  lut = new Float32Array(TORCH_STEPS * 4);
  for (let i = 0; i < TORCH_STEPS; i++) {
    const v = lightFalloff((i + 0.5) / TORCH_STEPS, 1);
    const [r, g, b] = glowColor(v);
    lut.set([v, r * v, g * v, b * v], i * 4);
  }
  return lut;
}
