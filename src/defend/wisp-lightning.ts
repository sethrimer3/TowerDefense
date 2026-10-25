/** The final Wisp arrow commits to one straight ray through its captured
 * target and exits the board, leaving a timed lightning ribbon behind. */
import { WISP, WISP_LIGHTNING } from "../knowledge-paths.ts";
import { archerCooldown, archerDamage } from "./catalog.ts";
import { CELLS_W, CELLS_H } from "./grid.ts";
import { center, type Point } from "./pathing.ts";
import type { Building } from "./citygen.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import type { WispArrow } from "./wisp-arrow.ts";
import { flightPosition, wispFlight } from "./wisp-flight.ts";
import { appendWispTrail } from "./wisp-trail.ts";

export type WispLightningRay={a:Point;b:Point;length:number;distance:number;damage:number;target:number};

export function wispMapRay(from:Point,aim:Point):Omit<WispLightningRay,"damage"|"target"> {
  const dx=aim.x-from.x,dy=aim.y-from.y,length=Math.hypot(dx,dy);
  // Coincident target: choose north deterministically rather than a zero ray.
  const ux=length>1e-10?dx/length:0,uy=length>1e-10?dy/length:-1;
  const tx=ux>1e-12?(CELLS_W-from.x)/ux:ux< -1e-12?-from.x/ux:Infinity;
  const ty=uy>1e-12?(CELLS_H-from.y)/uy:uy< -1e-12?-from.y/uy:Infinity;
  const distance=Math.max(0,Math.min(tx,ty));
  return {a:{x:from.x,y:from.y},b:{x:Math.max(0,Math.min(CELLS_W,from.x+ux*distance)),
    y:Math.max(0,Math.min(CELLS_H,from.y+uy*distance))},length:distance,distance:0};
}

function leaveLightning(sim:DefendSim,w:WispArrow,a:Point,b:Point,start:number,end:number,damage:number) {
  if(end-start<=1e-12)return;
  if(!w.lightningTrail?.active) {
    w.lightningTrail={building:w.building,dps:damage*WISP_LIGHTNING.trailDps,
      width:WISP_LIGHTNING.width,life:WISP_LIGHTNING.trailLife,element:"physical",segments:[],active:true};
    sim.wispLightningTrails.push(w.lightningTrail);
  }
  appendWispTrail(w.lightningTrail,a,b,start,end,WISP_LIGHTNING.sample);
}

/** Returns exact time to exit, so a coarse frame starts refilling at the
 * same instant as fine frames. A ray never checks its target again. */
export function stepWispLightning(sim:DefendSim,b:Building,w:WispArrow,candidates:Enemy[],dt:number,offset:number) {
  if(!w.ray) {
    let target:Enemy|undefined,best=Infinity;
    for(const e of candidates)if(e.hp>0) {
      const d=(e.x-w.x)**2+(e.y-w.y)**2;
      if(d<best||(d===best&&e.id<(target?.id??Infinity))){target=e;best=d;}
    }
    if(target) {
      w.ray={...wispMapRay(w,target),damage:archerDamage(sim.levels.archerDamage)*sim.bonuses.towerDamage,target:target.id};
      w.angle=Math.atan2(w.ray.b.y-w.y,w.ray.b.x-w.x);delete w.flight;
    }
  }
  if(w.ray) {
    const ray=w.ray,reload=archerCooldown(sim.levels.archerRate)/archerCooldown(0)*sim.bonuses.towerReload;
    const speed=w.range*WISP_LIGHTNING.speed/reload,start=ray.distance;
    const used=Math.min(dt,(ray.length-start)/speed),until=Math.min(ray.length,start+speed*used);
    const position=(d:number)=>{const t=ray.length?d/ray.length:1;return{x:ray.a.x+(ray.b.x-ray.a.x)*t,y:ray.a.y+(ray.b.y-ray.a.y)*t};};
    let at=start;
    while(at<until-1e-10) {
      // Fixed distance boundaries retain identical deposition times when a
      // simulation frame splits the flight between samples.
      const next=Math.min(until,(Math.floor((at+1e-9)/WISP_LIGHTNING.sample)+1)*WISP_LIGHTNING.sample);
      leaveLightning(sim,w,position(at),position(next),sim.wispFireTime+offset+(at-start)/speed,
        sim.wispFireTime+offset+(next-start)/speed,ray.damage);
      at=next;
    }
    const end=position(until);w.x=end.x;w.y=end.y;w.vx=Math.cos(w.angle)*speed;w.vy=Math.sin(w.angle)*speed;
    w.time+=used;w.travel+=until-start;ray.distance=until;
    if(until>=ray.length-1e-9){w.hitsLeft=0;w.burst=0;delete w.ray;return used;}
    return dt;
  }
  // Unlocked arrows wander harmlessly within the tower's normal range.
  let remaining=dt;
  while(remaining>1e-9) {
    if(!w.flight) {
      const c=center(b.rect),phase=w.time*.63+b.id*1.731+Math.PI*7/6;
      const aim={x:c.x+w.range*.35*Math.cos(phase),y:c.y+w.range*.35*Math.sin(phase)};
      w.flight=wispFlight(w,aim,c,w.range,w.range*WISP.orbit)??wispFlight(w,aim,c,w.range);
    }
    if(!w.flight){w.time+=remaining;break;}
    const f=w.flight,speed=w.range*WISP.idleSpeed,used=Math.min(remaining,(f.length-f.distance)/speed);
    f.distance=Math.min(f.length,f.distance+speed*used);const p=flightPosition(f,f.distance);
    w.x=p.x;w.y=p.y;w.angle=p.angle;w.vx=Math.cos(p.angle)*speed;w.vy=Math.sin(p.angle)*speed;
    w.time+=used;remaining-=used;
    if(f.distance>=f.length-1e-9)delete w.flight;
    if(used<=1e-10)break;
  }
  return dt;
}
