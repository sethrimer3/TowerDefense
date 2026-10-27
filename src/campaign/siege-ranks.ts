/** One data-driven ladder for players and opponents. Floors are inclusive. */
import { t } from '../i18n/index.ts';
import { INITIAL_MMR,MAX_MMR } from './siege-rating.ts';
export const RANKS=['bronze','silver','gold','platinum','diamond','master','grandmaster'] as const;
export type SiegeRank=typeof RANKS[number];
export const DIVISION_WIDTH=80;
export const DIVISIONS=['V','IV','III','II','I'] as const;
export const GM_ANCHOR=2720;
export function rankOf(mmr:number){
 const value=Math.max(0,Math.min(MAX_MMR,Math.round(Number.isFinite(mmr)?mmr:INITIAL_MMR)));
 const tier=Math.min(RANKS.length*DIVISIONS.length-1,Math.floor(value/DIVISION_WIDTH));
 const rankIndex=Math.floor(tier/DIVISIONS.length),divisionIndex=tier%DIVISIONS.length;
 const floor=tier*DIVISION_WIDTH,ceiling=tier===34?MAX_MMR:floor+DIVISION_WIDTH-1;
 return {rank:RANKS[rankIndex],rankIndex,division:DIVISIONS[divisionIndex],divisionIndex,tier,floor,ceiling,progress:Math.min(1,(value-floor)/(tier===34?MAX_MMR-floor:DIVISION_WIDTH))};
}
export function rankLabel(mmr:number){const r=rankOf(mmr);return t('siege.rankLabel',{rank:t(`siege.rank.${r.rank}`),division:r.division});}
