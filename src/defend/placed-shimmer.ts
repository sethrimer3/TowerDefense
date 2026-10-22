/** Now and then, while building, a glowing gold line runs once clockwise
 * round each piece the player placed (structures, the keep, gates, wall
 * ballistas and wall sections), brightening as it goes, then fades: it marks
 * what can be picked up and moved, unlike the houses and the wall ring the
 * city grows by itself. The line is one layer of art pixels hugging the
 * piece's own sprite, each touching it edge to edge (none only at a
 * corner), so it traces the silhouette exactly. Presentation only, on the
 * wall clock; each piece keeps its own staggered time, so they never all
 * shine at once. */
import type { Building, CityMap } from "./citygen.ts";
import { QC } from "./layout.ts";
import { ART } from "./park-art.ts";
import { artPen } from "./pixel-fx.ts";
import { pixelKey } from "./pixel-sprites.ts";

type Rect = { x: number; y: number; w: number; h: number };
/** A placed piece's cells, the building whose sprite it traces (none for a
 * wall section, gate or ballista, which fill their cells), and where in the
 * shared cycle its trace starts (0–1). */
export type ShimmerTarget = { rect: Rect; phase: number; b?: Building };

export const SHIMMER = {
  /** Seconds between one piece's traces: at least `every`, longer in a big
   * city so that one starts every `gap` seconds on average. */
  every: 12,
  gap: 1.3,
  /** Seconds the line takes round, plus a little more per cell of perimeter. */
  trace: 1.1,
  perCell: 0.025,
  /** Seconds the finished loop takes to fade away. */
  fade: 0.8,
  /** Art pixels round a sprite's cells it may overhang them by. */
  margin: ART,
  /** Art pixels at the line's head drawn brighter while it runs. */
  head: 4,
};

const GOLD = "#f2c94c", BRIGHT = "#fff1b0";

/** Whether the player placed (and may move) building `b`. */
const placed = (b: Building) => b.structureUid !== undefined || b.kind === "gate" || b.kind === "wallBallista";

const cache = new WeakMap<CityMap, ShimmerTarget[]>();

/** Every piece the player placed on `map`, a placed wall section's stones
 * gathered into its quarter, their starts spread round the cycle by the
 * golden ratio so neighbours in the list never trace together. */
export function shimmerTargets(map: CityMap): ShimmerTarget[] {
  let out = cache.get(map);
  if (out) return out;
  out = [];
  const quarters = new Set<number>();
  for (const b of map.buildings) {
    if (b.structureUid !== undefined) out.push({ rect: b.rect, phase: 0, b });
    else if (placed(b)) out.push({ rect: b.rect, phase: 0 });
    else if (b.piece) {
      const qx = Math.floor(b.rect.x / QC), qy = Math.floor(b.rect.y / QC), key = qy * 10000 + qx;
      if (quarters.has(key)) continue;
      quarters.add(key);
      out.push({ rect: { x: qx * QC, y: qy * QC, w: QC, h: QC }, phase: 0 });
    }
  }
  out.forEach((t, i) => { t.phase = (i * 0.6180339887) % 1; });
  cache.set(map, out);
  return out;
}

/** Seconds between one piece's traces among `count` pieces. */
export const shimmerPeriod = (count: number) => Math.max(SHIMMER.every, count * SHIMMER.gap);

/** Where target `t`'s trace is at `seconds` on the wall clock, `period`
 * seconds a cycle: `run` how far round the line has come (0–1) and `alpha`
 * its opacity, or null between traces. */
export function shimmerAt(t: ShimmerTarget, seconds: number, period: number): { run: number; alpha: number } | null {
  const at = (((seconds + period * t.phase) % period) + period) % period;
  const trace = SHIMMER.trace + SHIMMER.perCell * 2 * (t.rect.w + t.rect.h);
  if (at < trace) {
    const run = at / trace;
    return { run, alpha: 0.2 + 0.8 * run * (2 - run) };
  }
  if (at < trace + SHIMMER.fade) {
    const f = 1 - (at - trace) / SHIMMER.fade;
    return { run: 1, alpha: f * f * (3 - 2 * f) };
  }
  return null;
}

/** The art pixels just outside `mask` (`w` × `h`, 1 where the sprite is
 * solid) that touch it edge to edge, in order clockwise round its middle
 * from its top left: the line a trace lights, as art pixel coordinates in
 * the mask. A mask needs a clear pixel all round for its ring to fit. */
export function outlineRing(mask: Uint8Array, w: number, h: number): { xs: Int16Array; ys: Int16Array } {
  const at: number[] = [];
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (mask[k]) { sx += x; sy += y; n++; continue; }
      if ((x > 0 && mask[k - 1]) || (x < w - 1 && mask[k + 1]) || (y > 0 && mask[k - w]) || (y < h - 1 && mask[k + w])) at.push(k);
    }
  const mx = n ? sx / n + 0.5 : w / 2, my = n ? sy / n + 0.5 : h / 2;
  // Screen angles grow clockwise (y points down); start toward the top left.
  const start = Math.atan2(-1, -1), turn = (k: number) => {
    const a = Math.atan2((k / w | 0) + 0.5 - my, (k % w) + 0.5 - mx) - start;
    return a < 0 ? a + 2 * Math.PI : a;
  };
  const angle = new Map(at.map((k) => [k, turn(k)]));
  at.sort((a, b) => angle.get(a)! - angle.get(b)! || a - b);
  return { xs: Int16Array.from(at, (k) => k % w), ys: Int16Array.from(at, (k) => (k / w) | 0) };
}

/** A ring in art pixels from its piece's top left corner. */
type Ring = { xs: Int16Array; ys: Int16Array };
const rings = new Map<string, Ring>();

/** The ring round a piece that fills its cells. */
function boxRing(r: Rect): Ring {
  const key = `box:${r.w}x${r.h}`;
  let ring = rings.get(key);
  if (!ring) {
    const w = r.w * ART + 2, h = r.h * ART + 2, mask = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) mask.fill(1, y * w + 1, y * w + w - 1);
    const o = outlineRing(mask, w, h);
    rings.set(key, (ring = { xs: o.xs.map((x) => x - 1), ys: o.ys.map((y) => y - 1) }));
  }
  return ring;
}

/** Paints building `b` alone onto `c` at `ART` pixels a cell, its cells' top
 * left at the canvas's origin (the city layer's own painter). */
export type PaintAlone = (c: CanvasRenderingContext2D, b: Building) => void;

/** The ring round building `b`'s sprite, as `paint` draws it now: read from
 * its pixels once a kind, size and look, and again as the pixel art loads. */
function spriteRing(b: Building, look: string | undefined, paint: PaintAlone): Ring {
  const r = b.rect, key = `${b.kind}:${r.w}x${r.h}:${look ?? ""}:${pixelKey()}`;
  let ring = rings.get(key);
  if (ring) return ring;
  const m = SHIMMER.margin, w = r.w * ART + 2 * m, h = r.h * ART + 2 * m;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d", { willReadFrequently: true })!;
  c.imageSmoothingEnabled = false;
  c.translate(m - r.x * ART, m - r.y * ART);
  paint(c, b);
  const data = c.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) mask[k] = data[k * 4 + 3] >= 128 ? 1 : 0;
  // Nothing drawn (art still on its way): fall back to its cells.
  if (!mask.includes(1)) return boxRing(r);
  const o = outlineRing(mask, w, h);
  rings.set(key, (ring = { xs: o.xs.map((x) => x - m), ys: o.ys.map((y) => y - m) }));
  return ring;
}

/** Draws every trace under way; `c` is in board space at `px` a cell;
 * `looks` are the structures' path looks by uid, and `paint` paints a
 * building alone, for the shape of its sprite. */
export function drawShimmer(c: CanvasRenderingContext2D, px: number, map: CityMap, now: number, paint: PaintAlone, looks?: Readonly<Record<number, string>>) {
  const seconds = now / 1000;
  let pen: ReturnType<typeof artPen> | null = null;
  const targets = shimmerTargets(map), period = shimmerPeriod(targets.length);
  for (const t of targets) {
    const s = shimmerAt(t, seconds, period);
    if (!s) continue;
    if (!pen) { c.save(); pen = artPen(c, px); }
    const ring = t.b ? spriteRing(t.b, looks?.[t.b.structureUid!], paint) : boxRing(t.rect);
    drawTrace(c, pen, t.rect, ring, s.run, s.alpha);
  }
  if (pen) c.restore();
}

/** Lights `ring` round the piece at `r` from its start clockwise `run` of
 * the way round, the last few pixels at its head brighter. */
function drawTrace(c: CanvasRenderingContext2D, pen: ReturnType<typeof artPen>, r: Rect, ring: Ring, run: number, alpha: number) {
  const X = r.x * ART, Y = r.y * ART, n = ring.xs.length, end = Math.round(run * n);
  const head = run < 1 ? Math.min(SHIMMER.head, end) : 0;
  c.globalAlpha = alpha;
  c.fillStyle = GOLD;
  for (let i = 0; i < end - head; i++) pen(X + ring.xs[i], Y + ring.ys[i]);
  c.fillStyle = BRIGHT;
  for (let i = end - head; i < end; i++) pen(X + ring.xs[i], Y + ring.ys[i]);
  c.globalAlpha = 1;
}
