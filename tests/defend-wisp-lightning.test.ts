import {test} from "node:test";
import assert from "node:assert/strict";
import {defaults,decode} from "../src/save.ts";
import {DefendSim,type Enemy} from "../src/defend/sim.ts";
import {CellType,generateCity} from "../src/defend/citygen.ts";
import {defaultLayout,fitLayout} from "../src/defend/layout.ts";
import {archerDamage} from "../src/defend/catalog.ts";
import {CELLS_W,CELLS_H} from "../src/defend/grid.ts";
import {Towers} from "../src/defend/towers.ts";
import {wispMapRay} from "../src/defend/wisp-lightning.ts";
import {wispLightningPoints} from "../src/defend/wisp-lightning-art.ts";
import {wispArrowScale} from "../src/defend/wisp-core-art.ts";
import {WISP_LIGHTNING,pathById} from "../src/knowledge-paths.ts";
import {nextSteps,upgradeBuilding,undoUpgrade,allocated} from "../src/specializations.ts";
import {kindStats} from "../src/ui/specialty.ts";

function scene(rank=3,only=true) {
 const sim=new DefendSim(generateCity(fitLayout(defaultLayout()),4),defaults().defend.levels,1);
 sim.enemies=[];sim.soldiers=[];sim.civilians=[];sim.solid.fill(0);sim.foeSolid.fill(0);sim.ownSolid.fill(0);sim.map.type.fill(CellType.ROAD);
 const b={...sim.keep,kind:"wispTower" as const,rect:{x:19,y:19,w:2,h:2},structureUid:42};sim.map.buildings[b.id]=b;
 sim.bonuses={...sim.bonuses,structurePaths:rank?{42:{wispTower:{path:"wispArrow",rank}}}:{}};
 const t=new Towers();t.step(sim,0);const owner=sim.wispOwners.get(b.id)!,pool=owner.lightning;
 if(only){owner.arrows=[];owner.capacity=0;delete owner.fire;sim.wisps=sim.wisps.filter(w=>w.lightning);}
 return{sim,b,t,owner,pool,w:pool?.arrows[0]};
}
function enemy(sim:DefendSim,x:number,y:number,kind:Enemy["kind"]="orc") {
 const e:Enemy={id:sim.newId(),kind,x,y,hp:1e6,maxHp:1e6,cd:0,flash:0,jx:0,jy:0,distract:-1,distractT:0,rollT:0,marked:false};
 sim.enemies.push(e);sim.reindexAfterDisplacement();return e;
}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const clear=(s:ReturnType<typeof scene>)=>{s.sim.enemies=[];s.sim.reindexAfterDisplacement();};
function launch(s:ReturnType<typeof scene>) {
 const w=s.w!;w.x=20;w.y=20;enemy(s.sim,25,20);s.t.step(s.sim,0);return w.ray!;
}

test("Lightning arrow is the final rank III, with the normal price, saved tier and exact refund",()=>{
 assert.equal(pathById("wispArrow").ranks.length,3);
 const save=defaults();save.knowledge=20000;save.defend.owned.wispTower=1;
 save.defend.kept=[{kind:"wispTower",path:"wispArrow",rank:2}];
 const target={copy:"wispTower" as const,wear:{path:"wispArrow" as const,rank:2}};
 assert.deepEqual(nextSteps("wispTower",target.wear),[{type:"path",path:"wispArrow",rank:3,cost:16004}]);
 assert.ok(upgradeBuilding(save,target,nextSteps("wispTower",target.wear)[0]).ok);
 const loaded=decode(JSON.stringify(save));assert.equal(loaded.knowledge,3996);
 assert.deepEqual(loaded.defend.kept,[{kind:"wispTower",path:"wispArrow",rank:3}]);
 assert.equal(allocated("wispTower",{path:"wispArrow",rank:3}),20018);
 assert.deepEqual(nextSteps("wispTower",{path:"wispArrow",rank:3}),[]);
 assert.match(kindStats(loaded,"wispTower","wispArrow",3),/purple Lightning arrow.*map edge.*5s.*300% attack.*9s/);
 assert.ok(undoUpgrade(loaded,{copy:"wispTower",wear:{path:"wispArrow",rank:3}},"p:wispArrow:3").ok);
 assert.equal(loaded.knowledge,20000);assert.equal(loaded.defend.kept[0].rank,2);
});

test("Rank III adds exactly one purple arrow to the three blue and two larger fire arrows",()=>{
 for(const rank of[0,1,2])assert.equal(scene(rank,false).pool,undefined);
 const s=scene(3,false);assert.equal(s.owner.arrows.length,3);assert.equal(s.owner.fire!.arrows.length,2);
 assert.equal(s.pool!.capacity,1);assert.equal(s.pool!.arrows.length,1);close(s.pool!.refill,0);
 assert.equal(new Set(s.sim.wisps.map(w=>`${w.x},${w.y}`)).size,6);
 close(wispArrowScale(s.owner.fire!.arrows[0])/wispArrowScale(s.owner.arrows[0]),1.25);
 assert.ok(wispArrowScale(s.w!)>wispArrowScale(s.owner.fire!.arrows[0]));
});

test("Map rays meet the true rectangular map boundary in every direction, including coincident aims",()=>{
 const from={x:20,y:20};
 for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],[0,0]]) {
  const ray=wispMapRay(from,{x:20+dx,y:20+dy}),p=ray.b;
  assert.ok(p.x===0||p.x===CELLS_W||p.y===0||p.y===CELLS_H);
  assert.ok(p.x>=0&&p.x<=CELLS_W&&p.y>=0&&p.y<=CELLS_H);
  assert.ok(Number.isFinite(ray.length)&&ray.length>0);
  if(dx||dy)close((p.x-from.x)*dy-(p.y-from.y)*dx,0);
 }
});

test("An unlocked purple arrow wanders harmlessly and only locks living enemies within tower range",()=>{
 const s=scene();s.t.step(s.sim,2);assert.equal(s.sim.wispLightningTrails.length,0);
 enemy(s.sim,40,20);const dead=enemy(s.sim,21,20);dead.hp=0;s.t.step(s.sim,.1);assert.equal(s.w!.ray,undefined);
 s.w!.x=20;s.w!.y=20;delete s.w!.flight;
 const first=enemy(s.sim,23,20),tie=enemy(s.sim,23,20);s.t.step(s.sim,0);
 assert.equal(s.w!.ray!.target,first.id);assert.notEqual(s.w!.ray!.target,tie.id);
});

test("A lock commits a piercing straight ray through the captured target all the way to the edge",()=>{
 const s=scene(),ray=launch(s),target=s.sim.enemies[0],end={...ray.b};
 target.x=10;target.y=5;target.hp=0;s.sim.reindexAfterDisplacement();enemy(s.sim,21,24);
 const beyond=enemy(s.sim,55,20),off=enemy(s.sim,55,24);
 for(let i=0;i<120&&s.pool!.arrows.length;i++){s.t.step(s.sim,1/60);close(s.w!.y,20);}
 assert.equal(s.pool!.arrows.length,0);close(s.w!.x,end.x);close(s.w!.y,end.y);assert.equal(s.w!.ray,undefined);
 assert.ok(beyond.hp<beyond.maxHp,"damage continues well beyond acquisition range");assert.equal(off.hp,off.maxHp);
 assert.ok(s.sim.wispLightningTrails.length>0);assert.equal(s.sim.wispFireTrails.length,0);
});

test("Every swept point lasts five seconds at 300% attack/s, with no additional direct-hit damage",()=>{
 const s=scene();launch(s);const ground=s.sim.enemies[0],flying=enemy(s.sim,25,20,"bat"),outside=enemy(s.sim,25,23);
 s.sim.bonuses={...s.sim.bonuses,towerDamage:2}; // A committed strike captures its old damage.
 s.t.step(s.sim,.3);const hp=ground.hp,airHp=flying.hp;
 s.t.step(s.sim,1);close(hp-ground.hp,archerDamage(0)*3);close(hp-ground.hp,airHp-flying.hp);
 assert.equal(outside.hp,outside.maxHp);
 const trail=s.sim.wispLightningTrails[0];assert.equal(trail.dps,archerDamage(0)*3);
 assert.equal(trail.life,5);assert.equal(trail.width,WISP_LIGHTNING.width);
 s.t.step(s.sim,5);assert.equal(s.sim.wispLightningTrails.length,0);const end=ground.hp;
 clear(s);s.t.step(s.sim,1);close(ground.hp,end);
});

test("Late arrivals can enter the lightning after the arrow passes, with per-point expiry",()=>{
 const s=scene();launch(s);s.t.step(s.sim,2);clear(s);
 const near=enemy(s.sim,22,20),far=enemy(s.sim,65,20);s.t.step(s.sim,2.5);
 const nearHp=near.hp,farHp=far.hp;s.t.step(s.sim,1.3);
 assert.ok(nearHp-near.hp<farHp-far.hp,"the early trail expires before the later trail");
 s.t.step(s.sim,1);assert.equal(s.sim.wispLightningTrails.length,0);
});

test("Lightning follows existing physical-element lightning armor and shield rules",()=>{
 const s=scene();launch(s);const normal=s.sim.enemies[0],immuneToFire=enemy(s.sim,25,20,"slagGolem"),armor=enemy(s.sim,25,20,"geodeCrab");
 s.t.step(s.sim,.3);const h=[normal.hp,immuneToFire.hp,armor.hp];s.t.step(s.sim,.5);
 close(h[0]-normal.hp,h[1]-immuneToFire.hp);close(h[2]-armor.hp,(h[0]-normal.hp)/2);
 const shield=scene();launch(shield);const e=shield.sim.enemies[0],g=enemy(shield.sim,25,20,"shieldBearer");
 g.shieldHp=1e6;(shield.sim as any).shieldGenerators=[g];shield.t.step(shield.sim,.5);
 assert.equal(e.hp,e.maxHp);assert.ok(g.shieldHp!<1e6);
});

test("The nine-second refill starts at map exit, keeps its exact boundary, and never banks full time",()=>{
 const s=scene();s.t.step(s.sim,30);close(s.pool!.refill,0);
 const ray=launch(s),exit=ray.length/(s.w!.range*WISP_LIGHTNING.speed);
 s.t.step(s.sim,exit/2);assert.equal(s.pool!.arrows.length,1);close(s.pool!.refill,0);
 s.t.step(s.sim,exit/2);assert.equal(s.pool!.arrows.length,0);close(s.pool!.refill,0);clear(s);
 s.t.step(s.sim,0);close(s.pool!.refill,0);s.t.step(s.sim,8.99);assert.equal(s.pool!.arrows.length,0);
 s.t.step(s.sim,.01);assert.equal(s.pool!.arrows.length,1);assert.notEqual(s.pool!.arrows[0],s.w);close(s.pool!.refill,0);
 s.t.step(s.sim,30);assert.equal(s.pool!.arrows.length,1);close(s.pool!.refill,0);
});

test("Reload upgrades speed the ray while keeping nine-second regeneration fixed",()=>{
 const normal=scene(),fast=scene();launch(normal);launch(fast);fast.sim.bonuses={...fast.sim.bonuses,towerReload:.5};
 normal.t.step(normal.sim,.5);fast.t.step(fast.sim,.5);close(fast.w!.x-20,(normal.w!.x-20)*2);
 normal.t.step(normal.sim,2);fast.t.step(fast.sim,2);clear(normal);clear(fast);
 close(fast.pool!.refill-normal.pool!.refill,.65);
});

test("Fine and coarse ray flight, deposition, damage, expiry and refills agree",()=>{
 const coarse=scene(),fine=scene();for(const s of[coarse,fine]){launch(s);enemy(s.sim,60,20);}
 coarse.t.step(coarse.sim,4);for(let i=0;i<240;i++)fine.t.step(fine.sim,1/60);
 for(let i=0;i<2;i++)close(coarse.sim.enemies[i].hp,fine.sim.enemies[i].hp);
 close(coarse.pool!.refill,fine.pool!.refill);close(coarse.w!.x,fine.w!.x);close(coarse.w!.y,fine.w!.y);
 assert.ok(coarse.sim.wispLightningTrails[0].segments.length<=CELLS_W+1);
 for(const s of[coarse,fine])clear(s);
 coarse.t.step(coarse.sim,7);for(let i=0;i<420;i++)fine.t.step(fine.sim,1/60);
 assert.equal(coarse.pool!.arrows.length,1);assert.equal(fine.pool!.arrows.length,1);
 close(coarse.pool!.refill,fine.pool!.refill);assert.equal(coarse.sim.wispLightningTrails.length,0);
});

test("Source destruction stops the arrow/refill while deposited lightning finishes, and rebuilding starts full",()=>{
 const s=scene();launch(s);s.t.step(s.sim,.3);const e=s.sim.enemies[0],before=e.hp;
 s.sim.built[s.b.id]=0;s.t.step(s.sim,.2);assert.equal(s.sim.wispOwners.size,0);assert.ok(e.hp<before);
 assert.equal(s.w!.ray,undefined);s.t.step(s.sim,6);assert.equal(s.sim.wispLightningTrails.length,0);assert.equal(s.sim.wisps.length,0);
 s.sim.built[s.b.id]=s.b.cells.length;clear(s);s.t.step(s.sim,0);
 const owner=s.sim.wispOwners.get(s.b.id)!;assert.equal(owner.lightning!.arrows.length,1);assert.equal(owner.fire!.arrows.length,2);assert.equal(owner.arrows.length,3);
});

test("Lightning rendering is deterministic, finite, restrained under Reduce Motion and leaves simulation untouched",()=>{
 const s=scene();launch(s);s.t.step(s.sim,.5);const segment=s.sim.wispLightningTrails[0].segments[0],before=JSON.stringify(s.w);
 const points=wispLightningPoints(segment,1);assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 assert.deepEqual(wispLightningPoints(segment,1,true),wispLightningPoints(segment,2,true));
 assert.notDeepEqual(wispLightningPoints(segment,1),wispLightningPoints(segment,2));
 assert.equal(JSON.stringify(s.w),before);
});
