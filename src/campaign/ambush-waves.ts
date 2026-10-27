/** One tunable zone/level/wave budget table; native rosters reserve all offspring. */
import { ENEMIES,type EnemyKind } from '../defend/catalog.ts';
import { AREA_ENEMIES } from '../defend/area-enemies.ts';
import { buildDifficultyWave } from '../defend/waves.ts';
import { hash } from '../defend/grid.ts';
import { intPow } from '../exact.ts';
import { seeded } from './castles.ts';
import type { AmbushLevel } from './levels.ts';
export const AMBUSH_WAVES={count:20,zoneBudget:[8,18,28,36,46,60,75,90,180,140],levelGrowth:.2,waveGrowth:1.08,spawnGap:.7,breakSeconds:3} as const;
export function ambushWave(level:AmbushLevel,wave:number){
 const budget=Math.round(AMBUSH_WAVES.zoneBudget[level.zone]*(1+level.index*AMBUSH_WAVES.levelGrowth)*intPow(AMBUSH_WAVES.waveGrowth,Math.max(0,wave-1)));
 const roster=AREA_ENEMIES[level.area],rand=seeded(hash(level.seed,wave,0xa6b));
 const boss=wave===10||wave===20?[...roster].filter(k=>!ENEMIES[k].hatched&&ENEMIES[k].cost<=budget).sort((a,b)=>ENEMIES[b].cost-ENEMIES[a].cost||ENEMIES[b].hp-ENEMIES[a].hp||(a<b?-1:a>b?1:0))[0]:undefined;
 const kinds=boss?[boss,...buildDifficultyWave(budget-ENEMIES[boss].cost,rand,roster)]:buildDifficultyWave(budget,rand,roster);
 return {budget,kinds,fliers:waveHasFliers(kinds),...(boss?{boss}:{})};
}
export const waveHasFliers=(kinds:readonly EnemyKind[])=>kinds.some(k=>!!ENEMIES[k].flying);
