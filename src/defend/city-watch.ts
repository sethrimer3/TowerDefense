/** DEFEND city watch: the keep's guards. In a Defend battle (`Bonuses.watch`,
 * which only the Defend page sets) the keep keeps `guards` of them, training
 * one back every `drill` seconds while it stands. They fight like swordsmen
 * (`troops.ts`'s `stepSwordsman`, with spear numbers from `WATCHMAN` and the
 * keep's City watch ranks) anywhere in the city, and with nothing to fight
 * they walk the streets from one spot to the next. A battle starts with the
 * watch already out, at the places the build phase's patrolling watchmen
 * (`city-life.ts`) stood (`musterWatch`). Nothing draws from the random
 * stream: patrol spots are hashed from the guard's id. */
import { WATCHMAN } from "./catalog.ts";
import { CELL_COUNT, cellInBounds, hash01 } from "./grid.ts";
import { cellAt, cellCenter, findPath, type Point } from "./pathing.ts";
import type { DefendSim, Soldier } from "./sim.ts";

/** How fast a guard walks its rounds (cells a second), and how long it
 * stands at each spot before the next. */
export const WATCH_PATROL = { speed: 0.8, pause: 1, linger: 3 } as const;

type WatchState = { training: number; mustered: boolean; streets: number[]; version: number };
const STATE = new WeakMap<DefendSim, WatchState>();
type Round = { path: number[]; until: number; turn: number; goal: Point | null };
const ROUNDS = new WeakMap<Soldier, Round>();

function stateOf(sim: DefendSim): WatchState {
  let st = STATE.get(sim);
  if (!st) STATE.set(sim, (st = { training: 0, mustered: false, streets: [], version: -1 }));
  return st;
}

/** The keep's guards still on their feet. */
export const guardsOf = (sim: DefendSim) => sim.soldiers.filter((s) => s.kind === "watchman" && s.hp > 0);

function recruit(sim: DefendSim, at: Point) {
  const w = sim.bonuses.watch!, hp = WATCHMAN.hp * w.hp * sim.bonuses.troopHp;
  sim.soldiers.push({
    id: sim.newId(), kind: "watchman", home: sim.keepId, x: at.x, y: at.y,
    hp, maxHp: hp, damage: WATCHMAN.damage * w.damage * sim.bonuses.troopDamage,
    cd: 0, target: -1, path: [], thinkT: 0, flash: 0,
  });
}

function keepDoor(sim: DefendSim): Point | null {
  const door = sim.doorOf(sim.keep);
  return door < 0 ? null : cellCenter(door);
}

/** Puts the whole watch out at once: one guard at each of `points` (where the
 * build phase's watchmen stood) that is open ground, the rest at the keep's
 * door. Only before the watch has mustered; a battle without it musters
 * everyone at the door on its first step. */
export function musterWatch(sim: DefendSim, points: readonly Point[] = []) {
  const w = sim.bonuses.watch, st = stateOf(sim);
  if (!w || st.mustered) return;
  st.mustered = true;
  st.training = w.drill * sim.bonuses.drill;
  if (!sim.intact(sim.keep)) return;
  const door = keepDoor(sim);
  for (let n = 0; n < w.guards; n++) {
    const p = points[n];
    const open = p && cellInBounds(p.x, p.y) && !sim.ownSolid[cellAt(p.x, p.y)];
    const at = open ? { x: p.x, y: p.y } : door;
    if (at) recruit(sim, at);
  }
}

/** Each step: musters the watch, then trains a fallen guard back every
 * `drill` seconds while the keep stands. */
export function stepCityWatch(sim: DefendSim, dt: number) {
  const w = sim.bonuses.watch;
  if (!w) return;
  const st = stateOf(sim);
  if (!st.mustered) musterWatch(sim);
  const drill = w.drill * sim.bonuses.drill;
  if (!sim.intact(sim.keep) || guardsOf(sim).length >= w.guards) {
    st.training = drill;
    return;
  }
  st.training -= dt;
  if (st.training > 0) return;
  st.training = drill;
  const door = keepDoor(sim);
  if (door) recruit(sim, door);
}

/** The open city cells a guard may walk to, cached per map version. */
function streets(sim: DefendSim) {
  const st = stateOf(sim);
  if (st.version !== sim.mapVersion) {
    st.version = sim.mapVersion;
    st.streets = [];
    for (let i = 0; i < CELL_COUNT; i++) if (sim.map.city[i] && !sim.ownSolid[i]) st.streets.push(i);
  }
  return st.streets;
}

/** With nothing to fight: sets `s.path` along its round, standing a moment
 * at each spot before choosing the next. */
export function patrolPath(sim: DefendSim, s: Soldier) {
  let r = ROUNDS.get(s);
  if (!r) ROUNDS.set(s, (r = { path: [], until: 0, turn: 0, goal: null }));
  // Still on its way, from where the path goes on (not pulled off it by a fight).
  if (r.path.length && !sim.ownSolid[r.path[0]]) {
    const next = cellCenter(r.path[0]);
    if (Math.abs(next.x - s.x) <= 1.5 && Math.abs(next.y - s.y) <= 1.5) {
      s.path = r.path;
      return;
    }
  }
  if (r.goal) {
    // Back from a fight, or blocked: on to the same spot.
    const path = r.path.length ? findPath(sim.ownSolid, s, r.goal, { maxCost: 1e9, maxNodes: CELL_COUNT }) : null;
    if (path?.length) {
      s.path = r.path = path;
      return;
    }
    r.goal = null;
    r.until = sim.time + WATCH_PATROL.pause + hash01(s.id, r.turn, 4128) * WATCH_PATROL.linger;
  }
  s.path = r.path = [];
  if (sim.time < r.until) return;
  const cells = streets(sim);
  for (let k = 0; k < 3 && cells.length; k++) {
    const goal = cellCenter(cells[Math.floor(hash01(s.id, r.turn++, 4127) * cells.length)]);
    const path = findPath(sim.ownSolid, s, goal, { maxCost: 1e9, maxNodes: CELL_COUNT });
    if (!path?.length) continue;
    s.path = r.path = path;
    r.goal = goal;
    return;
  }
  r.until = sim.time + WATCH_PATROL.pause;
}
