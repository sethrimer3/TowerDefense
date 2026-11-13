/** Worn monster trails across the open ground of Defend's first three areas:
 * the Mossbound Ruins' forest trails (`"road"`), the Amber Desert's sand
 * trails (`"sand"`) and the Crystal Caves' trodden ways through the gravel
 * (`"cave"`), natural game trails or pioneer paths.
 *
 * They are the ways the Dark One's walkers have always come. Each is planned
 * from the map alone (`trailPlan`, memoised per map and style), so a placed
 * tile or tower re-wears them round itself and the same city always gets the
 * same trails. A few enter at the top edge (`heads`) and wind down toward the
 * city, merging as they near it, ending at a gate where the city has one or
 * else at the wall nearest the keep; more (`tails`) leave the city out the
 * bottom edge, so the trails run the whole field wherever the city stands. Each is traced downhill on a routing field to the keep
 * (`routeField`) whose open ground is priced by a smooth noise, so it bends;
 * then rocks are dropped onto the ways every so often (`rockEvery`) and the
 * ways traced again round them, so each swerves sharply past its rocks.
 *
 * Trails only run over open ground: one stops where it meets the city, its
 * wall or a building, and none crosses a pond, a boulder or a rock.
 *
 * In battle (`DefendSim.syncTrails`) a trail's cells are cheaper to walk
 * (`TRAIL.cost`), so the flow field leads ground enemies onto them; ground
 * walkers enter at the trailheads (`TRAIL.spread`), and where trails split an
 * enemy takes either branch whose cost is within `TRAIL.slack` of the best by
 * its own coin (`forkPick`). Only Defend's own maps carry trails
 * (`CityMap.trails`): Ambush and Siege battles are untouched, and so is every
 * replay without one. `forest.ts` keeps its trees, lakes and rocks off the
 * trails, `crystal-caves.ts` its rocks, ponds, crystals and mushrooms, and
 * `trail-art.ts` draws all three kinds. */
import { CELL_COUNT, CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { downhill, fillFlowField, openSteps, type Point } from "./pathing.ts";
import { boulderPlan } from "./forest.ts";
import type { AreaId } from "./areas.ts";

export type TrailStyle = "road" | "sand" | "cave";

/** Which trails an area's open ground has, if any. */
export const trailStyle = (area: AreaId): TrailStyle | null => (area === "moss" ? "road" : area === "desert" ? "sand" : area === "drowned" ? "cave" : null);

/** Tuning. `cost` is how much cheaper a fully worn cell is to walk than open
 * ground (1.25 a cell); `slack` how much dearer a branch at a fork may be and
 * still be taken; `spread` how far either side of a trailhead (cells) a
 * walker enters. Per style: `half` cells wide either side of the middle,
 * `heads` trails from the top, the routing noise's `meander` and `scale`,
 * a rock about every `rockEvery` cells along a way, `rock` its radius range. */
export const TRAIL = {
  cost: 0.5,
  slack: 2.5,
  spread: 1,
  /** A surfaced worm on a trail turns toward the point this many cells on
   * down it. */
  wormAhead: 3,
  road: { half: 2.2, heads: 3, tails: 1, meander: 1.6, scale: 9, rockEvery: 12, rock: [0.8, 1.3] },
  sand: { half: 2, heads: 4, tails: 2, meander: 1.8, scale: 10, rockEvery: 13, rock: [1, 1.6] },
  cave: { half: 1.9, heads: 3, tails: 2, meander: 1.7, scale: 9, rockEvery: 12, rock: [1, 1.5] },
};

/** A trail's middle line (cells), how far either side of it is worn, and
 * how deeply (0..1). */
export type TrailLine = { points: Point[]; half: number; level: number };
/** A map's trails: each cell's wear (0..1, only on open ground), the
 * trailheads' x along the top edge, and the lines to draw. */
export type TrailPlan = { style: TrailStyle; wear: Float32Array; heads: number[]; lines: TrailLine[]; rocks: TrailRock[] };

const plans = new WeakMap<CityMap, Map<TrailStyle, TrailPlan>>();

/** `map`'s trails of `style`, planned on first use; null on a map without
 * trails (anything but a Defend city). */
export function trailPlan(map: CityMap, style: TrailStyle): TrailPlan | null {
  if (!map.trails) return null;
  let byStyle = plans.get(map);
  if (!byStyle) plans.set(map, (byStyle = new Map()));
  let plan = byStyle.get(style);
  if (!plan) byStyle.set(style, (plan = planTrails(map, map.trails.seed, style)));
  return plan;
}

const isOpen = (map: CityMap, i: number) => map.type[i] === CellType.OUT;

/** Smooth value noise, 0..1, on a grid `scale` cells across. */
function noise(x: number, y: number, scale: number, seed: number) {
  const gx = x / scale, gy = y / scale, ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const v = (a: number, b: number) => hash01(a, b, seed, 901);
  const top = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * ux, bottom = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * ux;
  return top + (bottom - top) * uy;
}

/** The cost of reaching the keep from each cell, the way a trail would
 * wear: open ground priced by a smooth noise of `meander` at most (so the
 * way bends), gates open, the wall dear, the city's own ground cheap, ponds
 * and `blocked` cells impassable. */
export function routeField(map: CityMap, seed: number, meander: number, scale: number, blocked?: Uint8Array): Float64Array {
  const field = new Float64Array(CELL_COUNT);
  const keep = map.buildings.find((b) => b.kind === "keep");
  if (!keep) return field.fill(Infinity);
  const gate = new Uint8Array(CELL_COUNT);
  for (const b of map.buildings) if (b.kind === "gate") for (const c of b.cells) gate[c] = 1;
  const price = new Float32Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    const t = map.type[i];
    price[i] = gate[i] ? 1 : t === CellType.OUT ? 1 + meander * noise(i % CELLS_W, Math.floor(i / CELLS_W), scale, seed) : t === CellType.WALL ? 8 : 1.5;
  }
  fillFlowField(field, keep.cells, {
    solid: new Uint8Array(CELL_COUNT),
    impassable: (i) => map.type[i] === CellType.WATER || !!blocked?.[i],
    cost: (i) => price[i],
  });
  return field;
}

/** Steepest descent on `field` from cell (cx, cy) while on open ground: the
 * cells' middles, ending at the first cell off the open ground (included,
 * so the trail meets the wall) or at a dead end. */
function trace(map: CityMap, field: Float64Array, cx: number, cy: number): Point[] {
  const out: Point[] = [];
  for (let n = 0; n < CELL_COUNT; n++) {
    out.push({ x: cx + 0.5, y: cy + 0.5 });
    if (!isOpen(map, cellIndex(cx, cy))) break;
    let best = -1, bestV = field[cellIndex(cx, cy)];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if ((!dx && !dy) || x < 0 || y < 0 || x >= CELLS_W || y >= CELLS_H) continue;
        const v = field[cellIndex(x, y)] + (dx && dy ? 0.01 : 0);
        if (v < bestV) (bestV = v), (best = cellIndex(x, y));
      }
    if (best < 0) break;
    cx = best % CELLS_W; cy = Math.floor(best / CELLS_W);
  }
  return out;
}

/** A line's corners rounded off: a moving average a few points wide, its
 * ends kept. */
function smooth(points: Point[], passes = 3, reach = 2): Point[] {
  let pts = points;
  for (let p = 0; p < passes; p++) {
    pts = pts.map((pt, i) => {
      if (i === 0 || i === pts.length - 1) return pt;
      let x = 0, y = 0, n = 0;
      for (let k = Math.max(0, i - reach); k <= Math.min(pts.length - 1, i + reach); k++) (x += pts[k].x), (y += pts[k].y), n++;
      return { x: x / n, y: y / n };
    });
  }
  return pts;
}

/** Distance from (x, y) to the segment a-b. */
export function segmentDistance(x: number, y: number, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const u = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
  const ex = a.x + dx * u - x, ey = a.y + dy * u - y;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Each open cell's wear: the deepest line over it, full within `half` of
 * the line's middle and fading out over the next cell. */
function wearOf(map: CityMap, lines: readonly TrailLine[]): Float32Array {
  const wear = new Float32Array(CELL_COUNT);
  for (const line of lines) {
    const reach = line.half + 1;
    for (let k = 0; k + 1 < line.points.length; k++) {
      const a = line.points[k], b = line.points[k + 1];
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach)), x1 = Math.min(CELLS_W - 1, Math.floor(Math.max(a.x, b.x) + reach));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach)), y1 = Math.min(CELLS_H - 1, Math.floor(Math.max(a.y, b.y) + reach));
      for (let cy = y0; cy <= y1; cy++)
        for (let cx = x0; cx <= x1; cx++) {
          const i = cellIndex(cx, cy);
          if (!isOpen(map, i)) continue;
          const d = segmentDistance(cx + 0.5, cy + 0.5, a, b), w = line.level * Math.max(0, Math.min(1, line.half + 0.5 - d));
          if (w > wear[i]) wear[i] = w;
        }
    }
  }
  return wear;
}

/** A rock a trail bends round: its middle and radius (cells). */
export type TrailRock = { x: number; y: number; r: number };

/** The trails of either area: `heads` trails in from the top edge (and, in
 * `tails` out the bottom, past the city), each traced down `routeField` to it.
 * Rocks are then dropped onto the traced ways every so often, a little to one
 * side, and the ways traced again round them, so each trail swerves sharply
 * past its rocks as a game trail does. */
function planTrails(map: CityMap, seed: number, style: TrailStyle): TrailPlan {
  const S = TRAIL[style], blocked = new Uint8Array(CELL_COUNT);
  if (style === "road") for (const b of boulderPlan(map)) for (const c of b.cells) blocked[c] = 1;
  const keep = map.buildings.find((b) => b.kind === "keep");
  // Where each trail starts: along the top edge, and the forest's road out.
  const starts: { x: number; y: number; edge: number }[] = [];
  const band = CELLS_W / S.heads;
  for (let k = 0; k < S.heads; k++) {
    const x = Math.max(6, Math.min(CELLS_W - 7, Math.floor((k + 0.5) * band + (hash01(seed, k, 902, style.length) - 0.5) * band * 0.6)));
    starts.push({ x, y: 0, edge: -1 });
  }
  // And out the bottom, past the city (wherever the player sets it), so the
  // trails run the whole field: about the keep, spread apart.
  if (keep)
    for (let k = 0; k < S.tails; k++) {
      const spread = (k - (S.tails - 1) / 2) * 28;
      const want = keep.rect.x + keep.rect.w / 2 + spread + (hash01(seed, k, 903) - 0.5) * (S.tails > 1 ? 12 : 24);
      for (let off = 0; off < CELLS_W; off++) {
        const x = Math.round(want + (off % 2 ? -1 : 1) * Math.ceil(off / 2));
        if (x >= 6 && x <= CELLS_W - 7 && isOpen(map, cellIndex(x, CELLS_H - 1)) && !starts.some((o) => o.edge > 0 && Math.abs(o.x - x) < 12)) { starts.push({ x, y: CELLS_H - 1, edge: 1 }); break; }
      }
    }
  const traceAll = (field: Float64Array) =>
    starts.map((s) => (isOpen(map, cellIndex(s.x, s.y)) && field[cellIndex(s.x, s.y)] < Infinity ? trace(map, field, s.x, s.y) : []));
  let field = routeField(map, seed, S.meander, S.scale, blocked);
  // Rocks along the first ways, never near the ends or each other.
  const rocks: TrailRock[] = [];
  traceAll(field).forEach((way, k) => {
    let next = 8 + Math.floor(hash01(seed, k, 930) * S.rockEvery);
    for (let n = 0; n < way.length - 8; n++) {
      if (n < next) continue;
      next = n + S.rockEvery * (0.7 + hash01(seed, k, n, 931) * 0.7);
      const p = way[n], a = way[Math.min(way.length - 1, n + 2)], b = way[Math.max(0, n - 2)];
      const dx = a.x - b.x, dy = a.y - b.y, len = Math.hypot(dx, dy) || 1;
      const side = (hash01(seed, k, n, 932) - 0.5) * 0.6, r = S.rock[0] + hash01(seed, k, n, 933) * (S.rock[1] - S.rock[0]);
      const x = p.x - (dy / len) * side, y = p.y + (dx / len) * side;
      if (rocks.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 4) || !clearAround(map, { x, y }, r + 2)) continue;
      rocks.push({ x, y, r });
      for (let cy = Math.floor(y - r - S.half); cy <= Math.floor(y + r + S.half); cy++)
        for (let cx = Math.floor(x - r - S.half); cx <= Math.floor(x + r + S.half); cx++)
          if (cx >= 0 && cy >= 0 && cx < CELLS_W && cy < CELLS_H && Math.hypot(cx + 0.5 - x, cy + 0.5 - y) < r + S.half * 0.9) blocked[cellIndex(cx, cy)] = 1;
    }
  });
  field = routeField(map, seed, S.meander, S.scale, blocked);
  const lines: TrailLine[] = [], heads: number[] = [];
  traceAll(field).forEach((way, k) => {
    if (way.length < 4) return;
    const s = starts[k];
    // From just past the board's edge, so the trail comes in from beyond it.
    way.unshift({ x: s.x + 0.5, y: s.edge < 0 ? -1.5 : CELLS_H + 1.5 });
    lines.push({ points: smooth(way, 2, 1), half: S.half, level: 1 });
    if (s.edge < 0) heads.push(s.x + 0.5);
  });
  // A rock may have been passed by no trail after all: keep those beside one.
  const near = rocks.filter((r) => lines.some((l) => l.points.some((p) => Math.hypot(p.x - r.x, p.y - r.y) < r.r + S.half + 1.5)));
  // Nothing is worn under a rock.
  const wear = wearOf(map, lines);
  for (const r of near)
    for (let cy = Math.floor(r.y - r.r); cy <= Math.floor(r.y + r.r); cy++)
      for (let cx = Math.floor(r.x - r.r); cx <= Math.floor(r.x + r.r); cx++)
        if (cx >= 0 && cy >= 0 && cx < CELLS_W && cy < CELLS_H && Math.hypot(cx + 0.5 - r.x, cy + 0.5 - r.y) < r.r + 0.3) wear[cellIndex(cx, cy)] = 0;
  return { style, wear, heads, lines, rocks: near };
}

/** Whether every cell within `r` of point `p` on the board is open ground. */
function clearAround(map: CityMap, p: Point, r: number) {
  for (let y = Math.floor(p.y - r); y <= Math.floor(p.y + r); y++)
    for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++)
      if (x >= 0 && y >= 0 && x < CELLS_W && y < CELLS_H && !isOpen(map, cellIndex(x, y))) return false;
  return true;
}

/** The flow-field cost of walking out of open cell `i` with `wear`: open
 * ground's 1.25, down to 1.25 - `TRAIL.cost` on a fully worn trail. */
export const trailCost = (wear: number) => 1.25 - TRAIL.cost * wear;

/** Which of the cells a walker might step to next it takes at a fork:
 * among the trail cells (`wear` at least a half) strictly downhill of its own
 * cell and within `TRAIL.slack` of the best, one by its own coin (`key`, the
 * enemy) for this cell, so the same enemy always forks the same way at the
 * same spot and a replay holds. `best` when there is no choice to make. */
export function forkPick(field: Float64Array, wear: Float32Array, here: number, best: number, choices: readonly number[], key: number) {
  if (best < 0 || wear[best] < 0.5) return best;
  const limit = field[best] + TRAIL.slack, own = field[here];
  let n = 0;
  for (const c of choices) if (wear[c] >= 0.5 && field[c] < own && field[c] <= limit) n++;
  if (n < 2) return best;
  let pick = hash(key, here, 914) % n;
  for (const c of choices) if (wear[c] >= 0.5 && field[c] < own && field[c] <= limit && pick-- === 0) return c;
  return best;
}

/** Where a walker at (x, y) on a worn trail heads: the unit way toward the
 * cell `TRAIL.wormAhead` steps on down `field` (taking forks by `key`'s coin),
 * or null off the trails or at the way's end. For the Blight worms, which
 * steer by heading rather than by cell. */
export function trailHeading(field: Float64Array, solid: Uint8Array, wear: Float32Array, x: number, y: number, key: number): Point | null {
  let cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H || wear[cellIndex(cx, cy)] < 0.3) return null;
  for (let k = 0; k < TRAIL.wormAhead; k++) {
    let next = downhill(field, solid, cx, cy);
    if (next < 0 || solid[next]) break;
    next = forkPick(field, wear, cellIndex(cx, cy), next, openSteps(solid, cx, cy), key);
    cx = next % CELLS_W; cy = Math.floor(next / CELLS_W);
  }
  const dx = cx + 0.5 - x, dy = cy + 0.5 - y, d = Math.hypot(dx, dy);
  return d > 0.25 ? { x: dx / d, y: dy / d } : null;
}
