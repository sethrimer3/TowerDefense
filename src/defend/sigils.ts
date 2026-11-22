/** The Sigil tower, the Wizard tower's fourth branch: a "wireless" caster.
 *
 * It charges for `SIGIL.charge[rank]` seconds (the renderer glows its roof
 * and lets fireflies gather round it as it does). Charged, it marks where
 * the nearest ground enemy in reach stands (it never aims at fliers) and a
 * magic circle starts drawing itself there on the ground, taking
 * `SIGIL.draw` seconds. The circle doesn't follow anyone: when it closes it
 * bursts over everything inside, fliers too. From Kindled sigil (I) the
 * burst sets them burning; Greater circle (II) widens and quickens it;
 * Ice-fire (III) turns it blue: a harder burst and a blue burn
 * (`Enemy.iceFire`) that slows them and that ice doesn't put out.
 *
 * Nothing here draws from the run's random stream, so a battle with a Sigil
 * tower still replays exactly from its seed. */
import { ENEMIES, enemyFlying, flameDps, flameRange } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { center } from "./pathing.ts";
import type { DamageOrigin, DefendSim, Enemy } from "./sim.ts";
import { sq } from "../exact.ts";
import { SIGIL, pathRank } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { rangeScale } from "./building-orders.ts";
import { fortressAreaTargets } from "./fortress.ts";
import { sheltered } from "./boats.ts";
import { ignite } from "./towers.ts";
import { chargeIdle } from "./chrono.ts";

/** A magic circle drawing itself on the ground: where, whose, how long it
 * has been drawing and will take, the burst's radius, the path rank it was
 * cast at, and a seed for how its runes look. */
export type Sigil = { tower: number; x: number; y: number; t: number; draw: number; r: number; rank: number; seed: number; origin: DamageOrigin };

type Armed = Pick<DefendSim, "levels" | "bonuses">;
/** A Sigil tower's Sigilcraft rank (0 before any). */
export const sigilRank = (sim: Armed, b?: Building) => pathRank(buildingPaths(sim, b), "sigilTower", "sigils");
/** How far a Sigil tower casts its circles. */
export const sigilReach = (sim: Armed, b?: Building) => (flameRange(sim.levels.wizardFlame ?? 0) + SIGIL.reach) * rangeScale(sim, b);
/** What one burst deals to each enemy inside it. */
export const sigilDamage = (sim: Armed, rank: number) =>
  flameDps(sim.levels.wizardFlame ?? 0) * sim.bonuses.towerDamage * SIGIL.damage * (rank >= 3 ? SIGIL.ice.damage : 1);

const grounded = (e: Enemy) => !enemyFlying(e);

/** Each Sigil tower's charge, 0 to 1. */
export class SigilTowers {
  readonly charge = new Map<number, number>();
  private cast = 0;

  step(sim: DefendSim, dt: number) {
    for (const b of sim.map.buildings) {
      if (b.kind !== "sigilTower" || !sim.intact(b)) continue;
      const rank = sigilRank(sim, b);
      const charge = Math.min(1, (this.charge.get(b.id) ?? 0) + dt / SIGIL.charge[rank]);
      this.charge.set(b.id, charge);
      if (charge < 1) continue;
      const c = center(b.rect), range = sigilReach(sim, b);
      const target = sim.buildingTarget(b, range, grounded);
      if (!target) {
        chargeIdle(sim, c, range, sigilDamage(sim, rank), () => true, () => this.charge.set(b.id, 0));
        continue;
      }
      sim.sigils.push({ tower: b.id, x: target.x, y: target.y, t: 0, draw: SIGIL.draw, r: SIGIL.radius[rank], rank, seed: b.id * 7919 + this.cast++ * 104729, origin: { x: c.x, y: c.y, building: b.id } });
      this.charge.set(b.id, 0);
    }
  }

  /** How charged tower `id` is, 0 to 1 (0 for any other building). */
  charged(id: number) {
    return this.charge.get(id) ?? 0;
  }

  forget(id: number) {
    this.charge.delete(id);
  }
}

/** Circles draw on; each one closed bursts over everything inside it. */
export function stepSigils(sim: DefendSim, dt: number) {
  for (const s of sim.sigils) {
    s.t += dt;
    if (s.t >= s.draw) burst(sim, s);
  }
  sim.sigils = sim.sigils.filter((s) => s.t < s.draw);
}

function burst(sim: DefendSim, s: Sigil) {
  const damage = sigilDamage(sim, s.rank), blue = s.rank >= 3;
  for (const e of fortressAreaTargets(sim.enemiesNear(s.x, s.y, s.r))) {
    if (sq(e.x - s.x) + sq(e.y - s.y) > s.r * s.r || sheltered(sim, e.x, e.y)) continue;
    if (!sim.hurtEnemy(e, damage, true, "ranged", s.origin, false, "explosion") || e.hp <= 0) continue;
    if (blue) iceFire(e, damage * SIGIL.ice.share, SIGIL.ice.seconds, s.origin);
    else if (s.rank >= 1) ignite(e, damage * SIGIL.burn.share, SIGIL.burn.seconds, s.origin);
  }
  sim.effects.push({ kind: "boom", x: s.x, y: s.y, t: 0, r: s.r, seed: s.seed, ...(blue ? { blue: true as const } : {}) });
  sim.scorches.push({ x: s.x, y: s.y, r: s.r * 0.6, seed: s.seed, t: 0, life: 2.5 });
}

/** Sets `e` alight with blue ice-fire for `seconds`, `dps` a second; the
 * hotter source takes the credit. */
export function iceFire(e: Enemy, dps: number, seconds: number, origin?: DamageOrigin) {
  if (dps >= (e.iceFireDps ?? 0)) e.iceFireOrigin = origin;
  e.iceFire = Math.max(e.iceFire ?? 0, seconds);
  e.iceFireDps = Math.max(e.iceFireDps ?? 0, dps);
}

/** The share of its pace blue ice-fire leaves `e` (1 when not alight). */
export const iceFireSpeed = (e: Enemy) => (e.iceFire !== undefined && !ENEMIES[e.kind].unyielding ? SIGIL.ice.slow : 1);

/** Blue ice-fire burns on, then goes out. */
export function stepIceFire(sim: DefendSim, dt: number) {
  for (const e of sim.enemies) {
    if (e.iceFire === undefined) continue;
    if (e.hp > 0 && !sheltered(sim, e.x, e.y)) sim.hurtEnemy(e, e.iceFireDps! * Math.min(dt, e.iceFire), false, "ranged", undefined, false, "fire", 0, e.iceFireOrigin);
    if ((e.iceFire -= dt) <= 0) {
      delete e.iceFire;
      delete e.iceFireDps;
      delete e.iceFireOrigin;
    }
  }
}
