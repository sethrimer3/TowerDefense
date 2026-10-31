import { enemyFlying } from "./catalog.ts";
/** Per-battle Minelayer ammunition and aim. Only this attunement draws RNG here. */
import { dist, sq } from "../exact.ts";
import { MINELAYER, pathRank } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { CANNON_RANGE, ENEMIES, cannonDamage, cannonSplash } from "./catalog.ts";
import { wetAt } from "./boats.ts";
import { CellType, type Building } from "./citygen.ts";
import { CELLS_H, CELLS_W } from "./grid.ts";
import { cellAt, center, nearest, type Point } from "./pathing.ts";
import type { DefendSim, Shell } from "./sim.ts";

export type Mine = Point & { age: number; damage: number; r: number; smart: boolean; origin: Point & { building: number } };
export const mineRange = () => CANNON_RANGE * MINELAYER.range;
export const mineRank = (sim: Pick<DefendSim, "bonuses">, b: Building) => pathRank(buildingPaths(sim, b), "minelayerTower", "minelaying");

/** Undefined means random coverage; dragging onto the footprint restores it. */
export function mineAim(b: Building, p: Point): Point | undefined {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return undefined;
  const r = b.rect;
  if (p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h) return undefined;
  const c = center(r), d = dist(p.x - c.x, p.y - c.y), k = Math.min(1, mineRange() / d);
  return { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
}

/** Actual open ground; pond and boat water are invalid even without solidity. */
export function mineGround(sim: DefendSim, x: number, y: number): boolean {
  if (x < .12 || y < .12 || x >= CELLS_W - .12 || y >= CELLS_H - .12) return false;
  for (const dx of [-.12, .12]) for (const dy of [-.12, .12]) {
    const i = cellAt(x + dx, y + dy);
    if (sim.solid[i] || sim.map.type[i] === CellType.WATER || wetAt(sim, x + dx, y + dy)) return false;
  }
  return true;
}

export function mineCount(sim: DefendSim, owner: number): number {
  let n = 0;
  for (const m of sim.mines) if (m.origin.building === owner) n++;
  for (const s of sim.shells) if (s.mine && s.origin?.building === owner) n++;
  return n;
}

/** No targets needed: capped laying on a uniformly sampled disk (rejection sampling). */
export function fireMine(sim: DefendSim, b: Building): boolean {
  const rank = mineRank(sim, b);
  if (mineCount(sim, b.id) >= MINELAYER.cap[rank]) return false;
  const c = center(b.rect), aim = rank ? sim.mineAims.get(b.id) : undefined;
  const disk = aim ?? c, radius = aim ? MINELAYER.scatter : mineRange();
  for (let i = 0; i < MINELAYER.attempts; i++) {
    const dx = (sim.rand() * 2 - 1) * radius, dy = (sim.rand() * 2 - 1) * radius;
    if (sq(dx) + sq(dy) > sq(radius)) continue;
    const x = disk.x + dx, y = disk.y + dy;
    if (sq(x - c.x) + sq(y - c.y) > sq(mineRange()) || !mineGround(sim, x, y)) continue;
    sim.shells.push({ x0: c.x, y0: c.y - .4, x1: x, y1: y, t: 0, dur: .45 + dist(x - c.x, y - c.y) * .07,
      damage: cannonDamage(sim.levels.cannonDamage) * sim.bonuses.towerDamage, r: cannonSplash(sim.levels.cannonDamage),
      origin: { ...c, building: b.id }, mine: { smart: rank >= 3 } });
    return true;
  }
  return false;
}

/** An invalidated landing releases its reserved capacity without exploding. */
export function landMine(sim: DefendSim, s: Shell) {
  if (!s.mine || s.origin?.building === undefined || !mineGround(sim, s.x1, s.y1)) return;
  sim.mines.push({ x: s.x1, y: s.y1, age: 0, damage: s.damage, r: s.r, smart: s.mine.smart,
    origin: { x: s.origin.x, y: s.origin.y, building: s.origin.building } });
}

export function stepMines(sim: DefendSim, dt: number) {
  if (!sim.mines.length) return;
  const kept: Mine[] = [];
  for (const m of sim.mines) {
    const armedDt = Math.max(0, m.age + dt - Math.max(m.age, MINELAYER.arm));
    m.age += dt;
    if (!mineGround(sim, m.x, m.y)) continue;
    if (m.age < MINELAYER.arm) { kept.push(m); continue; }
    const r = m.smart ? MINELAYER.seek : MINELAYER.trigger;
    const candidates = sim.enemiesNear(m.x, m.y, r).filter(e => e.hp > 0 && !enemyFlying(e));
    const target = nearest(candidates, m, sq(r) + 1e-9);
    if (target && m.smart) {
      const d = dist(target.x - m.x, target.y - m.y), travel = Math.min(Math.max(0, d - MINELAYER.trigger), MINELAYER.speed * armedDt);
      const ux = d ? (target.x - m.x) / d : 0, uy = d ? (target.y - m.y) / d : 0;
      // Small swept steps cannot pass through a wall or a narrow corner.
      const steps = Math.max(1, Math.ceil(travel / .1));
      for (let i = 0; i < steps && d > 0; i++) {
        const x = m.x + ux * travel / steps;
        const y = m.y + uy * travel / steps;
        if (sq(x - m.origin.x) + sq(y - m.origin.y) > sq(mineRange()) || !mineGround(sim, x, y)) break;
        m.x = x; m.y = y;
      }
    }
    if (target && sq(target.x - m.x) + sq(target.y - m.y) <= sq(MINELAYER.trigger) + 1e-9) {
      sim.explode(m.x, m.y, { damage: m.damage, r: m.r, friendlyFire: !sim.levels.cannonSafe, groundOnly: true, origin: m.origin });
    } else kept.push(m);
  }
  sim.mines = kept;
}
