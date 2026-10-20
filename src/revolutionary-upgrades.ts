/** The Revolutionary's upgrade tree: one tree for every Revolutionary in the
 * city, its five branches climbed side by side like the keep's
 * (`side-ranks.ts`): Squad (two, then three snipers), Chain laser (a bullet
 * that zigzags on through three, five, then seven enemies), Overclock (a
 * chance of a critical hit), Hollow core (what a critical multiplies) and
 * Detonator (a burst where the bullet stops). The ranks are saved on the Defend save
 * (`DefendSave.revolutionaryRanks`, absent while it has none) and
 * snapshotted into `Bonuses.revolutionary` when a battle starts; the
 * Revolutionary's own building tree shows them as branches off its node. */
import { studyPathCost } from "./economy.ts";
import type { Save } from "./save.ts";
import { buySide, decodeSideRanks, respecSide, sideAllocated, sideRank, undoSide, type SidePath, type SideRanks, type SideResult } from "./side-ranks.ts";

export type RevolutionaryPathId = "squad" | "chain" | "critChance" | "critDamage" | "splash";
/** How far the Revolutionaries have climbed each branch (absent: not at all). */
export type RevolutionaryRanks = SideRanks<RevolutionaryPathId>;

// ── What each rank does in battle ─────────────────────────────────────────
/** The squad: how many snipers each Revolutionary keeps. */
export const SQUAD = { snipers: [1, 2, 3] };
/** Chain laser: how many enemies one bullet strikes, each struck enemy's
 * nearest not yet struck within `jump` cells next. */
export const CHAIN = { hits: [1, 3, 5, 7], jump: 6 };
/** Overclock: the chance each hit is critical. */
export const CRIT_CHANCE = { chance: [0, 0.01, 0.03, 0.05, 0.1] };
/** Hollow core: what a critical hit multiplies the damage by (2 before it). */
export const CRIT_DAMAGE = { times: [2, 5, 10, 15, 20, 25] };
/** Detonator: where the bullet stops, a burst `radius[rank]` cells round its
 * last enemy at `share` of the hit's damage, sparing your own people. */
export const DETONATOR = { radius: [0, 1, 2, 3], share: 0.5 };

const cost = (rank: number) => studyPathCost(6, rank);

export const REVOLUTIONARY_PATHS: SidePath<RevolutionaryPathId>[] = [
  {
    id: "squad", name: "Squad", motto: "More rifles on the roof", hue: "verdant",
    ranks: [
      { name: "Spotter", icon: "eye", cost: cost(0), text: "Each Revolutionary keeps a second sniper" },
      { name: "Fire team", icon: "volley", cost: cost(1), text: "A third sniper" },
    ],
  },
  {
    id: "chain", name: "Chain laser", motto: "The laser leaps, the bullet follows", hue: "storm",
    ranks: [
      { name: "Refractor", icon: "fork", cost: cost(0), text: "The laser leaps from enemy to enemy and the bullet follows it, striking 3 enemies" },
      { name: "Prism array", icon: "shard", cost: cost(1), text: "It strikes 5 enemies" },
      { name: "Impossible angle", icon: "bolt", cost: cost(2), text: "It strikes 7 enemies" },
    ],
  },
  {
    id: "critChance", name: "Overclock", motto: "Every so often, perfect", hue: "ember",
    ranks: [
      { name: "Targeting chip", icon: "crosshair", cost: cost(0), text: "Each hit has a 1% chance to be critical" },
      { name: "Predictive lock", icon: "spyglass", cost: cost(1), text: "A 3% chance" },
      { name: "Weak-point scan", icon: "eye", cost: cost(2), text: "A 5% chance" },
      { name: "Overclock", icon: "stars", cost: cost(3), text: "A 10% chance" },
    ],
  },
  {
    id: "critDamage", name: "Hollow core", motto: "When it lands, it lands", hue: "steel",
    ranks: [
      { name: "Hollow core", icon: "cannonball", cost: cost(0), text: "A critical hit does 5× damage (2× without this)" },
      { name: "Tungsten core", icon: "hammer", cost: cost(1), text: "10× damage" },
      { name: "Depleted core", icon: "skull", cost: cost(2), text: "15× damage" },
      { name: "Plasma core", icon: "inferno", cost: cost(3), text: "20× damage" },
      { name: "Singularity", icon: "blast", cost: cost(4), text: "25× damage" },
    ],
  },
  {
    id: "splash", name: "Detonator", motto: "The last one goes up", hue: "frost",
    ranks: [
      { name: "Shaped charge", icon: "blast", cost: cost(0), text: "Where the bullet stops it bursts a cell round its last enemy, at half the damage, sparing your own people" },
      { name: "Frag charge", icon: "grape", cost: cost(1), text: "The burst reaches 2 cells" },
      { name: "Thermobaric", icon: "fireball", cost: cost(2), text: "The burst reaches 3 cells" },
    ],
  },
];

export const revolutionaryRank = (ranks: RevolutionaryRanks | undefined, id: RevolutionaryPathId) => sideRank(ranks, id);
/** The Knowledge allocated to the Revolutionaries (what a respec gives back). */
export const revolutionaryAllocated = (ranks: RevolutionaryRanks | undefined) => sideAllocated(REVOLUTIONARY_PATHS, ranks);
export const upgradeRevolutionary = (save: Save, id: RevolutionaryPathId): SideResult => buySide(save, "revolutionaryRanks", REVOLUTIONARY_PATHS, id);
export const undoRevolutionary = (save: Save, id: RevolutionaryPathId, rank: number): SideResult => undoSide(save, "revolutionaryRanks", REVOLUTIONARY_PATHS, id, rank);
export const respecRevolutionary = (save: Save): SideResult => respecSide(save, "revolutionaryRanks", REVOLUTIONARY_PATHS, "the Revolutionaries have no upgrades");
export const decodeRevolutionaryRanks = (raw: unknown): RevolutionaryRanks | undefined => decodeSideRanks(REVOLUTIONARY_PATHS, raw);
