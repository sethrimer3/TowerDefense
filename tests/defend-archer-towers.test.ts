import {test} from "node:test";
import assert from "node:assert/strict";
import {defaults,decode} from "../src/save.ts";
import {DefendSim,type Enemy} from "../src/defend/sim.ts";
import {CellType,generateCity} from "../src/defend/citygen.ts";
import {defaultLayout,fitLayout} from "../src/defend/layout.ts";
import {archerDamage,archerCooldown,archerRange,type PlacedKind} from "../src/defend/catalog.ts";
import {Towers,archerTowerRange,stepArrows} from "../src/defend/towers.ts";
import {hawkDamage,hawkReload,hawkTarget} from "../src/defend/hawk-focus.ts";
import {finishWisps} from "../src/defend/wisp-arrow.ts";
import {wispFlight,flightPosition} from "../src/defend/wisp-flight.ts";
import {wispTassels,wispSparks,type WispTassels} from "../src/defend/wisp-art.ts";
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

test("Archer Tower offers Triple arrows as Wisp rank I, with saved ranks and exact refunds",()=>{
 assert.deepEqual(nextSteps("archerTower").map(s=>s.type==="become"&&s.to),["brazierTower","hawkTower","wispTower"]);
 assert.equal(pathById("wispArrow").ranks.length,1);
 assert.deepEqual(nextSteps("wispTower"),[{type:"path",path:"wispArrow",rank:1,cost:4}]);
 assert.deepEqual(nextSteps("wispTower",{path:"wispArrow",rank:1}),[]);
 assert.equal(buildingTree("wispTower").filter(n=>n.path==="wispArrow").length,1);
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
 assert.match(kindStats(old,"wispTower"),/one living arrow.*30 hits.*3s/);
 assert.match(kindStats(old,"wispTower","wispArrow",1),/three living arrows.*30 hits.*3s/);
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

test("Wisp stays singular and bounded while wandering, with no idle damage or ordinary arrows",()=>{
 const{sim,b,t}=scene("wispTower");let random=0;(sim as any).rand=()=>{random++;return .5;};
 for(let i=0;i<600;i++){t.step(sim,1/30);assert.equal(sim.wisps.length,1);const w=sim.wisps[0];assert.ok(Math.hypot(w.x-20,w.y-20)<=w.range*WISP.orbit+1e-9);}
 const w=sim.wisps[0];t.step(sim,1/30);assert.equal(sim.wisps[0],w);assert.equal(sim.arrows.length,0);assert.equal(random,0);
 assert.equal(w.slice,undefined);assert.equal(w.energy,0);
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

test("Wisp sweeps crossed ground/flying enemies once per pass and honors range",()=>{
 const{sim,t}=scene("wispTower"),primary=enemy(sim,23,20);
 t.step(sim,0);const w=sim.wisps[0],slice=w.slice!;
 const p=flightPosition(slice,slice.length*.6),other=enemy(sim,p.x,p.y,1e6,"bat"),outside=enemy(sim,20+w.range+.1);
 t.step(sim,sliceTime(sim));close(primary.maxHp-primary.hp,archerDamage(0));close(other.maxHp-other.hp,archerDamage(0));
 assert.equal(outside.hp,outside.maxHp);assert.equal(sim.wisps[0],w);assert.equal(sim.arrows.length,0);
 assert.ok(slice.hit.has(primary.id)&&slice.hit.has(other.id));
});

test("Wisp sweep survives a dead aim, shields apply, and destruction fades without combat",()=>{
 const{sim,b,t}=scene("wispTower"),aim=enemy(sim,23);t.step(sim,0);
 const old=sim.wisps[0],slice=old.slice!,p=flightPosition(slice,slice.length*.6),other=enemy(sim,p.x,p.y);
 aim.hp=0;t.step(sim,sliceTime(sim));assert.ok(other.hp<other.maxHp);
 const shield=scene("wispTower"),e=enemy(shield.sim,23,20,1e6,"shieldBearer");e.shieldHp=3000;(shield.sim as any).shieldGenerators=[e];
 shield.t.step(shield.sim,0);shield.t.step(shield.sim,sliceTime(shield.sim));assert.equal(e.hp,e.maxHp);assert.equal(e.shieldHp,3000-archerDamage(0));
 sim.built[b.id]=0;const hp=other.hp;t.step(sim,.01);assert.ok(old.fade!==undefined);assert.equal(old.slice,undefined);assert.equal(other.hp,hp);
 sim.built[b.id]=b.cells.length;t.step(sim,.01);assert.notEqual(sim.wispOwners.get(b.id),old);
 finishWisps(sim,1);assert.ok(!sim.wisps.includes(old));assert.equal(sim.wispOwners.size,1);
});

test("Wisp tassels stay finite on long attacks and do not change combat state",()=>{
 const{sim,t}=scene("wispTower");enemy(sim,25);t.step(sim,0);const w=sim.wisps[0];let state:WispTassels|undefined;
 for(let i=0;i<300;i++){
  t.step(sim,1/30);state=wispTassels(w,state);
  const link=(WISP.idleLength+(WISP.sliceLength-WISP.idleLength)*w.energy)/(WISP.segments-1);
  assert.ok(w.trail.length<=Math.ceil((WISP.sliceLength+.5)/WISP.spacing)+2,"bounded history");
  for(let j=1;j<w.trail.length;j++)assert.ok(w.trail[j].distance>w.trail[j-1].distance,"unique history samples");
  assert.equal(state.chains.length,6);
  for(const chain of state.chains){assert.equal(chain.length,12);for(let j=1;j<chain.length;j++){assert.ok(Number.isFinite(chain[j].x));assert.ok(Math.hypot(chain[j].x-chain[j-1].x,chain[j].y-chain[j-1].y)<=link+1e-8);}}
 }
 assert.equal(sim.wisps.length,1);
});

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

test("Wisp sweep hits and flight history agree across fine and coarse simulation steps",()=>{
 const coarse=scene("wispTower"),fine=scene("wispTower");
 for(const s of[coarse,fine]){enemy(s.sim,23);s.t.step(s.sim,0);const slice=s.sim.wisps[0].slice!,p=flightPosition(slice,slice.length*.7);enemy(s.sim,p.x,p.y);}
 coarse.t.step(coarse.sim,3);for(let i=0;i<180;i++)fine.t.step(fine.sim,1/60);
 assert.deepEqual(coarse.sim.enemies.map(e=>e.hp),fine.sim.enemies.map(e=>e.hp));
 const a=coarse.sim.wisps[0],b=fine.sim.wisps[0];close(a.x,b.x);close(a.y,b.y);close(a.energy,b.energy);
 assert.equal(a.trail.length,b.trail.length);
 for(let i=0;i<a.trail.length;i++){close(a.trail[i].x,b.trail[i].x);close(a.trail[i].y,b.trail[i].y);}
});

test("Wisp chains aggressive passes without idle gaps and preserves heading at every transition",()=>{
 const{sim,t}=scene("wispTower");enemy(sim,23);enemy(sim,18,22);
 t.step(sim,0);const w=sim.wisps[0];let passes=0,old=w.slice!;
 for(let i=0;i<600;i++) {
  const before=w.angle;t.step(sim,1/120);
  assert.ok(w.slice,"enemies in range keep the arrow slicing");
  assert.ok(Math.abs(w.angle-before)<=WISP.speed/WISP.turnRadius/120+1e-8,"no snapped turns between passes");
  if(w.slice!==old){passes++;old=w.slice!;}
  assert.ok(Math.hypot(w.x-20,w.y-20)<=w.range+1e-8);
 }
 assert.ok(passes>=4,`${passes} passes in five seconds`);
 assert.ok(sim.enemies.every(e=>e.hp<e.maxHp));
});

test("Shared damage and reload bonuses scale Wisp hits and flight speed",()=>{
 const ordinary=scene("wispTower"),boosted=scene("wispTower");
 boosted.sim.bonuses={...boosted.sim.bonuses,towerDamage:3,towerReload:.5};
 for(const s of[ordinary,boosted]){enemy(s.sim,23);s.t.step(s.sim,0);}
 const duration=sliceTime(ordinary.sim);
 close(sliceTime(boosted.sim),duration*.5);
 ordinary.t.step(ordinary.sim,duration);boosted.t.step(boosted.sim,duration*.5);
 const a=ordinary.sim.wisps[0],b=boosted.sim.wisps[0];close(a.x,b.x);close(a.y,b.y);
 close(ordinary.sim.enemies[0].maxHp-ordinary.sim.enemies[0].hp,archerDamage(0));
 close(boosted.sim.enemies[0].maxHp-boosted.sim.enemies[0].hp,archerDamage(0)*3);
});

test("Attack tassels hold their length for one second then shorten gradually",()=>{
 const{sim,t}=scene("wispTower"),e=enemy(sim,23);t.step(sim,0);
 const w=sim.wisps[0];t.step(sim,sliceTime(sim));e.hp=0;
 const long=w.energy;assert.ok(long>.99);
 t.step(sim,.99);close(w.energy,long);
 t.step(sim,.02);assert.ok(w.energy<long&&w.energy>long*.98);
 t.step(sim,1);assert.ok(w.energy<long*.6&&w.energy>long*.45);
 t.step(sim,5);assert.ok(w.energy<.03);
});

test("Tassels retrace the arrow route with narrow separation and barely any free motion",()=>{
 const{sim,t}=scene("wispTower");enemy(sim,23);t.step(sim,1);
 const w=sim.wisps[0],snapshot=JSON.stringify(w),state=wispTassels(w);
 assert.equal(JSON.stringify(w),snapshot,"drawing cannot affect combat or flight history");
 for(let i=0;i<WISP.segments;i++) for(let j=1;j<WISP.tassels;j++)
  assert.ok(Math.hypot(state.chains[j][i].x-state.chains[j-1][i].x,state.chains[j][i].y-state.chains[j-1][i].y)<.065);
 const reduced=wispTassels(w,undefined,true);
 assert.deepEqual(wispTassels({...w,time:w.time+1},undefined,true).chains,reduced.chains,"Reduce Motion disables ripple");
 const later=wispTassels({...w,time:w.time+1});
 for(let j=0;j<WISP.tassels;j++) for(let i=0;i<WISP.segments;i++)
  assert.ok(Math.hypot(later.chains[j][i].x-state.chains[j][i].x,later.chains[j][i].y-state.chains[j][i].y)<.04,"minimal ripple");
 for(let j=0;j<WISP.tassels;j++)for(let i=0;i<WISP.segments;i++) {
  const p=state.chains[j][i];
  assert.ok(w.trail.some(a=>Math.hypot(a.x-p.x,a.y-p.y)<.25),"tassels stay close to the actual flight path");
 }
});

const ownerOf=(s:ReturnType<typeof scene>)=>s.sim.wispOwners.get(s.b.id)!;
function exhaust(s:ReturnType<typeof scene>) {
 s.t.step(s.sim,0);
 for(const w of ownerOf(s).arrows)for(let i=0;i<WISP.hits;i++)enemy(s.sim,w.x,w.y);
 s.t.step(s.sim,.01);
 assert.equal(ownerOf(s).arrows.length,0);
 s.sim.enemies=[];s.sim.reindexAfterDisplacement();
}

test("Triple arrows starts full with three independent 30-hit arrows and distinct flight/tassel poses",()=>{
 const base=scene("wispTower"),triple=scene("wispTower",1);
 base.t.step(base.sim,0);triple.t.step(triple.sim,0);
 assert.equal(ownerOf(base).capacity,1);assert.equal(ownerOf(base).arrows.length,1);
 const owner=ownerOf(triple);assert.equal(owner.capacity,3);assert.equal(owner.arrows.length,3);
 assert.deepEqual(owner.arrows.map(w=>w.hitsLeft),[30,30,30]);
 assert.equal(new Set(owner.arrows.map(w=>`${w.x},${w.y},${w.angle}`)).size,3);
 assert.equal(new Set(owner.arrows.map(w=>w.trail)).size,3);
 for(const w of owner.arrows)enemy(triple.sim,w.x,w.y);
 triple.t.step(triple.sim,.01);
 assert.ok(owner.arrows.every(w=>w.slice&&w.hitsLeft<30),"all three can attack together");
 assert.equal(triple.sim.arrows.length,0);
});

test("Each arrow stops exactly at its 30th contact in a dense group and leaves harmless blue sparks",()=>{
 for(const rank of[0,1]) {
  const s=scene("wispTower",rank);s.t.step(s.sim,0);
  const arrows=[...ownerOf(s).arrows];
  for(const w of arrows)for(let i=0;i<40;i++)enemy(s.sim,w.x,w.y);
  s.t.step(s.sim,.01);
  assert.equal(ownerOf(s).arrows.length,0);
  const damage=s.sim.enemies.reduce((sum,e)=>sum+e.maxHp-e.hp,0);
  close(damage,arrows.length*30*archerDamage(0));
  for(const w of arrows){assert.equal(w.hitsLeft,0);assert.ok(w.burst!==undefined);assert.equal(w.slice,undefined);}
  s.sim.enemies=[];s.sim.reindexAfterDisplacement();
  s.t.step(s.sim,.2);
  for(const w of arrows) {
   const snapshot=JSON.stringify(w),sparks=wispSparks(w);
   assert.equal(sparks.length,18);assert.equal(wispSparks(w,true).length,1);
   assert.ok(sparks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.alpha>0&&p.alpha<1));
   assert.equal(JSON.stringify(w),snapshot);
  }
  s.t.step(s.sim,.4);assert.equal(s.sim.wisps.length,0,"spent arrows and sparks expire");
 }
});

test("The same enemy can spend an arrow's full 30-hit life across successive wide passes",()=>{
 const s=scene("wispTower"),e=enemy(s.sim,23);s.t.step(s.sim,0);const w=ownerOf(s).arrows[0];
 for(let i=0;i<6000&&w.burst===undefined;i++)s.t.step(s.sim,1/120);
 assert.equal(w.hitsLeft,0);assert.ok(w.burst!==undefined);
 close(e.maxHp-e.hp,30*archerDamage(0));
});

test("Refills are sequential every three battle seconds, pause at zero dt, and do not bank at capacity",()=>{
 const s=scene("wispTower",1);s.t.step(s.sim,20);close(ownerOf(s).refill,0);
 exhaust(s);const owner=ownerOf(s);close(owner.refill,.01);
 s.t.step(s.sim,0);close(owner.refill,.01);assert.equal(owner.arrows.length,0);
 for(let count=1;count<=3;count++) {
  s.t.step(s.sim,count===1?2.98:2.99);assert.equal(owner.arrows.length,count-1);
  s.t.step(s.sim,.01);assert.equal(owner.arrows.length,count);close(owner.refill,0);
 }
 assert.ok(owner.arrows.every(w=>w.hitsLeft===30));
 s.t.step(s.sim,100);close(owner.refill,0);assert.equal(owner.arrows.length,3);
});

test("Losing another arrow preserves refill progress; each replacement has a fresh full budget",()=>{
 const s=scene("wispTower",1);s.t.step(s.sim,0);const owner=ownerOf(s);
 const lose=(w:typeof owner.arrows[number])=>{w.hitsLeft=1;enemy(s.sim,w.x,w.y);s.t.step(s.sim,.01);s.sim.enemies=[];s.sim.reindexAfterDisplacement();};
 lose(owner.arrows[0]);assert.equal(owner.arrows.length,2);close(owner.refill,.01);
 s.t.step(s.sim,.99);close(owner.refill,1);
 lose(owner.arrows[0]);assert.equal(owner.arrows.length,1);close(owner.refill,1.01);
 s.t.step(s.sim,1.98);assert.equal(owner.arrows.length,1);
 s.t.step(s.sim,.01);assert.equal(owner.arrows.length,2);close(owner.refill,0);
 assert.equal(owner.arrows.at(-1)!.hitsLeft,30);
});

test("Shield contacts spend hits; idle flight, misses and out-of-range/dead enemies do not",()=>{
 const s=scene("wispTower");s.t.step(s.sim,10);const w=ownerOf(s).arrows[0];assert.equal(w.hitsLeft,30);
 const dead=enemy(s.sim,w.x,w.y);dead.hp=0;enemy(s.sim,20+w.range+.01);s.t.step(s.sim,.01);assert.equal(w.hitsLeft,30);
 const e=enemy(s.sim,w.x,w.y,1e6,"shieldBearer");e.shieldHp=1e6;(s.sim as any).shieldGenerators=[e];
 s.t.step(s.sim,.01);assert.equal(w.hitsLeft,29);assert.equal(e.hp,e.maxHp);assert.ok(e.shieldHp<1e6);
});

test("Destroying an empty tower cancels refilling; rebuilding starts a fresh full inventory",()=>{
 const s=scene("wispTower",1);exhaust(s);const old=ownerOf(s);
 s.t.step(s.sim,1);assert.equal(s.sim.wisps.length,0);
 s.sim.built[s.b.id]=0;s.t.step(s.sim,10);assert.equal(s.sim.wispOwners.has(s.b.id),false);assert.equal(s.sim.wisps.length,0);
 s.sim.built[s.b.id]=s.b.cells.length;s.t.step(s.sim,0);
 const fresh=ownerOf(s);assert.notEqual(fresh,old);assert.equal(fresh.arrows.length,3);close(fresh.refill,0);
});

test("Destroyed arrows continue fading after rebuilding instead of occupying fresh slots",()=>{
 const s=scene("wispTower",1);s.t.step(s.sim,0);const old=[...ownerOf(s).arrows];
 s.sim.built[s.b.id]=0;s.t.step(s.sim,.01);
 s.sim.built[s.b.id]=s.b.cells.length;s.t.step(s.sim,.5);
 assert.equal(ownerOf(s).arrows.length,3);assert.ok(old.every(w=>!s.sim.wisps.includes(w)));
});

test("Independent towers refill from their own snapshots, without borrowing a neighbor's rank or timer",()=>{
 const s=scene("wispTower",1);s.t.step(s.sim,0);
 const other=s.sim.map.buildings.find(b=>b.id!==s.b.id)!;
 s.sim.map.buildings[other.id]={...other,kind:"wispTower",rect:{x:39,y:19,w:2,h:2},structureUid:43};
 s.t.step(s.sim,0);const base=s.sim.wispOwners.get(other.id)!;assert.equal(base.capacity,1);
 exhaust(s);s.t.step(s.sim,2.99);
 assert.equal(ownerOf(s).arrows.length,1);assert.equal(base.arrows.length,1);close(base.refill,0);
});

test("Refill births, budgets and flight histories agree with fine/coarse steps after exhaustion",()=>{
 const coarse=scene("wispTower",1),fine=scene("wispTower",1);exhaust(coarse);exhaust(fine);
 coarse.t.step(coarse.sim,9);for(let i=0;i<540;i++)fine.t.step(fine.sim,1/60);
 const a=ownerOf(coarse),b=ownerOf(fine);assert.equal(a.serial,b.serial);close(a.refill,b.refill);
 assert.equal(a.arrows.length,3);assert.equal(b.arrows.length,3);
 for(let i=0;i<3;i++) {
  const x=a.arrows[i],y=b.arrows[i];close(x.x,y.x);close(x.y,y.y);close(x.time,y.time);assert.equal(x.hitsLeft,y.hitsLeft);
  assert.equal(x.trail.length,y.trail.length);
 }
 assert.equal(coarse.sim.wisps.length,3);assert.equal(fine.sim.wisps.length,3);
});

test("An attunement without later ranks cannot accidentally unlock a future ultimate",()=>{
 const a=ATTUNED.find(a=>a.kind==="archerTower")!,before=a.ultimate,p=pathById("wispArrow"),ranks=p.ranks;
 try{
  p.ranks=[];a.ultimate="nanoTower";
  assert.deepEqual(nextSteps("hawkTower",{path:"sharpshooters",rank:3}),[]);
  assert.equal(buildingTree("hawkTower",{path:"sharpshooters",rank:3}).find(n=>n.id==="k:nanoTower")!.state,"locked");
 }finally{a.ultimate=before;p.ranks=ranks;}
});
