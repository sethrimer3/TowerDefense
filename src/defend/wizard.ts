/** The wizard tower: it alternates between a flamethrower and an ice wave,
 * resting a moment after each.
 *
 * - **Flamethrower:** a cone of fire aimed at the nearest enemy in reach,
 *   swinging after it as it moves, burning everything inside for a burst of
 *   `FLAME_SECONDS`, flying enemies too.
 * - **Ice wave:** a front of ice shards spreading out in a fan toward the
 *   nearest enemy; everything it crosses takes one hit and is chilled
 *   (slowed) for a while.
 *
 * Neither draws from the run's random stream: what they look like is
 * decided by the renderer, so a battle with a wizard tower still replays
 * exactly from its seed. */
import {
  CHILL_SPEED,
  FLAME_HALF_ANGLE,
  FLAME_SECONDS,
  ICE_HALF_ANGLE,
  ICE_RANGE,
  ICE_SPEED,
  WIZARD_REST,
  flameDps,
  flameRange,
  iceChill,
  iceDamage,
} from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { center, nearest } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

/** A burst of fire from a wizard tower: where it leaves the tower, which
 * way it points (radians, turning after its target), how long it has
 * burned and will burn, and its reach. */
export type Flame = { tower: number; x: number; y: number; angle: number; t: number; dur: number; range: number; target: number };
/** An ice wave: its origin and the middle of its fan (radians), how far
 * the front has come (`r`, cells) and where it stops, its age, a seed for
 * how its shards look, and who it has hit. */
export type Frost = { x: number; y: number; angle: number; half: number; r: number; range: number; t: number; seed: number; hit: number[] };

/** How fast a flame swings after its target (radians a second). */
const FLAME_TURN = 3.2;
/** How long the shards stand after the front has passed, for the renderer. */
export const FROST_LINGER = 1.6;

/** Each wizard tower's next attack and rest. */
export class Wizards {
  readonly next = new Map<number, "flame" | "ice">();
  readonly rest = new Map<number, number>();
  private waves = 0;

  step(sim: DefendSim, dt: number) {
    for (const b of sim.map.buildings) {
      if (b.kind !== "wizardTower" || !sim.intact(b)) continue;
      const rest = (this.rest.get(b.id) ?? 0) - dt;
      this.rest.set(b.id, Math.max(0, rest));
      if (rest > 0 || sim.flames.some((f) => f.tower === b.id)) continue;
      if ((this.next.get(b.id) ?? "flame") === "flame") this.flame(sim, b);
      else this.ice(sim, b);
    }
  }

  private flame(sim: DefendSim, b: Building) {
    const c = center(b.rect), range = flameRange(sim.levels.wizardFlame ?? 0);
    const target = nearest(sim.enemiesNear(c.x, c.y, range), c);
    if (!target) return;
    sim.flames.push({ tower: b.id, x: c.x, y: c.y - 0.4, angle: Math.atan2(target.y - c.y, target.x - c.x), t: 0, dur: FLAME_SECONDS, range, target: target.id });
    this.next.set(b.id, "ice");
  }

  private ice(sim: DefendSim, b: Building) {
    const c = center(b.rect);
    const target = nearest(sim.enemiesNear(c.x, c.y, ICE_RANGE), c);
    if (!target) return;
    sim.frosts.push({
      x: c.x, y: c.y, angle: Math.atan2(target.y - c.y, target.x - c.x), half: ICE_HALF_ANGLE,
      r: 0.6, range: ICE_RANGE, t: 0, seed: b.id * 7919 + this.waves++ * 104729, hit: [],
    });
    this.next.set(b.id, "flame");
    this.rest.set(b.id, WIZARD_REST);
  }

  /** A flame that has burned out leaves its tower resting. */
  ended(tower: number) {
    this.rest.set(tower, WIZARD_REST);
  }
}

/** Whether `e` stands in the fan from (x, y) along `angle`, within `reach`. */
function inFan(e: Enemy, x: number, y: number, angle: number, half: number, reach: number) {
  const dx = e.x - x, dy = e.y - y, d = Math.sqrt(dx * dx + dy * dy);
  if (d > reach) return false;
  if (d < 0.5) return true;
  let off = Math.atan2(dy, dx) - angle;
  while (off > Math.PI) off -= Math.PI * 2;
  while (off < -Math.PI) off += Math.PI * 2;
  // A little leeway for an enemy's bulk.
  return Math.abs(off) <= half + 0.25 / d;
}

/** Flames swing after their target and burn everything in their cone. */
export function stepFlames(sim: DefendSim, wizards: Wizards, dt: number) {
  for (const f of sim.flames) {
    f.t += dt;
    if (!sim.intact(sim.map.buildings[f.tower])) f.t = f.dur;
    const target = sim.enemies.find((e) => e.id === f.target && e.hp > 0) ?? nearest(sim.enemiesNear(f.x, f.y, f.range), f);
    if (target) {
      f.target = target.id;
      let turn = Math.atan2(target.y - f.y, target.x - f.x) - f.angle;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      f.angle += Math.max(-FLAME_TURN * dt, Math.min(FLAME_TURN * dt, turn));
    }
    // The fire takes a moment to reach full length.
    const reach = f.range * Math.min(1, f.t / 0.25);
    const dps = flameDps(sim.levels.wizardFlame ?? 0) * sim.bonuses.towerDamage;
    for (const e of sim.enemiesNear(f.x, f.y, reach)) if (inFan(e, f.x, f.y, f.angle, FLAME_HALF_ANGLE, reach)) sim.hurtEnemy(e, dps * dt);
    if (f.t >= f.dur) wizards.ended(f.tower);
  }
  sim.flames = sim.flames.filter((f) => f.t < f.dur);
}

/** Ice fronts spread, hitting and chilling each enemy once as they pass. */
export function stepFrosts(sim: DefendSim, dt: number) {
  const damage = iceDamage(sim.levels.wizardIce ?? 0) * sim.bonuses.towerDamage, chill = iceChill(sim.levels.wizardIce ?? 0);
  for (const w of sim.frosts) {
    w.t += dt;
    if (w.r >= w.range) continue;
    w.r = Math.min(w.range, w.r + ICE_SPEED * dt);
    for (const e of sim.enemiesNear(w.x, w.y, w.r)) {
      if (w.hit.includes(e.id) || !inFan(e, w.x, w.y, w.angle, w.half, w.r)) continue;
      w.hit.push(e.id);
      sim.hurtEnemy(e, damage);
      e.chill = Math.max(e.chill ?? 0, chill);
    }
  }
  sim.frosts = sim.frosts.filter((w) => w.r < w.range || w.t < w.range / ICE_SPEED + FROST_LINGER);
}

/** How fast a chilled enemy moves, as a share of its pace. */
export const chilled = (e: Enemy) => (e.chill ? CHILL_SPEED : 1);
