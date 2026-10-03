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
 * exactly from its seed. Aim is a unit vector, not an angle, and cones are
 * tested by slope, so every engine plays them alike (no trigonometry). */
import { ENEMIES,
  CHILL_SPEED,
  FLAME_SECONDS,
  FLAME_SPREAD,
  ICE_SPREAD,
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
import { dist } from "../exact.ts";

/** A burst of fire from a wizard tower: where it leaves the tower, which
 * way it points (`dx`, `dy`, a unit vector turning after its target), how
 * long it has burned and will burn, and its reach. */
export type Flame = { tower: number; x: number; y: number; dx: number; dy: number; t: number; dur: number; range: number; target: number };
/** An ice wave: its origin, the middle of its fan (a unit vector) and its
 * spread (half-width as a slope), how far the front has come (`r`, cells)
 * and where it stops, its age, a seed for how its shards look, and who it
 * has hit. */
export type Frost = { x: number; y: number; dx: number; dy: number; spread: number; r: number; range: number; t: number; seed: number; hit: number[] };

/** The unit vector from (x, y) toward (tx, ty), pointing up when they meet. */
function toward(x: number, y: number, tx: number, ty: number) {
  const d = dist(tx - x, ty - y);
  return d > 1e-9 ? { dx: (tx - x) / d, dy: (ty - y) / d } : { dx: 0, dy: -1 };
}

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
    sim.flames.push({ tower: b.id, x: c.x, y: c.y - 0.4, ...toward(c.x, c.y - 0.4, target.x, target.y), t: 0, dur: FLAME_SECONDS, range, target: target.id });
    this.next.set(b.id, "ice");
  }

  private ice(sim: DefendSim, b: Building) {
    const c = center(b.rect);
    const target = nearest(sim.enemiesNear(c.x, c.y, ICE_RANGE), c);
    if (!target) return;
    sim.frosts.push({
      x: c.x, y: c.y, ...toward(c.x, c.y, target.x, target.y), spread: ICE_SPREAD,
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

/** Whether `e` stands in the fan from (x, y) along (dx, dy), widening by
 * `spread` a cell, within `reach`, with a little leeway for its bulk. */
function inFan(e: Enemy, x: number, y: number, dx: number, dy: number, spread: number, reach: number) {
  const ox = e.x - x, oy = e.y - y;
  if (ox * ox + oy * oy > reach * reach) return false;
  const along = ox * dx + oy * dy, across = Math.abs(ox * dy - oy * dx);
  return along > -0.3 && across <= Math.max(0, along) * spread + 0.3;
}

/** Turns unit vector (dx, dy) toward (tx, ty) by at most `step` radians,
 * with the small-angle series in place of trigonometry. */
function turnToward(dx: number, dy: number, tx: number, ty: number, step: number) {
  const cross = dx * ty - dy * tx, dot = dx * tx + dy * ty;
  // cos(step), from its series: close enough for a few degrees a step.
  if (dot >= 1 - (step * step) / 2 + (step * step * step * step) / 24) return { dx: tx, dy: ty };
  const t = step + (step * step * step) / 3, side = cross >= 0 ? 1 : -1;
  const nx = dx - dy * t * side, ny = dy + dx * t * side, len = dist(nx, ny);
  return { dx: nx / len, dy: ny / len };
}

/** Flames swing after their target and burn everything in their cone. */
export function stepFlames(sim: DefendSim, wizards: Wizards, dt: number) {
  for (const f of sim.flames) {
    f.t += dt;
    if (!sim.intact(sim.map.buildings[f.tower])) f.t = f.dur;
    const target = sim.enemies.find((e) => e.id === f.target && e.hp > 0) ?? nearest(sim.enemiesNear(f.x, f.y, f.range), f);
    if (target) {
      f.target = target.id;
      const aim = toward(f.x, f.y, target.x, target.y);
      Object.assign(f, turnToward(f.dx, f.dy, aim.dx, aim.dy, FLAME_TURN * dt));
    }
    // The fire takes a moment to reach full length.
    const reach = f.range * Math.min(1, f.t / 0.25);
    const dps = flameDps(sim.levels.wizardFlame ?? 0) * sim.bonuses.towerDamage;
    for (const e of sim.enemiesNear(f.x, f.y, reach)) if (inFan(e, f.x, f.y, f.dx, f.dy, FLAME_SPREAD, reach)) sim.hurtEnemy(e, dps * dt);
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
      if (w.hit.includes(e.id) || !inFan(e, w.x, w.y, w.dx, w.dy, w.spread, w.r)) continue;
      w.hit.push(e.id);
      if (sim.hurtEnemy(e, damage) && !ENEMIES[e.kind].unyielding) e.chill = Math.max(e.chill ?? 0, chill);
    }
  }
  sim.frosts = sim.frosts.filter((w) => w.r < w.range || w.t < w.range / ICE_SPEED + FROST_LINGER);
}

/** How fast a chilled enemy moves, as a share of its pace. */
export const chilled = (e: Enemy) => (!ENEMIES[e.kind].unyielding && e.chill ? CHILL_SPEED : 1);
