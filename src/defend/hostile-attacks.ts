import { enemyDamage, bannerBonus } from "./enemy-abilities.ts";
import { dist, sq } from "../exact.ts";
import { ENEMIES } from "./catalog.ts";
import { SUB } from "./grid.ts";
import { nearestPoint, rectDist } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import { fizzles, sheltered } from "./boats.ts";

/** Enemy attacks spare other enemies and deal full damage to the city. */
export function hostileBurst(sim: DefendSim, x: number, y: number, radius: number, damage: number) {
  // A burst in a magic boat's water fizzles, and spares whoever stands in it.
  if (fizzles(sim, x, y, radius)) return;
  for (const u of [...sim.soldiers, ...sim.civilians]) {
    if (u.hp <= 0 || ("guard" in u && u.guard) || sq(u.x - x) + sq(u.y - y) > sq(radius) || sheltered(sim, u.x, u.y)) continue;
    u.hp -= damage;
    u.flash = 0.12;
  }
  for (const b of sim.map.buildings) if (sim.intact(b) && rectDist(b.rect, x, y) <= radius) sim.damageBuilding(b.id, damage);
}

export function hostileSpecial(sim: DefendSim, e: Enemy, dt: number): boolean {
  const def = ENEMIES[e.kind];
  if (e.kind !== "darkKnight" && e.kind !== "bombOrc" && e.kind !== "bombBird" && e.kind !== "voidSparrow") return false;
  const range = e.kind === "voidSparrow" ? SUB * 0.75 : e.kind === "darkKnight" ? 1.6 : 0.9;
  const foe = sim.nearestDefender(e.x, e.y, range);
  const building = sim.map.buildings.find(b => sim.intact(b) && rectDist(b.rect, e.x, e.y) <= range);
  const target = foe ?? (building ? nearestPoint(building.rect, e.x, e.y) : null);
  if (e.kind === "bombBird" && e.dive !== undefined) {
    e.dive -= dt;
    if (e.dive <= 0) detonate(sim, e, 2.5);
    return true;
  }
  if (!target) return false;
  if (e.kind === "bombOrc") { detonate(sim, e, 2); return true; }
  if (e.kind === "bombBird") { e.dive = 0.6; return true; }
  if (e.cd > 0) return true;
  e.cd = def.cooldown;
  if (e.kind === "voidSparrow") {
    // Diameter 1.5 building tiles = 10.5 cells; radius 5.25 cells.
    sim.blackHoles.push({ x: e.x, y: e.y, r: SUB * 0.75, damage: enemyDamage(sim, e), life: 8, pulse: 0, seed: e.id });
    return true;
  }
  let dx = target.x - e.x, dy = target.y - e.y;
  const length = dist(dx, dy);
  if (length > 0) { dx /= length; dy /= length; } else { dx = 0; dy = 1; }
  e.slash = { dx, dy, t: 0.35 };
  const inside = (x: number, y: number) => sq(x - e.x) + sq(y - e.y) <= sq(range) && (x - e.x) * dx + (y - e.y) * dy >= 0;
  for (const u of [...sim.soldiers, ...sim.civilians]) if (u.hp > 0 && !("guard" in u && u.guard) && inside(u.x, u.y)) {
    u.hp -= enemyDamage(sim, e); u.flash = 0.12;
  }
  for (const b of sim.map.buildings) {
    const near = nearestPoint(b.rect, e.x, e.y);
    if (sim.intact(b) && inside(near.x, near.y)) sim.damageBuilding(b.id, enemyDamage(sim, e));
  }
  return true;
}

function detonate(sim: DefendSim, e: Enemy, r: number) {
  e.hp = 0;
  hostileBurst(sim, e.x, e.y, r, enemyDamage(sim, e));
  sim.effects.push({ kind: "boom", x: e.x, y: e.y, t: 0, r, seed: e.id });
  sim.scorches.push({ x: e.x, y: e.y, r, seed: e.id, t: 0, life: 3 });
}

export function stepBlackHoles(sim: DefendSim, dt: number) {
  for (const hole of sim.blackHoles) {
    const active = Math.min(dt, Math.max(0, hole.life));
    hole.life -= dt;
    hole.pulse -= active;
    while (hole.pulse <= 0 && active > 0) {
      hostileBurst(sim, hole.x, hole.y, hole.r, hole.damage);
      hole.pulse += 0.5;
    }
  }
  sim.blackHoles = sim.blackHoles.filter(h => h.life > 0);
}

/** Rapid poison ticks affect people only. Lethal clouds check contact every
 * simulation step, independently of the ordinary attack cooldown. */
export function stepPoison(sim: DefendSim, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  for (const e of sim.enemies) {
    const poison = ENEMIES[e.kind].poison;
    if (!poison || e.hp <= 0) continue;
    let hits = 1;
    if (!poison.lethal) {
      e.poisonT = (e.poisonT ?? 0) - dt;
      hits = 0;
      while (e.poisonT <= 0) { e.poisonT += 0.1; hits++; }
      if (!hits) continue;
    }
    for (const u of [...sim.soldiers, ...sim.civilians]) {
      if (u.hp <= 0 || sq(u.x - e.x) + sq(u.y - e.y) > sq(poison.radius)) continue;
      u.hp = poison.lethal ? 0 : Math.max(0, u.hp - poison.damage * hits * (bannerBonus(sim, e) ? 1.3 : 1));
      u.flash = 0.12;
    }
  }
}
