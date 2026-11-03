import { CampaignSim } from "../src/campaign/sim.ts";
import { generateCastle } from "../src/campaign/castles.ts";
import { nextSteps, upgradeBuilding } from "../src/specializations.ts";
import { tileTree } from "../src/tiles.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, decode } from '../src/save.ts';
import { realmActive, realmPower } from '../src/realm.ts';
import { placeCityTile, placeStructure, removeStructure } from '../src/defend/layout.ts';
import { equipmentCopy, syncEquipment } from '../src/equipment.ts';
import { startForge, settleForge, cancelForge } from '../src/forge-jobs.ts';
import { bonuses, startTraining, settleTraining } from '../src/progression.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { fitLayout } from '../src/defend/layout.ts';
import { DefendSim, type Enemy } from '../src/defend/sim.ts';
import { LibrarySim } from '../src/library/sim.ts';
import { SKILLS, skillCost } from '../src/skill-trees.ts';
import { UPGRADES, upgradePrice } from '../src/defend/catalog.ts';
function fixture(){
 const s=defaults();s.smithy.copper=10000;const k=s.defend.layout.keep;
 for(const [n,kind] of ['mine','library','watchTower','watchTower'].entries()){
  s.defend.layout=placeCityTile(s.defend.layout,k.tx+n+1,k.ty)!;
  s.defend.layout=placeStructure(s.defend.layout,kind as 'mine'|'library'|'watchTower',k.tx+n+1,k.ty)!;
 }
 s.defend.owned.watchTower=2;return s;
}
test('Mine and Library require city placement, not mere ownership; lifting pauses access',()=>{
 const s=defaults();assert.equal(s.defend.owned.mine,1);assert.equal(s.defend.owned.library,1);
 assert.equal(realmActive(s,'mine'),false);assert.equal(realmActive(s,'library'),false);
 const f=fixture();assert.ok(realmActive(f,'mine'));assert.ok(realmActive(f,'library'));
 const uid=f.defend.layout.structures.find(s=>s.kind==='mine')!.uid;
 f.defend.layout=removeStructure(f.defend.layout,uid);assert.equal(realmActive(f,'mine'),false);
 assert.ok(realmActive(decode(JSON.stringify(f)),'library'));
});
test('individual equipment is timed, survives reload/lift/replacement, and belongs to only one copy',()=>{
 const s=fixture(),a=equipmentCopy(s,'watchTower',0),b=equipmentCopy(s,'watchTower',1);
 assert.notEqual(a.id,b.id);assert.ok(startForge(s,{kind:'equipment',id:'power',equipment:b.id},'Ada',1000));
 assert.equal(b.power,0);assert.ok(settleForge(s,121000,new Set(['Ada'])));assert.equal(b.power,1);assert.equal(a.power,0);
 const restored=decode(JSON.stringify(s));assert.deepEqual(restored.equipment,s.equipment);
 const old=s.defend.layout,next=removeStructure(old,b.uid!);syncEquipment(s.equipment,next,old);s.defend.layout=next;
 assert.equal(b.uid,undefined);assert.equal(b.power,1);
 const k=old.keep,placed=placeStructure(next,'watchTower',k.tx+4,k.ty)!;
 syncEquipment(s.equipment,placed,next);s.defend.layout=placed;assert.ok(b.uid);assert.equal(b.power,1);
 assert.ok(startForge(s,{kind:'equipment',id:'hp',equipment:b.id},'Ada',122000));const paid=s.forgeJob!.paid.copper!;
 const before=s.smithy.copper;assert.ok(cancelForge(s));assert.equal(s.smithy.copper,before+paid);
});
test('palette equipment selections keep separate identities even before placement',()=>{
 const s=defaults();s.defend.owned.watchTower=3;
 const third=equipmentCopy(s,'watchTower',2),first=equipmentCopy(s,'watchTower',0);
 assert.notEqual(first.id,third.id);assert.equal(equipmentCopy(s,'watchTower',2).id,third.id);
 assert.equal(decode(JSON.stringify(s)).equipment?.length,2);
});
test('equipment modifies the selected building health and direct damage only',()=>{
 const s=fixture(),g=equipmentCopy(s,'watchTower',0);g.hp=2;g.power=4;
 const sim=new DefendSim(generateCity(fitLayout(s.defend.layout),11),s.defend.levels,3,bonuses(s));
 const [a,b]=sim.map.buildings.filter(b=>b.kind==='watchTower');assert.ok(Math.abs(sim.maxHp[a.id]/sim.maxHp[b.id]-1.1)<1e-6);
 const enemy=(id:number)=>({id,kind:'orc',hp:1000,maxHp:1000,x:1,y:1,cd:0,flash:0} as Enemy);
 const e1=enemy(1),e2=enemy(2);sim.hurtEnemy(e1,10,true,'ranged',{x:1,y:1,building:a.id});sim.hurtEnemy(e2,10,true,'ranged',{x:1,y:1,building:b.id});
 assert.ok(Math.abs((1000-e1.hp)/(1000-e2.hp)-1.2)<1e-6);
});
test('retired shared combat purchases and reserved work refund once, preserving crews and progress',()=>{
 const s=defaults();s.knowledge=50;s.skills.veterans=2;s.training.towerDamage=1;s.defend.levels.archerDamage=1;
 s.researchJob={kind:'skill',id:'fletchers',rank:0,left:10000,paid:3};
 s.trainingJobs=[{id:'troopDamage',left:10000,paid:7,smiths:['Ada']}];
 const back=decode(JSON.stringify(s));
 assert.equal(back.skills.veterans,0);assert.equal(back.training.towerDamage,0);assert.equal(back.defend.levels.archerDamage,0);
 assert.equal(back.knowledge,50+skillCost('veterans',0)+skillCost('veterans',1)+3);
 assert.equal(back.smithy.copper,s.smithy.copper+1+7+(UPGRADES.find(u=>u.id==='archerDamage')!.price??upgradePrice)(0).copper!);
 assert.equal(back.researchJob,null);assert.deepEqual(back.trainingJobs,[]);
 assert.deepEqual(decode(JSON.stringify(back)),back);
});
test('Realm smithy work improves miner and librarian efficiency and power in small ranks',()=>{
 const s=defaults();s.trainingClock=1;assert.ok(startTraining(s,'minerPower','Ada'));settleTraining(s,60001);
 assert.equal(realmPower(s,'minerPower'),1.02);assert.equal(realmPower(s,'librarianPower'),1);
 const lib=new LibrarySim(5);lib.furnish(4);lib.hire();const rate=lib.rate;lib.knowledgePower=1.2;assert.equal(lib.rate,rate*1.2);
});

test('palette equipment follows the selected copy through a Knowledge transformation',()=>{
 const s=defaults();s.knowledge=1e6;s.defend.owned.watchTower=2;
 const gear=equipmentCopy(s,'watchTower',1);gear.hp=3;
 const target=tileTree(s,'watchTower','watchTower#1')!;
 assert.ok('copy' in target);const step=nextSteps('watchTower').find(s=>s.type==='kind')??nextSteps('watchTower')[0];
 const result=upgradeBuilding(s,target as never,step);assert.ok(result.ok);
 assert.equal(gear.kind,result.kind);assert.equal(gear.hp,3);
});

test('Siege musters individual equipment under native army UIDs',()=>{
 const s=defaults();s.defend.owned.meleeGuild=2;
 const gear=equipmentCopy(s,'meleeGuild',1);gear.hp=10;gear.power=3;
 const siege=new CampaignSim('siege',0,[],s.defend.owned,s.defend.levels,generateCastle(1,600),s);
 assert.equal(siege.raid.attack.bonuses.equipment?.[100001]?.hp,1.5);
 assert.equal(siege.raid.attack.bonuses.equipment?.[100000],undefined);
});
test('retired compact upgrades preserve existing building footprints across reloads',()=>{
 const s=defaults(),k=s.defend.layout.keep;s.defend.owned.valkyriePalace=1;s.defend.levels.palaceCompact=1;
 s.defend.layout=placeCityTile(s.defend.layout,k.tx+1,k.ty)!;s.defend.layout.compact=['valkyriePalace'];
 s.defend.layout=placeStructure(s.defend.layout,'valkyriePalace',k.tx+1,k.ty)!;
 const back=decode(JSON.stringify(s));assert.equal(back.defend.levels.palaceCompact,0);
 assert.deepEqual(back.defend.legacyCompact,['valkyriePalace']);
 assert.deepEqual(decode(JSON.stringify(back)).defend.layout,back.defend.layout);
 assert.ok(fitLayout(back.defend.layout).ok);
});
