import { ENEMIES } from "./catalog.ts";
import { cellInBounds, cellIndex } from "./grid.ts";
import { blocked, cellAt, rectDist } from "./pathing.ts";
import { enemyDamage, enemySpeed } from "./enemy-abilities.ts";
import { addPool, FLOOD_LIFE } from "./boats.ts";
import { chilled } from "./wizard.ts";
import type { DefendSim, Enemy } from "./sim.ts";

const AXES = [[0, 1], [-1, 0], [1, 0], [0, -1]] as const;
const lastTrail = new WeakMap<Enemy, { x: number; y: number }>();
/** Cubes lock each slide to one axis. They use the same flow costs as other
 * ground enemies, but neither crowd separation nor ice impulses bend them. */
export function stepIceCube(sim: DefendSim, e: Enemy, dt: number) {
  const trail = () => {
    const x = Math.round(e.x * 2) / 2, y = Math.round(e.y * 2) / 2, last = lastTrail.get(e);
    if (last?.x === x && last.y === y) return;
    lastTrail.set(e, { x, y });
    addPool(sim, { x, y, r: .55, t: 0, life: FLOOD_LIFE, boat: e.id, frozen: true, decorative: true });
  };
  trail();
  const reach = ENEMIES.iceCube.size / 2 + .4;
  const strike = (id: number) => {
    if (e.cd <= 0) { e.cd = ENEMIES.iceCube.cooldown; sim.damageBuilding(id, enemyDamage(sim, e)); }
  };
  if (rectDist(sim.keep.rect, e.x, e.y) <= reach) { strike(sim.keepId); return; }
  // A builder may have relocated it since the previous tick.
  if (e.iceSlide && e.iceSlide.x !== e.x && e.iceSlide.y !== e.y) delete e.iceSlide;
  if (!e.iceSlide) {
    const cx = Math.floor(e.x), cy = Math.floor(e.y), field = sim.marchField();
    let best = field[cellAt(e.x, e.y)];
    for (const [dx, dy] of AXES) {
      if (!cellInBounds(cx + dx, cy + dy)) continue;
      const cell = cellIndex(cx + dx, cy + dy);
      if (field[cell] < best) {
        best = field[cell];
        e.iceSlide = { x: dx ? cx + dx + .5 : e.x, y: dy ? cy + dy + .5 : e.y, cell };
      }
    }
  }
  const to = e.iceSlide;
  if (!to) return;
  if (sim.solid[to.cell]) {
    const id = sim.map.owner[to.cell];
    if (rectDist(sim.map.buildings[id].rect, e.x, e.y) <= reach) { strike(id); delete e.iceSlide; return; }
  }
  const dx = to.x - e.x, dy = to.y - e.y;
  const distance = Math.abs(dx) + Math.abs(dy);
  if (distance < .000001) { delete e.iceSlide; return; }
  const travel = Math.min(distance, enemySpeed(sim, e) * chilled(e) * Math.max(0, dt));
  const steps = Math.max(1, Math.ceil(travel / .2));
  e.facing = { x: Math.sign(dx), y: Math.sign(dy) };
  for (let n = 0; n < steps; n++) {
    const x = e.x + dx / distance * travel / steps, y = e.y + dy / distance * travel / steps;
    if (blocked(sim.solid, x, y)) { delete e.iceSlide; break; }
    e.x = x; e.y = y; trail();
  }
  if (travel === distance) delete e.iceSlide;
}
