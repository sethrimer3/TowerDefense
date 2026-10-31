/** Repair shops share independent Knowledge branches, like the city gate.
 * Carpentry is innate; the saved ranks contain only purchased skills. */
import { studyPathCost } from "./economy.ts";
import type { Save } from "./save.ts";
import { buySide, decodeSideRanks, respecSide, sideAllocated, sideRank, undoSide, type SidePath, type SideRanks } from "./side-ranks.ts";

export type RepairPathId = "advancedCarpentry" | "masonry" | "crew" | "triage" | "retreatBow";
export type RepairRanks = SideRanks<RepairPathId>;
export const REPAIR = { seconds: 30, bowDamage: 2, bowCooldown: 2.5, danger: 3, rethink: 1 };
export const REPAIR_PATHS: SidePath<RepairPathId>[] = [
  { id: "advancedCarpentry", name: "Advanced carpentry", motto: "Keep the defenders fighting", hue: "steel", ranks: [
    { name: "Advanced carpentry", icon: "hammer", cost: studyPathCost(2, 0), text: "Repair damaged and destroyed infantry buildings and towers" },
  ] },
  { id: "masonry", name: "Masonry", motto: "Close the breaches", hue: "steel", ranks: [
    { name: "Masonry", icon: "crate", cost: studyPathCost(2, 0), text: "Repair damaged and destroyed city walls, gates and wall ballistas" },
  ] },
  { id: "crew", name: "Workshop crew", motto: "More hands on the job", hue: "verdant", ranks: [
    { name: "Third carpenter", icon: "hand", cost: studyPathCost(2, 0), text: "Each Repair shop supports 3 repair workers" },
    { name: "Fourth carpenter", icon: "hand", cost: studyPathCost(2, 1), text: "Each Repair shop supports 4 repair workers" },
  ] },
  { id: "triage", name: "Critical repairs", motto: "Save what the city needs most", hue: "verdant", ranks: [
    { name: "Critical repairs", icon: "eye", cost: studyPathCost(2, 0), text: "Prioritize breached gates and walls, disabled defenses and badly damaged buildings; reassess jobs while travelling" },
  ] },
  { id: "retreatBow", name: "Parting shot", motto: "Run, turn, loose", hue: "ember", ranks: [
    { name: "Parting shot", icon: "bow", cost: studyPathCost(2, 0), text: "Shoot a weak bow while running away from nearby enemies: 2 damage every 2.5 seconds" },
  ] },
];
export const repairRank = (r: RepairRanks | undefined, id: RepairPathId) => sideRank(r, id);
export const repairCrew = (r: RepairRanks | undefined) => 2 + repairRank(r, "crew");
export const repairAllocated = (r: RepairRanks | undefined) => sideAllocated(REPAIR_PATHS, r);
export const upgradeRepair = (s: Save, id: RepairPathId) => buySide(s, "repairRanks", REPAIR_PATHS, id);
export const undoRepair = (s: Save, id: RepairPathId, rank: number) => undoSide(s, "repairRanks", REPAIR_PATHS, id, rank);
export const respecRepair = (s: Save) => respecSide(s, "repairRanks", REPAIR_PATHS, "the Repair shops have no purchased skills");
export const decodeRepairRanks = (raw: unknown) => decodeSideRanks(REPAIR_PATHS, raw);
