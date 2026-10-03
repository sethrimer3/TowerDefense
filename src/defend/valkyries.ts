import { enemySize } from "./catalog.ts";
/** DEFEND valkyries, trained at the Valkyrie palace: armoured angels with
 * spears. When an enemy comes within her spear's reach a valkyrie makes a
 * charge stab: she blinks along the line toward it, as far as her reach
 * (Long spears) or until an intact building, the city wall or a pond stops
 * her, and her golden spear hurts every enemy along that line, fliers too.
 * For a moment after each charge nothing can hurt her (`guard`). Otherwise
 * she hunts the nearest enemy in the city, or strolls the streets. */
import { dist, sq } from "../exact.ts";
import { ENEMIES, STAB_GUARD, STAB_WIDTH, VALKYRIE, stabLength } from "./catalog.ts";
import { CELL_COUNT } from "./grid.ts";
import { blocked, cellAt, cellCenter, findPath, nearest, type PathLimits } from "./pathing.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";

/** A charge stab: the line from (x0, y0) to (x1, y1) she blinked along, `t`
 * of `life` seconds ago, and where it struck. How it looks is the
 * renderer's (`valkyrie-art.ts`). */
export type Stab = { x0: number; y0: number; x1: number; y1: number; t: number; life: number; hits: { x: number; y: number }[] };

/** How long a stab's streak lingers, in seconds. */
export const STAB_LIFE = 0.5;
/** Steps along the charge line, in cells, testing for something in the way. */
const STRIDE = 0.2;
const CITYWIDE: PathLimits = { maxCost: 1e9, maxNodes: CELL_COUNT };

export function stepValkyrie(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  const reach = stabLength(sim.levels.valkyrieReach ?? 0);
  const near = nearest(sim.enemiesNear(s.x, s.y, reach), s, reach * reach, true);
  if (near) {
    // In reach: she holds her ground until her spear is ready.
    if (s.cd <= 0) charge(sim, s, near, reach);
    return;
  }
  if (s.thinkT <= 0) seek(sim, s);
  sim.followPath(s, null, VALKYRIE.speed, dt);
}

/** The charge: blink along the line toward `e` until her reach runs out or
 * something solid stands in the way, spearing every enemy on the line. */
export function charge(sim: DefendSim, s: Soldier, e: Enemy, reach: number) {
  const d = dist(e.x - s.x, e.y - s.y);
  if (d < 0.01) return;
  const ux = (e.x - s.x) / d, uy = (e.y - s.y) / d;
  const len = runOut(sim, s.x, s.y, ux, uy, reach);
  const x0 = s.x, y0 = s.y, x1 = s.x + ux * len, y1 = s.y + uy * len;
  const hits: { x: number; y: number }[] = [];
  for (const foe of sim.enemiesNear((x0 + x1) / 2, (y0 + y1) / 2, len / 2 + 1.5)) {
    const w = STAB_WIDTH + enemySize(foe) / 2;
    // The nearest point of the line to the enemy, by projection.
    const t = Math.max(0, Math.min(len, (foe.x - x0) * ux + (foe.y - y0) * uy));
    if (sq(foe.x - (x0 + ux * t)) + sq(foe.y - (y0 + uy * t)) > w * w) continue;
    sim.hurtEnemy(foe, s.damage, true, "melee", s);
    hits.push({ x: foe.x, y: foe.y });
  }
  s.x = x1;
  s.y = y1;
  s.path = [];
  s.cd = VALKYRIE.cooldown;
  s.guard = STAB_GUARD;
  sim.stabs.push({ x0, y0, x1, y1, t: 0, life: STAB_LIFE, hits });
}

/** How far along (ux, uy) from (x, y) she can go, up to `reach`, before an
 * intact building, the wall, a pond or the board's edge stops her. */
function runOut(sim: DefendSim, x: number, y: number, ux: number, uy: number, reach: number) {
  let free = 0;
  for (let k = 1; free < reach; k++) {
    const at = Math.min(reach, k * STRIDE);
    if (blocked(sim.solid, x + ux * at, y + uy * at)) break;
    free = at;
  }
  return free;
}

/** Path toward the nearest of up to three enemies in the city, else stroll
 * to a random street. (The dark wizard hunts the same way.) */
export function seek(sim: DefendSim, s: Soldier) {
  s.thinkT = 0.5;
  const inCity = (e: Enemy) => sim.map.city[cellAt(e.x, e.y)] === 1;
  const prey = sim.enemies
    .filter((e) => e.hp > 0 && inCity(e))
    .sort((a, b) => sq(a.x - s.x) + sq(a.y - s.y) - (sq(b.x - s.x) + sq(b.y - s.y)))
    .slice(0, 3);
  for (const e of prey) {
    const path = findPath(sim.solid, s, e, CITYWIDE);
    if (!path) continue;
    s.path = path;
    s.target = e.id;
    return;
  }
  s.target = -1;
  if (!s.path.length && sim.streets.length) {
    s.thinkT = 0.5 + sim.rand() * 1.5;
    const goal = sim.streets[Math.floor(sim.rand() * sim.streets.length)];
    s.path = findPath(sim.solid, s, cellCenter(goal), CITYWIDE) ?? [];
  }
}

/** Stabs' streaks fade. */
export function stepStabs(sim: DefendSim, dt: number) {
  for (const st of sim.stabs) st.t += dt;
  sim.stabs = sim.stabs.filter((st) => st.t < st.life);
}
