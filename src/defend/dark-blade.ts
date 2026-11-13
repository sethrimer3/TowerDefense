/** The Dark Blade (and its smaller Lesser Dark Blade): a Blight knight with very slow, devastating greatsword
 * swipes. When anyone or any building comes within reach it stops, raises
 * the sword for a long wind-up locked on that direction, then cuts a wide
 * crescent that strikes every defender and building inside it. Each cut
 * leaves a tear in space (`DefendSim.tears`) that slowly closes; the tear is
 * presentation only and deals no damage. No random draws. */
import { dist, sq } from "../exact.ts";
import { ENEMIES, type EnemyKind } from "./catalog.ts";
import { enemyDamage } from "./enemy-abilities.ts";
import { nearestPoint, rectDist } from "./pathing.ts";
import { sheltered } from "./boats.ts";
import type { DefendSim, Enemy } from "./sim.ts";

export const DARK_BLADE = {
  /** Reach of the crescent from the knight's centre, in cells. */
  reach: 2.4,
  /** Half the crescent's opening: everything within 75° of the cut's line. */
  halfArc: 75 * Math.PI / 180,
  /** Seconds the sword is raised before it falls. */
  windup: 1.6,
  /** Seconds the cut takes to sweep across, as drawn. */
  sweep: .35,
  /** Seconds the sword takes to come back to rest after the cut, as drawn. */
  recover: .9,
  /** Seconds a tear in space takes to close. */
  tearLife: 9,
} as const;
/** The Lesser Dark Blade: a short sword and a quick, light cut. */
export const LESSER_DARK_BLADE = { ...DARK_BLADE, reach: 1.3, windup: .55, sweep: .22, recover: .45, tearLife: 4 } as const;
export type BladeTuning = typeof DARK_BLADE | typeof LESSER_DARK_BLADE;
export const isDarkBlade = (kind: EnemyKind) => kind === "darkBlade" || kind === "lesserDarkBlade";
export const bladeTuning = (kind: EnemyKind): BladeTuning => kind === "lesserDarkBlade" ? LESSER_DARK_BLADE : DARK_BLADE;
const COS_ARC = Math.cos(DARK_BLADE.halfArc);

export type Tear = { x: number; y: number; dx: number; dy: number; r: number; t: number; life: number; seed: number };

/** Whether a point lies in the crescent cut from (x, y) along (dx, dy). */
export function inCrescent(x: number, y: number, dx: number, dy: number, px: number, py: number, r: number = DARK_BLADE.reach) {
  const vx = px - x, vy = py - y, d2 = sq(vx) + sq(vy);
  if (d2 > sq(r)) return false;
  if (d2 === 0) return true;
  return vx * dx + vy * dy >= COS_ARC * Math.sqrt(d2);
}

/** One Dark Blade step. True when it spends the step on its sword (winding
 * up, cutting, or waiting out its cooldown with a foe in reach); false lets
 * it march on as usual. */
export function stepDarkBlade(sim: DefendSim, e: Enemy, dt: number): boolean {
  const blade = e.blade ??= { wind: 0, dx: 0, dy: 1, lx: e.x, ly: e.y };
  // It faces the way it last walked, unless the sword holds its aim.
  const mx = e.x - blade.lx, my = e.y - blade.ly, moved = dist(mx, my);
  if (moved > 1e-6 && blade.wind <= 0) e.facing = { x: mx / moved, y: my / moved };
  blade.lx = e.x; blade.ly = e.y;
  if (e.freeze || e.stagger) return blade.wind > 0;
  if (blade.wind > 0) {
    blade.wind -= dt;
    e.facing = { x: blade.dx, y: blade.dy };
    if (blade.wind <= 0) { blade.wind = 0; cut(sim, e, blade.dx, blade.dy); }
    return true;
  }
  const tuning = bladeTuning(e.kind), reach = tuning.reach;
  const foe = sim.nearestDefender(e.x, e.y, reach);
  let target: { x: number; y: number } | null = foe;
  if (!target) {
    let best = Infinity;
    for (const b of sim.map.buildings) {
      if (!sim.intact(b)) continue;
      const d = rectDist(b.rect, e.x, e.y);
      if (d <= reach && d < best) { best = d; target = nearestPoint(b.rect, e.x, e.y); }
    }
  }
  if (!target) return false;
  if (e.cd > 0) return true;
  let dx = target.x - e.x, dy = target.y - e.y;
  const length = dist(dx, dy);
  if (length > 0) { dx /= length; dy /= length; } else { dx = e.facing?.x ?? 0; dy = e.facing?.y ?? 1; }
  blade.wind = tuning.windup; blade.dx = dx; blade.dy = dy;
  e.facing = { x: dx, y: dy };
  return true;
}

/** The crescent falls: full damage to every defender and building in it,
 * and a tear in space left behind. */
function cut(sim: DefendSim, e: Enemy, dx: number, dy: number) {
  e.cd = ENEMIES[e.kind].cooldown;
  const tuning = bladeTuning(e.kind), damage = enemyDamage(sim, e), reach = tuning.reach;
  sim.atmosphere?.disturb(e.x + dx * reach * .5, e.y + dy * reach * .5, reach * 1.6, dx * 2, dy * 2, true);
  for (const u of [...sim.soldiers, ...sim.civilians]) {
    if (u.hp <= 0 || ("guard" in u && u.guard) || sheltered(sim, u.x, u.y) || !inCrescent(e.x, e.y, dx, dy, u.x, u.y, reach)) continue;
    sim.hurtDefender(u, damage);
    u.flash = .12;
  }
  for (const b of sim.map.buildings) {
    if (!sim.intact(b)) continue;
    const near = nearestPoint(b.rect, e.x, e.y);
    if (inCrescent(e.x, e.y, dx, dy, near.x, near.y, reach)) sim.damageBuilding(b.id, damage);
  }
  sim.tears.push({ x: e.x, y: e.y, dx, dy, r: reach, t: 0, life: tuning.tearLife, seed: (e.id * 7919 + sim.tears.length * 104729) | 0 });
}

/** Tears age and close; presentation only. */
export function stepTears(sim: DefendSim, dt: number) {
  if (!sim.tears.length) return;
  for (const tear of sim.tears) tear.t += dt;
  sim.tears = sim.tears.filter(tear => tear.t < tear.life);
}

/** How far the sword has turned from rest, for drawing: radians about the
 * knight's sword hand, 0 pointing forward, positive toward its right side. */
export function bladeSwing(e: Enemy, cooldown = ENEMIES[e.kind].cooldown) {
  const REST = .35, RAISED = 2.3, ACROSS = -1.7, { windup, sweep, recover } = bladeTuning(e.kind);
  const blade = e.blade;
  if (blade && blade.wind > 0) {
    const k = 1 - blade.wind / windup, ease = 1 - (1 - k) * (1 - k);
    return REST + (RAISED - REST) * ease;
  }
  const since = blade && e.cd > 0 ? cooldown - e.cd : Infinity;
  if (since < sweep) { const k = since / sweep; return RAISED + (ACROSS - RAISED) * k * k * (3 - 2 * k); }
  if (since < sweep + recover) { const k = (since - sweep) / recover; return ACROSS + (REST - ACROSS) * k * k * (3 - 2 * k); }
  return REST;
}
