/** Contact attacks use body/outline geometry rather than the old 0.4-cell
 * reach bonus. Pure world measurements; never dependent on zoom or pixels. */
import { ART, UNIT_CONTOUR_ART_PIXELS, WALL_FACE_HANG } from "./art-scale.ts";
import { ENEMIES, enemySize } from "./catalog.ts";
import { dist } from "../exact.ts";
import { cellAt, nearestPoint, type Point } from "./pathing.ts";
import { CELLS_H, CELLS_W, cellIndex, type Rect } from "./grid.ts";
import { enemySpeed } from "./enemy-abilities.ts";
import { chilled } from "./wizard.ts";
import type { Building } from "./citygen.ts";
import type { DefendSim, Enemy } from "./sim.ts";

const EPS = 1e-9;
export const CONTACT_OUTLINE = UNIT_CONTOUR_ART_PIXELS / ART;
/** Native movement otherwise reserves 0.18 cells, wider than a one-pixel body. */
export const contactRadius = (e: Enemy) => Math.min(.18, enemySize(e) / 2 + CONTACT_OUTLINE) - EPS;

/** Stone-wall outlines occupy the outer half art pixel of their painted
 * box. Their south face also hangs beyond the logical collision cell. */
export function structureContactRect(sim: DefendSim, b: Building): Rect {
  if (b.kind !== "wall" || b.fence) return b.rect;
  const r = b.rect;
  const standing = (dx: number, dy: number) => {
    const x = r.x + dx, y = r.y + dy;
    return x >= 0 && y >= 0 && x < CELLS_W && y < CELLS_H && sim.map.wall[cellIndex(x, y)] === 1 && !!sim.solid[cellIndex(x, y)];
  };
  const top = standing(0, -1) ? 0 : CONTACT_OUTLINE;
  const left = standing(-1, 0) ? 0 : CONTACT_OUTLINE, right = standing(1, 0) ? 0 : CONTACT_OUTLINE;
  const south = standing(0, 1), face = !south && r.y + r.h < CELLS_H;
  const bottom = south ? 0 : CONTACT_OUTLINE;
  return { x: r.x + left, y: r.y + top, w: r.w - left - right, h: r.h + (face ? WALL_FACE_HANG : 0) - top - bottom };
}

/** Project onto the perimeter, including when already inside the approach
 * box (e.g. a push or an old saved pose). Deterministic face tie order. */
function perimeter(r: Rect, e: Point): Point {
  const p = nearestPoint(r, e.x, e.y);
  if (e.x < r.x || e.x > r.x + r.w || e.y < r.y || e.y > r.y + r.h) return p;
  const sides = [e.y - r.y, r.x + r.w - e.x, r.y + r.h - e.y, e.x - r.x];
  let side = 0;
  for (let i = 1; i < sides.length; i++) if (sides[i] < sides[side]) side = i;
  return side === 0 ? { x: e.x, y: r.y } : side === 1 ? { x: r.x + r.w, y: e.y }
    : side === 2 ? { x: e.x, y: r.y + r.h } : { x: r.x, y: e.y };
}

export function buildingContactPoint(sim: DefendSim, e: Enemy, b: Building): Point {
  const half = enemySize(e) / 2, vertical = ENEMIES[e.kind].fortress?.height;
  const gap = CONTACT_OUTLINE + (b.kind === "wall" && !b.fence ? CONTACT_OUTLINE : 0);
  const hx = half + gap, hy = (vertical ? vertical / 2 : half) + gap;
  if (b.fence) {
    // Wooden rails sit inside their solid cell; approach their painted edge,
    // not the empty margin of the logical cell. Rails are four art pixels wide.
    let best: Point | undefined, distance = Infinity;
    for (const rail of b.rails ?? [b.fence]) {
      const r = { x: Math.min(rail.x1, rail.x2) - .25 - hx, y: Math.min(rail.y1, rail.y2) - .25 - hy,
        w: Math.abs(rail.x2 - rail.x1) + .5 + 2 * hx, h: Math.abs(rail.y2 - rail.y1) + .5 + 2 * hy };
      const p = perimeter(r, e), d = dist(p.x - e.x, p.y - e.y);
      if (d < distance) { best = p; distance = d; }
    }
    return best!;
  }
  const r = structureContactRect(sim, b);
  return perimeter({ x: r.x - hx, y: r.y - hy, w: r.w + 2 * hx, h: r.h + 2 * hy }, e);
}

/** A fence's collision cell contains empty ground beside its thin rails.
 * This approach may enter that margin, but never another solid owner. */
function free(sim: DefendSim, e: Enemy, b: Building, p: Point) {
  const radius = contactRadius(e);
  for (const x of [p.x - radius, p.x + radius]) for (const y of [p.y - radius, p.y + radius]) {
    if (x < 0 || y < 0 || x >= CELLS_W || y >= CELLS_H) return false;
    const cell = cellAt(x, y);
    if (sim.foeSolid[cell] && !(b.fence && sim.map.owner[cell] === b.id)) return false;
  }
  return true;
}

/** True only once this step has reached the contact pose. The final step is
 * clamped exactly, so movement's small-goal dead zone cannot leave a gap. */
export function approachBuildingContact(sim: DefendSim, e: Enemy, b: Building, dt: number, kinematic = false): boolean {
  const goal = buildingContactPoint(sim, e, b), dx = goal.x - e.x, dy = goal.y - e.y;
  const distance = dist(dx, dy);
  if (distance <= EPS) return true;
  if (ENEMIES[e.kind].boat) e.facing = { x: dx / distance, y: dy / distance };
  const travel = enemySpeed(sim, e) * chilled(e) * Math.max(0, dt);
  if (travel <= 0) return false;
  const flying = ENEMIES[e.kind].flying || !!ENEMIES[e.kind].boat;
  if ((distance <= travel + EPS) && (flying || free(sim, e, b, goal))) {
    const middle = { x: (goal.x + e.x) / 2, y: (goal.y + e.y) / 2 };
    if (flying || free(sim, e, b, middle)) { e.x = goal.x; e.y = goal.y; return true; }
  }
  if (kinematic || b.fence) {
    const step = Math.min(distance, travel), n = Math.max(1, Math.ceil(step / .1));
    for (let i = 0; i < n; i++) {
      const p = { x: e.x + dx / distance * step / n, y: e.y + dy / distance * step / n };
      if (!flying && !free(sim, e, b, p)) break;
      e.x = p.x; e.y = p.y;
    }
  } else sim.moveToward(e, goal, { speed: enemySpeed(sim, e) * chilled(e), dt, flying, radius: contactRadius(e), separate: false });
  const remaining = buildingContactPoint(sim, e, b);
  return dist(remaining.x - e.x, remaining.y - e.y) <= EPS;
}
