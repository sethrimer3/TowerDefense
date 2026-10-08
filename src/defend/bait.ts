import { buildingPaths } from "../cards.ts";
/** DEFEND monster bait: a stack of crates every enemy goes for before the
 * keep. While any stack stands, ground enemies walk the bait's own flow
 * field (`sim.baitField`, filled from every standing stack, so each goes for
 * the nearest by the way it walks), fliers and boats head for the nearest
 * stack, siege engines shoot one in range first, and houses lure nobody.
 *
 * A fallen stack stays fallen unless Restocking lets civilians rebuild it,
 * once a level, each stack counted alone (`sim.baitFalls`). With Powder
 * kegs a stack bursts as it falls (sparing your own people) and leaves the
 * ground burning (a `Blaze`, like a fire mage's). Its Study paths: oil-soaked
 * bait sets biters alight, fortified crates hold out and, spiked, bite back
 * (`baitBitten`). A run with no bait plays exactly as before. */
import { baitBlastDamage, baitBlastRadius, baitFireDps, baitFireSeconds } from "./catalog.ts";
import { fizzles } from "./boats.ts";
import type { Building } from "./citygen.ts";
import { center, rectDist, type Point } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import { FORTIFY, OIL, pathRank } from "../knowledge-paths.ts";
import { ignite } from "./towers.ts";

/** True while some stack of bait stands whole. */
export function baitStanding(sim: DefendSim): boolean {
  for (const b of sim.baits) if (sim.intact(b)) return true;
  return false;
}

/** The standing stack nearest (x, y) as the crow flies, or null. */
export function nearestBait(sim: DefendSim, x: number, y: number): Building | null {
  let best: Building | null = null,
    bd = Infinity;
  for (const b of sim.baits) {
    if (!sim.intact(b)) continue;
    const d = rectDist(b.rect, x, y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Where an enemy at (x, y) is headed: the nearest standing stack's centre,
 * else the keep's. */
export function lureOf(sim: DefendSim, x: number, y: number): Building {
  return nearestBait(sim, x, y) ?? sim.keep;
}

/** Whether civilians may rebuild this fallen stack: Restocking allows one
 * rebuild a level. */
export function restockable(sim: DefendSim, b: Building): boolean {
  return (sim.baitFalls.get(b.id) ?? 0) <= (sim.levels.baitRestock ?? 0);
}

/** A stack has just fallen: count it, and with Powder kegs it bursts and
 * sets the ground alight. */
export function baitFell(sim: DefendSim, b: Building, burst: boolean) {
  sim.baitFalls.set(b.id, (sim.baitFalls.get(b.id) ?? 0) + 1);
  const level = sim.levels.baitBlast ?? 0;
  if (!burst || level <= 0) return;
  const c: Point = center(b.rect);
  const r = baitBlastRadius(level);
  // Kegs falling into a magic boat's water only hiss.
  if (fizzles(sim, c.x, c.y, r)) return;
  const seed = sim.explode(c.x, c.y, { r, damage: baitBlastDamage(level) * sim.bonuses.bombDamage, friendlyFire: false });
  sim.blazes.push({ x: c.x, y: c.y, r, t: 0, life: baitFireSeconds(level), dps: baitFireDps(level), seed });
}

/** An enemy has bitten a stack for `bite`: oil-soaked bait sets it alight,
 * and spiked crates give the bite back. Nothing without those paths. */
export function baitBitten(sim: DefendSim, e: Enemy, bite: number, b?: Building) {
  const p = buildingPaths(sim, b);
  const oil = pathRank(p, "bait", "oilSoaked"), fort = pathRank(p, "bait", "fortified");
  if (oil) ignite(e, OIL.dps[oil], OIL.burn[oil]);
  if (fort >= 3) sim.hurtEnemy(e, bite * FORTIFY.thorns, true, "melee");
}
