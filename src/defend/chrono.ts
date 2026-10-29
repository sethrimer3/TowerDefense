/** Time fields own real shot payloads. They never enter the enemy index. */
import { CHRONO, chronoRank } from "../chrono-upgrades.ts";
import { archerRange, enemySize } from "./catalog.ts";
import { CELLS_W, CELLS_H } from "./grid.ts";
import { center, type Point } from "./pathing.ts";
import type { Building } from "./citygen.ts";
import type { Arrow, DefendSim, Enemy, Shell, Soldier } from "./sim.ts";
import type { BallistaBolt } from "./wall-defenses.ts";

export type StoredShot = {kind:"arrow";shot:Arrow}|{kind:"shell";shot:Shell}|{kind:"ballista";shot:BallistaBolt};
export type ChronoState = { shots: StoredShot[]; queue: StoredShot[]; timer: number; aim: number; reach:number; fan: number; fired: number; total: number; damage: number; hits: number };
export type DivineArrow = { x:number;y:number;dx:number;dy:number;left:number;damage:number;building:number;hit:number[];trail:{x:number;y:number;t:number}[];age:number };
export type ReleasedArrow = { dx:number;dy:number;left:number;hit:number[] };
export const chronoRange = (sim:Pick<DefendSim,"levels">) => archerRange(sim.levels.archerRange);
export const chronoCapacity = (sim:Pick<DefendSim,"bonuses">) => CHRONO.capacity[chronoRank(sim.bonuses.chrono,"storage")];
export const divineCapacity = (sim:Pick<DefendSim,"bonuses">) => CHRONO.hits[chronoRank(sim.bonuses.chrono,"divine")];
const owns = (sim:DefendSim,id:number) => {const b=sim.map.buildings[id];return b?.kind==="chronoTower"&&sim.intact(b)?b:undefined;};
export function syncChrono(sim:DefendSim) {
  for(const b of sim.map.buildings)if(b.kind==="chronoTower"&&sim.intact(b)&&!sim.chrono.has(b.id))sim.chrono.set(b.id,{shots:[],queue:[],timer:0,aim:0,reach:0,fan:0,fired:0,total:0,damage:0,hits:0});
  for(const id of sim.chrono.keys())if(!owns(sim,id))sim.chrono.delete(id);
}
/** A private aim point, never added to sim.enemies. Call only after normal targeting fails. */
export function chronoTarget(sim:DefendSim,from:Point,range:number,physical=true,except?:number,min=0,edge=false):Enemy|null {
  let result:Enemy|null=null,best=range*range;
  for(const[id,state]of sim.chrono){
    const b=owns(sim,id);if(!b||id===except)continue;
    if(physical ? state.shots.length+state.queue.length>=chronoCapacity(sim) : !divineCapacity(sim)||state.hits>=divineCapacity(sim))continue;
    const c=edge?{x:Math.max(b.rect.x,Math.min(b.rect.x+b.rect.w,from.x)),y:Math.max(b.rect.y,Math.min(b.rect.y+b.rect.h,from.y))}:center(b.rect),d=(c.x-from.x)**2+(c.y-from.y)**2;
    if(d>best||d<min*min||(d===best&&result&&id> -result.id-2))continue;
    best=d;result={id:-id-2,kind:"orc",...c,hp:1,maxHp:1,cd:0,jx:0,jy:0,distract:-1,distractT:0,rollT:0,marked:false,flash:0};
  }
  return result;
}
export function storeDivine(sim:DefendSim,id:number,damage:number):boolean {
  const s=sim.chrono.get(id),limit=divineCapacity(sim);
  if(!s||!owns(sim,id)||!limit||s.hits>=limit||!Number.isFinite(damage)||damage<=0)return false;
  if(!Number.isFinite(s.damage+damage))return false;
  s.damage+=damage;s.hits++;return true;
}
/** First intersection of a swept segment and a circle; catches fast shots without tunnelling. */
export function circleContact(a:Point,b:Point,c:Point,r:number) {
  const x=a.x-c.x,y=a.y-c.y,dx=b.x-a.x,dy=b.y-a.y,k=x*x+y*y-r*r;
  if(k<=0)return 0;
  const length=dx*dx+dy*dy,along=x*dx+y*dy,disc=along*along-length*k;
  if(length<1e-20||disc<0)return Infinity;
  const t=(-along-Math.sqrt(disc))/length;return t>=0&&t<=1?t:Infinity;
}
export function shotField(sim:DefendSim,shot:StoredShot,a:Point,b:Point):{id:number;t:number}|undefined {
  if(!sim.chrono.size||shot.shot.chronoReleased)return undefined;
  if(shot.kind==="arrow"&&(shot.shot.chain||shot.shot.sky||shot.shot.bowJavelin))return undefined;
  let best=Infinity,owner=-1;
  for(const[id,s]of sim.chrono){
    const building=owns(sim,id);if(!building||s.shots.length+s.queue.length>=chronoCapacity(sim))continue;
    const t=circleContact(a,b,center(building.rect),chronoRange(sim));
    if(t<best||(t===best&&t!==Infinity&&id<owner)){owner=id;best=t;}
  }
  return owner<0?undefined:{id:owner,t:best};
}
export function captureShot(sim:DefendSim,shot:StoredShot,a:Point,b:Point):boolean {
  const field=shotField(sim,shot,a,b);if(!field)return false;
  sim.chrono.get(field.id)!.shots.push(shot);return true;
}
/** Ray from the tower to the first map edge in this direction. */
export function edgeDistance(p:Point,dx:number,dy:number) {
  return Math.max(0,Math.min(dx>0?(CELLS_W-p.x)/dx:dx<0?-p.x/dx:Infinity,dy>0?(CELLS_H-p.y)/dy:dy<0?-p.y/dy:Infinity));
}
function release(sim:DefendSim,b:Building,s:ChronoState,payload:StoredShot) {
  const p=center(b.rect),fraction=s.total>1?s.fired/(s.total-1)-.5:0;
  const angle=s.aim+fraction*s.fan,dx=Math.cos(angle),dy=Math.sin(angle),left=edgeDistance(p,dx,dy);
  s.fired++;
  if(payload.kind==="arrow"){
    const a=payload.shot;
    sim.arrows.push({...a,...p,tx:p.x+dx*left,ty:p.y+dy*left,target:-1,life:Math.max(2,left/10),chronoReleased:true,
      release:{dx,dy,left,hit:[]},origin:{...p,building:b.id},...(a.pierce?{pierce:{...a.pierce,hits:[]}}:{}),...(a.glance?{glance:{...a.glance,struck:[]}}:{})});
  }else if(payload.kind==="shell"){
    const shot=payload.shot,range=Math.min(left,Math.max(.2,s.reach));
    sim.shells.push({...shot,x0:p.x,y0:p.y,x1:p.x+dx*range,y1:p.y+dy*range,t:0,dur:.45+range*.07,chronoReleased:true,origin:{...p,building:b.id}});
  }else{
    const shot=payload.shot;
    sim.ballistaBolts.push({...shot,...p,dx,dy,left:Math.min(left,Math.max(shot.range,chronoRange(sim))),hits:[],pierce:Math.max(1,shot.pierce-shot.hits.length),building:b.id,aim:b.id,chronoReleased:true});
  }
}
export function stepChrono(sim:DefendSim,dt:number) {
  syncChrono(sim);
  for(const[id,s]of sim.chrono){
    const b=owns(sim,id)!,c=center(b.rect),range=chronoRange(sim);
    let target:Enemy|undefined,best=range*range;
    for(const e of sim.enemiesNear(c.x,c.y,range)){const d=(e.x-c.x)**2+(e.y-c.y)**2;if(!e.untargetable&&e.hp>0&&(d<best||(d===best&&(!target||e.id<target.id)))){target=e;best=d;}}
    if(target){
      const angle=Math.atan2(target.y-c.y,target.x-c.x);
      if(!s.queue.length&&s.shots.length){s.queue=s.shots;s.shots=[];s.aim=angle;s.reach=Math.sqrt(best);s.fan=CHRONO.spread[chronoRank(sim.bonuses.chrono,"focus")]*Math.PI/180;s.total=s.queue.length;s.fired=0;s.timer=0;}
      if(s.hits&&s.damage>0){
        const dx=Math.cos(angle),dy=Math.sin(angle);
        sim.divineArrows.push({...c,dx,dy,left:edgeDistance(c,dx,dy),damage:s.damage*CHRONO.multiplier[chronoRank(sim.bonuses.chrono,"amplify")],building:id,hit:[],trail:[{...c,t:0}],age:0});
        s.damage=0;s.hits=0;
      }
    }
    s.timer-=dt;
    while(s.queue.length&&s.timer<=0){release(sim,b,s,s.queue.shift()!);s.timer+=CHRONO.interval;}
    if(!s.queue.length)s.timer=0;
  }
  stepDivine(sim,dt);
}
export function sweptEnemies(sim:DefendSim,a:Point,b:Point,width:number,hit:readonly number[]) {
  const length=Math.hypot(b.x-a.x,b.y-a.y),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  return sim.enemiesNear(mid.x,mid.y,length/2+width+3).filter(e=>e.hp>0&&!hit.includes(e.id)).map(e=>({e,t:circleContact(a,b,e,width+enemySize(e)/2)}))
    .filter(o=>Number.isFinite(o.t)).sort((u,v)=>u.t-v.t||u.e.id-v.e.id);
}
function stepDivine(sim:DefendSim,dt:number) {
  for(const a of sim.divineArrows){
    a.age+=dt;const from={x:a.x,y:a.y},step=Math.min(a.left,CHRONO.divineSpeed*dt);
    a.x+=a.dx*step;a.y+=a.dy*step;a.left-=step;
    if(step>0){for(const {e}of sweptEnemies(sim,from,a,CHRONO.divineWidth,a.hit)){a.hit.push(e.id);sim.hurtEnemy(e,a.damage,true,"ranged",{x:from.x,y:from.y,building:a.building},true);}a.trail.push({x:a.x,y:a.y,t:a.age});}
    a.trail=a.trail.filter(p=>a.age-p.t<=CHRONO.trailLife);
  }
  sim.divineArrows=sim.divineArrows.filter(a=>a.left>0||a.trail.length);
}

/** Incompatible attacks make one deposit per attack, never per animation tick. */
export function chargeIdle(sim:DefendSim,from:Point,range:number,damage:number,ready:()=>boolean,spent:()=>void,edge=false):boolean {
  const aim=chronoTarget(sim,from,range,false,undefined,0,edge);if(!aim)return false;
  if(edge&&"target" in from)(from as Soldier).target=aim.id;
  if(ready()&&storeDivine(sim,-aim.id-2,damage)){spent();sim.effects.push({kind:"spark",x:aim.x,y:aim.y,t:0,r:.25});}
  return true;
}
