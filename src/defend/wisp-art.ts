/** Six finite-link pixel tendrils, separate from combat and its randomness. */
import { WISP } from "../knowledge-paths.ts";
import { ART } from "./park-art.ts";
import { artPen } from "./pixel-fx.ts";
import type { WispArrow } from "./wisp-arrow.ts";
import type { DefendSim } from "./sim.ts";

type Node = {x:number;y:number;px:number;py:number};
export type WispCloth = {time:number;chains:Node[][]};
const cloth = new WeakMap<WispArrow,WispCloth>();

export function wispTendrils(w: WispArrow, previous?: WispCloth): WispCloth {
  const length=WISP.idleLength+(WISP.sliceLength-WISP.idleLength)*w.energy, link=length/(WISP.segments-1);
  if(!previous||w.time<previous.time||w.time-previous.time>.25) {
    return {time:w.time,chains:Array.from({length:WISP.tendrils},(_,j)=>Array.from({length:WISP.segments},(_,i)=>{
      const angle=w.angle+Math.PI+(j-(WISP.tendrils-1)/2)*.08;
      const spread=(j-(WISP.tendrils-1)/2)*.09;
      const x=w.x-Math.cos(w.angle)*.25-Math.sin(w.angle)*spread+Math.cos(angle)*link*i,y=w.y-Math.sin(w.angle)*.25+Math.cos(w.angle)*spread+Math.sin(angle)*link*i;
      return {x,y,px:x,py:y};
    }))};
  }
  if(previous.time===w.time)return previous;
  const dt=Math.min(1/30,w.time-previous.time), retain=.7+.26*w.energy;
  previous.time=w.time;
  previous.chains.forEach((chain,j)=>{
    const spread=(j-(WISP.tendrils-1)/2)*.09;
    chain[0].x=w.x-Math.cos(w.angle)*.25-Math.sin(w.angle)*spread;chain[0].y=w.y-Math.sin(w.angle)*.25+Math.cos(w.angle)*spread;
    for(let i=1;i<chain.length;i++) {
      const p=chain[i], x=p.x,y=p.y;
      p.x+=(p.x-p.px)*retain+Math.cos(w.time*2+j+i*.3)*dt*.5;
      p.y+=(p.y-p.py)*retain+Math.sin(w.time*1.7+j+i*.3)*dt*.5;
      p.px=x;p.py=y;
    }
    // Forward clipping guarantees no link stretches, even after a fast slice.
    for(let i=1;i<chain.length;i++) {
      const a=chain[i-1],p=chain[i],dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy);
      if(d>link){p.x=a.x+dx*link/d;p.y=a.y+dy*link/d;}
    }
  });
  return previous;
}

export function drawWisps(c: CanvasRenderingContext2D,px:number,sim:DefendSim,reduced=false) {
  if(!sim.wisps.length)return;
  const dot=artPen(c,px), alpha=c.globalAlpha;
  const line=(ax:number,ay:number,bx:number,by:number,size=1)=>{
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay))));
    for(let i=0;i<=steps;i++)dot(Math.round(ax+(bx-ax)*i/steps),Math.round(ay+(by-ay)*i/steps),size,size);
  };
  for(const w of sim.wisps) {
    c.globalAlpha=alpha*(w.fade===undefined?1:Math.max(0,1-w.fade/WISP.fade));
    const still=reduced&&!w.slice, pose=still?{...w,x:w.cx,y:w.cy-.8,angle:-Math.PI/2,energy:0}:w;
    const state=wispTendrils(pose,reduced?undefined:cloth.get(w));
    if(!reduced)cloth.set(w,state);else cloth.delete(w);
    for(let j=0;j<state.chains.length;j++) {
      c.fillStyle=["#29689b","#439ed1","#7ad4f2"][j%3];
      const chain=state.chains[j];
      for(let i=1;i<chain.length;i++)line(chain[i-1].x*ART,chain[i-1].y*ART,chain[i].x*ART,chain[i].y*ART);
    }
    const x=pose.x*ART,y=pose.y*ART,ux=Math.cos(pose.angle),uy=Math.sin(pose.angle),vx=-uy,vy=ux;
    c.fillStyle="#123954";line(x-ux*4,y-uy*4,x+ux*4,y+uy*4,3);
    c.fillStyle="#65c4ef";line(x-ux*4,y-uy*4,x+ux*5,y+uy*5);
    line(x+ux*5,y+uy*5,x+ux-vx*3,y+uy-vy*3);
    line(x+ux*5,y+uy*5,x+ux+vx*3,y+uy+vy*3);
    c.fillStyle="#efffff";line(x-ux*2,y-uy*2,x+ux*4,y+uy*4);
  }
  c.globalAlpha=alpha;
}
