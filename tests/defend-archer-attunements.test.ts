import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { BOW_JAVELIN, SKYRANGER, SKIRMISH, pathById } from "../src/knowledge-paths.ts";
import { nextSteps, buildingTree, allocated, upgradeBuilding, respecBuilding, placedBattlePaths } from "../src/specializations.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { fitLayout, defaultLayout, placeCityTile, placeStructure } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { stepArcher, Barracks } from "../src/defend/troops.ts";
import { stepArrows } from "../src/defend/towers.ts";
import { stepEnemy } from "../src/defend/enemies.ts";
import { SUB, CELLS_W, CELLS_H, cellIndex } from "../src/defend/grid.ts";
import { looseBowJavelin, looseSkyArrow, skyArrowView } from "../src/defend/archer-attunements.ts";
import { ARCHER_UNIT } from "../src/defend/catalog.ts";
import { kindStats } from "../src/ui/specialty.ts";

function scene(kind:"archerBarracks"|"rangerLodge"|"skirmishCamp"|"skyrangerLodge"="archerBarracks",rank=0) {
  const sim=new DefendSim(generateCity(fitLayout(defaultLayout()),4),defaults().defend.levels,1);
  sim.enemies=[];sim.soldiers=[];sim.civilians=[];
  sim.solid.fill(0);sim.foeSolid.fill(0);sim.ownSolid.fill(0);
  const home=sim.map.buildings.length;
  sim.map.buildings.push({...sim.keep,id:home,kind,structureUid:42});
  const topic=kind==="rangerLodge"?"rangerLodge":kind==="skirmishCamp"?"skirmishCamp":"skyrangerLodge";
  const path=kind==="rangerLodge"?"rangers":kind==="skirmishCamp"?"skirmishers":"skyranger";
  sim.bonuses={...sim.bonuses,structurePaths:rank?{42:{[topic]:{path,rank}}}:{}};
  const u:Soldier={id:sim.newId(),kind:"archer",home,x:10.5,y:10.5,hp:100,maxHp:100,damage:10,cd:0,target:-1,path:[],thinkT:100,flash:0};
  sim.soldiers=[u];return {sim,u};
}
function enemy(sim:DefendSim,x:number,y=10.5,kind:Enemy["kind"]="orc") {
  const e:Enemy={id:sim.newId(),kind,x,y,hp:10000,maxHp:10000,cd:0,flash:0,jx:0,jy:0,distract:-1,distractT:0,rollT:0,marked:false};
  sim.enemies.push(e);sim.reindexAfterDisplacement();return e;
}
function fly(sim:DefendSim,seconds=4,dt=1/60){for(let t=0;t<seconds;t+=dt)stepArrows(sim,Math.min(dt,seconds-t));}

test("Archer Barracks offers exactly three attunements and retains existing ranks/refunds",()=>{
  assert.deepEqual(nextSteps("archerBarracks").map(s=>s.type==="become"?s.to:""),["rangerLodge","skirmishCamp","skyrangerLodge"]);
  for(const a of [{kind:"rangerLodge",path:"rangers"},{kind:"skirmishCamp",path:"skirmishers"},{kind:"skyrangerLodge",path:"skyranger"}] as const){
    assert.equal(nextSteps(a.kind)[0].type,"path");assert.equal(pathById(a.path).ranks.length,3);
    assert.ok(buildingTree("archerBarracks").some(n=>n.kind===a.kind));
  }
  const save=defaults();save.knowledge=1e6;save.defend.owned.rangedGuild=1;
  assert.ok(upgradeBuilding(save,{copy:"rangedGuild"},{type:"become",to:"archerBarracks",cost:0}).ok);
  assert.ok(upgradeBuilding(save,{copy:"archerBarracks"},{type:"become",to:"rangerLodge",cost:0}).ok);
  for(let rank=1;rank<=3;rank++)assert.ok(upgradeBuilding(save,{copy:"rangerLodge",...(rank>1?{wear:{path:"rangers" as const,rank:rank-1}}:{})},{type:"path",path:"rangers",rank,cost:0}).ok);
  const loaded=decode(JSON.stringify(save));
  assert.equal(loaded.defend.kept.find(k=>k.kind==="rangerLodge")?.rank,3);
  const target={copy:"rangerLodge" as const,wear:{path:"rangers" as const,rank:3}};
  assert.equal(allocated("rangerLodge",target.wear),5+3+pathById("rangers").ranks.reduce((n,r)=>n+r.cost,0));
  const before=loaded.knowledge;const result=respecBuilding(loaded,target);assert.ok(result.ok);assert.ok(loaded.knowledge>before);
});

test("Skirmishers fire exactly 1/3/5/7 arrows, spread evenly, retaining their cadence and mobility",()=>{
  for(let rank=0;rank<=3;rank++){
    const {sim,u}=scene("skirmishCamp",rank),a=enemy(sim,12),b=enemy(sim,13);
    stepArcher(sim,u,0);
    assert.equal(sim.arrows.length,SKIRMISH.arrows[rank]);
    const counts=[a,b].map(e=>sim.arrows.filter(a=>a.target===e.id).length);
    assert.ok(Math.abs(counts[0]-counts[1])<=1);
    assert.equal(u.cd,ARCHER_UNIT.cooldown*(rank?SKIRMISH.reload[rank]:SKIRMISH.camp));
    u.cd=0;sim.enemies=[a];sim.reindexAfterDisplacement();sim.arrows=[];stepArcher(sim,u,0);
    assert.equal(sim.arrows.length,SKIRMISH.arrows[rank],"one enemy still receives the full volley");
  }
  const {sim,u}=scene();enemy(sim,12);stepArcher(sim,u,0);assert.equal(sim.arrows.length,1);assert.equal(u.skyShots,undefined);
  const {sim:mobile,u:m}=scene("skirmishCamp",2);enemy(mobile,12);m.path=[cellIndex(11,10)];stepArcher(mobile,m,.1);assert.ok(m.x>10.5,"keeps moving while firing");
});

test("javelins carry a file progressively, damage each once, stop at the hit cap and release everyone",()=>{
  const {sim,u}=scene("rangerLodge");
  const a=enemy(sim,12.5),b=enemy(sim,15.5),c=enemy(sim,19.5);
  stepArcher(sim,u,0);const arrow=sim.arrows[0];
  assert.equal(u.cd,3);assert.equal(arrow.damage,60);
  fly(sim,.1);assert.ok(a.x>12.5);assert.ok(a.impaled!==undefined);assert.equal(b.x,15.5);
  const x=a.x;stepEnemy(sim,a,.1);assert.equal(a.x,x,"impaled enemy cannot walk or attack independently");
  fly(sim,3);
  assert.equal(a.hp,9940);assert.equal(b.hp,9940);assert.equal(c.hp,10000);
  assert.equal(arrow.bowJavelin!.hits.length,2);assert.equal(sim.arrows.length,0);
  assert.equal(a.impaled,undefined);assert.equal(b.impaled,undefined);
});

test("javelin push is 3/4/5/6 city tiles after impact, with dt-independent swept pickup",()=>{
  for(let rank=0;rank<=3;rank++)for(const dt of [1/60,.5,3]){
    const {sim,u}=scene("rangerLodge",rank),e=enemy(sim,12.5),x=e.x;
    looseBowJavelin(sim,u,e,10,8,rank);const a=sim.arrows[0];
    fly(sim,4,dt);
    assert.ok(Math.abs(e.x-x-BOW_JAVELIN.push[rank]*SUB)<.11,`${rank}/${dt}: ${e.x-x}`);
    assert.equal(e.impaled,undefined);assert.equal(a.bowJavelin!.hits.length,1);
  }
});

test("carried enemies and the shaft stop at walls/board edges, including a dead or removed carrier",()=>{
  const {sim,u}=scene("rangerLodge",1),e=enemy(sim,12.5);
  for(let y=0;y<CELLS_H;y++)sim.foeSolid[cellIndex(18,y)]=1;
  stepArcher(sim,u,0);fly(sim);assert.ok(e.x<18);assert.equal(e.impaled,undefined);
  const second=scene("rangerLodge",3),last=enemy(second.sim,CELLS_W-3);
  second.u.x=CELLS_W-5;looseBowJavelin(second.sim,second.u,last,10,8,3);fly(second.sim);
  assert.ok(last.x<CELLS_W);assert.equal(last.impaled,undefined);
  const dead=scene("rangerLodge"),victim=enemy(dead.sim,12.5);stepArcher(dead.sim,dead.u,0);fly(dead.sim,.2);victim.hp=0;dead.sim.enemies=[];fly(dead.sim);assert.equal(victim.impaled,undefined);
});

test("knockback/physical resistance and shields stop penetration without bypassing ordinary damage protection",()=>{
  for(const kind of ["warlord","darkKnight","duneTortoise","burrowingMole"] as const){
    const {sim,u}=scene("rangerLodge",2),front=enemy(sim,12.5,10.5,kind),back=enemy(sim,16.5),x=front.x;
    stepArcher(sim,u,0);fly(sim);
    assert.equal(front.x,x,kind);assert.equal(front.impaled,undefined);
    // Explosions can hit the enemy behind; the shaft itself never pierces it.
    assert.equal(back.impaled,undefined);
  }
  const {sim,u}=scene("rangerLodge"),shield=enemy(sim,12.5,10.5,"shieldBearer");
  shield.shieldHp=1000;(sim as unknown as {shieldGenerators:Enemy[]}).shieldGenerators=[shield];
  const back=enemy(sim,14);stepArcher(sim,u,0);fly(sim);
  assert.equal(shield.hp,10000);assert.equal(shield.x,12.5);assert.equal(back.hp,10000);assert.ok(shield.shieldHp<1000);
});

test("explosive javelins have no numeric cap, grow once per unique pierced enemy, and reindex displaced enemies",()=>{
  for(const count of [1,6]){
    const {sim,u}=scene("rangerLodge",2);const foes=Array.from({length:count},(_,i)=>enemy(sim,12.5+i*2));
    stepArcher(sim,u,0);const a=sim.arrows[0];fly(sim,4);
    assert.equal(a.bowJavelin!.hits.length,count);
    const blasts=sim.effects.filter(f=>f.kind==="boom");assert.equal(blasts.length,1);
    assert.ok(Math.abs(blasts[0].r-(1+.15*count)*SUB)<1e-9);
    assert.ok(foes.every(e=>e.hp<9940),"carried targets receive the final blast at their current position");
    assert.ok(foes.every(e=>sim.enemiesNear(e.x,e.y,.01).includes(e)),"queries see the new positions");
  }
});

test("Skyrangers reach the entire board with a vertical fade/hidden/descent path",()=>{
  const {sim,u}=scene("skyrangerLodge");const e=enemy(sim,CELLS_W-2,CELLS_H-2);
  stepArcher(sim,u,0);assert.equal(sim.arrows.length,1);const a=sim.arrows[0];assert.ok(a.sky);
  assert.deepEqual(skyArrowView(a),{x:u.x,y:u.y,alpha:1,up:true});
  stepArrows(sim,.1);assert.ok(skyArrowView(a)!.up);assert.ok(skyArrowView(a)!.alpha<1);
  stepArrows(sim,.15);assert.equal(skyArrowView(a),null);assert.equal(e.hp,10000);
  stepArrows(sim,.25);const down=skyArrowView(a)!;assert.equal(down.up,false);assert.equal(down.x,e.x);assert.ok(down.y<e.y);
  const reduced=skyArrowView(a,true)!;assert.equal(reduced.y,e.y);
  e.x--;stepArrows(sim,.2);assert.equal(e.hp,9990);assert.equal(a.tx,e.x);assert.equal(sim.arrows.length,0);
});

test("rain triggers every 10/7/5 ordinary shots, never recursively counts rain and final rank distributes every arrow",()=>{
  for(let rank=1;rank<=3;rank++){
    const {sim,u}=scene("skyrangerLodge",rank),e=enemy(sim,40,40);
    for(let i=1;i<SKYRANGER.every[rank];i++){looseSkyArrow(sim,u,e,10,rank);assert.equal(sim.arrows.filter(a=>a.sky?.rain).length,0);}
    looseSkyArrow(sim,u,e,10,rank);
    const rain=sim.arrows.filter(a=>a.sky?.rain);assert.equal(rain.length,SKYRANGER.arrows[rank]);assert.equal(u.skyShots,SKYRANGER.every[rank]);
    if(rank===3)assert.ok(rain.every(a=>a.target===e.id));
    else assert.ok(rain.every(a=>a.target===-1 && Math.hypot(a.tx-e.x,a.ty-e.y)<=SKYRANGER.radius[rank]*SUB+.001));
  }
  const {sim,u}=scene("skyrangerLodge",3),a=enemy(sim,40,40),b=enemy(sim,42,40),outside=enemy(sim,10,40);
  for(let i=0;i<5;i++)looseSkyArrow(sim,u,a,10,3);
  const rain=sim.arrows.filter(a=>a.sky?.rain);assert.equal(rain.filter(x=>x.target===a.id).length,14);assert.equal(rain.filter(x=>x.target===b.id).length,14);assert.equal(rain.filter(x=>x.target===outside.id).length,0);
  fly(sim,2);assert.equal(u.skyShots,5);assert.equal(sim.arrows.length,0);assert.equal(outside.hp,10000);
});

test("sky arrows retain landing points when targets die; new building catalog and training remain complete",()=>{
  const {sim,u}=scene("skyrangerLodge",3),e=enemy(sim,40,40);looseSkyArrow(sim,u,e,10,3);
  const a=sim.arrows[0];e.hp=0;fly(sim,2);assert.equal(sim.arrows.length,0);assert.deepEqual([a.x,a.y],[40,40]);
  let l=defaultLayout();l=placeCityTile(l,l.keep.tx,l.keep.ty-1)!;l=placeStructure(l,"skyrangerLodge",l.keep.tx,l.keep.ty-1)!;
  const battle=new DefendSim(generateCity(fitLayout(l),4),defaults().defend.levels,1);new Barracks().step(battle,.1);
  const home=battle.map.buildings.find(b=>b.kind==="skyrangerLodge")!;
  assert.ok(battle.soldiers.some(s=>s.home===home.id&&s.kind==="archer"));
  assert.match(kindStats(defaults(),"skyrangerLodge"),/unlimited range/);

});
