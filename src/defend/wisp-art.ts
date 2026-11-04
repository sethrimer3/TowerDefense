/** The Wisp tower's drawing: its stored ordinary arrows circling it, each
 * pointing the way it flies (a still ring under Reduce Motion), and the
 * living fire and lightning arrows of its later ranks. */
import { WISP_STORM } from "../knowledge-paths.ts";
import { drawArrowAt } from "./projectile-art.ts";
import { drawWispFireArrow, drawWispFireBurst, drawWispFireTrails } from "./wisp-fire-art.ts";
import { drawWispLightningArrow, drawWispLightningTrails } from "./wisp-lightning-art.ts";
import type { DefendSim } from "./sim.ts";

export function drawWisps(c: CanvasRenderingContext2D,px:number,sim:DefendSim,reduced=false) {
  for(const[id,owner]of sim.wispOwners) {
    const arrows=owner.quiver.arrows,b=sim.map.buildings[id];if(!arrows.length||!b)continue;
    const cx=b.rect.x+b.rect.w/2,cy=b.rect.y+b.rect.h/2;
    arrows.forEach((a,i)=>{
      if(!reduced)return drawArrowAt(c,px,a.x,a.y,a.vx,a.vy);
      const angle=i*Math.PI*2/arrows.length,r=WISP_STORM.orbit;
      drawArrowAt(c,px,cx+Math.cos(angle)*r,cy+Math.sin(angle)*r,-Math.sin(angle),Math.cos(angle));
    });
  }
  if(!sim.wisps.length&&!sim.wispFireTrails.length&&!sim.wispLightningTrails.length)return;
  drawWispFireTrails(c,px,sim,reduced);
  drawWispLightningTrails(c,px,sim,reduced);
  for(const w of sim.wisps) {
    if(w.lightning)drawWispLightningArrow(c,px,w,reduced);
    else if(w.burst!==undefined)drawWispFireBurst(c,px,w,reduced);
    else drawWispFireArrow(c,px,w,reduced);
  }
}
