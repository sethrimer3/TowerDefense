import { fortressAreaTargets } from "./fortress.ts";
import { enemyFlying } from "./catalog.ts";
import {chargeIdle} from "./chrono.ts";
import { bannerFor, postPath, strollStreets } from "./deployment.ts";
import { castStorm, chillByMage, mageAttunement } from "./mage-attunements.ts";
import { bannerDamage } from "./war-banner.ts";
/** DEFEND mages: ordinary fireballs, Pyromancer burning blasts and Cryomancer
 * frost impacts. Stormcallers use separate chain bolts. They roam the city's
 * streets like archers and, when an enemy comes within reach, hurl a
 * fireball at where it stands. The fireball bursts with splash damage
 * (sparing your own people) and leaves the ground burning (a `Blaze`),
 * which hurts every ground enemy inside it each second until it dies down.
 * Fliers pass over the flames. */
import { dist } from "../exact.ts";
import { EMBER_SHARE, ENEMIES, FIRE_MAGE, FIREBALL_SPEED, emberDps, emberSeconds, fireballSplash } from "./catalog.ts";
import { cellCenter, findPath } from "./pathing.ts";
import type { DamageOrigin, DefendSim, Soldier, Arrow } from "./sim.ts";
import { answerBanner } from "./war-banner.ts";
import { CELL_COUNT } from "./grid.ts";
import { fizzles, sheltered } from "./boats.ts";
import { CRYOMANCY, PYROCLASM } from "../knowledge-paths.ts";
import { ignite } from "./towers.ts";

/** A fireball in flight from (x0, y0) to where its target stood (x1, y1):
 * `t` of `dur` seconds along, with the burst it makes on landing. */
export type Fireball = { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; damage: number; r: number; origin?: Arrow["origin"]; home?: number; fire?: { life: number; dps: number; cling: number }; frost?: { speed: number; chill: number; freeze: number } };
/** Burning ground a fireball left: its centre and radius, how long it has
 * burned of its `life`, its damage a second, and a seed for how it looks. */
export type Blaze = { x: number; y: number; r: number; t: number; life: number; dps: number; seed: number; mortar?: boolean; origin?: Arrow["origin"]; cling?: boolean; clingFor?: number; credit?: DamageOrigin };

/** Mages throw at the nearest enemy in reach; otherwise they stroll to a
 * random street. */
export function stepMage(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  const attuned = mageAttunement(sim, s.home), range = attuned.range;
  const near = sim.nearestEnemy(s.x, s.y, range);
  if (near) {
    if (attuned.family !== "plain") s.target = near.id;
    if (s.cd <= 0) {
      if (attuned.family === "storm") { s.cd = FIRE_MAGE.cooldown; castStorm(sim, s, near, attuned.rank); }
      else throwFireball(sim, s, near);
    }
    return;
  }
  if(!bannerFor(sim,s)&&chargeIdle(sim,s,range,bannerDamage(sim,s)*(attuned.family==="fire"?PYROCLASM.damage[attuned.rank]:attuned.family==="frost"?CRYOMANCY.damage:1),()=>s.cd<=0,()=>{s.cd=FIRE_MAGE.cooldown;}))return;
  const banner = bannerFor(sim, s);
  if (banner) return answerBanner(sim, banner, s, FIRE_MAGE.speed, dt);
  if (!s.path.length && s.thinkT <= 0) {
    if (postPath(sim, s)) s.thinkT = 0.5;
    else stroll(sim, s);
  }
  sim.followPath(s, null, FIRE_MAGE.speed, dt);
}

function throwFireball(sim: DefendSim, s: Soldier, e: { x: number; y: number }) {
  s.cd = FIRE_MAGE.cooldown;
  const d = dist(e.x - s.x, e.y - s.y), { family, rank } = mageAttunement(sim, s.home);
  const fire = family === "fire", frost = family === "frost", base = bannerDamage(sim, s);
  const burnLevel = sim.levels.mageEmbers ?? 0;
  sim.fireballs.push({
    ...(sim.bonuses.structurePaths || fire || frost ? { home: s.home } : {}), origin: { x: s.x, y: s.y, attacker: s.id },
    x0: s.x, y0: s.y - 0.2, x1: e.x, y1: e.y, t: 0, dur: 0.15 + d / FIREBALL_SPEED,
    damage: base * (fire ? PYROCLASM.damage[rank] : frost ? CRYOMANCY.damage : 1),
    r: fireballSplash(sim.levels.mageFireball ?? 0) * (fire ? PYROCLASM.radius[rank] : frost ? CRYOMANCY.radius[rank] : 1),
    ...(fire ? { fire: { life: emberSeconds(burnLevel) * PYROCLASM.life[rank], dps: emberDps(burnLevel) * sim.bonuses.troopDamage * PYROCLASM.damage[rank] * (s.damage ? base / s.damage : 1), cling: PYROCLASM.cling[rank] } } : {}),
    ...(frost ? { frost: { speed: CRYOMANCY.speed[rank], chill: CRYOMANCY.chill[rank], freeze: CRYOMANCY.freeze[rank] } } : {}),
  });
}

function stroll(sim: DefendSim, s: Soldier) {
  const streets = strollStreets(sim, s);
  if (!streets.length) return;
  s.thinkT = 0.5 + sim.rand() * 1.5;
  s.target = -1;
  const goal = streets[Math.floor(sim.rand() * streets.length)];
  s.path = findPath(sim.ownSolid, s, cellCenter(goal), { maxCost: 1e9, maxNodes: CELL_COUNT }) ?? [];
}

/** Fireballs fly and burst where they land, setting the ground alight. */
export function stepFireballs(sim: DefendSim, dt: number) {
  for (const f of sim.fireballs) {
    f.t += dt;
    if (f.t < f.dur) continue;
    if (f.frost) {
      for (const e of fortressAreaTargets(sim.enemiesNear(f.x1, f.y1, f.r))) {
        const d = dist(e.x - f.x1, e.y - f.y1);
        if (e.hp <= 0 || d > f.r || sheltered(sim, e.x, e.y)) continue;
        const hit = sim.hurtEnemy(e, f.damage * (1 - .6 * d / f.r), true, "ranged", f.origin);
        if (hit) chillByMage(e, f.frost.speed, f.frost.chill, f.frost.freeze);
      }
      // Already hit: borrow only the existing icy burst artwork and lifetime.
      sim.frostBursts.push({ x: f.x1, y: f.y1, r: f.r, t: 0, nova: false, damage: 0, freeze: 0, hit: true });
      continue;
    }
    // Keep ordinary mage timing, water and RNG behavior unchanged.
    if (fizzles(sim, f.x1, f.y1, f.r)) continue;
    const seed = sim.explode(f.x1, f.y1, { r: f.r, damage: f.damage, friendlyFire: false, origin: f.origin });
    const level = sim.levels.mageEmbers ?? 0;
    const life = f.fire?.life ?? emberSeconds(level), dps = f.fire?.dps ?? emberDps(level) * sim.bonuses.troopDamage;
    if (f.fire) for (const e of fortressAreaTargets(sim.enemiesNear(f.x1, f.y1, f.r)))
      if (e.hp > 0 && dist(e.x - f.x1, e.y - f.y1) <= f.r && !sheltered(sim, e.x, e.y)) ignite(e, dps, f.fire.cling, sim.tallyOrigin(f.origin));
    sim.blazes.push({ x: f.x1, y: f.y1, r: f.r * (f.fire ? 1 : EMBER_SHARE), t: 0, life, dps, seed,
      ...(f.fire ? { clingFor: f.fire.cling, origin: f.origin } : sim.tally && f.origin ? { credit: sim.tallyOrigin(f.origin) } : {}) });
  }
  sim.fireballs = sim.fireballs.filter((f) => f.t < f.dur);
}

/** Burning ground scorches every ground enemy inside it, and dies down. */
export function stepBlazes(sim: DefendSim, dt: number) {
  for (const b of sim.blazes) {
    b.t += dt;
    for (const e of fortressAreaTargets(sim.enemiesNear(b.x, b.y, b.r))) {
      if (enemyFlying(e) || sheltered(sim, e.x, e.y)) continue;
      sim.hurtEnemy(e, b.dps * dt, false, "ranged", b.origin ?? b, false, "fire", 0, b.credit);
      // Clinging fire: it keeps burning after it walks out.
      if (b.clingFor || b.cling) ignite(e, b.dps, b.clingFor ?? 2, sim.tallyOrigin(b.credit ?? b.origin));
    }
  }
  sim.blazes = sim.blazes.filter((b) => b.t < b.life);
}
