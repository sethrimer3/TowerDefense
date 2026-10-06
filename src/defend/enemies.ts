import { enemySize } from "./catalog.ts";
import { stepAbilities, enemyDamage, enemySpeed } from "./enemy-abilities.ts";
import { hostileSpecial } from "./hostile-attacks.ts";
import { stepSiege } from "./siege.ts";
import { stepBoat, meltIceCone } from "./boats.ts";
import { baitStanding, lureOf } from "./bait.ts";
/** How a DEFEND enemy spends one step. In order: fight any defender in
 * reach; bats fly straight at the keep; a house that caught its eye is
 * wrecked; otherwise it walks the flow field downhill toward the keep,
 * smashing any building that lies across the cheapest way, and now and then
 * a house beside the street lures it off the road. While monster bait
 * stands, the nearest stack takes the keep's place and no house lures. */
import { dist } from "../exact.ts";
import { ENEMIES, type EnemyDef } from "./catalog.ts";
import { CELLS_H, CELLS_W, cellIndex, sideCells } from "./grid.ts";
import { cellCenter, center, clampCell, downhill, nearestPoint, rectDist } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import { chilled } from "./wizard.ts";

/** One enemy's step: the sim, the enemy, its kind and how close it must be
 * to strike. */
type Turn = { sim: DefendSim; e: Enemy; def: EnemyDef; reach: number; dt: number };

export function stepEnemy(sim: DefendSim, e: Enemy, dt: number) {
  if (e.hp <= 0) return;
  const def = ENEMIES[e.kind];
  e.cd -= dt;
  if (stepAbilities(sim, e, dt)) return;
  if (e.leader !== undefined) {
    const leader = sim.enemies.find(other => other.id === e.leader && other.hp > 0);
    if (leader) {
      const distance = dist(leader.x - e.x, leader.y - e.y);
      if (distance > 0.3) sim.moveToward(e, leader, { speed: Math.min(enemySpeed(sim, e) * 2, (distance - 0.3) / dt), dt, flying: def.flying });
      return;
    }
    // The segment immediately behind a cut becomes a new independent head.
    delete e.leader;
  }
  if (hostileSpecial(sim, e, dt)) return;
  if (def.siege && stepSiege(sim, e, dt)) return;
  if (def.boat) return stepBoat(sim, e, dt);
  if (e.kind === "dragon" && breathe(sim, e, dt)) return;
  const t: Turn = { sim, e, def, reach: enemySize(e) / 2 + 0.4, dt };
  if (fightDefender(t)) return;
  if (def.flying) return flyAtKeep(t);
  if (e.distract >= 0 && (sim.baits.length === 0 || !baitStanding(sim)) && chaseDistraction(t)) return;
  march(t);
}

function fightDefender({ sim, e, def, reach }: Turn) {
  const foe = sim.nearestDefender(e.x, e.y, reach + 0.2);
  if (!foe) return false;
  if (e.cd <= 0) {
    e.cd = def.cooldown;
    // A valkyrie just after her charge can't be hurt.
    if ("guard" in foe && foe.guard) return true;
    const damage = enemyDamage(sim, e);
    const drained = Math.min(foe.hp, damage);
    foe.hp -= damage;
    if (e.kind === "leechSwarm") e.hp = Math.min(e.maxHp, e.hp + drained);
    foe.flash = 0.12;
  }
  return true;
}

/** Fliers make straight for the keep, or the nearest monster bait. */
function flyAtKeep(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  const goal = sim.baits.length ? lureOf(sim, e.x, e.y) : sim.keep;
  if (rectDist(goal.rect, e.x, e.y) <= reach) return hitBuilding(t, goal.id);
  sim.moveToward(e, center(goal.rect), { speed: enemySpeed(sim, e) * chilled(e), dt, flying: true });
}

/** Wreck the house that caught its eye. False once the house is gone or the
 * enemy lost interest, so it goes back to marching this same step. */
function chaseDistraction(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  const b = sim.map.buildings[e.distract];
  e.distractT -= dt;
  if (e.distractT <= 0 || isRubble(sim, b.id)) {
    e.distract = -1;
    return false;
  }
  if (rectDist(b.rect, e.x, e.y) <= reach) hitBuilding(t, b.id);
  else if (!sim.moveToward(e, nearestPoint(b.rect, e.x, e.y), { speed: enemySpeed(sim, e) * chilled(e), dt })) e.distract = -1;
  return true;
}

/** Downhill on the flow field toward the keep, or the nearest monster
 * bait while any stands. */
function march(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  const cx = clampCell(e.x, CELLS_W),
    cy = clampCell(e.y, CELLS_H);
  let field: Float64Array = sim.field;
  if (sim.baits.length && baitStanding(sim)) {
    const bait = lureOf(sim, e.x, e.y);
    if (rectDist(bait.rect, e.x, e.y) <= reach) return hitBuilding(t, bait.id);
    // Bait it can't walk to at any price doesn't call it.
    const left = sim.baitField[cellIndex(cx, cy)];
    if (left < Infinity) field = sim.baitField;
    // Close by in the open, the crowd closes round the stack from all sides
    // rather than queueing at one corner.
    if (left < CLOSE_IN) {
      const p = nearestPoint(bait.rect, e.x, e.y);
      if (sim.moveToward(e, { x: p.x + e.jx * 3, y: p.y + e.jy * 3 }, { speed: enemySpeed(sim, e) * chilled(e), dt })) return;
    }
  }
  if (field === sim.field && rectDist(sim.keep.rect, e.x, e.y) <= reach) return hitBuilding(t, sim.keepId);
  const best = downhill(field, sim.solid, cx, cy);
  if (best < 0) return;
  const c = cellCenter(best);
  if (sim.solid[best]) return smashThrough(t, best, c);
  if (field === sim.field) rollForDistraction(t, cx, cy);
  sim.moveToward(e, { x: c.x + e.jx, y: c.y + e.jy }, { speed: enemySpeed(sim, e) * chilled(e), dt });
}

/** The cheapest way on goes through a building: walk up and smash it. */
function smashThrough(t: Turn, cell: number, c: { x: number; y: number }) {
  const { sim, e, def, reach, dt } = t;
  const bid = sim.map.owner[cell];
  if (rectDist(sim.map.buildings[bid].rect, e.x, e.y) <= reach) return hitBuilding(t, bid);
  sim.moveToward(e, c, { speed: enemySpeed(sim, e) * chilled(e), dt });
}

/** Streets are lined with temptations: twice a second, a chance that a
 * house beside the enemy's cell lures it for a while. */
function rollForDistraction({ sim, e, def, dt }: Turn, cx: number, cy: number) {
  e.rollT -= dt;
  if (e.rollT > 0) return;
  e.rollT = 0.5;
  if (def.distraction <= 0 || sim.rand() >= def.distraction * 0.3) return;
  const house = sideCells({ x: cx, y: cy, w: 1, h: 1 }).find((n) => sim.solid[n] && isHouse(sim, sim.map.owner[n]));
  if (house === undefined) return;
  e.distract = sim.map.owner[house];
  e.distractT = 5;
}

/** Walking cost to monster bait under which an enemy makes straight for it. */
const CLOSE_IN = 8;

const isRubble = (sim: DefendSim, id: number) => sim.hp[id] <= 0 || !sim.built[id];
const isHouse = (sim: DefendSim, bid: number) => bid >= 0 && sim.map.buildings[bid].kind === "house";

function hitBuilding({ sim, e, def }: Turn, id: number) {
  if (e.cd > 0) return;
  e.cd = def.cooldown;
  sim.damageBuilding(id, enemyDamage(sim, e));
}

/** Deterministic cone breath; only chain heads attack. */
function breathe(sim: DefendSim, e: Enemy, _dt: number): boolean {
  const foe = sim.nearestDefender(e.x, e.y, 5);
  const building = sim.map.buildings.find(b => sim.intact(b) && rectDist(b.rect, e.x, e.y) <= 5);
  const target = foe ?? (building ? nearestPoint(building.rect, e.x, e.y) : null);
  if (!target) return false;
  if (e.cd > 0) return true;
  e.cd = ENEMIES.dragon.cooldown;
  let dx = target.x - e.x, dy = target.y - e.y;
  const length = dist(dx, dy);
  if (length > 0) { dx /= length; dy /= length; } else { dx = 0; dy = 1; }
  e.breath = { dx, dy, t: 0.45 };
  meltIceCone(sim, e.x, e.y, dx, dy, 5, .45);
  const inside = (x: number, y: number) => {
    const ux = x - e.x, uy = y - e.y;
    const along = ux * dx + uy * dy;
    return along >= 0 && along <= 5 && Math.abs(ux * dy - uy * dx) <= 0.35 + along * 0.45;
  };
  for (const soldier of sim.soldiers) if (soldier.hp > 0 && !soldier.guard && inside(soldier.x, soldier.y)) {
    soldier.hp -= enemyDamage(sim, e);
    soldier.flash = 0.12;
  }
  for (const civilian of sim.civilians) if (civilian.hp > 0 && inside(civilian.x, civilian.y)) {
    civilian.hp -= enemyDamage(sim, e);
    civilian.flash = 0.12;
  }
  for (const b of sim.map.buildings) {
    const near = nearestPoint(b.rect, e.x, e.y);
    if (sim.intact(b) && inside(near.x, near.y)) sim.damageBuilding(b.id, enemyDamage(sim, e));
  }
  return true;
}
