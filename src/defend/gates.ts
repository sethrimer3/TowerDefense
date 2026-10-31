/** The city gates in battle. A standing gate swings open while any of the
 * city's people are at it and shuts `gateShut` seconds after the last has
 * gone; until Portcullis bars it, the enemy may slip through while it is
 * open (`DefendSim.foeSolid`), and whoever is caught in the gateway as it
 * shuts is shoved out. The gates' upgrades (`gate-upgrades.ts`) add murder
 * holes and small ballistas on the gatehouse. Repairs require shop workers. A city
 * without gates does none of it, so such runs replay exactly as before. */
import { GATE_TOWERS, PORTCULLIS, gateBarred, gateRank } from "../gate-upgrades.ts";
import { sq } from "../exact.ts";
import { GATE, ballistaDamage, enemySize, gateShut } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { cellIndex, CELLS_H, CELLS_W } from "./grid.ts";
import { center, nearest, nearestOpen, rectDist, type Point } from "./pathing.ts";
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

/** Opens each standing gate while the city's people are at it, to the
 * enemy as well, and shuts it behind them. */
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

/** Whether any of the city's people stand at gate `b`, so it swings open
 * (the same reach the renderer opens its doors by). */
export const peopleAt = (sim: DefendSim, b: Building) =>
  sim.soldiers.some((u) => u.hp > 0 && rectDist(b.rect, u.x, u.y) < GATE.reach) || sim.civilians.some((u) => u.hp > 0 && rectDist(b.rect, u.x, u.y) < GATE.reach);

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
