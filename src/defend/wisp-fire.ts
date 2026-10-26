/** Fire-arrow ribbons retain swept geometry and deposition times. Damage is
 * the union of contact intervals per arrow, so crossing trails never multiply
 * one arrow's DPS. Different arrows remain independent. */
import { WISP_FIRE } from "../knowledge-paths.ts";
import type { Point } from "./pathing.ts";
import type { DefendSim } from "./sim.ts";
import type { WispArrow } from "./wisp-arrow.ts";
import { appendWispTrail, stepWispTrails, type WispTrail } from "./wisp-trail.ts";

export type WispFireTrail = WispTrail;

export function leaveWispFire(sim: DefendSim,w: WispArrow,a: Point,b: Point,start: number,end: number,damage: number) {
  if(end-start<=1e-12)return;
  if(!w.fireTrail?.active) {
    w.fireTrail={building:w.building,dps:damage*WISP_FIRE.trailDps,width:WISP_FIRE.width,life:WISP_FIRE.trailLife,element:"fire",segments:[],active:true};
    sim.wispFireTrails.push(w.fireTrail);
  }
  appendWispTrail(w.fireTrail,a,b,start,end,WISP_FIRE.sample);
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
  sim.wispFireTrails=stepWispTrails(sim,sim.wispFireTrails,from,until);
  sim.wispLightningTrails=stepWispTrails(sim,sim.wispLightningTrails,from,until);
  sim.wispFireTime=until;
}
