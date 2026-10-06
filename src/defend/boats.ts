/** Magic boats: the Enchanted Skiff, Spellbound Sloop, Arcane Galleon and
 * Deluge Ark (`BoatDef` in `catalog.ts`). A boat sails straight through the
 * ground toward the keep, conjuring a pool of water round its hull that it
 * leaves behind as a trail (`sim.floods`), each pool holding a while and
 * then drying up from its edge. The four small boats have decorative
 * pools only: ordinary bow damage, with no water gameplay effects.
 *
 * - Every house and structure the boat's water reaches is sunk at once
 *   (`sim.sink`), the water spreading over the whole of it: it goes under
 *   and leaves its rubble when the water dries.
 *   The Arcane Galleon sinks wall stones too, the Deluge Ark the keep. What
 *   a boat can't sink it rams with its bow until it breaks.
 * - The water hurts no one but fire mages, who sputter out in it.
 * - It puts out fires: burning ground in it goes out, a fireball landing in
 *   it fizzles, and fire can't burn anyone standing in it.
 * - It stops splash damage: a blast centred in it fizzles, and a blast
 *   beside it spares whoever stands in it, enemy or defender.
 *
 * A run without boats has no floods, so every check here is skipped and
 * the battle plays exactly as before. Battle code: exact arithmetic only
 * (`src/exact.ts`). */
import { dist, sq } from "../exact.ts";
import { ENEMIES, type BoatDef } from "./catalog.ts";
import { enemyDamage, enemySpeed } from "./enemy-abilities.ts";
import { CELLS_H, CELLS_W, SUB, cellIndex } from "./grid.ts";
import { cellAt, center, rectDist } from "./pathing.ts";
import type { Building } from "./citygen.ts";
import { lureOf } from "./bait.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import { chilled } from "./wizard.ts";

/** A pool of a boat's water, dropped at (x, y) with the boat's water radius
 * `r`: it holds for the first `HOLD` of its `life` seconds, then dries up
 * from its edge. `boat` is the id of the boat that made it. */
export type Flood = { x: number; y: number; r: number; t: number; life: number; boat: number; decorative?: boolean; frozen?: boolean; melted?: boolean };
/** A building going under, `t` seconds ago (for the renderer). */
export type Sinking = { building: number; t: number };

/** Seconds between the pools a boat drops as it sails. */
const TRAIL_GAP = 0.25;
/** Seconds a pool lasts, and the share of that it holds before drying. */
export const FLOOD_LIFE = 8;
export const HOLD = 0.4;
/** Seconds a sinking building is drawn going under. */
export const SINK_SECONDS = 1.4;
/** How long the sim keeps a sinking (its ripples outlast the building). */
const SINK_KEEP = 3;
/** Damage a second the water does to a fire mage standing in it. */
export const MAGE_SOAK = 10;

/** A pool's radius now: whole while it holds, then shrinking to nothing. */
export function floodRadius(f: Flood) {
  if (f.frozen) return f.r;
  const hold = f.life * HOLD;
  return f.t <= hold ? f.r : f.r * Math.max(0, (f.life - f.t) / (f.life - hold));
}

/** Pools filed by the board's tiles their full reach touches, so asking
 * whether a point is wet looks only at the pools of its own tile. A pool
 * only shrinks, so its tiles hold for its life; the index is rebuilt when
 * the sim's list of pools is replaced and topped up as pools are added. */
type FloodIndex = { floods: Flood[]; n: number; tiles: Flood[][] };
const TILES_W = Math.ceil(CELLS_W / SUB), TILES_H = Math.ceil(CELLS_H / SUB);
const indexes = new WeakMap<DefendSim, FloodIndex>();
/** Keep one decorative pool refreshed while a small boat is stopped at a
 * wall. Moving boats still drop a trail, and abandoned pools dry normally. */
const decorativePools = new WeakMap<Enemy, Flood>();
const tileOf = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(v / SUB)));

function floodIndex(sim: DefendSim) {
  let ix = indexes.get(sim);
  if (!ix || ix.floods !== sim.floods || ix.n > sim.floods.length) {
    ix = { floods: sim.floods, n: 0, tiles: Array.from({ length: TILES_W * TILES_H }, () => []) };
    indexes.set(sim, ix);
  }
  for (; ix.n < sim.floods.length; ix.n++) {
    const f = sim.floods[ix.n];
    for (let ty = tileOf(f.y - f.r, TILES_H); ty <= tileOf(f.y + f.r, TILES_H); ty++)
      for (let tx = tileOf(f.x - f.r, TILES_W); tx <= tileOf(f.x + f.r, TILES_W); tx++) ix.tiles[ty * TILES_W + tx].push(f);
  }
  return ix;
}

/** Whether (x, y) is under gameplay water. Decorative wakes are drawn but
 * never hurt mages, douse fire, fizzle blasts or shelter units. */
export function wetAt(sim: DefendSim, x: number, y: number) {
  if (!sim.floods.length) return false;
  for (const f of floodIndex(sim).tiles[tileOf(y, TILES_H) * TILES_W + tileOf(x, TILES_W)]) {
    if (f.frozen || f.decorative) continue;
    const r = floodRadius(f);
    if (sq(f.x - x) + sq(f.y - y) <= r * r) return true;
  }
  return false;
}

/** Ice includes the small boats' wakes, but never standing masonry. */
export function iceAt(sim: DefendSim, x: number, y: number) {
  if (x < 0 || y < 0 || x >= CELLS_W || y >= CELLS_H || sim.solid[cellAt(x, y)]) return false;
  return sim.floods.length > 0 && floodIndex(sim).tiles[tileOf(y, TILES_H) * TILES_W + tileOf(x, TILES_W)]
    .some(f => f.frozen && sq(f.x - x) + sq(f.y - y) <= sq(f.r));
}

/** Any ice overlapping the cell prevents rebuilding, including a thin edge. */
export function icyCell(sim: DefendSim, cell: number) {
  const x = cell % CELLS_W, y = Math.floor(cell / CELLS_W);
  return sim.floods.length > 0 && floodIndex(sim).tiles[tileOf(y + .5, TILES_H) * TILES_W + tileOf(x + .5, TILES_W)]
    .some(f => f.frozen && sq(Math.max(x - f.x, 0, f.x - x - 1)) + sq(Math.max(y - f.y, 0, f.y - y - 1)) < sq(f.r));
}

/** Heat thaws intersecting sheets. Meltwater gets a fresh drying lifetime
 * and never immediately refreezes, even while it is still snowing. */
export function meltIce(sim: DefendSim, x: number, y: number, r: number) {
  let melted = false;
  for (const f of sim.floods) if (f.frozen && sq(f.x - x) + sq(f.y - y) < sq(f.r + r)) {
    f.frozen = false; f.melted = true; f.t = 0; f.life = FLOOD_LIFE;
    melted = true;
  }
  if (melted) douse(sim, x, y, r);
  return melted;
}

function addPool(sim: DefendSim, pool: Flood) {
  if (sim.cold) {
    pool.frozen = true;
    // Ice is permanent: stationary and tightly overlapping wakes must not
    // accumulate forever. Quantized positions bound retained sheets per boat size.
    pool.x = Math.round(pool.x * 2) / 2;
    pool.y = Math.round(pool.y * 2) / 2;
    const nearby = floodIndex(sim).tiles[tileOf(pool.y, TILES_H) * TILES_W + tileOf(pool.x, TILES_W)];
    if (nearby.some(f => f.frozen && f.x === pool.x && f.y === pool.y && f.r >= pool.r)) return;
  }
  sim.floods.push(pool);
}

/** Whether a boat's water sinks building `b`. */
export function sinks(boat: BoatDef, b: Building) {
  if (boat.decorativeWater) return false;
  if (b.kind === "keep") return !!boat.keep;
  if (b.kind === "wall" || b.kind === "gate" || b.kind === "wallBallista") return !!boat.walls;
  return true;
}

/** One boat's step: it sinks what its water reaches, drops a pool, then
 * sails on toward the keep, or rams what it can't sink. */
export function stepBoat(sim: DefendSim, e: Enemy, dt: number) {
  const def = ENEMIES[e.kind], boat = def.boat!;
  for (const b of boat.decorativeWater ? [] : near(sim, e, boat.water))
    if (sim.built[b.id] > 0 && sinks(boat, b) && rectDist(b.rect, e.x, e.y) <= boat.water) {
      // The water swallows the whole of it.
      const r = b.rect;
      addPool(sim, { x: r.x + r.w / 2, y: r.y + r.h / 2, r: dist(r.w, r.h) / 2 + 0.3, t: 0, life: FLOOD_LIFE, boat: e.id });
      sim.sink(b.id);
    }
  if (sim.lost || sim.hp[sim.keepId] <= 0) return;
  e.abilityT = (e.abilityT ?? 0) - dt;
  if (e.abilityT <= 0) {
    e.abilityT += TRAIL_GAP;
    const previous = boat.decorativeWater ? decorativePools.get(e) : undefined;
    if (previous && previous.t < previous.life && previous.x === e.x && previous.y === e.y) previous.t = 0;
    else {
      const pool: Flood = { x: e.x, y: e.y, r: boat.water, t: 0, life: FLOOD_LIFE, boat: e.id, ...(boat.decorativeWater ? { decorative: true } : {}) };
      addPool(sim, pool);
      if (boat.decorativeWater) decorativePools.set(e, pool);
    }
  }
  // Monster bait calls a boat too: the nearest stack while any stands.
  const keep = sim.baits.length ? lureOf(sim, e.x, e.y) : sim.keep, half = def.size / 2;
  if (rectDist(keep.rect, e.x, e.y) <= half + 0.4) return ram(sim, e, keep.id);
  const goal = center(keep.rect);
  let dx = goal.x - e.x, dy = goal.y - e.y;
  const len = dist(dx, dy);
  if (len < 0.02) return;
  dx /= len;
  dy /= len;
  e.facing = { x: dx, y: dy };
  // The bow meets anything solid first: a wall it can't sink stops it.
  const bx = e.x + dx * half, by = e.y + dy * half;
  if (bx > 0 && by > 0 && bx < CELLS_W && by < CELLS_H) {
    const cell = cellAt(bx, by), owner = sim.map.owner[cell];
    if (sim.solid[cell] && owner >= 0 && !sinks(boat, sim.map.buildings[owner])) return ram(sim, e, owner);
  }
  const step = Math.min(len, enemySpeed(sim, e) * chilled(e) * dt);
  e.x += dx * step;
  e.y += dy * step;
}

/** The buildings with a cell within `r` cells' box of the boat, each once,
 * in the order their cells are met. */
function near(sim: DefendSim, e: Enemy, r: number): Building[] {
  const out: Building[] = [], seen = new Set<number>();
  const x0 = Math.max(0, Math.floor(e.x - r)), x1 = Math.min(CELLS_W - 1, Math.floor(e.x + r));
  const y0 = Math.max(0, Math.floor(e.y - r)), y1 = Math.min(CELLS_H - 1, Math.floor(e.y + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const id = sim.map.owner[cellIndex(x, y)];
      if (id >= 0 && !seen.has(id)) {
        seen.add(id);
        out.push(sim.map.buildings[id]);
      }
    }
  return out;
}

/** The bow strikes a building it can't sink. */
function ram(sim: DefendSim, e: Enemy, id: number) {
  if (e.cd > 0) return;
  e.cd = ENEMIES[e.kind].cooldown;
  sim.damageBuilding(id, enemyDamage(sim, e));
  sim.effects.push({ kind: "steam", x: e.x + (e.facing?.x ?? 0) * ENEMIES[e.kind].size * 0.5, y: e.y + (e.facing?.y ?? 1) * ENEMIES[e.kind].size * 0.5, t: 0, r: 0.6 });
}

/** The water ages and dries; fire mages in it sputter, burning ground in it
 * goes out; sinking buildings settle. */
export function stepFloods(sim: DefendSim, dt: number) {
  ageWater(sim, dt);
  if (!sim.floods.length) return;
  for (const b of sim.blazes) meltIce(sim, b.x, b.y, b.r);
  for (const s of sim.soldiers)
    if (s.kind === "mage" && s.hp > 0 && wetAt(sim, s.x, s.y)) {
      s.hp -= MAGE_SOAK * dt;
      s.flash = 0.12;
    }
  sim.blazes = sim.blazes.filter((b) => {
    if (!wetAt(sim, b.x, b.y)) return true;
    douse(sim, b.x, b.y, b.r);
    return false;
  });
}

/** The water dries and sinking buildings settle (also after a lost run,
 * so the water left over the keep dries off its rubble). */
export function ageWater(sim: DefendSim, dt: number) {
  if (sim.sinkings.length) {
    for (const s of sim.sinkings) s.t += dt;
    sim.sinkings = sim.sinkings.filter((s) => s.t < SINK_KEEP);
  }
  if (!sim.floods.length) return;
  for (const f of sim.floods) {
    if (sim.cold && !f.frozen && !f.melted) { f.r = floodRadius(f); f.frozen = true; }
    if (!f.frozen) f.t += dt;
  }
  sim.floods = sim.floods.filter((f) => f.frozen || f.t < f.life);
}

/** A hiss of steam where fire or a blast met the water. */
export function douse(sim: DefendSim, x: number, y: number, r: number) {
  sim.effects.push({ kind: "steam", x, y, t: 0, r: Math.max(0.5, r) });
}

/** Whether a blast at (x, y) fizzles in the water (and hisses if so). */
export function fizzles(sim: DefendSim, x: number, y: number, r: number) {
  sim.iceBlast(x, y, r);
  meltIce(sim, x, y, r);
  if (!sim.floods.length || !wetAt(sim, x, y)) return false;
  douse(sim, x, y, r);
  return true;
}

/** Whether someone at (x, y) stands in water, sheltered from splash and fire. */
export const sheltered = (sim: DefendSim, x: number, y: number) => sim.floods.length > 0 && wetAt(sim, x, y);
