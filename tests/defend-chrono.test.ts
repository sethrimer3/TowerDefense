import {DarkKeeps} from "../src/defend/dark-wizards.ts";
import {stepUndead} from "../src/defend/necromancy.ts";
import {stepReinforcement} from "../src/defend/reinforcements.ts";
import {stepHero} from "../src/defend/hero.ts";
import {stepValkyrie} from "../src/defend/valkyries.ts";
import {stepShade} from "../src/defend/shadow.ts";
import {meleeFacing} from "../src/defend/melee-facing.ts";
import {test} from "node:test";
import assert from "node:assert/strict";
import {defaults,decode} from "../src/save.ts";
import {bonuses} from "../src/progression.ts";
import {CHRONO_PATHS,CHRONO,chronoAllocated,upgradeChrono,undoChrono,respecChrono} from "../src/chrono-upgrades.ts";
import {DefendSim,type Arrow,type Enemy,type Soldier} from "../src/defend/sim.ts";
import {CellType,generateCity} from "../src/defend/citygen.ts";
import {defaultLayout,fitLayout} from "../src/defend/layout.ts";
import {Towers,stepArrows,stepShells} from "../src/defend/towers.ts";
import {chronoTarget,captureShot,circleContact,stepChrono,storeDivine,syncChrono,chronoRange} from "../src/defend/chrono.ts";
import {stepSwordsman,stepArcher} from "../src/defend/troops.ts";
import {Wizards} from "../src/defend/wizard.ts";
import {stepBallistaBolts} from "../src/defend/wall-defenses.ts";
import {nextSteps,upgradeBuilding,undoUpgrade,fullTree} from "../src/specializations.ts";
import {sharedBranches,kindStats,graftedGraph} from "../src/ui/specialty.ts";
import {structurePixels} from "../src/defend/tower-art.ts";
import {reachOf} from "../src/defend/inspect.ts";

function scene(ranks:NonNullable<ReturnType<typeof defaults>["defend"]["chronoRanks"]>={}){
 const sim=new DefendSim(generateCity(fitLayout(defaultLayout()),4),defaults().defend.levels,1);
 sim.enemies=[];sim.soldiers=[];sim.civilians=[];sim.solid.fill(0);sim.foeSolid.fill(0);sim.ownSolid.fill(0);sim.map.type.fill(CellType.STREET);
 const b={...sim.keep,kind:"chronoTower" as const,rect:{x:19,y:19,w:2,h:2},structureUid:42};sim.map.buildings[b.id]=b;
 sim.bonuses={...sim.bonuses,chrono:{...ranks}};syncChrono(sim);return{sim,b,s:sim.chrono.get(b.id)!};
}
function enemy(sim:DefendSim,x=23,y=20,kind:Enemy["kind"]="orc"){
 const e:Enemy={id:sim.enemies.length+1,kind,x,y,hp:100000,maxHp:100000,cd:0,jx:0,jy:0,distract:-1,distractT:0,rollT:0,marked:false,flash:0};
 sim.enemies.push(e);sim.reindexAfterDisplacement();return e;
}
const arrow=(damage=10):Arrow=>({x:8,y:20,target:-1,tx:20,ty:20,damage,life:10});
const troop=(kind:Soldier["kind"],home:number,x=18.5):Soldier=>({id:55,kind,home,x,y:20,hp:100,maxHp:100,damage:10,cd:0,target:-1,path:[],thinkT:0,flash:0});
function supply(sim:DefendSim,n:number){for(let i=0;i<n;i++)assert.ok(captureShot(sim,{kind:"arrow",shot:arrow(i+1)},{x:20,y:20},{x:20,y:20}));}

test("Ultimate Archer merge requires three maxed attunements, saves and undoes into its components",()=>{
 const save=defaults();save.knowledge=1e8;
 for(const[kind,path]of [["brazierTower","fireArrows"],["hawkTower","sharpshooters"],["wispTower","wispArrow"]] as const){save.defend.owned[kind]=1;save.defend.kept.push({kind,path,rank:3});}
 const target={copy:"brazierTower" as const,wear:{path:"fireArrows" as const,rank:3}},merge=nextSteps("brazierTower",target.wear).find(s=>s.type==="merge")!;
 assert.ok(merge);assert.ok(upgradeBuilding(save,target,merge).ok);assert.equal(save.defend.owned.chronoTower,1);
 for(const kind of ["brazierTower","hawkTower","wispTower"] as const)assert.equal(save.defend.owned[kind],0);
 const loaded=decode(JSON.stringify(save));assert.equal(loaded.defend.owned.chronoTower,1);
 assert.ok(fullTree("watchTower").some(n=>n.kind==="chronoTower"));
 assert.ok(undoUpgrade(loaded,{copy:"chronoTower"},"k:chronoTower").ok);
 assert.equal(loaded.defend.owned.chronoTower,0);
 for(const kind of ["brazierTower","hawkTower","wispTower"] as const)assert.equal(loaded.defend.owned[kind],1);
});
test("all four independent branches can coexist, persist, snapshot, undo and refund",()=>{
 const save=defaults();save.knowledge=1e9;const before=save.knowledge;
 for(const p of CHRONO_PATHS)for(const _ of p.ranks)assert.ok(upgradeChrono(save,p.id).ok);
 assert.deepEqual(save.defend.chronoRanks,{storage:2,divine:5,focus:2,amplify:3});
 assert.equal(before-save.knowledge,chronoAllocated(save.defend.chronoRanks));
 const loaded=decode(JSON.stringify(save));assert.deepEqual(loaded.defend.chronoRanks,save.defend.chronoRanks);
 const snap=bonuses(loaded);assert.deepEqual(snap.chrono,loaded.defend.chronoRanks);
 loaded.defend.chronoRanks!.storage=1;assert.equal(snap.chrono!.storage,2);
 loaded.defend.chronoRanks!.storage=2;
 assert.ok(undoChrono(loaded,"divine",3).ok);assert.equal(loaded.defend.chronoRanks!.divine,2);
 assert.ok(respecChrono(loaded).ok);assert.equal(loaded.knowledge,before);assert.equal(loaded.defend.chronoRanks,undefined);
 assert.equal(decode(JSON.stringify({version:1,defend:{chronoRanks:{storage:99,divine:5,foo:1}}})).defend.chronoRanks?.storage,undefined);
 assert.ok(sharedBranches("chronoTower"));assert.equal(graftedGraph(save,"chronoTower").filter(n=>n.id.startsWith("q:")).length,12);
 assert.match(kindStats(save,"chronoTower"),/90 stored shots.*0°.*250 stored hits.*10×/);
});
test("the field catches swept fast arrows, shells and bolts, freezes payloads, and obeys 30/60/90 capacity",()=>{
 assert.ok(Number.isFinite(circleContact({x:0,y:20},{x:40,y:20},{x:20,y:20},4)));
 for(const [rank,capacity]of [[0,30],[1,60],[2,90]]){
  const {sim,s}=scene({storage:rank});supply(sim,capacity);assert.equal(s.shots.length,capacity);
  assert.equal(chronoTarget(sim,{x:22,y:20},10),null);
  assert.equal(captureShot(sim,{kind:"arrow",shot:arrow()},{x:0,y:20},{x:40,y:20}),false);
 }
 const {sim,s}=scene();sim.arrows.push({...arrow(23),burn:4,burnFor:2});stepArrows(sim,2);assert.equal(sim.arrows.length,0);assert.equal(s.shots.length,1);
 const frozen=JSON.stringify(s.shots);stepChrono(sim,5);assert.equal(JSON.stringify(s.shots),frozen);
 sim.shells.push({x0:0,y0:20,x1:40,y1:20,t:0,dur:1,damage:80,r:2,mortar:{life:3,dps:5}});stepShells(sim,1);assert.equal(sim.shells.length,0);assert.equal(s.shots[1].kind,"shell");
 sim.ballistaBolts.push({x:0,y:20,dx:1,dy:0,left:40,range:40,pierce:2,damage:50,hits:[],building:1,aim:1});stepBallistaBolts(sim,2);assert.equal(s.shots[2].kind,"ballista");
 assert.equal(sim.enemies.length,0);
});
test("release commits all shots at a fixed 45/20/0-degree fan and never recaptures them",()=>{
 for(const [rank,degrees]of [[0,45],[1,20],[2,0]]){
  const {sim,s}=scene({focus:rank});supply(sim,3);const e=enemy(sim,23,20);
  stepChrono(sim,0);assert.equal(s.queue.length,2);e.hp=0;sim.reindexAfterDisplacement();stepChrono(sim,.08);
  assert.equal(s.queue.length,0);assert.equal(sim.arrows.length,3);
  const angles=sim.arrows.map(a=>Math.atan2(a.release!.dy,a.release!.dx));
  assert.ok(Math.abs((angles[2]-angles[0])*180/Math.PI-degrees)<1e-8);
  assert.ok(sim.arrows.every(a=>a.chronoReleased));
  stepArrows(sim,.05);assert.equal(s.shots.length,0);assert.equal(sim.arrows.length,3);
 }
});
test("released arrows retain burning and explosive payloads, fly straight and hit along the fan",()=>{
 const {sim,s}=scene({focus:2});
 captureShot(sim,{kind:"arrow",shot:{...arrow(33),burn:7,burnFor:2}},{x:20,y:20},{x:20,y:20});
 const e=enemy(sim,23,20);stepChrono(sim,0);const hp=e.hp;stepArrows(sim,.3);
 assert.ok(e.hp<hp);assert.equal(e.burnDps,7);assert.equal(s.shots.length,0);
 const p={...arrow(70),blast:2,shot:"rocket" as const};captureShot(sim,{kind:"arrow",shot:p},{x:20,y:20},{x:20,y:20});stepChrono(sim,0);const before=e.hp;stepArrows(sim,.5);assert.ok(e.hp<before);
});
test("Divine Arrow respects hit capacity, multiplies the sum once, resets at launch, and pierces ground/flying enemies to map edge",()=>{
 const {sim,b,s}=scene({divine:1,amplify:2});
 for(let i=0;i<50;i++)assert.ok(storeDivine(sim,b.id,2));assert.equal(storeDivine(sim,b.id,99),false);assert.equal(s.damage,100);
 const one=enemy(sim,23),two=enemy(sim,40,20,"bat"),off=enemy(sim,30,23);
 stepChrono(sim,0);assert.equal(s.damage,0);assert.equal(s.hits,0);assert.equal(sim.divineArrows[0].damage,500);
 stepChrono(sim,1);assert.equal(one.hp,99500);assert.equal(two.hp,99500);assert.equal(off.hp,100000);
 stepChrono(sim,.1);assert.equal(one.hp,99500,"no second hit from the trail");
 stepChrono(sim,2);assert.equal(sim.divineArrows.length,0);
});
test("idle towers and troops contribute only after their real target checks; no friendly HP or rewards change",()=>{
 const {sim,b,s}=scene({divine:1});
 // Reuse an existing house id so its cell HP storage remains valid.
 const other=sim.map.buildings.find(o=>o.id!==b.id)!;other.kind="archerTower";other.rect={x:23,y:19,w:2,h:2};
 const towers=new Towers(),initialHp=Array.from(sim.hp);towers.step(sim,.01);assert.ok(sim.arrows.length>0);stepArrows(sim,1);assert.ok(s.shots.length>0);
 const sword=troop("sword",b.id);sim.soldiers.push(sword);stepSwordsman(sim,sword,0);assert.equal(s.hits,1);assert.ok(sword.cd>0);
 stepSwordsman(sim,sword,0);assert.equal(s.hits,1,"cooldown prevents free hits");
 const e=enemy(sim,sword.x+.2,20);sword.target=e.id;sword.cd=0;const hits=s.hits;stepSwordsman(sim,sword,0);assert.ok(e.hp<e.maxHp);assert.equal(s.hits,hits);
 assert.deepEqual(Array.from(sim.hp),initialHp);
});
test("normal targets take precedence for archer/beam attackers and Divine unlock is required",()=>{
 const {sim,b,s}=scene();const sword=troop("sword",b.id);stepSwordsman(sim,sword,0);assert.equal(s.hits,0);
 sim.bonuses.chrono={divine:1};const wizard=sim.map.buildings.find(o=>o.id!==b.id)!;wizard.kind="stormTower";wizard.rect={x:22,y:19,w:2,h:2};
 const w=new Wizards();w.step(sim,.01);assert.equal(s.hits,1);
 const e=enemy(sim,24,20);w.rest.clear();const before=s.hits;w.step(sim,.01);assert.equal(s.hits,before);assert.equal(sim.frosts.length,1);assert.ok(sim.frosts[0].dx>0,"the next ice attack aims at the enemy, not the friendly tower");
 const archer=troop("archer",b.id,24);stepArcher(sim,archer,0);assert.ok(sim.arrows.some(a=>a.target===e.id));
});
test("destroying the tower discards its reserve; fresh battles never restore ammunition",()=>{
 const {sim,b,s}=scene({divine:1});supply(sim,2);storeDivine(sim,b.id,12);
 // Building destruction uses its occupied map cells, not a private ammunition flag.
 const intact=sim.intact.bind(sim);sim.intact=o=>o.id===b.id?false:intact(o);stepChrono(sim,0);assert.equal(sim.chrono.size,0);
 const fresh=scene({divine:1});assert.equal(fresh.s.shots.length,0);assert.equal(fresh.s.damage,0);
 assert.equal(reachOf(fresh.b,fresh.sim)[0].r,chronoRange(fresh.sim));
 const a=structurePixels("chronoTower",32,32,4,0,"");assert.ok(a.some(p=>p!==0));
});

test("piercing shots hit enemies before entering a field, then freeze before hitting enemies inside",()=>{
 const {sim,s}=scene(),before=enemy(sim,5),inside=enemy(sim,15);
 sim.arrows.push({...arrow(20),x:0,tx:40,pierce:{width:.2,hits:[]}});stepArrows(sim,1);
 assert.equal(before.hp,99980);assert.equal(inside.hp,100000);assert.equal(s.shots.length,1);
 before.hp=100000;
 sim.ballistaBolts.push({x:0,y:20,dx:1,dy:0,left:40,range:40,pierce:3,damage:50,hits:[],building:1,aim:1});stepBallistaBolts(sim,3);
 assert.equal(before.hp,99950);assert.equal(inside.hp,100000);assert.equal(s.shots.length,2);
});
test("an idle cannon shell expires harmlessly if its receiving field fills before arrival",()=>{
 const {sim,b,s}=scene(),source=sim.map.buildings.find(o=>o.id!==b.id)!;source.kind="cannonTower";source.rect={x:29,y:19,w:2,h:2};
 const towers=new Towers();towers.step(sim,0);assert.equal(sim.shells.length,1);assert.equal(sim.shells[0].chronoAim,b.id);
 supply(sim,30);const hp=Array.from(sim.hp);stepShells(sim,10);
 assert.equal(sim.shells.length,0);assert.equal(s.shots.length,30);assert.deepEqual(Array.from(sim.hp),hp);
 assert.equal(sim.effects.filter(f=>f.kind==="boom").length,0);
});

test("released shells retarget the trigger distance and keep their explosive and burn payloads",()=>{
 const {sim,s}=scene({focus:2});
 const shell={x0:0,y0:20,x1:20,y1:20,t:.5,dur:2,damage:77,r:2,grape:true,mortar:{life:3,dps:9}};
 assert.ok(captureShot(sim,{kind:"shell",shot:shell},{x:10,y:20},{x:20,y:20}));enemy(sim,24,20);stepChrono(sim,0);
 assert.equal(sim.shells.length,1);const released=sim.shells[0];
 assert.equal(released.x1,24);assert.equal(released.y1,20);assert.equal(released.damage,77);assert.equal(released.mortar!.dps,9);assert.ok(released.grape);
 stepShells(sim,2);assert.ok(sim.enemies[0].hp<100000);assert.equal(s.shots.length,0);
});
test("all melee families can make finite idle contributions and face the friendly tower",()=>{
 for(const kind of ["sword","brawler","assassin","spearman","hoplite","lancer","hero","valkyrie","shade"] as const){
  const {sim,b,s}=scene({divine:1}),unit=troop(kind,b.id);
  const step=kind==="hero"?stepHero:kind==="valkyrie"?stepValkyrie:kind==="shade"?stepShade:stepSwordsman;
  step(sim,unit,0);assert.equal(s.hits,1,kind);assert.equal(s.damage,unit.damage,kind);assert.ok(unit.cd>0);
  assert.equal(unit.target,-b.id-2);assert.ok(Math.abs(meleeFacing(sim,unit).angle)<1e-8,kind);
  step(sim,unit,0);assert.equal(s.hits,1,"an animation tick cannot charge again");
 }
});
test("summoned melee allies charge Divine Arrow, while summoned archers supply physical shots",()=>{
 for(const kind of ["undead","reinforcement"] as const)for(const range of [0,6]){
  const {sim,b,s}=scene({divine:1}),unit=troop(kind,b.id),look=range?"archer":"warrior";
  if(kind==="undead")unit.risen={life:20,size:.4,range,look};
  else unit.called={life:20,size:.4,range,look:range?"archer":"knight",post:{x:18,y:20},squad:1};
  (kind==="undead"?stepUndead:stepReinforcement)(sim,unit,0);
  if(range){stepArrows(sim,.1);assert.equal(s.shots.length,1,kind);}else assert.equal(s.hits,1,kind);
 }
});

test("incompatible beam and sky projectiles cannot enter the physical arsenal",()=>{
 const {sim,s}=scene({divine:1});
 for(const shot of [{...arrow(),chain:{next:[],from:{x:0,y:20}}},{...arrow(),sky:{t:0,delay:1,rain:false}}])
  assert.equal(captureShot(sim,{kind:"arrow",shot},{x:0,y:20},{x:40,y:20}),false);
 assert.equal(s.shots.length,0);assert.equal(s.damage,0,"only an actual incompatible attack deposits damage");
});

test("all damaging tower families contribute when idle, including final-rank fire volleys and keep loops",()=>{
 for(const [kind,path,rank,physical]of [
  ["archerTower",null,0,true],["brazierTower","fireArrows",3,true],["hawkTower","sharpshooters",3,true],
  ["cannonTower",null,0,true],["batteryTower","gunnery",3,true],["mortarTower","siegeShot",3,true],["wallBallista",null,0,true],
  ["wizardTower",null,0,false],["pyreTower","pyromancy",3,false],["frostTower","rime",3,false],["stormTower","storm",3,false],
  ["wispTower","wispArrow",3,false],["darkKeep",null,0,false],["keep",null,0,true],
 ] as const){
  const {sim,b,s}=scene({divine:1}),source=sim.map.buildings.find(o=>o.id!==b.id)!;
  source.kind=kind;source.rect={x:23,y:19,w:2,h:2};source.structureUid=101;
  if(path)sim.bonuses.structurePaths={101:{[kind]:{path,rank}}};
  if(kind==="keep")sim.bonuses.keep={arrowLoops:3};
  new Towers().step(sim,0);new Wizards().step(sim,0);new DarkKeeps().step(sim,0);
  stepArrows(sim,.1);stepShells(sim,.1);stepBallistaBolts(sim,.1);
  if(physical)assert.ok(s.shots.length>0,kind);else assert.ok(s.hits>0,kind);
  assert.equal(sim.enemies.length,0,"receivers never become real enemies");
 }
});
