/** The keep's own upgrade tree. Unlike every other building, whose paths
 * are a choice of one, the keep climbs each of its branches on its own:
 * Bastions (its HP), Arrow loops (it shoots) and Boiling oil (it scalds
 * what reaches its walls). Each rank is paid with Knowledge, and a respec
 * gives it all back, free. The ranks are saved on the Defend
 * save (`DefendSave.keepRanks`, absent while it has none: there is only
 * ever one keep, and it never leaves the city) and snapshotted into
 * `Bonuses.keep` when a battle starts. */
import { studyPathCost } from "./economy.ts";
import type { Save } from "./save.ts";
import { buySide, decodeSideRanks, respecSide, sideAllocated, sideRank, undoSide, type SidePath, type SideRanks, type SideResult } from "./side-ranks.ts";

export type KeepPathId = "bastions" | "arrowLoops" | "boilingOil";
/** How far the keep has climbed each branch (absent: not at all). */
export type KeepRanks = SideRanks<KeepPathId>;

// ── What each rank does in battle ─────────────────────────────────────────
/** Bastions: the keep's HP times `hp[rank]`. */
export const BASTIONS = { hp: [1, 1.3, 1.7, 2.4] };
/** Arrow loops: the keep shoots the nearest enemy within `range[rank]`
 * cells every `reload[rank]` seconds, with an archer tower's arrow times
 * `damage[rank]`; at III it looses `volley` arrows at once, each at another
 * of the nearest. */
export const ARROW_LOOPS = { range: [0, 5, 6.5, 6.5], reload: [0, 1.6, 1.1, 1.1], damage: [0, 1, 1.3, 1.3], volley: 3 };
/** Boiling oil: every `every[rank]` seconds every enemy on foot within
 * `reach[rank]` cells of the keep's walls is scalded for `damage[rank]`;
 * from II it keeps burning `burn[rank]` seconds at `dps[rank]` a second. */
export const BOILING_OIL = { reach: [0, 1.5, 2, 2.5], every: [0, 3, 2.5, 2], damage: [0, 25, 40, 60], burn: [0, 0, 3, 4], dps: [0, 0, 10, 20] };

export const KEEP_PATHS: SidePath<KeepPathId>[] = [
  {
    id: "bastions", name: "Bastions", motto: "Thicker walls, a keep that holds", hue: "steel",
    ranks: [
      { name: "Buttresses", icon: "mail", cost: studyPathCost(4, 0), text: "The keep has 30% more HP" },
      { name: "Curtain wall", icon: "helm", cost: studyPathCost(4, 1), text: "70% more HP in all" },
      { name: "Citadel", icon: "oath", cost: studyPathCost(4, 2), text: "140% more HP in all" },
    ],
  },
  {
    id: "arrowLoops", name: "Arrow loops", motto: "Archers behind the keep's walls", hue: "verdant",
    ranks: [
      { name: "Arrow slits", icon: "arrow", cost: studyPathCost(4, 0), text: "The keep shoots an arrow at the nearest enemy within 5 cells" },
      { name: "Longbows", icon: "bow", cost: studyPathCost(4, 1), text: "It shoots faster, 30% harder and 6.5 cells far" },
      { name: "Loosing volleys", icon: "volley", cost: studyPathCost(4, 2), text: "It looses 3 arrows at once, at the 3 nearest enemies" },
    ],
  },
  {
    id: "boilingOil", name: "Boiling oil", motto: "Scald whatever reaches the walls", hue: "ember",
    ranks: [
      { name: "Oil cauldrons", icon: "flame", cost: studyPathCost(4, 0), text: "Every 3 seconds, enemies on foot within 1.5 cells of the keep are scalded for 25" },
      { name: "Burning pitch", icon: "embers", cost: studyPathCost(4, 1), text: "Every 2.5 seconds, 2 cells out, for 40, and they burn for 3 seconds" },
      { name: "Murder holes", icon: "fireball", cost: studyPathCost(4, 2), text: "Every 2 seconds, 2.5 cells out, for 60, and they burn twice as hot" },
    ],
  },
];

export const keepRank = (ranks: KeepRanks | undefined, id: KeepPathId) => sideRank(ranks, id);
/** The Knowledge allocated to the keep: every rank bought, at today's prices
 * (what a respec gives back). */
export const keepAllocated = (ranks: KeepRanks | undefined) => sideAllocated(KEEP_PATHS, ranks);
/** Buys the next rank of branch `id` for Knowledge (free with Unlimited money). */
export const upgradeKeep = (save: Save, id: KeepPathId): SideResult => buySide(save, "keepRanks", KEEP_PATHS, id);
/** Undoes rank `rank` of branch `id` and the ranks above it, free. */
export const undoKeep = (save: Save, id: KeepPathId, rank: number): SideResult => undoSide(save, "keepRanks", KEEP_PATHS, id, rank);
/** Respecs the keep, free: every Knowledge point in it comes back. */
export const respecKeep = (save: Save): SideResult => respecSide(save, "keepRanks", KEEP_PATHS, "it has no upgrades");
/** Keeps only the keep's own branches at ranks they have; undefined when none. */
export const decodeKeepRanks = (raw: unknown): KeepRanks | undefined => decodeSideRanks(KEEP_PATHS, raw);
