import {test} from "node:test";
import assert from "node:assert/strict";
import {defaults,decode} from "../src/save.ts";
import {DefendSim,type Enemy} from "../src/defend/sim.ts";
import {CellType,generateCity} from "../src/defend/citygen.ts";
import {defaultLayout,fitLayout} from "../src/defend/layout.ts";
import {archerDamage,archerCooldown,archerRange,type PlacedKind} from "../src/defend/catalog.ts";
import {Towers,archerTowerRange,stepArrows} from "../src/defend/towers.ts";
import {hawkDamage,hawkReload,hawkTarget} from "../src/defend/hawk-focus.ts";
import {wispCurve,wispPosition,finishWisps} from "../src/defend/wisp-arrow.ts";
import {wispTendrils,type WispCloth} from "../src/defend/wisp-art.ts";
import {SHARP,WISP,pathById} from "../src/knowledge-paths.ts";
import {ATTUNED,nextSteps,buildingTree,upgradeBuilding,undoUpgrade,allocated} from "../src/specializations.ts";
import {kindStats} from "../src/ui/specialty.ts";
import {structurePixels} from "../src/defend/tower-art.ts";

function scene(kind:PlacedKind="hawkTower",rank=0){
 const sim=new DefendSim(generateCity(fitLayout(defaultLayout()),4),defaults().defend.levels,1);
 sim.enemies=[];sim.soldiers=[];sim.civilians=[];sim.solid.fill(0);sim.foeSolid.fill(0);sim.ownSolid.fill(0);sim.map.type.fill(CellType.STREET);
 const b={...sim.keep,kind,rect:{x:19,y:19,w:2,h:2},structureUid:42};sim.map.buildings[b.id]=b;
 sim.bonuses={...sim.bonuses,structurePaths:rank?{42:{hawkTower:{path:"sharpshooters",rank}}}:{}};
 return{sim,b,t:new Towers()};
}
function enemy(sim:DefendSim,x:number,y=20,hp=1e6,kind:Enemy["kind"]="orc"){
 const e:Enemy={id:sim.newId(),kind,x,y,hp,maxHp:hp,cd:0,flash:0,jx:0,jy:0,distract:-1,distractT:0,rollT:0,marked:false};
 sim.enemies.push(e);sim.reindexAfterDisplacement();return e;
}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test("Archer Tower has fire, focus and attunement-only Wisp; old ranks and undo/refunds persist",()=>{
 assert.deepEqual(nextSteps("archerTower").map(s=>s.type==="become"&&s.to),["brazierTower","hawkTower","wispTower"]);
 assert.equal(pathById("wispArrow").ranks.length,0);assert.deepEqual(nextSteps("wispTower"),[]);
 assert.ok(!buildingTree("wispTower").some(n=>n.path==="wispArrow"));
 const s=defaults();s.knowledge=100;s.defend.owned.archerTower=1;
 assert.ok(upgradeBuilding(s,{copy:"archerTower"},nextSteps("archerTower")[2]).ok);
 let loaded=decode(JSON.stringify(s));assert.equal(loaded.defend.owned.wispTower,1);assert.equal(loaded.knowledge,97);
 assert.ok(undoUpgrade(loaded,{copy:"wispTower"},"k:wispTower").ok);assert.equal(loaded.knowledge,100);
 assert.equal(loaded.defend.owned.archerTower,1);assert.equal(allocated("wispTower"),6);
 const old=defaults();old.defend.owned.hawkTower=1;old.defend.kept=[{kind:"hawkTower",path:"sharpshooters",rank:3}];
 loaded=decode(JSON.stringify(old));assert.deepEqual(loaded.defend.kept,old.defend.kept);
 assert.match(kindStats(old,"hawkTower","sharpshooters",3),/1000%.*10x/);
 assert.match(kindStats(old,"wispTower"),/one living arrow/);
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
 const e=enemy(sim,21);w.cooldown=100;for(let i=0;i<30;i++)t.step(sim,1/30);assert.equal(e.hp,e.maxHp);
});

test("Wisp parabola passes through its aim, sweeps all crossed enemies once and honors range",()=>{
 const{sim,t}=scene("wispTower"),primary=enemy(sim,23,20),c={x:20,y:20};
 t.step(sim,0);const w=sim.wisps[0],slice=w.slice!,mid=wispPosition(slice,.2);close(mid.x,primary.x);close(mid.y,primary.y);
 const p=slice.points[36],other=enemy(sim,p.x,p.y,1e6,"bat"),outside=enemy(sim,20+w.range+.1);
 t.step(sim,.4);close(primary.maxHp-primary.hp,archerDamage(0));close(other.maxHp-other.hp,archerDamage(0));
 assert.equal(outside.hp,outside.maxHp);assert.equal(sim.wisps[0],w);assert.equal(sim.arrows.length,0);
 assert.ok(slice.hit.has(primary.id)&&slice.hit.has(other.id));
 const pts=wispCurve({x:20,y:19},{x:20+w.range,y:20},c,w.range);
 assert.ok(pts.every(p=>Math.hypot(p.x-c.x,p.y-c.y)<=w.range+1e-8));
});

test("Wisp sweep survives a dead aim, shields apply, and destruction fades without combat",()=>{
 const{sim,b,t}=scene("wispTower"),aim=enemy(sim,23);t.step(sim,0);
 const old=sim.wisps[0],slice=old.slice!,p=slice.points[36],other=enemy(sim,p.x,p.y);
 aim.hp=0;t.step(sim,.4);assert.ok(other.hp<other.maxHp);
 const shield=scene("wispTower"),e=enemy(shield.sim,23,20,1e6,"shieldBearer");e.shieldHp=3000;(shield.sim as any).shieldGenerators=[e];
 shield.t.step(shield.sim,.4);assert.equal(e.hp,e.maxHp);assert.equal(e.shieldHp,3000-archerDamage(0));
 sim.built[b.id]=0;const hp=other.hp;t.step(sim,.01);assert.ok(old.fade!==undefined);assert.equal(old.slice,undefined);assert.equal(other.hp,hp);
 sim.built[b.id]=b.cells.length;t.step(sim,.01);assert.notEqual(sim.wispOwners.get(b.id),old);
 finishWisps(sim,1);assert.ok(!sim.wisps.includes(old));assert.equal(sim.wispOwners.size,1);
});

test("Wisp tendrils stay finite during fast slices, extend smoothly and consume no combat state",()=>{
 const{sim,t}=scene("wispTower");enemy(sim,25);t.step(sim,0);const w=sim.wisps[0];let state:WispCloth|undefined;
 for(let i=0;i<300;i++){
  t.step(sim,1/30);state=wispTendrils(w,state);
  const link=(WISP.idleLength+(WISP.sliceLength-WISP.idleLength)*w.energy)/(WISP.segments-1);
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

test("Wisp sweep hits are independent of how a fixed trajectory is stepped",()=>{
 const coarse=scene("wispTower"),fine=scene("wispTower");
 for(const s of[coarse,fine]){enemy(s.sim,23);s.t.step(s.sim,0);const p=s.sim.wisps[0].slice!.points[32];enemy(s.sim,p.x,p.y);}
 coarse.t.step(coarse.sim,.4);for(let i=0;i<24;i++)fine.t.step(fine.sim,1/60);
 assert.deepEqual(coarse.sim.enemies.map(e=>e.hp),fine.sim.enemies.map(e=>e.hp));
});

test("An attunement without later ranks cannot accidentally unlock a future ultimate",()=>{
 const a=ATTUNED.find(a=>a.kind==="archerTower")!,before=a.ultimate;
 try{
  a.ultimate="nanoTower";
  assert.deepEqual(nextSteps("hawkTower",{path:"sharpshooters",rank:3}),[]);
  assert.equal(buildingTree("hawkTower",{path:"sharpshooters",rank:3}).find(n=>n.id==="k:nanoTower")!.state,"locked");
 }finally{a.ultimate=before;}
});
