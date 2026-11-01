/** The large Blight walker's charged lob and indiscriminate pulsing blast. */
import { dist, sq } from "../exact.ts";
import { ENEMIES } from "./catalog.ts";
import { enemyDamage } from "./enemy-abilities.ts";
import { fortressAreaTargets } from "./fortress.ts";
import { fizzles, sheltered } from "./boats.ts";
import { nearestPoint, rectDist } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

export const BLIGHT_PLASMA = { charge: 15, diameter: .75, range: 14, recovery: 3,
  radius: 6.5, life: 6, pulse: .5, pulses: 12, scorchLife: 24 } as const;
export type PlasmaShot = { x0: number; y0: number; x1: number; y1: number;
  t: number; dur: number; ballRadius: number; damage: number; seed: number };
export type PlasmaSphere = { x: number; y: number; r: number; t: number; pulses: number; damage: number; seed: number };

export const plasmaBallRadius = (kind: Enemy["kind"], progress: number) =>
  ENEMIES[kind].size * BLIGHT_PLASMA.diameter / 2 * (.07 + .93 * Math.max(0, Math.min(1, progress)));

/** The aim locks when charging begins, giving defenders a readable warning. */
export function stepPlasmaTurret(sim: DefendSim, part: Enemy, dt: number) {
  if (part.hp <= 0) return true;
  if (!part.plasmaCharge) {
    if (part.cd > 0) return true;
    const foe = sim.nearestDefender(part.x, part.y, BLIGHT_PLASMA.range);
    let building = sim.intact(sim.keep) && rectDist(sim.keep.rect, part.x, part.y) <= BLIGHT_PLASMA.range ? sim.keep : undefined;
    if (!building) {
      let best: number = BLIGHT_PLASMA.range;
      for (const b of sim.map.buildings) {
        const d = rectDist(b.rect, part.x, part.y);
        if (sim.intact(b) && d <= best) { building = b; best = d; }
      }
    }
    const target = building ? nearestPoint(building.rect, part.x, part.y) : foe;
    if (!target) return true;
    part.plasmaCharge = { elapsed: 0, x: target.x, y: target.y };
    part.aim = { x: target.x, y: target.y };
  }
  const charge = part.plasmaCharge;
  charge.elapsed = Math.min(BLIGHT_PLASMA.charge, charge.elapsed + Math.max(0, dt));
  if (charge.elapsed + 1e-9 < BLIGHT_PLASMA.charge) return true;
  const length = dist(charge.x - part.x, charge.y - part.y);
  sim.plasmaShots.push({ x0: part.x, y0: part.y, x1: charge.x, y1: charge.y, t: 0,
    dur: 1.5 + length / 7, ballRadius: plasmaBallRadius(part.kind, 1),
    damage: enemyDamage(sim, part), seed: part.id * 7919 + (part.plasmaFired ?? 0) * 997 });
  part.plasmaFired = (part.plasmaFired ?? 0) + 1;
  delete part.plasmaCharge;
  part.cd = BLIGHT_PLASMA.recovery;
  return true;
}

/** Native defenses still apply, but allegiance offers no protection. */
function pulse(sim: DefendSim, sphere: PlasmaSphere) {
  const { x, y, r, damage } = sphere;
  if (fizzles(sim, x, y, r)) return;
  for (const unit of [...sim.soldiers, ...sim.civilians]) {
    if (unit.hp <= 0 || ("guard" in unit && unit.guard) || sheltered(sim, unit.x, unit.y) || sq(unit.x - x) + sq(unit.y - y) > sq(r)) continue;
    sim.hurtDefender(unit, damage); unit.flash = .12;
  }
  for (const b of sim.map.buildings)
    if (sim.intact(b) && rectDist(b.rect, x, y) <= r) sim.damageBuilding(b.id, damage);
  const nearby = sim.enemies.filter(e => e.hp > 0 && sq(e.x - x) + sq(e.y - y) <= sq(r));
  for (const e of fortressAreaTargets(nearby))
    if (!sheltered(sim, e.x, e.y)) sim.hurtEnemy(e, damage, true, "ranged", { x, y }, false, "explosion");
}

function advanceSphere(sim: DefendSim, sphere: PlasmaSphere, dt: number) {
  const end = Math.min(BLIGHT_PLASMA.life, sphere.t + dt);
  while (sphere.pulses < BLIGHT_PLASMA.pulses && sphere.pulses * BLIGHT_PLASMA.pulse <= end + 1e-9) {
    pulse(sim, sphere); sphere.pulses++;
  }
  sphere.t += dt;
}

/** Existing fields age first; new impacts get only the remainder of the step. */
export function stepPlasma(sim: DefendSim, dt: number) {
  if (!(dt >= 0) || !Number.isFinite(dt)) return;
  for (const sphere of sim.plasmaSpheres) advanceSphere(sim, sphere, dt);
  if (sim.plasmaSpheres.length) sim.plasmaSpheres = sim.plasmaSpheres.filter(s => s.t + 1e-9 < BLIGHT_PLASMA.life);
  if (!sim.plasmaShots.length) return;
  for (const shot of sim.plasmaShots) {
    shot.t += dt;
    if (shot.t + 1e-9 < shot.dur) continue;
    if (fizzles(sim, shot.x1, shot.y1, BLIGHT_PLASMA.radius)) continue;
    sim.atmosphere?.disturb(shot.x1, shot.y1, BLIGHT_PLASMA.radius * 1.6, 0, 0, true);
    sim.scorches.push({ x: shot.x1, y: shot.y1, r: BLIGHT_PLASMA.radius * 1.2,
      t: 0, life: BLIGHT_PLASMA.scorchLife, seed: shot.seed, plasma: true });
    sim.effects.push({ kind: "boom", x: shot.x1, y: shot.y1, r: BLIGHT_PLASMA.radius * .45, t: 0, seed: shot.seed });
    const sphere: PlasmaSphere = { x: shot.x1, y: shot.y1, r: BLIGHT_PLASMA.radius,
      t: 0, pulses: 0, damage: shot.damage, seed: shot.seed };
    advanceSphere(sim, sphere, Math.max(0, shot.t - shot.dur));
    if (sphere.t + 1e-9 < BLIGHT_PLASMA.life) sim.plasmaSpheres.push(sphere);
  }
  sim.plasmaShots = sim.plasmaShots.filter(s => s.t + 1e-9 < s.dur);
}
