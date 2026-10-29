import test from 'node:test';import assert from 'node:assert/strict';
import {dpsProfiles,FORGE_BANDS,SIDE_GROUPS} from '../src/campaign/siege-dps-catalog.ts';
import {castleDps,defenderDps} from '../src/campaign/castle-dps.ts';
import {averageDps,inArea} from '../src/defend/average-dps.ts';
import {castleAtForge,castleSnapshot,castleGame} from '../src/campaign/castle-model.ts';
import {buildNativeCopy} from '../src/campaign/native-build.ts';
import {DPS_MIN,DPS_MAX,FLOOR_CASTLE,CEILING_CASTLE} from '../src/campaign/siege-ceiling.ts';
import {fitLayout} from '../src/defend/layout.ts';
import {buySide} from '../src/side-ranks.ts';
import {bonuses} from '../src/progression.ts';
import {archerCooldown,archerDamage,cannonCooldown,cannonDamage,cannonSplash,soldierCap,SOLDIER} from '../src/defend/catalog.ts';
/** Paths that trade damage for something else on purpose: knockback, and
 * the Hawk tower's slow shots that only pay off on a long focus. */
const TRADE_OFFS=new Set(['stoppingPower','sharpshooters']);
test('Average DPS reads the battle\'s own numbers',()=>{
 const game=castleAtForge(1,0),input={levels:game.defend.levels,bonuses:bonuses(game)};
 assert.equal(averageDps('archerTower',input),archerDamage(0)/archerCooldown(0));
 assert.equal(averageDps('cannonTower',input),cannonDamage(0)*inArea(cannonSplash(0))/cannonCooldown(0));
 assert.equal(averageDps('barracks',input),soldierCap(0)*SOLDIER.damage/SOLDIER.cooldown);
});
test('Every profile has a finite estimate at every Forge band, growing with the Forge and with path ranks',()=>{
 const profiles=dpsProfiles();let armed=0;
 for(const p of profiles){
  let prior=0;
  for(let band=0;band<FORGE_BANDS.length;band++){const v=defenderDps(p.kind,band,p.path,p.rank,p.side);assert.ok(Number.isFinite(v)&&v>=0,p.key);assert.ok(v>=prior-1e-9,p.key+' falls with the Forge');prior=v;}
  if(prior>0)armed++;
  if(p.path&&p.rank&&!TRADE_OFFS.has(p.path))assert.ok(defenderDps(p.kind,4,p.path,p.rank)>=defenderDps(p.kind,4,p.path,p.rank-1)-1e-9,p.key);
 }
 assert.ok(armed>profiles.length*.6);
});
test('Shared rank combinations are monotone in every branch',()=>{for(const group of SIDE_GROUPS)for(let band=0;band<5;band+=4){const walk=(i:number,ranks:Record<string,number>)=>{if(i===group.paths.length){const before=defenderDps(group.kind,band,undefined,0,ranks);for(const p of group.paths)if(ranks[p.id]<p.ranks.length)assert.ok(defenderDps(group.kind,band,undefined,0,{...ranks,[p.id]:ranks[p.id]+1})+1e-7>=before,group.kind);return;}const p=group.paths[i];for(let n=0;n<=p.ranks.length;n++)walk(i+1,{...ranks,[p.id]:n});};walk(0,{});}});
test('Ceiling witness and weakest armed castle obey native fit and upgrade rules',()=>{
 assert.equal(castleDps(FLOOR_CASTLE),DPS_MIN);assert.equal(castleDps(CEILING_CASTLE),DPS_MAX);assert.ok(DPS_MAX>DPS_MIN&&DPS_MIN>0);
 for(const castle of [FLOOR_CASTLE,CEILING_CASTLE]){assert.ok(fitLayout(castle.layout).ok);const game=castleAtForge(1,castle.forgeBand);for(const s of castle.layout.structures){const trace=[];const result=buildNativeCopy(game,s.kind,s.path?{path:s.path,rank:s.rank!}:undefined,trace);assert.equal(result.copy,s.kind);if(s.path)assert.deepEqual(result.wear,{path:s.path,rank:s.rank});}for(const group of SIDE_GROUPS)for(const p of group.paths)for(let i=0;i<((castle[group.key] as Record<string,number>|undefined)?.[p.id]??0);i++)assert.ok(buySide(game,group.key,group.paths,p.id).ok);}
});
test('Adding a defender or path rank never lowers a legal castle estimate',()=>{const castle=structuredClone(FLOOR_CASTLE);const before=castleDps(castle);castle.layout.structures.push({uid:3,kind:'archerTower',tx:6,ty:4,qx:25,qy:17});assert.ok(fitLayout(castle.layout).ok);assert.ok(castleDps(castle)>=before);const tower=castle.layout.structures.at(-1)!;tower.kind='brazierTower';let prior=castleDps(castle);for(let rank=1;rank<=3;rank++){tower.path='fireArrows';tower.rank=rank;const next=castleDps(castle);assert.ok(next>=prior);prior=next;}assert.deepEqual(castleSnapshot(castleGame(3,castle),castle.forgeBand),castle);});
test('The Shadow\'s growing edge is averaged over a fight, not left to run away',()=>{
 const low=defenderDps('shadow',4,undefined,0,{edge:0}),high=defenderDps('shadow',4,undefined,0,{edge:3});
 assert.ok(high>low);assert.ok(high<low*20,'one Shadow must not outweigh a whole castle');
});
test('Only native placed wall pieces earn trapped-wall damage',()=>{const c=structuredClone(FLOOR_CASTLE),base=castleDps(c);c.wallRanks={trapped:3};assert.equal(castleDps(c),base,'Automatic city walls do not carry the placed-wall trap tree');c.layout.walls=[{qx:4,qy:32}];assert.ok(fitLayout(c.layout).ok);assert.ok(castleDps(c)>base);});
