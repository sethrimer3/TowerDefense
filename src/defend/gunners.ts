/** The Gunner hall's line beyond the musket hall: the Machine-gun nest's
 * machine gunners and its one path, Belt feed (quicker reloads, harder
 * bullets from II), whose crown makes the nest a Gatling emplacement. The
 * gunners, Gatling gunners and rocketeers shoot through `troops.ts` with
 * their own numbers (`catalog.ts`), the rockets bursting through
 * `burstBall` (`muskets.ts`). Nothing here draws from the random stream. */
import { BELT_FEED, pathRank } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { MACHINE_GUNNER } from "./catalog.ts";
import type { DefendSim, Soldier } from "./sim.ts";

/** A nest's Belt feed rank: 0 unless its building climbs it. */
export const beltRank = (sim: DefendSim, home: number) => pathRank(buildingPaths(sim, sim.map.buildings[home]), "gunNest", "beltFeed");

/** A machine gunner's reload: Belt feed's is quicker. */
export const beltReload = (sim: DefendSim, s: Soldier) => MACHINE_GUNNER.cooldown * BELT_FEED.reload[beltRank(sim, s.home)];

/** How hard a machine gunner's bullet hits, of `damage`: Heavy rounds harder. */
export const beltDamage = (sim: DefendSim, s: Soldier, damage: number) => damage * (beltRank(sim, s.home) >= 2 ? BELT_FEED.damage : 1);
