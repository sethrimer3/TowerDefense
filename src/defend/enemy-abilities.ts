import { dist, sq } from "../exact.ts";
import { ENEMIES } from "./catalog.ts";
import { cellCenter, center, nearestPoint, blocked } from "./pathing.ts";
import type { Point } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

export function bannerBonus(sim: DefendSim, e: Enemy) {
  return sim.bannerCarriers.some(c => c.hp > 0 && c.id !== e.id && sq(c.x - e.x) + sq(c.y - e.y) <= 16);
}
export const enemyDamage = (sim: DefendSim, e: Enemy) => ENEMIES[e.kind].damage * (bannerBonus(sim, e) ? 1.3 : 1);
export const enemySpeed = (sim: DefendSim, e: Enemy) => ENEMIES[e.kind].speed * (bannerBonus(sim, e) ? 1.25 : 1);

export function damageModifier(sim: DefendSim, e: Enemy, origin: (Point & { attacker?: number; building?: number }) | undefined, source: string, projectile: boolean) {
  if (e.kind === "burrowingMole" && (e.burrow ?? 1) > 0) return 0;
  if (e.kind !== "siegeBeetle" || !origin) return 1;
  const facing = e.facing ?? { x: 0, y: 1 };
  return (origin.x - e.x) * facing.x + (origin.y - e.y) * facing.y >= 0 ? .25 : 1.5;
}

export function stepAbilities(sim: DefendSim, e: Enemy, dt: number): boolean {
  if (e.kind === "phoenixEgg") {
    e.abilityT = (e.abilityT ?? 5) - dt;
    if (e.abilityT <= 0) {
      const phoenix = sim.spawnAuxiliary("ashPhoenix", e.x, e.y);
      if (phoenix) phoenix.reborn = true;
      e.hp = 0;
    }
    return true;
  }
  if (e.kind === "burrowingMole") {
    e.burrow = (e.burrow ?? 1);
    if (e.burrow > 0) {
      const goal = sim.streets.map(i => ({ i, ...cellCenter(i) }))
        .find(c => sim.map.city[c.i] && !sim.solid[c.i]) ?? center(sim.keep.rect);
      sim.moveToward(e, goal, { speed: enemySpeed(sim, e), dt, flying: true });
      if (dist(goal.x - e.x, goal.y - e.y) < .3 && !blocked(sim.solid, e.x, e.y)) e.burrow = 0;
      return true;
    }
  }
  if (e.kind === "necromancer") {
    e.abilityT = (e.abilityT ?? 0) - dt;
    if (e.abilityT <= 0 && (e.raised ?? 0) < 4) {
      const index = sim.corpses.findIndex(c => sq(c.x - e.x) + sq(c.y - e.y) <= 16 && !blocked(sim.solid, c.x, c.y));
      if (index >= 0) {
        const corpse = sim.corpses[index];
        if (sim.spawnAuxiliary("skeleton", corpse.x, corpse.y)) {
          sim.corpses.splice(index, 1); e.raised = (e.raised ?? 0) + 1; e.abilityT = 3;
        }
      }
    }
  }
  if (e.kind === "blinkImp") {
    if (e.blink) {
      e.blink.t -= dt;
      if (e.blink.t <= 0) {
        if (!blocked(sim.solid, e.blink.x, e.blink.y)) { e.x = e.blink.x; e.y = e.blink.y; }
        delete e.blink; e.abilityT = 4;
      }
      return true;
    }
    e.abilityT = (e.abilityT ?? 2) - dt;
    if (e.abilityT <= 0) {
      const goal = nearestPoint(sim.keep.rect, e.x, e.y), length = dist(goal.x - e.x, goal.y - e.y);
      if (length > .1) {
        for (const range of [3, 2, 1]) {
          const x = e.x + (goal.x - e.x) / length * Math.min(range, length);
          const y = e.y + (goal.y - e.y) / length * Math.min(range, length);
          if (!blocked(sim.solid, x, y)) { e.blink = { x, y, t: .6 }; break; }
        }
      }
      if (!e.blink) e.abilityT = 1;
      else return true;
    }
  }
  return false;
}
