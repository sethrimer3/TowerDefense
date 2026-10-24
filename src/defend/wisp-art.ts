/** Six quiet tassels sampled from actual flight history, fading like shadows.
 * No free cloth forces: the tails follow the route rather than flailing. */
import { WISP } from "../knowledge-paths.ts";
import { ART } from "./park-art.ts";
import { artPen } from "./pixel-fx.ts";
import type { WispArrow } from "./wisp-arrow.ts";
import type { DefendSim } from "./sim.ts";

type Node = {x:number;y:number};
export type WispTassels = {time:number;chains:Node[][]};
const tassels = new WeakMap<WispArrow,WispTassels>();

export function wispTassels(w: WispArrow, previous?: WispTassels, reduced=false): WispTassels {
  if(previous?.time===w.time)return previous;
  const length=WISP.idleLength+(WISP.sliceLength-WISP.idleLength)*w.energy;
  const link=length/(WISP.segments-1);
  const path=[...w.trail,{x:w.x,y:w.y,angle:w.angle,distance:w.travel}];
  const sample=(back:number)=>{
    const distance=w.travel-back;
    for(let i=path.length-1;i>0;i--) if(path[i-1].distance<=distance) {
      const a=path[i-1],b=path[i],t=(distance-a.distance)/(b.distance-a.distance||1);
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:a.angle+(b.angle-a.angle)*t};
    }
    const a=path[0],extra=a.distance-distance;
    return {x:a.x-Math.cos(a.angle)*extra,y:a.y-Math.sin(a.angle)*extra,angle:a.angle};
  };
  const samples=Array.from({length:WISP.segments},(_,i)=>sample(.25+length*.9*i/(WISP.segments-1)));
  const chains=Array.from({length:WISP.tassels},(_,j)=>Array.from({length:WISP.segments},(_,i)=>{
    const t=i/(WISP.segments-1),p=samples[i];
    // Narrow parallel ribbons; only a subpixel ripple at the free end.
    const spread=(j-(WISP.tassels-1)/2)*.04+(reduced?0:.012*t*Math.sin(w.time*1.2+j*.7+t*2));
    return {x:p.x-Math.sin(p.angle)*spread,y:p.y+Math.cos(p.angle)*spread};
  }));
  // Offset ribbons on the outside of a curve are a little longer; retain the
  // finite-link budget without giving them independent momentum.
  for(const chain of chains) for(let i=1;i<chain.length;i++) {
    const a=chain[i-1],p=chain[i],dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy);
    if(d>link){p.x=a.x+dx*link/d;p.y=a.y+dy*link/d;}
  }
  return {time:w.time,chains};
}

/** Deterministic, bounded pixel sparks; presentation never consumes combat RNG. */
export function wispSparks(w: WispArrow,reduced=false) {
  const age=w.burst??0,alpha=Math.max(0,1-age/WISP.sparkLife);
  if(reduced)return [{x:w.x,y:w.y,alpha,size:2}];
  return Array.from({length:WISP.sparks},(_,i)=>{
    const angle=i*2.399963+w.serial*1.731+w.building*.61;
    const speed=1.5+(i%5)*.7;
    return {x:w.x+Math.cos(angle)*speed*age,y:w.y+Math.sin(angle)*speed*age+age*age*.8,
      alpha:alpha*alpha,size:i%4===0?2:1};
  });
}

export function drawWisps(c: CanvasRenderingContext2D,px:number,sim:DefendSim,reduced=false) {
  if(!sim.wisps.length)return;
  const dot=artPen(c,px), alpha=c.globalAlpha;
  const line=(ax:number,ay:number,bx:number,by:number,size=1)=>{
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay))));
    for(let i=0;i<=steps;i++)dot(Math.round(ax+(bx-ax)*i/steps),Math.round(ay+(by-ay)*i/steps),size,size);
  };
  for(const w of sim.wisps) {
    if(w.burst!==undefined) {
      const sparks=wispSparks(w,reduced);
      for(let i=0;i<sparks.length;i++) {
        const p=sparks[i];c.globalAlpha=alpha*p.alpha;
        c.fillStyle=["#72d7ff","#248edb","#d6f7ff"][i%3];
        dot(Math.round(p.x*ART),Math.round(p.y*ART),p.size,p.size);
      }
      continue;
    }
    c.globalAlpha=alpha*(w.fade===undefined?1:Math.max(0,1-w.fade/WISP.fade));
    const still=reduced&&!w.slice, pose=still?{...w,x:w.cx+Math.cos(-Math.PI/2+w.slot*Math.PI*2/3)*.8,y:w.cy+Math.sin(-Math.PI/2+w.slot*Math.PI*2/3)*.8,angle:-Math.PI/2+w.slot*Math.PI*2/3,trail:[],travel:0}:w;
    const state=wispTassels(pose,reduced?undefined:tassels.get(w),reduced);
    if(!reduced)tassels.set(w,state);else tassels.delete(w);
    for(let j=0;j<state.chains.length;j++) {
      c.fillStyle=["#29689b","#439ed1","#7ad4f2"][j%3];
      const chain=state.chains[j];
      for(let i=chain.length-1;i>=1;i--) {
        c.globalAlpha=alpha*(w.fade===undefined?1:Math.max(0,1-w.fade/WISP.fade))*(.16+.55*(1-i/chain.length));
        line(chain[i-1].x*ART,chain[i-1].y*ART,chain[i].x*ART,chain[i].y*ART);
      }
    }
    c.globalAlpha=alpha*(w.fade===undefined?1:Math.max(0,1-w.fade/WISP.fade));
    const x=pose.x*ART,y=pose.y*ART,ux=Math.cos(pose.angle),uy=Math.sin(pose.angle),vx=-uy,vy=ux;
    c.fillStyle="#123954";line(x-ux*4,y-uy*4,x+ux*4,y+uy*4,3);
    c.fillStyle="#65c4ef";line(x-ux*4,y-uy*4,x+ux*5,y+uy*5);
    line(x+ux*5,y+uy*5,x+ux-vx*3,y+uy-vy*3);
    line(x+ux*5,y+uy*5,x+ux+vx*3,y+uy+vy*3);
    c.fillStyle="#efffff";line(x-ux*2,y-uy*2,x+ux*4,y+uy*4);
  }
  c.globalAlpha=alpha;
}
