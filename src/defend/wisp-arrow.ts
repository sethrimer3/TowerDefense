/** Tower-owned living arrows, with broad tangent passes and swept hits.
 * Recorded flight positions also anchor the quiet, purely decorative tassels. */
import { WISP, WISP_FIRE, WISP_LIGHTNING, pathRank } from "../knowledge-paths.ts";
import { archerCooldown, archerDamage, archerRange, enemySize } from "./catalog.ts";
import { center, type Point } from "./pathing.ts";
import type { Building } from "./citygen.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import { buildingPaths } from "../specializations.ts";
import { leaveWispFire, explodeWispFire, type WispFireTrail } from "./wisp-fire.ts";
import { stepWispLightning, type WispLightningRay } from "./wisp-lightning.ts";
import type { WispTrail } from "./wisp-trail.ts";
import { wispFlight, flightPosition, type FlightPoint, type WispFlight } from "./wisp-flight.ts";

export type WispSlice = WispFlight & { damage: number; hit: Set<number> };
export type WispArrow = { building: number; x: number; y: number; vx: number; vy: number; angle: number;
  cx: number; cy: number; range: number; time: number; energy: number; linger: number;
  slot: number; serial: number; hitsLeft: number; burst?: number; fire?: true; fireTrail?: WispFireTrail;
  lightning?: true; lightningTrail?: WispTrail; ray?: WispLightningRay;
  travel: number; trail: FlightPoint[]; lastTarget?: number; flight?: WispFlight; slice?: WispSlice; fade?: number };

export type WispPool = { arrows: WispArrow[]; capacity: number; refill: number; serial: number };
export type WispTowerState = WispPool & { fire?: WispPool; lightning?: WispPool };

/** First contact with the swept hit band, rather than its nearest point.
 * This orders dense-group hits and makes exhaustion/refill timing independent
 * of where a simulation frame cuts the geometric segment. */
function contact(p: Point, a: Point, b: Point, radius: number) {
  const dx=b.x-a.x,dy=b.y-a.y,ox=a.x-p.x,oy=a.y-p.y;
  const c=ox*ox+oy*oy-radius*radius;
  if(c<=0)return 0;
  const length=dx*dx+dy*dy,along=ox*dx+oy*dy,disc=along*along-length*c;
  if(length<=1e-20||disc<0)return Infinity;
  const t=(-along-Math.sqrt(disc))/length;
  return t>=0&&t<=1?t:Infinity;
}

type WispKind="blue"|"fire"|"lightning";
const wispKind=(w:WispArrow):WispKind=>w.lightning?"lightning":w.fire?"fire":"blue";
export const wispHomeAngle=(w:Pick<WispArrow,"slot"|"fire"|"lightning">)=>w.lightning?Math.PI*7/6:-Math.PI/2+(w.slot+(w.fire ? .5 : 0))*Math.PI*2/3;

function spawnWisp(sim: DefendSim,b: Building,owner: WispPool,kind:WispKind="blue") {
  const c=center(b.rect),range=archerRange(sim.levels.archerRange);
  let slot=0;while(owner.arrows.some(w=>w.slot===slot))slot++;
  const variant=kind==="fire"?{fire:true as const}:kind==="lightning"?{lightning:true as const}:{};
  const angle=wispHomeAngle({slot,...variant});
  const w: WispArrow={building:b.id,x:c.x+Math.cos(angle)*.8,y:c.y+Math.sin(angle)*.8,
    vx:0,vy:0,angle,cx:c.x,cy:c.y,range,time:0,energy:0,linger:0,
    slot,serial:owner.serial++,hitsLeft:kind==="fire"?WISP_FIRE.hits:kind==="lightning"?1:WISP.hits,travel:0,trail:[],...variant};
  w.trail.push({x:w.x,y:w.y,angle:w.angle,distance:0});
  owner.arrows.push(w);sim.wisps.push(w);
}

/** One shared, unbanked refill clock. Split at refill events so a new arrow
 * receives only the battle time after it was actually regenerated. */
export function stepWispTower(sim: DefendSim,b: Building,dt: number) {
  let owner=sim.wispOwners.get(b.id);
  if(!owner) {
    const rank=pathRank(buildingPaths(sim,b),"wispTower","wispArrow");
    owner={arrows:[],capacity:rank?WISP.capacity[1]:WISP.capacity[0],refill:0,serial:0};
    if(rank>=2)owner.fire={arrows:[],capacity:WISP_FIRE.capacity,refill:0,serial:0};
    if(rank>=3)owner.lightning={arrows:[],capacity:WISP_LIGHTNING.capacity,refill:0,serial:0};
    sim.wispOwners.set(b.id,owner);
    while(owner.arrows.length<owner.capacity)spawnWisp(sim,b,owner);
    if(owner.fire)while(owner.fire.arrows.length<owner.fire.capacity)spawnWisp(sim,b,owner.fire,"fire");
    if(owner.lightning)while(owner.lightning.arrows.length<owner.lightning.capacity)spawnWisp(sim,b,owner.lightning,"lightning");
  }
  const c=center(b.rect),range=archerRange(sim.levels.archerRange);
  const candidates=sim.enemiesNear(c.x,c.y,range).filter(e=>e.hp>0&&(e.x-c.x)**2+(e.y-c.y)**2<=range*range);
  stepWispPool(sim,b,owner,candidates,dt,"blue");
  if(owner.fire&&sim.intact(b))stepWispPool(sim,b,owner.fire,candidates,dt,"fire");
  if(owner.lightning&&sim.intact(b))stepWispPool(sim,b,owner.lightning,candidates,dt,"lightning");
}

function stepWispPool(sim:DefendSim,b:Building,owner:WispPool,candidates:Enemy[],dt:number,kind:WispKind) {
  const refill=kind==="lightning"?WISP_LIGHTNING.refill:kind==="fire"?WISP_FIRE.refill:WISP.refill;
  let remaining=dt;
  do {
    const full=owner.arrows.length===owner.capacity;
    const untilRefill=full?refill:Math.max(0,refill-owner.refill);
    const step=Math.min(remaining,untilRefill);
    for(const w of sim.wisps)if(w.building===b.id&&wispKind(w)===kind&&w.burst!==undefined)w.burst+=step;
    let firstLoss=Infinity;
    for(const w of owner.arrows) {
      const lived=stepWispArrow(sim,b,w,candidates,step,dt-remaining);
      if(w.hitsLeft===0){firstLoss=Math.min(firstLoss,lived);w.burst=step-lived;}
      if(!sim.intact(b))return;
    }
    owner.arrows=owner.arrows.filter(w=>w.hitsLeft>0);
    if(owner.arrows.length<owner.capacity) {
      owner.refill+=full?Math.max(0,step-firstLoss):step;
      if(owner.refill>=refill-1e-9) {
        spawnWisp(sim,b,owner,kind);owner.refill=0;
      }
    } else owner.refill=0;
    remaining=Math.max(0,remaining-step);
  } while(remaining>1e-9);
}

/** Attack length rises quickly, holds for a full second after the last slice,
 * then eases down over several seconds. All timing uses battle time. */
function tasselEnergy(w: WispArrow, attacking: boolean, dt: number) {
  if (attacking) {
    w.linger = WISP.linger;
    w.energy = 1 - (1 - w.energy) * Math.exp(-dt / WISP.extend);
  } else {
    const decay = Math.max(0, dt - w.linger);
    w.linger = Math.max(0, w.linger - dt);
    w.energy *= Math.exp(-decay / WISP.shorten);
  }
}

/** Returns the time the arrow stayed alive within this interval. */
function stepWispArrow(sim: DefendSim,b: Building,w: WispArrow,candidates: Enemy[],dt: number,offset: number): number {
  if(w.lightning)return stepWispLightning(sim,b,w,candidates,dt,offset);
  const c=center(b.rect),range=w.range;
  let remaining = dt;
  do {
    if (!w.slice && candidates.some(e => !e.untargetable&&e.hp>0)) {
      let target, best = Infinity;
      const alternatives = candidates.some(e => !e.untargetable&&e.hp>0 && e.id!==w.lastTarget);
      for (const e of candidates) {
        if(e.untargetable)continue;
        if (alternatives && e.id===w.lastTarget) continue;
        const d = (e.x-w.x)**2+(e.y-w.y)**2;
        if (e.hp>0 && (d<best || (d===best && e.id<target!.id))) { target=e; best=d; }
      }
      const flight = target && wispFlight(w,target,c,range);
      if (flight) {
        w.lastTarget = target!.id;
        w.slice = {...flight,damage:archerDamage(sim.levels.archerDamage)*sim.bonuses.towerDamage,hit:new Set()};
        delete w.flight;
      }
    }
    if (!w.slice && !w.flight) {
      const phase = w.time*.63+b.id*1.731+(w.slot+(w.fire ? .5 : 0))*Math.PI*2/3;
      const aim = {x:c.x+range*.35*Math.cos(phase),y:c.y+range*.35*Math.sin(phase)};
      w.flight = wispFlight(w,aim,c,range,range*WISP.orbit) ?? wispFlight(w,aim,c,range);
    }
    const s = w.slice ?? w.flight;
    if (!s || remaining<=0) break;
    const attacking = !!w.slice;
    const reload = archerCooldown(sim.levels.archerRate)/archerCooldown(0)*sim.bonuses.towerReload;
    const speed = range*(attacking ? WISP.speed/reload : WISP.idleSpeed);
    const start=s.distance;
    let used=Math.min(remaining,(s.length-start)/speed);
    let until=Math.min(s.length,start+speed*used);
    let at = start, a = flightPosition(s,at);
    // Visit each geometric sample, even on a long simulation step: no straight
    // shortcut across the arc and no renderer-dependent collision or history.
    while (at < until-1e-10) {
      const next = Math.min(until,s.points[s.index+1].distance);
      const end = flightPosition(s,next);
      if (attacking) {
        const hits=candidates.filter(e=>e.hp>0&&!w.slice!.hit.has(e.id))
          .map(e=>({e,t:contact(e,a,end,WISP.width/2+enemySize(e)/2)})).filter(h=>h.t!==Infinity)
          .sort((a,b)=>a.t-b.t||a.e.id-b.e.id);
        for(const {e,t} of hits) {
          if(e.hp<=0)continue;
          const hit=flightPosition(s,at+(next-at)*t);
          w.slice!.hit.add(e.id);w.hitsLeft--;
          sim.hurtEnemy(e,w.slice!.damage,true,"ranged",{x:hit.x,y:hit.y,building:b.id},true,w.fire?"fire":"physical");
          if(w.hitsLeft===0) {
            until=hit.distance;used=(until-start)/speed;
            if(w.fire)leaveWispFire(sim,w,a,hit,sim.wispFireTime+offset+dt-remaining+(at-start)/speed,
              sim.wispFireTime+offset+dt-remaining+(until-start)/speed,w.slice!.damage);
            a=hit;w.burst=0;break;
          }
          if(!sim.intact(b)){delete w.slice;return dt-remaining+(hit.distance-start)/speed;}
        }
        if(w.hitsLeft===0)break;
      }
      if(w.fire&&attacking)leaveWispFire(sim,w,a,end,sim.wispFireTime+offset+dt-remaining+(at-start)/speed,
        sim.wispFireTime+offset+dt-remaining+(next-start)/speed,w.slice!.damage);
      a=end; at=next;
      // flightPosition leaves the index on an exact boundary; advance here.
      if (s.index<s.points.length-2 && at>=s.points[s.index+1].distance-1e-10) s.index++;
    }
    const travelled = until-start;
    for (let distance = w.trail[w.trail.length-1].distance+WISP.spacing;
      distance <= w.travel+travelled+1e-10; distance+=WISP.spacing) {
      const p = flightPosition(s,start+distance-w.travel);
      w.trail.push({...p,distance});
    }
    w.travel+=travelled;
    const keep = Math.ceil((WISP.sliceLength+.5)/WISP.spacing)+2;
    if (w.trail.length>keep) w.trail.splice(0,w.trail.length-keep);
    w.x=a.x; w.y=a.y; w.angle=a.angle; w.vx=Math.cos(a.angle)*speed; w.vy=Math.sin(a.angle)*speed;
    s.distance=until; w.time+=used; remaining=Math.max(0,remaining-used);
    tasselEnergy(w,attacking,used);
    if(w.hitsLeft===0){
      if(w.fire)explodeWispFire(sim,w,w.slice!.damage);
      delete w.slice;delete w.flight;return dt-remaining;
    }
    if (until>=s.length-1e-9) { delete w.slice; delete w.flight; }
    if (used<=1e-10) break;
  } while (remaining>1e-9);
  if (remaining>0) {w.time+=remaining;tasselEnergy(w,false,remaining);}
  return dt;
}

/** A destroyed source stops combat and refilling, even while its inventory
 * is empty. Exhausted arrows retain only a short cosmetic spark shower. */
export function finishWisps(sim: DefendSim,dt: number) {
  const live=(id:number)=>{const b=sim.map.buildings[id];return b?.kind==="wispTower"&&sim.intact(b);};
  for(const [id] of sim.wispOwners)if(!live(id))sim.wispOwners.delete(id);
  for(const w of sim.wisps) {
    if(w.fade!==undefined){w.fade+=dt;continue;}
    if(live(w.building))continue;
    if(w.burst!==undefined)w.burst+=dt;
    else {w.fade=(w.fade??0)+dt;delete w.slice;delete w.flight;delete w.ray;}
  }
  sim.wisps=sim.wisps.filter(w=>w.burst!==undefined?w.burst<(w.lightning?WISP_LIGHTNING.burstLife:w.fire?WISP_FIRE.burstLife:WISP.sparkLife):w.fade===undefined||w.fade<WISP.fade);
}
