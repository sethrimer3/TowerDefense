/** The Ambush battlefield's walls: `battlefield.ts` lays out the board, its
 * outposts fenced and its castle walled; this sets a gate wherever a road
 * meets either ring, joins the fences' rails round their corners, and walls
 * the outposts in stone instead once the star tree's Palisades III is
 * bought. Kept apart from `battlefield.ts`, whose Siege half the Siege
 * calibration records are keyed to. */
import { ambushField as layField } from "./battlefield.ts";
import { CellType, type Building, type CityMap } from "../defend/citygen.ts";
import { GATE } from "../defend/catalog.ts";
import { CELLS_H, CELLS_W, cellIndex, rectCells, type Rect } from "../defend/grid.ts";
import type { Side } from "../defend/layout.ts";

/** Whether a 1 × 1 wall stone at (x, y) lies on `rect`'s ring of walls `thickness` deep. */
const onRing = (rect: Rect, thickness: number, x: number, y: number) =>
  x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h && (x < rect.x + thickness || x >= rect.x + rect.w - thickness || y < rect.y + thickness || y >= rect.y + rect.h - thickness);

/** Where the roads cross `rect`'s ring of walls `thickness` deep: a gate
 * `GATE.long` cells along each side the road crosses, centred on the
 * crossing and kept off the corners, one a crossing. */
export function gateSpots(rect: Rect, thickness: number, road: ReadonlySet<number>): { side: Side; rect: Rect }[] {
  const out: { side: Side; rect: Rect }[] = [];
  for (const side of ["n", "s", "w", "e"] as const) {
    const across = side === "w" || side === "e",
      length = across ? rect.h : rect.w,
      start = across ? rect.y : rect.x,
      band = side === "n" ? rect.y : side === "s" ? rect.y + rect.h - thickness : side === "w" ? rect.x : rect.x + rect.w - thickness;
    // Crossed where the road runs through the band and on both sides of it,
    // not where it only runs along it or beside it, nor through a corner
    // (a road along the next side's wall).
    const at = (k: number, d: number) => {
      const a = start + k,
        b = band + d;
      return across ? (b >= 0 && b < CELLS_W ? cellIndex(b, a) : -1) : b >= 0 && b < CELLS_H ? cellIndex(a, b) : -1;
    };
    const crossed = (k: number) => {
      if (k < thickness || k >= length - thickness) return false;
      for (let d = -1; d <= thickness; d++) if (!road.has(at(k, d))) return false;
      return true;
    };
    let placedTo = -1;
    for (let k = 0; k < length; k++) {
      if (!crossed(k)) continue;
      let end = k;
      while (end + 1 < length && crossed(end + 1)) end++;
      const from = Math.max(thickness, Math.min(length - thickness - GATE.long, Math.round((k + end + 1) / 2 - GATE.long / 2)));
      if (from >= placedTo) {
        const along = start + from;
        out.push({ side, rect: across ? { x: band, y: along, w: thickness, h: GATE.long } : { x: along, y: band, w: GATE.long, h: thickness } });
        placedTo = from + GATE.long;
      }
      k = end;
    }
  }
  return out;
}

/** Widens the road to gate `g`'s passage for two cells either side of it,
 * clearing what houses stood there. */
function widen(map: CityMap, road: Set<number>, g: { side: Side; rect: Rect }) {
  const across = g.side === "w" || g.side === "e",
    r = across ? { x: g.rect.x - 2, y: g.rect.y, w: g.rect.w + 4, h: g.rect.h } : { x: g.rect.x, y: g.rect.y - 2, w: g.rect.w, h: g.rect.h + 4 };
  for (const c of rectCells(r)) {
    const x = c % CELLS_W;
    if (x < r.x || x >= r.x + r.w || map.wall[c] || map.type[c] === CellType.WATER) continue;
    const owner = map.owner[c];
    if (owner >= 0) {
      const b = map.buildings[owner];
      if (b.kind !== "house") continue;
      b.hidden = true;
      for (const i of b.cells)
        if (map.owner[i] === owner) {
          map.owner[i] = -1;
          map.type[i] = CellType.PARK;
        }
    }
    road.add(c);
    map.type[c] = CellType.ROAD;
    map.city[c] = 1;
  }
}

/** Turns the wall stones under `rect` into one gate on `side`, wooden or stone. */
function setGate(map: CityMap, side: Side, rect: Rect, wood: boolean) {
  const id = map.buildings.length,
    cells = rectCells(rect);
  for (const c of cells) {
    const owner = map.owner[c];
    if (owner >= 0 && map.buildings[owner].kind === "wall") {
      const b = map.buildings[owner];
      b.hidden = true;
      b.cells = [];
      delete b.fence;
    }
    map.owner[c] = id;
    map.type[c] = CellType.WALL;
    map.wall[c] = 1;
    map.city[c] = 0;
  }
  const gate: Building = { id, kind: "gate", rect, cells, variant: 0, gate: { tx: Math.floor(rect.x / 8), ty: Math.floor(rect.y / 8), side } };
  if (wood) gate.woodGate = true;
  map.buildings.push(gate);
  return id;
}

/** The rails a wooden fence on `rect`'s ring draws through the stone at
 * (x, y): along the ring's middle line, so neighbours join and a corner
 * turns in one piece. */
function fenceRails(rect: Rect, x: number, y: number) {
  const l = rect.x + 0.5,
    r = rect.x + rect.w - 0.5,
    t = rect.y + 0.5,
    b = rect.y + rect.h - 0.5,
    rails: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const row of [t, b])
    if (row > y && row < y + 1) {
      const x1 = Math.max(x, l),
        x2 = Math.min(x + 1, r);
      if (x2 > x1) rails.push({ x1, y1: row, x2, y2: row });
    }
  for (const col of [l, r])
    if (col > x && col < x + 1) {
      const y1 = Math.max(y, t),
        y2 = Math.min(y + 1, b);
      if (y2 > y1) rails.push({ x1: col, y1, x2: col, y2 });
    }
  return rails;
}

/** The Ambush battlefield of `level`. Its outposts are fenced with wood, or
 * walled with stone once the star tree's Palisades III is bought (`stone`). */
export function ambushField(level: number, { stone = false }: { stone?: boolean } = {}) {
  const field = layField(level),
    { map, road, castle } = field;
  // Gates where the roads meet the castle's and the outposts' walls: the only
  // ways in and out. The road widens to each gate's passage either side of it.
  const castleSpots = gateSpots(castle, 2, road),
    outpostSpots = field.outposts.map((p) => gateSpots(p.rect, 1, road));
  for (const g of [...castleSpots, ...outpostSpots.flat()]) widen(map, road, g);
  const castleGates = castleSpots.map((g) => setGate(map, g.side, g.rect, false));
  const outposts = field.outposts.map((p, i) => {
    const gates = outpostSpots[i].map((g) => setGate(map, g.side, g.rect, !stone));
    const walls = map.buildings.filter((b) => b.kind === "wall" && !b.hidden && onRing(p.rect, 1, b.rect.x, b.rect.y)).map((b) => b.id);
    for (const id of walls) {
      const b = map.buildings[id];
      if (stone) delete b.fence;
      else b.rails = fenceRails(p.rect, b.rect.x, b.rect.y);
    }
    return { ...p, houses: p.houses.filter((id) => !map.buildings[id].hidden), walls, gates };
  });
  return { ...field, castleGates, outposts, stone };
}
