// For shooting tests of the gunner line, which shoots flat (gun-sight.ts):
// levels the city's buildings and wall in `sim`'s collision grids, leaving
// its ponds, so the enemies a test sets round a troop are in clear sight.
import { CellType } from "../src/defend/citygen.ts";
import type { DefendSim } from "../src/defend/sim.ts";

export function openSight(sim: DefendSim) {
  for (let c = 0; c < sim.solid.length; c++) {
    const t = sim.map.type[c];
    if (t === CellType.WATER) continue;
    sim.solid[c] = sim.ownSolid[c] = sim.foeSolid[c] = 0;
  }
  return sim;
}
