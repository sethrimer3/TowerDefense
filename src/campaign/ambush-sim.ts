/** Ambush adds placement, routing and a wallet to native Defend combat. */
import { DefendSim,type Enemy } from '../defend/sim.ts';
import { defaultDefendSave } from '../defend/progress.ts';
import { NO_BONUSES,ENEMIES,type StructureKind,type Bonuses,type EnemyKind } from '../defend/catalog.ts';
import { Outposts } from './outposts.ts';
import { ambushWave,waveHasFliers,AMBUSH_WAVES } from './ambush-waves.ts';
import type { Stars } from './levels.ts';
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
 readonly field;readonly level;readonly engine:DefendSim;readonly grid:AmbushGrid;readonly outposts:Outposts;readonly waves;
 readonly buildings:AmbushBuilding[]=[];
 phase:'build'|'battle'|'won'|'lost'='build';
 gold:number;goldEarned=0;kills=0;wave=0;elapsed=0;
 private lots:number[]=[];private sequence=0;private acc=0;private queue:EnemyKind[]=[];private spawnClock=0;private between=2;
 private bonus:Bonuses;
 constructor(readonly index:number,game:Save){
  this.level=ambushLevel(index);this.field=ambushField(index);this.waves=Array.from({length:AMBUSH_WAVES.count},(_,i)=>ambushWave(this.level,i+1));
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
  this.outposts=new Outposts(this.engine,this.field);
  this.engine.scenario={manualWaves:true,noCivilians:true,routeEnemy:(e,dt)=>this.outposts.route(e,dt),fieldFor:e=>this.outposts.fieldFor(e),died:e=>{
   if(e.fortressPart)return;const d=ENEMIES[e.kind],gold=enemyBounty({maxHp:e.maxHp,damage:d.damage,cooldown:d.cooldown,speed:d.speed});
   this.gold+=gold;this.goldEarned+=gold;this.kills++;
  }};
  this.grid=new AmbushGrid(map,this.level.area,this.field.road,this.field.castle,this.field.outposts.map(p=>p.rect),true);
  this.gold=startingGold(this.level.index);
 }
 get map(){return this.engine.map;}
 get stars(){return this.outposts.stars as Stars;}
 get warning(){return ['build','battle'].includes(this.phase)&&(waveHasFliers(this.queue)||!this.queue.length&&!!this.waves[this.wave]?.fliers);}
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
  this.engine.configureLot(id,kind,buildingRect(b),true);this.buildings.push(b);this.gold-=cost;this.replan();return true;
 }
 moveTo(id:number,qx:number,qy:number){
  const b=this.buildings.find(b=>b.id===id);if(!b||this.phase!=='build'||!this.grid.check(b.kind,qx,qy,this.buildings,id).fits)return false;
  b.qx=qx;b.qy=qy;this.engine.configureLot(id,b.kind,buildingRect(b),true);this.replan();return true;
 }
 remove(id:number){
  const i=this.buildings.findIndex(b=>b.id===id);if(i<0||!['build','battle'].includes(this.phase))return false;
  const b=this.buildings[i];this.gold+=this.refund(id);this.engine.configureLot(id,b.kind,buildingRect(b),false);this.buildings.splice(i,1);this.replan();return true;
 }
 start(){if(this.phase!=='build'||!this.buildings.length)return false;this.phase='battle';this.nextWave();return true;}
 private replan(){for(const rect of this.outposts.replan(this.buildings))this.grid.refreshTown(rect);}
 private nextWave(){
  this.wave++;const wave=this.waves[this.wave-1];this.queue=[...wave.kinds];this.engine.beginManualWave(this.level.zone*20+this.wave,wave.budget,this.queue.length);this.spawnClock=0;this.between=2;
 }
 step(dt:number){
  if(this.phase!=='battle'||!Number.isFinite(dt)||dt<=0)return;this.acc+=Math.min(.25,dt);
  while(this.acc>=1/30&&this.phase==='battle'){this.acc-=1/30;this.tick(1/30);}
 }
 private tick(dt:number){
  this.elapsed+=dt;this.spawnClock-=dt;
  if(this.queue.length&&this.spawnClock<=0){const e=this.field.path[0];this.engine.releaseEnemy(this.queue.shift()!,{x:Math.max(.5,e.x),y:Math.max(.5,e.y)});this.spawnClock=.7;}
  this.engine.step(dt);this.outposts.update();
  if(this.engine.keepHp()<=0)this.phase='lost';
  else if(!this.queue.length&&!this.engine.enemies.length){if(this.wave===3)this.phase='won';else if((this.between-=dt)<=0)this.nextWave();}
 }
}
