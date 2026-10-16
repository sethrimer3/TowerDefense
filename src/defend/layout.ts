/** The player-authored city layout (which tiles are city, where the keep is,
 * which quarter tiles each structure stands on) plus the rules that decide
 * what is legal. `fitLayout` turns it into exact cells, so the same layout
 * always produces the same city. */
import {
  CELL_COUNT,
  CELLS_H,
  CELLS_W,
  ORTHO,
  SPAWN_ROW,
  SUB,
  TILES_H,
  TILES_W,
  WALL_THICKNESS,
  cellIndex,
  cellX,
  cellY,
  hash,
  hash01,
  parseTileKey,
  rectCells,
  sideCells,
  tileInBounds,
  tileKey,
  type Rect,
  type TilePos,
} from "./grid.ts";
import type { PathId } from "../knowledge-paths.ts";
import { BALLISTA, GATE, STRUCTURES, footprint, type StructureKind, type TileSpan } from "./catalog.ts";

export type PlacedKind = Exclude<StructureKind, "keep">;
/** A structure the player placed: its top left quarter tile is (qx, qy) on
 * the board's grid of quarter tiles, and it stands on tile (tx, ty), the
 * tile of that quarter (for a structure spanning a block of tiles, `span`,
 * the block's top left tile). Its footprint stays inside that tile (or
 * block). `path` is the Knowledge path this one building was upgraded along
 * and `rank` how far (both absent: plain); they move with the structure,
 * and a structure taken up keeps them in the palette (`DefendSave.kept`). */
export type PlacedStructure = { uid: number; kind: PlacedKind; tx: number; ty: number; qx: number; qy: number; path?: PathId; rank?: number };

/** Quarter tiles to a tile, each way: structures and wall sections are
 * placed on a grid four times finer than the tiles'. */
export const QUARTER = 4;
export const QUARTERS_W = TILES_W * QUARTER;
export const QUARTERS_H = TILES_H * QUARTER;
/** Cells across a quarter tile. */
export const QC = SUB / QUARTER;
/** A spot on the board's grid of quarter tiles. */
export type QuarterPos = { qx: number; qy: number };
export const quarterKey = (q: QuarterPos) => `${q.qx},${q.qy}`;
export function parseQuarterKey(key: string): QuarterPos {
  const [qx, qy] = key.split(",").map(Number);
  return { qx, qy };
}
/** The tile quarter (qx, qy) lies on. */
export const quarterTile = (q: QuarterPos): TilePos => ({ tx: Math.floor(q.qx / QUARTER), ty: Math.floor(q.qy / QUARTER) });

/** A side of a tile. */
export type Side = "n" | "e" | "s" | "w";
export const SIDES: readonly Side[] = ["n", "e", "s", "w"];
const SIDE_STEP: Record<Side, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
/** A city gate: set in the wall on `side` of city tile (tx, ty). Wall
 * spikes stand on the same kind of spot. */
export type GateSpot = { tx: number; ty: number; side: Side };
/** A row of wall spikes, on a gate's kind of spot, with the Knowledge path
 * it was upgraded along and how far (absent: plain). */
export type SpikeSpot = GateSpot & { path?: PathId; rank?: number };
/** A corner of the city wall: the tile corner (vx, vy), between the four
 * tiles around it, where the wall turns through a right angle. */
export type CornerSpot = { vx: number; vy: number };
/** A wall section the player placed, a quarter of a tile across: quarter
 * (qx, qy) of the board's grid of quarter tiles (`QUARTER` to a tile each
 * way). */
export type WallSpot = { qx: number; qy: number };

export type Layout = {
  keep: TilePos;
  /** City tiles other than the keep's own tile (the keep always counts as one). */
  cityTiles: string[];
  structures: PlacedStructure[];
  nextUid: number;
  /** Kinds whose building-specific upgrade makes them smaller (from the
   * Armory's levels, not saved on its own). */
  compact: PlacedKind[];
  /** City gates, each in the wall along one edge of a city tile. */
  gates: GateSpot[];
  /** Wall spikes, each along the wall on one edge of a city tile. */
  spikes: SpikeSpot[];
  /** Wall ballistas, each on a corner of the wall. */
  ballistas: CornerSpot[];
  /** Wall sections placed on their own, anywhere but the spawn row (absent
   * while there are none, so older layouts fit exactly as before). */
  walls?: WallSpot[];
  /** Whether wall sections may stand inside the city (from the walls'
   * Town walls upgrade, not saved on its own). */
  innerWalls?: true;
};

export type FittedStructure = {
  /** 0 is reserved for the keep. */
  uid: number;
  kind: StructureKind;
  tx: number;
  ty: number;
  rect: Rect;
  inside: boolean;
};

/** A gate's cells in the wall, and the city cells just inside it, kept
 * clear for the street that runs out through it. */
export type FittedGate = GateSpot & { rect: Rect; inner: Rect };
/** Wall spikes along the wall's outer row of stones on their edge. */
export type FittedSpikes = GateSpot & { rect: Rect };
/** A wall ballista's bastion, in the wall's stones at its corner. */
export type FittedBallista = CornerSpot & { rect: Rect; out: { x: number; y: number } };

export type Fit =
  | { ok: true; structures: FittedStructure[]; city: Uint8Array; wall: Uint8Array; gates?: FittedGate[]; spikes?: FittedSpikes[]; ballistas?: FittedBallista[]; pieces?: Uint8Array }
  | { ok: false; reason: string };

const KEEP_UID = 0;

export function defaultLayout(): Layout {
  return {
    keep: { tx: Math.floor(TILES_W / 2), ty: TILES_H - 4 },
    cityTiles: [],
    structures: [],
    nextUid: 1,
    compact: [],
    gates: [],
    spikes: [],
    ballistas: [],
  };
}

export function cloneLayout(l: Layout): Layout {
  return {
    keep: { ...l.keep },
    cityTiles: [...l.cityTiles],
    structures: l.structures.map((s) => ({ ...s })),
    nextUid: l.nextUid,
    compact: [...l.compact],
    gates: l.gates.map((g) => ({ ...g })),
    spikes: l.spikes.map((g) => ({ ...g })),
    ballistas: l.ballistas.map((v) => ({ ...v })),
    ...(l.walls ? { walls: l.walls.map((w) => ({ ...w })) } : {}),
    ...(l.innerWalls ? { innerWalls: true as const } : {}),
  };
}

export function cityTileSet(l: Layout): Set<string> {
  return new Set([tileKey(l.keep.tx, l.keep.ty), ...l.cityTiles]);
}

/** Each city tile's group of tiles joined along their edges, numbered from
 * 0 for the keep's own. */
export function tileGroups(l: Layout): Map<string, number> {
  const tiles = cityTileSet(l);
  const out = new Map<string, number>();
  let n = 0;
  for (const start of [tileKey(l.keep.tx, l.keep.ty), ...l.cityTiles]) {
    if (out.has(start)) continue;
    const stack = [start];
    out.set(start, n);
    while (stack.length) {
      const { tx, ty } = parseTileKey(stack.pop()!);
      for (const [dx, dy] of ORTHO) {
        const k = tileKey(tx + dx, ty + dy);
        if (tiles.has(k) && !out.has(k)) {
          out.set(k, n);
          stack.push(k);
        }
      }
    }
    n++;
  }
  return out;
}

/** Cell mask of the city (1 = inside a city tile). */
function cityMask(l: Layout): Uint8Array {
  const city = new Uint8Array(CELL_COUNT);
  for (const k of cityTileSet(l)) {
    const { tx, ty } = parseTileKey(k);
    for (const i of rectCells({ x: tx * SUB, y: ty * SUB, w: SUB, h: SUB })) city[i] = 1;
  }
  return city;
}

/** The city wall: every non-city cell within `WALL_THICKNESS` (Chebyshev) of
 * a city cell. The board edge is impassable, so no wall is needed there. */
export function wallMask(city: Uint8Array): Uint8Array {
  const wall = new Uint8Array(CELL_COUNT);
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      const i = cellIndex(cx, cy);
      if (!city[i] && nearCity(city, cx, cy)) wall[i] = 1;
    }
  return wall;
}

/** Whether any city cell lies within `WALL_THICKNESS` of (cx, cy). */
function nearCity(city: Uint8Array, cx: number, cy: number): boolean {
  const r = WALL_THICKNESS;
  const x0 = Math.max(0, cx - r),
    x1 = Math.min(CELLS_W - 1, cx + r);
  for (let y = Math.max(0, cy - r); y <= Math.min(CELLS_H - 1, cy + r); y++)
    for (let x = x0; x <= x1; x++) if (city[cellIndex(x, y)]) return true;
  return false;
}

/** The city's mask and its ring of wall for the last set of city tiles
 * asked about: placing one structure tries every spot over the same tiles. */
let lastRing: { key: string; city: Uint8Array; wall: Uint8Array } | null = null;
function ring(l: Layout): { city: Uint8Array; wall: Uint8Array } {
  const key = [...cityTileSet(l)].sort().join(";");
  if (lastRing?.key !== key) {
    const city = cityMask(l);
    lastRing = { key, city, wall: wallMask(city) };
  }
  return { city: lastRing.city.slice(), wall: lastRing.wall.slice() };
}

/** Structures that need no clear quarter between them and the next:
 * monster bait may stand right beside anything. */
export const huddles = (kind: StructureKind) => kind === "monsterBait";

/** A structure's footprint in quarter tiles. */
export function quarterSize(kind: StructureKind, compact: boolean): { qw: number; qh: number; span: TileSpan } {
  const f = footprint(kind, compact);
  return { qw: f.w / QC, qh: f.h / QC, span: f.span };
}

/** The keep's top left quarter: its footprint in the middle of its tile. */
export function keepQuarter(keep: TilePos): QuarterPos {
  const { qw, qh } = quarterSize("keep", false);
  return { qx: keep.tx * QUARTER + ((QUARTER - qw) >> 1), qy: keep.ty * QUARTER + ((QUARTER - qh) >> 1) };
}

/** What a structure is fitted as. */
type Placement = { uid: number; kind: StructureKind; tx: number; ty: number; qx: number; qy: number; qw: number; qh: number; span: TileSpan };

/** The cells of a structure standing with its top left quarter at (qx, qy). */
export const quarterRectCells = (qx: number, qy: number, qw: number, qh: number): Rect => ({ x: qx * QC, y: qy * QC, w: qw * QC, h: qh * QC });

/** Work out the exact cell rectangle of every structure, each where the
 * player put it on the quarter grid, the keep in the middle of its tile.
 * Fails, saying why, if a structure leaves its tile, overlaps the wall,
 * another structure or a gate's way in, stands right beside another
 * building (every building but monster bait keeps a clear quarter tile
 * round it), stands on the wrong side of the city limits, or would be cut
 * off from the keep's streets. */
export function fitLayout(l: Layout): Fit {
  const { city, wall } = ring(l);
  const cityTiles = cityTileSet(l);
  // The sections placed on their own: each of their cells is wall, and one
  // inside the city is taken out of it.
  const pieces = wallPieces(l, wall);
  if (typeof pieces === "string") return { ok: false, reason: pieces };
  const gates = l.gates.filter((g) => gateOk(cityTiles, g)).map(fitGate);
  const spikes = l.spikes.filter((g) => gateOk(cityTiles, g)).map((g): FittedSpikes => ({ ...g, rect: spikesRect(g) }));
  const ballistas = l.ballistas.filter((v) => cornerOk(cityTiles, v)).map((v): FittedBallista => ({ ...v, rect: ballistaRect(cityTiles, v), out: cornerOutward(cityTiles, v) }));
  if (pieces) {
    for (let i = 0; i < CELL_COUNT; i++) if (pieces[i]) { wall[i] = 1; city[i] = 0; }
    if (gates.some((g) => rectCells(grow(g.inner, g.side)).some((i) => pieces[i]))) return { ok: false, reason: "A wall there would block a city gate." };
  }
  // The way in through each gate stays clear for its street.
  const clear = new Uint8Array(CELL_COUNT);
  for (const g of gates) for (const i of rectCells(grow(g.inner, g.side))) clear[i] = 1;
  // `foot`: the uid + 1 of what stands on each cell; `near`: the uid + 1
  // of the building whose clear quarter round it covers the cell.
  const foot = new Int32Array(CELL_COUNT), near = new Int32Array(CELL_COUNT);
  const fitted: FittedStructure[] = [];
  for (const p of placements(l)) {
    const f = fitOne(p, cityTiles, { city, wall, clear, foot, near });
    if (typeof f === "string") return { ok: false, reason: f };
    fitted.push(f);
  }
  const cut = cutOff(fitted, city, foot, l);
  if (cut) return { ok: false, reason: `The ${STRUCTURES[cut.kind].name.toLowerCase()} would be cut off from the streets.` };
  return {
    ok: true,
    structures: fitted,
    city,
    wall,
    ...(gates.length ? { gates } : {}),
    ...(spikes.length ? { spikes } : {}),
    ...(ballistas.length ? { ballistas } : {}),
    ...(pieces ? { pieces } : {}),
  };
}

/** The keep, then every structure oldest first, as fitted. */
function placements(l: Layout): Placement[] {
  const compact = new Set(l.compact);
  const keep = keepQuarter(l.keep);
  const out: Placement[] = [{ uid: KEEP_UID, kind: "keep", tx: l.keep.tx, ty: l.keep.ty, ...keep, ...quarterSize("keep", false) }];
  for (const s of [...l.structures].sort((a, b) => a.uid - b.uid))
    out.push({ uid: s.uid, kind: s.kind, tx: s.tx, ty: s.ty, qx: s.qx, qy: s.qy, ...quarterSize(s.kind, compact.has(s.kind)) });
  return out;
}

type FitCells = { city: Uint8Array; wall: Uint8Array; clear: Uint8Array; foot: Int32Array; near: Int32Array };

/** Fits one structure where it stands and claims its cells; or says why it
 * can't stand there. */
function fitOne(p: Placement, cityTiles: Set<string>, cells: FitCells): FittedStructure | string {
  const def = STRUCTURES[p.kind], name = def.name.toLowerCase();
  if (!tileInBounds(p.tx, p.ty) || p.ty === SPAWN_ROW) return "Nothing can be built on the spawn row.";
  if (!tileInBounds(p.tx + p.span - 1, p.ty + p.span - 1)) return `The ${name} would hang off the board.`;
  const x0 = p.tx * QUARTER, y0 = p.ty * QUARTER, x1 = (p.tx + p.span) * QUARTER, y1 = (p.ty + p.span) * QUARTER;
  if (p.qx < x0 || p.qy < y0 || p.qx + p.qw > x1 || p.qy + p.qh > y1) return p.span > 1 ? `The ${name} must fit inside a 2 × 2 block of tiles.` : `The ${name} must fit inside one tile.`;
  const tiles = blockTiles(p.tx, p.ty, p.span);
  const inside = tiles.every((k) => cityTiles.has(k));
  if (!inside && tiles.some((k) => cityTiles.has(k))) return `The ${name} can't straddle the city limits.`;
  if (!inside && !def.outsideOk) return `${def.name} must be inside the city limits.`;
  const rect = quarterRectCells(p.qx, p.qy, p.qw, p.qh);
  const free = !huddles(p.kind);
  for (const i of rectCells(rect)) {
    if (cells.wall[i]) return `The ${name} can't stand on the wall.`;
    if (!!cells.city[i] !== inside) return `The ${name} can't straddle the city limits.`;
    if (cells.foot[i]) return `There's something standing there already.`;
    if (cells.clear[i]) return `The ${name} would block a city gate.`;
    if (free && cells.near[i]) return `Buildings need a clear square between them.`;
  }
  const uid = p.uid + 1;
  for (const i of rectCells(rect)) cells.foot[i] = uid;
  if (free) for (const i of rectCells({ x: rect.x - QC, y: rect.y - QC, w: rect.w + 2 * QC, h: rect.h + 2 * QC })) cells.near[i] ||= uid;
  return { uid: p.uid, kind: p.kind, tx: p.tx, ty: p.ty, rect, inside };
}

/** The tile keys of the `span` × `span` block whose top left tile is
 * (tx, ty). */
export function blockTiles(tx: number, ty: number, span: TileSpan): string[] {
  const out: string[] = [];
  for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) out.push(tileKey(tx + dx, ty + dy));
  return out;
}

/** City cells beside a rect that no structure stands on. */
const openSides = (r: Rect, city: Uint8Array, foot: Int32Array) => sideCells(r).filter((i) => city[i] && !foot[i]);

/** The first in-city structure that can't reach the keep through open city
 * cells, if any. In a district apart from the keep's, its first structure
 * stands in for the keep. */
function cutOff(fitted: FittedStructure[], city: Uint8Array, foot: Int32Array, l: Layout): FittedStructure | undefined {
  const reach = new Uint8Array(CELL_COUNT);
  const stack = openSides(fitted[0].rect, city, foot);
  const groups = tileGroups(l), seeded = new Set([0]);
  for (const f of fitted) {
    const g = groups.get(tileKey(f.tx, f.ty));
    if (g === undefined || seeded.has(g) || !f.inside) continue;
    seeded.add(g);
    stack.push(...openSides(f.rect, city, foot));
  }
  for (const i of stack) reach[i] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    for (const n of openSides({ x: cellX(i), y: cellY(i), w: 1, h: 1 }, city, foot))
      if (!reach[n]) {
        reach[n] = 1;
        stack.push(n);
      }
  }
  return fitted.find((f) => f.inside && f.uid !== KEEP_UID && !openSides(f.rect, city, foot).some((i) => reach[i]));
}

/** Every spot (top left quarter) a structure of `kind` could take on tile
 * (or block) (tx, ty), its footprint inside it. */
export function tileSpots(l: Layout, kind: PlacedKind, tx: number, ty: number): QuarterPos[] {
  const { qw, qh, span } = quarterSize(kind, l.compact.includes(kind));
  const out: QuarterPos[] = [];
  for (let qy = ty * QUARTER; qy + qh <= (ty + span) * QUARTER; qy++) for (let qx = tx * QUARTER; qx + qw <= (tx + span) * QUARTER; qx++) out.push({ qx, qy });
  return out;
}

/** Spots tried in all by one `arrange` before giving up: far more than any
 * tile's arrangements need. */
const SEARCH = 4000;

/** `l` with the structures `uids` set out afresh on their own tiles, each in
 * the first spot (in an order hashed from its uid) where the rest still fit,
 * searching every arrangement, backtracking, so they are found a place
 * whenever any arrangement fits; or null when none does. For saves from
 * before structures had spots, and tiles carried somewhere new. */
export function arrange(l: Layout, uids: number[]): Layout | null {
  const next = cloneLayout(l);
  const moving = next.structures.filter((s) => uids.includes(s.uid));
  // Biggest first: they have the fewest places to go.
  const compact = new Set(l.compact);
  const area = (s: PlacedStructure) => { const q = quarterSize(s.kind, compact.has(s.kind)); return q.qw * q.qh; };
  moving.sort((a, b) => area(b) - area(a) || a.uid - b.uid);
  const rest = cloneLayout(next);
  rest.structures = rest.structures.filter((s) => !uids.includes(s.uid));
  if (!fitLayout(rest).ok) return null;
  let budget = SEARCH;
  const placed: PlacedStructure[] = [];
  const place = (n: number): boolean => {
    if (n === moving.length) return true;
    const s = moving[n];
    const spots = tileSpots(next, s.kind, s.tx, s.ty).sort((a, b) => hash01(s.uid, a.qx, a.qy) - hash01(s.uid, b.qx, b.qy));
    for (const q of spots) {
      if (budget-- <= 0) return false;
      const t = { ...s, qx: q.qx, qy: q.qy };
      rest.structures.push(t);
      if (fitLayout(rest).ok) {
        placed.push(t);
        if (place(n + 1)) return true;
        placed.pop();
      }
      rest.structures.pop();
    }
    return false;
  };
  if (!place(0)) return null;
  next.structures = next.structures.map((s) => placed.find((p) => p.uid === s.uid) ?? s);
  return next;
}

// ── Gates ────────────────────────────────────────────────────────────────

export const gateKey = (g: GateSpot) => `${g.tx},${g.ty},${g.side}`;
export const sameGate = (a: GateSpot, b: GateSpot) => a.tx === b.tx && a.ty === b.ty && a.side === b.side;

/** The tile across `side` of (tx, ty). */
export const across = (g: GateSpot): TilePos => ({ tx: g.tx + SIDE_STEP[g.side][0], ty: g.ty + SIDE_STEP[g.side][1] });

/** Whether a gate may stand at `g`: its tile is a city tile and the tile
 * across that side is on the board and not, so the wall runs there. */
export function gateOk(cityTiles: Set<string>, g: GateSpot) {
  const o = across(g);
  return cityTiles.has(tileKey(g.tx, g.ty)) && tileInBounds(o.tx, o.ty) && !cityTiles.has(tileKey(o.tx, o.ty));
}

/** The gate's cells: `GATE.long` along the middle of the tile's side, and
 * the wall's whole depth outward. */
export function gateRect({ tx, ty, side }: GateSpot): Rect {
  const along = Math.floor((SUB - GATE.long) / 2);
  const x0 = tx * SUB, y0 = ty * SUB;
  if (side === "n") return { x: x0 + along, y: y0 - GATE.deep, w: GATE.long, h: GATE.deep };
  if (side === "s") return { x: x0 + along, y: y0 + SUB, w: GATE.long, h: GATE.deep };
  if (side === "w") return { x: x0 - GATE.deep, y: y0 + along, w: GATE.deep, h: GATE.long };
  return { x: x0 + SUB, y: y0 + along, w: GATE.deep, h: GATE.long };
}

/** The row of city cells just inside the gate. */
function gateInner(g: GateSpot): Rect {
  const r = gateRect(g);
  if (g.side === "n") return { x: r.x, y: r.y + r.h, w: r.w, h: 1 };
  if (g.side === "s") return { x: r.x, y: r.y - 1, w: r.w, h: 1 };
  if (g.side === "w") return { x: r.x + r.w, y: r.y, w: 1, h: r.h };
  return { x: r.x - 1, y: r.y, w: 1, h: r.h };
}

/** `r` deepened one more cell away from `side` (into the city). */
function grow(r: Rect, side: Side): Rect {
  if (side === "n") return { ...r, h: r.h + 1 };
  if (side === "s") return { ...r, y: r.y - 1, h: r.h + 1 };
  if (side === "w") return { ...r, w: r.w + 1 };
  return { ...r, x: r.x - 1, w: r.w + 1 };
}

const fitGate = (g: GateSpot): FittedGate => ({ tx: g.tx, ty: g.ty, side: g.side, rect: gateRect(g), inner: gateInner(g) });

/** Drops the gates, spikes and ballistas whose wall moved away, and the
 * wall sections now inside the city where they may not stand. */
function keepGates(l: Layout) {
  const tiles = cityTileSet(l);
  l.gates = l.gates.filter((g) => gateOk(tiles, g));
  l.spikes = l.spikes.filter((g) => gateOk(tiles, g));
  l.ballistas = l.ballistas.filter((v) => cornerOk(tiles, v));
  if (!l.innerWalls) dropInnerWalls(l);
}

/** Sets a new gate into the wall at `g` (not where spikes stand). */
export function placeGate(l: Layout, g: GateSpot): Layout | null {
  if (!gateOk(cityTileSet(l), g) || l.gates.some((o) => sameGate(o, g)) || l.spikes.some((o) => sameGate(o, g))) return null;
  const next = cloneLayout(l);
  next.gates.push({ tx: g.tx, ty: g.ty, side: g.side });
  return fitLayout(next).ok ? next : null;
}

export function removeGate(l: Layout, g: GateSpot): Layout {
  const next = cloneLayout(l);
  next.gates = next.gates.filter((o) => !sameGate(o, g));
  return next;
}

/** Moves the gate at `from` to `to` (or keeps the layout, dropped where it
 * stood). */
export function moveGate(l: Layout, from: GateSpot, to: GateSpot): Layout | null {
  if (sameGate(from, to)) return l;
  return placeGate(removeGate(l, from), to);
}

// ── Wall spikes ──────────────────────────────────────────────────────────

/** The wall's outer row of stones along `side` of tile (tx, ty), where the
 * spikes stand, pointing out. */
export function spikesRect({ tx, ty, side }: GateSpot): Rect {
  const x0 = tx * SUB, y0 = ty * SUB;
  const out = GATE.deep - 1;
  if (side === "n") return { x: x0, y: y0 - 1 - out, w: SUB, h: 1 };
  if (side === "s") return { x: x0, y: y0 + SUB + out, w: SUB, h: 1 };
  if (side === "w") return { x: x0 - 1 - out, y: y0, w: 1, h: SUB };
  return { x: x0 + SUB + out, y: y0, w: 1, h: SUB };
}

/** The whole depth of the wall along `side` of tile (tx, ty): what a
 * carried set of spikes is shown over. */
export function edgeWallRect(g: GateSpot): Rect {
  const r = spikesRect(g);
  if (g.side === "n") return { ...r, h: GATE.deep };
  if (g.side === "s") return { ...r, y: r.y - GATE.deep + 1, h: GATE.deep };
  if (g.side === "w") return { ...r, w: GATE.deep };
  return { ...r, x: r.x - GATE.deep + 1, w: GATE.deep };
}

/** Sets spikes along the wall at `g` (not where a gate stands). */
export function placeSpikes(l: Layout, g: GateSpot, wear?: { path?: PathId; rank?: number }): Layout | null {
  if (!gateOk(cityTileSet(l), g) || l.spikes.some((o) => sameGate(o, g)) || l.gates.some((o) => sameGate(o, g))) return null;
  const next = cloneLayout(l);
  next.spikes.push({ tx: g.tx, ty: g.ty, side: g.side, ...(wear?.path && wear.rank ? { path: wear.path, rank: wear.rank } : {}) });
  return fitLayout(next).ok ? next : null;
}

export function removeSpikes(l: Layout, g: GateSpot): Layout {
  const next = cloneLayout(l);
  next.spikes = next.spikes.filter((o) => !sameGate(o, g));
  return next;
}

/** Moves a row of spikes along the wall, keeping its path and rank. */
export function moveSpikes(l: Layout, from: GateSpot, to: GateSpot): Layout | null {
  if (sameGate(from, to)) return l;
  return placeSpikes(removeSpikes(l, from), to, l.spikes.find((o) => sameGate(o, from)));
}

// ── Wall ballistas ───────────────────────────────────────────────────────

export const cornerKey = (v: CornerSpot) => `${v.vx},${v.vy}`;
export const sameCorner = (a: CornerSpot, b: CornerSpot) => a.vx === b.vx && a.vy === b.vy;

/** The four tiles around corner `v`, as [dx, dy] steps from it: north
 * west, north east, south west, south east. */
const QUADS = [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const;

/** Which of the four tiles round corner `v` are city tiles. */
const quadsIn = (tiles: Set<string>, v: CornerSpot) => QUADS.map(([dx, dy]) => tiles.has(tileKey(v.vx + dx, v.vy + dy)));

/** Whether the wall turns through a right angle at corner `v`: the four
 * tiles round it are on the board and one of them, or three, are city.
 * Two (a straight run, or two tiles meeting at a point) don't count. */
export function cornerOk(tiles: Set<string>, v: CornerSpot) {
  if (v.vx < 1 || v.vy < 1 || v.vx >= TILES_W || v.vy >= TILES_H) return false;
  const n = quadsIn(tiles, v).filter(Boolean).length;
  return n === 1 || n === 3;
}

/** The ballista's bastion: the corner block of wall stones at `v`, in the
 * tile across the corner from a lone city tile, or in the one tile round a
 * bend that isn't city. */
export function ballistaRect(tiles: Set<string>, v: CornerSpot): Rect {
  const inside = quadsIn(tiles, v);
  const lone = inside.filter(Boolean).length === 1;
  const q = lone ? 3 - inside.indexOf(true) : inside.indexOf(false);
  const [dx, dy] = QUADS[q];
  const n = BALLISTA.size;
  return { x: v.vx * SUB + (dx < 0 ? -n : 0), y: v.vy * SUB + (dy < 0 ? -n : 0), w: n, h: n };
}

/** The way out of the city at corner `v`, as a diagonal unit step: from
 * the corner toward its bastion. */
export function cornerOutward(tiles: Set<string>, v: CornerSpot): { x: number; y: number } {
  const r = ballistaRect(tiles, v);
  return { x: Math.sign(r.x + r.w / 2 - v.vx * SUB), y: Math.sign(r.y + r.h / 2 - v.vy * SUB) };
}

export function placeBallista(l: Layout, v: CornerSpot): Layout | null {
  if (!cornerOk(cityTileSet(l), v) || l.ballistas.some((o) => sameCorner(o, v))) return null;
  const next = cloneLayout(l);
  next.ballistas.push({ vx: v.vx, vy: v.vy });
  return fitLayout(next).ok ? next : null;
}

export function removeBallista(l: Layout, v: CornerSpot): Layout {
  const next = cloneLayout(l);
  next.ballistas = next.ballistas.filter((o) => !sameCorner(o, v));
  return next;
}

export function moveBallista(l: Layout, from: CornerSpot, to: CornerSpot): Layout | null {
  if (sameCorner(from, to)) return l;
  return placeBallista(removeBallista(l, from), to);
}

// ── Edits ────────────────────────────────────────────────────────────────
// Every edit returns the new layout, or null when it would be illegal.

export function placeCityTile(l: Layout, tx: number, ty: number): Layout | null {
  if (!tileInBounds(tx, ty) || ty === SPAWN_ROW) return null;
  const tiles = cityTileSet(l);
  if (tiles.has(tileKey(tx, ty))) return null;
  const next = cloneLayout(l);
  next.cityTiles.push(tileKey(tx, ty));
  // A gate facing the new tile no longer stands in the wall.
  keepGates(next);
  if (fitLayout(next).ok) return next;
  // Structures beside it, outside the city, may now be under its wall: set
  // those tiles' structures out afresh.
  const beside = next.structures.filter((s) => Math.abs(s.tx - tx) <= 1 && Math.abs(s.ty - ty) <= 1 && !(s.tx === tx && s.ty === ty));
  return beside.length ? arrange(next, beside.map((s) => s.uid)) : null;
}

/** Remove a city tile. Structures on it go back to the palette; returns their
 * kinds alongside the new layout. */
export function removeCityTile(l: Layout, tx: number, ty: number): { layout: Layout; returned: PlacedKind[] } | null {
  const key = tileKey(tx, ty);
  if (!l.cityTiles.includes(key)) return null;
  const next = cloneLayout(l);
  next.cityTiles = next.cityTiles.filter((k) => k !== key);
  const on = (s: PlacedStructure) => covers(l, s, tx, ty);
  const returned = next.structures.filter(on).map((s) => s.kind);
  next.structures = next.structures.filter((s) => !on(s));
  keepGates(next);
  return fitLayout(next).ok ? { layout: next, returned } : null;
}

/** Whether city tile `tile` can be carried somewhere else: anything standing
 * on it goes with it, but not a structure whose block spans other tiles.
 * The keep's own tile is carried by the keep (`moveKeep`). */
export function tileMovable(l: Layout, tile: TilePos) {
  return l.cityTiles.includes(tileKey(tile.tx, tile.ty)) && !spannedOver(l, tile);
}
const spannedOver = (l: Layout, tile: TilePos) => l.structures.some((s) => spanOf(l, s.kind) > 1 && covers(l, s, tile.tx, tile.ty));

/** Move a city tile with everything on it: its structures keep their uids
 * and paths, and the gates and spikes in its wall go along. Ballistas on its
 * corners go too where the tile was what made the corner. Whatever no
 * longer fits the new place's wall is dropped back to the palette. */
export function moveCityTile(l: Layout, from: TilePos, to: TilePos): Layout | null {
  if (!tileMovable(l, from)) return null;
  return carryTile(l, from, to);
}

/** Carries tile `from` (a city tile, or the keep's) to open ground at `to`
 * with everything on it. */
function carryTile(l: Layout, from: TilePos, to: TilePos): Layout | null {
  if (!tileInBounds(to.tx, to.ty) || to.ty === SPAWN_ROW) return null;
  const toKey = tileKey(to.tx, to.ty);
  if (cityTileSet(l).has(toKey)) return null;
  const next = cloneLayout(l);
  const dx = to.tx - from.tx, dy = to.ty - from.ty;
  const on = (p: TilePos) => p.tx === from.tx && p.ty === from.ty;
  if (on(l.keep)) next.keep = { tx: to.tx, ty: to.ty };
  else next.cityTiles = next.cityTiles.map((k) => (k === tileKey(from.tx, from.ty) ? toKey : k));
  const carried = next.structures.filter(on);
  for (const s of carried) { s.tx += dx; s.ty += dy; s.qx += dx * QUARTER; s.qy += dy * QUARTER; }
  for (const g of [...next.gates, ...next.spikes]) if (on(g)) { g.tx += dx; g.ty += dy; }
  for (const w of next.walls ?? []) if (on(wallTile(w))) { w.qx += dx * QUARTER; w.qy += dy * QUARTER; }
  const left = cityTileSet(l);
  left.delete(tileKey(from.tx, from.ty));
  for (const v of next.ballistas) {
    const corner = (v.vx === from.tx || v.vx === from.tx + 1) && (v.vy === from.ty || v.vy === from.ty + 1);
    if (corner && !cornerOk(left, v)) { v.vx += dx; v.vy += dy; }
  }
  keepGates(next);
  if (fitLayout(next).ok) return next;
  // Their spots don't fit the new place (beside another tile's buildings,
  // say): set them out afresh on it.
  return arrange(next, carried.map((s) => s.uid));
}

/** How many tiles across `kind`'s block is in layout `l`. */
export const spanOf = (l: Layout, kind: PlacedKind): TileSpan => footprint(kind, l.compact.includes(kind)).span;

/** Whether structure `s` stands on tile (tx, ty), on its own tile or
 * anywhere in its block. */
export function covers(l: Layout, s: PlacedStructure, tx: number, ty: number) {
  const span = spanOf(l, s.kind);
  return tx >= s.tx && tx < s.tx + span && ty >= s.ty && ty < s.ty + span;
}

/** `l` with the structures `uids` set out afresh, tile by tile (oldest tile
 * first), and any of them that no arrangement of their tile takes (the
 * newest first) taken off, back to the palette. */
export function settle(l: Layout, uids: number[]): Layout {
  let next = l;
  const tiles = new Map<string, number[]>();
  for (const s of [...l.structures].sort((a, b) => a.uid - b.uid))
    if (uids.includes(s.uid)) {
      const k = tileKey(s.tx, s.ty);
      tiles.set(k, [...(tiles.get(k) ?? []), s.uid]);
    }
  // Off the board while their tile waits its turn.
  const waiting = new Set(uids);
  const without = (from: Layout, gone: Set<number>) => {
    const out = cloneLayout(from);
    out.structures = out.structures.filter((s) => !gone.has(s.uid));
    return out;
  };
  let base = without(next, waiting);
  for (const group of tiles.values()) {
    const ids = [...group];
    for (;;) {
      const trial = cloneLayout(base);
      trial.structures.push(...next.structures.filter((s) => ids.includes(s.uid)).map((s) => ({ ...s })));
      const done = ids.length ? arrange(trial, ids) : trial;
      if (done) { base = done; break; }
      ids.pop();
    }
  }
  return base;
}

/** Place a new structure at quarter `q` (its top left quarter), which takes
 * the next uid (wearing `wear`'s path and rank: a kept copy placed again). */
export function placeStructureAt(l: Layout, kind: PlacedKind, q: QuarterPos, wear?: { path: PathId; rank: number }): Layout | null {
  const next = cloneLayout(l);
  next.structures.push({ uid: l.nextUid, kind, ...quarterTile(q), ...q, ...(wear ? { path: wear.path, rank: wear.rank } : {}) });
  next.nextUid++;
  return fitLayout(next).ok ? next : null;
}

/** Place a new structure on the first spot of tile (tx, ty) that takes it,
 * in an order hashed from its uid; failing that, with the tile's structures
 * set out afresh round it, whenever any arrangement fits (tests). */
export function placeStructure(l: Layout, kind: PlacedKind, tx: number, ty: number, wear?: { path: PathId; rank: number }): Layout | null {
  for (const q of hashedSpots(l, kind, tx, ty, l.nextUid)) {
    const next = placeStructureAt(l, kind, q, wear);
    if (next) return next;
  }
  if (!tileInBounds(tx, ty)) return null;
  const next = cloneLayout(l);
  next.structures.push({ uid: l.nextUid, kind, tx, ty, qx: tx * QUARTER, qy: ty * QUARTER, ...(wear ? { path: wear.path, rank: wear.rank } : {}) });
  next.nextUid++;
  return arrange(next, next.structures.filter((s) => s.tx === tx && s.ty === ty).map((s) => s.uid));
}

const hashedSpots = (l: Layout, kind: PlacedKind, tx: number, ty: number, uid: number) =>
  tileInBounds(tx, ty) ? tileSpots(l, kind, tx, ty).sort((a, b) => hash01(uid, a.qx, a.qy) - hash01(uid, b.qx, b.qy)) : [];

export function removeStructure(l: Layout, uid: number): Layout {
  const next = cloneLayout(l);
  next.structures = next.structures.filter((s) => s.uid !== uid);
  return next;
}

/** Move an existing structure so its top left quarter is `q`, keeping its
 * uid, path and rank. */
export function moveStructureTo(l: Layout, uid: number, q: QuarterPos): Layout | null {
  const s = l.structures.find((p) => p.uid === uid);
  if (!s) return null;
  if (s.qx === q.qx && s.qy === q.qy) return l;
  const next = removeStructure(l, uid);
  next.structures.push({ ...s, ...quarterTile(q), ...q });
  return fitLayout(next).ok ? next : null;
}

/** Move an existing structure to the first spot of tile (tx, ty) that takes
 * it (tests). */
export function moveStructure(l: Layout, uid: number, tx: number, ty: number): Layout | null {
  for (const q of hashedSpots(l, l.structures.find((p) => p.uid === uid)?.kind ?? "watchTower", tx, ty, uid)) {
    const next = moveStructureTo(l, uid, q);
    if (next) return next;
  }
  return null;
}

/** The structure whose footprint covers cell (cx, cy) in `l`, if any. */
export function structureAt(l: Layout, cx: number, cy: number): PlacedStructure | undefined {
  return l.structures.find((s) => {
    const { qw, qh } = quarterSize(s.kind, l.compact.includes(s.kind));
    const r = quarterRectCells(s.qx, s.qy, qw, qh);
    return cx >= r.x && cy >= r.y && cx < r.x + r.w && cy < r.y + r.h;
  });
}

/** The keep's tile is placed like any city tile: onto open ground it
 * carries its tile with everything on it (`carryTile`), and onto another
 * city tile the two tiles swap roles. */
export function moveKeep(l: Layout, tx: number, ty: number): Layout | null {
  const key = tileKey(tx, ty);
  if (!l.cityTiles.includes(key)) return spannedOver(l, l.keep) ? null : carryTile(l, l.keep, { tx, ty });
  const next = cloneLayout(l);
  next.cityTiles = next.cityTiles.filter((k) => k !== key);
  next.cityTiles.push(tileKey(l.keep.tx, l.keep.ty));
  next.keep = { tx, ty };
  return fitLayout(next).ok ? next : null;
}

export function placedCount(l: Layout, kind: PlacedKind | "cityTile" | "cityGate" | "wallSpikes" | "wallBallista" | "wallBlock"): number {
  if (kind === "wallBlock") return l.walls?.length ?? 0;
  if (kind === "cityGate") return l.gates.length;
  if (kind === "wallSpikes") return l.spikes.length;
  if (kind === "wallBallista") return l.ballistas.length;
  return kind === "cityTile" ? l.cityTiles.length : l.structures.filter((s) => s.kind === kind).length;
}

// ── Wall sections ────────────────────────────────────────────────────────

/** A wall section is `WALL_PIECE` cells square, as thick as the city wall:
 * one quarter tile. */
export const WALL_PIECE = QC;

export const wallKey = (w: WallSpot) => `${w.qx},${w.qy}`;
export const sameWall = (a: WallSpot, b: WallSpot) => a.qx === b.qx && a.qy === b.qy;
export function parseWallKey(key: string): WallSpot {
  const [qx, qy] = key.split(",").map(Number);
  return { qx, qy };
}
/** The tile a wall section stands on. */
export const wallTile = quarterTile;
/** Whether a wall section may stand at `w` at all: on the board, off the
 * spawn row. */
export const wallSpotOk = (w: WallSpot) => w.qx >= 0 && w.qy >= 0 && w.qx < QUARTERS_W && w.qy < QUARTERS_H && wallTile(w).ty !== SPAWN_ROW;

/** The cells a wall section takes: its whole quarter tile. */
export const wallPieceRect = (w: WallSpot): Rect => quarterRectCells(w.qx, w.qy, 1, 1);
/** The quarter of its tile `w` names, in cells: what the placing grid
 * frames, the same as its section. */
export const quarterRect = wallPieceRect;
/** The quarter tile under the point (x, y), in cells. */
export const quarterAt = (x: number, y: number): WallSpot => ({ qx: Math.floor(x / QC), qy: Math.floor(y / QC) });

/** The placed wall sections' cells that aren't already the city's wall, or
 * undefined with none placed; or why they can't stand. */
function wallPieces(l: Layout, ring: Uint8Array): Uint8Array | undefined | string {
  if (!l.walls?.length) return undefined;
  const tiles = cityTileSet(l);
  const out = new Uint8Array(CELL_COUNT);
  for (const w of l.walls) {
    if (!wallSpotOk(w)) return "Nothing can be built on the spawn row.";
    const t = wallTile(w);
    if (!l.innerWalls && tiles.has(tileKey(t.tx, t.ty))) return "Walls can stand inside the city only with the Town walls upgrade.";
    for (const i of rectCells(wallPieceRect(w))) if (!ring[i]) out[i] = 1;
  }
  return out;
}

/** Takes up the wall sections standing inside the city. */
export function dropInnerWalls(l: Layout) {
  if (!l.walls) return;
  const tiles = cityTileSet(l);
  l.walls = l.walls.filter((w) => {
    const t = wallTile(w);
    return !tiles.has(tileKey(t.tx, t.ty));
  });
  if (!l.walls.length) delete l.walls;
}

/** What placing wall sections in `l` is checked against, worked out once
 * for every spot tried: every cell that is wall already, the structures
 * standing outside the city, and the city's tiles. */
export type WallContext = { walled: Uint8Array; outside: Rect[]; tiles: Set<string> };
export function wallContext(l: Layout): WallContext | null {
  const fit = fitLayout(l);
  if (!fit.ok) return null;
  return { walled: fit.wall, outside: fit.structures.filter((s) => !s.inside).map((s) => s.rect), tiles: cityTileSet(l) };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Places a wall section at `w`: not where one stands, nor where every cell
 * of it is wall already, nor over a structure; inside the city only with
 * `innerWalls`, and only where the city still fits round it. Outside the
 * city it can't change how anything else fits, so `ctx` (worked out once)
 * settles it without fitting the city again. */
export function placeWall(l: Layout, w: WallSpot, ctx = wallContext(l)): Layout | null {
  if (!ctx || !wallSpotOk(w) || l.walls?.some((o) => sameWall(o, w))) return null;
  const rect = wallPieceRect(w);
  if (rectCells(rect).every((i) => ctx.walled[i])) return null;
  const t = wallTile(w), inside = ctx.tiles.has(tileKey(t.tx, t.ty));
  if (inside && !l.innerWalls) return null;
  if (!inside && ctx.outside.some((r) => overlaps(r, rect))) return null;
  const next = cloneLayout(l);
  next.walls = [...(next.walls ?? []), { qx: w.qx, qy: w.qy }];
  return inside && !fitLayout(next).ok ? null : next;
}

export function removeWall(l: Layout, w: WallSpot): Layout {
  const next = cloneLayout(l);
  next.walls = next.walls?.filter((o) => !sameWall(o, w));
  if (!next.walls?.length) delete next.walls;
  return next;
}

/** Moves the wall section at `from` to `to` (or keeps the layout, dropped
 * where it stood). */
export function moveWall(l: Layout, from: WallSpot, to: WallSpot, ctx?: WallContext | null): Layout | null {
  if (sameWall(from, to)) return l;
  const rest = removeWall(l, from);
  return placeWall(rest, to, ctx === undefined ? wallContext(rest) : ctx);
}

/** The wall section a press on cell (cx, cy) picks up: of those covering
 * it, the one whose middle is nearest. */
export function wallAtCell(l: Layout, cx: number, cy: number): WallSpot | undefined {
  let best: WallSpot | undefined, bd = Infinity;
  for (const w of l.walls ?? []) {
    const r = wallPieceRect(w);
    if (cx < r.x || cy < r.y || cx >= r.x + r.w || cy >= r.y + r.h) continue;
    const d = Math.abs(r.x + r.w / 2 - cx - 0.5) + Math.abs(r.y + r.h / 2 - cy - 0.5);
    if (d < bd) { bd = d; best = w; }
  }
  return best;
}
