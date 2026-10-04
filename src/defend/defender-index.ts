/** Friendly positions are fixed during the enemy phase. Rebuild once for that
 * phase, query nearby buckets, and keep the original last-in-array tie rule. */
import { CELLS_W, CELLS_H } from "./grid.ts";
import { sq } from "../exact.ts";
import type { Soldier, Civilian } from "./sim.ts";

type Defender = Soldier | Civilian;
const CELL = 4;
const W = Math.ceil(CELLS_W / CELL), H = Math.ceil(CELLS_H / CELL);
const bucket = (v: number, size: number) => Math.max(0, Math.min(size - 1, Math.floor(v / CELL)));

export class DefenderIndex {
  private cells: number[][] = Array.from({ length: W * H }, () => []);
  private used: number[] = [];
  private units: Defender[] = [];

  rebuild(soldiers: readonly Soldier[], civilians: readonly Civilian[]) {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
    this.units.length = 0;
    for (let team = 0; team < 2; team++) {
      for (const u of team === 0 ? soldiers : civilians) {
        if (u.hp <= 0) continue;
        const i = bucket(u.y, H) * W + bucket(u.x, W);
        if (!this.cells[i].length) this.used.push(i);
        this.cells[i].push(this.units.length);
        this.units.push(u);
      }
    }
  }

  nearest(x: number, y: number, r: number): Defender | null {
    let best: Defender | null = null, distance = r * r, order = -1;
    const reach = Math.abs(r);
    const x0 = bucket(x - reach, W), x1 = bucket(x + reach, W);
    const y0 = bucket(y - reach, H), y1 = bucket(y + reach, H);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (const i of this.cells[cy * W + cx]) {
        const u = this.units[i];
        // Earlier enemies can kill a defender during this same phase.
        if (u.hp <= 0) continue;
        const d = sq(u.x - x) + sq(u.y - y);
        if (d < distance || (d === distance && i > order)) {
          best = u; distance = d; order = i;
        }
      }
    }
    return best;
  }
}
