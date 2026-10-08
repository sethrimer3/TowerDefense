import { buildingPaths } from "../cards.ts";
import { bannerDamage } from "./war-banner.ts";
/** DEFEND fire mages, trained at the Mage Guild: they roam the city's
 * streets like archers and, when an enemy comes within reach, hurl a
 * fireball at where it stands. The fireball bursts with splash damage
 * (sparing your own people) and leaves the ground burning (a `Blaze`),
 * which hurts every ground enemy inside it each second until it dies down.
 * Fliers pass over the flames. */
import { dist } from "../exact.ts";
import { EMBER_SHARE, ENEMIES, FIRE_MAGE, FIREBALL_RANGE, FIREBALL_SPEED, emberDps, emberSeconds, fireballSplash } from "./catalog.ts";
import { cellCenter, findPath, nearest } from "./pathing.ts";
import type { DefendSim, Soldier, Arrow } from "./sim.ts";
import { answerBanner } from "./war-banner.ts";
import { CELL_COUNT } from "./grid.ts";
import { fizzles, sheltered } from "./boats.ts";
import { CINDERS, PYROCLASM, pathRank } from "../knowledge-paths.ts";
import { ignite } from "./towers.ts";

/** The Mage Guild's Study path and rank (`knowledge-paths.ts`): each 0 unless chosen. */
const paths = (sim: DefendSim, home?: number) => {
  const p = buildingPaths(sim, home === undefined ? undefined : sim.map.buildings[home]);
  return { pyro: pathRank(p, "mageGuild", "pyroclasm"), cinders: pathRank(p, "mageGuild", "cinders") };
};

/** A fireball in flight from (x0, y0) to where its target stood (x1, y1):
 * `t` of `dur` seconds along, with the burst it makes on landing. */
export type Fireball = { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; damage: number; r: number; origin?: Arrow["origin"]; home?: number };
/** Burning ground a fireball left: its centre and radius, how long it has
 * burned of its `life`, its damage a second, and a seed for how it looks. */
export type Blaze = { x: number; y: number; r: number; t: number; life: number; dps: number; seed: number; cling?: boolean };

/** Mages throw at the nearest enemy in reach; otherwise they stroll to a
 * random street. */
export function stepMage(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  const near = nearest(sim.enemiesNear(s.x, s.y, FIREBALL_RANGE), s, FIREBALL_RANGE * FIREBALL_RANGE, true);
  if (near) {
    if (s.cd <= 0) throwFireball(sim, s, near);
    return;
  }
  if (sim.warBanner) return answerBanner(sim, sim.warBanner, s, FIRE_MAGE.speed, dt);
  if (!s.path.length && s.thinkT <= 0 && sim.streets.length) stroll(sim, s);
  sim.followPath(s, null, FIRE_MAGE.speed, dt);
}

function throwFireball(sim: DefendSim, s: Soldier, e: { x: number; y: number }) {
  s.cd = FIRE_MAGE.cooldown;
  const d = dist(e.x - s.x, e.y - s.y), { pyro } = paths(sim, s.home);
  sim.fireballs.push({
    home: s.home, origin: { x: s.x, y: s.y, attacker: s.id },
    x0: s.x, y0: s.y - 0.2, x1: e.x, y1: e.y, t: 0, dur: 0.15 + d / FIREBALL_SPEED,
    damage: pyro ? bannerDamage(sim, s) * PYROCLASM.damage : bannerDamage(sim, s), r: fireballSplash(sim.levels.mageFireball ?? 0) * (pyro >= 2 ? PYROCLASM.splash : 1),
  });
}

function stroll(sim: DefendSim, s: Soldier) {
  s.thinkT = 0.5 + sim.rand() * 1.5;
  s.target = -1;
  const goal = sim.streets[Math.floor(sim.rand() * sim.streets.length)];
  s.path = findPath(sim.ownSolid, s, cellCenter(goal), { maxCost: 1e9, maxNodes: CELL_COUNT }) ?? [];
}

/** Fireballs fly and burst where they land, setting the ground alight. */
export function stepFireballs(sim: DefendSim, dt: number) {
  for (const f of sim.fireballs) {
    f.t += dt;
    if (f.t < f.dur) continue;
    // A fireball landing in a magic boat's water goes out with a hiss.
    if (fizzles(sim, f.x1, f.y1, f.r)) continue;
    const seed = sim.explode(f.x1, f.y1, { r: f.r, damage: f.damage, friendlyFire: false, origin: f.origin });
    const level = sim.levels.mageEmbers ?? 0, { pyro, cinders } = paths(sim, f.home);
    // Meteor shower: smaller bursts either side of the landing.
    if (pyro >= 3)
      for (const side of [-1, 1]) sim.explode(f.x1 + side * f.r * 0.9, f.y1, { r: f.r / 2, damage: f.damage * PYROCLASM.shardShare, friendlyFire: false, origin: f.origin });
    const life = emberSeconds(level) * (cinders ? CINDERS.life : 1), dps = emberDps(level) * sim.bonuses.troopDamage * (cinders >= 2 ? CINDERS.dps : 1);
    sim.blazes.push({ x: f.x1, y: f.y1, r: f.r * EMBER_SHARE, t: 0, life, dps, seed, ...(cinders >= 3 ? { cling: true } : {}) });
  }
  sim.fireballs = sim.fireballs.filter((f) => f.t < f.dur);
}

/** Burning ground scorches every ground enemy inside it, and dies down. */
export function stepBlazes(sim: DefendSim, dt: number) {
  const legacyCling = paths(sim).cinders >= 3;
  for (const b of sim.blazes) {
    b.t += dt;
    for (const e of sim.enemiesNear(b.x, b.y, b.r)) {
      if (ENEMIES[e.kind].flying || sheltered(sim, e.x, e.y)) continue;
      sim.hurtEnemy(e, b.dps * dt, false, "ranged", b, false, "fire");
      // Clinging fire: it keeps burning after it walks out.
      if (b.cling || legacyCling) ignite(e, b.dps, CINDERS.cling);
    }
  }
  sim.blazes = sim.blazes.filter((b) => b.t < b.life);
}
