/** Siege engines: rolling cannons, ballistas, firework launchers,
 * trebuchets, great bombards and dragonfire batteries. Nobody works them;
 * each drives itself down the flow field toward the keep like any ground
 * enemy, and stops to shoot whatever stands in its way once it is within
 * range (`SiegeDef` in `catalog.ts`):
 *
 * - the keep, as soon as it is in range (while monster bait stands, the
 *   nearest stack instead, and its way leads there);
 * - else the building the engine's own way ahead runs into (a wall stone,
 *   a house across the street, a tower), so it breaches what blocks it and
 *   then rolls on through the gap;
 * - else the nearest defender in range (a `people` engine, the ballista,
 *   looks for defenders first).
 *
 * Shots fly as `sim.siegeShots` and land on their own. They hurt only the
 * city and its people, never other enemies. Battle code: exact arithmetic
 * only (`src/exact.ts`). */
import { dist, sq } from "../exact.ts";
import { ENEMIES, type SiegeDef } from "./catalog.ts";
import { enemyDamage } from "./enemy-abilities.ts";
import { hostileBurst } from "./hostile-attacks.ts";
import { CELLS_H, CELLS_W, cellIndex, cellX, cellY } from "./grid.ts";
import { clampCell, downhill, nearestPoint, rectDist, type Point } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import { lureOf } from "./bait.ts";

/** A siege engine's shot in flight from (x0, y0) to (x1, y1). It flies
 * while `t` runs from 0 to `dur`; a shot with `t` below 0 is still waiting
 * to leave (a trebuchet's arm swinging up, the later rockets of a volley).
 * `building` is the building a bolt was aimed at. */
export type SiegeShot = {
  kind: SiegeDef["shot"];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  damage: number;
  r: number;
  seed: number;
  building?: number;
};

/** What an engine is shooting at: a building (by id) or a defender (by
 * id), and where it aims. */
export type SiegeAim = Point & { building?: number; unit?: number };

/** Seconds an engine takes to brace before its first shot at a new mark. */
export const SIEGE_SETUP = 0.8;
/** Seconds between looks for something to shoot. */
const LOOK = 0.25;
/** Cells a second: bolts, iron balls and stones, rockets. */
const BOLT_SPEED = 16;
const BALL_SPEED = 8;
const STONE_SPEED = 5.5;
const ROCKET_SPEED = 7;
/** Seconds a trebuchet's arm takes to swing up before the stone leaves. */
export const SWING = 0.4;
/** Seconds between the rockets of a volley. */
export const ROCKET_GAP = 0.09;

/** One engine's step: true while it has something in range (bracing,
 * reloading or shooting), false to march on like any enemy. */
export function stepSiege(sim: DefendSim, e: Enemy, dt: number): boolean {
  const def = ENEMIES[e.kind], siege = def.siege!;
  e.abilityT = (e.abilityT ?? 0) - dt;
  if (e.abilityT <= 0 || (e.aim && lost(sim, e.aim))) {
    e.abilityT = LOOK;
    const aim = findAim(sim, e, siege);
    if (!aim) {
      delete e.aim;
      return false;
    }
    if (!e.aim) e.cd = Math.max(e.cd, SIEGE_SETUP);
    e.aim = aim;
  }
  if (!e.aim) return false;
  if (e.aim.unit !== undefined) {
    const foe = defender(sim, e.aim.unit)!;
    e.aim.x = foe.x;
    e.aim.y = foe.y;
  }
  if (e.cd > 0) return true;
  e.cd = def.cooldown;
  fire(sim, e, siege, e.aim);
  return true;
}

/** True once the mark is gone: its building fell, its defender died. */
function lost(sim: DefendSim, aim: SiegeAim) {
  if (aim.building !== undefined) return !sim.intact(sim.map.buildings[aim.building]);
  return aim.unit !== undefined && !defender(sim, aim.unit);
}

function defender(sim: DefendSim, id: number) {
  return sim.soldiers.find((u) => u.id === id && u.hp > 0) ?? sim.civilians.find((u) => u.id === id && u.hp > 0);
}

function findAim(sim: DefendSim, e: Enemy, siege: SiegeDef): SiegeAim | null {
  const people = () => {
    const foe = sim.nearestDefender(e.x, e.y, siege.range);
    return foe ? { x: foe.x, y: foe.y, unit: foe.id } : null;
  };
  if (siege.people) return people() ?? buildingAim(sim, e, siege.range);
  return buildingAim(sim, e, siege.range) ?? people();
}

/** The keep (or the nearest monster bait while any stands) in range, else
 * the building the engine's way runs into. */
function buildingAim(sim: DefendSim, e: Enemy, range: number): SiegeAim | null {
  const keep = sim.baits.length ? lureOf(sim, e.x, e.y) : sim.keep;
  if (sim.hp[keep.id] > 0 && rectDist(keep.rect, e.x, e.y) <= range) return { ...nearestPoint(keep.rect, e.x, e.y), building: keep.id };
  const id = blockerAhead(sim, e, range);
  if (id < 0) return null;
  return { ...nearestPoint(sim.map.buildings[id].rect, e.x, e.y), building: id };
}

/** Follows the flow field from the engine's cell to the first standing
 * building across it; its id if that is within `range`, else -1. */
export function blockerAhead(sim: DefendSim, e: Point, range: number): number {
  let cx = clampCell(e.x, CELLS_W),
    cy = clampCell(e.y, CELLS_H);
  const limit = Math.ceil(range) + 4;
  for (let n = 0; n < limit; n++) {
    const i = cellIndex(cx, cy);
    if (sim.solid[i]) {
      const id = sim.map.owner[i];
      return id >= 0 && sim.intact(sim.map.buildings[id]) && rectDist(sim.map.buildings[id].rect, e.x, e.y) <= range ? id : -1;
    }
    const next = downhill(sim.marchField(), sim.solid, cx, cy);
    if (next < 0) return -1;
    cx = cellX(next);
    cy = cellY(next);
  }
  return -1;
}

function fire(sim: DefendSim, e: Enemy, siege: SiegeDef, aim: SiegeAim) {
  const damage = enemyDamage(sim, e);
  const d = dist(aim.x - e.x, aim.y - e.y);
  const shot = (kind: SiegeShot["kind"], x1: number, y1: number, dur: number, t = 0): SiegeShot => ({
    kind, x0: e.x, y0: e.y, x1, y1, t, dur, damage, r: siege.radius, seed: (sim.rand() * 1e9) | 0,
  });
  if (siege.shot === "bolt") {
    // A bolt flies on past a person it was loosed at, through the line.
    const s = shot("bolt", aim.x, aim.y, 0.05 + d / BOLT_SPEED);
    if (aim.building !== undefined) s.building = aim.building;
    sim.siegeShots.push(s);
  } else if (siege.shot === "rocket") {
    const n = siege.volley ?? 1, spread = siege.spread ?? 0;
    for (let k = 0; k < n; k++) {
      const x = clamp(aim.x + (sim.rand() * 2 - 1) * spread, CELLS_W),
        y = clamp(aim.y + (sim.rand() * 2 - 1) * spread, CELLS_H);
      sim.siegeShots.push(shot("rocket", x, y, 0.45 + dist(x - e.x, y - e.y) / ROCKET_SPEED, -k * ROCKET_GAP));
    }
  } else if (siege.shot === "stone") sim.siegeShots.push(shot("stone", aim.x, aim.y, 0.5 + d / STONE_SPEED, -SWING));
  else sim.siegeShots.push(shot("ball", aim.x, aim.y, 0.25 + d / BALL_SPEED));
}

const clamp = (v: number, max: number) => Math.max(0.1, Math.min(max - 0.1, v));

/** Shots fly and land: balls, stones and rockets burst; a bolt runs
 * through every defender on its line and strikes the building it was
 * aimed at. */
export function stepSiegeShots(sim: DefendSim, dt: number) {
  if (!sim.siegeShots.length) return;
  for (const s of sim.siegeShots) {
    s.t += dt;
    if (s.t < s.dur) continue;
    if (s.kind === "bolt") {
      pierce(sim, s);
      if (s.building !== undefined && sim.intact(sim.map.buildings[s.building])) sim.damageBuilding(s.building, s.damage);
      sim.effects.push({ kind: "spark", x: s.x1, y: s.y1, t: 0, r: 0.4 });
      continue;
    }
    hostileBurst(sim, s.x1, s.y1, s.r, s.damage);
    sim.effects.push({ kind: "boom", x: s.x1, y: s.y1, t: 0, r: s.r, seed: s.seed });
    if (s.kind === "rocket") sim.effects.push({ kind: "firework", x: s.x1, y: s.y1, t: 0, r: s.r * 2.2, seed: s.seed });
    else sim.scorches.push({ x: s.x1, y: s.y1, r: s.r, seed: s.seed, t: 0, life: s.kind === "stone" ? 3 : 2 });
  }
  sim.siegeShots = sim.siegeShots.filter((s) => s.t < s.dur);
}

/** Hurts each defender within the bolt's width of its line. */
function pierce(sim: DefendSim, s: SiegeShot) {
  const lx = s.x1 - s.x0,
    ly = s.y1 - s.y0;
  const l2 = lx * lx + ly * ly;
  for (const u of [...sim.soldiers, ...sim.civilians]) {
    if (u.hp <= 0 || ("guard" in u && u.guard)) continue;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((u.x - s.x0) * lx + (u.y - s.y0) * ly) / l2)) : 1;
    if (sq(s.x0 + lx * k - u.x) + sq(s.y0 + ly * k - u.y) > sq(s.r)) continue;
    u.hp -= s.damage;
    u.flash = 0.12;
  }
}
