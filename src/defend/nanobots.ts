/** C4 nanobots, the cannon tower's ultimate (`nanoTower`). Very slowly, from
 * very far off, it fires a harmless shell (`sim.nanoShells`) at the nearest
 * enemy not yet infected; the shell bursts into a cloud of nanobots
 * (`sim.nanoClouds`) that infects every enemy in it (`Enemy.nano`) while it
 * hangs. An infected enemy that dies is queued (`sim.nanoBursts`, from
 * `nanoDeath` in the sim's sweep) and bursts on the next step through
 * `sim.explode`, sparing the city's own people; what that blast kills, if
 * infected too, bursts on the step after, so whole crowds go up in a chain.
 * With Replication (`nanobot-upgrades.ts`) a dying host may set free a new
 * cloud where it fell, the one random draw here, made only while a chance
 * is bought. Every list stays empty and `nano` absent without the tower, so
 * replays are untouched. */
import { sq } from "../exact.ts";
import { NANO_BLAST, NANO_CLOUD, NANO_REPLICATE, nanoRank } from "../nanobot-upgrades.ts";
import { NANO_TOWER, cannonCooldown, cannonDamage } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { center } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

type Origin = { x: number; y: number; building: number };
/** A shell in flight: from the tower to where its mark stood. */
export type NanoShell = { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; origin: Origin };
/** A cloud of nanobots hanging where a shell burst (or a host fell). */
export type NanoCloud = { x: number; y: number; r: number; t: number; life: number; seed: number; origin: Origin };
/** What an infection carries: the blast it makes on death and where it came from. */
export type Infection = { r: number; damage: number; chance: number; origin: Origin };
/** An infected enemy just dead, waiting to burst. */
export type NanoBurst = Infection & { x: number; y: number };

/** How far the C4 nanobots fire. */
export const nanoRange = () => NANO_TOWER.range;
/** The radius of the cloud a shell bursts into. */
export const nanoCloudRadius = (sim: Pick<DefendSim, "bonuses">) => NANO_CLOUD.radius[nanoRank(sim.bonuses.nano, "cloud")];
/** The radius of the blast an infected enemy makes. */
export const nanoBlastRadius = (sim: Pick<DefendSim, "bonuses">) => NANO_BLAST.radius[nanoRank(sim.bonuses.nano, "blast")];
/** The chance a dying host sets free another cloud. */
export const nanoChance = (sim: Pick<DefendSim, "bonuses">) => NANO_REPLICATE.chance[nanoRank(sim.bonuses.nano, "replicate")];
/** What an infected enemy's blast does at its middle. */
export const nanoDamage = (sim: Pick<DefendSim, "levels" | "bonuses">) => cannonDamage(sim.levels.cannonDamage) * sim.bonuses.towerDamage * NANO_TOWER.blast;
/** Seconds between shells. */
export const nanoReload = (sim: Pick<DefendSim, "levels" | "bonuses">) => NANO_TOWER.cooldown * (cannonCooldown(sim.levels.cannonRate) / cannonCooldown(0)) * sim.bonuses.towerReload;

/** Whether `e` can carry nanobots: any enemy but a walking fortress's parts. */
const host = (e: Enemy) => e.hp > 0 && !e.fortressPart;

/** A tower's turn, once its reload has run: a shell at the nearest enemy in
 * reach not yet infected. Returns whether it fired. */
export function fireNanoShell(sim: DefendSim, b: Building): boolean {
  const c = center(b.rect), range = nanoRange();
  let best: Enemy | undefined, bestD = Infinity;
  for (const e of sim.enemiesNear(c.x, c.y, range)) {
    if (!host(e) || e.nano) continue;
    const d = sq(e.x - c.x) + sq(e.y - c.y);
    if (d < NANO_TOWER.min * NANO_TOWER.min || d >= bestD) continue;
    best = e;
    bestD = d;
  }
  if (!best) return false;
  const origin = { x: c.x, y: c.y, building: b.id };
  sim.nanoShells.push({ x0: c.x, y0: c.y - 0.6, x1: best.x, y1: best.y, t: 0, dur: 0.6 + Math.sqrt(bestD) / NANO_TOWER.speed, origin });
  return true;
}

/** Infects `e` with the tower's nanobots (once; the ranks are shared, so a second dose adds nothing). */
function infect(sim: DefendSim, e: Enemy, origin: Origin) {
  if (!host(e) || e.nano) return;
  e.nano = { r: nanoBlastRadius(sim), damage: nanoDamage(sim), chance: nanoChance(sim), origin };
}

/** A cloud of nanobots at (x, y), unless too many hang already. */
function release(sim: DefendSim, x: number, y: number, origin: Origin) {
  if (sim.nanoClouds.length >= NANO_TOWER.clouds) return;
  const seed = Math.floor(x * 7919 + y * 104729 + sim.time * 1000) | 0;
  sim.nanoClouds.push({ x, y, r: nanoCloudRadius(sim), t: 0, life: NANO_TOWER.life, seed, origin });
}

/** The sim's sweep calls this for every enemy that died: an infected one
 * is queued to burst on the next step. */
export function nanoDeath(sim: DefendSim, e: Enemy) {
  if (!e.nano || e.fortressPart) return;
  sim.nanoBursts.push({ ...e.nano, x: e.x, y: e.y });
}

/** The queued hosts burst, the shells fly and land, the clouds infect and thin. */
export function stepNano(sim: DefendSim, dt: number) {
  if (sim.nanoBursts.length) {
    const bursts = sim.nanoBursts;
    sim.nanoBursts = [];
    for (const b of bursts) {
      sim.explode(b.x, b.y, { r: b.r, damage: b.damage, friendlyFire: false, origin: b.origin });
      if (b.chance > 0 && sim.rand() < b.chance) release(sim, b.x, b.y, b.origin);
    }
  }
  if (sim.nanoShells.length) {
    for (const s of sim.nanoShells) if ((s.t += dt) >= s.dur) release(sim, s.x1, s.y1, s.origin);
    sim.nanoShells = sim.nanoShells.filter((s) => s.t < s.dur);
  }
  if (sim.nanoClouds.length) {
    for (const c of sim.nanoClouds) {
      c.t += dt;
      for (const e of sim.enemiesNear(c.x, c.y, c.r)) infect(sim, e, c.origin);
    }
    sim.nanoClouds = sim.nanoClouds.filter((c) => c.t < c.life);
  }
}
