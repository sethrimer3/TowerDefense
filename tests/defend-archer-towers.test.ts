import {test} from "node:test";
import assert from "node:assert/strict";
import {defaults,decode} from "../src/save.ts";
import {DefendSim,type Enemy} from "../src/defend/sim.ts";
import {CellType,generateCity} from "../src/defend/citygen.ts";
import {defaultLayout,fitLayout} from "../src/defend/layout.ts";
import {archerDamage,archerCooldown,archerRange,type PlacedKind} from "../src/defend/catalog.ts";
import {Towers,archerTowerRange,stepArrows} from "../src/defend/towers.ts";
import {hawkDamage,hawkReload,hawkTarget} from "../src/defend/hawk-focus.ts";
import {wispFlight,flightPosition} from "../src/defend/wisp-flight.ts";
import {orbit,quiverEvery} from "../src/defend/wisp-storm.ts";
import {SHARP,WISP,pathById} from "../src/knowledge-paths.ts";
import {ATTUNED,nextSteps,buildingTree,upgradeBuilding,undoUpgrade,allocated} from "../src/specializations.ts";
import {kindStats} from "../src/ui/specialty.ts";
import {structurePixels} from "../src/defend/tower-art.ts";

function scene(kind:PlacedKind="hawkTower",rank=0){
 const sim=new DefendSim(generateCity(fitLayout(defaultLayout()),4),defaults().defend.levels,1);
 sim.enemies=[];sim.soldiers=[];sim.civilians=[];sim.solid.fill(0);sim.foeSolid.fill(0);sim.ownSolid.fill(0);sim.map.type.fill(CellType.STREET);
 const b={...sim.keep,kind,rect:{x:19,y:19,w:2,h:2},structureUid:42};sim.map.buildings[b.id]=b;
 sim.bonuses={...sim.bonuses,structurePaths:rank?{42:{[kind]:{path:kind==="wispTower"?"wispArrow":"sharpshooters",rank}}}:{}};
 return{sim,b,t:new Towers()};
}
function enemy(sim:DefendSim,x:number,y=20,hp=1e6,kind:Enemy["kind"]="orc"){
 const e:Enemy={id:sim.newId(),kind,x,y,hp,maxHp:hp,cd:0,flash:0,jx:0,jy:0,distract:-1,distractT:0,rollT:0,marked:false};
 sim.enemies.push(e);sim.reindexAfterDisplacement();return e;
}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test("Archer Tower offers Deep quiver as Wisp rank I, with saved ranks and exact refunds",()=>{
 assert.deepEqual(nextSteps("archerTower").map(s=>s.type==="become"&&s.to),["brazierTower","hawkTower","wispTower"]);
 assert.equal(pathById("wispArrow").ranks.length,3);
 assert.deepEqual(nextSteps("wispTower"),[{type:"path",path:"wispArrow",rank:1,cost:4}]);
 assert.deepEqual(nextSteps("wispTower",{path:"wispArrow",rank:1}),[{type:"path",path:"wispArrow",rank:2,cost:4004}]);
 assert.deepEqual(nextSteps("wispTower",{path:"wispArrow",rank:2}),[{type:"path",path:"wispArrow",rank:3,cost:16004}]);
 assert.equal(buildingTree("wispTower").filter(n=>n.path==="wispArrow").length,3);
 const s=defaults();s.knowledge=100;s.defend.owned.archerTower=1;
 assert.ok(upgradeBuilding(s,{copy:"archerTower"},nextSteps("archerTower")[2]).ok);
 let loaded=decode(JSON.stringify(s));assert.equal(loaded.defend.owned.wispTower,1);assert.equal(loaded.knowledge,97);
 assert.ok(upgradeBuilding(loaded,{copy:"wispTower"},nextSteps("wispTower")[0]).ok);
 loaded=decode(JSON.stringify(loaded));assert.equal(loaded.knowledge,93);
 assert.deepEqual(loaded.defend.kept,[{kind:"wispTower",path:"wispArrow",rank:1}]);
 assert.equal(allocated("wispTower",{path:"wispArrow",rank:1}),10);
 assert.ok(undoUpgrade(loaded,{copy:"wispTower",wear:{path:"wispArrow",rank:1}},"p:wispArrow:1").ok);assert.equal(loaded.knowledge,97);
 assert.ok(undoUpgrade(loaded,{copy:"wispTower"},"k:wispTower").ok);assert.equal(loaded.knowledge,100);
 assert.equal(loaded.defend.owned.archerTower,1);assert.equal(allocated("wispTower"),6);
 const old=defaults();old.defend.owned.hawkTower=1;old.defend.kept=[{kind:"hawkTower",path:"sharpshooters",rank:3}];
 loaded=decode(JSON.stringify(old));assert.deepEqual(loaded.defend.kept,old.defend.kept);
 assert.match(kindStats(old,"hawkTower","sharpshooters",3),/1000%.*10x/);
 assert.match(kindStats(old,"wispTower"),/every 1s, up to 30.*30° spray/);
 assert.match(kindStats(old,"wispTower","wispArrow",1),/every 0.5s, up to 45/);
 assert.notDeepEqual(structurePixels("wispTower",2,2,0,1),structurePixels("archerTower",2,2,0,1));
});

test("Hawk acquires current HP, keeps its lock, and resolves equal HP by distance then id",()=>{
 const{sim,b,t}=scene(),weak=enemy(sim,21),strong=enemy(sim,23,20,2e6);
 weak.maxHp=1e9;t.step(sim,0);assert.equal(sim.arrows[0].target,strong.id);
 strong.hp=1;t.cooldown.set(b.id,0);t.step(sim,0);assert.equal(sim.arrows[1].target,strong.id);
 const first=enemy(sim,19,20,3e6),second=enemy(sim,21,20,3e6);
 assert.equal(hawkTarget([second,first],20,20,5)!.id,first.id);
 assert.equal(hawkTarget([first,second],20,20,5,{target:second.id,shots:3})!.id,second.id);
});

test("Every Hawk tier has exact range, additive damage cap, captured damage and capped cadence",()=>{
 for(let rank=0;rank<=3;rank++){
  const{sim,b,t}=scene("hawkTower",rank);enemy(sim,22);
  close(archerTowerRange(sim,b),archerRange(0)*SHARP.range[rank]);
  for(let i=0;i<510;i++){t.cooldown.set(b.id,0);t.step(sim,0);}
  close(sim.arrows[0].damage,archerDamage(0));
  close(sim.arrows[1].damage,archerDamage(0)*(rank?1.02:1));
  close(sim.arrows[500].damage,archerDamage(0)*(rank?11:1));
  close(sim.arrows.at(-1)!.damage,sim.arrows[500].damage);
  close(t.cooldown.get(b.id)!,hawkReload(archerCooldown(0),rank,501));
  assert.equal(t.focus.get(b.id)!.shots,501,"counter stays bounded");
 }
 assert.equal(hawkDamage(3,501),11);close(hawkReload(2,3,10),.4);
 const{sim,b,t}=scene("hawkTower",3);enemy(sim,22);t.step(sim,0);
 close(t.cooldown.get(b.id)!,archerCooldown(0));
});

test("Hawk resets both ramps for a new target, source destruction and out-of-range locks",()=>{
 const{sim,b,t}=scene("hawkTower",3),a=enemy(sim,22),other=enemy(sim,23,20,500000);
 for(let i=0;i<20;i++){t.cooldown.set(b.id,0);t.step(sim,0);}
 const damage=sim.arrows.at(-1)!.damage;a.hp=0;t.step(sim,0);
 assert.equal(t.focus.get(b.id)!.target,other.id);assert.equal(t.focus.get(b.id)!.shots,0);
 close(t.cooldown.get(b.id)!,archerCooldown(0)*2);
 t.cooldown.set(b.id,0);t.step(sim,0);close(sim.arrows.at(-1)!.damage,archerDamage(0));
 assert.equal(sim.arrows[19].damage,damage,"already fired damage stays captured");
 other.x=200;sim.reindexAfterDisplacement();t.step(sim,0);assert.equal(t.focus.has(b.id),false);
 other.x=22;sim.reindexAfterDisplacement();t.step(sim,0);assert.equal(t.focus.get(b.id)!.shots,1);
 sim.built[b.id]=0;t.step(sim,0);assert.equal(t.focus.has(b.id),false);
 sim.built[b.id]=b.cells.length;t.step(sim,0);assert.equal(t.focus.get(b.id)!.shots,1);
});

test("Far-horizon arrows live long enough to reach enemies at their new range",()=>{
 const{sim,b,t}=scene("hawkTower",2),e=enemy(sim,20+archerTowerRange(sim,b)-.1);t.step(sim,0);
 for(let i=0;i<200&&e.hp===e.maxHp;i++)stepArrows(sim,1/30);
 assert.ok(e.hp<e.maxHp);
});

test("Wisp broad tangent routes reach central and edge aims without sharp turns or range clipping",()=>{
 const home={x:20,y:20},range=archerRange(0),radius=range*WISP.turnRadius;
 for(let a=0;a<16;a++) for(const fraction of[0,.3,.7,.999,1]) {
  const aim={x:20+range*fraction*Math.cos(a*Math.PI/8),y:20+range*fraction*Math.sin(a*Math.PI/8)};
  let from={x:20,y:19.2,angle:-Math.PI/2};
  for(let pass=0;pass<3;pass++) {
   const flight=wispFlight(from,aim,home,range)!;
   assert.ok(flight,`${JSON.stringify(aim)} pass ${pass}`);
   const end=flight.points.at(-1)!;close(end.x,aim.x);close(end.y,aim.y);
   for(let i=1;i<flight.points.length;i++) {
    const p=flight.points[i],previous=flight.points[i-1],distance=p.distance-previous.distance;
    assert.ok(Math.hypot(p.x-20,p.y-20)<=range+1e-8);
    assert.ok(Math.abs(p.angle-previous.angle)<=distance/radius+1e-8,"minimum turning radius");
   }
   from=end;
  }
 }
});

const sliceTime=(sim:DefendSim)=>sim.wisps[0].slice!.length/(sim.wisps[0].range*WISP.speed)*
 archerCooldown(sim.levels.archerRate)/archerCooldown(0)*sim.bonuses.towerReload;

test("Two Hawk buildings keep separate snapshots and focus counters",()=>{
 const{sim,b,t}=scene("hawkTower",3);
 const other=sim.map.buildings.find(o=>o.id!==b.id)!;
 sim.map.buildings[other.id]={...other,kind:"hawkTower",rect:{x:29,y:19,w:2,h:2},structureUid:43};
 sim.bonuses={...sim.bonuses,structurePaths:{...sim.bonuses.structurePaths,43:{hawkTower:{path:"sharpshooters",rank:1}}}};
 const a=enemy(sim,22),z=enemy(sim,32);t.step(sim,0);
 assert.equal(t.focus.get(b.id)!.target,a.id);assert.equal(t.focus.get(other.id)!.target,z.id);
 for(let i=0;i<4;i++){t.cooldown.set(b.id,0);t.step(sim,0);}
 assert.equal(t.focus.get(b.id)!.shots,5);assert.equal(t.focus.get(other.id)!.shots,1);
 assert.equal(sim.arrows.filter(a=>a.origin?.building===other.id).length,1);
});

test("An attunement without later ranks cannot accidentally unlock a future ultimate",()=>{
 const a=ATTUNED.find(a=>a.kind==="archerTower")!,before=a.ultimate,p=pathById("wispArrow"),ranks=p.ranks;
 try{
  p.ranks=[];a.ultimate="nanoTower";
  assert.deepEqual(nextSteps("hawkTower",{path:"sharpshooters",rank:3}),[]);
  assert.equal(buildingTree("hawkTower",{path:"sharpshooters",rank:3}).find(n=>n.id==="k:nanoTower")!.state,"locked");
 }finally{a.ultimate=before;p.ranks=ranks;}
});

const quiverOf=(s:ReturnType<typeof scene>)=>s.sim.wispOwners.get(s.b.id)!.quiver;
const angleOf=(a:{release?:{dx:number;dy:number}})=>Math.atan2(a.release!.dy,a.release!.dx);

test("The Wisp tower starts empty and stores an arrow a second up to 30, without banking at capacity",()=>{
 const s=scene("wispTower");s.t.step(s.sim,0);const q=quiverOf(s);assert.equal(q.arrows.length,0);
 s.t.step(s.sim,.99);assert.equal(q.arrows.length,0);
 s.t.step(s.sim,.01);assert.equal(q.arrows.length,1);
 for(let i=0;i<40*30;i++)s.t.step(s.sim,1/30);
 assert.equal(q.arrows.length,30);close(q.timer,0);
 assert.equal(s.sim.arrows.length,0,"nothing loosed with no enemy in range");
 assert.equal(s.sim.wisps.length,0,"no living arrows before Fire arrows");
 const deep=scene("wispTower",1);deep.t.step(deep.sim,.5);assert.equal(quiverOf(deep).arrows.length,1);
 deep.t.step(deep.sim,30);assert.equal(quiverOf(deep).arrows.length,45);
 const quick=scene("wispTower");quick.sim.bonuses={...quick.sim.bonuses,towerReload:.5};quick.t.step(quick.sim,0);
 close(quiverEvery(quick.sim,quiverOf(quick)),.5);quick.t.step(quick.sim,.5);assert.equal(quiverOf(quick).arrows.length,1);
});

test("Stored arrows wander round the tower, near but never on one ellipse, without battle randomness",()=>{
 const s=scene("wispTower");let random=0;(s.sim as any).rand=()=>{random++;return .5;};
 s.t.step(s.sim,30);const q=quiverOf(s),radii=q.arrows.map(()=>[] as number[]);
 for(let i=0;i<600;i++){s.t.step(s.sim,1/30);q.arrows.forEach((a,j)=>radii[j].push(Math.hypot(a.x-20,a.y-20)));}
 assert.equal(random,0);
 for(const r of radii){
  assert.ok(Math.min(...r)>.2&&Math.max(...r)<4,`stays near the tower: ${Math.min(...r)}..${Math.max(...r)}`);
  assert.ok(Math.max(...r)-Math.min(...r)>.3,"its distance from the middle keeps changing");
 }
 assert.equal(new Set(q.arrows.map(a=>`${a.x.toFixed(3)},${a.y.toFixed(3)}`)).size,30,"each on its own path");
 assert.ok(new Set(q.arrows.map(a=>a.spin)).size===2,"some circle each way");
 const a={...q.arrows[0],f:[...q.arrows[0].f] as [number,number],phase:[...q.arrows[0].phase] as [number,number]},b={...a};
 orbit(a,{x:20,y:20},1);for(let i=0;i<30;i++)orbit(b,{x:20,y:20},1/30);close(a.x,b.x);close(a.y,b.y);
});

test("An enemy in range draws every stored arrow at once in a 30-degree spray of ordinary arrows",()=>{
 const s=scene("wispTower");s.t.step(s.sim,12);const q=quiverOf(s);assert.equal(q.arrows.length,12);
 const far=enemy(s.sim,20+archerRange(0)+1);s.t.step(s.sim,0);assert.equal(s.sim.arrows.length,0,"out of range waits");
 far.x=200;s.sim.reindexAfterDisplacement();
 const hidden=enemy(s.sim,23);hidden.untargetable=true;s.t.step(s.sim,0);assert.equal(s.sim.arrows.length,0,"untargetable waits");
 hidden.hp=0;const e=enemy(s.sim,20,24);s.t.step(s.sim,0);
 assert.equal(q.arrows.length,0);assert.equal(s.sim.arrows.length,12);
 const angles=s.sim.arrows.map(angleOf).sort((a,b)=>a-b),aim=Math.PI/2;
 close(angles[0],aim-Math.PI/12);close(angles.at(-1)!,aim+Math.PI/12);
 for(const a of s.sim.arrows){close(a.damage,archerDamage(0));assert.equal(a.origin!.building,s.b.id);assert.ok(a.chronoReleased);}
 for(let i=0;i<120&&e.hp===e.maxHp;i++)stepArrows(s.sim,1/30);
 assert.ok(e.hp<e.maxHp,"the spray strikes the enemy");
});

test("A lone stored arrow flies straight at the enemy; destroying the tower loses its quiver",()=>{
 const s=scene("wispTower");s.t.step(s.sim,1);const e=enemy(s.sim,24);s.t.step(s.sim,0);
 assert.equal(s.sim.arrows.length,1);close(angleOf(s.sim.arrows[0]),0);
 e.x=200;s.sim.reindexAfterDisplacement();s.t.step(s.sim,5);assert.equal(quiverOf(s).arrows.length,5);
 s.sim.built[s.b.id]=0;s.t.step(s.sim,1);assert.equal(s.sim.wispOwners.has(s.b.id),false);
 s.sim.built[s.b.id]=s.b.cells.length;s.t.step(s.sim,0);assert.equal(quiverOf(s).arrows.length,0);
});

