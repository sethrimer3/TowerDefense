import { ENEMIES } from "./catalog.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import type { Brush } from "./battle-art.ts";

export const MAX_ENEMY_HEALTHBARS = 8;
const peaks = new WeakMap<DefendSim, { wave: number; cost: number }>();

/** Presentation only: relative to the actual random wave, not its number.
 * Keep the peak after strong enemies die so weak survivors don't gain bars. */
export function healthbarEnemies(sim: DefendSim): Enemy[] {
  let peak = peaks.get(sim);
  if (!peak || peak.wave !== sim.wave) peak = { wave: sim.wave, cost: 0 };
  for (const kind of sim.spawnQueue) peak.cost = Math.max(peak.cost, ENEMIES[kind].cost);
  for (const e of sim.enemies) peak.cost = Math.max(peak.cost, ENEMIES[e.kind].cost);
  peaks.set(sim, peak);
  const threshold = Math.max(100, peak.cost / 4);
  return sim.enemies.filter(e => e.hp > 0 && e.leader === undefined && ENEMIES[e.kind].cost >= threshold)
    .sort((a, b) => ENEMIES[b.kind].cost - ENEMIES[a.kind].cost || a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)
    .slice(0, MAX_ENEMY_HEALTHBARS);
}

export function drawEnemyHealthbars({ c, px }: Brush, sim: DefendSim) {
  for (const e of healthbarEnemies(sim)) {
    const width = Math.max(12, Math.round(px * 1.2)), height = Math.max(2, Math.round(px * .1));
    const x = Math.round(e.x * px - width / 2);
    const y = Math.round(e.y * px - ENEMIES[e.kind].size * px / 2 - height - 4);
    c.fillStyle = "#170e12"; c.fillRect(x - 1, y - 1, width + 2, height + 2);
    const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
    c.fillStyle = ratio > .5 ? "#85bd68" : ratio > .25 ? "#e2b65a" : "#d85b59";
    c.fillRect(x, y, Math.round(width * ratio), height);
  }
}
