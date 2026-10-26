/** Shared arrow silhouette; uniform scaling keeps the elemental arrows
 * recognizably related on the pixel lattice. Dimensions are art pixels. */
import { ART } from "./park-art.ts";
import { artPen } from "./pixel-fx.ts";
import { WISP_FIRE, WISP_LIGHTNING } from "../knowledge-paths.ts";
import type { WispArrow } from "./wisp-arrow.ts";

export const wispArrowScale=(w:Pick<WispArrow,"fire"|"lightning">)=>w.lightning?WISP_LIGHTNING.scale:w.fire?WISP_FIRE.scale:1;

export function drawWispCore(c:CanvasRenderingContext2D,px:number,w:WispArrow,colors:readonly string[]) {
  const dot=artPen(c,px),scale=wispArrowScale(w);
  const x=w.x*ART,y=w.y*ART,ux=Math.cos(w.angle)*scale,uy=Math.sin(w.angle)*scale,vx=-uy,vy=ux;
  const line=(ax:number,ay:number,bx:number,by:number,size=1)=>{
    const n=Math.max(1,Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay)))),width=Math.max(1,Math.round(size*scale));
    for(let i=0;i<=n;i++)dot(Math.round(ax+(bx-ax)*i/n),Math.round(ay+(by-ay)*i/n),width,width);
  };
  c.fillStyle=colors[0];line(x-ux*4,y-uy*4,x+ux*4,y+uy*4,3);
  c.fillStyle=colors[1];line(x-ux*4,y-uy*4,x+ux*5,y+uy*5);
  line(x+ux*5,y+uy*5,x+ux-vx*3,y+uy-vy*3);
  line(x+ux*5,y+uy*5,x+ux+vx*3,y+uy+vy*3);
  c.fillStyle=colors[2];line(x-ux*2,y-uy*2,x+ux*4,y+uy*4);
}
