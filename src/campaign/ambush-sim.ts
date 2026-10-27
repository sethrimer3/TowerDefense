/** Ambush adds placement, routing and a wallet to native Defend combat. */
import { DefendSim,type Enemy } from '../defend/sim.ts';
import { defaultDefendSave } from '../defend/progress.ts';
import { NO_BONUSES,ENEMIES,type StructureKind,type Bonuses,type EnemyKind } from '../defend/catalog.ts';
import { buildDifficultyWave,waveDifficulty } from '../defend/waves.ts';
import { AREA_ENEMIES } from '../defend/area-enemies.ts';
import { enemySpeed } from '../defend/enemy-abilities.ts';
import { chilled } from '../defend/wizard.ts';
import { dist } from '../exact.ts';
import { seeded } from './castles.ts';
import { ambushField } from './battlefield.ts';
import { ambushLevel } from './levels.ts';
import { AmbushGrid,buildingRect,type GridBuilding } from './ambush-grid.ts';
import { ambushPrice,enemyBounty,startingGold } from './economy.ts';
import { bonuses as ownedBonuses } from '../progression.ts';
import type { Save } from '../save.ts';
import { AMBUSH_PALETTE } from './plans.ts';
export { AMBUSH_PALETTE } from './plans.ts';
export type AmbushBuilding=GridBuilding&{paid:number;placedAt:number};
export type AmbushSpell='meteor'|'frostNova'|'reinforcements'|'necromancy';
export class AmbushSim {
 readonly field;readonly level;readonly engine:DefendSim;readonly grid:AmbushGrid;
 readonly buildings:AmbushBuilding[]=[];
 phase:'build'|'battle'|'won'|'lost'='build';
 gold:number;goldEarned=0;kills=0;lives=5;wave=0;elapsed=0;
 private lots:number[]=[];private sequence=0;private acc=0;private queue:EnemyKind[]=[];private spawnClock=0;private between=2;
 private route=new WeakMap<Enemy,number>();private rng:()=>number;private bonus:Bonuses;
 constructor(readonly index:number,game:Save){
  this.level=ambushLevel(index);this.field=ambushField(index);this.rng=seeded(this.level.seed);
  const map=this.field.map;
  // Reserve native homes before DefendSim allocates its HP/collision arrays.
  for(let n=0;n<256;n++){
   const id=map.buildings.length,rect={x:0,y:0,w:0,h:0};
   map.buildings.push({id,kind:'watchTower',rect,cells:[],hidden:true,variant:0,structureUid:id});
   map.structures.push({uid:id,kind:'watchTower',rect,tx:0,ty:0,inside:false});this.lots.push(id);
  }
  const owned=ownedBonuses(game);
  this.bonus={...NO_BONUSES,meteor:owned.meteor,frostNova:owned.frostNova,reinforcements:owned.reinforcements,necromancy:owned.necromancy,structurePaths:{}};
  this.engine=new DefendSim(map,defaultDefendSave().levels,this.level.seed,this.bonus);this.engine.wave=1+this.level.zone*20;
  this.engine.scenario={manualWaves:true,noCivilians:true,ignoreKeepLoss:true,routeEnemy:(e,dt)=>this.followRoad(e,dt),died:e=>{
   if(e.fortressPart)return;const d=ENEMIES[e.kind],gold=enemyBounty({maxHp:e.maxHp,damage:d.damage,cooldown:d.cooldown,speed:d.speed});
   this.gold+=gold;this.goldEarned+=gold;this.kills++;
  }};
  const p=this.field.track.keep,castle={x:p.x-10,y:p.y-10,w:20,h:20};
  this.grid=new AmbushGrid(map,this.level.area,this.field.road,castle,this.field.track.outposts.map(p=>({x:Math.floor(p.x)-8,y:Math.floor(p.y)-8,w:16,h:16})));
  this.gold=startingGold(this.level.index);
 }
 get map(){return this.engine.map;}
 get spells(){return (['meteor','frostNova','reinforcements','necromancy'] as const).filter(key=>this.bonus[key]);}
 cast(spell:AmbushSpell,at:{x:number;y:number}){
  if(this.phase!=='battle'||!this.spells.includes(spell))return false;
  return spell==='meteor'?this.engine.castMeteor(at):spell==='frostNova'?this.engine.castFrostNova(at):spell==='reinforcements'?this.engine.castReinforcements(at):this.engine.castNecromancy(at)>=0;
 }
 get enemiesLeft(){return this.queue.length+this.engine.enemies.filter(e=>!e.fortressPart).length;}
 price(kind:StructureKind){return ambushPrice(kind,this.engine.levels).cost;}
 refund(id:number){const b=this.buildings.find(b=>b.id===id);return b?(this.phase==='build'?b.paid:Math.floor(b.paid*.7/10)*10):0;}
 placeAt(kind:StructureKind,qx:number,qy:number){
  if(!['build','battle'].includes(this.phase)||!(AMBUSH_PALETTE as readonly string[]).includes(kind)||this.sequence>=this.lots.length||!this.grid.check(kind,qx,qy,this.buildings).fits)return false;
  const cost=this.price(kind);if(cost>this.gold)return false;
  const id=this.lots[this.sequence++],b={id,kind,qx,qy,paid:cost,placedAt:this.elapsed};
  this.engine.configureLot(id,kind,buildingRect(b),true);this.buildings.push(b);this.gold-=cost;return true;
 }
 moveTo(id:number,qx:number,qy:number){
  const b=this.buildings.find(b=>b.id===id);if(!b||this.phase!=='build'||!this.grid.check(b.kind,qx,qy,this.buildings,id).fits)return false;
  b.qx=qx;b.qy=qy;this.engine.configureLot(id,b.kind,buildingRect(b),true);return true;
 }
 remove(id:number){
  const i=this.buildings.findIndex(b=>b.id===id);if(i<0||!['build','battle'].includes(this.phase))return false;
  const b=this.buildings[i];this.gold+=this.refund(id);this.engine.configureLot(id,b.kind,buildingRect(b),false);this.buildings.splice(i,1);return true;
 }
 start(){if(this.phase!=='build'||!this.buildings.length)return false;this.phase='battle';this.nextWave();return true;}
 private nextWave(){
  this.wave++;
  const budget=waveDifficulty(1+this.level.zone*20+this.level.index*3+this.wave-1);
  this.queue=buildDifficultyWave(budget,this.rng,AREA_ENEMIES[this.level.area]);this.engine.beginManualWave(this.level.zone*20+this.wave,budget,this.queue.length);this.spawnClock=0;this.between=2;
 }
 private followRoad(e:Enemy,dt:number){
  const path=this.field.path;let segment=this.route.get(e)??1;
  if(!this.route.has(e)){let best=Infinity;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((e.x-a.x)*dx+(e.y-a.y)*dy)/(dx*dx+dy*dy))),d=dist(e.x-a.x-dx*t,e.y-a.y-dy*t);if(d<best){best=d;segment=i;}}}
  const target=path[segment];if(!target){e.escaped=true;e.hp=0;this.lives=Math.max(0,this.lives-1);return true;}
  const speed=enemySpeed(this.engine,e)*chilled(e);
  if(dist(target.x-e.x,target.y-e.y)<=speed*dt+.1){e.x=target.x;e.y=target.y;segment++;}
  else this.engine.moveToward(e,target,{speed,dt,flying:true});
  this.route.set(e,segment);return true;
 }
 step(dt:number){
  if(this.phase!=='battle'||!Number.isFinite(dt)||dt<=0)return;this.acc+=Math.min(.25,dt);
  while(this.acc>=1/30&&this.phase==='battle'){this.acc-=1/30;this.tick(1/30);}
 }
 private tick(dt:number){
  this.elapsed+=dt;this.spawnClock-=dt;
  if(this.queue.length&&this.spawnClock<=0){const e=this.field.path[0];this.engine.releaseEnemy(this.queue.shift()!,{x:Math.max(.5,e.x),y:Math.max(.5,e.y)});this.spawnClock=.7;}
  this.engine.step(dt);
  if(this.lives<=0)this.phase='lost';
  else if(!this.queue.length&&!this.engine.enemies.length){if(this.wave===3)this.phase='won';else if((this.between-=dt)<=0)this.nextWave();}
 }
}
