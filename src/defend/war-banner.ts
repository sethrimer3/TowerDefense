/** DEFEND's war banner: a consumable the player plants anywhere on the
 * board mid-defense to rally every mobile troop (swordsmen, archers, fire
 * mages, valkyries and the dark wizard). While it stands, a troop with
 * nothing in its own reach marches down the banner's walking field toward
 * it, as far as it can get (up to the wall when the banner stands beyond
 * it), and once there closes on the nearest enemy within `RALLY_REACH` of
 * it. Planting it again moves it; taking it down sends the troops back to
 * their usual ways. It draws nothing from the run's random stream, and a
 * run without one plays exactly as before. */
import { dist, sq } from "../exact.ts";
import { CELL_COUNT, CELLS_W, cellInBounds, cellIndex } from "./grid.ts";
import { CellType } from "./citygen.ts";
import { cellAt, fillFlowField, findPath, nearest, type FieldTerrain, type Point } from "./pathing.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";

/** How far round the banner (in cells) rallied troops seek out enemies. */
export const RALLY_REACH = 5;
/** The price of walking out of a standing building's cell on the way: high,
 * so troops go round, but finite, so a walled-off banner still draws them up
 * to the nearest stretch of wall. */
const SOLID_COST = 40;
/** Seconds between refreshes of the walking field, as buildings fall and rise. */
const REFRESH = 1;
/** Cells of the field a troop walks before it looks again. */
const LEG = 8;
/** A troop sees enemies this near itself on the march (swordsmen). */
export const MARCH_SIGHT = 2.5;

export class WarBanner {
  /** Each cell's walking cost to the banner. */
  readonly field = new Float64Array(CELL_COUNT);
  private due = -Infinity;

  constructor(readonly x: number, readonly y: number) {}

  /** Refreshes the walking field once a second of battle time. */
  refresh(sim: DefendSim) {
    if (sim.time < this.due) return;
    this.due = sim.time + REFRESH;
    const terrain: FieldTerrain = {
      solid: sim.ownSolid,
      impassable: (i) => sim.map.type[i] === CellType.WATER,
      cost: (i) => (sim.ownSolid[i] ? SOLID_COST : 1),
    };
    fillFlowField(this.field, [cellAt(this.x, this.y)], terrain);
  }

  /** Whether `s` has reached the banner: troops stop on rings a cell or so
   * apart, so they gather round it rather than on one spot. */
  reached(s: Soldier) {
    return dist(s.x - this.x, s.y - this.y) <= 1 + (s.id % 4) * 0.6;
  }

  /** The next leg of the march toward the banner from where `s` stands,
   * stopping short of any standing building in the way. */
  route(sim: DefendSim, s: Soldier): number[] {
    const out: number[] = [];
    let at = cellAt(s.x, s.y);
    for (let k = 0; k < LEG; k++) {
      const next = this.downhill(sim.ownSolid, at);
      if (next < 0) break;
      out.push(next);
      at = next;
    }
    return out;
  }

  /** The open neighbour of cell `at` nearest the banner by the field, if
   * any is nearer than `at` itself; -1 where the way on is through a
   * standing building (or there is none). Diagonals may not cut a corner. */
  private downhill(solid: Uint8Array, at: number) {
    const x = at % CELLS_W, y = (at - x) / CELLS_W;
    let best = -1, bestV = this.field[at];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || !cellInBounds(x + dx, y + dy)) continue;
        const n = cellIndex(x + dx, y + dy);
        if (solid[n] || (dx && dy && (solid[cellIndex(x + dx, y)] || solid[cellIndex(x, y + dy)]))) continue;
        if (this.field[n] < bestV) {
          bestV = this.field[n];
          best = n;
        }
      }
    return best;
  }

  /** The enemy `s` should go for: the nearest within `sight` of it, or once
   * it has reached the banner's ground, the nearest within `RALLY_REACH` of
   * the banner. */
  foe(sim: DefendSim, s: Soldier, sight: number): Enemy | null {
    const close = sight > 0 ? nearest(sim.enemiesNear(s.x, s.y, sight), s, sight * sight, true) : null;
    if (close) return close;
    if (sq(s.x - this.x) + sq(s.y - this.y) > RALLY_REACH * RALLY_REACH) return null;
    return nearest(sim.enemiesNear(this.x, this.y, RALLY_REACH), s, Infinity, true);
  }
}

/** One step of a troop answering the banner while nothing is within its own
 * reach: twice a second it picks the enemy to close on (see `foe`), routing
 * to it, or else the next leg toward the banner; between times it walks. */
export function answerBanner(sim: DefendSim, banner: WarBanner, s: Soldier, speed: number, dt: number, sight = 0) {
  let foe = sim.enemies.find((e) => e.id === s.target && e.hp > 0) ?? null;
  if (s.thinkT <= 0) {
    s.thinkT = 0.5;
    foe = banner.foe(sim, s, sight);
    s.target = foe ? foe.id : -1;
    s.path = foe ? (findPath(sim.ownSolid, s, foe, { maxCost: RALLY_REACH * 3, maxNodes: 600 }) ?? []) : banner.reached(s) ? [] : banner.route(sim, s);
  }
  sim.followPath(s, foe, speed, dt);
}
