import { allocated } from "../specializations.ts";
import type { PathId } from "../knowledge-paths.ts";
import { soldierCap, trainSeconds, type StructureKind } from '../defend/catalog.ts';
import { TRAINS } from '../defend/deployment.ts';
import type { DefendSave } from '../defend/progress.ts';
import { troopStats, towerStats } from './price-estimates.ts';
export const startingGold=(level:number)=>500+100*level;
const tens=(n:number)=>Math.max(10,Math.round(n/10)*10);
/** Rough potential DPS, not guaranteed damage: infantry assumes full garrison,
 * cannon splash 2.5 targets, flame splash 2, support a standard 8-DPS partner. */
export function ambushPrice(kind:StructureKind,levels:DefendSave['levels'],wear:{path?:PathId;rank?:number}={}) {
  let dps:number,range:number,durability=0,replacementMultiplier=1;
  if(TRAINS[kind]){
    const troop=troopStats(kind,levels),cap=soldierCap(levels.barracksCapacity);
    dps=cap*troop.damage/troop.cooldown;range=troop.range;durability=cap*troop.hp*.15;
    replacementMultiplier=1+Math.max(0,5/trainSeconds(levels.barracksTraining)-1)*.15;
  }else{
    const attack=towerStats(kind,levels);
    dps=kind==='watchTower'?8:attack.damage/attack.cooldown*(attack.splash>1?2.5:attack.splash>0?2:1);range=attack.range;
  }
  const upgradePremium=1+(wear.rank??0)*.2;
  return {cost:tens(upgradePremium*(40+12*dps*(1+Math.min(range,20)/20)*replacementMultiplier+durability)+Math.min(500,allocated(kind as Exclude<StructureKind,'keep'>,wear.path&&wear.rank?{path:wear.path,rank:wear.rank}:undefined)*.01)),dps,range,support:kind==='watchTower'};
}
/** Rewards use the enemy's actual spawned stats, so later waves and levels pay more.
 * Leaked enemies never call this payout; the killing hit awards it exactly once. */
export function enemyBounty(enemy:{maxHp:number;damage:number;cooldown:number;speed:number}) {
  const difficulty=enemy.maxHp/12+(enemy.damage/enemy.cooldown)/2+enemy.speed/1.2;
  return tens(4*difficulty);
}
