/** Independent Knowledge branches shared by every Ultimate Archer Tower. */
import type { Save } from "./save.ts";
import { buySide, decodeSideRanks, respecSide, sideAllocated, sideRank, undoSide, type SidePath, type SideRanks } from "./side-ranks.ts";
export type ChronoPathId = "storage" | "divine" | "focus" | "amplify";
export type ChronoRanks = SideRanks<ChronoPathId>;
export const CHRONO = {
  capacity: [30, 60, 90], spread: [45, 20, 0], hits: [0, 50, 100, 150, 200, 250], multiplier: [1, 2, 5, 10],
  interval: .04, divineSpeed: 160, divineWidth: .35, trailLife: .65,
} as const;
export const CHRONO_PATHS: SidePath<ChronoPathId>[] = [
  { id: "storage", name: "Suspended arsenal", motto: "More shots, held outside time", hue: "frost", ranks: [
    { name: "Sixty suspended shots", icon: "volley", cost: 6006, text: "Store up to 60 physical shots instead of the initial 30" },
    { name: "Ninety suspended shots", icon: "stars", cost: 24006, text: "Store up to 90 physical shots" },
  ] },
  { id: "divine", name: "Divine Arrow", motto: "Every idle strike becomes light", hue: "steel", ranks: [50,100,150,200,250].map((hits,i)=>({
    name: i ? `Divine reservoir ${hits}` : "Divine Arrow", icon: "halo", cost: 25*(1+1000*i*i),
    text: `Store damage from up to ${hits} incompatible hits, including idle melee attacks. Release one piercing golden arrow to the map edge; its damage reserve resets when fired`,
  })) },
  { id: "focus", name: "Focused release", motto: "Gather the spray into a line", hue: "verdant", ranks: [
    { name: "Narrow spray", icon: "crosshair", cost: 1, text: "Release stored shots in a total 20-degree spray instead of 45 degrees" },
    { name: "Perfect alignment", icon: "arrow", cost: 10, text: "Release stored shots straight ahead, with zero spread" },
  ] },
  { id: "amplify", name: "Divine amplification", motto: "A costly multiplication of stored light", hue: "ember", ranks: [2,5,10].map((factor,i)=>({
    name: `${factor}× divine damage`, icon: "stars", cost: [100000,1000000,10000000][i],
    text: `Multiply the Divine Arrow's accumulated damage by ${factor}; this is the total multiplier, not an additional multiplier`,
  })) },
];
export const chronoRank = (r: ChronoRanks | undefined, id: ChronoPathId) => sideRank(r,id);
export const chronoAllocated = (r: ChronoRanks | undefined) => sideAllocated(CHRONO_PATHS,r);
export const upgradeChrono = (s: Save,id: ChronoPathId) => buySide(s,"chronoRanks",CHRONO_PATHS,id);
export const undoChrono = (s: Save,id: ChronoPathId,rank: number) => undoSide(s,"chronoRanks",CHRONO_PATHS,id,rank);
export const respecChrono = (s: Save) => respecSide(s,"chronoRanks",CHRONO_PATHS,"the Ultimate Archer Towers have no upgrades");
export const decodeChronoRanks = (r: unknown) => decodeSideRanks(CHRONO_PATHS,r);
