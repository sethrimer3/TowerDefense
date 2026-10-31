/** Blight walker weapons share native fortress parts and siege-ball flight. */
import { dist, sq } from "../exact.ts";
import { ENEMIES } from "./catalog.ts";
import { enemyDamage } from "./enemy-abilities.ts";
import type { Point } from "./pathing.ts";
import type { Rect } from "./grid.ts";
import type { DefendSim, Enemy } from "./sim.ts";

export const BLIGHT_LASER = { life: .24, width: .13, cooldown: 2 } as const;
export type BlightLaser = { x0: number; y0: number; x1: number; y1: number; life: number };

/** Slab intersection includes the entire footprint and never stops at a wall. */
export function laserCrossesRect(from: Point, to: Point, rect: Rect, width = BLIGHT_LASER.width): boolean {
  let lo = 0, hi = 1;
  for (const [start, delta, min, max] of [
    [from.x, to.x - from.x, rect.x - width, rect.x + rect.w + width],
    [from.y, to.y - from.y, rect.y - width, rect.y + rect.h + width],
  ]) {
    if (delta === 0) { if (start < min || start > max) return false; continue; }
    const a = (min - start) / delta, b = (max - start) / delta;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    if (lo > hi) return false;
  }
  return true;
}

export function fireBlightTurret(sim: DefendSim, part: Enemy, target: Point, range: number) {
  const laser = part.fortressPart!.weapon === "laser";
  const damage = enemyDamage(sim, part), length = dist(target.x - part.x, target.y - part.y);
  part.aim = { x: target.x, y: target.y };
  part.cd = laser ? BLIGHT_LASER.cooldown : ENEMIES[part.kind].cooldown;
  if (!laser) {
    sim.siegeShots.push({ kind: "ball", energy: true, x0: part.x, y0: part.y,
      x1: target.x, y1: target.y, t: 0, dur: .15 + length / 8,
      damage, r: .75, seed: part.id });
    return;
  }
  const dx = length > 0 ? (target.x - part.x) / length : 0;
  const dy = length > 0 ? (target.y - part.y) / length : 1;
  const end = { x: part.x + dx * range, y: part.y + dy * range };
  for (const unit of [...sim.soldiers, ...sim.civilians]) {
    if (unit.hp <= 0 || ("guard" in unit && unit.guard)) continue;
    const k = Math.max(0, Math.min(1, ((unit.x - part.x) * dx + (unit.y - part.y) * dy) / range));
    if (sq(part.x + dx * range * k - unit.x) + sq(part.y + dy * range * k - unit.y) > sq(BLIGHT_LASER.width)) continue;
    sim.hurtDefender(unit, damage); unit.flash = .12;
  }
  for (const building of sim.map.buildings) {
    if (sim.intact(building) && laserCrossesRect(part, end, building.rect)) sim.damageBuilding(building.id, damage);
  }
  sim.blightLasers.push({ x0: part.x, y0: part.y, x1: end.x, y1: end.y, life: BLIGHT_LASER.life });
}

export function stepBlightLasers(sim: DefendSim, dt: number) {
  if (!sim.blightLasers.length) return;
  for (const beam of sim.blightLasers) beam.life -= dt;
  sim.blightLasers = sim.blightLasers.filter(beam => beam.life > 0);
}
