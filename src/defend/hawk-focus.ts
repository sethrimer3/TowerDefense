/** Per-tower sustained aim; no live saves or gameplay randomness. */
import { SHARP } from "../knowledge-paths.ts";
import type { Enemy } from "./sim.ts";
export type HawkFocus = { target: number; shots: number };
export const hawkDamage = (rank: number, shot: number) => rank ? 1 + Math.min(SHARP.bonusCap, SHARP.perShot * Math.max(0, shot - 1)) : 1;
export const hawkReload = (base: number, rank: number, nextShot: number) => base * (rank ? SHARP.reload : 1) / (rank >= 3 ? Math.min(SHARP.speedCap, Math.max(1, nextShot)) : 1);
export function hawkTarget(enemies: Enemy[], x: number, y: number, range: number, focus?: HawkFocus): Enemy | undefined {
  let best: Enemy | undefined, distance = Infinity;
  for (const e of enemies) {
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (e.hp <= 0 || d > range * range) continue;
    if (e.id === focus?.target) return e;
    if (!best || e.hp > best.hp || e.hp === best.hp && (d < distance || d === distance && e.id < best.id)) { best = e; distance = d; }
  }
  return best;
}
