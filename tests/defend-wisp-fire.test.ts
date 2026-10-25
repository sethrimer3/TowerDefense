import {test} from "node:test";
import assert from "node:assert/strict";
import {defaults,decode} from "../src/save.ts";
import {DefendSim,type Enemy} from "../src/defend/sim.ts";
import {CellType,generateCity} from "../src/defend/citygen.ts";
import {defaultLayout,fitLayout} from "../src/defend/layout.ts";
import {archerDamage} from "../src/defend/catalog.ts";
import {Towers} from "../src/defend/towers.ts";
import {leaveWispFire,stepWispFire} from "../src/defend/wisp-fire.ts";
import {wispFlames} from "../src/defend/wisp-fire-art.ts";
import {WISP,WISP_FIRE} from "../src/knowledge-paths.ts";
import {nextSteps,upgradeBuilding,undoUpgrade,allocated} from "../src/specializations.ts";
import {kindStats} from "../src/ui/specialty.ts";

function scene(rank=2) {
 const sim=new DefendSim(generateCity(fitLayout(defaultLayout()),4),defaults().defend.levels,1);
 sim.enemies=[];sim.soldiers=[];sim.civilians=[];sim.solid.fill(0);sim.foeSolid.fill(0);sim.ownSolid.fill(0);sim.map.type.fill(CellType.STREET);
 const b={...sim.keep,kind:"wispTower" as const,rect:{x:19,y:19,w:2,h:2},structureUid:42};sim.map.buildings[b.id]=b;
 sim.bonuses={...sim.bonuses,structurePaths:rank?{42:{wispTower:{path:"wispArrow",rank}}}:{}};
 const t=new Towers();t.step(sim,0);
 return {sim,b,t,owner:sim.wispOwners.get(b.id)!,fire:sim.wispOwners.get(b.id)!.fire};
}
function enemy(sim:DefendSim,x:number,y:number,kind:Enemy["kind"]="orc") {
 const e:Enemy={id:sim.newId(),kind,x,y,hp:1e6,maxHp:1e6,cd:0,flash:0,jx:0,jy:0,distract:-1,distractT:0,rollT:0,marked:false};
 sim.enemies.push(e);sim.reindexAfterDisplacement();return e;
}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const clear=(s:ReturnType<typeof scene>)=>{s.sim.enemies=[];s.sim.reindexAfterDisplacement();};
const fireOnly=(s:ReturnType<typeof scene>)=>{s.owner.arrows=[];s.owner.refill=0;s.sim.wisps=s.sim.wisps.filter(w=>w.fire);};
function spendFire(s:ReturnType<typeof scene>) {
 for(const w of s.fire!.arrows)for(let i=0;i<10;i++)enemy(s.sim,w.x,w.y);
 s.t.step(s.sim,.01);assert.equal(s.fire!.arrows.length,0);clear(s);
}

test("Fire arrows is rank II, costs 4,004 Knowledge and persists/refunds and leads to Lightning arrow",()=>{
 const save=defaults();save.knowledge=5000;save.defend.owned.wispTower=1;
 save.defend.kept=[{kind:"wispTower",path:"wispArrow",rank:1}];
 const target={copy:"wispTower" as const,wear:{path:"wispArrow" as const,rank:1}};
 assert.ok(upgradeBuilding(save,target,nextSteps("wispTower",target.wear)[0]).ok);
 const loaded=decode(JSON.stringify(save));assert.equal(loaded.knowledge,996);
 assert.deepEqual(loaded.defend.kept,[{kind:"wispTower",path:"wispArrow",rank:2}]);
 assert.equal(allocated("wispTower",{path:"wispArrow",rank:2}),4014);
 assert.deepEqual(nextSteps("wispTower",{path:"wispArrow",rank:2}),[{type:"path",path:"wispArrow",rank:3,cost:16004}]);
 assert.match(kindStats(loaded,"wispTower","wispArrow",2),/2 fire arrows.*10 direct hits.*6s.*2s trails.*fire damage/);
 assert.ok(undoUpgrade(loaded,{copy:"wispTower",wear:{path:"wispArrow",rank:2}},"p:wispArrow:2").ok);
 assert.equal(loaded.knowledge,5000);assert.deepEqual(loaded.defend.kept,save.defend.kept.map(k=>({...k,rank:1})));
});

test("Rank II starts with three blue plus two fire arrows; earlier ranks have no fire state",()=>{
 for(const rank of[0,1]){const s=scene(rank);assert.equal(s.fire,undefined);assert.equal(s.sim.wispFireTrails.length,0);}
 const s=scene();assert.equal(s.owner.arrows.length,3);assert.equal(s.fire!.arrows.length,2);
 assert.deepEqual(s.fire!.arrows.map(w=>w.hitsLeft),[10,10]);assert.ok(s.owner.arrows.every(w=>w.hitsLeft===30));
 assert.equal(new Set(s.sim.wisps.map(w=>`${w.x},${w.y}`)).size,5);
 assert.equal(s.fire!.capacity,2);close(s.fire!.refill,0);
});

test("Each fire arrow delivers exactly ten direct contacts, then one fire-element explosion",()=>{
 const s=scene();fireOnly(s);const originals=[...s.fire!.arrows],events:{projectile:boolean;element:string;amount:number}[]=[];
 const hurt=s.sim.hurtEnemy.bind(s.sim);
 s.sim.hurtEnemy=((e,amount,flash,source,origin,projectile,element,...rest)=>{
  events.push({projectile:!!projectile,element:element??"physical",amount});
  return hurt(e,amount,flash,source,origin,projectile,element,...rest);
 }) as typeof s.sim.hurtEnemy;
 for(const w of originals)for(let i=0;i<15;i++)enemy(s.sim,w.x,w.y);
 s.t.step(s.sim,.01);
 assert.equal(s.fire!.arrows.length,0);assert.equal(events.filter(e=>e.projectile).length,20);
 assert.ok(events.every(e=>e.element==="fire"));
 assert.equal(events.filter(e=>!e.projectile&&e.amount===2*archerDamage(0)).length,60,"each of two blasts hits each of 30 enemies once");
 assert.ok(originals.every(w=>w.hitsLeft===0&&w.burst!==undefined&&w.slice===undefined));
 const count=events.length;s.t.step(s.sim,.3);assert.equal(events.length,count,"spent arrow does not explode again");
});

test("Six-second fire refills are sequential and independent from the blue three-second timer",()=>{
 const s=scene();s.t.step(s.sim,20);close(s.fire!.refill,0);spendFire(s);
 assert.equal(s.owner.arrows.length,3);close(s.owner.refill,0);close(s.fire!.refill,.01);
 s.t.step(s.sim,0);close(s.fire!.refill,.01);
 s.t.step(s.sim,5.98);assert.equal(s.fire!.arrows.length,0);
 s.t.step(s.sim,.01);assert.equal(s.fire!.arrows.length,1);close(s.fire!.refill,0);
 s.t.step(s.sim,5.99);assert.equal(s.fire!.arrows.length,1);
 s.t.step(s.sim,.01);assert.equal(s.fire!.arrows.length,2);assert.ok(s.fire!.arrows.every(w=>w.hitsLeft===10));
 s.t.step(s.sim,30);close(s.fire!.refill,0);assert.equal(s.fire!.arrows.length,2);
});

test("A lasting ribbon hits ground and flying targets without spending an arrow's direct budget",()=>{
 const s=scene(),w=s.fire!.arrows[0],a=enemy(s.sim,24,22),b=enemy(s.sim,24,22,"bat"),outside=enemy(s.sim,24,26);
 leaveWispFire(s.sim,w,{x:23.5,y:22},{x:24.5,y:22},0,.1,10);
 stepWispFire(s.sim,.5);
 assert.ok(a.hp<a.maxHp);close(a.hp,b.hp);assert.equal(outside.hp,outside.maxHp);assert.equal(w.hitsLeft,10);
 stepWispFire(s.sim,2);close(a.maxHp-a.hp,21);assert.equal(s.sim.wispFireTrails.length,0);
 const hp=a.hp;stepWispFire(s.sim,5);close(a.hp,hp);
});

test("Crossing segments from one arrow do not multiply DPS, while separate arrows stack",()=>{
 const s=scene(),e=enemy(s.sim,24,22),[one,two]=s.fire!.arrows;
 leaveWispFire(s.sim,one,{x:23,y:22},{x:25,y:22},0,.1,10);
 leaveWispFire(s.sim,one,{x:24,y:21},{x:24,y:23},0,.1,10);
 leaveWispFire(s.sim,two,{x:23,y:22},{x:25,y:22},0,.1,10);
 stepWispFire(s.sim,1);
 // Both ribbons begin covering this target at the same fractional timestamp.
 const rate=(e.maxHp-e.hp)/2;
 assert.ok(rate<10&&rate>9);assert.equal(one.hitsLeft,10);assert.equal(two.hitsLeft,10);
 const coarse=scene(),target=enemy(coarse.sim,24,22),w=coarse.fire!.arrows[0];
 leaveWispFire(coarse.sim,w,{x:23,y:22},{x:25,y:22},0,.1,10);stepWispFire(coarse.sim,1);
 close(target.maxHp-target.hp,rate);
});

test("Direct hits, ribbons and fiery explosions use fire resistances rather than generic explosion damage",()=>{
 const s=scene();fireOnly(s);const w=s.fire!.arrows[0];
 s.fire!.arrows=[w];s.sim.wisps=[w];
 const immune=enemy(s.sim,w.x,w.y,"slagGolem"),weak=enemy(s.sim,w.x,w.y,"iceGolem"),resistant=enemy(s.sim,w.x,w.y,"cinderImp");
 w.hitsLeft=1;s.t.step(s.sim,.01);
 assert.equal(immune.hp,immune.maxHp,"fire-immune target resists contact and blast");
 close(weak.maxHp-weak.hp,4*archerDamage(0));close(resistant.maxHp-resistant.hp,.5*archerDamage(0));
 const trail=scene(),a=enemy(trail.sim,24,22,"slagGolem"),b=enemy(trail.sim,24,22,"iceGolem"),c=enemy(trail.sim,24,22);
 leaveWispFire(trail.sim,trail.fire!.arrows[0],{x:23,y:22},{x:25,y:22},0,.1,10);stepWispFire(trail.sim,1);
 assert.equal(a.hp,a.maxHp);assert.ok(b.maxHp-b.hp>c.maxHp-c.hp);
});

test("Shielded contacts spend fire budget, and shields also intercept ribbon and explosion damage",()=>{
 const s=scene();fireOnly(s);const w=s.fire!.arrows[0];s.fire!.arrows=[w];s.sim.wisps=[w];
 const e=enemy(s.sim,w.x,w.y,"shieldBearer");e.shieldHp=1e6;(s.sim as any).shieldGenerators=[e];
 w.hitsLeft=1;s.t.step(s.sim,.01);assert.equal(w.hitsLeft,0);assert.equal(e.hp,e.maxHp);
 close(1e6-e.shieldHp!,3*archerDamage(0));
 const trail=scene(),shield=enemy(trail.sim,24,22,"shieldBearer");shield.shieldHp=1e6;(trail.sim as any).shieldGenerators=[shield];
 leaveWispFire(trail.sim,trail.fire!.arrows[0],{x:23,y:22},{x:25,y:22},0,.1,10);stepWispFire(trail.sim,1);
 assert.equal(shield.hp,shield.maxHp);assert.ok(shield.shieldHp!<1e6);
});

test("Fast attack passes leave continuous ribbons, while idle flame tails stay harmless",()=>{
 const s=scene();s.t.step(s.sim,2);assert.equal(s.sim.wispFireTrails.length,0);
 enemy(s.sim,26,20);s.t.step(s.sim,.3);
 assert.ok(s.sim.wispFireTrails.length>0);
 for(const trail of s.sim.wispFireTrails)for(let i=1;i<trail.segments.length;i++) {
  const a=trail.segments[i-1],b=trail.segments[i];
  assert.ok(Math.hypot(a.b.x-b.a.x,a.b.y-b.a.y)<1e-7);close(a.end,b.start);
 }
 assert.ok(s.fire!.arrows.every(w=>w.hitsLeft<=10));
});

test("Ribbon damage/lifetimes agree across fine/coarse time cuts and do not run beyond expiry",()=>{
 const coarse=scene(),fine=scene();
 for(const s of[coarse,fine]){enemy(s.sim,24,22);leaveWispFire(s.sim,s.fire!.arrows[0],{x:23,y:22},{x:25,y:22},0,.1,10);}
 stepWispFire(coarse.sim,5);for(let i=0;i<300;i++)stepWispFire(fine.sim,1/60);
 close(coarse.sim.enemies[0].hp,fine.sim.enemies[0].hp);assert.equal(fine.sim.wispFireTrails.length,0);
});

test("An arrow can leave another damaging ribbon after its old trail expires during idle flight",()=>{
 const s=scene(),w=s.fire!.arrows[0],e=enemy(s.sim,24,22);
 leaveWispFire(s.sim,w,{x:23,y:22},{x:25,y:22},0,.1,10);stepWispFire(s.sim,3);
 assert.equal(s.sim.wispFireTrails.length,0);const hp=e.hp;
 leaveWispFire(s.sim,w,{x:23,y:22},{x:25,y:22},3,3.1,10);stepWispFire(s.sim,1);
 assert.ok(e.hp<hp);assert.equal(s.sim.wispFireTrails.length,1);
});

test("Source destruction cancels fire regeneration while existing ribbons finish their own lifetime",()=>{
 const s=scene(),w=s.fire!.arrows[0],e=enemy(s.sim,24,22);
 leaveWispFire(s.sim,w,{x:23,y:22},{x:25,y:22},0,.1,10);
 s.sim.built[s.b.id]=0;s.t.step(s.sim,1);
 assert.equal(s.sim.wispOwners.size,0);assert.ok(e.hp<e.maxHp);assert.ok(s.sim.wispFireTrails.length>0);
 s.t.step(s.sim,3);assert.equal(s.sim.wispFireTrails.length,0);assert.equal(s.sim.wisps.length,0);
 s.sim.built[s.b.id]=s.b.cells.length;s.t.step(s.sim,0);
 const rebuilt=s.sim.wispOwners.get(s.b.id)!;assert.equal(rebuilt.arrows.length,3);assert.equal(rebuilt.fire!.arrows.length,2);
});

test("Fire-tail presentation is flame-shaped, finite, harmless and stable under Reduce Motion",()=>{
 const s=scene();enemy(s.sim,26,20);s.t.step(s.sim,.3);const w=s.fire!.arrows[0],before=JSON.stringify(w);
 const flames=wispFlames(w);assert.equal(flames.length,16);
 assert.ok(flames.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.alpha>=0&&p.alpha<=1));
 assert.deepEqual(wispFlames(w,true),wispFlames({...w,time:w.time+1},true));
 assert.equal(JSON.stringify(w),before);
});

test("Active fire ribbons stay lifetime-bounded during a sustained fight and expire completely",()=>{
 const s=scene();enemy(s.sim,26,20);
 for(let i=0;i<900;i++) {
  s.t.step(s.sim,1/60);
  for(const trail of s.sim.wispFireTrails) {
   assert.ok(trail.segments.every(segment=>segment.end+WISP_FIRE.trailLife>s.sim.wispFireTime));
   assert.ok(trail.segments.length<3000);
  }
 }
 clear(s);s.t.step(s.sim,4);assert.equal(s.sim.wispFireTrails.length,0);
 assert.ok(s.owner.arrows.every(w=>w.hitsLeft<=WISP.hits));
});


test("Blue and fire inventories replenish on distinct three/six-second schedules after simultaneous exhaustion",()=>{
 const s=scene();
 for(const w of s.owner.arrows)for(let i=0;i<30;i++)enemy(s.sim,w.x,w.y);
 for(const w of s.fire!.arrows)for(let i=0;i<10;i++)enemy(s.sim,w.x,w.y);
 s.t.step(s.sim,.01);clear(s);assert.equal(s.owner.arrows.length,0);assert.equal(s.fire!.arrows.length,0);
 s.t.step(s.sim,2.99);assert.equal(s.owner.arrows.length,1);assert.equal(s.fire!.arrows.length,0);
 s.t.step(s.sim,3);assert.equal(s.owner.arrows.length,2);assert.equal(s.fire!.arrows.length,1);
 s.t.step(s.sim,6);assert.equal(s.owner.arrows.length,3);assert.equal(s.fire!.arrows.length,2);
 close(s.owner.refill,0);close(s.fire!.refill,0);
});

test("Actual curved fire passes, damage and ribbon timing agree across fine/coarse simulation steps",()=>{
 const coarse=scene(),fine=scene();
 for(const s of[coarse,fine]){fireOnly(s);enemy(s.sim,26,20);enemy(s.sim,25,22);}
 coarse.t.step(coarse.sim,.7);for(let i=0;i<42;i++)fine.t.step(fine.sim,1/60);
 for(let i=0;i<2;i++) {
  close(coarse.sim.enemies[i].hp,fine.sim.enemies[i].hp);
  close(coarse.fire!.arrows[i].x,fine.fire!.arrows[i].x);close(coarse.fire!.arrows[i].y,fine.fire!.arrows[i].y);
  assert.equal(coarse.fire!.arrows[i].hitsLeft,fine.fire!.arrows[i].hitsLeft);
 }
 close(coarse.sim.wispFireTime,fine.sim.wispFireTime);
});


test("The tenth-contact fire explosion still resolves when reflection destroys its source on that hit",()=>{
 const s=scene();fireOnly(s);const w=s.fire!.arrows[0];s.fire!.arrows=[w];s.sim.wisps=[w];w.hitsLeft=1;
 const mirror=enemy(s.sim,w.x,w.y,"mirrorKnight"),nearby=enemy(s.sim,w.x+1.5,w.y);
 s.sim.hp[s.b.id]=.01;s.t.step(s.sim,.01);
 assert.equal(s.sim.wispOwners.size,0);assert.equal(w.hitsLeft,0);assert.ok(w.burst!==undefined);
 close(mirror.maxHp-mirror.hp,3*archerDamage(0));close(nearby.maxHp-nearby.hp,2*archerDamage(0));
});
