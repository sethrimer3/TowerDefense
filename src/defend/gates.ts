/** The city gates in battle. A standing gate swings open while any of the
 * city's people intend to pass through it, shutting `gateShut` seconds
 * after the last has gone; until Portcullis bars it, the enemy may slip through while it is
 * open (`DefendSim.foeSolid`), and whoever is caught in the gateway as it
 * shuts is shoved out. The gates' upgrades (`gate-upgrades.ts`) add murder
 * holes and small ballistas on the gatehouse. Repairs require masons. A city
 * without gates does none of it, so such runs replay exactly as before. */
import { GATE_TOWERS, PORTCULLIS, gateBarred, gateRank } from "../gate-upgrades.ts";
import { sq } from "../exact.ts";
import { GATE, ballistaDamage, enemySize, gateShut } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { cellIndex, CELLS_H, CELLS_W } from "./grid.ts";
import { cellCenter, center, nearest, nearestOpen, rectDist, type Point } from "./pathing.ts";
import type { DefendSim } from "./sim.ts";
import { ignite } from "./towers.ts";
import { fireBolt, onFoot } from "./wall-defenses.ts";

export function stepGates(sim: DefendSim, dt: number) {
  if (!sim.gates.length) return;
  const ranks = sim.bonuses.gate;
  if (!gateBarred(ranks)) swingGates(sim, dt);
  if (!ranks) return;
  murderHoles(sim, dt);
  gateTowers(sim, dt);
}

/** Opens each standing gate for a planned passage, to the enemy as well,
 * and shuts it behind the city's people. */
function swingGates(sim: DefendSim, dt: number) {
  const shut = gateShut(sim.levels.gateHinges ?? 0);
  for (const b of sim.gates) {
    if (!sim.ownsBuilding(b)) continue;
    if (!sim.intact(b)) continue;
    const was = sim.gateOpen.get(b.id);
    const left = peopleAt(sim, b) ? shut : (was ?? 0) - dt;
    if (left > 0) {
      if (was === undefined) sim.openToFoes(b, true);
      sim.gateOpen.set(b.id, left);
    } else if (was !== undefined) {
      sim.gateOpen.delete(b.id);
      sim.openToFoes(b, false);
      shoveOut(sim, b);
    }
  }
}

/** A nearby individual's upcoming route must pass through this gateway and
 * emerge on the other side of the wall. Parallel errands and idle units do
 * not request it. Only inspect the local approach, not a distant later visit. */
export function gatePassage(b: Building, u: Point & { path: readonly number[] }, solid?: Uint8Array): boolean {
  const r = b.rect;
  if (rectDist(r, u.x, u.y) >= GATE.reach || !u.path.length) return false;
  const horizontal = r.w >= r.h;
  const lo = horizontal ? r.y : r.x, hi = lo + (horizontal ? r.h : r.w);
  const side = (p: Point) => {
    const v = horizontal ? p.y : p.x;
    return v < lo ? -1 : v >= hi ? 1 : 0;
  };
  const within = (p: Point) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  const from = side(u);
  let entered = within(u), previous: Point = u, distance = 0;
  for (const cell of u.path) {
    if (solid?.[cell]) return false;
    const p = cellCenter(cell);
    distance += Math.hypot(p.x - previous.x, p.y - previous.y);
    if (distance > GATE.reach + (hi - lo) + 2) return false;
    entered ||= within(p);
    if (entered && side(p) !== 0 && (from === 0 || side(p) !== from)) return true;
    previous = p;
  }
  return false;
}

/** Soldiers and masons open a gate for a planned passage, never proximity. */
export const peopleAt = (sim: DefendSim, b: Building) =>
  sim.soldiers.some((u) => u.hp > 0 && u.kind !== "valkyrie" && !u.perch?.up && gatePassage(b, u, sim.ownSolid)) ||
  sim.civilians.some((u) => u.hp > 0 && gatePassage(b, u, sim.ownSolid));

/** Enemies on foot caught in the gateway as it shuts step out of it. */
function shoveOut(sim: DefendSim, b: Building) {
  const c = center(b.rect);
  for (const e of sim.enemiesNear(c.x, c.y, Math.max(b.rect.w, b.rect.h))) {
    if (e.hp <= 0 || !onFoot(e)) continue;
    const cx = Math.floor(e.x), cy = Math.floor(e.y);
    if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H || !sim.solid[cellIndex(cx, cy)] || sim.map.owner[cellIndex(cx, cy)] !== b.id) continue;
    const to = outOfGate(sim, b, e);
    if (to) [e.x, e.y] = to;
  }
}

/** The nearest open cell to `p` round gate `b`'s gateway. */
function outOfGate(sim: DefendSim, b: Building, p: Point): [number, number] | null {
  for (let i = 0; i < b.cells.length; i++) {
    const cell = b.cells[i];
    const to = nearestOpen(sim.solid, cell % CELLS_W, Math.floor(cell / CELLS_W), p);
    if (to) return to;
  }
  return null;
}

/** Portcullis II and III: every few seconds the murder holes over each
 * standing gatehouse drop on every enemy on foot at it. */
function murderHoles(sim: DefendSim, dt: number) {
  const rank = gateRank(sim.bonuses.gate, "portcullis");
  if (rank < 2) return;
  sim.gateHoleT -= dt;
  if (sim.gateHoleT > 0) return;
  sim.gateHoleT += PORTCULLIS.every[rank];
  const damage = PORTCULLIS.damage[rank] * sim.bonuses.towerDamage;
  for (const b of sim.gates) {
    if (!sim.ownsBuilding(b)) continue;
    if (!sim.intact(b)) continue;
    const c = center(b.rect);
    for (const e of sim.enemiesNear(c.x, c.y, Math.max(b.rect.w, b.rect.h) / 2 + PORTCULLIS.reach + 1)) {
      if (e.hp <= 0 || !onFoot(e) || rectDist(b.rect, e.x, e.y) > PORTCULLIS.reach + enemySize(e) / 2) continue;
      sim.hurtEnemy(e, damage, true, "ranged", { x: c.x, y: c.y, building: b.id }, false, rank >= 3 ? "fire" : "physical");
      if (rank >= 3 && e.hp > 0) ignite(e, PORTCULLIS.burnDps * sim.bonuses.towerDamage, PORTCULLIS.burn);
    }
  }
}

/** Where gate `b`'s small ballistas stand on its gatehouse: one in the
 * middle, or two, one at each end along the wall. */
export function gateTowerSpots(b: Building, twin: boolean): Point[] {
  const c = center(b.rect);
  if (!twin) return [c];
  const along = b.rect.w >= b.rect.h, half = (along ? b.rect.w : b.rect.h) / 2 - 0.75;
  return along ? [{ x: c.x - half, y: c.y }, { x: c.x + half, y: c.y }] : [{ x: c.x, y: c.y - half }, { x: c.x, y: c.y + half }];
}

/** The key a gate's `n`th small ballista keeps its aim and reload under
 * (negative, so it never meets a wall ballista's building id). */
export const gateTowerKey = (b: Building, n: number) => -1 - b.id * 2 - n;

/** Gate towers: each standing gate's small ballistas shoot light bolts at
 * the nearest enemy in reach. */
function gateTowers(sim: DefendSim, dt: number) {
  const rank = gateRank(sim.bonuses.gate, "gateTowers");
  if (!rank) return;
  const range = GATE_TOWERS.range[rank];
  const damage = ballistaDamage(sim.levels.ballistaDamage ?? 0) * sim.bonuses.towerDamage * GATE_TOWERS.share[rank];
  for (const b of sim.gates) {
    if (!sim.ownsBuilding(b)) continue;
    if (!sim.intact(b)) continue;
    gateTowerSpots(b, rank >= GATE_TOWERS.twin).forEach((at, n) => {
      const key = gateTowerKey(b, n), left = (sim.gateTowerT.get(key) ?? 0) - dt;
      if (left > 0) return void sim.gateTowerT.set(key, left);
      const target = nearest(sim.enemiesNear(at.x, at.y, range), at, sq(range));
      if (!target) return void sim.gateTowerT.set(key, 0);
      sim.gateTowerT.set(key, GATE_TOWERS.cooldown * sim.bonuses.towerReload);
      fireBolt(sim, at, target, key, b.id, { damage, range, pierce: GATE_TOWERS.pierce[rank], small: true });
    });
  }
}
