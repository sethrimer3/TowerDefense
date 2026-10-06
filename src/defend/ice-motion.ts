/** Deterministic traction and blast impulses. No random draws; collision
 * checks along the slide keep fast impulses out of walls and off the board. */
import { dist } from "../exact.ts";
import { ENEMIES } from "./catalog.ts";
import { iceAt } from "./boats.ts";
import { blocked, type Point } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

type Motion = { x: number; y: number; moved: boolean; own: boolean };
export class IceMotion {
  private velocity = new Map<Point, Motion>();

  move(sim: DefendSim, u: Point, dx: number, dy: number, dt: number, own: boolean) {
    if (dt <= 0) return [dx, dy];
    const ice = iceAt(sim, u.x, u.y), old = this.velocity.get(u);
    if (!ice && !old) return [dx, dy];
    const v = old ?? { x: dx / dt, y: dy / dt, moved: false, own };
    const grip = Math.min(1, dt * (ice ? 2.5 : 18));
    v.x += (dx / dt - v.x) * grip;
    v.y += (dy / dt - v.y) * grip;
    if (!ice && Math.abs(v.x - dx / dt) + Math.abs(v.y - dy / dt) < .02) {
      this.velocity.delete(u);
      return [dx, dy];
    }
    v.moved = true; v.own = own;
    this.velocity.set(u, v);
    return [v.x * dt, v.y * dt];
  }

  blast(sim: DefendSim, x: number, y: number, r: number) {
    for (const list of [sim.enemies, sim.soldiers, sim.civilians]) for (const u of list) {
      const e = u as Enemy, def = ENEMIES[e.kind];
      if (u.hp <= 0 || def?.flying || def?.boat || def?.fortress || e.fortressPart || def?.unyielding || !iceAt(sim, u.x, u.y)) continue;
      const d = dist(u.x - x, u.y - y);
      if (d > r) continue;
      const force = 6 * (1 - .5 * d / Math.max(.01, r));
      const v = this.velocity.get(u) ?? { x: 0, y: 0, moved: false, own: !def };
      v.x += (d ? (u.x - x) / d : 1) * force;
      v.y += (d ? (u.y - y) / d : 0) * force;
      this.velocity.set(u, v);
    }
  }

  step(sim: DefendSim, dt: number) {
    for (const [u, v] of this.velocity) {
      if ((u as Enemy).hp <= 0 || (v.own && !sim.soldiers.includes(u as never) && !sim.civilians.includes(u as never))) { this.velocity.delete(u); continue; }
      if (!v.moved) {
        this.slide(sim, u, v.x * dt, v.y * dt, v.own);
        const drag = Math.max(0, 1 - dt * (iceAt(sim, u.x, u.y) ? 1.6 : 18));
        v.x *= drag; v.y *= drag;
      }
      v.moved = false;
      if (Math.abs(v.x) + Math.abs(v.y) < .02 || (!iceAt(sim, u.x, u.y) && Math.abs(v.x) + Math.abs(v.y) < .1)) this.velocity.delete(u);
    }
  }

  slide(sim: DefendSim, u: Point, dx: number, dy: number, own: boolean) {
    const solid = own ? sim.ownSolid : sim.solid;
    const n = this.velocity.has(u) ? Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / .2)) : 1;
    for (let i = 0; i < n; i++) {
      if (!blocked(solid, u.x + dx / n, u.y)) u.x += dx / n;
      if (!blocked(solid, u.x, u.y + dy / n)) u.y += dy / n;
    }
  }
}
