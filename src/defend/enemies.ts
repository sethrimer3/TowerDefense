import { stepBlightWorm } from "./blight-worm.ts";
import { approachBuildingContact, approachDefenderContact, buildingContactPoint, defenderInContact, structureContactRect, CONTACT_OUTLINE } from "./contact.ts";
import { enemySize } from "./catalog.ts";
import { stepAbilities, enemyDamage, enemySpeed } from "./enemy-abilities.ts";
import { hostileSpecial } from "./hostile-attacks.ts";
import { stepSiege } from "./siege.ts";
import { stepBoat, meltIceCone } from "./boats.ts";
import { baitBitten, baitStanding, lureOf } from "./bait.ts";
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
import { cloaked } from "./assassins.ts";
import { perched } from "./gun-sight.ts";
import { groundBody } from "./enemy-crowd.ts";
import type { CrowdTarget } from "./enemy-crowd.ts";
import type { Civilian, Soldier, DefendSim, Enemy } from "./sim.ts";
import { chilled } from "./wizard.ts";
import { stepIceCube } from "./ice-enemies.ts";

/** One enemy's step: the sim, the enemy, its kind and how close it must be
 * to strike. */
type Turn = { sim: DefendSim; e: Enemy; def: EnemyDef; reach: number; dt: number };

export function stepEnemy(sim: DefendSim, e: Enemy, dt: number) {
  if (e.hp <= 0) return;
  if (e.kind === "blightWorm") return stepBlightWorm(sim, e, dt);
  sim.crowd.add(e);
  const def = ENEMIES[e.kind];
  e.cd -= dt;
  if (sim.crowd.holds(e)) return;
  if (e.impaled !== undefined) return;
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
  if (sim.crowd.queued(e)) return;
  if (hostileSpecial(sim, e, dt)) return;
  if (def.siege && stepSiege(sim, e, dt)) return;
  if (def.boat) return stepBoat(sim, e, dt);
  if (e.kind === "dragon" && breathe(sim, e, dt)) return;
  const t: Turn = { sim, e, def, reach: enemySize(e) / 2 + 0.4, dt };
  if (fightDefender(t)) return;
  if (sim.scenario?.routeEnemy?.(e, dt)) return;
  if (e.kind === "iceCube") return stepIceCube(sim, e, dt);
  if (def.flying) return flyAtKeep(t);
  if (e.distract >= 0 && (sim.baits.length === 0 || !baitStanding(sim)) && chaseDistraction(t)) return;
  march(t);
}

function fightDefender(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  const foe = sim.nearestDefender(e.x, e.y, reach + 0.2);
  if (!foe) return false;
  if (def.faction === "darkOne" && groundBody(e) && !approachDefenderContact(sim, e, foe, dt)) return true;
  sim.crowd.target(e, { unit: foe });
  hitDefender(t, foe);
  return true;
}
function hitDefender({ sim, e, def }: Turn, foe: Soldier | Civilian) {
  if (e.cd > 0 || def.faction === "darkOne" && (e.freeze || e.stagger)) return;
  e.cd = def.cooldown;
  if ("guard" in foe && foe.guard) return;
  const drained = sim.hurtDefender(foe, enemyDamage(sim, e));
  if (e.kind === "leechSwarm") e.hp = Math.min(e.maxHp, e.hp + drained);
  foe.flash = 0.12;
}

/** Fliers make straight for the keep, or the nearest monster bait. */
function flyAtKeep(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  const goal = sim.baits.length ? lureOf(sim, e.x, e.y) : sim.keep;
  if (rectDist(goal.rect, e.x, e.y) <= reach) return contactBuilding(t, goal.id);
  sim.moveToward(e, center(goal.rect), { speed: enemySpeed(sim, e) * chilled(e), dt, flying: true });
}

/** Scenario geography calls the ordinary native bites, collision and steering. */
const turn = (sim: DefendSim, e: Enemy, dt: number): Turn => ({ sim, e, dt, def: ENEMIES[e.kind], reach: enemySize(e) / 2 + 0.4 });
export function routeToBuilding(sim: DefendSim, e: Enemy, id: number, dt: number, field: Float64Array) {
  const t = turn(sim, e, dt);
  if (rectDist(structureContactRect(sim, sim.map.buildings[id]), e.x, e.y) <= t.reach + CONTACT_OUTLINE) return contactBuilding(t, id);
  routeOnField(t, field);
}
export function routeToPoint(sim: DefendSim, e: Enemy, dt: number, field: Float64Array) {
  routeOnField(turn(sim, e, dt), field);
}
export function routeFlier(sim: DefendSim, e: Enemy, dt: number) {
  flyAtKeep(turn(sim, e, dt));
}
function routeOnField(t: Turn, field: Float64Array) {
  const { sim, e, dt } = t,
    best = downhill(field, sim.foeSolid, clampCell(e.x, CELLS_W), clampCell(e.y, CELLS_H), sim.scenario?.toll);
  if (insideFence(t)) return;
  if (best < 0) return;
  const p = cellCenter(best);
  if (sim.foeSolid[best] && sim.map.owner[best] >= 0) smashThrough(t, best);
  else sim.moveToward(e, { x: p.x + e.jx, y: p.y + e.jy }, { speed: enemySpeed(sim, e) * chilled(e), dt });
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
  if (rectDist(b.rect, e.x, e.y) <= reach) contactBuilding(t, b.id);
  else if (!sim.moveToward(e, nearestPoint(b.rect, e.x, e.y), { speed: enemySpeed(sim, e) * chilled(e), dt })) e.distract = -1;
  return true;
}

/** Downhill on the flow field toward the keep, or the nearest monster
 * bait while any stands. */
function march(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  if (insideFence(t)) return;
  const cx = clampCell(e.x, CELLS_W),
    cy = clampCell(e.y, CELLS_H);
  let field: Float64Array = sim.field;
  if (sim.baits.length && baitStanding(sim)) {
    const bait = lureOf(sim, e.x, e.y);
    if (rectDist(bait.rect, e.x, e.y) <= reach) return contactBuilding(t, bait.id);
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
  if (field === sim.field && rectDist(sim.keep.rect, e.x, e.y) <= reach) return contactBuilding(t, sim.keepId);
  const best = downhill(field, sim.foeSolid, cx, cy);
  if (best < 0) return;
  const c = cellCenter(best);
  if (sim.foeSolid[best]) return smashThrough(t, best);
  if (field === sim.field) rollForDistraction(t, cx, cy);
  sim.moveToward(e, { x: c.x + e.jx, y: c.y + e.jy }, { speed: enemySpeed(sim, e) * chilled(e), dt });
}

/** The cheapest way on goes through a building: walk up and smash it. */
function smashThrough(t: Turn, cell: number) {
  const { sim } = t;
  const bid = sim.map.owner[cell];
  contactBuilding(t, bid);
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

/** Native and scenario routes share exactly the same contact gate. */
function contactBuilding(t: Turn, id: number) {
  const b = t.sim.map.buildings[id];
  if (b && t.sim.intact(b) && approachBuildingContact(t.sim, t.e, b, t.dt)) {
    t.sim.crowd.target(t.e, { building: b }); hitBuilding(t, id);
  }
}
function insideFence(t: Turn) {
  const cell = cellIndex(clampCell(t.e.x, CELLS_W), clampCell(t.e.y, CELLS_H));
  const b = t.sim.map.buildings[t.sim.map.owner[cell]];
  if (!b?.fence || !t.sim.intact(b)) return false;
  contactBuilding(t, b.id); return true;
}

function hitBuilding({ sim, e, def }: Turn, id: number, front = e) {
  if (e.cd > 0 || def.faction === "darkOne" && (e.freeze || e.stagger)) return;
  e.cd = def.cooldown;
  const bite = enemyDamage(sim, e);
  sim.damageBuilding(id, bite);
  if (sim.map.buildings[id].kind === "monsterBait") baitBitten(sim, front, bite, sim.map.buildings[id]);
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
    sim.hurtDefender(soldier, enemyDamage(sim, e));
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

/** Roots were acquired by native AI this phase; transfer only their basic
 * contact attack, once per rear enemy's own cooldown/status. */
function crowdTargetValid(sim: DefendSim, e: Enemy, target: CrowdTarget) {
  if (!groundBody(e)) return false;
  if ("building" in target) {
    const b = target.building;
    if (!sim.intact(b) || sim.aloft(b.id)) return false;
    const p = buildingContactPoint(sim, e, b);
    return Math.abs(p.x - e.x) + Math.abs(p.y - e.y) <= 1e-8;
  }
  const u = target.unit;
  if (u.hp <= 0 || cloaked(u) || perched(u)) return false;
  return defenderInContact(e, u);
}
export function prepareCrowdAttacks(sim: DefendSim) {
  sim.crowd.prime((e, target) => crowdTargetValid(sim, e, target));
}
export function transferCrowdAttacks(sim: DefendSim) {
  sim.crowd.transfer((e, target) => crowdTargetValid(sim, e, target), (e, front, target) => {
    const t = turn(sim, e, 0);
    if ("building" in target) hitBuilding(t, target.building.id, front);
    else hitDefender(t, target.unit);
  });
}
