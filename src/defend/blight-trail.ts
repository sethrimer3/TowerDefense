/** Lasting vegetation damage from actual ground travel. Presentation only:
 * no RNG, collision, targeting, save data or replay state depends on it. */
import { ENEMIES } from "./catalog.ts";
import { CELLS_W, CELLS_H } from "./grid.ts";
import type { Enemy } from "./sim.ts";

export const BLIGHT_TRAIL = { samples: 2, grass: .18, cap: 256, treeBase: 5, treeArea: 14 } as const;
export const BLIGHT_W = CELLS_W * BLIGHT_TRAIL.samples;
export const BLIGHT_H = CELLS_H * BLIGHT_TRAIL.samples;
export type WitherStage = 0 | 1 | 2 | 3;

export class BlightTrail {
  readonly exposure = new Float32Array(BLIGHT_W * BLIGHT_H);
  /** Occupied samples only; storage is bounded by the board. */
  readonly touched: number[] = [];
  version = 0;

  /** Distance, rather than time spent standing, makes traffic cumulative
   * without a lone stalled Mini eventually killing an ancient tree. */
  travel(e: Enemy, fromX: number, fromY: number) {
    const def = ENEMIES[e.kind];
    if (e.hp <= 0 || e.raidProxy || e.fortressPart || e.burrow || def.flying || def.faction !== "darkOne") return;
    const dx = e.x - fromX, dy = e.y - fromY, distance = Math.sqrt(dx * dx + dy * dy);
    // Blink/teleport displacements do not paint a path across untouched land.
    if (!(distance > 0) || distance > 4 || !Number.isFinite(fromX + fromY + e.x + e.y)) return;
    const power = def.darkPixels ? def.darkPixels * def.darkPixels : Math.max(1, Math.min(40, Math.sqrt(def.hp / 2)));
    const radius = .36 + def.size * .35, steps = Math.max(1, Math.ceil(distance * 8));
    const amount = distance * BLIGHT_TRAIL.samples * power / steps;
    for (let k = 0; k < steps; k++) {
      const t = (k + .5) / steps, x = fromX + dx * t, y = fromY + dy * t;
      for (let sy = Math.max(0, Math.floor((y - radius) * 2)); sy <= Math.min(BLIGHT_H - 1, Math.floor((y + radius) * 2)); sy++)
        for (let sx = Math.max(0, Math.floor((x - radius) * 2)); sx <= Math.min(BLIGHT_W - 1, Math.floor((x + radius) * 2)); sx++) {
          const d2 = ((sx + .5) / 2 - x) ** 2 + ((sy + .5) / 2 - y) ** 2;
          if (d2 > radius * radius) continue;
          const i = sy * BLIGHT_W + sx, old = this.exposure[i];
          if (old >= BLIGHT_TRAIL.cap) continue;
          if (!old) this.touched.push(i);
          this.exposure[i] = Math.min(BLIGHT_TRAIL.cap, old + amount * (1 - .5 * d2 / (radius * radius)));
          this.version++;
        }
    }
  }

  at(x: number, y: number) {
    if (!(x >= 0 && y >= 0 && x < CELLS_W && y < CELLS_H)) return 0;
    return this.exposure[Math.floor(y * 2) * BLIGHT_W + Math.floor(x * 2)];
  }

  treeStage(x: number, y: number, radius: number): WitherStage {
    // Root neighborhood, not the whole canopy: merely brushing one distant
    // leaf does not destroy a large tree. Larger roots resist more traffic.
    const reach = Math.min(.5, radius * .5);
    let dose = this.at(x, y);
    dose = Math.max(dose, this.at(x + reach, y), this.at(x - reach, y), this.at(x, y + reach), this.at(x, y - reach));
    const fraction = dose / (BLIGHT_TRAIL.treeBase + BLIGHT_TRAIL.treeArea * radius * radius);
    return fraction >= 1 ? 3 : fraction >= .5 ? 2 : fraction >= .2 ? 1 : 0;
  }
}
