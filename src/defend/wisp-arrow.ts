/** A tower's one living arrow. Curves and swept hits run at simulation time;
 * decorative tendrils are owned by the renderer. No global RNG is consumed. */
import { WISP } from "../knowledge-paths.ts";
import { archerCooldown, archerDamage, archerRange, enemySize } from "./catalog.ts";
import { center, type Point } from "./pathing.ts";
import type { Building } from "./citygen.ts";
import type { DefendSim } from "./sim.ts";

export type WispSlice = { points: Point[]; elapsed: number; damage: number; hit: Set<number> };
export type WispArrow = { building: number; x: number; y: number; vx: number; vy: number; angle: number;
  cx: number; cy: number; range: number; time: number; cooldown: number; energy: number; slice?: WispSlice; fade?: number };

function bound(p: Point, c: Point, radius: number): Point {
  const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
  return d > radius ? { x: c.x + dx * radius / d, y: c.y + dy * radius / d } : p;
}

/** A wide parabola through the captured aim at its midpoint. Sampling and
 * range clipping are fixed for combat, independent of drawing quality. */
export function wispCurve(from: Point, aim: Point, c: Point, range: number): Point[] {
  const angle = Math.atan2(aim.y - c.y, aim.x - c.x) + Math.PI / 2;
  const end = { x: c.x + Math.cos(angle) * range * .65, y: c.y + Math.sin(angle) * range * .65 };
  const control = { x: 2 * aim.x - (from.x + end.x) / 2, y: 2 * aim.y - (from.y + end.y) / 2 };
  return Array.from({ length: WISP.samples + 1 }, (_, i) => {
    const t = i / WISP.samples, u = 1 - t;
    return bound({ x: u*u*from.x + 2*u*t*control.x + t*t*end.x, y: u*u*from.y + 2*u*t*control.y + t*t*end.y }, c, range);
  });
}

export function wispPosition(slice: WispSlice, elapsed: number): Point {
  const at = Math.min(WISP.samples, Math.max(0, elapsed / WISP.duration * WISP.samples));
  const i = Math.min(WISP.samples - 1, Math.floor(at)), t = at - i, a = slice.points[i], b = slice.points[i + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x-a.x, dy = b.y-a.y, length = dx*dx+dy*dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/length)) : 0;
  return Math.hypot(p.x-a.x-dx*t, p.y-a.y-dy*t);
}

export function stepWispTower(sim: DefendSim, b: Building, dt: number) {
  const c = center(b.rect), range = archerRange(sim.levels.archerRange);
  let w = sim.wispOwners.get(b.id);
  if (!w) {
    w = { building:b.id, x:c.x, y:c.y-.8, vx:0, vy:0, angle:-Math.PI/2, cx:c.x, cy:c.y,
      range, time:0, cooldown:0, energy:0 };
    sim.wisps.push(w); sim.wispOwners.set(b.id,w);
  }
  w.time += dt; w.cooldown = Math.max(0, w.cooldown-dt);
  if (!w.slice && w.cooldown <= 0) {
    let target, best = Infinity;
    for (const e of sim.enemiesNear(c.x,c.y,range)) {
      const d = (e.x-c.x)**2+(e.y-c.y)**2;
      if (e.hp>0 && d<=range*range && d<best) {target=e;best=d;}
    }
    if (target) {
      w.slice = { points:wispCurve(w,target,c,range), elapsed:0, damage:archerDamage(sim.levels.archerDamage)*sim.bonuses.towerDamage, hit:new Set() };
      w.cooldown = archerCooldown(sim.levels.archerRate)*sim.bonuses.towerReload;
    }
  }
  const ox=w.x, oy=w.y;
  w.energy += ((w.slice ? 1 : 0)-w.energy)*Math.min(1,dt*(w.slice?12:3));
  if (w.slice) {
    const s=w.slice, until=Math.min(WISP.duration,s.elapsed+dt);
    const candidates=sim.enemiesNear(c.x,c.y,range).filter(e=>e.hp>0&&(e.x-c.x)**2+(e.y-c.y)**2<=range*range&&!s.hit.has(e.id));
    let at=s.elapsed, a=wispPosition(s,at);
    while(at<until) {
      const next=Math.min(until,(Math.floor(at/WISP.duration*WISP.samples+1e-8)+1)*WISP.duration/WISP.samples);
      const end=wispPosition(s,next);
      for (const e of candidates) if(e.hp>0&&!s.hit.has(e.id)&&segmentDistance(e,a,end)<=WISP.width/2+enemySize(e)/2) {
        s.hit.add(e.id);
        sim.hurtEnemy(e,s.damage,true,"ranged",{x:a.x,y:a.y,building:b.id},true);
        if(!sim.intact(b)) {delete w.slice;return;}
      }
      a=end;at=next;
    }
    w.x=a.x;w.y=a.y;s.elapsed=until;
    if(until>=WISP.duration) delete w.slice;
    w.vx=(w.x-ox)/Math.max(dt,1e-6);w.vy=(w.y-oy)/Math.max(dt,1e-6);
  } else {
    const t=w.time, seed=b.id*1.731;
    const gx=c.x+range*WISP.orbit*(.55*Math.sin(t*.63+seed)+.15*Math.sin(t*1.17+seed));
    const gy=c.y+range*WISP.orbit*(.55*Math.cos(t*.47+seed)+.15*Math.sin(t*.91-seed));
    // Soft attraction and capped inertial carry out of the last slice.
    const speed=Math.hypot(w.vx,w.vy), cap=range*1.5;
    if(speed>cap){w.vx*=cap/speed;w.vy*=cap/speed;}
    w.vx+=((gx-w.x)*2.8-w.vx*2.4)*dt;w.vy+=((gy-w.y)*2.8-w.vy*2.4)*dt;
    const p=bound({x:w.x+w.vx*dt,y:w.y+w.vy*dt},c,range*WISP.orbit);
    w.x=p.x;w.y=p.y;
  }
  if(Math.hypot(w.x-ox,w.y-oy)>.00001) w.angle=Math.atan2(w.y-oy,w.x-ox);
}

/** Fading arrows cannot hit; rebuilding creates a new active owner. */
export function finishWisps(sim: DefendSim, dt: number) {
  for(const w of sim.wisps) {
    const b=sim.map.buildings[w.building];
    if(w.fade===undefined&&b?.kind==="wispTower"&&sim.intact(b)) continue;
    w.fade=(w.fade??0)+dt;delete w.slice;
    if(sim.wispOwners.get(w.building)===w) sim.wispOwners.delete(w.building);
  }
  sim.wisps=sim.wisps.filter(w=>w.fade===undefined||w.fade<WISP.fade);
}
