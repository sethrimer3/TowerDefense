import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { bonuses } from "../src/progression.ts";
import { decodeDefendSave, setLayout } from "../src/defend/progress.ts";
import { defaultLayout, fitLayout, placeCityTile, placeStructure, moveStructureTo } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { UPGRADES, NO_BONUSES } from "../src/defend/catalog.ts";
import { center, cellAt } from "../src/defend/pathing.ts";
import { inSquare, clampToSquare } from "../src/defend/square-range-art.ts";
import { decodeOrders, placedBattleOrders } from "../src/defend/building-orders.ts";
import { applyOrders, restoreOrders, orderRange } from "../src/defend/building-controls.ts";
import { archerTowerRange } from "../src/defend/towers.ts";
import { deployment, fence } from "../src/defend/deployment.ts";

function fixture(kind="archerTower") {
  let layout=defaultLayout();
  layout=placeCityTile(layout,layout.keep.tx-1,layout.keep.ty)!;
  layout=placeStructure(layout,kind as any,layout.keep.tx-1,layout.keep.ty)!;
  const fit=fitLayout(layout);assert.ok(fit.ok);
  const map=generateCity(fit,3),levels=Object.fromEntries(UPGRADES.map(u=>[u.id,0])) as any;
  const sim=new DefendSim(map,levels,3),b=map.buildings.find(b=>b.kind===kind)!;
  const c=center(b.rect);
  const enemy=(id:number,dx:number,dy:number,hp=10,kind="orc") => {
    const e={...(sim as any).newEnemy(kind,c.x+dx,c.y+dy),id,hp,maxHp:hp,speed:0} as Enemy;
    sim.enemies.push(e);(sim as any).indexEnemies();return e;
  };
  return {layout,map,sim,b,c,enemy};
}

test("square acquisition includes corners, excludes a point just past one edge, and preserves Closest native ties",()=>{
 const {sim,b,c,enemy}=fixture();const r=archerTowerRange(sim,b);
 const corner=enemy(4,r,r),outside=enemy(5,r+.001,0);
 assert.equal(sim.buildingTarget(b,r),corner);
 assert.ok(!sim.enemiesInSquare(c.x,c.y,r).includes(outside));
 sim.enemies=[];const first=enemy(12,1,0),second=enemy(10,1,0);
 assert.equal(sim.buildingTarget(b,r),first);
 assert.equal(sim.buildingTarget(b,r),sim.nearestEnemy(c.x,c.y,r,false));
 assert.equal(sim.nearestEnemyInSquare(c.x,c.y,r,true),second);
});

test("each mode has stable ties, and First uses flow distance (straight distance for fliers)",()=>{
 const {sim,b,c,enemy}=fixture();const close=enemy(4,1,0,30),strong=enemy(3,3,0,90),weak=enemy(2,2,0,5);
 const choose=(targetMode:any)=>{applyOrders(sim,b,{targetMode});return sim.buildingTarget(b,9);};
 assert.equal(choose("closest"),close);assert.equal(choose("strongest"),strong);assert.equal(choose("weakest"),weak);
 sim.field.fill(Infinity);sim.field[cellAt(strong.x,strong.y)]=2;sim.field[cellAt(close.x,close.y)]=20;sim.field[cellAt(weak.x,weak.y)]=10;
 assert.equal(choose("first"),strong);
 strong.hp=weak.hp=30;assert.equal(choose("strongest"),close);
 const tied=enemy(1,1,0,30);assert.equal(choose("strongest"),tied);
 sim.enemies=[];const far=enemy(6,-3,0,10,"bat"),near=enemy(7,3,0,10,"bat");
 const k=center(sim.map.buildings[sim.keepId].rect),d=(e:Enemy)=>(e.x-k.x)**2+(e.y-k.y)**2;
 assert.equal(choose("first"),d(far)<d(near)?far:near);
});

test("Groups uses square grid neighbours and deterministic distance/id ties",()=>{
 const {sim,b,enemy}=fixture();const lone=enemy(1,1,0),a=enemy(2,4,4),other=enemy(3,5.4,5.4);
 applyOrders(sim,b,{targetMode:"groups"});
 assert.equal(sim.buildingTarget(b,10),a);
 sim.enemiesNear=()=>assert.fail("Groups must query square grid buckets");
 assert.equal(sim.buildingTarget(b,10),a);assert.notEqual(a,lone);assert.ok(other);
});

test("all crosshair modes apply only to nearby candidates and fall back to the whole range",()=>{
 for(const mode of ["closest","first","strongest","weakest","groups"] as const){
  const {sim,b,c,enemy}=fixture();
  const home=enemy(1,1,0,1000),near=enemy(2,5,0,20),at=enemy(3,6,0,10);
  sim.field.fill(100);sim.field[cellAt(at.x,at.y)]=1;sim.field[cellAt(near.x,near.y)]=2;
  applyOrders(sim,b,{targetMode:mode,crosshair:{x:6,y:0}});
  const chosen=sim.buildingTarget(b,10);assert.notEqual(chosen,home,mode);
  if(mode==="closest"||mode==="first"||mode==="weakest")assert.equal(chosen,at,mode);
  if(mode==="strongest")assert.equal(chosen,near);
  near.hp=at.hp=0;assert.equal(sim.buildingTarget(b,10),home,mode+" fallback");
 }
});

test("crosshair eligibility falls back for a ground-only gun; area is clipped to range",()=>{
 const {sim,b,enemy}=fixture();const ground=enemy(1,1,0),air=enemy(2,6,0,10,"bat"),outside=enemy(3,11,0);
 applyOrders(sim,b,{crosshair:{x:6,y:0}});
 assert.equal(sim.buildingTarget(b,10,e=>e.kind!=="bat"),ground);
 applyOrders(sim,b,{crosshair:{x:10,y:0}});
 assert.notEqual(sim.buildingTarget(b,10),outside);assert.ok(air);
});

test("range slider scales shooting/deployment, clamps points along their ray, and takes effect immediately",()=>{
 const {sim,b,enemy}=fixture();const base=archerTowerRange(sim,b),far=enemy(1,base,base);
 assert.equal(sim.buildingTarget(b,base),far);
 applyOrders(sim,b,{rangePercent:50,crosshair:{x:100,y:50}});
 const r=archerTowerRange(sim,b);assert.equal(r,base/2);
 const c=center(b.rect),at=sim.crosshairs.get(b.id)!;
 assert.equal(at.x-c.x,r);assert.equal(at.y-c.y,r/2);
 assert.equal(sim.buildingTarget(b,r),null);
 const f=fixture("barracks");applyOrders(f.sim,f.b,{rangePercent:10,rally:{x:100,y:50}});
 const s={home:f.b.id,kind:"sword",x:f.c.x,y:f.c.y,path:[]} as any,d=deployment(f.sim,s)!;
 assert.equal(d.r,1.6);s.x=d.x+d.r;s.y=d.y+d.r;fence(f.sim,s,d.x,d.y);assert.equal(s.x,d.x+d.r);
 s.x+=.01;fence(f.sim,s,d.x,d.y);assert.equal(s.x,d.x);
 assert.deepEqual(clampToSquare({x:0,y:0,r:4},{x:10,y:5}),{x:4,y:2});assert.ok(inSquare({x:0,y:0,r:4},4,4));
});

test("orders round-trip, old saves stay absent, invalid values drop, points follow moving homes and inventory clears them",()=>{
 const {layout}=fixture();const save=defaults();save.defend.owned.archerTower=1;save.defend.owned.cityTile=2;
 Object.assign(layout.structures[0],{targetMode:"weakest",rangePercent:35,rally:{x:1,y:2},crosshair:{x:-2,y:3}});
 setLayout(save.defend,layout);const decoded=decodeDefendSave(JSON.parse(JSON.stringify(save.defend)));
 assert.deepEqual(decodeOrders(decoded.layout.structures[0]),decodeOrders(layout.structures[0]));
 assert.deepEqual(decodeOrders({targetMode:"bad",rangePercent:36,rally:{x:NaN,y:0},crosshair:{x:"1",y:2}}),{});
 assert.deepEqual(placedBattleOrders(defaultLayout()),{});
 const snapshot=bonuses(save),fit=fitLayout(layout);assert.ok(fit.ok);const sim=new DefendSim(generateCity(fit,3),save.defend.levels,3,snapshot);restoreOrders(sim);
 const b=sim.map.buildings.find(b=>b.structureUid===layout.structures[0].uid)!;
 assert.ok(sim.crosshairs.has(b.id));assert.equal(sim.orders.get(b.id)?.targetMode,"weakest");
 const next={...layout,structures:[]};setLayout(save.defend,next);assert.ok(!JSON.stringify(save.defend.kept).includes("targetMode"));
 const old=decodeDefendSave(defaults().defend);assert.ok(!("buildingOrders" in old));assert.ok(!("rangePercent" in old.layout.keep));
});

test("saved offsets follow moved homes",()=>{
 const f=fixture();Object.assign(f.layout.structures[0],{rangePercent:50,crosshair:{x:2,y:1},targetMode:"first"});
 let moved:any=null;
 for(let qy=f.layout.keep.ty*4;qy<f.layout.keep.ty*4+4&&!moved;qy++)for(let qx=(f.layout.keep.tx-1)*4;qx<(f.layout.keep.tx-1)*4+4&&!moved;qx++){
  const l=moveStructureTo(f.layout,f.layout.structures[0].uid,{qx,qy});if(l&&l!==f.layout)moved=l;
 }
 assert.ok(moved);assert.deepEqual(decodeOrders(moved.structures[0]),decodeOrders(f.layout.structures[0]));
 const fit=fitLayout(moved);assert.ok(fit.ok);const sim=new DefendSim(generateCity(fit,3),f.sim.levels,3,{...NO_BONUSES,...placedBattleOrders(moved)});
 const b=sim.map.buildings.find(b=>b.structureUid===moved.structures[0].uid)!,c=center(b.rect);assert.deepEqual(sim.crosshairs.get(b.id),{x:c.x+2,y:c.y+1});
});

test("square spells/banner include corners while explosion queries remain circular",async()=>{
 const {sim,b,c,enemy}=fixture();const corner=enemy(1,3,3);
 assert.ok(sim.enemiesInSquare(c.x,c.y,3).includes(corner));assert.ok(!sim.enemiesNear(c.x,c.y,3).includes(corner));
 const {gravesNear}=await import('../src/defend/necromancy.ts');assert.equal(gravesNear({graves:[{x:c.x+3,y:c.y+3}]} as any,c).length,1);
 const {WarBanner,bannerInfluence}=await import('../src/defend/war-banner.ts');sim.warBanner=new WarBanner(c.x,c.y);assert.ok(bannerInfluence(sim,{x:c.x+5,y:c.y+5}));
 const {stepFrostNova}=await import('../src/defend/frost-nova.ts');assert.ok(sim.castFrostNova(c));stepFrostNova(sim,1/30);assert.ok(corner.freeze!>0);
});

test("Ambush orders survive movement, upgrades and waves, and reset with a new run",async()=>{
 const {AmbushSim}=await import('../src/campaign/ambush-sim.ts');const {build,freeSpot}=await import('./ambush-helpers.ts');
 const save=defaults(),s=new AmbushSim(0,save);s.gold=100000;const home=build(s,'archerTower'),b=s.map.buildings[home.id];
 applyOrders(s.engine,b,{targetMode:'strongest',rangePercent:50,crosshair:{x:2,y:1}});
 const spot=freeSpot(s,'archerTower');assert.ok(s.moveTo(home.id,spot.qx,spot.qy));assert.equal(s.engine.orders.get(home.id)?.targetMode,'strongest');
 const after=center(s.map.buildings[home.id].rect);assert.deepEqual(s.engine.crosshairs.get(home.id),{x:after.x+2,y:after.y+1});
 const offer=s.upgrades(home.id)[0];assert.ok(offer);assert.ok(s.upgrade(home.id,offer.step));assert.equal(s.engine.orders.get(home.id)?.rangePercent,50);
 assert.ok(s.send());for(let i=0;i<30;i++)s.step(1/30);assert.ok(s.engine.crosshairs.has(home.id));
 assert.equal(new AmbushSim(0,save).engine.orders.size,0);assert.equal(new AmbushSim(0,save).engine.crosshairs.size,0);
});

test("gate and wall ballista spots keep optional orders without changing defaults",async()=>{
 const {placeGate,placeBallista}=await import('../src/defend/layout.ts');
 const s=defaults(),k=s.defend.layout.keep;
 let l=placeCityTile(s.defend.layout,k.tx,k.ty-1)!;
 l=placeGate(l,{tx:k.tx,ty:k.ty-1,side:'n'})!;l=placeBallista(l,{vx:k.tx+1,vy:k.ty-1})!;
 s.defend.owned.cityTile=2;s.defend.owned.cityGate=1;s.defend.owned.wallBallista=1;
 Object.assign(l.gates[0],{targetMode:'first',rangePercent:75});Object.assign(l.ballistas[0],{targetMode:'weakest',rangePercent:40,crosshair:{x:2,y:0}});
 setLayout(s.defend,l);const d=decodeDefendSave(JSON.parse(JSON.stringify(s.defend)));
 assert.deepEqual(decodeOrders(d.layout.gates[0]),{targetMode:'first',rangePercent:75});
 assert.deepEqual(decodeOrders(d.layout.ballistas[0]),{targetMode:'weakest',rangePercent:40,crosshair:{x:2,y:0}});
 const snapshot=placedBattleOrders(d.layout);assert.equal(Object.keys(snapshot.buildingOrders!).length,2);
});
