/** The wall ballistas' upgrade tree: one tree for every ballista on the
 * wall's corners, its branches climbed side by side like the walls'
 * (`side-ranks.ts`): Heavy bolts (harder, staggering, piercing further),
 * Fire bolts (burning, then burning ground, then bursting) and Windlass
 * (quicker, further, then a fan of three). The ranks are saved on the
 * Defend save (`DefendSave.ballistaRanks`, absent while it has none) and
 * snapshotted into `Bonuses.ballista` when a battle starts. */
import { studyPathCost } from "./economy.ts";
import type { Save } from "./save.ts";
import { buySide, decodeSideRanks, respecSide, sideAllocated, sideRank, undoSide, type SidePath, type SideRanks, type SideResult } from "./side-ranks.ts";

export type BallistaPathId = "heavyBolts" | "fireBolts" | "windlass";
/** How far the ballistas have climbed each branch (absent: not at all). */
export type BallistaRanks = SideRanks<BallistaPathId>;

// ── What each rank does in battle ─────────────────────────────────────────
/** Heavy bolts: damage times `damage[rank]`; from II each enemy struck is
 * staggered for `stagger` seconds; at III a bolt pierces `pierce[rank]`. */
export const HEAVY_BOLTS = { damage: [1, 1.4, 1.4, 2], stagger: 0.5, pierce: [0, 0, 0, 8] };
/** Fire bolts: each enemy struck burns for `burn` seconds at `share` of
 * the bolt's damage a second; from II a bolt leaves burning ground where it
 * stops (`blaze`); at III it bursts on its first strike (`burst`: radius,
 * share of its damage), sparing your own people. */
export const FIRE_BOLTS = { burn: 3, share: 0.15, blaze: { r: 1.2, life: 4, dps: 10 }, burst: { r: 1.6, share: 0.6 } };
/** Windlass: reload times `reload[rank]`; from II `range[rank]` more cells;
 * at III it looses `fan` bolts at once, the outer two turned aside by the
 * angle whose cosine and sine are `cos` and `sin` (about 14 degrees). */
export const WINDLASS = { reload: [1, 0.75, 0.75, 0.75], range: [0, 0, 4, 4], fan: 3, cos: 4 / Math.sqrt(17), sin: 1 / Math.sqrt(17) };

export const BALLISTA_PATHS: SidePath<BallistaPathId>[] = [
  {
    id: "heavyBolts", name: "Heavy bolts", motto: "Iron that goes through", hue: "steel",
    ranks: [
      { name: "Iron-headed bolts", icon: "arrow", cost: studyPathCost(2, 0), text: "Bolts hit 40% harder" },
      { name: "Crushing bolts", icon: "hammer", cost: studyPathCost(2, 1), text: "Every enemy a bolt strikes is staggered for half a second" },
      { name: "Siege bolts", icon: "stake", cost: studyPathCost(2, 2), text: "Bolts hit twice as hard as plain ones and pierce eight enemies" },
    ],
  },
  {
    id: "fireBolts", name: "Fire bolts", motto: "Pitch on every head", hue: "ember",
    ranks: [
      { name: "Pitch-soaked", icon: "fireArrow", cost: studyPathCost(2, 0), text: "Every enemy a bolt strikes burns for 3 seconds" },
      { name: "Firebrands", icon: "embers", cost: studyPathCost(2, 1), text: "Where a bolt stops, the ground burns for 4 seconds" },
      { name: "Thunderbolts", icon: "fireball", cost: studyPathCost(2, 2), text: "A bolt bursts on the first enemy it strikes, sparing your own people" },
    ],
  },
  {
    id: "windlass", name: "Windlass", motto: "Wound tight, loosed often", hue: "storm",
    ranks: [
      { name: "Ratchet windlass", icon: "gear", cost: studyPathCost(2, 0), text: "Ballistas reload 25% faster" },
      { name: "Long arms", icon: "spyglass", cost: studyPathCost(2, 1), text: "They shoot 4 cells further" },
      { name: "Fan of bolts", icon: "volley", cost: studyPathCost(2, 2), text: "Each shot looses three bolts in a fan" },
    ],
  },
];

export const ballistaRank = (ranks: BallistaRanks | undefined, id: BallistaPathId) => sideRank(ranks, id);
/** The Knowledge allocated to the ballistas (what a respec gives back). */
export const ballistaAllocated = (ranks: BallistaRanks | undefined) => sideAllocated(BALLISTA_PATHS, ranks);
export const upgradeBallistas = (save: Save, id: BallistaPathId): SideResult => buySide(save, "ballistaRanks", BALLISTA_PATHS, id);
export const undoBallistas = (save: Save, id: BallistaPathId, rank: number): SideResult => undoSide(save, "ballistaRanks", BALLISTA_PATHS, id, rank);
export const respecBallistas = (save: Save): SideResult => respecSide(save, "ballistaRanks", BALLISTA_PATHS, "the ballistas have no upgrades");
export const decodeBallistaRanks = (raw: unknown): BallistaRanks | undefined => decodeSideRanks(BALLISTA_PATHS, raw);
