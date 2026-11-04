import type { Building } from "./citygen.ts";
import { ART } from "./art-scale.ts";
import { hash01 } from "./grid.ts";
import { MINE_BUILDINGS, MINE_LANE, MINE_PIT } from "./tower-art.ts";

/** The mine folk: little workers, one art pixel each in a quarter art pixel
 * black ring, walking the Mine tile's yard from door to door (barracks,
 * warehouse, forge, smithy, workshop) and down to the pit road. Presentation
 * only: each one's place is a pure function of its mine, its number and the
 * wall clock, so nothing is stepped or saved and no random stream is drawn. */
export const MINE_FOLK = {
  /** Walkers on each Mine tile. */
  count: 8,
  /** Walking speed, art pixels a second. */
  speed: 5,
  /** Seconds a trip takes, walking and then out of sight indoors. */
  trip: 10,
} as const;

/** Tunics, one per walker. */
const TUNICS = ["#c98a3a", "#6f8f4e", "#5f7f9f", "#b5523b", "#d8c9a0", "#8a6a9c"] as const;

/** The places walkers come and go from, in sprite pixels in from the frame:
 * the doors (a pixel below each south wall) and the head of the pit road. */
const STOPS = [
  ...MINE_BUILDINGS.map((b) => ({ x: b.door + 0.5, y: b.y1 + 1.5 })),
  { x: MINE_PIT.x + 0.5, y: MINE_PIT.y + 0.5 },
];

/** A trip from stop `a` to stop `b`: down to the lane, along it, up to `b`. */
function route(a: number, b: number) {
  const p = STOPS[a], q = STOPS[b];
  return [p, { x: p.x, y: MINE_LANE + 0.5 }, { x: q.x, y: MINE_LANE + 0.5 }, q];
}

function along(points: { x: number; y: number }[], d: number) {
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1], q = points[i];
    const len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
    if (d <= len) {
      const t = len ? d / len : 0;
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    }
    d -= len;
  }
  return points[points.length - 1];
}

/** Where walker `n` of mine `id` stands at `seconds` (sprite pixels in from
 * the frame), or null while indoors. */
export function minerAt(id: number, n: number, seconds: number): { x: number; y: number } | null {
  const shifted = seconds + hash01(id, n, 4111) * MINE_FOLK.trip;
  const k = Math.floor(shifted / MINE_FOLK.trip), t = shifted - k * MINE_FOLK.trip;
  // Each trip starts where the last one ended (one that would end where it
  // began is a spell indoors).
  const stop = (j: number) => Math.floor(hash01(id, n, j, 4112) * STOPS.length);
  const from = stop(k - 1), to = stop(k);
  if (from === to) return null;
  const path = route(from, to);
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
  // A moment indoors at the start, then the walk, then indoors at the end.
  const d = (t - 0.5) * MINE_FOLK.speed;
  if (d < 0 || d > length) return null;
  return along(path, d);
}

/** Draws every standing Mine's walkers; `px` is canvas pixels a cell.
 * `standing` says whether a building is up (fallen mines are empty). Under
 * Reduce Motion they hold still where they stood at time 0. */
export function drawMineFolk(c: CanvasRenderingContext2D, px: number, buildings: readonly Building[], standing: (b: Building) => boolean, now: number, reduced: boolean) {
  const dot = px / ART, o = dot / 4, seconds = reduced ? 0 : now / 1000;
  let any = false;
  for (const b of buildings) {
    if (b.kind !== "mine" || !standing(b)) continue;
    if (!any) { c.save(); c.imageSmoothingEnabled = false; any = true; }
    // The sprite's frame starts one art pixel in from its box.
    const ox = (b.rect.x * ART + 1) * dot, oy = (b.rect.y * ART + 1) * dot;
    for (let n = 0; n < MINE_FOLK.count; n++) {
      const at = minerAt(b.id, n, seconds);
      if (!at) continue;
      const x = Math.round(ox + (at.x - 0.5) * dot), y = Math.round(oy + (at.y - 0.5) * dot);
      c.fillStyle = "#000";
      c.fillRect(x - o, y - o, dot + 2 * o, dot + 2 * o);
      c.fillStyle = TUNICS[n % TUNICS.length];
      c.fillRect(x, y, dot, dot);
    }
  }
  if (any) c.restore();
}
