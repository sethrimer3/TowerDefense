/** One tunable zone/level/wave budget table; native rosters reserve all offspring. */
import { ENEMIES,type EnemyKind } from '../defend/catalog.ts';
import { AREA_ENEMIES } from '../defend/area-enemies.ts';
import { buildDifficultyWave } from '../defend/waves.ts';
import { hash } from '../defend/grid.ts';
import { intPow } from '../exact.ts';
import { seeded } from './castles.ts';
import type { AmbushLevel } from './levels.ts';
export const AMBUSH_WAVES={count:20,zoneBudget:[16,22,32,40,50,65,80,100,125,160],levelGrowth:.2,waveGrowth:1.08,spawnGap:.7,breakSeconds:3} as const;
export function ambushWave(level:AmbushLevel,wave:number){
 const budget=Math.round(AMBUSH_WAVES.zoneBudget[level.zone]*(1+level.index*AMBUSH_WAVES.levelGrowth)*intPow(AMBUSH_WAVES.waveGrowth,Math.max(0,wave-1)));
 const kinds=buildDifficultyWave(budget,seeded(hash(level.seed,wave,0xa6b)),AREA_ENEMIES[level.area]);
 return {budget,kinds,fliers:waveHasFliers(kinds)};
}
export const waveHasFliers=(kinds:readonly EnemyKind[])=>kinds.some(k=>!!ENEMIES[k].flying);
