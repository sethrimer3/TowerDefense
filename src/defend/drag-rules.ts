/** What carrying a city element can do on the DEFEND board, as pure
 * functions of the layout: the layout it makes on each tile, the outline it
 * shows there, why a tile refuses it, and which city tiles can be lifted. */
import { STRUCTURES, type PaletteItem } from "./catalog.ts";
import { SUB, TILES_H, TILES_W, tileInBounds, tileKey, type Rect, type TilePos } from "./grid.ts";
import {
  SIDES,
  across,
  ballistaRect,
  blockTiles,
  cornerKey,
  cornerOk,
  edgeWallRect,
  gateKey,
  gateOk,
  gateRect,
  moveBallista,
  moveGate,
  moveSpikes,
  placeBallista,
  placeGate,
  placeSpikes,
  cityTileSet,
  covers,
  fitLayout,
  moveCityTile,
  moveKeep,
  moveStructure,
  placeCityTile,
  placeStructure,
  removeCityTile,
  spanOf,
  type CornerSpot,
  type GateSpot,
  type Layout,
  type PlacedKind,
  type Side,
} from "./layout.ts";
import type { Overlay } from "./edit-overlay.ts";
import type { IconItem } from "./structure-art.ts";

export type Drag =
  | { from: "palette"; item: PaletteItem }
  | { from: "structure"; uid: number; kind: PlacedKind }
  | { from: "cityTile"; tile: TilePos }
  | { from: "keep" }
  /** A city gate already set in the wall. */
  | { from: "gate"; gate: GateSpot }
  /** Wall spikes already along the wall. */
  | { from: "spikes"; spikes: GateSpot }
  /** A wall ballista already on a corner of the wall. */
  | { from: "ballista"; corner: CornerSpot }
  | { from: "bomb" }
  /** The war banner, from the palette or (`placed`) where it stands. */
  | { from: "banner"; placed?: boolean }
  /** A strike spell, cast where it is let go. */
  | { from: "necromancy" };

/** Consumables are dropped at a point, not built on a tile. */
export const consumable = (kind: IconItem): kind is "bomb" | "banner" | "necromancy" => kind === "bomb" || kind === "banner" || kind === "necromancy";

/** The icon of what `drag` carries. */
export function dragIcon(drag: Drag): IconItem {
  if (drag.from === "palette") return drag.item;
  if (drag.from === "structure") return drag.kind;
  if (drag.from === "gate") return "cityGate";
  if (drag.from === "spikes") return "wallSpikes";
  if (drag.from === "ballista") return "wallBallista";
  return drag.from;
}

/** Whether `drag` carries something set into the wall: a city gate or
 * spikes, on a tile's edge, or a ballista, on a corner of the wall. */
export const carriesGate = (drag: Drag) => carriesEdge(drag) || carriesCorner(drag);
/** Whether `drag` carries a city gate or spikes, which go on a tile's edge. */
export const carriesEdge = (drag: Drag) => dragIcon(drag) === "cityGate" || dragIcon(drag) === "wallSpikes";
/** Whether `drag` carries a wall ballista, which goes on a wall corner. */
export const carriesCorner = (drag: Drag) => dragIcon(drag) === "wallBallista";

/** The corner a key ("vx,vy") names. */
export function parseCornerKey(key: string): CornerSpot {
  const [vx, vy] = key.split(",").map(Number);
  return { vx, vy };
}

/** The cells a wall piece carried by `drag` takes at spot `key` in
 * `layout`: a gate's, the stretch of wall spikes line, or a bastion. */
export function wallSpotRect(drag: Drag, layout: Layout, key: string): Rect {
  if (carriesCorner(drag)) return ballistaRect(cityTileSet(layout), parseCornerKey(key));
  return dragIcon(drag) === "wallSpikes" ? edgeWallRect(parseGateKey(key)) : gateRect(parseGateKey(key));
}

/** The gate spot a key ("tx,ty,side") names. */
export function parseGateKey(key: string): GateSpot {
  const [tx, ty, side] = key.split(",");
  return { tx: Number(tx), ty: Number(ty), side: side as Side };
}

/** How many tiles across the block `drag` takes in `layout`: 2 for a
 * structure spanning a 2 × 2 block, else 1. */
export function dragSpan(drag: Drag, layout: Layout) {
  const kind = dragIcon(drag);
  return kind === "cityTile" || kind === "cityGate" || kind === "wallSpikes" || kind === "wallBallista" || kind === "keep" || consumable(kind) ? 1 : spanOf(layout, kind);
}

/** Every layout dropping `drag` could make, keyed by the tile it lands on
 * (the top left tile of the block it would take). */
export function legalLayouts(drag: Drag, layout: Layout): Map<string, Layout> {
  const out = new Map<string, Layout>();
  if (carriesCorner(drag)) {
    for (let vy = 1; vy < TILES_H; vy++)
      for (let vx = 1; vx < TILES_W; vx++) {
        const v = { vx, vy };
        const next = drag.from === "ballista" ? moveBallista(layout, drag.corner, v) : placeBallista(layout, v);
        if (next) out.set(cornerKey(v), next);
      }
    return out;
  }
  if (carriesEdge(drag)) {
    const spikes = dragIcon(drag) === "wallSpikes";
    for (let ty = 0; ty < TILES_H; ty++)
      for (let tx = 0; tx < TILES_W; tx++)
        for (const side of SIDES) {
          const g = { tx, ty, side };
          const next =
            drag.from === "gate" ? moveGate(layout, drag.gate, g)
            : drag.from === "spikes" ? moveSpikes(layout, drag.spikes, g)
            : spikes ? placeSpikes(layout, g)
            : placeGate(layout, g);
          if (next) out.set(gateKey(g), next);
        }
    return out;
  }
  for (let ty = 0; ty < TILES_H; ty++)
    for (let tx = 0; tx < TILES_W; tx++) {
      const next = layoutAfter(drag, layout, tx, ty);
      if (next) out.set(tileKey(tx, ty), next);
    }
  return out;
}

/** The layout after dropping `drag` on tile (tx, ty), or null where it can't
 * go. Dropping a city tile or the keep back where it was keeps the layout. */
function layoutAfter(drag: Drag, layout: Layout, tx: number, ty: number): Layout | null {
  switch (drag.from) {
    case "palette":
      if (drag.item === "cityGate" || drag.item === "wallSpikes" || drag.item === "wallBallista") return null;
      return drag.item === "cityTile" ? placeCityTile(layout, tx, ty) : placeStructure(layout, drag.item, tx, ty);
    case "structure":
      return moveStructure(layout, drag.uid, tx, ty);
    case "cityTile":
      return isTile(drag.tile, tx, ty) ? layout : moveCityTile(layout, drag.tile, { tx, ty });
    case "keep":
      return isTile(layout.keep, tx, ty) ? layout : moveKeep(layout, tx, ty);
    default:
      return null;
  }
}

const isTile = (t: TilePos, tx: number, ty: number) => t.tx === tx && t.ty === ty;

/** The outline shown where `drag` would land, in `next`, the layout it makes
 * on tile `key`: the tile itself for a city tile, else the fitted structure. */
export function dropGhost(drag: Drag, next: Layout, key: string): Overlay["ghost"] {
  if (carriesGate(drag)) return { rect: wallSpotRect(drag, next, key), kind: dragIcon(drag) as "cityGate" | "wallSpikes" | "wallBallista" };
  const [tx, ty] = key.split(",").map(Number);
  if (dragIcon(drag) === "cityTile") return { rect: { x: tx * SUB, y: ty * SUB, w: SUB, h: SUB }, kind: "cityTile" };
  const fit = fitLayout(next);
  if (!fit.ok) return null;
  const uid = drag.from === "structure" ? drag.uid : drag.from === "keep" ? 0 : next.nextUid - 1;
  const f = fit.structures.find((s) => s.uid === uid);
  return f ? { rect: f.rect as Rect, kind: f.kind } : null;
}

/** Why tile `key` of `layout` refuses `drag`. */
export function refusal(drag: Drag, layout: Layout, key: string): string {
  const kind = dragIcon(drag);
  if (kind === "cityGate") {
    const g = parseGateKey(key);
    if (layout.gates.some((o) => gateKey(o) === key)) return "There's already a gate there.";
    if (gateOk(cityTileSet(layout), g)) return "There isn't room for a gate there.";
    return "A city gate goes in the city wall, on the edge of a city tile.";
  }
  if (kind === "wallSpikes") {
    const g = parseGateKey(key);
    if (layout.spikes.some((o) => gateKey(o) === key)) return "There are already spikes there.";
    if (layout.gates.some((o) => gateKey(o) === key)) return "Spikes can't line the wall across a gate.";
    if (gateOk(cityTileSet(layout), g)) return "There isn't room for spikes there.";
    return "Wall spikes go along the city wall, on the edge of a city tile.";
  }
  if (kind === "wallBallista") {
    const v = parseCornerKey(key);
    if (layout.ballistas.some((o) => cornerKey(o) === key)) return "There's already a ballista on that corner.";
    if (cornerOk(cityTileSet(layout), v)) return "There isn't room for a ballista there.";
    return "A wall ballista goes on a corner of the city wall, where it turns at a right angle.";
  }
  const ty = Number(key.split(",")[1]);
  if (ty === 0) return "Nothing can be built on the top row — that's where the enemy gathers.";
  const inCity = cityTileSet(layout).has(key);
  if (kind === "cityTile")
    return inCity && drag.from === "palette" ? "That tile is already part of the city." : layout.outskirts ? "There isn't room for a city tile there." : "City tiles must touch the city along an edge.";
  if (kind === "keep") return "The keep can only move onto another city tile.";
  if (!consumable(kind) && dragSpan(drag, layout) > 1) {
    const [tx] = key.split(",").map(Number);
    const block = blockTiles(tx, ty, 2);
    const name = STRUCTURES[kind].name.toLowerCase();
    if (tx + 1 >= TILES_W || ty + 1 >= TILES_H) return `The ${name} needs a 2 × 2 block of tiles there.`;
    if (!needsCity(kind, false) || block.every((k) => cityTileSet(layout).has(k)))
      return `The ${name} needs a 2 × 2 block of tiles with nothing else on them.`;
    return `The ${name} needs a 2 × 2 block of city tiles.`;
  }
  if (!consumable(kind) && needsCity(kind, inCity)) return `The ${STRUCTURES[kind].name.toLowerCase()} must go inside the city limits.`;
  return "There isn't room for that there.";
}

function needsCity(kind: PlacedKind, inCity: boolean) {
  return !inCity && !STRUCTURES[kind].outsideOk;
}

/** The edge a gate carried to (x, y) (in cells) would go on, keyed by its
 * city tile and side: the nearest side of the tile under the pointer, told
 * from the city tile's side of it when that is the one in the city. */
export function nearestEdge(layout: Layout, x: number, y: number): string {
  const tx = Math.floor(x / SUB), ty = Math.floor(y / SUB);
  const fx = x / SUB - tx, fy = y / SUB - ty;
  const near: [Side, number][] = [["n", fy], ["s", 1 - fy], ["w", fx], ["e", 1 - fx]];
  const side = near.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  const g: GateSpot = { tx, ty, side };
  const tiles = cityTileSet(layout);
  if (tiles.has(tileKey(tx, ty))) return gateKey(g);
  const o = across(g);
  const back: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };
  return tileInBounds(o.tx, o.ty) && tiles.has(tileKey(o.tx, o.ty)) ? gateKey({ ...o, side: back[side] }) : gateKey(g);
}

/** The tile corner nearest (x, y) (in cells), keyed "vx,vy". */
export function nearestCorner(x: number, y: number): string {
  return cornerKey({ vx: Math.round(x / SUB), vy: Math.round(y / SUB) });
}

/** Whether pressing city tile `tile` lifts it: only an empty tile whose
 * removal leaves the city whole does, and any other press pans the view. */
export function liftsCityTile(layout: Layout, tile: TilePos) {
  if (!layout.cityTiles.includes(tileKey(tile.tx, tile.ty))) return false;
  if (layout.structures.some((s) => covers(layout, s, tile.tx, tile.ty))) return false;
  return !!removeCityTile(layout, tile.tx, tile.ty);
}
