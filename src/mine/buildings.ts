/** The Mine's buildings on the surface, laid out along the ground either side
 * of the shaft: the shaft house over its mouth (its winding room growing
 * toward the barracks); the barracks to the right, a lounge by the door and
 * bunks in tiers of three, two to a ladder, a bay for each level; and to the
 * left the warehouse (timber, rails and lights for the workings), the forge
 * (ore piles, shelves and a furnace) and the smithy (an anvil for each smith,
 * a rack of bars and a quench trough). Each building has `MAX_LEVEL` levels
 * and grows wider with each, so an upgrade can push its neighbours along.
 *
 * Inside a building a miner isn't in the grid: it walks a short scripted
 * path (`Spot.path`, feet cells from the door) to a spot (a bunk, a stool,
 * a station), and the renderer draws it there through the building's wall.
 * The sim and the renderer share these layouts. */
import { W } from "./world.ts";

export type BuildingId = "shaft" | "barracks" | "warehouse" | "forge" | "smithy";
export const BUILDINGS: readonly BuildingId[] = ["shaft", "barracks", "warehouse", "forge", "smithy"];
/** Why a miner goes in: to sleep in a bunk, to sit in the lounge (eating,
 * idling, out of the rain), to work a station, or to fetch supplies. */
export type Purpose = "sleep" | "lounge" | "work" | "stock";

/** Where a miner goes inside: its feet cell, whether it lies down there (head
 * at x, body toward `facing`'s back), and the way in from the door. */
export type Spot = { x: number; y: number; lie: boolean; facing: number; path: [number, number][] };
export type Building = {
  id: BuildingId;
  /** First and last columns (walls included), the floor's row (where feet
   * stand), the rows of room above it (feet row included), and the door's
   * column. */
  x0: number;
  x1: number;
  floor: number;
  height: number;
  door: number;
  spots: Partial<Record<Purpose, Spot[]>>;
};
export type Layout = Record<BuildingId, Building>;

/** Ticks a step and a rung take inside, as in the workings. */
export const IN_STEP = 8, IN_CLIMB = 10;
/** Bunks per bay (three tiers either side of a ladder), and the lounge's
 * width. */
export const BAY_BUNKS = 6;
const LOUNGE = 6, BAY = 7;
/** Levels each building has. */
export const MAX_LEVEL = 5;
export type Levels = Record<BuildingId, number>;
export const FIRST_LEVELS: Levels = { shaft: 1, barracks: 1, warehouse: 1, forge: 1, smithy: 1 };

/** The buildings for ground `surface` (first solid row per column), a shaft
 * at `shaftX`, and each building at its level (1 to `MAX_LEVEL`). */
export function layout(surface: ArrayLike<number>, shaftX: number, levels: Levels = FIRST_LEVELS): Layout {
  const lv = (id: BuildingId) => Math.max(1, Math.min(MAX_LEVEL, levels[id] | 0)), bayCount = lv("barracks");
  const floorOf = (x0: number, x1: number) => {
    let top = Infinity;
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) top = Math.min(top, surface[x]);
    return top - 1;
  };
  const walk = (from: number, to: number, y: number, path: [number, number][] = []) => {
    for (let x = from; x !== to; ) {
      x += Math.sign(to - x);
      path.push([x, y]);
    }
    return path;
  };
  const standing = (door: number, floor: number, xs: number[], facing: (x: number) => number) =>
    xs.map((x) => ({ x, y: floor, lie: false, facing: facing(x), path: walk(door, x, floor) }));

  const sx = shaftX + 2 + lv("shaft");
  const shaft: Building = { id: "shaft", x0: shaftX - 3, x1: sx, floor: floorOf(shaftX - 3, sx), height: 4, door: shaftX, spots: {} };

  // The barracks: door on the left (toward the shaft), the lounge, then bays.
  const bx0 = sx + 3, bx1 = bx0 + 1 + LOUNGE + BAY * bayCount, bf = floorOf(bx0, bx1);
  const bunks: (Spot & { order: number })[] = [];
  for (let p = 0; p < bayCount; p++) {
    const px = bx0 + 1 + LOUNGE + p * BAY, ladder = px + 3;
    for (let tier = 0; tier < 3; tier++)
      for (const side of [-1, 1]) {
        const lieY = bf - 1 - 2 * tier, head = ladder + side;
        const path = walk(bx0, ladder, bf);
        for (let y = bf - 1; y >= lieY; y--) path.push([ladder, y]);
        path.push([head, lieY]);
        // Lying on the plank, head by the ladder, feet toward the wall.
        bunks.push({ x: head, y: lieY, lie: true, facing: side, path, order: tier * 100 + p * 2 + (side + 1) / 2 });
      }
  }
  bunks.sort((a, b) => a.order - b.order);
  const barracks: Building = {
    id: "barracks", x0: bx0, x1: bx1, floor: bf, height: 7, door: bx0,
    spots: { sleep: bunks.map(({ order, ...s }) => s), lounge: standing(bx0, bf, [bx0 + 2, bx0 + 5, bx0 + 6, bx0 + 1, bx0 + 3, bx0 + 4], (x) => (x <= bx0 + 3 ? 1 : -1)) },
  };

  // To the left, doors on the right (toward the shaft); each a little wider
  // a level: the warehouse for more shelves, the forge for two more hands
  // at the furnace, the smithy for another anvil.
  const wx1 = shaftX - 6, wx0 = wx1 - 5 - 3 * lv("warehouse"), wf = floorOf(wx0, wx1);
  const warehouse: Building = { id: "warehouse", x0: wx0, x1: wx1, floor: wf, height: 6, door: wx1, spots: { stock: standing(wx1, wf, [wx0 + 3, wx0 + 5, wx0 + 2], () => -1) } };
  const fx1 = wx0 - 2, fx0 = fx1 - 8 - 3 * lv("forge"), ff = floorOf(fx0, fx1);
  const hands = Array.from({ length: 2 * lv("forge") }, (_, i) => fx0 + 4 + i);
  const forge: Building = { id: "forge", x0: fx0, x1: fx1, floor: ff, height: 6, door: fx1, spots: { work: standing(fx1, ff, hands, () => -1) } };
  const mx1 = fx0 - 2, mx0 = mx1 - 6 - 3 * lv("smithy"), mf = floorOf(mx0, mx1);
  // A smith stands at the left of each anvil (`anvils`), facing it.
  const smiths = Array.from({ length: lv("smithy") }, (_, i) => mx0 + 3 + 3 * i);
  const smithy: Building = { id: "smithy", x0: mx0, x1: mx1, floor: mf, height: 6, door: mx1, spots: { work: standing(mx1, mf, smiths, () => 1) } };
  return { shaft, barracks, warehouse, forge, smithy };
}

/** The anvils' first columns in a smithy (each three cells wide, its smith
 * standing just left of it). */
export const anvils = (b: Building) => (b.spots.work ?? []).map((s) => s.x + 1);

/** Ticks to walk a spot's path. */
export function pathTicks(path: [number, number][]) {
  let t = 0;
  for (let i = 0; i < path.length; i++) t += i > 0 && path[i][0] === path[i - 1][0] ? IN_CLIMB : IN_STEP;
  return t;
}
/** Where along `path` from `door` a miner is after `t` ticks of walking it
 * (its feet cell). */
export function along(door: [number, number], path: [number, number][], t: number): { x: number; y: number } {
  let at = door;
  for (let i = 0; i < path.length; i++) {
    const cost = i > 0 && path[i][0] === path[i - 1][0] ? IN_CLIMB : IN_STEP;
    if (t < cost) return { x: at[0], y: at[1] };
    t -= cost;
    at = path[i];
  }
  return { x: at[0], y: at[1] };
}
