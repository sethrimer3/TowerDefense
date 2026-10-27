import { defaultDefendSave } from "../defend/progress.ts";
import { soldierCap, trainSeconds, type StructureKind } from "../defend/catalog.ts";
import { TRAINS } from "../defend/deployment.ts";
import { troopStats, towerStats } from "./price-estimates.ts";
import { AMBUSH_WAVES } from "./ambush-waves.ts";
import { intPow } from "../exact.ts";

const baseLevels = defaultDefendSave().levels;
const tens = (n: number) => Math.max(10, Math.round(n / 10) * 10);
/** A level's opening gold: `base`, growing by `AMBUSH_WAVES.defenseGrowth` a level through the campaign (`order`, 0 to 29). */
export const STARTING_GOLD = { base: 800 };
export const startingGold = (order: number) => tens(STARTING_GOLD.base * intPow(AMBUSH_WAVES.defenseGrowth, order));
/** Rough potential DPS, not guaranteed damage: infantry assumes full garrison,
 * cannon splash 2.5 targets, flame splash 2, support a standard 8-DPS partner. */
export function ambushPrice(kind: StructureKind) {
  const levels = baseLevels;
  let dps: number,
    range: number,
    durability = 0,
    replacementMultiplier = 1;
  if (TRAINS[kind]) {
    const troop = troopStats(kind, levels),
      cap = soldierCap(levels.barracksCapacity);
    dps = (cap * troop.damage) / troop.cooldown;
    range = troop.range;
    durability = cap * troop.hp * 0.15;
    replacementMultiplier = 1 + Math.max(0, 5 / trainSeconds(levels.barracksTraining) - 1) * 0.15;
  } else {
    const attack = towerStats(kind, levels);
    dps = kind === "watchTower" ? 8 : (attack.damage / attack.cooldown) * (attack.splash > 1 ? 2.5 : attack.splash > 0 ? 2 : 1);
    range = attack.range;
  }
  return { cost: tens(40 + 12 * dps * (1 + Math.min(range, 20) / 20) * replacementMultiplier + durability), dps, range, support: kind === "watchTower" };
}
