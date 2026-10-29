import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSim } from '../src/campaign/sim.ts';
import { generateCastle } from '../src/campaign/castles.ts';
import { defaults } from '../src/save.ts';
import { PATHS } from '../src/knowledge-paths.ts';
import { TRAINS } from '../src/defend/deployment.ts';
import { cellAt } from '../src/defend/pathing.ts';
import { manaFor } from '../src/campaign/siege-mana.ts';
import { stepBlazes } from '../src/defend/mages.ts';
import { pierceHits } from '../src/defend/snipers.ts';
function battle(){const s=defaults();s.spellPaths.meteor='starfall';s.pathResearch.starfall={rank:1,spent:PATHS.find(p=>p.id==='starfall')!.ranks[0].cost};const sim=new CampaignSim('siege',0,[],s.defend.owned,s.defend.levels,generateCastle(45,100),s);sim.start();sim.step(1/30);return sim;}
test('Three homeless bearers stroll the castle, never fight, and do not respawn',()=>{
 const sim=battle(),units=sim.raid.defense.soldiers.filter(u=>u.kind==='flagBearer'),start=units.map(u=>({x:u.x,y:u.y}));assert.equal(units.length,3);
 sim.raid.defense.scenario!.recruits=()=>false;sim.raid.attack.soldiers=[];
 for(let i=0;i<900;i++){sim.raid.step(1/30);for(const u of units){assert.equal(u.home,-1);assert.equal(u.target,-1);assert.equal(u.damage,0);assert.equal(u.hp,1);assert.ok(sim.map.city[cellAt(u.x,u.y)]);}}
 assert.ok(units.some((u,i)=>u.x!==start[i].x||u.y!==start[i].y));
 for(const u of units)sim.engine.hurtEnemy(sim.engine.enemies.find(e=>e.id===u.id)!,2);
 for(let i=0;i<90;i++)sim.raid.step(1/30);assert.equal(sim.raid.defense.soldiers.filter(u=>u.kind==='flagBearer').length,0);assert.equal(sim.raid.defense.stats.current.troopsLost,0);
});
test('Own cannon blasts cannot kill a bearer or award mana',()=>{const sim=battle(),u=sim.raid.defense.soldiers.find(u=>u.kind==='flagBearer')!;sim.raid.defense.explode(u.x,u.y,{r:1,damage:100,friendlyFire:true});assert.equal(u.hp,1);assert.equal(sim.mana!.value,1);});
test('Every trained attacker family ignores nearby bearers for sixty seconds',()=>{
 const sim=battle(),a=sim.engine,d=sim.raid.defense,bearers=d.soldiers.filter(u=>u.kind==='flagBearer'),ids=new Set(bearers.map(u=>u.id));
 for(const u of bearers){u.hp=u.maxHp=1e9;}
 d.soldiers=bearers;d.scenario!.recruits=()=>false;a.scenario!.recruits=()=>false;a.warBanner=null;
 const source=a.soldiers[0],kinds=[...new Set(Object.values(TRAINS)),'undead','reinforcement'].filter(Boolean);
 a.soldiers=kinds.map((kind,i)=>({...source,kind:kind!,id:a.newId(),x:bearers[0].x+(i%4)*.3,y:bearers[0].y+.5,hp:1e9,maxHp:1e9,damage:0,target:-1,path:[],cd:0,thinkT:0,...(kind==='undead'?{risen:{life:100,size:.4,range:0,look:'warrior' as const}}:{}),...(kind==='reinforcement'?{called:{life:100,size:.4,range:0,post:{x:bearers[0].x,y:bearers[0].y},look:'knight' as const}}:{})}));
 for(let n=0;n<1800;n++){sim.raid.step(1/30);for(const u of a.soldiers)assert.ok(!ids.has(u.target),u.kind);for(const arrow of a.arrows)assert.ok(!ids.has(arrow.target),'homing projectile');}
 assert.equal(bearers.filter(u=>u.hp>0).length,3);
});
test('Blasts, strike spells, burning ground and piercing hits retain the proxy and pay two mana exactly once',()=>{
 for(const cause of ['blast','spell','burn','pierce'] as const){
  const sim=battle(),a=sim.engine,u=sim.raid.defense.soldiers.find(u=>u.kind==='flagBearer')!,e=a.enemies.find(e=>e.id===u.id)!;
  u.x=35.5;u.y=60.5;a.reindexAfterDisplacement();
  assert.equal(e.untargetable,true);assert.equal(manaFor(u),2);const before=sim.mana!.value;
  if(cause==='blast')a.explode(u.x,u.y,{r:1,damage:5});
  if(cause==='spell'){sim.mana!.gain();a.castMeteor({x:u.x,y:u.y});for(let n=0;n<120&&u.hp>0;n++)sim.raid.step(1/30);}
  if(cause==='burn'){a.blazes.push({x:u.x,y:u.y,r:.7,dps:30,t:0,life:2,seed:1});stepBlazes(a,1/30);}
  if(cause==='pierce'){const arrow={x:u.x+1,y:u.y,pierce:{width:.3,hits:[]}};const hits=pierceHits(a,arrow as any,u.x-1,u.y);assert.ok(hits.includes(e));for(const hit of hits)a.hurtEnemy(hit,5);}
  assert.ok(u.hp<=0,cause);assert.equal(sim.mana!.value,cause==='spell'?2:before+2,cause);
  const credited=sim.mana!.value;a.hurtEnemy(e,999);sim.raid.step(1/30);assert.equal(sim.mana!.value,credited,cause);
 }
});

test('Hawk and every Wisp pool refuse primary aim, but a flying Wisp still pierces a bearer',async()=>{
 const {DefendSim}=await import('../src/defend/sim.ts'),{generateCity,CellType}=await import('../src/defend/citygen.ts'),{fitLayout,defaultLayout}=await import('../src/defend/layout.ts'),{Towers}=await import('../src/defend/towers.ts'),{hawkTarget}=await import('../src/defend/hawk-focus.ts');
 const sim=new DefendSim(generateCity(fitLayout(defaultLayout()),4),defaults().defend.levels,1);sim.enemies=[];sim.soldiers=[];sim.civilians=[];sim.solid.fill(0);sim.foeSolid.fill(0);sim.ownSolid.fill(0);sim.map.type.fill(CellType.ROAD);
 const b={...sim.keep,kind:'wispTower' as const,rect:{x:19,y:19,w:2,h:2},structureUid:42};sim.map.buildings[b.id]=b;sim.bonuses={...sim.bonuses,structurePaths:{42:{wispTower:{path:'wispArrow',rank:3}}}};
 const t=new Towers(),e={id:sim.newId(),kind:'orc' as const,x:20,y:20,hp:1,maxHp:1,cd:0,flash:0,jx:0,jy:0,distract:-1,distractT:0,rollT:0,marked:false,untargetable:true as const};sim.enemies=[e];sim.reindexAfterDisplacement();t.step(sim,0);
 assert.equal(hawkTarget([e],20,20,10),undefined);assert.ok(sim.wisps.every(w=>!w.slice&&!w.ray));
 const normal={...e,id:sim.newId(),x:25,y:20,hp:1e6,maxHp:1e6};delete (normal as {untargetable?:true}).untargetable;sim.enemies=[normal];sim.reindexAfterDisplacement();t.step(sim,0);
 const w=sim.wispOwners.get(b.id)!.arrows[0];assert.ok(w.slice);const p=w.slice.points[Math.floor(w.slice.points.length/2)];e.x=p.x;e.y=p.y;sim.enemies.push(e);sim.reindexAfterDisplacement();t.step(sim,1);
 assert.ok(e.hp<=0);assert.notEqual(w.lastTarget,e.id);
});
