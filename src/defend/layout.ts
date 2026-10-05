/** The player-authored city layout (which tiles are city, where the keep is,
 * which tile each defensive structure was dropped on) plus the rules that
 * decide what is legal. The exact cell position of each structure is never
 * stored — `fitLayout` derives it deterministically, so the same layout
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
import { BALLISTA, GATE, STRUCTURES, TILE_ROOM, footprint, type StructureKind, type TileSpan } from "./catalog.ts";

export type PlacedKind = Exclude<StructureKind, "keep">;
/** `spot` seeds where on its tile the structure stands; it is drawn afresh
 * for everything on a tile whenever something is dropped there. A structure
 * spanning a block of tiles (`span`) stands on (tx, ty), its block's top
 * left tile. */
export type PlacedStructure = { uid: number; kind: PlacedKind; tx: number; ty: number; spot: number };

/** A side of a tile. */
export type Side = "n" | "e" | "s" | "w";
export const SIDES: readonly Side[] = ["n", "e", "s", "w"];
const SIDE_STEP: Record<Side, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
/** A city gate: set in the wall on `side` of city tile (tx, ty). Wall
 * spikes stand on the same kind of spot. */
export type GateSpot = { tx: number; ty: number; side: Side };
/** A corner of the city wall: the tile corner (vx, vy), between the four
 * tiles around it, where the wall turns through a right angle. */
export type CornerSpot = { vx: number; vy: number };

export type Layout = {
  keep: TilePos;
  /** City tiles other than the keep's own tile (the keep always counts as one). */
  cityTiles: string[];
  structures: PlacedStructure[];
  nextUid: number;
  /** Drops so far: each draws fresh spots for the tile it lands on. */
  rolls: number;
  /** Kinds whose building-specific upgrade makes them smaller (from the
   * Armory's levels, not saved on its own). */
  compact: PlacedKind[];
  /** City gates, each in the wall along one edge of a city tile. */
  gates: GateSpot[];
  /** Wall spikes, each along the wall on one edge of a city tile. */
  spikes: GateSpot[];
  /** Wall ballistas, each on a corner of the wall. */
  ballistas: CornerSpot[];
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
  | { ok: true; structures: FittedStructure[]; city: Uint8Array; wall: Uint8Array; gates?: FittedGate[]; spikes?: FittedSpikes[]; ballistas?: FittedBallista[] }
  | { ok: false; reason: string };

const KEEP_UID = 0;

export function defaultLayout(): Layout {
  return {
    keep: { tx: Math.floor(TILES_W / 2), ty: TILES_H - 4 },
    cityTiles: [],
    structures: [],
    nextUid: 1,
    rolls: 0,
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
    rolls: l.rolls,
    compact: [...l.compact],
    gates: l.gates.map((g) => ({ ...g })),
    spikes: l.spikes.map((g) => ({ ...g })),
    ballistas: l.ballistas.map((v) => ({ ...v })),
  };
}

export function cityTileSet(l: Layout): Set<string> {
  return new Set([tileKey(l.keep.tx, l.keep.ty), ...l.cityTiles]);
}

/** Whether a set of tiles is one orthogonally-connected blob containing `root`. */
export function tilesConnected(tiles: Set<string>, root: TilePos): boolean {
  if (!tiles.has(tileKey(root.tx, root.ty))) return false;
  const seen = new Set([tileKey(root.tx, root.ty)]);
  const stack = [root];
  while (stack.length) {
    const { tx, ty } = stack.pop()!;
    for (const [dx, dy] of ORTHO) {
      const k = tileKey(tx + dx, ty + dy);
      if (tiles.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push({ tx: tx + dx, ty: ty + dy });
      }
    }
  }
  return seen.size === tiles.size;
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

/** The cells fitting has to work with, and what it has claimed so far. */
type FitSpace = {
  city: Uint8Array;
  wall: Uint8Array;
  /** How many footprints, each with a one-cell ring around it, cover each
   * cell, so structures never touch and there is always room for a street
   * between them. A count, so a tile's arrangement can be taken back. */
  blocked: Uint8Array;
  foot: Uint8Array;
};

/** A structure to fit onto its tile (its block of `span` × `span` tiles). */
type Placement = { uid: number; kind: StructureKind; tx: number; ty: number; inside: boolean; spot: number; w: number; h: number; size: number; span: TileSpan };

/** Tries per tile, each a fresh random arrangement, before it is full. */
const TRIES = 24;
/** Fresh arrangements of the whole city tried when one leaves an in-city
 * structure cut off from the streets. */
const PASSES = 6;

/** Work out the exact cell rectangle of every structure. The keep stands in
 * the middle of its tile; every other structure takes a random free spot on
 * its tile (drawn from its `spot`), and the structures sharing a tile are
 * fitted together, biggest first, rearranged until they all fit. Tiles go
 * in order of their oldest structure. Fails if a tile's structures take
 * more than its room or can't all fit, or if an in-city structure would be
 * cut off from the keep's streets. */
export function fitLayout(l: Layout): Fit {
  const city = cityMask(l);
  const cityTiles = cityTileSet(l);
  const order = fitOrder(l, cityTiles);
  const spanned = spannedTiles(order);
  const crowded = [...spanned.values()].find((s) => s.size > TILE_ROOM);
  if (crowded) return { ok: false, reason: `That tile has no room left for the ${STRUCTURES[crowded.kind].name.toLowerCase()}.` };
  const gates = l.gates.filter((g) => gateOk(cityTiles, g)).map(fitGate);
  const spikes = l.spikes.filter((g) => gateOk(cityTiles, g)).map((g): FittedSpikes => ({ ...g, rect: spikesRect(g) }));
  const ballistas = l.ballistas.filter((v) => cornerOk(cityTiles, v)).map((v): FittedBallista => ({ ...v, rect: ballistaRect(cityTiles, v), out: cornerOutward(cityTiles, v) }));
  let failure = "";
  for (let pass = 0; pass < PASSES; pass++) {
    const space: FitSpace = { city, wall: wallMask(city), blocked: new Uint8Array(CELL_COUNT), foot: new Uint8Array(CELL_COUNT) };
    // The way in through each gate stays clear for its street.
    for (const g of gates) for (const i of rectCells(grow(g.inner, g.side))) if (space.city[i]) space.blocked[i]++;
    const fitted: FittedStructure[] = [];
    for (const group of order) {
      const f = fitTile(group, space, pass * TRIES, spanned.get(tileKey(group[0].tx, group[0].ty)));
      if (typeof f === "string") return { ok: false, reason: f };
      fitted.push(...f);
    }
    const cut = cutOff(fitted, space);
    if (!cut)
      return {
        ok: true,
        structures: fitted,
        city,
        wall: space.wall,
        ...(gates.length ? { gates } : {}),
        ...(spikes.length ? { spikes } : {}),
        ...(ballistas.length ? { ballistas } : {}),
      };
    failure ||= `The ${STRUCTURES[cut.kind].name.toLowerCase()} would be cut off from the streets.`;
  }
  return { ok: false, reason: failure };
}

/** The keep's tile, then every other tile with structures on it in order of
 * its oldest one, each tile's structures biggest first. */
function fitOrder(l: Layout, cityTiles: Set<string>): Placement[][] {
  const compact = new Set(l.compact);
  const place = (s: { uid: number; kind: StructureKind; tx: number; ty: number; spot: number }): Placement => {
    const f = footprint(s.kind, compact.has(s.kind as PlacedKind));
    return { ...s, ...f, inside: blockTiles(s.tx, s.ty, f.span).every((k) => cityTiles.has(k)) };
  };
  const keep = place({ uid: KEEP_UID, kind: "keep", tx: l.keep.tx, ty: l.keep.ty, spot: 0 });
  const tiles = new Map<string, Placement[]>([[tileKey(keep.tx, keep.ty), [keep]]]);
  for (const s of [...l.structures].sort((a, b) => a.uid - b.uid)) {
    const k = tileKey(s.tx, s.ty);
    if (!tiles.has(k)) tiles.set(k, []);
    tiles.get(k)!.push(place(s));
  }
  return [...tiles.values()].map((g) => g.sort((a, b) => b.w * b.h - a.w * a.h || a.uid - b.uid));
}

/** The tile keys of the `span` × `span` block whose top left tile is
 * (tx, ty). */
export function blockTiles(tx: number, ty: number, span: TileSpan): string[] {
  const out: string[] = [];
  for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) out.push(tileKey(tx + dx, ty + dy));
  return out;
}

/** The room that structures spanning a block of tiles take on each tile of
 * it, keyed by tile, and the newest of them there. Empty unless something
 * spans more than one tile. */
function spannedTiles(order: Placement[][]): Map<string, { size: number; kind: StructureKind }> {
  const out = new Map<string, { size: number; kind: StructureKind }>();
  for (const group of order)
    for (const p of group) {
      if (p.span === 1) continue;
      for (const k of blockTiles(p.tx, p.ty, p.span).slice(1)) out.set(k, { size: (out.get(k)?.size ?? 0) + p.size, kind: p.kind });
    }
  return out;
}

/** Fits a tile's structures together, trying fresh arrangements until they
 * all fit, and claims their cells; or says why they can't. `spanned` is the
 * room a structure spanning from another tile takes on this one. */
function fitTile(group: Placement[], space: FitSpace, salt: number, spanned?: { size: number; kind: StructureKind }): FittedStructure[] | string {
  for (const p of group) {
    if (!tileInBounds(p.tx, p.ty) || p.ty === SPAWN_ROW) return "Nothing can be built on the spawn row.";
    if (!tileInBounds(p.tx + p.span - 1, p.ty + p.span - 1)) return `The ${STRUCTURES[p.kind].name.toLowerCase()} would hang off the board.`;
    const def = STRUCTURES[p.kind];
    if (!p.inside && !def.outsideOk) return `${def.name} must be inside the city limits.`;
  }
  if (group.reduce((n, p) => n + p.size, spanned?.size ?? 0) > TILE_ROOM) {
    const last = STRUCTURES[spanned?.kind ?? group[group.length - 1].kind];
    return `That tile has no room left for the ${last.name.toLowerCase()}.`;
  }
  let reason = "";
  for (let t = 0; t < TRIES; t++) {
    const fitted: FittedStructure[] = [];
    for (const p of group) {
      const rect = pickRect(p, space, salt + t);
      if (!rect) {
        reason ||= `No room for the ${STRUCTURES[p.kind].name.toLowerCase()} there.`;
        break;
      }
      claim(space, rect, 1);
      fitted.push({ uid: p.uid, kind: p.kind, tx: p.tx, ty: p.ty, rect, inside: p.inside });
    }
    if (fitted.length === group.length) return fitted;
    for (const f of fitted) claim(space, f.rect, -1);
    // The keep stands in one place, and a lone structure that can't fit
    // anywhere won't on another try.
    if (group.length === 1) break;
  }
  return reason;
}

/** Claims a footprint and its ring (`by` 1), or gives them back (-1). */
function claim(space: FitSpace, rect: Rect, by: 1 | -1) {
  for (const i of rectCells({ x: rect.x - 1, y: rect.y - 1, w: rect.w + 2, h: rect.h + 2 })) space.blocked[i] += by;
  for (const i of rectCells(rect)) space.foot[i] = by > 0 ? 1 : 0;
}

/** City cells beside a rect that no structure stands on. */
const openSides = (r: Rect, space: FitSpace) => sideCells(r).filter((i) => space.city[i] && !space.foot[i]);

/** The first in-city structure that can't reach the keep through open city
 * cells, if any. */
function cutOff(fitted: FittedStructure[], space: FitSpace): FittedStructure | undefined {
  const reach = new Uint8Array(CELL_COUNT);
  const stack = openSides(fitted[0].rect, space);
  for (const i of stack) reach[i] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    for (const n of openSides({ x: cellX(i), y: cellY(i), w: 1, h: 1 }, space))
      if (!reach[n]) {
        reach[n] = 1;
        stack.push(n);
      }
  }
  return fitted.find((f) => f.inside && f.uid !== KEEP_UID && !openSides(f.rect, space).some((i) => reach[i]));
}

/** The keep's place in the middle of its tile; for anything else a free
 * spot on its tile picked at random by its `spot` and the try. */
function pickRect(p: Placement, space: FitSpace, salt: number): Rect | null {
  if (p.kind === "keep") {
    const o = (SUB - p.w) >> 1;
    const r = { x: p.tx * SUB + o, y: p.ty * SUB + o, w: p.w, h: p.h };
    return rectUsable(r, space, p.inside) ? r : null;
  }
  // In the city, a structure needs at least one open side for a street.
  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const r of candidateRects(p)) {
    if (!rectUsable(r, space, p.inside)) continue;
    if (p.inside && !openSides(r, space).length) continue;
    const score = hash01(p.spot, salt, r.x, r.y, r.w);
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** Every position of both orientations of the structure on its tile (or
 * its block of tiles). */
function* candidateRects({ tx, ty, w, h, span }: Placement): Generator<Rect> {
  const shapes = w === h ? [[w, h]] : [[w, h], [h, w]];
  for (const [sw, sh] of shapes)
    for (let y = ty * SUB; y + sh <= (ty + span) * SUB; y++) for (let x = tx * SUB; x + sw <= (tx + span) * SUB; x++) yield { x, y, w: sw, h: sh };
}

/** Whether a structure may stand on every cell of `r`: unclaimed, not wall,
 * and on the right side of the city limits. */
function rectUsable(r: Rect, space: FitSpace, inside: boolean): boolean {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!usable(space, cellIndex(x, y), inside)) return false;
  return true;
}

const usable = (space: FitSpace, i: number, inside: boolean) => !space.blocked[i] && !space.wall[i] && !!space.city[i] === inside;

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

/** Drops the gates, spikes and ballistas whose wall moved away. */
function keepGates(l: Layout) {
  const tiles = cityTileSet(l);
  l.gates = l.gates.filter((g) => gateOk(tiles, g));
  l.spikes = l.spikes.filter((g) => gateOk(tiles, g));
  l.ballistas = l.ballistas.filter((v) => cornerOk(tiles, v));
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
export function placeSpikes(l: Layout, g: GateSpot): Layout | null {
  if (!gateOk(cityTileSet(l), g) || l.spikes.some((o) => sameGate(o, g)) || l.gates.some((o) => sameGate(o, g))) return null;
  const next = cloneLayout(l);
  next.spikes.push({ tx: g.tx, ty: g.ty, side: g.side });
  return fitLayout(next).ok ? next : null;
}

export function removeSpikes(l: Layout, g: GateSpot): Layout {
  const next = cloneLayout(l);
  next.spikes = next.spikes.filter((o) => !sameGate(o, g));
  return next;
}

export function moveSpikes(l: Layout, from: GateSpot, to: GateSpot): Layout | null {
  if (sameGate(from, to)) return l;
  return placeSpikes(removeSpikes(l, from), to);
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
  if (!ORTHO.some(([dx, dy]) => tiles.has(tileKey(tx + dx, ty + dy)))) return null;
  const next = cloneLayout(l);
  next.cityTiles.push(tileKey(tx, ty));
  // A gate facing the new tile no longer stands in the wall.
  keepGates(next);
  return fitLayout(next).ok ? next : null;
}

/** Remove a city tile. Structures on it go back to the palette; returns their
 * kinds alongside the new layout. */
export function removeCityTile(l: Layout, tx: number, ty: number): { layout: Layout; returned: PlacedKind[] } | null {
  const key = tileKey(tx, ty);
  if (!l.cityTiles.includes(key)) return null;
  const next = cloneLayout(l);
  next.cityTiles = next.cityTiles.filter((k) => k !== key);
  if (!tilesConnected(cityTileSet(next), next.keep)) return null;
  const on = (s: PlacedStructure) => covers(l, s, tx, ty);
  const returned = next.structures.filter(on).map((s) => s.kind);
  next.structures = next.structures.filter((s) => !on(s));
  keepGates(next);
  return fitLayout(next).ok ? { layout: next, returned } : null;
}

/** Move a city tile (and whatever stands on it stays behind as returned
 * items — callers only move empty tiles). */
export function moveCityTile(l: Layout, from: TilePos, to: TilePos): Layout | null {
  const removed = removeCityTile(l, from.tx, from.ty);
  if (!removed || removed.returned.length) return null;
  return placeCityTile(removed.layout, to.tx, to.ty);
}

/** How many tiles across `kind`'s block is in layout `l`. */
export const spanOf = (l: Layout, kind: PlacedKind): TileSpan => footprint(kind, l.compact.includes(kind)).span;

/** Whether structure `s` stands on tile (tx, ty), on its own tile or
 * anywhere in its block. */
export function covers(l: Layout, s: PlacedStructure, tx: number, ty: number) {
  const span = spanOf(l, s.kind);
  return tx >= s.tx && tx < s.tx + span && ty >= s.ty && ty < s.ty + span;
}

/** Place a new structure, which takes the next uid. */
export function placeStructure(l: Layout, kind: PlacedKind, tx: number, ty: number): Layout | null {
  const next = withStructure(l, { uid: l.nextUid, kind, tx, ty, spot: 0 });
  if (next) next.nextUid++;
  return next;
}

/** Drops `s` on its tile, shuffling everything there into fresh spots. */
function withStructure(l: Layout, s: PlacedStructure): Layout | null {
  const next = cloneLayout(l);
  next.structures.push(s);
  next.rolls++;
  for (const p of next.structures) if (p.tx === s.tx && p.ty === s.ty) p.spot = hash(next.rolls, p.uid, 0x5b07);
  return fitLayout(next).ok ? next : null;
}

export function removeStructure(l: Layout, uid: number): Layout {
  const next = cloneLayout(l);
  next.structures = next.structures.filter((s) => s.uid !== uid);
  return next;
}

/** Move an existing structure to another tile, keeping its uid (and so its
 * priority over newer structures). */
export function moveStructure(l: Layout, uid: number, tx: number, ty: number): Layout | null {
  const s = l.structures.find((p) => p.uid === uid);
  if (!s) return null;
  return withStructure(removeStructure(l, uid), { ...s, tx, ty });
}

/** The keep can move onto any other city tile; the two tiles swap roles. */
export function moveKeep(l: Layout, tx: number, ty: number): Layout | null {
  const key = tileKey(tx, ty);
  if (!l.cityTiles.includes(key)) return null;
  const next = cloneLayout(l);
  next.cityTiles = next.cityTiles.filter((k) => k !== key);
  next.cityTiles.push(tileKey(l.keep.tx, l.keep.ty));
  next.keep = { tx, ty };
  return fitLayout(next).ok ? next : null;
}

export function placedCount(l: Layout, kind: PlacedKind | "cityTile" | "cityGate" | "wallSpikes" | "wallBallista"): number {
  if (kind === "cityGate") return l.gates.length;
  if (kind === "wallSpikes") return l.spikes.length;
  if (kind === "wallBallista") return l.ballistas.length;
  return kind === "cityTile" ? l.cityTiles.length : l.structures.filter((s) => s.kind === kind).length;
}
