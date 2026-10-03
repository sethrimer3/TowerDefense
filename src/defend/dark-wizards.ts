/** DEFEND's dark wizard keep and its black lightning. The keep's four
 * corner turrets (`turretSpots`) each loose a bolt at the nearest enemy in
 * range, and the keep summons one dark wizard (trained like any garrison,
 * `troops.ts`), who hunts through the city like a valkyrie and casts a far
 * longer bolt. A bolt strikes its target, then leaps to the nearest enemy not
 * yet struck within `chainJump` cells, and on, up to its chain's length
 * (`turretChain`, `wizardChain`), hurting every enemy it strikes, fliers
 * too. Where it runs out of enemies to leap to, it forks back from the
 * latest enemy it struck that still has one. How it looks is
 * `dark-art.ts`'s. */
import { sq } from "../exact.ts";
import { DARK_WIZARD, TURRET, chainJump, turretChain, turretSpots, wizardChain } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { nearest, type Point } from "./pathing.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";
import { seek } from "./valkyries.ts";

/** A bolt of black lightning: the points it ran through, (x, y) pairs from
 * where it was cast through every enemy it struck, and for each point after
 * the first the point it leapt from (`from`); `t` of `life` seconds ago;
 * `seed` jitters its jags. */
export type Bolt = { pts: number[]; from: number[]; t: number; life: number; seed: number };

/** How long a bolt lingers, in seconds. */
export const BOLT_LIFE = 0.32;
/** How high over its spot a turret's bolt leaves, and where on a wizard
 * (cells right and down of him) his staff's ruby is. */
const TURRET_TOP = 0.5;
export const STAFF = { x: 0.6, y: -0.75 };

/** The corner turrets of every standing dark keep. */
export class DarkKeeps {
  /** Seconds until each turret may fire again, keyed by building id × 4 +
   * corner. */
  readonly cooldown = new Map<number, number>();

  step(sim: DefendSim, dt: number) {
    for (const b of sim.map.buildings) if (b.kind === "darkKeep" && sim.intact(b)) this.turrets(sim, b, dt);
  }

  private turrets(sim: DefendSim, b: Building, dt: number) {
    const links = turretChain(sim.levels.chainCount ?? 0), jump = chainJump(sim.levels.chainReach ?? 0);
    turretSpots(b.rect).forEach((spot, k) => {
      const key = b.id * 4 + k;
      const cd = (this.cooldown.get(key) ?? 0) - dt;
      if (cd > 0) return this.cooldown.set(key, cd);
      const target = nearest(sim.enemiesNear(spot.x, spot.y, TURRET.range), spot);
      if (!target) return this.cooldown.set(key, 0);
      this.cooldown.set(key, TURRET.cooldown * sim.bonuses.towerReload);
      chainBolt(sim, { x: spot.x, y: spot.y - TURRET_TOP }, target, TURRET.damage * sim.bonuses.towerDamage, links, jump);
    });
  }
}

/** The dark wizard casts at the nearest enemy within his reach, holding his
 * ground while he does; otherwise he hunts the nearest enemy in the city,
 * or walks the streets. */
export function stepDarkWizard(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  const near = nearest(sim.enemiesNear(s.x, s.y, DARK_WIZARD.range), s, DARK_WIZARD.range * DARK_WIZARD.range, true);
  if (near) {
    s.target = near.id;
    if (s.cd > 0) return;
    s.cd = DARK_WIZARD.cooldown;
    chainBolt(sim, { x: s.x + STAFF.x, y: s.y + STAFF.y }, near, s.damage, wizardChain(sim.levels.chainCount ?? 0), chainJump(sim.levels.chainReach ?? 0));
    return;
  }
  if (s.thinkT <= 0) seek(sim, s);
  sim.followPath(s, null, DARK_WIZARD.speed, dt);
}

/** Looses a bolt from `cast` at `first`, leaping on through up to `links`
 * enemies in all, each the nearest not yet struck within `jump` of the last
 * (or, where that has none, of the latest struck that has), and hurts each
 * by `damage`. */
export function chainBolt(sim: DefendSim, cast: Point, first: Enemy, damage: number, links: number, jump: number): Bolt {
  const pts = [cast.x, cast.y], from: number[] = [];
  const struck = new Set<number>();
  /** Struck enemies that may still have one to leap to, with their points. */
  const live: [Enemy, number][] = [];
  let at: Enemy | null = first, parent = 0;
  while (at) {
    struck.add(at.id);
    from.push(parent);
    pts.push(at.x, at.y);
    live.push([at, pts.length / 2 - 1]);
    sim.hurtEnemy(at, damage);
    at = null;
    while (struck.size < links && live.length && !at) {
      const [e, k] = live[live.length - 1];
      at = nextLink(sim, e, jump, struck);
      if (at) parent = k;
      else live.pop();
    }
  }
  const bolt: Bolt = { pts, from, t: 0, life: BOLT_LIFE, seed: Math.imul(first.id, 0x9e3779b1) >>> 0 };
  sim.bolts.push(bolt);
  return bolt;
}

/** The nearest enemy within `jump` of `e` the bolt hasn't struck (the
 * earliest of equals). */
function nextLink(sim: DefendSim, e: Enemy, jump: number, struck: Set<number>): Enemy | null {
  let best: Enemy | null = null, bd = jump * jump;
  for (const o of sim.enemiesNear(e.x, e.y, jump)) {
    if (struck.has(o.id)) continue;
    const d = sq(o.x - e.x) + sq(o.y - e.y);
    if (d < bd || (d === bd && !best)) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/** Bolts fade. */
export function stepBolts(sim: DefendSim, dt: number) {
  for (const b of sim.bolts) b.t += dt;
  sim.bolts = sim.bolts.filter((b) => b.t < b.life);
}
