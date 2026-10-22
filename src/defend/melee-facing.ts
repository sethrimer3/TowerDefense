/** Presentation-only facing. Movement uses observed world positions, not
 * the chase target, so paths around corners face the way the unit walks. */
import { HALBERD, pathRank } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { ASSASSIN_UNIT, BRAWLER, HERO, SOLDIER, enemySize, stabLength } from "./catalog.ts";
import { CELLS_W } from "./grid.ts";
import { NECRO } from "./necromancy.ts";
import { REINFORCE } from "./reinforcements.ts";
import { isSpear, spearReach, type Spear } from "./spears.ts";
import type { DefendSim, Soldier } from "./sim.ts";

export type Facing = "south" | "west" | "north" | "east";
export const FACINGS: readonly Facing[] = ["south", "west", "north", "east"];
type Heading = { x: number; y: number; time: number; angle: number; direction: Facing; moving: boolean };
const headings = new WeakMap<Soldier, Heading>();
const TAU = Math.PI * 2;
const angles: Record<Facing, number> = { east: 0, south: Math.PI/2, west: Math.PI, north: -Math.PI/2 };
const distance = (a: number, b: number) => Math.abs(((a-b+Math.PI) % TAU + TAU) % TAU - Math.PI);

/** Eight degrees of hysteresis keep near-diagonal paths from chattering. */
export function facingOf(angle: number, previous?: Facing): Facing {
  if (previous && distance(angle, angles[previous]) < Math.PI/4 + 0.14) return previous;
  return FACINGS[((Math.round((angle-Math.PI/2)/(Math.PI/2)) % 4) + 4) % 4];
}

export function isMelee(u: Soldier) {
  if (u.risen) return u.risen.range === 0;
  if (u.called) return u.called.range === 0;
  return u.kind === "hero" || u.kind === "valkyrie" || u.kind === "sword" || u.kind === "brawler" || u.kind === "assassin" || isSpear(u.kind);
}

/** Explicit attack aim wins; otherwise walking wins and idle retains it.
 * A path heading only seeds the first paint, never turns a stopped unit. */
export function updateFacing(u: Soldier, time: number, attackAngle?: number) {
  let h = headings.get(u);
  if (!h || time < h.time) {
    let angle = Math.PI/2;
    const cell = u.path[0];
    if (cell !== undefined) {
      const dx = cell % CELLS_W + 0.5 - u.x, dy = Math.floor(cell / CELLS_W) + 0.5 - u.y;
      if (dx*dx + dy*dy > 1e-6) angle = Math.atan2(dy, dx);
    }
    h = { x: u.x, y: u.y, time, angle, direction: facingOf(angle), moving: false };
    headings.set(u, h);
  }
  const dx = u.x-h.x, dy = u.y-h.y, moved = dx*dx+dy*dy > 1e-8;
  if (moved) h.angle = Math.atan2(dy, dx);
  if (attackAngle !== undefined && Number.isFinite(attackAngle)) h.angle = attackAngle;
  if (time !== h.time || moved) h.moving = moved;
  h.x = u.x; h.y = u.y; h.time = time; h.direction = facingOf(h.angle, h.direction);
  return h;
}

function reach(sim: DefendSim, u: Soldier) {
  if (u.risen) return NECRO.reach;
  if (u.called) return REINFORCE.reach;
  if (u.kind === "hero") return HERO.reach;
  if (u.kind === "valkyrie") return stabLength(sim.levels.valkyrieReach ?? 0);
  if (u.kind === "assassin") return ASSASSIN_UNIT.reach;
  if (u.kind === "brawler") return BRAWLER.reach;
  if (isSpear(u.kind)) return spearReach(sim, u as Soldier & { kind: Spear });
  const halberd = pathRank(buildingPaths(sim, sim.map.buildings[u.home]), "barracks", "halberdiers");
  return SOLDIER.reach + (halberd ? HALBERD.reach : 0);
}

export function meleeFacing(sim: DefendSim, u: Soldier, attackAngle?: number) {
  const old = headings.get(u);
  // More than one painter may ask in the same tick (body and sword).
  const moved = old && ((u.x-old.x)**2+(u.y-old.y)**2 > 1e-8 || (old.time === sim.time && old.moving));
  if (attackAngle === undefined && !moved) {
    const e = sim.enemies.find(e => e.id === u.target && e.hp > 0);
    if (e && (e.x-u.x)**2+(e.y-u.y)**2 <= (reach(sim,u)+enemySize(e)/2)**2)
      attackAngle = Math.atan2(e.y-u.y, e.x-u.x);
  }
  return updateFacing(u, sim.time, attackAngle);
}
