/** Mode lifecycle and economy around DefendSim. All combat belongs to Defend. */
import { DefendSim,type Enemy } from '../defend/sim.ts';
import * as C from '../defend/catalog.ts';
import { buildWave } from '../defend/waves.ts';
import { enemySpeed } from '../defend/enemy-abilities.ts';
import { chilled } from '../defend/wizard.ts';
import { rectCells } from '../defend/grid.ts';
import { defaultDefendSave,type DefendSave } from '../defend/progress.ts';
import { bonuses as gameBonuses } from '../progression.ts';
import { placedBattlePaths,wearFits } from '../specializations.ts';
import type { PathId } from '../knowledge-paths.ts';
import type { Save } from '../save.ts';
import { ambushField,siegeField,footprint,type MusterCopy } from './battlefield.ts';
import { RaidBattle } from './raid.ts';
import { ambushPrice,enemyBounty,startingGold } from './economy.ts';
import { generateCastle,estimateCastle,seeded,type CastleSnapshot } from './castles.ts';
import { infantry,deployable,validLayout,type Mode,type Placement } from './plans.ts';
export * from './plans.ts';
export type Wear={path?:PathId;rank?:number};
export function infantryCopies(save:DefendSave):MusterCopy[]{
 const out:MusterCopy[]=[];
 for(const kind of Object.keys(C.STRUCTURES) as C.StructureKind[])if(infantry(kind)){
  const worn=[...save.layout.structures,...save.kept].filter(s=>s.kind===kind);
  for(let i=0;i<(save.owned[kind as C.PaletteItem]||0);i++){const copy=worn[i];out.push({kind,uid:100000+out.length,...(copy?.path?{path:copy.path,rank:copy.rank}:{})});}
 }
 return out;
}
export class CampaignSim {
 phase:'build'|'battle'|'won'|'lost'='build';
 readonly engine:DefendSim;readonly raid?:RaidBattle;readonly plan:{name:string;path:{x:number;y:number}[];pads:{x:number;y:number}[]};
 readonly layout:Placement[]=[];readonly road?:Set<number>;private lots:number[]=[];
 gold=0;kills=0;lives=5;elapsed=0;wave=0;spawned=0;
 private paid=new Map<number,number>();private pending:C.EnemyKind[]=[];private spawnClock=0;private breakClock=0;private acc=0;
 private route=new WeakMap<Enemy,number>();private rng:()=>number;private bonus:C.Bonuses;private source:DefendSave;
 constructor(readonly mode:Mode,readonly level:number,layout:Placement[],private owned:DefendSave['owned'],private levels:DefendSave['levels'],readonly opponent?:CastleSnapshot,game?:Save){
  this.levels={...levels};this.rng=seeded((opponent?.seed??12345)+level);
  this.source=game?.defend??{...defaultDefendSave(),owned,levels};
  this.bonus={...(game?gameBonuses(game):C.NO_BONUSES),structurePaths:{}};
  if(mode==='ambush'){
   const field=ambushField(level);this.plan=field;this.road=field.road;this.lots=field.lots;this.engine=new DefendSim(field.map,this.levels,12345+level,this.bonus);
   this.engine.scenario={manualWaves:true,noCivilians:true,ignoreKeepLoss:true,routeEnemy:(e,dt)=>this.followRoad(e,dt),died:e=>{
    const def=C.ENEMIES[e.kind];this.gold+=enemyBounty({maxHp:e.maxHp,damage:def.damage,cooldown:def.cooldown,speed:def.speed});this.kills++;
   }};
   for(const id of this.lots){const b=field.map.buildings[id];this.engine.configureLot(id,'watchTower',b.rect,false);}
   this.gold=startingGold(level);for(const p of validLayout(mode,level,layout,owned))this.place(p.pad,p.kind,p);
  }else{
   const copies=infantryCopies(this.source),field=siegeField(opponent??generateCastle(12345,1000),copies);
   const nativeStructures=copies.map(c=>({uid:c.uid,kind:c.kind as Exclude<C.StructureKind,'keep'>,tx:0,ty:0,qx:0,qy:0,...(c.path?{path:c.path as PathId,rank:c.rank}:{})}));
   const adapted={...game,defend:{...this.source,layout:{...this.source.layout,structures:nativeStructures}}} as Save;
   Object.assign(this.bonus,placedBattlePaths(adapted));
   const scale=2**(((opponent?estimateCastle(opponent).rating:1000)-1000)/800)*.65;
   const defense={...C.NO_BONUSES,towerDamage:scale,troopDamage:scale,troopHp:scale,keepHp:scale,wallHp:scale};
   this.raid=new RaidBattle(field,this.levels,this.bonus,defense,opponent?.seed??12345);this.engine=this.raid.attack;
   this.plan={name:opponent?.owner.name??'Castle raid',path:[],pads:field.pads};
   this.layout=copies.map((c,i)=>({pad:i,kind:c.kind,...(c.path?{path:c.path as PathId,rank:c.rank}:{})}));
   // The native Barracks garrisons replenish just as in Defend; no invented troop reserve.
  }
 }

 get map(){return this.engine.map;}
 get renderSim(){return this.raid?.prepareRender()??this.engine;}
 get allies(){return this.engine.soldiers;}
 get enemies(){return this.engine.enemies;}
 variants(kind:C.StructureKind):Wear[]{
  const list:Wear[]=[];
  for(const source of [...this.source.layout.structures,...this.source.kept])if(source.kind===kind&&source.path&&wearFits(kind,source.path,source.rank)&&!list.some(p=>p.path===source.path&&p.rank===source.rank))list.push({path:source.path,rank:source.rank});
  return list.length?list:[{}];
 }
 price(kind:C.StructureKind,wear:Wear=this.variants(kind)[0]){return ambushPrice(kind,this.levels,wear);}
 refund(pad:number){const paid=this.paid.get(pad)??0;return this.phase==='build'?paid:Math.floor(paid*.7/10)*10;}
 place(pad:number,kind:C.StructureKind,wear:Wear=this.variants(kind)[0]){
  if(this.mode!=='ambush'||!['build','battle'].includes(this.phase)||!this.plan.pads[pad]||!deployable(kind,this.mode)||(this.owned[kind as C.PaletteItem]||0)<=0)return false;
  if(wear.path&&!this.variants(kind).some(p=>p.path===wear.path&&p.rank===wear.rank))return false;
  const id=this.lots[pad],rect=footprint(kind,this.plan.pads[pad]);
  if(rectCells(rect).some(c=>this.road!.has(c)||this.map.owner[c]>=0&&this.map.owner[c]!==id))return false;
  const cost=this.price(kind,wear).cost,refund=this.refund(pad);if(cost>this.gold+refund)return false;
  this.bonus.structurePaths??={};
  const structure={uid:id,kind:kind as Exclude<C.StructureKind,'keep'>,tx:0,ty:0,qx:0,qy:0,...wear};
  const adapted={defend:{...this.source,layout:{...this.source.layout,structures:[structure]}}} as Save;
  const paths=placedBattlePaths(adapted).structurePaths?.[id];
  if(paths)this.bonus.structurePaths[id]=paths;else delete this.bonus.structurePaths[id];
  this.map.buildings[id].structureUid=id;this.engine.configureLot(id,kind,rect,true);
  this.gold+=refund-cost;this.paid.set(pad,cost);this.layout.splice(0,this.layout.length,...this.layout.filter(p=>p.pad!==pad),{pad,kind,...wear});return true;
 }
 remove(pad:number){if(this.mode!=='ambush'||!['build','battle'].includes(this.phase)||!this.lots[pad])return;this.gold+=this.refund(pad);this.paid.delete(pad);const b=this.map.buildings[this.lots[pad]];this.engine.configureLot(b.id,b.kind as C.StructureKind,b.rect,false);this.layout.splice(0,this.layout.length,...this.layout.filter(p=>p.pad!==pad));}
 start(){if(this.phase!=='build'||!this.layout.some(p=>p.kind!=='watchTower'))return false;this.phase='battle';if(this.mode==='ambush')this.nextWave();return true;}
 private nextWave(){this.wave++;this.engine.wave=1+this.level*8+(this.wave-1)*2;this.pending=buildWave(this.engine.wave,this.rng);this.spawnClock=0;this.breakClock=2;}
 private followRoad(e:Enemy,dt:number){
  let segment=this.route.get(e);
  if(segment===undefined){let best=Infinity;segment=1;for(let i=1;i<this.plan.path.length;i++){const a=this.plan.path[i-1],b=this.plan.path[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((e.x-a.x)*dx+(e.y-a.y)*dy)/(dx*dx+dy*dy)));const d=Math.hypot(e.x-a.x-t*dx,e.y-a.y-t*dy);if(d<best){best=d;segment=i;}}}
  const target=this.plan.path[segment];
  if(!target){e.escaped=true;e.hp=0;this.lives=Math.max(0,this.lives-1);return true;}
  const speed=enemySpeed(this.engine,e)*chilled(e);
  if(Math.hypot(target.x-e.x,target.y-e.y)<=speed*dt+.1){e.x=target.x;e.y=target.y;this.route.set(e,segment+1);}
  else{this.engine.moveToward(e,target,{speed,dt,flying:true});this.route.set(e,segment);}
  return true;
 }
 step(dt:number){if(this.phase!=='battle'||!Number.isFinite(dt)||dt<=0)return;this.acc+=Math.min(dt,.25);while(this.acc>=1/30&&this.phase==='battle'){this.acc-=1/30;this.tick(1/30);}}
 private tick(dt:number){
  this.elapsed+=dt;
  if(this.raid){this.raid.step(dt);if(this.raid.defense.keepHp()<=0)this.phase='won';else if(this.elapsed>=240)this.phase='lost';return;}
  this.spawnClock-=dt;
  if(this.pending.length&&this.spawnClock<=0){const kind=this.pending.shift()!;this.engine.releaseEnemy(kind,this.plan.path[0]);this.spawned++;this.spawnClock=.7;}
  this.engine.step(dt);
  if(this.lives<=0)this.phase='lost';
  else if(!this.pending.length&&!this.engine.enemies.length){if(this.wave>=3)this.phase='won';else if((this.breakClock-=dt)<=0)this.nextWave();}
 }
}
