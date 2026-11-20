/** What the board does as an edit lands (a building placed or moved, a city
 * tile placed or rearranged): whatever the edit replaced dissolves away,
 * then what it made falls out of the sky. A placed building falls whole;
 * a city tile's pieces each fall on their own, a little apart: its houses
 * and wall stones, and in each new park the grass and water growing out
 * from the middle, then the trees and ducks dropping in, then the fence
 * posts round the ring, then the rails onto them. Presentation only, on
 * the wall clock; this module plans the timings, `arrival-art.ts` draws. */
import { CELL_COUNT, CELLS_W, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { changedCells, signature } from "./map-change.ts";

type Looks = Readonly<Record<number, string>> | undefined;

/** How a falling piece shows: raised `dy` cells (negative is up), at
 * `alpha` and drawn `scale` times its size about its middle. */
export type Drop = { dy: number; alpha: number; scale: number };
/** A falling piece at some moment: false before it starts (not drawn),
 * null once it has landed (drawn as usual), else how it shows. */
export type Fall = Drop | false | null;

export const ARRIVAL = {
  /** Seconds what the edit replaced takes to dissolve. */
  vanish: 0.32,
  /** Seconds a building takes to fall, and how high it starts (cells). */
  fall: 0.42,
  height: 3,
  /** The spread of a city tile's pieces' starts, in seconds. */
  spread: 0.5,
  /** A park's grass and water growing out to its edge: seconds, plus a
   * little more for each cell of reach. */
  grow: 0.3,
  growPerCell: 0.07,
  /** Trees and ducks: their fall, height and the spread of their starts. */
  plant: { fall: 0.4, height: 2.4, spread: 0.45 },
  /** Fence posts, then rails: each piece's fall, height, and the time the
   * ring takes to go round. */
  post: { fall: 0.28, height: 1.5, round: 0.4 },
  rail: { fall: 0.24, height: 1.1, round: 0.4 },
  /** Seconds the dust of a landing building hangs. */
  dust: 0.4,
  /** An edit changing more of the board than this falls in at once. */
  most: 0.4,
};

/** Where piece that starts `t` seconds ago falling for `dur` seconds from
 * `height` cells up: drawn faint and a little large up high, it drops
 * with gravity (slow first, fastest as it lands), fully there by the end. */
export function dropAt(t: number, dur: number, height: number): Fall {
  if (t < 0) return false;
  if (t >= dur) return null;
  const u = t / dur, up = 1 - u * u;
  return { dy: -height * up, alpha: Math.min(1, u / 0.55), scale: 1 + 0.3 * up };
}

/** A building that falls in: when it starts, how long it falls, from how high. */
export type Arriving = { id: number; delay: number; dur: number; height: number };
/** A new park: its cells, middle, the reach from it to its farthest
 * corner (cells), and when its grass starts growing and is grown. */
export type NewPark = { cells: number[]; cx: number; cy: number; reach: number; delay: number; grown: number };

export type ArrivalPlan = {
  /** Cells that look different after the edit. */
  changed: Uint8Array;
  /** Buildings that fall in (new map ids), and those that vanish (old ids). */
  arriving: Arriving[];
  vanishing: number[];
  parks: NewPark[];
  /** Index into `parks` for each new park cell, -1 elsewhere. */
  parkOf: Int16Array;
  /** Seconds until the last building has landed, and until all is done. */
  landed: number;
  end: number;
};

const isPark = (map: CityMap, i: number) => map.type[i] === CellType.PARK || map.type[i] === CellType.WATER;

/** The arrival of the edit from city `from` to city `to`, or null when
 * nothing falls (nothing comparable or too much changed). */
export function planArrival(from: CityMap, to: CityMap, looksFrom: Looks, looksTo: Looks): ArrivalPlan | null {
  const changed = changedCells(from, to, looksFrom, looksTo);
  if (!changed) return null;
  let count = 0;
  for (let i = 0; i < CELL_COUNT; i++) count += changed[i];
  if (!count || count > CELL_COUNT * ARRIVAL.most) return null;
  const was = new Set(from.buildings.map((b) => signature(b, looksFrom)));
  const now = new Set(to.buildings.map((b) => signature(b, looksTo)));
  const fresh = to.buildings.filter((b) => !b.hidden && !b.fence && !was.has(signature(b, looksTo)));
  const vanishing = from.buildings.filter((b) => !b.hidden && !b.fence && !now.has(signature(b, looksFrom))).map((b) => b.id);
  // One building alone falls at once; a city tile's pieces each a little apart.
  const one = fresh.length === 1;
  const arriving: Arriving[] = fresh.map((b) => ({
    id: b.id,
    delay: one ? 0.06 : 0.08 + hash01(b.rect.x, b.rect.y, b.rect.w, 401) * ARRIVAL.spread,
    dur: ARRIVAL.fall,
    height: ARRIVAL.height + Math.min(b.rect.w, b.rect.h) * 0.25,
  }));
  // The new parks: park cells the edit changed, in touching groups.
  const parkOf = new Int16Array(CELL_COUNT).fill(-1);
  const parks: NewPark[] = [];
  for (let s = 0; s < CELL_COUNT; s++) {
    if (!changed[s] || !isPark(to, s) || parkOf[s] >= 0) continue;
    const k = parks.length, cells = [s];
    parkOf[s] = k;
    for (let h = 0; h < cells.length; h++) {
      const c = cells[h], x = c % CELLS_W, y = (c - x) / CELLS_W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = ny * CELLS_W + nx;
        if (nx < 0 || ny < 0 || nx >= CELLS_W || n >= CELL_COUNT || !changed[n] || !isPark(to, n) || parkOf[n] >= 0) continue;
        parkOf[n] = k;
        cells.push(n);
      }
    }
    let sx = 0, sy = 0;
    for (const c of cells) sx += (c % CELLS_W) + 0.5, sy += Math.floor(c / CELLS_W) + 0.5;
    const cx = sx / cells.length, cy = sy / cells.length;
    let reach = 0;
    for (const c of cells) {
      const x = c % CELLS_W, y = Math.floor(c / CELLS_W);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) reach = Math.max(reach, Math.hypot(x + ox - cx, y + oy - cy));
    }
    const delay = 0.1 + hash01(s, 402) * 0.12;
    parks.push({ cells, cx, cy, reach, delay, grown: delay + ARRIVAL.grow + ARRIVAL.growPerCell * reach });
  }
  let landed = 0, end: number;
  for (const a of arriving) landed = Math.max(landed, a.delay + a.dur);
  end = Math.max(ARRIVAL.vanish, landed + ARRIVAL.dust);
  for (const p of parks) end = Math.max(end, railsFrom(p) + ARRIVAL.rail.round + ARRIVAL.rail.fall + 0.05);
  if (!arriving.length && !vanishing.length && !parks.length) return null;
  return { changed, arriving, vanishing, parks, parkOf, landed, end };
}

/** The new park holding point (x, y) in cells, if any. */
export function parkAt(plan: ArrivalPlan, x: number, y: number): NewPark | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= CELLS_W) return null;
  const i = cy * CELLS_W + cx;
  const k = i < CELL_COUNT ? plan.parkOf[i] : -1;
  return k >= 0 ? plan.parks[k] : null;
}

/** How far round park `p` point (x, y) lies, 0–1, starting at the top and
 * going clockwise: the fence goes up round the ring in this order. */
const round = (p: NewPark, x: number, y: number) => (Math.atan2(x - p.cx, -(y - p.cy)) / (2 * Math.PI) + 1) % 1;

/** A tree at (cx, cy) `t` seconds into the arrival. */
export function treeFall(plan: ArrivalPlan, t: number, cx: number, cy: number): Fall {
  const p = parkAt(plan, cx, cy);
  if (!p) return null;
  const P = ARRIVAL.plant;
  return dropAt(t - (p.grown - 0.12 + hash01(Math.floor(cx * 8), Math.floor(cy * 8), 403) * P.spread), P.fall, P.height);
}

/** Duck number `i`, swimming at (x, y), `t` seconds into the arrival: the
 * ducks come down among the trees, a little after them. */
export function duckFall(plan: ArrivalPlan, t: number, x: number, y: number, i: number): Fall {
  const p = parkAt(plan, x, y);
  if (!p) return null;
  const P = ARRIVAL.plant;
  return dropAt(t - (p.grown + 0.1 + hash01(i, 404) * P.spread), P.fall, P.height * 0.8);
}

/** When the posts start going up round park `p`, and the rails. */
const postsFrom = (p: NewPark) => p.grown + ARRIVAL.plant.spread + 0.4;
const railsFrom = (p: NewPark) => postsFrom(p) + ARRIVAL.post.round + 0.15;

/** A fence post at (x, y) `t` seconds into the arrival. */
export function postFall(plan: ArrivalPlan, t: number, x: number, y: number): Fall {
  const p = parkAt(plan, x, y);
  if (!p) return null;
  return dropAt(t - (postsFrom(p) + round(p, x, y) * ARRIVAL.post.round), ARRIVAL.post.fall, ARRIVAL.post.height);
}

/** A fence rail from (x1, y1) to (x2, y2) `t` seconds into the arrival:
 * once the posts are up, the rails drop onto them round the ring. */
export function railFall(plan: ArrivalPlan, t: number, x1: number, y1: number, x2: number, y2: number): Fall {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, p = parkAt(plan, mx, my);
  if (!p) return null;
  return dropAt(t - (railsFrom(p) + round(p, mx, my) * ARRIVAL.rail.round), ARRIVAL.rail.fall, ARRIVAL.rail.height);
}

/** How far park `p`'s grass has grown out from its middle `t` seconds into
 * the arrival, in cells (its full reach once grown). */
export function grassReach(p: NewPark, t: number) {
  if (t <= p.delay) return 0;
  if (t >= p.grown) return Infinity;
  const u = (t - p.delay) / (p.grown - p.delay);
  return (p.reach + 0.4) * (1 - (1 - u) ** 2);
}
