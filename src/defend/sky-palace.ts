/** DEFEND's cloudborne palaces: a Valkyrie palace on the Cloudborne path
 * (`knowledge-paths.ts`, `CLOUDBORNE`) rises off its lot when a battle
 * starts and drifts west across the sky on its clouds. Once it has drifted
 * wholly off the board's west edge it comes round from the east edge at
 * another height, hashed from the palace and its lap (no random draws).
 *
 * While aloft its cells are open ground, nothing can hurt or sink it, and
 * its valkyries drop from wherever it floats: onto the nearest open cell
 * under its middle, and not at all while it is off the board. How it looks
 * is the renderer's (`sky-palace-art.ts`). Runs without one have an empty
 * list and play as before. */
import { sq } from "../exact.ts";
import { buildingPaths } from "../specializations.ts";
import { CLOUDBORNE, pathRank } from "../knowledge-paths.ts";
import { stabLength } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { CELLS_H, CELLS_W, cellInBounds, cellIndex, hash } from "./grid.ts";
import { cellCenter, type Point } from "./pathing.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";
import { charge } from "./valkyries.ts";

/** A palace aloft: its building, the top left of where it floats (cells)
 * and how many times it has come round. */
export type SkyPalace = { id: number; x: number; y: number; lap: number };

/** Cells past its footprint that its clouds and shadow reach: it comes round
 * once they have all left the west edge, and comes back with its clouds
 * just past the east edge. */
const WAKE = { west: 3.5, east: 2.5 };

/** The Cloudborne rank a building climbed to (0 for none). */
export const cloudRank = (sim: DefendSim, b: Building) =>
  b.kind === "valkyriePalace" ? pathRank(buildingPaths(sim, b), "valkyriePalace", "cloudborne") : 0;

/** Lifts every cloudborne palace off its lot, as the battle starts. */
export function launchPalaces(sim: DefendSim): SkyPalace[] {
  const out: SkyPalace[] = [];
  for (const b of sim.map.buildings) {
    if (!cloudRank(sim, b)) continue;
    for (const c of b.cells) sim.solid[c] = sim.ownSolid[c] = 0;
    out.push({ id: b.id, x: b.rect.x, y: b.rect.y, lap: 0 });
  }
  return out;
}

/** The palaces drift west, coming round from the east at a new height. */
export function stepSkyPalaces(sim: DefendSim, dt: number) {
  for (const p of sim.skyPalaces) {
    const r = sim.map.buildings[p.id].rect;
    p.x -= CLOUDBORNE.speed * dt;
    if (p.x + r.w + WAKE.west > 0) continue;
    p.lap++;
    p.x = CELLS_W + WAKE.east;
    p.y = skyRow(p.id, p.lap, r.h);
  }
}

/** The height a palace comes round at on lap `lap`: anywhere it fits on the board. */
export const skyRow = (id: number, lap: number, h: number) => hash(id, lap, 0x5c1) % Math.max(1, CELLS_H - h + 1);

export const skyPalaceOf = (sim: DefendSim, id: number) => sim.skyPalaces.find((p) => p.id === id);

/** Where a palace's valkyrie lands: the nearest open cell to the ground
 * under its middle, or -1 while it floats off the board (or over nothing open). */
export function landingCell(sim: DefendSim, p: SkyPalace): number {
  const r = sim.map.buildings[p.id].rect;
  const mx = Math.floor(p.x + r.w / 2), my = Math.floor(p.y + r.h / 2);
  if (!cellInBounds(mx, my)) return -1;
  for (let ring = 0; ring <= 4; ring++) {
    let best = -1, bd = Infinity;
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring || !cellInBounds(mx + dx, my + dy)) continue;
        const i = cellIndex(mx + dx, my + dy), d = dx * dx + dy * dy;
        if (!sim.solid[i] && d < bd) [best, bd] = [i, d];
      }
    if (best >= 0) return best;
  }
  return -1;
}

/** Diving descent: a valkyrie just landed charges the nearest enemy within
 * `dive` times her reach. */
export function diveIn(sim: DefendSim, s: Soldier, rank: number) {
  if (rank < 2) return;
  const reach = stabLength(sim.levels.valkyrieReach ?? 0) * CLOUDBORNE.dive;
  let best: Enemy | null = null, bd = reach * reach;
  for (const e of sim.enemiesNear(s.x, s.y, reach)) {
    const d = sq(e.x - s.x) + sq(e.y - s.y);
    if (e.hp > 0 && d <= bd) [best, bd] = [e, d];
  }
  if (best) charge(sim, s, best, reach);
}

/** Heavenly host: more valkyries for a palace at III, trained faster. */
export const hostGarrison = (sim: DefendSim, b: Building) => (cloudRank(sim, b) >= 3 ? CLOUDBORNE.host : 0);
export const hostDrill = (sim: DefendSim, b: Building) => (cloudRank(sim, b) >= 3 ? CLOUDBORNE.drill : 1);

/** Where a recruit of building `b` steps out: its door, or for a palace
 * aloft the ground under it. */
export function musterPoint(sim: DefendSim, b: Building): Point | null {
  const p = sim.skyPalaces.length ? skyPalaceOf(sim, b.id) : undefined;
  const cell = p ? landingCell(sim, p) : sim.doorOf(b);
  return cell < 0 ? null : cellCenter(cell);
}
