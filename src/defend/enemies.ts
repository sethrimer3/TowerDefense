import { hostileSpecial } from "./hostile-attacks.ts";
/** How a DEFEND enemy spends one step. In order: fight any defender in
 * reach; bats fly straight at the keep; a house that caught its eye is
 * wrecked; otherwise it walks the flow field downhill toward the keep,
 * smashing any building that lies across the cheapest way, and now and then
 * a house beside the street lures it off the road. */
import { dist } from "../exact.ts";
import { ENEMIES, type EnemyDef } from "./catalog.ts";
import { CELLS_H, CELLS_W, sideCells } from "./grid.ts";
import { cellCenter, center, clampCell, downhill, nearestPoint, rectDist } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import { chilled } from "./wizard.ts";

/** One enemy's step: the sim, the enemy, its kind and how close it must be
 * to strike. */
type Turn = { sim: DefendSim; e: Enemy; def: EnemyDef; reach: number; dt: number };

export function stepEnemy(sim: DefendSim, e: Enemy, dt: number) {
  const def = ENEMIES[e.kind];
  e.cd -= dt;
  if (e.leader !== undefined) {
    const leader = sim.enemies.find(other => other.id === e.leader && other.hp > 0);
    if (leader) {
      const distance = dist(leader.x - e.x, leader.y - e.y);
      if (distance > 0.3) sim.moveToward(e, leader, { speed: Math.min(def.speed * 2, (distance - 0.3) / dt), dt, flying: def.flying });
      return;
    }
    // The segment immediately behind a cut becomes a new independent head.
    delete e.leader;
  }
  if (hostileSpecial(sim, e, dt)) return;
  if (e.kind === "dragon" && breathe(sim, e, dt)) return;
  const t: Turn = { sim, e, def, reach: def.size / 2 + 0.4, dt };
  if (fightDefender(t)) return;
  if (def.flying) return flyAtKeep(t);
  if (e.distract >= 0 && chaseDistraction(t)) return;
  march(t);
}

function fightDefender({ sim, e, def, reach }: Turn) {
  const foe = sim.nearestDefender(e.x, e.y, reach + 0.2);
  if (!foe) return false;
  if (e.cd <= 0) {
    e.cd = def.cooldown;
    // A valkyrie just after her charge can't be hurt.
    if ("guard" in foe && foe.guard) return true;
    foe.hp -= def.damage;
    foe.flash = 0.12;
  }
  return true;
}

function flyAtKeep(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  if (rectDist(sim.keep.rect, e.x, e.y) <= reach) return hitBuilding(t, sim.keepId);
  sim.moveToward(e, center(sim.keep.rect), { speed: def.speed * chilled(e), dt, flying: true });
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
  else if (!sim.moveToward(e, nearestPoint(b.rect, e.x, e.y), { speed: def.speed * chilled(e), dt })) e.distract = -1;
  return true;
}

/** Downhill on the flow field toward the keep. */
function march(t: Turn) {
  const { sim, e, def, reach, dt } = t;
  const cx = clampCell(e.x, CELLS_W),
    cy = clampCell(e.y, CELLS_H);
  if (rectDist(sim.keep.rect, e.x, e.y) <= reach) return hitBuilding(t, sim.keepId);
  const best = downhill(sim.field, sim.solid, cx, cy);
  if (best < 0) return;
  const c = cellCenter(best);
  if (sim.solid[best]) return smashThrough(t, best, c);
  rollForDistraction(t, cx, cy);
  sim.moveToward(e, { x: c.x + e.jx, y: c.y + e.jy }, { speed: def.speed * chilled(e), dt });
}

/** The cheapest way on goes through a building: walk up and smash it. */
function smashThrough(t: Turn, cell: number, c: { x: number; y: number }) {
  const { sim, e, def, reach, dt } = t;
  const bid = sim.map.owner[cell];
  if (rectDist(sim.map.buildings[bid].rect, e.x, e.y) <= reach) return hitBuilding(t, bid);
  sim.moveToward(e, c, { speed: def.speed * chilled(e), dt });
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

const isRubble = (sim: DefendSim, id: number) => sim.hp[id] <= 0 || !sim.built[id];
const isHouse = (sim: DefendSim, bid: number) => bid >= 0 && sim.map.buildings[bid].kind === "house";

function hitBuilding({ sim, e, def }: Turn, id: number) {
  if (e.cd > 0) return;
  e.cd = def.cooldown;
  sim.damageBuilding(id, def.damage);
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
  const inside = (x: number, y: number) => {
    const ux = x - e.x, uy = y - e.y;
    const along = ux * dx + uy * dy;
    return along >= 0 && along <= 5 && Math.abs(ux * dy - uy * dx) <= 0.35 + along * 0.45;
  };
  for (const soldier of sim.soldiers) if (soldier.hp > 0 && !soldier.guard && inside(soldier.x, soldier.y)) {
    soldier.hp -= ENEMIES.dragon.damage;
    soldier.flash = 0.12;
  }
  for (const civilian of sim.civilians) if (civilian.hp > 0 && inside(civilian.x, civilian.y)) {
    civilian.hp -= ENEMIES.dragon.damage;
    civilian.flash = 0.12;
  }
  for (const b of sim.map.buildings) {
    const near = nearestPoint(b.rect, e.x, e.y);
    if (sim.intact(b) && inside(near.x, near.y)) sim.damageBuilding(b.id, ENEMIES.dragon.damage);
  }
  return true;
}
