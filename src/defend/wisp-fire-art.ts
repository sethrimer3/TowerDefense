/** Warm flame tails, lasting attack ribbons and the ten-contact fiery burst.
 * All motion is decorative; Reduce Motion retains stable visible hit areas. */
import { WISP, WISP_FIRE } from "../knowledge-paths.ts";
import { ART } from "./park-art.ts";
import { artPen, FLAME, puff } from "./pixel-fx.ts";
import { drawWispCore } from "./wisp-core-art.ts";
import type { DefendSim } from "./sim.ts";
import { wispHomeAngle, type WispArrow } from "./wisp-arrow.ts";

/** Distance-based tail samples follow flight history, with flame tongues
 * rising from the ribbon rather than independently swinging cloth chains. */
export function wispFlames(w:WispArrow,reduced=false) {
  const length=(WISP.idleLength+(WISP.sliceLength-WISP.idleLength)*w.energy)*WISP_FIRE.scale;
  const path=[...w.trail,{x:w.x,y:w.y,angle:w.angle,distance:w.travel}];
  return Array.from({length:16},(_,i)=>{
    const t=i/15,distance=w.travel-.2*WISP_FIRE.scale-length*t;
    let a=path[0],b=a;
    for(let j=path.length-1;j>0;j--)if(path[j-1].distance<=distance){a=path[j-1];b=path[j];break;}
    const u=a===b?0:(distance-a.distance)/(b.distance-a.distance||1);
    const back=a===b?a.distance-distance:0;
    const flicker=reduced?0:Math.sin(w.time*13+i*1.7+w.serial)*.04;
    return {x:a.x+(b.x-a.x)*u-Math.cos(a.angle)*back,
      y:a.y+(b.y-a.y)*u-Math.sin(a.angle)*back-flicker,
      size:Math.max(0,Math.round((1-t)*(1.5+w.energy)*WISP_FIRE.scale)),alpha:(1-t)*.8};
  });
}

export function drawWispFireArrow(c:CanvasRenderingContext2D,px:number,w:WispArrow,reduced:boolean) {
  const dot=artPen(c,px),alpha=c.globalAlpha;
  const angle=wispHomeAngle(w),still=reduced&&!w.slice;
  const pose=still?{...w,x:w.cx+Math.cos(angle)*.8,y:w.cy+Math.sin(angle)*.8,angle,trail:[],travel:0}:w;
  const fade=w.fade===undefined?1:Math.max(0,1-w.fade/WISP.fade);
  const flames=wispFlames(pose,reduced);
  for(let i=flames.length-1;i>=0;i--) {
    const f=flames[i],x=Math.round(f.x*ART),y=Math.round(f.y*ART);
    c.globalAlpha=alpha*fade*f.alpha;c.fillStyle=FLAME[1];puff(dot,x,y,f.size+1);
    c.fillStyle=FLAME[3];puff(dot,x,y,Math.max(0,f.size-1));
  }
  c.globalAlpha=alpha*fade;
  drawWispCore(c,px,pose,[FLAME[0],FLAME[2],FLAME[4]]);
  c.globalAlpha=alpha;
}

export function drawWispFireTrails(c:CanvasRenderingContext2D,px:number,sim:DefendSim,reduced:boolean) {
  const dot=artPen(c,px),alpha=c.globalAlpha;
  for(const trail of sim.wispFireTrails) {
    const cells=new Map<string,{x:number;y:number;strength:number}>();
    for(const s of trail.segments) {
      const n=Math.max(1,Math.ceil(Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)*ART*2));
      for(let i=0;i<=n;i++) {
        const t=i/n,born=s.start+(s.end-s.start)*t,age=sim.wispFireTime-born;
        if(age<0||age>=WISP_FIRE.trailLife)continue;
        const x=Math.round((s.a.x+(s.b.x-s.a.x)*t)*ART),y=Math.round((s.a.y+(s.b.y-s.a.y)*t)*ART);
        const strength=1-age/WISP_FIRE.trailLife,key=`${x},${y}`,previous=cells.get(key);
        if(!previous||previous.strength<strength)cells.set(key,{x,y,strength});
      }
    }
    for(const {x,y,strength} of cells.values()) {
      const flicker=reduced?0:Math.sin(sim.wispFireTime*12+x*1.7+y*.6);
      c.globalAlpha=alpha*strength*.3;c.fillStyle=FLAME[0];puff(dot,x,y,Math.round(WISP_FIRE.width*ART/2));
      c.globalAlpha=alpha*strength*.65;c.fillStyle=FLAME[2];puff(dot,x,y-Math.max(0,Math.round(flicker)),2);
      c.fillStyle=FLAME[3];dot(x,y-1);
    }
  }
  c.globalAlpha=alpha;
}

export function drawWispFireBurst(c:CanvasRenderingContext2D,px:number,w:WispArrow,reduced:boolean) {
  const dot=artPen(c,px),alpha=c.globalAlpha,age=w.burst??0,t=age/WISP_FIRE.burstLife;
  const radius=WISP_FIRE.blastRadius*ART*(reduced?1:.25+.75*Math.min(1,t*2));
  c.globalAlpha=alpha*Math.max(0,1-t)*(reduced?.25:.6);
  c.fillStyle=FLAME[1];puff(dot,Math.round(w.x*ART),Math.round(w.y*ART),Math.round(radius));
  const count=reduced?8:22;
  for(let i=0;i<count;i++) {
    const angle=i*Math.PI*2/count+w.serial*.71;
    const r=radius*(.7+(i%3)*.15),x=Math.round(w.x*ART+Math.cos(angle)*r),y=Math.round(w.y*ART+Math.sin(angle)*r);
    c.fillStyle=FLAME[2+i%3];puff(dot,x,y,reduced?1:2);
  }
  c.globalAlpha=alpha*Math.max(0,1-t)*.8;c.fillStyle=FLAME[4];
  puff(dot,Math.round(w.x*ART),Math.round(w.y*ART),reduced?2:Math.max(0,Math.round((1-t)*5)));
  c.globalAlpha=alpha;
}
