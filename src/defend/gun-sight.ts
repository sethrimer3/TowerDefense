/** DEFEND gun sight: the gunner line (pistols, muskets, machine guns, the
 * Gatling, rockets, snipers and the Revolutionary's laser snipers) shoots
 * flat, so a gunner fires only at an enemy it can see, with no standing wall
 * stone or building on the line between them (`lineOfSight`). Archers,
 * stone throwers and javelineers arc their shots over, as before.
 *
 * A gunner whose building's rally point the player snapped onto a watch
 * tower (`deployment.ts`) climbs into it while it has room (`TOWER_ROOM` a
 * tower), and from up there sees over every wall and building; no enemy
 * picks it out while the tower stands (`perched`), and it drops out onto the
 * rubble when the tower falls, or at the door when the rally point moves.
 * Nobody climbs a tower unrallied.
 *
 * Looking is the costly part, so a gunner looks only when it could fire
 * (`lookOut`): between shots it keeps on the enemy it last saw (its
 * `target`), and when it saw nothing it looks again `SIGHT_RETRY` seconds
 * later. Nothing draws from the random stream; `Soldier.perch` stays absent
 * for everyone not bound for or in a tower. */
import { dist } from "../exact.ts";
import { CellType, type Building } from "./citygen.ts";
import { cellIndex } from "./grid.ts";
import { cellAt, cellCenter, center, findPath, rectDist } from "./pathing.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";
import { postOf } from "./deployment.ts";

/** The troops that shoot flat and need a clear line. */
export const FLAT_SHOOTERS: readonly Soldier["kind"][] = ["gunner", "machineGunner", "gatlingGunner", "rocketeer", "musketeer", "sniper", "railSniper"];
export const shootsFlat = (kind: Soldier["kind"]) => FLAT_SHOOTERS.includes(kind);

/** How many gunners a watch tower holds. */
export const TOWER_ROOM = 2;
/** Seconds before a gunner that saw nothing looks again. */
export const SIGHT_RETRY = 0.25;
/** How far, in cells walked, a gunner goes for a tower. */
const TOWER_WALK = { maxCost: 80, maxNodes: 4000 };

/** Whether nothing solid but water lies between (x0, y0) and (x1, y1): every
 * cell the line crosses, sampled a quarter of a cell apart, besides the two
 * ends' own (a flier over a roof can be seen). */
export function lineOfSight(sim: DefendSim, x0: number, y0: number, x1: number, y1: number) {
  const from = cellAt(x0, y0), to = cellAt(x1, y1);
  const d = dist(x1 - x0, y1 - y0), n = Math.floor(d * 4);
  for (let i = 1; i < n; i++) {
    const c = cellIndex(Math.floor(x0 + ((x1 - x0) * i) / n), Math.floor(y0 + ((y1 - y0) * i) / n));
    if (c === from || c === to) continue;
    if (sim.solid[c] && sim.map.type[c] !== CellType.WATER) return false;
  }
  return true;
}

/** Whether `u` is up in a watch tower (no enemy picks it out). */
export const perched = (u: object) => "perch" in u && !!(u as Soldier).perch?.up;

/** The enemies within `range` of `s` it can see: everyone, from a tower. */
export function inView(sim: DefendSim, s: Soldier, range: number): Enemy[] {
  const near = sim.enemiesNear(s.x, s.y, range);
  if (s.perch?.up) return near;
  // Enemies sharing a cell share a line.
  const seen = new Map<number, boolean>();
  return near.filter((e) => {
    const c = cellAt(e.x, e.y);
    let ok = seen.get(c);
    if (ok === undefined) seen.set(c, (ok = lineOfSight(sim, s.x, s.y, e.x, e.y)));
    return ok;
  });
}

/** The enemy a flat shooter aims at this step: when it can fire, `pick`'s
 * choice among those in view (which it keeps as its `target`); while
 * reloading, the one it last saw while it lives within `range`. `pool` is
 * what it looked over, for extra shots, or undefined between looks. */
export function lookOut(sim: DefendSim, s: Soldier, range: number, pick: (pool: Enemy[]) => Enemy | null): { near: Enemy | null; pool?: Enemy[] } {
  if (s.cd > 0) return { near: held(sim, s, range) };
  const pool = inView(sim, s, range), near = pick(pool);
  s.target = near ? near.id : -1;
  if (!near) s.cd = SIGHT_RETRY;
  return { near, pool };
}

/** The enemy `s` last saw, alive and within `range`, or null. */
export function held(sim: DefendSim, s: Soldier, range: number): Enemy | null {
  if (s.target < 0) return null;
  return sim.enemiesNear(s.x, s.y, range).find((e) => e.id === s.target) ?? null;
}

/** Keeps a gunner's tower in order: one bound for a tower that fell or
 * filled gives it up, one up in a tower that fell drops out, and one no
 * longer rallied to its tower climbs down to its door. Returns whether it
 * is up in one. */
export function checkPerch(sim: DefendSim, s: Soldier): boolean {
  const p = s.perch;
  if (!p) return false;
  const b = sim.map.buildings[p.tower];
  if (b && postOf(sim, s)?.tower !== p.tower) {
    const door = sim.doorOf(b);
    if (p.up && door >= 0) Object.assign(s, cellCenter(door));
    s.perch = undefined;
    return false;
  }
  if (!b || !sim.intact(b) || (!p.up && room(sim, b, s) <= 0)) {
    s.perch = undefined;
    return false;
  }
  return !!p.up;
}

/** Gunners up in or bound for `b`, besides `s`. */
const room = (sim: DefendSim, b: Building, s?: Soldier) => TOWER_ROOM - sim.soldiers.filter((o) => o !== s && o.hp > 0 && o.perch?.tower === b.id).length;

/** A gunner rallied to watch tower `tower` with nothing in sight: walks for
 * it while it stands with room and can be reached. Returns whether it set
 * off (its `path` set). */
export function seekTower(sim: DefendSim, s: Soldier, tower: number): boolean {
  if (s.perch || s.thinkT > 0) return false;
  const b = sim.map.buildings[tower];
  if (b?.kind !== "watchTower" || !sim.intact(b) || sim.aloft(b.id) || room(sim, b) <= 0) return false;
  const door = sim.doorOf(b);
  const path = door < 0 ? null : findPath(sim.ownSolid, s, cellCenter(door), TOWER_WALK);
  if (!path) return false;
  s.path = path;
  s.target = -1;
  s.perch = { tower: b.id };
  return true;
}

/** A gunner bound for a tower, at its door with its walk done: climbs in, to
 * the tower's middle. Returns whether it did. */
export function climb(sim: DefendSim, s: Soldier): boolean {
  const p = s.perch;
  if (!p || p.up || s.path.length) return false;
  const b = sim.map.buildings[p.tower];
  if (rectDist(b.rect, s.x, s.y) > 1.5) {
    // Its walk broke off short: it thinks again.
    s.perch = undefined;
    return false;
  }
  const c = center(b.rect);
  s.x = c.x;
  s.y = c.y;
  p.up = true;
  return true;
}
