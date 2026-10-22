/** Now and then, while building, a glowing gold line runs once clockwise
 * round each piece the player placed (structures, the keep, gates, wall
 * ballistas and wall sections), brightening as it goes, then fades: it marks
 * what can be picked up and moved, unlike the houses and the wall ring the
 * city grows by itself. Presentation only, on the wall clock; each piece
 * keeps its own staggered time, so they never all shine at once. */
import type { Building, CityMap } from "./citygen.ts";
import { QC } from "./layout.ts";
import { ART } from "./park-art.ts";
import { artPen } from "./pixel-fx.ts";

type Rect = { x: number; y: number; w: number; h: number };
/** A placed piece's cells, and where in the shared cycle its trace starts (0–1). */
export type ShimmerTarget = { rect: Rect; phase: number };

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
};

const GOLD = "#f2c94c", BRIGHT = "#fff1b0", HALO = "rgba(242, 201, 76, 0.3)";

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
    if (placed(b)) out.push({ rect: b.rect, phase: 0 });
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

/** Draws every trace under way; `c` is in board space at `px` a cell. */
export function drawShimmer(c: CanvasRenderingContext2D, px: number, map: CityMap, now: number) {
  const seconds = now / 1000;
  let pen: ReturnType<typeof artPen> | null = null;
  const targets = shimmerTargets(map), period = shimmerPeriod(targets.length);
  for (const t of targets) {
    const s = shimmerAt(t, seconds, period);
    if (!s) continue;
    if (!pen) { c.save(); pen = artPen(c, px); }
    drawTrace(c, pen, t.rect, s.run, s.alpha);
  }
  if (pen) c.restore();
}

/** The line one art pixel outside `r`, from its top left corner clockwise
 * `run` of the way round, with a soft halo either side and a bright head. */
function drawTrace(c: CanvasRenderingContext2D, pen: ReturnType<typeof artPen>, r: Rect, run: number, alpha: number) {
  const X0 = r.x * ART - 1, Y0 = r.y * ART - 1, X1 = (r.x + r.w) * ART, Y1 = (r.y + r.h) * ART;
  const W = X1 - X0, H = Y1 - Y0, L = 2 * (W + H);
  const end = Math.round(run * L);
  /** Fills the line's pixels from `a` to `b` round the perimeter, `g` pixels thicker each side. */
  const span = (a: number, b: number, g: number) => {
    const edge = (lo: number, hi: number, f: (s0: number, s1: number) => void) => {
      const s0 = Math.max(a, lo), s1 = Math.min(b, hi);
      if (s1 > s0) f(s0 - lo, s1 - lo);
    };
    edge(0, W, (s0, s1) => pen!(X0 + s0 - g, Y0 - g, s1 - s0 + 2 * g, 1 + 2 * g));
    edge(W, W + H, (s0, s1) => pen!(X1 - g, Y0 + s0 - g, 1 + 2 * g, s1 - s0 + 2 * g));
    edge(W + H, 2 * W + H, (s0, s1) => pen!(X1 - s1 + 1 - g, Y1 - g, s1 - s0 + 2 * g, 1 + 2 * g));
    edge(2 * W + H, L, (s0, s1) => pen!(X0 - g, Y1 - s1 + 1 - g, 1 + 2 * g, s1 - s0 + 2 * g));
  };
  c.globalAlpha = alpha;
  c.fillStyle = HALO;
  span(0, end, 1);
  c.fillStyle = GOLD;
  span(0, end, 0);
  if (run < 1) {
    c.fillStyle = BRIGHT;
    span(Math.max(0, end - 4), end, 0);
  }
  c.globalAlpha = 1;
}
