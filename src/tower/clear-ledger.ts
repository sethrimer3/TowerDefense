/** The Tower's clear rewards: when a floor counts as cleared, which clear
 * tiers it earns, where their chests stand, and when each tier's shard is
 * paid. The log in `save.tower` is lifetime state, so a tier is paid once
 * however the run is undone, revived, reloaded or replaced. A chest is a
 * `reward` tile in the floor's changes, so undo and Revive bring it back
 * with the rest of the board; opening a tier already paid pays nothing. */
import type { ClearTier, TowerRun, Save } from "../entities.ts";
import { RoomWorld } from "./room-world.ts";
import type { Board } from "../board.ts";

export const CLEAR_TIERS: readonly ClearTier[] = ["silver", "gold", "platinum"];

/** A Tower floor is cleared once no enemy or door is left on it. */
function roomCleared(world: RoomWorld) {
  return ![...world.cells.keys()].some(k => {
    const [x, y] = k.split(",").map(Number);
    return ["enemy", "door"].includes(world.tile(x, y).kind);
  });
}
/** Silver for any clear, gold without damage, platinum without keys as well. */
function clearTiers(run: TowerRun): ClearTier[] {
  const tiers: ClearTier[] = ["silver"];
  if (run.damaged === false) {
    tiers.push("gold");
    if (run.keysSpent === false) tiers.push("platinum");
  }
  return tiers;
}
/** Plain floor tiles reachable from the stairs, closest first, where clear
 * chests go: never the tile the player stands on, which is often the last
 * enemy's, just beaten in front of the stairs. */
function rewardSpots(world: RoomWorld, stairs: string, player: { x: number; y: number }) {
  const [sx, sy] = stairs.split(",").map(Number);
  const queue = [{ x: sx, y: sy }], seen = new Set([stairs]);
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    if (world.tile(n.x, n.y).kind === "floor" && !(n.x === player.x && n.y === player.y)) spots.push(n);
    const fresh = openNeighbours(world, n).filter(d => !seen.has(`${d.x},${d.y}`));
    for (const d of fresh) seen.add(`${d.x},${d.y}`);
    queue.push(...fresh);
  }
  return spots;
}
/** The non-wall tiles one step from `n`. */
function openNeighbours(world: RoomWorld, n: { x: number; y: number }) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => world.step(n.x, n.y, dx, dy))
    .filter((d): d is { x: number; y: number } => !!d && world.tile(d.x, d.y).kind !== "wall");
}
/** The clear chests standing on the run's floor, by tile. A chest always
 * stands on a floor tile, so taking one away leaves floor. */
function chests(run: TowerRun) {
  return Object.entries(run.changes).filter(([, t]) => t.kind === "reward") as [string, { tier: ClearTier }][];
}

export class ClearLedger {
  constructor(private tower: Save["tower"]) {}

  /** Whether clear chests still stand on the run's floor. */
  static hasChests(run: TowerRun) {
    return chests(run).length > 0;
  }

  /** If `world`, the run's floor, has no enemy or door left, earns the
   * tiers the run hasn't earned there yet and sets their chests by the
   * stairs, paying a tier straight away when no spot is left for it.
   * Returns the tiers newly earned. */
  check(world: Board, run: TowerRun): ClearTier[] {
    if (run.outside || !(world instanceof RoomWorld) || !roomCleared(world)) return [];
    const entry = this.tower.log[run.height] ??= {};
    const stairs = [...world.cells].find(([, t]) => t.kind === "stairs");
    if (!stairs) return [];
    const spots = rewardSpots(world, stairs[0], run.player);
    const earned = clearTiers(run).filter(tier => !entry[tier]);
    for (const tier of earned) {
      const spot = spots.shift();
      // The board reads the run's changes, so the chest shows at once.
      if (spot) {
        entry[tier] = "earned";
        run.changes[`${spot.x},${spot.y}`] = { kind: "reward", tier };
      } else this.pay(entry, tier);
    }
    return earned;
  }

  /** The chest for `tier` on the run's floor was opened: pays it unless it
   * was already paid. Returns the Inspiration paid. */
  open(tier: ClearTier, run: TowerRun) {
    const entry = this.tower.log[run.height];
    const paid = entry?.[tier] === "earned" ? (this.pay(entry, tier), 1) : 0;
    this.settle(run);
    return paid;
  }

  /** Leaving the floor, the run or the mode: pays every tier still owed and
   * takes the floor's chests away. Returns the Inspiration paid. */
  claimAll(run: TowerRun) {
    let paid = 0;
    for (const entry of Object.values(this.tower.log))
      for (const tier of CLEAR_TIERS)
        if (entry[tier] === "earned") {
          this.pay(entry, tier);
          paid++;
        }
    for (const [k] of chests(run)) run.changes[k] = { kind: "floor" };
    return paid;
  }

  /** After a load, a floor change or an undo: pays every earned tier whose
   * chest no longer stands on the run's floor, and takes away any chest
   * whose tier the log has never earned. */
  settle(run: TowerRun) {
    const standing = chests(run);
    const here = this.tower.log[run.height];
    for (const [k, t] of standing) if (!here?.[t.tier]) run.changes[k] = { kind: "floor" };
    for (const [floor, entry] of Object.entries(this.tower.log))
      for (const tier of CLEAR_TIERS)
        if (entry[tier] === "earned" && !(Number(floor) === run.height && standing.some(([, t]) => t.tier === tier)))
          this.pay(entry, tier);
  }

  private pay(entry: NonNullable<Save["tower"]["log"][string]>, tier: ClearTier) {
    entry[tier] = "claimed";
    this.tower.inspiration++;
  }
}
