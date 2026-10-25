/** Fire-arrow ribbons retain swept geometry and deposition times. Damage is
 * the union of contact intervals per arrow, so crossing trails never multiply
 * one arrow's DPS. Different arrows remain independent. */
import { WISP_FIRE } from "../knowledge-paths.ts";
import { ENEMIES, enemySize } from "./catalog.ts";
import type { Point } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import type { WispArrow } from "./wisp-arrow.ts";

const TARGET_PAD=Math.max(...Object.values(ENEMIES).map(d=>Math.max(d.size,(d.fortress?.partScale??1)*.6)))/2;

export type FireSegment = { a: Point; b: Point; start: number; end: number };
export type WispFireTrail = { building: number; dps: number; segments: FireSegment[]; active: boolean };

export function leaveWispFire(sim: DefendSim,w: WispArrow,a: Point,b: Point,start: number,end: number,damage: number) {
  if(end-start<=1e-12)return;
  if(!w.fireTrail?.active) {
    w.fireTrail={building:w.building,dps:damage*WISP_FIRE.trailDps,segments:[],active:true};
    sim.wispFireTrails.push(w.fireTrail);
  }
  const segments=w.fireTrail.segments,last=segments.at(-1);
  const dx=b.x-a.x,dy=b.y-a.y;
  // Rejoin frame cuts inside one straight geometric sample. This preserves
  // the same timed ribbon with coarse and fine simulation steps.
  if(last&&Math.abs(last.end-start)<1e-9&&Math.hypot(last.b.x-a.x,last.b.y-a.y)<1e-9&&
    Math.abs((last.b.x-last.a.x)*dy-(last.b.y-last.a.y)*dx)<1e-10&&
    (last.b.x-last.a.x)*dx+(last.b.y-last.a.y)*dy>=0&&
    Math.hypot(b.x-last.a.x,b.y-last.a.y)<=WISP_FIRE.sample+1e-9) {
    last.b={x:b.x,y:b.y};last.end=end;
  } else segments.push({a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},start,end});
}

/** Fractions of a segment inside an enemy's contact circle, including caps. */
function contactInterval(e: Enemy,s: FireSegment): [number,number] | undefined {
  const radius=WISP_FIRE.width/2+enemySize(e)/2;
  const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,ox=s.a.x-e.x,oy=s.a.y-e.y;
  const length=dx*dx+dy*dy,c=ox*ox+oy*oy-radius*radius;
  if(length<1e-20)return c<=0?[0,1]:undefined;
  const along=ox*dx+oy*dy,disc=along*along-length*c;
  if(disc<0)return;
  const root=Math.sqrt(disc),from=Math.max(0,(-along-root)/length),to=Math.min(1,(-along+root)/length);
  return from<=to?[from,to]:undefined;
}

export function explodeWispFire(sim: DefendSim,w: WispArrow,damage: number) {
  const r=WISP_FIRE.blastRadius;
  for(const e of sim.enemiesNear(w.x,w.y,r))if(e.hp>0&&(e.x-w.x)**2+(e.y-w.y)**2<=r*r) {
    sim.hurtEnemy(e,damage*WISP_FIRE.blastDamage,true,"ranged",{x:w.x,y:w.y,building:w.building},false,"fire");
  }
}

/** Called once after all towers move, including when their inventories are
 * empty or their sources have fallen. Old ribbons live out their own timers. */
export function stepWispFire(sim: DefendSim,dt: number) {
  const from=sim.wispFireTime,until=from+dt;
  for(const trail of sim.wispFireTrails) {
    const contacts=new Map<number,{e:Enemy;origin:Point;intervals:[number,number][]}>();
    for(const s of trail.segments) {
      if(s.end+WISP_FIRE.trailLife<=from||s.start>=until)continue;
      const x=(s.a.x+s.b.x)/2,y=(s.a.y+s.b.y)/2;
      const radius=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)/2+WISP_FIRE.width/2;
      for(const e of sim.enemiesNear(x,y,radius+TARGET_PAD)) {
        if(e.hp<=0)continue;
        const interval=contactInterval(e,s);if(!interval)continue;
        const [a,b]=interval,duration=s.end-s.start;
        const start=Math.max(from,s.start+duration*a),end=Math.min(until,s.start+duration*b+WISP_FIRE.trailLife);
        if(end<=start)continue;
        let hit=contacts.get(e.id);
        if(!hit){hit={e,origin:{x,y},intervals:[]};contacts.set(e.id,hit);}
        hit.intervals.push([start,end]);
      }
    }
    for(const {e,origin,intervals} of contacts.values()) {
      intervals.sort((a,b)=>a[0]-b[0]);
      let start=intervals[0][0],end=intervals[0][1],time=0;
      for(let i=1;i<intervals.length;i++) {
        const [a,b]=intervals[i];
        if(a>end){time+=end-start;start=a;end=b;}else end=Math.max(end,b);
      }
      time+=end-start;
      sim.hurtEnemy(e,trail.dps*time,false,"ranged",{...origin,building:trail.building},false,"fire");
    }
    trail.segments=trail.segments.filter(s=>s.end+WISP_FIRE.trailLife>until);
    trail.active=trail.segments.length>0;
  }
  sim.wispFireTrails=sim.wispFireTrails.filter(t=>t.segments.length>0);
  sim.wispFireTime=until;
}
