/** The Tower's clear rewards: when a floor counts as cleared, which clear
 * tiers it earned, where their chests stand, and when each tier's shard is
 * paid. The log in `save.tower` is lifetime state, so a tier is paid once
 * however the run is undone, revived, reloaded or replaced. */
import type { ClearTier, RewardChest, Run, Save } from "../entities.ts";
import { RoomWorld, type Board } from "../generation.ts";

/** A Tower floor is cleared once no enemy or door is left on it. */
function roomCleared(world: RoomWorld) {
  return ![...world.cells.keys()].some(k => {
    const [x, y] = k.split(",").map(Number);
    return ["enemy", "door"].includes(world.tile(x, y).kind);
  });
}
/** Silver for any clear, gold without damage, platinum without keys as well. */
function clearTiers(run: Run): ClearTier[] {
  const tiers: ClearTier[] = ["silver"];
  if (run.damaged === false) {
    tiers.push("gold");
    if (run.keysSpent === false) tiers.push("platinum");
  }
  return tiers;
}
/** Plain floor tiles reachable from the stairs, closest first, where clear
 * chests go. */
function rewardSpots(world: RoomWorld, stairs: string) {
  const [sx, sy] = stairs.split(",").map(Number);
  const queue = [{ x: sx, y: sy }], seen = new Set([stairs]);
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    if (world.tile(n.x, n.y).kind === "floor") spots.push(n);
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

export class ClearLedger {
  constructor(private tower: Save["tower"]) {}

  /** Whether clear chests still stand on the run's floor. */
  static hasChests(run: Run) {
    return !!run.rewards?.length;
  }

  /** If `world`, the run's floor, has no enemy or door left, earns the
   * tiers the run hasn't earned there yet and sets their chests by the
   * stairs, paying a tier straight away when no spot is left for it.
   * Returns the tiers newly earned. */
  check(world: Board, run: Run): ClearTier[] {
    if (run.outside || !(world instanceof RoomWorld) || !roomCleared(world)) return [];
    const entry = this.tower.log[run.height] ??= { earned: [], claimed: [] };
    const stairs = [...world.cells].find(([, t]) => t.kind === "stairs");
    if (!stairs) return [];
    const spots = rewardSpots(world, stairs[0]);
    const chests = run.rewards ??= [];
    const earned = clearTiers(run).filter(tier => !entry.earned.includes(tier));
    for (const tier of earned) {
      entry.earned.push(tier);
      const spot = spots.shift();
      if (spot) chests.push({ ...spot, tier });
      else this.pay(entry.claimed, tier);
    }
    world.rewards = chests;
    return earned;
  }

  /** The chest for `tier` was opened: pays it. Returns the shards paid. */
  open(tier: ClearTier, world: Board, run: Run) {
    return this.claim(world, run, tier);
  }

  /** Leaving the floor, the run or the mode: pays every tier still owed.
   * Returns the shards paid. */
  claimAll(world: Board, run: Run) {
    return this.claim(world, run);
  }

  /** Keeps only the run's chests whose tier is earned and unpaid, and pays
   * every earned tier whose chest no longer stands, so earned rewards
   * survive undo, reload and replacement of an old run. */
  settle(world: Board, run: Run) {
    if (!(world instanceof RoomWorld)) return;
    const record = this.tower.log[run.height];
    const unopened = (c: RewardChest) => record?.earned.includes(c.tier) && !record.claimed.includes(c.tier);
    const chests = run.rewards = (run.rewards ?? []).filter(unopened);
    world.rewards = chests;
    for (const [floor, entry] of Object.entries(this.tower.log))
      for (const tier of entry.earned)
        if (!entry.claimed.includes(tier) && !(Number(floor) === run.height && chests.some(c => c.tier === tier)))
          this.pay(entry.claimed, tier);
  }

  private claim(world: Board, run: Run, tier?: ClearTier) {
    let paid = 0;
    for (const entry of Object.values(this.tower.log))
      for (const t of entry.earned)
        if ((!tier || tier === t) && !entry.claimed.includes(t)) {
          this.pay(entry.claimed, t);
          paid++;
        }
    this.settle(world, run);
    return paid;
  }

  private pay(claimed: ClearTier[], tier: ClearTier) {
    claimed.push(tier);
    this.tower.shards++;
  }
}
