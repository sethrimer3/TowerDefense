/** Worn monster trails across the open ground of Defend's first two areas:
 * the Mossbound Ruins' country roads and the Amber Desert's Galton trails.
 *
 * They are the ways the Dark One's walkers have always come. Each is planned
 * from the map alone (`trailPlan`, memoised per map and style), so a placed
 * tile or tower re-wears them round itself and the same city always gets the
 * same trails:
 *
 * - **Country roads** (`"road"`): a few roads enter at the top edge and wind
 *   down toward the city, merging as they near it, ending at a gate where the
 *   city has one or else at the wall nearest the keep; one more leaves the
 *   city out the bottom edge. Each is traced downhill on a routing field to
 *   the keep (`routeField`) whose open ground is priced by a smooth noise, so
 *   the road bends round low hills and the boulders.
 * - **Galton trails** (`"galton"`): pegs in staggered rows down the field,
 *   each joined to the two pegs below it, like the pins of a Galton board.
 *   Traffic starts at the top row's trailheads and splits at every peg, more
 *   of it toward the keep; a trail is worn as deep as the traffic it carries
 *   (`level`), and one that carries next to none is not worn at all.
 *
 * Trails only run over open ground: one stops where it meets the city, its
 * wall or a building, and none crosses a pond or a boulder.
 *
 * In battle (`DefendSim.syncTrails`) a trail's cells are cheaper to walk
 * (`TRAIL.cost`), so the flow field leads ground enemies onto them; ground
 * walkers enter at the trailheads (`TRAIL.spread`), and at a fork an enemy
 * takes either branch whose cost is within `TRAIL.slack` of the best by its
 * own coin (`forkPick`), so a crowd spreads down the Galton pegs instead of
 * marching in one file. Only Defend's own maps carry trails (`CityMap.trails`):
 * Ambush and Siege battles are untouched, and so is every replay without one.
 * `forest.ts` keeps its trees, lakes and rocks off the roads and
 * `trail-art.ts` draws both kinds. */
import { CELL_COUNT, CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { downhill, fillFlowField, openSteps, type Point } from "./pathing.ts";
import { boulderPlan } from "./forest.ts";
import type { AreaId } from "./areas.ts";

export type TrailStyle = "road" | "galton";

/** Which trails an area's open ground has, if any. */
export const trailStyle = (area: AreaId): TrailStyle | null => (area === "moss" ? "road" : area === "desert" ? "galton" : null);

/** Tuning. `cost` is how much cheaper a fully worn cell is to walk than open
 * ground (1.25 a cell); `slack` how much dearer a branch at a fork may be and
 * still be taken; `spread` how far either side of a trailhead (cells) a
 * walker enters. Roads are `road.half` cells wide either side of their middle
 * (`roads` of them from the top), Galton trails `galton.half`, with their
 * pegs every `dx` cells across and `dy` down. */
export const TRAIL = {
  cost: 0.5,
  slack: 2.5,
  spread: 1,
  /** A surfaced worm on a trail turns toward the point this many cells on
   * down it. */
  wormAhead: 3,
  road: { half: 1.4, roads: 3, meander: 1.6, scale: 9 },
  galton: { half: 0.9, dx: 16, dy: 12, min: 0.06, bend: 5 },
};

/** A trail's middle line (cells), how far either side of it is worn, and
 * how deeply (0..1). */
export type TrailLine = { points: Point[]; half: number; level: number };
/** A map's trails: each cell's wear (0..1, only on open ground), the
 * trailheads' x along the top edge, and the lines to draw. */
export type TrailPlan = { style: TrailStyle; wear: Float32Array; heads: number[]; lines: TrailLine[]; pegs: Point[] };

const plans = new WeakMap<CityMap, Map<TrailStyle, TrailPlan>>();

/** `map`'s trails of `style`, planned on first use; null on a map without
 * trails (anything but a Defend city). */
export function trailPlan(map: CityMap, style: TrailStyle): TrailPlan | null {
  if (!map.trails) return null;
  let byStyle = plans.get(map);
  if (!byStyle) plans.set(map, (byStyle = new Map()));
  let plan = byStyle.get(style);
  if (!plan) byStyle.set(style, (plan = style === "road" ? roads(map, map.trails.seed) : galton(map, map.trails.seed)));
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

/** The Mossbound Ruins' country roads. */
function roads(map: CityMap, seed: number): TrailPlan {
  const R = TRAIL.road, blocked = new Uint8Array(CELL_COUNT);
  for (const b of boulderPlan(map)) for (const c of b.cells) blocked[c] = 1;
  const field = routeField(map, seed, R.meander, R.scale, blocked);
  const lines: TrailLine[] = [], heads: number[] = [];
  const band = CELLS_W / R.roads;
  for (let k = 0; k < R.roads; k++) {
    let x = Math.floor((k + 0.5) * band + (hash01(seed, k, 902) - 0.5) * band * 0.6);
    x = Math.max(6, Math.min(CELLS_W - 7, x));
    if (!isOpen(map, cellIndex(x, 0)) || field[cellIndex(x, 0)] === Infinity) continue;
    const points = trace(map, field, x, 0);
    // Start just past the board's edge, so the road comes in from beyond it.
    points.unshift({ x: x + 0.5, y: -1.5 });
    lines.push({ points: smooth(points), half: R.half, level: 1 });
    heads.push(x + 0.5);
  }
  // The road out: from the bottom edge below the keep, where it is open.
  const keep = map.buildings.find((b) => b.kind === "keep");
  if (keep) {
    const want = keep.rect.x + keep.rect.w / 2 + (hash01(seed, 903) - 0.5) * 24;
    for (let off = 0; off < CELLS_W; off++) {
      const x = Math.round(want + (off % 2 ? -1 : 1) * Math.ceil(off / 2)), y = CELLS_H - 1;
      if (x < 6 || x > CELLS_W - 7) continue;
      const i = cellIndex(x, y);
      if (!isOpen(map, i) || field[i] === Infinity) continue;
      const points = trace(map, field, x, y);
      if (points.length < 4) break;
      points.unshift({ x: x + 0.5, y: CELLS_H + 1.5 });
      lines.push({ points: smooth(points), half: R.half, level: 1 });
      break;
    }
  }
  return { style: "road", wear: wearOf(map, lines), heads, lines, pegs: [] };
}

/** A Galton peg: where it stands, its place on the unwobbled lattice, and the
 * traffic through it. */
type Peg = { x: number; y: number; row: number; base: number; mass: number };

/** The Amber Desert's Galton trails. */
function galton(map: CityMap, seed: number): TrailPlan {
  const G = TRAIL.galton, field = routeField(map, seed, 0, 1);
  const x0 = 4 + hash01(seed, 910) * (G.dx - 8);
  const rows: Peg[][] = [];
  for (let row = 0, y = 0; y <= CELLS_H; row++, y += G.dy) {
    const pegs: Peg[] = [];
    for (let base = x0 + (row % 2 ? G.dx / 2 : 0) - G.dx; base < CELLS_W + G.dx; base += G.dx) {
      const edge = row === 0 || y + G.dy > CELLS_H;
      const x = base + (edge && row === 0 ? 0 : (hash01(seed, row, Math.round(base), 911) - 0.5) * 4);
      const py = row === 0 ? -1.5 : edge ? CELLS_H + 1.5 : y + (hash01(seed, row, Math.round(base), 912) - 0.5) * 3;
      pegs.push({ x, y: py, row, base, mass: 0 });
    }
    rows.push(pegs);
  }
  // Trailheads: the top row's pegs over open ground.
  const heads: number[] = [];
  for (const p of rows[0])
    if (p.x >= 2 && p.x <= CELLS_W - 2 && isOpen(map, cellIndex(Math.floor(p.x), 0))) {
      p.mass = 1;
      heads.push(p.x);
    }
  // Every segment, curved a little, cut where it leaves the open ground.
  const lines: TrailLine[] = [], pegs: Point[] = [];
  const valueAt = (p: Point) => {
    const cx = Math.max(0, Math.min(CELLS_W - 1, Math.floor(p.x))), cy = Math.max(0, Math.min(CELLS_H - 1, Math.floor(p.y)));
    return field[cellIndex(cx, cy)];
  };
  for (let r = 0; r + 1 < rows.length; r++)
    for (const p of rows[r]) {
      if (p.mass <= 0) continue;
      const kids = rows[r + 1].filter((c) => Math.abs(c.base - p.base) === G.dx / 2);
      const routes = kids.flatMap((kid) => {
        const s = segment(map, p, kid, seed);
        return s ? [{ ...s, kid }] : [];
      });
      if (!routes.length) continue;
      // More of the traffic takes the branch nearer the keep.
      const value = routes.map((s) => valueAt(s.points[s.points.length - 1]));
      const shares = routes.length === 1 ? [1] : (() => {
        const a = value[0], b = value[1], finite = a < Infinity && b < Infinity;
        const left = finite ? 0.5 + 0.4 * Math.tanh((b - a) / 8) : a < Infinity ? 0.9 : 0.1;
        return [left, 1 - left];
      })();
      let worn = 0;
      routes.forEach((s, k) => {
        const m = p.mass * shares[k];
        if (m < G.min) return;
        worn++;
        lines.push({ points: s.points, half: G.half, level: Math.min(1, 0.15 + 0.85 * Math.sqrt(m)) });
        if (s.through) s.kid.mass += m;
      });
      // The pin the trail parts round: a rock where two worn ways go on.
      if (worn === 2 && r > 0 && p.y < CELLS_H && clearAround(map, p, 2)) pegs.push({ x: p.x, y: p.y });
    }
  return { style: "galton", wear: wearOf(map, lines), heads, lines, pegs };
}

/** Whether every cell within `r` of point `p` on the board is open ground. */
function clearAround(map: CityMap, p: Point, r: number) {
  for (let y = Math.floor(p.y - r); y <= Math.floor(p.y + r); y++)
    for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++)
      if (x >= 0 && y >= 0 && x < CELLS_W && y < CELLS_H && !isOpen(map, cellIndex(x, y))) return false;
  return true;
}

/** The trail from peg `a` down to peg `b`, a gentle curve; cut short where it
 * leaves the open ground (`through` false then), null if it never gets onto
 * it. Off the board's top and bottom edges counts as open. */
function segment(map: CityMap, a: Peg, b: Peg, seed: number): { points: Point[]; through: boolean } | null {
  const bend = (hash01(seed, a.row, Math.round(a.base), Math.round(b.base), 913) - 0.5) * TRAIL.galton.bend;
  const wiggle = hash01(seed, a.row, Math.round(a.base), Math.round(b.base), 915) * 6.28;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
  const n = Math.ceil(len * 2), points: Point[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    // A slow waver either side, none at the pegs themselves.
    const w = Math.sin(t * Math.PI) * 0.35 * Math.sin(t * 6 + wiggle);
    const x = u * u * a.x + 2 * u * t * cx + t * t * b.x - (dy / len) * w, y = u * u * a.y + 2 * u * t * cy + t * t * b.y + (dx / len) * w;
    const X = Math.floor(x), Y = Math.floor(y);
    if (X < 0 || X >= CELLS_W) return points.length > 2 ? { points, through: false } : null;
    if (Y >= 0 && Y < CELLS_H && !isOpen(map, cellIndex(X, Y))) {
      if (!points.length) return null;
      points.push({ x, y });
      return { points, through: false };
    }
    points.push(k === n ? { x: b.x, y: b.y } : { x, y });
  }
  return { points, through: true };
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
