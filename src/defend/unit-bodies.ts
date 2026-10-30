/** Canonical defender body envelopes, shared by contact combat and painters. */
import { FLAG_BEARER, HERO, SHADE, HOPLITE, JAVELINEER, LANCER, SPEARMAN, ARCHER_UNIT, ASSASSIN_UNIT, BRAWLER, DARK_WIZARD, FIRE_MAGE, GATLING_GUNNER, GUNNER, MACHINE_GUNNER, MUSKETEER, RAIL_SNIPER, ROCKETEER, SLINGER, SNIPER, SOLDIER, VALKYRIE } from "./catalog.ts";
import type { Soldier, Civilian } from "./sim.ts";
import { CIVILIAN } from "./catalog.ts";

/** Each troop kind's size and colour, shared with the garrison badges. */
export const TROOPS: Record<Soldier["kind"], { size: number; color: string }> = {
  sword: SOLDIER,
  archer: ARCHER_UNIT,
  mage: FIRE_MAGE,
  valkyrie: VALKYRIE,
  darkWizard: DARK_WIZARD,
  undead: { size: SOLDIER.size, color: "#cfd3bf" },
  reinforcement: { size: SOLDIER.size, color: "#a9bde0" },
  brawler: BRAWLER,
  slinger: SLINGER,
  sniper: SNIPER,
  musketeer: MUSKETEER,
  gunner: GUNNER,
  machineGunner: MACHINE_GUNNER,
  gatlingGunner: GATLING_GUNNER,
  railSniper: RAIL_SNIPER,
  rocketeer: ROCKETEER,
  spearman: SPEARMAN,
  hoplite: HOPLITE,
  javelineer: JAVELINEER,
  lancer: LANCER,
  hero: HERO,
  shade: SHADE,
  flagBearer: FLAG_BEARER,
  assassin: ASSASSIN_UNIT,
};

export const defenderSize = (u: Soldier | Civilian) => "kind" in u ? TROOPS[u.kind].size : CIVILIAN.size;
