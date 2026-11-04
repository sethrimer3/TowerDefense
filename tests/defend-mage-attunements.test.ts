import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { CONDUCTION, CRYOMANCY, PYROCLASM, pathById } from "../src/knowledge-paths.ts";
import { nextSteps, fullTree, upgradeBuilding, undoUpgrade } from "../src/specializations.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { CellType, generateCity } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout, placeCityTile, placeStructure } from "../src/defend/layout.ts";
import { FIRE_MAGE, fireballDamage, fireballSplash, emberDps, emberSeconds } from "../src/defend/catalog.ts";
import { stepMage, stepFireballs, stepBlazes } from "../src/defend/mages.ts";
import { ageMageChill, chillByMage, mageAttunement, mageChillSpeed } from "../src/defend/mage-attunements.ts";
import { chilled } from "../src/defend/wizard.ts";
import { quench } from "../src/defend/fire-ice.ts";
import { Barracks } from "../src/defend/troops.ts";
import { bonuses } from "../src/progression.ts";
import { kindStats } from "../src/ui/specialty.ts";
import { structurePixels } from "../src/defend/tower-art.ts";

type Kind = "mageGuild" | "infernoHall" | "cinderHall" | "stormHall";
function scene(kind: Kind = "mageGuild", rank = 0) {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 4), defaults().defend.levels, 1);
  sim.enemies=[];sim.soldiers=[];sim.civilians=[];sim.solid.fill(0);sim.ownSolid.fill(0);sim.foeSolid.fill(0);sim.map.type.fill(CellType.STREET);
  const home=sim.map.buildings.length,b={...sim.keep,id:home,kind,structureUid:42};sim.map.buildings.push(b);
  const path=kind==="infernoHall"?"pyroclasm":kind==="cinderHall"?"cinders":"conduction";
  sim.bonuses={...sim.bonuses,structurePaths:rank?{42:{[kind]:{path,rank}}}:{}};
  const u: Soldier={id:sim.newId(),kind:"mage",home,x:10,y:20,hp:22,maxHp:22,damage:16,cd:0,target:-1,path:[],thinkT:100,flash:0};
  sim.soldiers=[u];return {sim,u,b};
}
function enemy(sim:DefendSim,x:number,y=20,kind:Enemy["kind"]="orc") {
  const e:Enemy={id:sim.newId(),kind,x,y,hp:10000,maxHp:10000,cd:0,jx:0,jy:0,distract:-1,distractT:0,rollT:0,marked:false,flash:0};
  sim.enemies.push(e);sim.reindexAfterDisplacement();return e;
}
function land(sim:DefendSim){stepFireballs(sim,5);}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test("Mage Guild has three behavior-changing attunements, preserving old ranks and enabling Storm purchases/undo",()=>{
  assert.deepEqual(nextSteps("mageGuild").map(s=>s.type==="become"&&s.to),["infernoHall","cinderHall","stormHall"]);
  for(const path of ["pyroclasm","cinders","conduction"] as const){assert.equal(pathById(path).ranks.length,3);assert.ok(fullTree("rangedGuild").some(n=>n.id===`p:${path}:3`));}
  const s=defaults();s.knowledge=1e6;s.defend.owned.mageGuild=1;
  assert.ok(upgradeBuilding(s,{copy:"mageGuild"},nextSteps("mageGuild")[2]).ok);
  for(let rank=1;rank<=3;rank++)assert.ok(upgradeBuilding(s,{copy:"stormHall",...(rank>1?{wear:{path:"conduction" as const,rank:rank-1}}:{})},nextSteps("stormHall",rank>1?{path:"conduction",rank:rank-1}:undefined)[0]).ok);
  let loaded=decode(JSON.stringify(s));assert.equal(loaded.defend.owned.stormHall,1);assert.deepEqual(loaded.defend.kept,s.defend.kept);
  assert.ok(undoUpgrade(loaded,{copy:"stormHall",wear:{path:"conduction",rank:3}},"p:conduction:3").ok);
  assert.equal(loaded.defend.kept[0].rank,2);
  const old=defaults();old.defend.owned.cinderHall=1;old.defend.kept=[{kind:"cinderHall",path:"cinders",rank:3}];
  loaded=decode(JSON.stringify(old));assert.equal(loaded.defend.kept[0].rank,3);assert.equal(loaded.defend.kept[0].kind,"cinderHall");
  assert.match(kindStats(loaded,"cinderHall","cinders",3),/65% slow.*1s freeze/);
  assert.match(kindStats(loaded,"stormHall","conduction",3),/15 range.*8 enemies.*35%/);
});

test("Storm Hall recruits mages through normal per-home snapshots and has its own procedural hall",()=>{
  const s=defaults();s.defend.owned.stormHall=1;
  let l=defaultLayout();l=placeCityTile(l,l.keep.tx,l.keep.ty-1)!;l=placeStructure(l,"stormHall",l.keep.tx,l.keep.ty-1)!;s.defend.layout=l;
  const sim=new DefendSim(generateCity(fitLayout(l),4),s.defend.levels,1,bonuses(s));new Barracks().step(sim,0);
  const u=sim.soldiers.find(u=>sim.map.buildings[u.home].kind==="stormHall")!;
  assert.equal(u.kind,"mage");assert.equal(u.damage,fireballDamage(0));assert.equal(mageAttunement(sim,u.home).range,9);
  assert.notDeepEqual(structurePixels("stormHall",4,6,0,42),structurePixels("mageGuild",4,6,0,42));
  assert.notDeepEqual(structurePixels("cinderHall",4,6,0,42),structurePixels("infernoHall",4,6,0,42));
});

test("Stormcallers increase range, distinct targets, jump distance and critical chance at every tier",()=>{
  for(let rank=0;rank<=3;rank++){
    const {sim,u}=scene("stormHall",rank);(sim as any).rand=()=>.99;
    const enemies=[];for(let i=0;i<10;i++)enemies.push(enemy(sim,10+CONDUCTION.range[rank]+i*2.9));
    stepMage(sim,u,0);assert.equal(sim.fireballs.length,0);assert.equal(sim.blazes.length,0);assert.equal(u.cd,FIRE_MAGE.cooldown);
    const bolt=sim.mageBolts[0];assert.equal(bolt.pts.length-1,CONDUCTION.targets[rank]);
    assert.equal(new Set(bolt.pts.slice(1).map(p=>p.x)).size,CONDUCTION.targets[rank]);
    close(enemies[0].maxHp-enemies[0].hp,16);close(enemies[1].maxHp-enemies[1].hp,16*.85);
    assert.equal(enemies[CONDUCTION.targets[rank]].hp,10000);
    const far=scene("stormHall",rank);enemy(far.sim,10+CONDUCTION.range[rank]+.01);stepMage(far.sim,far.u,0);assert.equal(far.sim.mageBolts.length,0);
    assert.ok(CONDUCTION.crit[rank]>=(rank?CONDUCTION.crit[rank-1]:.1));
  }
});

test("Lightning stops at jump gaps and can continue beyond initial range without re-hitting",()=>{
  const {sim,u}=scene("stormHall");(sim as any).rand=()=>.99;
  const a=enemy(sim,19),b=enemy(sim,22),c=enemy(sim,25.1);
  stepMage(sim,u,0);assert.equal(sim.mageBolts[0].pts.length,3);assert.ok(a.hp<10000&&b.hp<10000);assert.equal(c.hp,10000);
});

test("Critical rolls are independent per real hit and never compound damage into later links",()=>{
  const {sim,u}=scene("stormHall"),a=enemy(sim,12),b=enemy(sim,14),c=enemy(sim,16);
  let calls=0;const rolls=[0,.9,0];(sim as any).rand=()=>rolls[calls++];
  stepMage(sim,u,0);assert.equal(calls,3);assert.deepEqual(sim.mageBolts[0].critical,[true,false,true]);
  close(10000-a.hp,32);close(10000-b.hp,16*.85);close(10000-c.hp,16*.85*.85*2);
  const none=scene("stormHall");let emptyCalls=0;(none.sim as any).rand=()=>{emptyCalls++;return 0;};stepMage(none.sim,none.u,0);assert.equal(emptyCalls,0);
});

test("Plain mages retain ordinary cadence, projectiles, RNG and target state",()=>{
  const {sim,u}=scene();let calls=0;(sim as any).rand=()=>{calls++;return .5;};enemy(sim,13);
  stepMage(sim,u,0);assert.equal(calls,0);assert.equal(u.target,-1);assert.equal(sim.mageBolts.length,0);
  const f=sim.fireballs[0];assert.equal(f.fire,undefined);assert.equal(f.frost,undefined);assert.equal(f.damage,16);assert.equal(f.r,1.3);
  land(sim);assert.equal(sim.blazes[0].life,3);assert.equal(sim.blazes[0].dps,6);assert.equal(sim.blazes[0].r,1.3*.85);
});

test("Pyromancer tiers grow impact, full burning area, duration, and clinging damage together",()=>{
  for(let rank=0;rank<=3;rank++){
    const {sim,u}=scene("infernoHall",rank),e=enemy(sim,13),air=enemy(sim,13.2,20,"bat");
    stepMage(sim,u,0);const f=sim.fireballs[0];close(f.damage,16*PYROCLASM.damage[rank]);close(f.r,1.3*PYROCLASM.radius[rank]);
    sim.soldiers=[];land(sim);const b=sim.blazes[0];assert.equal(b.r,f.r);close(b.life,3*PYROCLASM.life[rank]);close(b.dps,6*PYROCLASM.damage[rank]);
    assert.equal(e.burn,PYROCLASM.cling[rank]);assert.equal(air.burn,PYROCLASM.cling[rank]);assert.equal(air.burnDps,b.dps);
    const walker=enemy(sim,13.4);stepBlazes(sim,.1);assert.equal(walker.burn,PYROCLASM.cling[rank]);close(walker.burnDps!,b.dps);
    assert.equal(sim.effects.filter(f=>f.kind==="boom").length,1,"no old side explosions");
  }
});

test("Fire refresh keeps the hotter burn instead of multiplying duplicate clinging statuses",()=>{
  const {sim,u}=scene("infernoHall",3),e=enemy(sim,13);stepMage(sim,u,0);land(sim);
  e.burn=10;e.burnDps=100;stepBlazes(sim,.1);assert.equal(e.burn,10);assert.equal(e.burnDps,100);
  const b=sim.blazes[0];e.x=60;sim.reindexAfterDisplacement();stepBlazes(sim,.1);assert.equal(e.burnDps,100);assert.equal(b.clingFor,4);
});

test("Fire Forge bonuses are captured per cast and effects survive home/caster changes",()=>{
  const {sim,u,b}=scene("infernoHall",2);sim.levels.mageEmbers=3;sim.levels.mageFireball=2;sim.bonuses.troopDamage=2;u.damage=fireballDamage(2)*2;
  const e=enemy(sim,13);stepMage(sim,u,0);const f=sim.fireballs[0];
  close(f.damage,u.damage*1.8);close(f.r,fireballSplash(2)*1.5);close(f.fire!.dps,emberDps(3)*2*1.8);close(f.fire!.life,emberSeconds(3)*6.5/3);
  b.kind="cinderHall";sim.soldiers=[];land(sim);assert.equal(sim.blazes[0].dps,f.fire!.dps);assert.equal(e.burn,3);
});

test("Cryomancer tiers freeze and slow an area, including fliers, with no fire or spell research effects",()=>{
  for(let rank=0;rank<=3;rank++){
    const {sim,u}=scene("cinderHall",rank),e=enemy(sim,13),air=enemy(sim,13.1,20,"bat");
    stepMage(sim,u,0);const f=sim.fireballs[0];assert.equal(f.damage,12);close(f.r,1.3*CRYOMANCY.radius[rank]);
    land(sim);assert.equal(sim.blazes.length,0);assert.equal(sim.mageBolts.length,0);assert.equal(e.freeze,CRYOMANCY.freeze[rank]);assert.equal(air.freeze,CRYOMANCY.freeze[rank]);
    assert.equal(chilled(e),0);delete e.freeze;close(chilled(e),CRYOMANCY.speed[rank]);
    assert.equal(e.mageChills![0].left,CRYOMANCY.chill[rank]);assert.equal(e.brittle,undefined);assert.ok(sim.frostBursts.every(b=>b.hit));
  }
});

test("Mage chills use strongest active strength, refresh by max, and reveal weaker remaining effects",()=>{
  const {sim}=scene(),e=enemy(sim,13);
  chillByMage(e,.5,5,.2);chillByMage(e,.35,2,1);chillByMage(e,.35,1,.5);
  assert.equal(e.mageChills!.length,2);assert.equal(e.freeze,1);assert.equal(mageChillSpeed(e),.35);
  ageMageChill(e,2.1);delete e.freeze;close(chilled(e),.5);assert.equal(e.mageChills!.length,1);
  e.chill=10;ageMageChill(e,3);assert.equal(e.mageChills,undefined);close(chilled(e),.5);
});

test("Freeze/slow immunity and water shields remain effective; fire cancels all mage chill strengths",()=>{
  const {sim,u}=scene("cinderHall",3),immune=enemy(sim,13,20,"darkKnight");stepMage(sim,u,0);land(sim);
  assert.equal(immune.freeze,undefined);assert.equal(immune.mageChills,undefined);assert.equal(chilled(immune),1);
  const e=enemy(sim,14);chillByMage(e,.5,5,.2);chillByMage(e,.35,2,1);e.burn=2;e.burnDps=5;quench(sim);
  assert.equal(e.mageChills,undefined);assert.equal(e.freeze,undefined);assert.equal(e.burn,undefined);
  const wet=scene("infernoHall");enemy(wet.sim,13);stepMage(wet.sim,wet.u,0);wet.sim.floods.push({x:13,y:20,r:3,t:0,life:10,boat:-1});land(wet.sim);assert.equal(wet.sim.blazes.length,0);
});

test("Mixed mage homes read their own snapshots; storm research never gives frost/fire critical rolls",()=>{
  const {sim,u}=scene("stormHall",3),frostHome=sim.map.buildings.length;sim.map.buildings.push({...sim.map.buildings[u.home],id:frostHome,kind:"cinderHall",structureUid:43});
  sim.bonuses.structurePaths![43]={cinderHall:{path:"cinders",rank:1}};
  const cold={...u,home:frostHome,id:sim.newId()},e=enemy(sim,13);let calls=0;(sim as any).rand=()=>{calls++;return .99;};
  stepMage(sim,u,0);assert.equal(calls,1);stepMage(sim,cold,0);assert.equal(calls,1);assert.equal(sim.fireballs[0].frost?.speed,.45);
  land(sim);assert.equal(e.freeze,.5);assert.equal(sim.mageBolts[0].pts.length,2);
});
