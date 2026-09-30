import { point, type Run, type Tile, type Torch } from "./entities.ts";
import { tileRandom } from "./random.ts";

/** A board the player walks: the Delve labyrinth, a Tower floor, or the
 * forest outside. */
export type Board = {
  width: number;
  floor: number;
  tile(x: number, y: number): Tile;
  step(
    x: number,
    y: number,
    dx: number,
    dy: number,
  ): { x: number; y: number } | null;
  clear(x: number, y: number): void;
  /** Present on boards that carry torches (dungeon boards; the forest
   * exterior has none). */
  torches?: Torch[];
  /** Deactivates the torch standing on (x, y), if any, and reports whether
   * one was destroyed. Used for player-torch collision. */
  breakTorchAt?(x: number, y: number): boolean;
};

/** Where the planners (routes and Automove) start from: a board and the
 * run standing on it. A Game is one; so is any hand-built pair. */
export type Position = { world: Board; run: Run };

const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Flood fill used for structural checks. Enemies are traversable here:
 * combat difficulty is separate from topology and key solvability. With a
 * `wrap` width, walking off one side comes back on the other. */
export function reachable(
  cells: Map<string, Tile>,
  start: string,
  blocked: Set<string> = new Set(),
  wrap?: number,
) {
  const seen = new Set<string>(),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i],
      t = cells.get(k);
    if (seen.has(k) || !t || t.kind === "wall" || blocked.has(k)) continue;
    seen.add(k);
    const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of directions) {
      const xx = x + dx;
      queue.push(point(wrap === undefined ? xx : xx < 0 ? wrap - 1 : xx >= wrap ? 0 : xx, y + dy));
    }
  }
  return seen;
}

const PERCENT_POTION_SALT = 0x5eed7;
/** A generated tile at (x, y) on a board generated from `seed`, as a run
 * with `chance` (hundredths of a percent) of percent potions sees it: each
 * potion that may be one (generated blue) is a percent (red) potion when its
 * tile's fixed number falls under the chance, so a higher chance only ever
 * adds percent potions. */
export const withPotions = (t: Tile, x: number, y: number, seed: number, chance: number): Tile =>
  t.kind === "potion" && t.color && tileRandom(x, y, seed ^ PERCENT_POTION_SALT) * 10000 < chance ? { ...t, color: "red" } : t;
