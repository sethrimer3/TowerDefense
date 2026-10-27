import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSim } from '../src/campaign/sim.ts';
import { DefendSim } from '../src/defend/sim.ts';
import { defaults } from '../src/save.ts';
import { generateCastle } from '../src/campaign/castles.ts';
import { STRUCTURES } from '../src/defend/catalog.ts';
import { center } from '../src/defend/pathing.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';

test('Ambush is a native DefendSim and its specialized arrow payloads match Defend exactly',()=>{
 const save=defaults();save.defend.owned.brazierTower=1;
 save.defend.layout.structures.push({uid:900,kind:'brazierTower',tx:4,ty:9,qx:16,qy:36,path:'fireArrows',rank:3});
 const mode=new CampaignSim('ambush',0,[],save.defend.owned,save.defend.levels,undefined,save);
 assert.ok(mode.engine instanceof DefendSim);assert.ok(mode.place(0,'brazierTower'));
 const home=mode.map.buildings.find(b=>!b.hidden&&b.kind==='brazierTower')!;
 assert.equal(home.rect.w,STRUCTURES.brazierTower.w);assert.equal(home.rect.h,STRUCTURES.brazierTower.h);
 assert.ok(mode.engine.bonuses.structurePaths?.[home.structureUid!]);
 const reference=new DefendSim(mode.map,{...mode.engine.levels},12345,mode.engine.bonuses);
 reference.scenario={manualWaves:true,passiveEnemies:true,noCivilians:true,ignoreKeepLoss:true};
 mode.engine.scenario={...mode.engine.scenario,passiveEnemies:true};
 const p=center(home.rect);for(const sim of [mode.engine,reference]){sim.wave=1;sim.spawnAuxiliary('ogre',p.x+5,p.y);sim.step(1/30);}
 assert.ok(mode.engine.arrows.length>0);assert.deepEqual(mode.engine.arrows,reference.arrows);
 assert.ok(mode.engine.arrows.every(a=>(a.burn??0)>0));
});
test('Native Wisp arrows, wizard flames and cannon shells are produced by the campaign',()=>{
 for(const kind of ['wispTower','wizardTower','cannonTower'] as const){
  const save=defaults();save.defend.owned[kind]=1;
  const mode=new CampaignSim('ambush',0,[],save.defend.owned,save.defend.levels,undefined,save);mode.gold=10000;assert.ok(mode.place(0,kind));
  mode.engine.scenario={...mode.engine.scenario,passiveEnemies:true};
  const b=mode.map.buildings.find(b=>b.kind===kind&&!b.hidden)!,p=center(b.rect);mode.engine.spawnAuxiliary('ogre',p.x+(kind==='wizardTower'?3:5),p.y);
  mode.engine.wave=1;let seen=false;for(let n=0;n<30;n++){mode.engine.step(1/30);seen ||= kind==='wispTower'?mode.engine.wisps.length>0:kind==='wizardTower'?mode.engine.flames.length>0:mode.engine.shells.length>0;}
  assert.ok(seen,kind);
 }
});
test('Route rules keep actual Defend enemies and kills/leaks have distinct native outcomes',()=>{
 const save=defaults(),mode=new CampaignSim('ambush',0,[],save.defend.owned,save.defend.levels,undefined,save);
 mode.gold=1000;assert.ok(mode.place(0,'meleeGuild'));mode.start();
 const e=mode.engine.spawnAuxiliary('roach',mode.plan.path[0].x,mode.plan.path[0].y)!;const gold=mode.gold;
 mode.engine.hurtEnemy(e,e.hp*2);mode.engine.step(1/30);assert.equal(mode.kills,1);assert.ok(mode.gold>gold);assert.equal(mode.engine.slain.roach,1);
 const end=mode.plan.path.at(-1)!,leak=mode.engine.spawnAuxiliary('roach',end.x,end.y)!;
 const afterKill=mode.gold;mode.engine.step(1/30);mode.engine.step(1/30);assert.ok(leak.escaped);assert.equal(mode.lives,4);assert.equal(mode.gold,afterKill);assert.equal(mode.kills,1);
});
test('Siege uses two native sides, real city walls, full infantry copies and their saved paths',()=>{
 const save=defaults();save.defend.owned.meleeGuild=7;save.defend.owned.rangedGuild=6;save.defend.owned.phalanx=2;
 save.defend.layout.structures.push({uid:901,kind:'phalanx',tx:4,ty:9,qx:16,qy:36,path:'spearWall',rank:1});
 const before=JSON.stringify(save.defend),mode=new CampaignSim('siege',0,[],save.defend.owned,save.defend.levels,generateCastle(45,600),save);
 assert.ok(mode.raid!.attack instanceof DefendSim);assert.ok(mode.raid!.defense instanceof DefendSim);
 assert.equal(mode.layout.length,15);assert.ok(mode.map.buildings.some(b=>b.kind==='wall'));assert.ok(mode.map.buildings.some(b=>b.kind==='gate'));assert.ok(mode.map.buildings.some(b=>b.kind==='house'));
 mode.start();mode.step(1/30);assert.equal(new Set(mode.allies.map(s=>s.home)).size,15);
 assert.ok(mode.allies.every(s=>s.y>=58));assert.ok(mode.raid!.defense.soldiers.every(s=>s.y<55));assert.equal(JSON.stringify(save.defend),before);
});
test('Siege attacks collapse real native walls, synchronize collision and use native defender mitigation',()=>{
 const save=defaults();save.defend.owned.phalanx=1;
 const mode=new CampaignSim('siege',0,[],save.defend.owned,save.defend.levels,generateCastle(45,600),save);mode.start();mode.step(1/30);
 const raid=mode.raid!,wall=mode.map.buildings.find(b=>b.kind==='wall')!,proxy=raid.attack.enemies.find(e=>e.id===10000000+wall.id)!;
 assert.ok(proxy.raidBuilding);raid.attack.hurtEnemy(proxy,proxy.maxHp*2);assert.equal(raid.defense.hp[wall.id],0);assert.ok(wall.cells.every(c=>raid.attack.solid[c]===0));
 const hoplite=raid.attack.soldiers.find(s=>s.kind==='hoplite')!,target=raid.defense.enemies.find(e=>e.id===hoplite.id)!;
 const cloned={...hoplite,path:[...hoplite.path]},before=hoplite.hp;
 raid.attack.hurtDefender(cloned,10);raid.defense.hurtEnemy(target,10);
 assert.equal(before-hoplite.hp,before-cloned.hp);
});
test('Native infantry can march from muster, breach a generated castle and destroy its keep',()=>{
 const d=defaultDefendSave();d.owned.meleeGuild=4;d.owned.rangedGuild=4;
 const mode=new CampaignSim('siege',0,[],d.owned,d.levels,generateCastle(45,600));
 const walls=mode.map.buildings.filter(b=>b.kind==='wall');assert.ok(mode.start());
 for(let n=0;n<7500&&mode.phase==='battle';n++)mode.step(1/30);
 assert.equal(mode.phase,'won');assert.equal(mode.raid!.defense.keepHp(),0);
 assert.ok(walls.some(b=>mode.raid!.defense.hp[b.id]===0));
});
