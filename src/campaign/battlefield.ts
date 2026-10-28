/** Scenario geometry assembled by Defend's city generator, on Defend's cell grid. */
import { ambushLevel, trackFor, squareAt } from "./levels.ts";
import { generateCity, CellType, type CityMap, type Building } from "../defend/citygen.ts";
import { CELL_COUNT, CELLS_W, CELLS_H, cellIndex, rectCells, type Rect } from "../defend/grid.ts";
import { STRUCTURES, type StructureKind } from "../defend/catalog.ts";
import { fitLayout, type FittedStructure } from "../defend/layout.ts";
import { type Point } from "./plans.ts";
import type { CastleSnapshot } from "./castles.ts";
const fitted = (uid: number, kind: StructureKind, rect: Rect): FittedStructure => ({
  uid,
  kind,
  rect,
  tx: Math.floor(rect.x / 8),
  ty: Math.floor(rect.y / 8),
  inside: true,
});
const centered = (p: Point, w: number, h: number): Rect => ({
  x: Math.max(0, Math.min(CELLS_W - w, Math.round(p.x - w / 2))),
  y: Math.max(1, Math.min(CELLS_H - h, Math.round(p.y - h / 2))),
  w,
  h,
});
export function footprint(kind: StructureKind, p: Point) {
  const d = STRUCTURES[kind];
  return centered(p, d.w, d.h);
}
function erase(map: CityMap, b: Building) {
  b.hidden = true;
  for (const c of b.cells)
    if (map.owner[c] === b.id) {
      map.owner[c] = -1;
      map.type[c] = CellType.PARK;
    }
}
export function ambushField(level: number) {
  const data = ambushLevel(level),
    track = trackFor(data),
    lanes = track.lanes,
    path = lanes[0];
  const keep = footprint("keep", track.keep),
    structures = [fitted(0, "keep", keep)];
  const city = new Uint8Array(CELL_COUNT),
    wall = new Uint8Array(CELL_COUNT),
    road = new Set<number>(),
    water = new Set<number>(),
    bridges = new Map<number, number>(),
    outpostRects = track.outposts.map((p) => squareAt(p, 16)),
    castle = squareAt(track.keep, 20);
  for (const s of structures) for (const c of rectCells(s.rect)) city[c] = 1;
  for (const lane of lanes)
    for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1],
        b = lane[i],
        n = Math.max(1, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      for (let t = 0; t <= n; t++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = Math.round(a.x + ((b.x - a.x) * t) / n) + dx,
              y = Math.round(a.y + ((b.y - a.y) * t) / n) + dy;
            if (x >= 0 && x < CELLS_W && y >= 0 && y < CELLS_H) {
              const c = cellIndex(x, y);
              road.add(c);
              city[c] = 1;
            }
          }
    }
  // The river: water where no road crosses, a bridge where one does, its deck reaching a cell onto each bank.
  if (track.river)
    for (let x = 0; x < CELLS_W; x++)
      for (let y = track.river.top[x] - 1; y <= track.river.top[x] + track.river.depth[x]; y++) {
        const c = cellIndex(x, y),
          wet = y >= track.river.top[x] && y < track.river.top[x] + track.river.depth[x];
        if (road.has(c)) bridges.set(c, wet ? 2 : Math.max(1, bridges.get(c) ?? 0));
        else if (wet) {
          water.add(c);
          city[c] = 0;
        }
      }
  // Square the deck off across the road, however the banks wander under it.
  for (const [c, kind] of [...bridges])
    for (const dx of [-2, -1, 1, 2]) {
      const x = (c % CELLS_W) + dx,
        n = c + dx;
      if (x >= 0 && x < CELLS_W && road.has(n) && !bridges.has(n)) bridges.set(n, kind === 2 && water.has(n + CELLS_W) ? 2 : 1);
    }
  for (const [rect, thickness] of [...outpostRects.map((r) => [r, 1] as const), [castle, 2] as const]) {
    for (const c of rectCells(rect)) {
      const x = c % CELLS_W,
        y = Math.floor(c / CELLS_W),
        edge = x < rect.x + thickness || x >= rect.x + rect.w - thickness || y < rect.y + thickness || y >= rect.y + rect.h - thickness;
      city[c] = edge ? 0 : 1;
      wall[c] = edge ? 1 : 0;
    }
  }
  for (const c of rectCells(keep)) road.delete(c);
  const map = generateCity({ structures, city, wall }, data.seed);
  const blockedBuildings = new Set(
    [...road]
      .filter((c) => !wall[c])
      .map((c) => map.owner[c])
      .filter((id) => id >= 0),
  );
  for (const id of blockedBuildings) if (id !== 0) erase(map, map.buildings[id]);
  for (const c of road)
    if (!wall[c]) {
      map.type[c] = CellType.ROAD;
      map.owner[c] = -1;
      map.city[c] = 1;
    }
  for (const c of water) {
    map.type[c] = CellType.WATER;
    map.owner[c] = -1;
  }
  if (bridges.size) map.bridges = Uint8Array.from({ length: CELL_COUNT }, (_, c) => bridges.get(c) ?? 0);
  if (track.river) map.river = track.river;
  const outposts = outpostRects.map((rect) => {
    for (const b of map.buildings)
      if (b.kind === "wall" && b.rect.x >= rect.x && b.rect.x < rect.x + rect.w && b.rect.y >= rect.y && b.rect.y < rect.y + rect.h) {
        const { x, y } = b.rect;
        b.fence = y === rect.y || y === rect.y + rect.h - 1 ? { x1: x, y1: y + 0.5, x2: x + 1, y2: y + 0.5 } : { x1: x + 0.5, y1: y, x2: x + 0.5, y2: y + 1 };
      }
    const houses = map.buildings
      .filter(
        (b) =>
          b.kind === "house" &&
          !b.hidden &&
          b.rect.x >= rect.x &&
          b.rect.x + b.rect.w <= rect.x + rect.w &&
          b.rect.y >= rect.y &&
          b.rect.y + b.rect.h <= rect.y + rect.h,
      )
      .map((b) => b.id);
    return { rect, houses };
  });
  return { map, path, lanes, road, name: data.name, level: data, track, castle, outposts };
}

export type MusterCopy = { kind: StructureKind; uid: number; path?: string; rank?: number };
export function siegeField(castle: CastleSnapshot, copies: MusterCopy[]) {
  const fit = fitLayout(castle.castle.layout);
  if (!fit.ok) throw Error("Invalid native castle: " + fit.reason);
  const structures = [...fit.structures];
  // Real footprints; additional rows use the open lower half of the native board.
  let row = 100,
    x = 2,
    rowDepth = 0;
  const pads: Point[] = [],
    placed: MusterCopy[] = [],
    previous = new Map<StructureKind, Rect>();
  for (const copy of copies) {
    const d = STRUCTURES[copy.kind];
    if (x + d.w > CELLS_W - 2) {
      x = 2;
      row -= rowDepth + 2;
      rowDepth = 0;
    }
    const packed = row - d.h < 58;
    const rect = packed ? (previous.get(copy.kind) ?? { x: 2, y: 58, w: d.w, h: d.h }) : { x, y: row - d.h, w: d.w, h: d.h };
    previous.set(copy.kind, rect);
    structures.push(fitted(copy.uid, copy.kind, rect));
    pads.push({ x: rect.x + d.w / 2, y: rect.y + d.h / 2 });
    placed.push(copy);
    x += d.w + 2;
    rowDepth = Math.max(rowDepth, d.h);
  }
  // Center each actual-footprint muster row under the castle.
  const rows = new Map<number, Set<Rect>>();
  for (const s of structures.filter((s) => s.uid >= 100000)) {
    const bottom = s.rect.y + s.rect.h;
    let list = rows.get(bottom);
    if (!list) rows.set(bottom, (list = new Set()));
    list.add(s.rect);
  }
  for (const list of rows.values()) {
    const all = [...list],
      left = Math.min(...all.map((r) => r.x)),
      right = Math.max(...all.map((r) => r.x + r.w)),
      shift = Math.floor((CELLS_W - (right - left)) / 2) - left;
    for (const r of all) r.x += shift;
  }
  for (let i = 0; i < placed.length; i++) {
    const r = structures.find((s) => s.uid === placed[i].uid)!.rect;
    pads[i] = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  // An invisible attacker objective gives the native sim its own keep reference.
  structures.push(fitted(200000, "keep", { x: 34, y: 100, w: 4, h: 4 }));
  const map = generateCity({ ...fit, structures }, castle.seed);
  const attackerIds = new Set(map.buildings.filter((b) => b.structureUid !== undefined && copies.some((c) => c.uid === b.structureUid)).map((b) => b.id));
  const attackerKeep = map.buildings.find((b) => b.structureUid === 200000)!.id;
  map.buildings[attackerKeep].hidden = true;
  const defenderIds = new Set(map.buildings.filter((b) => !attackerIds.has(b.id) && b.id !== attackerKeep).map((b) => b.id));
  return { map, pads, attackerIds, defenderIds, attackerKeep, defenderKeep: 0 };
}
