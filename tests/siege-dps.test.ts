import test from 'node:test';import assert from 'node:assert/strict';
import {siegeDpsInputs} from '../tools/siege-dps-inputs.ts';
import {ceilingInputHash} from '../tools/siege-dps-ceiling.ts';
import {SIEGE_DPS_INPUT_HASH,SIEGE_DPS_INPUT_FILES,SIEGE_DPS_TABLE,SIEGE_DPS_RAW} from '../src/campaign/siege-dps-table.ts';
import {dpsProfiles,FORGE_BANDS,SIDE_GROUPS} from '../src/campaign/siege-dps-catalog.ts';
import {castleDps,defenderDps} from '../src/campaign/castle-dps.ts';
import {castleAtForge,castleSnapshot,castleGame} from '../src/campaign/castle-model.ts';
import {buildNativeCopy} from '../src/campaign/native-build.ts';
import {DPS_MIN,DPS_MAX,FLOOR_CASTLE,CEILING_CASTLE,CEILING_INPUT_HASH} from '../src/campaign/siege-ceiling.ts';
import {fitLayout} from '../src/defend/layout.ts';
import {buySide} from '../src/side-ranks.ts';
test('Measured DPS catalog and ceiling cannot silently drift from their native source inputs',()=>{const input=siegeDpsInputs();assert.equal(input.hash,SIEGE_DPS_INPUT_HASH,'Run tools/measure-siege-dps.ts');assert.deepEqual(input.files,[...SIEGE_DPS_INPUT_FILES]);assert.equal(ceilingInputHash(),CEILING_INPUT_HASH,'Run tools/siege-dps-ceiling.ts');});
test('Every native profile has raw and monotone measurements at all Forge bands',()=>{
 const profiles=dpsProfiles();assert.equal(Object.keys(SIEGE_DPS_TABLE).length,profiles.length);let armed=0;
 for(const p of profiles){const row=SIEGE_DPS_TABLE[p.key],raw=SIEGE_DPS_RAW[p.key];assert.ok(row&&raw,p.key);for(const target of ['single','crowd'] as const){assert.equal(row[target].length,FORGE_BANDS.length);for(let band=0;band<5;band++){assert.ok(Number.isFinite(row[target][band])&&row[target][band]>=raw[target][band]);assert.ok(row[target][band]>=(band?row[target][band-1]:0));}}if(row.crowd[4]>0)armed++;if(p.path&&p.rank){assert.ok(defenderDps(p.kind,4,p.path,p.rank)>=defenderDps(p.kind,4,p.path,p.rank-1));}}
 assert.ok(armed>profiles.length*.6);
});
test('Shared rank combinations are monotone in every branch',()=>{for(const group of SIDE_GROUPS)for(let band=0;band<5;band++){const walk=(i:number,ranks:Record<string,number>)=>{if(i===group.paths.length){const before=defenderDps(group.kind,band,undefined,0,ranks);for(const p of group.paths)if(ranks[p.id]<p.ranks.length)assert.ok(defenderDps(group.kind,band,undefined,0,{...ranks,[p.id]:ranks[p.id]+1})+1e-7>=before,group.kind);return;}const p=group.paths[i];for(let n=0;n<=p.ranks.length;n++)walk(i+1,{...ranks,[p.id]:n});};walk(0,{});}});
test('Ceiling witness and weakest armed castle obey native fit and upgrade rules',()=>{
 assert.equal(castleDps(FLOOR_CASTLE),DPS_MIN);assert.equal(castleDps(CEILING_CASTLE),DPS_MAX);assert.ok(DPS_MAX>DPS_MIN&&DPS_MIN>0);
 for(const castle of [FLOOR_CASTLE,CEILING_CASTLE]){assert.ok(fitLayout(castle.layout).ok);const game=castleAtForge(1,castle.forgeBand);for(const s of castle.layout.structures){const trace=[];const result=buildNativeCopy(game,s.kind,s.path?{path:s.path,rank:s.rank!}:undefined,trace);assert.equal(result.copy,s.kind);if(s.path)assert.deepEqual(result.wear,{path:s.path,rank:s.rank});}for(const group of SIDE_GROUPS)for(const p of group.paths)for(let i=0;i<((castle[group.key] as Record<string,number>|undefined)?.[p.id]??0);i++)assert.ok(buySide(game,group.key,group.paths,p.id).ok);}
});
test('Adding a defender or path rank never lowers a legal castle estimate',()=>{const castle=structuredClone(FLOOR_CASTLE);const before=castleDps(castle);castle.layout.structures.push({uid:3,kind:'archerTower',tx:6,ty:4,qx:25,qy:17});assert.ok(fitLayout(castle.layout).ok);assert.ok(castleDps(castle)>=before);const tower=castle.layout.structures.at(-1)!;tower.kind='hawkTower';let prior=castleDps(castle);for(let rank=1;rank<=3;rank++){tower.path='sharpshooters';tower.rank=rank;const next=castleDps(castle);assert.ok(next>=prior);prior=next;}assert.deepEqual(castleSnapshot(castleGame(3,castle),castle.forgeBand),castle);});
