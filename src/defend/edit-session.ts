/** One drag on the DEFEND board, from lift to drop, as a pure transaction
 * over the layout it started from: what a press lifts, the tiles that take
 * the carried item and the layout each makes, what the board shows while it
 * is held, and what releasing it does. The page only feeds it pointer
 * positions in cells and applies the result. */
import { BOMB_RADIUS } from "./catalog.ts";
import { dist } from "../exact.ts";
import { RALLY_REACH } from "./war-banner.ts";
import { NECRO } from "./necromancy.ts";
import { METEOR } from "./meteor.ts";
import type { CityMap } from "./citygen.ts";
import { carriesCorner, carriesGate, dragSpan, dropGhost, legalLayouts, liftsCityTile, nearestCorner, nearestEdge, refusal, wallSpotRect, type Drag } from "./drag-rules.ts";
import type { Overlay } from "./edit-overlay.ts";
import { CELLS_W, SUB, tileKey } from "./grid.ts";
import { removeBallista, removeCityTile, removeGate, removeSpikes, removeStructure, type Layout } from "./layout.ts";

/** Where a drag's pointer is: its board position in cells, and whether it is
 * over the board or the palette. */
export type DragAt = { cellX: number; cellY: number; overBoard: boolean; overPalette: boolean };

/** What releasing a drag does: a bomb goes off at a point on the board (or
 * nowhere, off it); the war banner is planted at a point (or nowhere, off
 * it), and a planted one pressed and let go where it stands was tapped; and
 * a city element leaves the next layout, unchanged where it can't go, with
 * a message saying why. */
export type Drop =
  | { kind: "bomb"; at: { x: number; y: number } | null }
  | { kind: "banner"; at: { x: number; y: number } | null; tap: boolean }
  | { kind: "spell"; spell: "necromancy" | "meteor"; at: { x: number; y: number } | null }
  | { kind: "build"; layout: Layout; message: string | null; tap?: true };

/** How far (in cells) a press on the planted banner, or anything lifted
 * off the board, may wander and still count as a tap. */
const TAP = 0.75;
/** How near (in cells) a carried gate, spikes or ballista snaps to a spot
 * that takes it. */
const SNAP = 3.5;

export class EditSession {
  /** The layouts dropping the item could make, keyed by tile. */
  readonly legal: Map<string, Layout>;
  /** Tiles across the block the item takes: 2 for a structure spanning a
   * 2 × 2 block of tiles, which is carried by its middle. */
  readonly span: number;
  private at: DragAt | null = null;
  /** Where the pointer first was, telling a tap from a drag. */
  private start: DragAt | null = null;

  constructor(readonly drag: Drag, private layout: Layout, private bannerRadius = RALLY_REACH) {
    this.legal = drag.from === "bomb" || drag.from === "banner" || drag.from === "necromancy" || drag.from === "meteor" ? new Map() : legalLayouts(drag, layout);
    this.span = dragSpan(drag, layout);
  }

  /** The session for whatever a press on cell (cx, cy) of `map`, built from
   * `layout`, lifts: the keep, a structure, or an empty city tile whose
   * removal leaves the city whole. Null when the press should move the view. */
  static lift(map: CityMap, layout: Layout, cx: number, cy: number): EditSession | null {
    const owner = map.owner[cy * CELLS_W + cx];
    const b = owner >= 0 ? map.buildings[owner] : null;
    if (b?.kind === "keep") return new EditSession({ from: "keep" }, layout);
    if (b?.kind === "gate" && b.gate) return new EditSession({ from: "gate", gate: b.gate }, layout);
    if (b?.kind === "wallBallista" && b.corner) return new EditSession({ from: "ballista", corner: { vx: b.corner.vx, vy: b.corner.vy } }, layout);
    const cell = cy * CELLS_W + cx;
    const row = b?.kind === "wall" ? map.spikes?.find((r) => r.cells.includes(cell)) : undefined;
    if (row) return new EditSession({ from: "spikes", spikes: { tx: row.tx, ty: row.ty, side: row.side } }, layout);
    const s = b?.structureUid ? layout.structures.find((p) => p.uid === b.structureUid) : undefined;
    if (s) return new EditSession({ from: "structure", uid: s.uid, kind: s.kind }, layout);
    const tile = { tx: Math.floor(cx / SUB), ty: Math.floor(cy / SUB) };
    return liftsCityTile(layout, tile) ? new EditSession({ from: "cityTile", tile }, layout) : null;
  }

  /** The pointer moved to `at`. */
  hover(at: DragAt) {
    this.at = at;
    this.start ??= at;
  }

  /** The board tile under the pointer, if it is over the board; for an item
   * spanning a block of tiles, the top left tile of the block centred
   * nearest the pointer. */
  get tile(): string | null {
    const at = this.at;
    if (!at?.overBoard) return null;
    if (carriesGate(this.drag)) return this.edge(at);
    const half = (this.span - 1) / 2;
    return tileKey(Math.floor(at.cellX / SUB - half), Math.floor(at.cellY / SUB - half));
  }

  /** For a piece of the wall: the tile edge (or, for a ballista, corner)
   * nearest the pointer, or failing that one that takes it within reach. */
  private edge(at: DragAt): string {
    const near = carriesCorner(this.drag) ? nearestCorner(at.cellX, at.cellY) : nearestEdge(this.layout, at.cellX, at.cellY);
    if (this.legal.has(near)) return near;
    let best = near, bd = SNAP;
    for (const key of this.legal.keys()) {
      const r = wallSpotRect(this.drag, this.legal.get(key)!, key);
      const d = dist(r.x + r.w / 2 - at.cellX, r.y + r.h / 2 - at.cellY);
      if (d < bd) {
        bd = d;
        best = key;
      }
    }
    return best;
  }

  /** What the board shows while the item is held: for a bomb its reach while
   * over the board; else the tiles that take it, the hovered one, and the
   * outline it would make there. Nothing before the pointer first moves. */
  overlay(): Overlay | null {
    const at = this.at;
    if (!at) return null;
    if (this.drag.from === "bomb")
      return at.overBoard ? { legal: new Set(), hover: null, ghost: null, bomb: { x: at.cellX, y: at.cellY, r: BOMB_RADIUS } } : null;
    if (this.drag.from === "banner")
      return at.overBoard ? { legal: new Set(), hover: null, ghost: null, banner: { x: at.cellX, y: at.cellY, r: this.bannerRadius } } : null;
    if (this.drag.from === "necromancy")
      return at.overBoard ? { legal: new Set(), hover: null, ghost: null, spell: { x: at.cellX, y: at.cellY, r: NECRO.radius } } : null;
    // The page sets the meteor's reach, which its research changes.
    if (this.drag.from === "meteor")
      return at.overBoard ? { legal: new Set(), hover: null, ghost: null, spell: { x: at.cellX, y: at.cellY, r: METEOR.radius, look: "meteor" } } : null;
    const hover = this.tile;
    const next = hover ? this.legal.get(hover) : undefined;
    if (carriesGate(this.drag))
      return {
        legal: new Set(),
        hover: null,
        ghost: next ? dropGhost(this.drag, next, hover!) : null,
        gates: {
          legal: [...this.legal].map(([k, l]) => wallSpotRect(this.drag, l, k)),
          hover: hover ? this.spotRect(hover) : null,
          fits: !!next,
        },
      };
    return { legal: new Set(this.legal.keys()), hover, ghost: next ? dropGhost(this.drag, next, hover!) : null, ...(this.span > 1 ? { span: this.span } : {}) };
  }

  /** The cells the carried piece of wall would take at `key`, or null for
   * a corner where the wall doesn't turn. */
  private spotRect(key: string) {
    const l = this.legal.get(key);
    if (l) return wallSpotRect(this.drag, l, key);
    if (!carriesCorner(this.drag)) return wallSpotRect(this.drag, this.layout, key);
    const [vx, vy] = key.split(",").map(Number);
    return { x: vx * SUB - 1, y: vy * SUB - 1, w: 2, h: 2 };
  }

  /** Releasing the item at `at`: a city element takes the legal tile under
   * it, goes back to the palette when released off the board or over the
   * palette, and otherwise stays put and says why the tile refused it. */
  release(at: DragAt): Drop {
    const pressed = this.start;
    this.hover(at);
    const d = this.drag, layout = this.layout;
    if (d.from === "bomb") return { kind: "bomb", at: at.overBoard ? { x: at.cellX, y: at.cellY } : null };
    if (d.from === "necromancy" || d.from === "meteor") return { kind: "spell", spell: d.from, at: at.overBoard ? { x: at.cellX, y: at.cellY } : null };
    if (d.from === "banner") {
      const s = this.start!;
      const tap = !!d.placed && dist(at.cellX - s.cellX, at.cellY - s.cellY) < TAP;
      return { kind: "banner", at: at.overBoard && !tap ? { x: at.cellX, y: at.cellY } : null, tap };
    }
    // Something on the board pressed and let go where it stood was tapped:
    // it stays as it is (dropping it there would reshuffle its tile).
    if (pressed && d.from !== "palette" && at.overBoard && !at.overPalette && dist(at.cellX - pressed.cellX, at.cellY - pressed.cellY) < TAP)
      return { kind: "build", layout, message: null, tap: true };
    const hover = this.tile;
    const target = hover ? this.legal.get(hover) : undefined;
    if (target) return { kind: "build", layout: target, message: null };
    if (!at.overBoard || at.overPalette) {
      if (d.from === "structure") return { kind: "build", layout: removeStructure(layout, d.uid), message: null };
      if (d.from === "cityTile") return { kind: "build", layout: removeCityTile(layout, d.tile.tx, d.tile.ty)?.layout ?? layout, message: null };
      if (d.from === "gate") return { kind: "build", layout: removeGate(layout, d.gate), message: null };
      if (d.from === "spikes") return { kind: "build", layout: removeSpikes(layout, d.spikes), message: null };
      if (d.from === "ballista") return { kind: "build", layout: removeBallista(layout, d.corner), message: null };
      return { kind: "build", layout, message: d.from === "keep" ? "The keep can be moved, but never removed." : null };
    }
    return { kind: "build", layout, message: refusal(d, layout, hover!) };
  }
}
