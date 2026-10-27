import * as C from "../defend/catalog.ts";
import { TRAINS } from "../defend/deployment.ts";
import type { DefendSave } from "../defend/progress.ts";
export type Profile = { hp: number; damage: number; cooldown: number; speed: number; range?: number; reach?: number; color: string };
export const PROFILES: Record<string, Profile> = {
  brawler: C.BRAWLER,
  slinger: C.SLINGER,
  sword: C.SOLDIER,
  archer: C.ARCHER_UNIT,
  assassin: C.ASSASSIN_UNIT,
  spearman: C.SPEARMAN,
  hoplite: C.HOPLITE,
  lancer: C.LANCER,
  javelineer: C.JAVELINEER,
  sniper: C.SNIPER,
  musketeer: C.MUSKETEER,
  gunner: C.GUNNER,
  machineGunner: C.MACHINE_GUNNER,
  gatlingGunner: C.GATLING_GUNNER,
  rocketeer: C.ROCKETEER,
  railSniper: C.RAIL_SNIPER,
  hero: C.HERO,
  shade: C.SHADE,
  mage: { ...C.FIRE_MAGE, damage: C.fireballDamage(0), range: 5 },
  valkyrie: C.VALKYRIE,
  darkWizard: C.DARK_WIZARD,
};

/** Rough price estimates from the native catalog. Never used to simulate combat. */
export function troopStats(kind: C.StructureKind, levels: DefendSave["levels"]) {
  const base = PROFILES[TRAINS[kind]!] || C.SOLDIER,
    scale = C.soldierScale(levels.soldierArms);
  return { ...base, hp: base.hp * scale, damage: base.damage * scale, range: base.range ?? base.reach ?? C.archerUnitRange(levels.archerSight) };
}
export function towerStats(kind: C.StructureKind, levels: DefendSave["levels"]) {
  const cannon = (C.CANNON_TOWERS as readonly string[]).includes(kind) || kind === "nanoTower",
    wizard = C.isWizardTower(kind);
  return {
    range:
      kind === "watchTower"
        ? C.watchRadius(levels.watchRadius)
        : cannon
          ? C.CANNON_RANGE
          : wizard
            ? C.flameRange(levels.wizardFlame)
            : C.archerRange(levels.archerRange),
    damage:
      kind === "watchTower" ? 0 : cannon ? C.cannonDamage(levels.cannonDamage) : wizard ? C.flameDps(levels.wizardFlame) : C.archerDamage(levels.archerDamage),
    cooldown: cannon ? C.cannonCooldown(levels.cannonRate) : wizard ? 1.6 : C.archerCooldown(levels.archerRate),
    splash: cannon ? C.cannonSplash(levels.cannonDamage) : wizard ? 1 : 0,
  };
}
