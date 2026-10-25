/** Timed swept ribbons. Union each arrow's contact intervals so a crossing
 * or a frame boundary cannot multiply its DPS or change its lifetime. */
import { ENEMIES, enemySize } from "./catalog.ts";
import type { Point } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

const TARGET_PAD=Math.max(...Object.values(ENEMIES).map(d=>Math.max(d.size,(d.fortress?.partScale??1)*.6)))/2;
export type WispTrailSegment={a:Point;b:Point;start:number;end:number};
export type WispTrail={building:number;dps:number;width:number;life:number;element:"fire"|"physical";
  segments:WispTrailSegment[];active:boolean};

export function appendWispTrail(trail:WispTrail,a:Point,b:Point,start:number,end:number,sample:number) {
  const segments=trail.segments,last=segments.at(-1),dx=b.x-a.x,dy=b.y-a.y;
  // Rejoin frame cuts within a straight geometric sample.
  if(last&&Math.abs(last.end-start)<1e-9&&Math.hypot(last.b.x-a.x,last.b.y-a.y)<1e-9&&
    Math.abs((last.b.x-last.a.x)*dy-(last.b.y-last.a.y)*dx)<1e-10&&
    (last.b.x-last.a.x)*dx+(last.b.y-last.a.y)*dy>=0&&
    Math.hypot(b.x-last.a.x,b.y-last.a.y)<=sample+1e-9) {
    last.b={x:b.x,y:b.y};last.end=end;
  } else segments.push({a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},start,end});
}

/** Fractions of a segment inside an enemy's contact circle, including caps. */
function contactInterval(e:Enemy,s:WispTrailSegment,width:number):[number,number]|undefined {
  const radius=width/2+enemySize(e)/2;
  const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,ox=s.a.x-e.x,oy=s.a.y-e.y;
  const length=dx*dx+dy*dy,c=ox*ox+oy*oy-radius*radius;
  if(length<1e-20)return c<=0?[0,1]:undefined;
  const along=ox*dx+oy*dy,disc=along*along-length*c;
  if(disc<0)return;
  const root=Math.sqrt(disc),from=Math.max(0,(-along-root)/length),to=Math.min(1,(-along+root)/length);
  return from<=to?[from,to]:undefined;
}

export function stepWispTrails(sim:DefendSim,trails:WispTrail[],from:number,until:number) {
  for(const trail of trails) {
    const contacts=new Map<number,{e:Enemy;origin:Point;intervals:[number,number][]}>();
    for(const s of trail.segments) {
      if(s.end+trail.life<=from||s.start>=until)continue;
      const x=(s.a.x+s.b.x)/2,y=(s.a.y+s.b.y)/2;
      const radius=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)/2+trail.width/2;
      for(const e of sim.enemiesNear(x,y,radius+TARGET_PAD)) {
        if(e.hp<=0)continue;
        const interval=contactInterval(e,s,trail.width);if(!interval)continue;
        const [a,b]=interval,duration=s.end-s.start;
        const start=Math.max(from,s.start+duration*a),end=Math.min(until,s.start+duration*b+trail.life);
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
      sim.hurtEnemy(e,trail.dps*time,false,"ranged",{...origin,building:trail.building},false,trail.element);
    }
    trail.segments=trail.segments.filter(s=>s.end+trail.life>until);
    trail.active=trail.segments.length>0;
  }
  return trails.filter(t=>t.active);
}
