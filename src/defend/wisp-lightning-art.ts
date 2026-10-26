/** Violent violet forks remain anchored to the straight swept hit ribbon.
 * Their deterministic jitter never changes combat or consumes random rolls. */
import { WISP, WISP_LIGHTNING } from "../knowledge-paths.ts";
import { ART } from "./park-art.ts";
import { artPen } from "./pixel-fx.ts";
import { drawWispCore } from "./wisp-core-art.ts";
import { wispHomeAngle, type WispArrow } from "./wisp-arrow.ts";
import type { WispTrailSegment } from "./wisp-trail.ts";
import type { DefendSim } from "./sim.ts";

const VIOLET=["#36115e","#a24aff","#f8d9ff"];
const noise=(x:number)=>{const s=Math.sin(x*12.9898)*43758.5453;return s-Math.floor(s);};

export function wispLightningPoints(s:WispTrailSegment,time:number,reduced=false) {
  const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,length=Math.hypot(dx,dy),count=Math.max(1,Math.ceil(length*ART/3));
  const phase=reduced?0:Math.floor(time*12),vx=length?-dy/length:0,vy=length?dx/length:1;
  return Array.from({length:count+1},(_,i)=>{
    const t=i/count,x=s.a.x+dx*t,y=s.a.y+dy*t;
    const jitter=i===0||i===count?0:(noise(x*7+y*13+phase*2.1)-.5)*WISP_LIGHTNING.width*.7;
    return{x:x+vx*jitter,y:y+vy*jitter};
  });
}

export function drawWispLightningTrails(c:CanvasRenderingContext2D,px:number,sim:DefendSim,reduced:boolean) {
  const dot=artPen(c,px),alpha=c.globalAlpha;
  const line=(ax:number,ay:number,bx:number,by:number,width=1)=>{
    const n=Math.max(1,Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay))));
    for(let i=0;i<=n;i++)dot(Math.round(ax+(bx-ax)*i/n-width/2),Math.round(ay+(by-ay)*i/n-width/2),width,width);
  };
  for(const trail of sim.wispLightningTrails)for(const s of trail.segments) {
    const age=sim.wispFireTime-s.end;
    if(age<0||age>=trail.life)continue;
    const strength=Math.min(1,(trail.life-age)*2);
    c.globalAlpha=alpha*strength*.16;c.fillStyle=VIOLET[1];
    line(s.a.x*ART,s.a.y*ART,s.b.x*ART,s.b.y*ART,Math.round(trail.width*ART));
    const points=wispLightningPoints(s,sim.wispFireTime,reduced);
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i];
      c.globalAlpha=alpha*strength*.5;c.fillStyle=VIOLET[1];line(a.x*ART,a.y*ART,b.x*ART,b.y*ART,3);
      c.globalAlpha=alpha*strength*.95;c.fillStyle=VIOLET[2];line(a.x*ART,a.y*ART,b.x*ART,b.y*ART);
      if(i%3===1) {
        const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,length=Math.hypot(dx,dy)||1,side=i%2?1:-1;
        const bx=b.x-dy/length*.35*side,by=b.y+dx/length*.35*side;
        c.globalAlpha=alpha*strength*.65;c.fillStyle=VIOLET[1];line(b.x*ART,b.y*ART,bx*ART,by*ART);
      }
    }
  }
  c.globalAlpha=alpha;
}

export function drawWispLightningArrow(c:CanvasRenderingContext2D,px:number,w:WispArrow,reduced:boolean) {
  const alpha=c.globalAlpha,dot=artPen(c,px),home=wispHomeAngle(w);
  const pose=reduced&&!w.ray?{...w,x:w.cx+Math.cos(home)*.8,y:w.cy+Math.sin(home)*.8,angle:home}:w;
  if(w.burst!==undefined) {
    c.globalAlpha=alpha*Math.max(0,1-w.burst/WISP_LIGHTNING.burstLife)*.5;c.fillStyle=VIOLET[2];
    dot(Math.round(w.x*ART),Math.round(w.y*ART),4,4);c.globalAlpha=alpha;return;
  }
  const fade=w.fade===undefined?1:Math.max(0,1-w.fade/WISP.fade);
  const back={x:pose.x-Math.cos(pose.angle)*1.5,y:pose.y-Math.sin(pose.angle)*1.5};
  const points=wispLightningPoints({a:back,b:pose,start:0,end:0},w.time,reduced);
  c.fillStyle=VIOLET[1];
  for(let i=0;i<points.length;i++) {
    c.globalAlpha=alpha*fade*(.2+.7*i/points.length);const p=points[i];
    dot(Math.round(p.x*ART),Math.round(p.y*ART),2,2);
  }
  c.globalAlpha=alpha*fade;drawWispCore(c,px,pose,VIOLET);c.globalAlpha=alpha;
}
