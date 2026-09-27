import type { Tile } from "../src/entities.ts";
import { region } from "../src/delve/labyrinth.ts";

/** The first `areas` areas of a Delve labyrinth as one map, for checks
 * over whole areas; the game itself generates chunk by chunk. */
export function generateDelveMap(seed: number, areas = 4): Map<string, Tile> {
  const cells = new Map<string, Tile>();
  for (let a = 0; a < areas; a++) for (const [k, t] of region(seed, a).cells) cells.set(k, t);
  return cells;
}
