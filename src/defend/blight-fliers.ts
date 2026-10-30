/** Flying Blight tuning and exact three-way release. No extra random draws. */
import type { EnemyKind } from "./catalog.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import { enemySpeed } from "./enemy-abilities.ts";
import { chilled } from "./wizard.ts";

export const BLIGHT_FLIERS = { scatterSeconds: .65 } as const;
export const isBlightPrism = (kind: EnemyKind) => kind === "blightPrism" || kind === "greaterBlightPrism";
export const isBlightFlier = (kind: EnemyKind) => kind === "blightDart" || isBlightPrism(kind);
const HALF_ROOT_THREE = Math.sqrt(3) / 2;
const RELEASE = [{ x: 1, y: 0 }, { x: -.5, y: HALF_ROOT_THREE }, { x: -.5, y: -HALF_ROOT_THREE }] as const;

/** Rotate the three exact unit rays onto the parent's last flight direction. */
export function dartDirection(facing: Enemy["facing"], index: number) {
  const f = facing ?? { x: 0, y: 1 }, k = RELEASE[index];
  const length = Math.sqrt(f.x * f.x + f.y * f.y);
  const x = length > 0 ? f.x / length : 0, y = length > 0 ? f.y / length : 1;
  return { x: x * k.x - y * k.y, y: y * k.x + x * k.y };
}

/** The children visibly separate before native flight/targeting takes over. */
export function stepDartBurst(sim: DefendSim, e: Enemy, dt: number) {
  const burst = e.dartBurst;
  if (!burst) return false;
  const elapsed = dt < burst.left ? dt : burst.left;
  const speed = enemySpeed(sim, e) * chilled(e);
  sim.moveToward(e, { x: e.x + burst.x, y: e.y + burst.y }, { speed, dt: elapsed, flying: true, separate: false });
  burst.left -= elapsed;
  if (burst.left <= 0) delete e.dartBurst;
  return true;
}
