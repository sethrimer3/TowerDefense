/** The walls' upgrade tree: one tree for every wall section the player
 * places (`Layout.walls`), its branches climbed side by side like the
 * keep's (`keep-upgrades.ts`): Stonework (their HP, then mending), Thornwork
 * (they cut whoever presses against them) and Town walls (they may stand
 * inside the city, then let your own people through). Each rank is paid
 * with Knowledge and a respec gives it all back, free. The
 * ranks are saved on the Defend save (`DefendSave.wallRanks`, absent while
 * it has none) and snapshotted into `Bonuses.walls` when a battle starts. */
import { studyPathCost } from "./economy.ts";
import type { Save } from "./save.ts";
import { buySide, decodeSideRanks, respecSide, sideAllocated, sideRank, undoSide, type SidePath, type SideRanks, type SideResult } from "./side-ranks.ts";
import { cloneLayout, dropInnerWalls, type Layout } from "./defend/layout.ts";

export type WallPathId = "stonework" | "thornwork" | "townWalls";
/** How far the walls have climbed each branch (absent: not at all). */
export type WallRanks = SideRanks<WallPathId>;

// ── What each rank does in battle ─────────────────────────────────────────
/** Stonework: each placed wall stone's HP times `hp[rank]`; at III a
 * standing stone mends `mend` of its HP a second. */
export const STONEWORK = { hp: [1, 1.5, 2.2, 2.2], mend: 0.02 };
/** Thornwork: every `every[rank]` seconds each enemy on foot touching a
 * standing placed wall stone takes `damage[rank]`; at III it is chilled
 * for `chill` seconds too. */
export const THORNWORK = { every: [0, 1.5, 1, 1], damage: [0, 12, 25, 25], chill: 1.5 };
/** Town walls: from I wall sections may be placed inside the city; from II
 * your own troops and townsfolk pass through them (`posterns`). */
export const TOWN_WALLS = { inside: 1, posterns: 2 };

export const WALL_PATHS: SidePath<WallPathId>[] = [
  {
    id: "stonework", name: "Stonework", motto: "Heavier stones, better laid", hue: "steel",
    ranks: [
      { name: "Dressed stone", icon: "hammer", cost: studyPathCost(2, 0), text: "Placed walls have 50% more HP" },
      { name: "Ashlar courses", icon: "mail", cost: studyPathCost(2, 1), text: "120% more HP in all" },
      { name: "Living rock", icon: "heart", cost: studyPathCost(2, 2), text: "Damaged stones mend 2% of their HP a second" },
    ],
  },
  {
    id: "thornwork", name: "Thornwork", motto: "Barbs in every joint", hue: "ember",
    ranks: [
      { name: "Briar stakes", icon: "stake", cost: studyPathCost(2, 0), text: "Every 1.5 seconds, enemies on foot touching a placed wall take 12 damage" },
      { name: "Iron thorns", icon: "shards", cost: studyPathCost(2, 1), text: "Every second, for 25" },
      { name: "Barbed coils", icon: "snowflake", cost: studyPathCost(2, 2), text: "The barbs catch: whoever they cut is slowed for 1.5 seconds" },
    ],
  },
  {
    id: "townWalls", name: "Town walls", motto: "Walls for the streets as well", hue: "verdant",
    ranks: [
      { name: "Inner walls", icon: "crate", cost: studyPathCost(2, 0), text: "Wall sections may be placed inside the city too" },
      { name: "Posterns", icon: "boot", cost: studyPathCost(2, 1), text: "Your troops and townsfolk slip through placed walls; enemies still can't" },
    ],
  },
];

export const wallRank = (ranks: WallRanks | undefined, id: WallPathId) => sideRank(ranks, id);
/** Whether wall sections may stand inside the city. */
export const innerWalls = (ranks: WallRanks | undefined) => wallRank(ranks, "townWalls") >= TOWN_WALLS.inside;
/** The Knowledge allocated to the walls: every rank bought, at today's
 * prices (what a respec gives back). */
export const wallAllocated = (ranks: WallRanks | undefined) => sideAllocated(WALL_PATHS, ranks);

/** Runs a change to the walls' ranks, then lets wall sections stand inside
 * the city as the ranks it leaves say (taking up those that no longer may). */
function andInnerWalls(save: Save, change: SideResult): SideResult {
  if (change.ok) save.defend.layout = withInnerWalls(save.defend.layout, save.defend.wallRanks);
  return change;
}

/** Buys the next rank of branch `id` for Knowledge (free with Unlimited money). */
export const upgradeWalls = (save: Save, id: WallPathId) => andInnerWalls(save, buySide(save, "wallRanks", WALL_PATHS, id));
/** Undoes rank `rank` of branch `id` and the ranks above it, free. */
export const undoWalls = (save: Save, id: WallPathId, rank: number) => andInnerWalls(save, undoSide(save, "wallRanks", WALL_PATHS, id, rank));
/** Respecs the walls, free: every Knowledge point in them comes back.
 * Sections standing inside the city go back to the palette. */
export const respecWalls = (save: Save) => andInnerWalls(save, respecSide(save, "wallRanks", WALL_PATHS, "the walls have no upgrades"));

/** `layout` allowing wall sections inside the city as `ranks` say; without
 * that, the sections standing there are taken up (back to the palette). */
export function withInnerWalls(layout: Layout, ranks: WallRanks | undefined): Layout {
  const inner = innerWalls(ranks);
  if (!!layout.innerWalls === inner) return layout;
  const next = cloneLayout(layout);
  if (inner) next.innerWalls = true;
  else {
    delete next.innerWalls;
    dropInnerWalls(next);
  }
  return next;
}

/** Keeps only the walls' own branches at ranks they have; undefined when none. */
export const decodeWallRanks = (raw: unknown): WallRanks | undefined => decodeSideRanks(WALL_PATHS, raw);
