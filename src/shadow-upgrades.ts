/** The Shadow's upgrade tree: one tree for every Shadow in the city, its four
 * branches climbed side by side like the Revolutionary's (`side-ranks.ts`):
 * Whirling knives (more knives round the shade), Sundering edge (armor
 * piercing), Hemorrhage (bleeding, for enemies with blood in them) and
 * Gathering dark (what each hit adds to the next, compounding). The ranks
 * are saved on the Defend save (`DefendSave.shadowRanks`, absent while it
 * has none) and snapshotted into `Bonuses.shadow` when a battle starts; the
 * Shadow's own building tree shows them as branches off its node. */
import { studyPathCost } from "./economy.ts";
import type { Save } from "./save.ts";
import { buySide, decodeSideRanks, respecSide, sideAllocated, sideRank, undoSide, type SidePath, type SideRanks, type SideResult } from "./side-ranks.ts";

export type ShadowPathId = "knives" | "pierce" | "bleed" | "edge";
/** How far the Shadows have climbed each branch (absent: not at all). */
export type ShadowRanks = SideRanks<ShadowPathId>;

// ── What each rank does in battle ─────────────────────────────────────────
/** Whirling knives: how many knives circle each shade. */
export const SHADOW_KNIVES = { knives: [3, 4, 5, 6, 8] };
/** Sundering edge: the share of an enemy's armor a knife cuts through (a
 * walking fortress's plates, a shell, a beetle's front). */
export const SHADOW_PIERCE = { pierce: [0, 0.25, 0.5, 0.75] };
/** Hemorrhage: a knife leaves an enemy with blood in it bleeding `share`
 * of the hit a second for `time` seconds (a fresh cut renews the worse). */
export const SHADOW_BLEED = { share: [0, 0.1, 0.2, 0.35], time: [0, 3, 4, 5] };
/** Gathering dark: each enemy a knife hits adds this much to every later
 * hit, compounding (+0.1% before it). */
export const SHADOW_EDGE = { rate: [0.001, 0.002, 0.003, 0.005] };

const cost = (rank: number) => studyPathCost(6, rank);

export const SHADOW_PATHS: SidePath<ShadowPathId>[] = [
  {
    id: "knives", name: "Whirling knives", motto: "More blades in the dark", hue: "storm",
    ranks: [
      { name: "Fourth knife", icon: "shard", cost: cost(0), text: "Four knives circle the shade (three without this)" },
      { name: "Fifth knife", icon: "shard", cost: cost(1), text: "Five knives" },
      { name: "Sixth knife", icon: "fork", cost: cost(2), text: "Six knives" },
      { name: "Blade storm", icon: "stars", cost: cost(3), text: "Eight knives" },
    ],
  },
  {
    id: "pierce", name: "Sundering edge", motto: "No plate turns it", hue: "steel",
    ranks: [
      { name: "Honed edge", icon: "crosshair", cost: cost(0), text: "The knives cut through 25% of an enemy's armor" },
      { name: "Sundering edge", icon: "hammer", cost: cost(1), text: "50% of its armor" },
      { name: "Void edge", icon: "skull", cost: cost(2), text: "75% of its armor" },
    ],
  },
  {
    id: "bleed", name: "Hemorrhage", motto: "Every cut keeps cutting", hue: "ember",
    ranks: [
      { name: "Serrated", icon: "drop", cost: cost(0), text: "Enemies with blood in them bleed 10% of each hit a second for 3 seconds" },
      { name: "Barbed", icon: "drop", cost: cost(1), text: "20% a second for 4 seconds" },
      { name: "Exsanguinate", icon: "skull", cost: cost(2), text: "35% a second for 5 seconds" },
    ],
  },
  {
    id: "edge", name: "Gathering dark", motto: "Each cut sharper than the last", hue: "verdant",
    ranks: [
      { name: "Hunger", icon: "eye", cost: cost(0), text: "Each enemy hit adds 0.2% to every later hit, compounding (0.1% without this)" },
      { name: "Gluttony", icon: "stars", cost: cost(1), text: "0.3%, compounding" },
      { name: "Endless night", icon: "inferno", cost: cost(2), text: "0.5%, compounding" },
    ],
  },
];

export const shadowRank = (ranks: ShadowRanks | undefined, id: ShadowPathId) => sideRank(ranks, id);
/** The Knowledge allocated to the Shadows (what a respec gives back). */
export const shadowAllocated = (ranks: ShadowRanks | undefined) => sideAllocated(SHADOW_PATHS, ranks);
export const upgradeShadow = (save: Save, id: ShadowPathId): SideResult => buySide(save, "shadowRanks", SHADOW_PATHS, id);
export const undoShadow = (save: Save, id: ShadowPathId, rank: number): SideResult => undoSide(save, "shadowRanks", SHADOW_PATHS, id, rank);
export const respecShadow = (save: Save): SideResult => respecSide(save, "shadowRanks", SHADOW_PATHS, "the Shadows have no upgrades");
export const decodeShadowRanks = (raw: unknown): ShadowRanks | undefined => decodeSideRanks(SHADOW_PATHS, raw);
