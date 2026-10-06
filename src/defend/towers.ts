/** DEFEND towers and their projectiles. Archer towers shoot the nearest
 * enemy in range with homing arrows; cannon towers lob a shell at the
 * nearest ground enemy (not too close), which bursts where the target stood
 * when it fired. */
import { dist, sq } from "../exact.ts";
import {
  BALLISTA,
  archerCooldown,
  archerDamage,
  archerRange,
  CANNON_RANGE,
  cannonCooldown,
  cannonDamage,
  cannonSplash,
  ENEMIES,
} from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { center, nearest } from "./pathing.ts";
import { shootBallista } from "./wall-defenses.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import { FIRE_ARROWS, GUNNERY, SHARP, SIEGE_SHOT, pathRank } from "../knowledge-paths.ts";

/** The towers' Study paths and ranks (`knowledge-paths.ts`): each 0 unless chosen. */
const paths = (sim: DefendSim) => {
  const p = sim.bonuses.paths;
  return {
    fire: pathRank(p, "archerTower", "fireArrows"), sharp: pathRank(p, "archerTower", "sharpshooters"),
    gunnery: pathRank(p, "cannonTower", "gunnery"), siege: pathRank(p, "cannonTower", "siegeShot"),
  };
};
const byDistanceFrom = (c: { x: number; y: number }) => (a: Enemy, b: Enemy) => sq(a.x - c.x) + sq(a.y - c.y) - (sq(b.x - c.x) + sq(b.y - c.y));

/** Cannons won't fire at anything closer than this (cells). */
const CANNON_MIN = 1.5;
/** Arrow speed, cells per second. */
const ARROW_SPEED = 16;

export class Towers {
  /** Seconds until each tower may fire again. */
  readonly cooldown = new Map<number, number>();
  /** Arrows each Sharpshooters' tower has loosed, every few critical. */
  readonly shots = new Map<number, number>();

  step(sim: DefendSim, dt: number) {
    for (const b of sim.map.buildings) {
      if (!sim.intact(b)) continue;
      if (b.kind === "cannonTower") this.stepCannon(sim, b, dt);
      else if (b.kind === "archerTower") this.stepArcherTower(sim, b, dt);
      else if (b.kind === "wallBallista") this.stepBallista(sim, b, dt);
    }
  }

  /** Counts the tower's cooldown down; true once it may fire. */
  private ready(b: Building, dt: number) {
    const cd = (this.cooldown.get(b.id) ?? 0) - dt;
    if (cd <= 0) return true;
    this.cooldown.set(b.id, cd);
    return false;
  }

  private stepArcherTower(sim: DefendSim, b: Building, dt: number) {
    if (!this.ready(b, dt)) return;
    const c = center(b.rect), { fire, sharp } = paths(sim);
    const range = archerRange(sim.levels.archerRange) + (sharp ? SHARP.range : 0);
    const near = sim.enemiesNear(c.x, c.y, range);
    const target = sharp >= 3 ? strongest(near, c, range) : nearest(near, c);
    if (!target) return this.cooldown.set(b.id, 0);
    this.cooldown.set(b.id, archerCooldown(sim.levels.archerRate) * sim.bonuses.towerReload);
    let damage = archerDamage(sim.levels.archerDamage) * sim.bonuses.towerDamage;
    if (sharp >= 3) damage *= SHARP.damage;
    if (sharp >= 2) {
      // Sharpshooters count their arrows: every few is critical (no dice).
      const n = (this.shots.get(b.id) ?? 0) + 1;
      this.shots.set(b.id, n);
      if (n % SHARP.every === 0) damage *= SHARP.crit;
    }
    // Fire arrows set what they hit burning; at III the tower looses a volley at the nearest few.
    const burn = fire ? damage * FIRE_ARROWS.share[fire] : 0;
    const targets = fire >= 3 ? near.filter((e) => sq(e.x - c.x) + sq(e.y - c.y) <= range * range).sort(byDistanceFrom(c)).slice(0, FIRE_ARROWS.volley) : [target];
    for (const t of targets)
      sim.arrows.push({ x: c.x, y: c.y - 0.6, origin: { x: c.x, y: c.y, building: b.id }, target: t.id, damage, tx: t.x, ty: t.y, life: 2, ...(burn ? { burn, burnFor: FIRE_ARROWS.burn[fire] } : {}) });
  }

  private stepBallista(sim: DefendSim, b: Building, dt: number) {
    if (!this.ready(b, dt)) return;
    this.cooldown.set(b.id, shootBallista(sim, b) ? BALLISTA.cooldown * sim.bonuses.towerReload : 0);
  }

  private stepCannon(sim: DefendSim, b: Building, dt: number) {
    if (!this.ready(b, dt)) return;
    const c = center(b.rect), { gunnery, siege } = paths(sim);
    const range = CANNON_RANGE + (siege >= 3 ? SIEGE_SHOT.range : 0);
    const ground = sim.enemiesNear(c.x, c.y, range).filter(
      (e) => !ENEMIES[e.kind].flying && sq(e.x - c.x) + sq(e.y - c.y) > CANNON_MIN * CANNON_MIN,
    );
    const target = nearest(ground, c);
    if (!target) return this.cooldown.set(b.id, 0);
    const reload = GUNNERY.reload[gunnery] * (siege ? SIEGE_SHOT.reload : 1);
    this.cooldown.set(b.id, cannonCooldown(sim.levels.cannonRate) * sim.bonuses.towerReload * reload);
    const dist = Math.sqrt(sq(target.x - c.x) + sq(target.y - c.y));
    sim.shells.push({
      origin: { x: c.x, y: c.y, building: b.id },
      x0: c.x,
      y0: c.y - 0.4,
      x1: target.x,
      y1: target.y,
      t: 0,
      dur: 0.45 + dist * 0.07,
      damage: cannonDamage(sim.levels.cannonDamage) * sim.bonuses.towerDamage * SIEGE_SHOT.damage[siege],
      r: cannonSplash(sim.levels.cannonDamage) * (siege >= 2 ? SIEGE_SHOT.radius : 1),
      ...(gunnery >= 2 ? { grape: true } : {}),
    });
  }
}

/** Arrows home in on their target (or where it died) and hit on arrival. */
export function stepArrows(sim: DefendSim, dt: number) {
  const byId = new Map(sim.enemies.map((e) => [e.id, e]));
  for (const a of sim.arrows) {
    a.life -= dt;
    const t = byId.get(a.target);
    const alive = t !== undefined && t.hp > 0;
    if (alive) {
      a.tx = t.x;
      a.ty = t.y;
    }
    const dx = a.tx - a.x,
      dy = a.ty - a.y;
    const d = dist(dx, dy);
    const step = ARROW_SPEED * dt;
    if (d > step) {
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
      continue;
    }
    if (alive && sim.hurtEnemy(t, a.damage, true, "ranged", a.origin ?? { x: a.x, y: a.y }, true) && a.burn) ignite(t, a.burn, a.burnFor!);
    a.life = 0;
  }
  sim.arrows = sim.arrows.filter((a) => a.life > 0);
}

/** Shells fly their arc and burst on landing. */
export function stepShells(sim: DefendSim, dt: number) {
  for (const s of sim.shells) {
    s.t += dt;
    if (s.t < s.dur) continue;
    const friendlyFire = !sim.levels.cannonSafe;
    sim.explode(s.x1, s.y1, { r: s.r, damage: s.damage, friendlyFire, origin: s.origin });
    // Grapeshot: smaller bursts round the landing, one each way.
    if (s.grape)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        sim.explode(s.x1 + dx * s.r * 0.8, s.y1 + dy * s.r * 0.8, { r: s.r * GUNNERY.grapeR, damage: s.damage * GUNNERY.grapeShare, friendlyFire, origin: s.origin });
  }
  sim.shells = sim.shells.filter((s) => s.t < s.dur);
}

/** The enemy in reach with the most HP (the nearest of equals). */
function strongest(enemies: Enemy[], c: { x: number; y: number }, range: number): Enemy | null {
  let best: Enemy | null = null;
  for (const e of enemies) {
    if (e.hp <= 0 || sq(e.x - c.x) + sq(e.y - c.y) > range * range) continue;
    if (!best || e.hp > best.hp || (e.hp === best.hp && byDistanceFrom(c)(e, best) < 0)) best = e;
  }
  return best;
}

/** Sets `e` burning for `seconds` at `dps`, or keeps the hotter, longer burn it has. */
export function ignite(e: Enemy, dps: number, seconds: number) {
  e.burn = Math.max(e.burn ?? 0, seconds);
  e.burnDps = Math.max(e.burnDps ?? 0, dps);
}
