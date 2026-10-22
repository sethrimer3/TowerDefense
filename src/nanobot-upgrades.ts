/** The C4 nanobots' upgrade tree: one tree for every C4 nanobots in the
 * city, its three branches climbed side by side like the Shadow's
 * (`side-ranks.ts`): Shaped charge (a bigger blast when an infected enemy
 * dies), Swarm spread (a bigger cloud) and Replication (a chance, 1% a rank
 * up to 5%, that a dying infected enemy sets free a new cloud). The ranks
 * are saved on the Defend save (`DefendSave.nanoRanks`, absent while it has
 * none) and snapshotted into `Bonuses.nano` when a battle starts; the
 * building's own tree shows them as branches off its node. */
import { studyPathCost } from "./economy.ts";
import type { Save } from "./save.ts";
import { buySide, decodeSideRanks, respecSide, sideAllocated, sideRank, undoSide, type SidePath, type SideRanks, type SideResult } from "./side-ranks.ts";

export type NanoPathId = "blast" | "cloud" | "replicate";
/** How far the C4 nanobots have climbed each branch (absent: not at all). */
export type NanoRanks = SideRanks<NanoPathId>;

// ── What each rank does in battle ─────────────────────────────────────────
/** Shaped charge: the radius, in cells, of the blast an infected enemy
 * makes as it dies. */
export const NANO_BLAST = { radius: [1.6, 2.1, 2.6, 3.2] };
/** Swarm spread: the radius, in cells, of the cloud a shell bursts into. */
export const NANO_CLOUD = { radius: [2.5, 3.2, 4, 5] };
/** Replication: the chance an infected enemy sets free a new cloud as it dies. */
export const NANO_REPLICATE = { chance: [0, 0.01, 0.02, 0.03, 0.04, 0.05] };

const cost = (rank: number) => studyPathCost(6, rank);

export const NANO_PATHS: SidePath<NanoPathId>[] = [
  {
    id: "blast", name: "Shaped charge", motto: "Every host a bomb", hue: "ember",
    ranks: [
      { name: "Denser payload", icon: "blast", cost: cost(0), text: "Infected enemies burst 2.1 cells wide as they die (1.6 without this)" },
      { name: "Shaped charge", icon: "blast", cost: cost(1), text: "2.6 cells wide" },
      { name: "Thermite core", icon: "inferno", cost: cost(2), text: "3.2 cells wide" },
    ],
  },
  {
    id: "cloud", name: "Swarm spread", motto: "A wider cloud", hue: "storm",
    ranks: [
      { name: "Thinner swarm", icon: "cloud", cost: cost(0), text: "A shell's cloud spreads 3.2 cells round (2.5 without this)" },
      { name: "Drifting swarm", icon: "whirl", cost: cost(1), text: "4 cells round" },
      { name: "Storm of motes", icon: "stars", cost: cost(2), text: "5 cells round" },
    ],
  },
  {
    id: "replicate", name: "Replication", motto: "They build more of themselves", hue: "verdant",
    ranks: [
      { name: "Self-assembly", icon: "gear", cost: cost(0), text: "An infected enemy has a 1% chance to set free a new cloud as it dies" },
      { name: "Spare parts", icon: "fork", cost: cost(1), text: "2% chance" },
      { name: "Fabricators", icon: "gear", cost: cost(2), text: "3% chance" },
      { name: "Hive mind", icon: "eye", cost: cost(3), text: "4% chance" },
      { name: "Grey goo", icon: "skull", cost: cost(4), text: "5% chance" },
    ],
  },
];

export const nanoRank = (ranks: NanoRanks | undefined, id: NanoPathId) => sideRank(ranks, id);
/** The Knowledge allocated to the C4 nanobots (what a respec gives back). */
export const nanoAllocated = (ranks: NanoRanks | undefined) => sideAllocated(NANO_PATHS, ranks);
export const upgradeNano = (save: Save, id: NanoPathId): SideResult => buySide(save, "nanoRanks", NANO_PATHS, id);
export const undoNano = (save: Save, id: NanoPathId, rank: number): SideResult => undoSide(save, "nanoRanks", NANO_PATHS, id, rank);
export const respecNano = (save: Save): SideResult => respecSide(save, "nanoRanks", NANO_PATHS, "the C4 nanobots have no upgrades");
export const decodeNanoRanks = (raw: unknown): NanoRanks | undefined => decodeSideRanks(NANO_PATHS, raw);
