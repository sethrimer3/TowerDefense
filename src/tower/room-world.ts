import { TOWER_WIDTH, TOWER_HEIGHT } from "../config.ts";
import { point, type Tile, type Torch } from "../entities.ts";
import type { Board } from "../board.ts";
import { breakTorch, placeTorches } from "../torches.ts";
import { generateTowerFloor } from "./index.ts";

// v3 adds declarative multi-key/condition doors and places their prerequisite
// keys differently; old per-room coordinate mutations must not overlay it.
// v4 replaces the maze generator with strategic chamber layouts.
// v5 adds forks: parallel lanes of gates between chambers.
// v6 adds yellow-or-blue and blue-or-red door forks.
// v7 generates the same floors in every JavaScript engine.
// v8 trades a blue door for fewer yellow keys (mostly two).
// v9 prices a blue key at two yellow and a red at five.
// v10 puts a boss beside the stairs of every section's last floor.
// v11 softens weak enemies and grows enemy DEF 1% every five floors.
export const TOWER_LAYOUT_VERSION = 11;

/** A self-contained 17x17 Tower floor. Generation is strategy-first (see
 * src/tower/index.ts): an abstract graph of gates, keys and rewards is
 * planned, then embedded as chambers joined by single-tile doorways or
 * forks of parallel lanes.
 * Geometry is always valid; the key/HP economy is deliberately allowed to
 * be harsh or occasionally unwinnable. Deterministic for (seed, room). */
export function generateTowerRoom(
  seed: number,
  room: number,
): Map<string, Tile> {
  return generateTowerFloor(seed, room).cells;
}
const towerTorchCaches = new Map<string, Torch[]>();
/** Torches for one tower room, computed once when that room is first
 * entered this session and cached by seed+room number. */
function torchesForRoom(seed: number, room: number, cells: Map<string, Tile>): Torch[] {
  const key = `${seed}:${room}`;
  let t = towerTorchCaches.get(key);
  if (!t) {
    t = placeTorches(cells, { xMin: 1, xMax: TOWER_WIDTH - 2, yMin: 1, yMax: TOWER_HEIGHT - 2, seed: seed ^ Math.imul(room + 1, 0x9e3779b1) });
    towerTorchCaches.set(key, t);
  }
  return t;
}
export class RoomWorld implements Board {
  width = TOWER_WIDTH;
  height = TOWER_HEIGHT;
  floor = 0;
  cells: Map<string, Tile>;
  torches: Torch[];
  constructor(
    public seed: number,
    public room: number,
    public changes: Record<string, Tile>,
  ) {
    this.cells = generateTowerRoom(seed, room);
    this.torches = torchesForRoom(seed, room, this.cells);
  }
  breakTorchAt(x: number, y: number): boolean {
    return breakTorch(this.torches, x, y);
  }
  /** On the 17x17 board. */
  private inside(x: number, y: number) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
  tile(x: number, y: number): Tile {
    if (!this.inside(x, y)) return { kind: "wall" };
    const changed = this.changes[point(x, y)];
    if (changed) return changed;
    return (
      this.cells.get(point(x, y)) ?? {
        kind: "wall",
      }
    );
  }
  step(x: number, y: number, dx: number, dy: number) {
    const nx = x + dx,
      ny = y + dy;
    return this.inside(nx, ny) ? { x: nx, y: ny } : null;
  }
  clear(x: number, y: number) {
    this.changes[point(x, y)] = { kind: "floor" };
  }
}
