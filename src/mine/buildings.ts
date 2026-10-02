/** The Mine's buildings on the surface, laid out along the ground either side
 * of the shaft: the shaft house over its mouth; the barracks to the right,
 * a lounge by the door and bunks in tiers of three, two to a ladder, which
 * grows a bay for every six of the crew; and to the left the warehouse
 * (timber, rails and lights for the workings), the forge (ore piles and a
 * furnace) and the smithy (an anvil, a rack of bars and a quench trough).
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
/** Bunks per bay (three tiers either side of a ladder), bays at most, and
 * the lounge's width. */
export const BAY_BUNKS = 6, MAX_BAYS = 4;
const LOUNGE = 6, BAY = 7;

/** Bays the barracks needs to bunk a crew of `crew`. */
export const bays = (crew: number) => Math.max(1, Math.min(MAX_BAYS, Math.ceil(crew / BAY_BUNKS)));

/** The buildings for ground `surface` (first solid row per column), a shaft
 * at `shaftX`, and a barracks of `bayCount` bays. */
export function layout(surface: ArrayLike<number>, shaftX: number, bayCount: number): Layout {
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

  const shaft: Building = { id: "shaft", x0: shaftX - 3, x1: shaftX + 3, floor: floorOf(shaftX - 3, shaftX + 3), height: 4, door: shaftX, spots: {} };

  // The barracks: door on the left (toward the shaft), the lounge, then bays.
  const bx0 = shaftX + 6, bx1 = bx0 + 1 + LOUNGE + BAY * bayCount, bf = floorOf(bx0, bx1);
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

  // To the left, doors on the right (toward the shaft).
  const wx1 = shaftX - 6, wx0 = wx1 - 8, wf = floorOf(wx0, wx1);
  const warehouse: Building = { id: "warehouse", x0: wx0, x1: wx1, floor: wf, height: 6, door: wx1, spots: { stock: standing(wx1, wf, [wx0 + 3, wx0 + 5, wx0 + 2], () => -1) } };
  const fx1 = wx0 - 2, fx0 = fx1 - 11, ff = floorOf(fx0, fx1);
  const forge: Building = { id: "forge", x0: fx0, x1: fx1, floor: ff, height: 6, door: fx1, spots: { work: standing(fx1, ff, [fx0 + 4, fx0 + 5, fx0 + 6, fx0 + 7], () => -1) } };
  const sx1 = fx0 - 2, sx0 = sx1 - 9, sf = floorOf(sx0, sx1);
  const smithy: Building = { id: "smithy", x0: sx0, x1: sx1, floor: sf, height: 6, door: sx1, spots: { work: standing(sx1, sf, [sx0 + 3, sx0 + 7, sx0 + 8], (x) => (x < sx0 + 5 ? 1 : -1)) } };
  return { shaft, barracks, warehouse, forge, smithy };
}

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
