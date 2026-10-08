import { buildingPaths } from "../cards.ts";
import { bannerDamage } from "./war-banner.ts";
import { enemySize } from "./catalog.ts";
/** DEFEND troops: barracks keep their garrison topped up; swordsmen chase
 * enemies within their leash of the barracks (anywhere in the city at the
 * last Patrol routes level) and head home when there's nothing to fight;
 * archers roam the streets, shooting whatever comes within sight, or with
 * Hunter's instinct path toward the nearest enemy in the city. A Mage
 * Guild trains fire mages the same way (`mages.ts`), a Valkyrie palace
 * valkyries (`valkyries.ts`), and a dark wizard keep its one dark wizard
 * (`dark-wizards.ts`). */
import { dist, sq } from "../exact.ts";
import {
  ARCHER_UNIT,
  archerUnitRange,
  DARK_WIZARD,
  ENEMIES,
  FIRE_MAGE,
  fireballDamage,
  SOLDIER,
  soldierCap,
  soldierLeash,
  soldierScale,
  trainSeconds,
  VALKYRIE,
} from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { CELL_COUNT, cellX, cellY } from "./grid.ts";
import { cellAt, cellCenter, center, findPath, nearest, type PathLimits, type Point } from "./pathing.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";
import { answerBanner, MARCH_SIGHT } from "./war-banner.ts";
import { ASSASSIN, CRUSADE, RANGERS, SKIRMISH, pathRank } from "../knowledge-paths.ts";

/** The barracks' Study path and rank (`knowledge-paths.ts`): each 0 unless chosen. */
const paths = (sim: DefendSim, home: number) => {
  const p = buildingPaths(sim, sim.map.buildings[home]);
  return {
    crusade: pathRank(p, "barracks", "crusaders"), assassin: pathRank(p, "barracks", "assassins"),
    ranger: pathRank(p, "archerBarracks", "rangers"), skirmish: pathRank(p, "archerBarracks", "skirmishers"),
  };
};
/** A swordsman's HP and damage, as shares of his own, by his barracks' path. */
function swordStats(sim: DefendSim, home: number) {
  const { crusade, assassin } = paths(sim, home);
  return { hp: assassin ? ASSASSIN.hp : CRUSADE.hp[crusade], damage: crusade >= 3 ? CRUSADE.damage : 1 };
}
/** How fast a swordsman walks. */
function swordSpeed(sim: DefendSim, home: number) {
  const { crusade, assassin } = paths(sim, home);
  return SOLDIER.speed * (crusade ? CRUSADE.speed : assassin ? ASSASSIN.speed : 1);
}

/** Trains one troop at a time per barracks, while it's standing and below
 * its garrison cap. */
export class Barracks {
  /** Seconds until each barracks' next recruit is ready. */
  readonly training = new Map<number, number>();

  step(sim: DefendSim, dt: number) {
    const cap = soldierCap(sim.levels.barracksCapacity);
    for (const b of sim.map.buildings) {
      if (!isBarracks(b) || !sim.intact(b)) continue;
      if (this.drilled(sim, b, b.kind === "darkKeep" ? DARK_WIZARD.garrison : cap, dt)) this.recruit(sim, b);
    }
  }

  /** Counts down the barracks' drill; true when a recruit is ready. A full
   * garrison keeps the clock at a whole drill. */
  private drilled(sim: DefendSim, b: Building, cap: number, dt: number) {
    const slow = b.kind === "darkKeep" ? DARK_WIZARD.drill : 1;
    const drill = () => trainSeconds(sim.levels.barracksTraining) * sim.bonuses.drill * slow;
    const alive = sim.soldiers.filter((s) => s.home === b.id).length;
    if (alive >= cap) {
      this.training.set(b.id, drill());
      return false;
    }
    const t = (this.training.get(b.id) ?? 0) - dt;
    if (t > 0) {
      this.training.set(b.id, t);
      return false;
    }
    this.training.set(b.id, drill());
    return true;
  }

  private recruit(sim: DefendSim, b: Building) {
    const door = sim.doorOf(b);
    if (door < 0) return;
    const kind = TRAINS[b.kind] ?? "sword";
    const scale = soldierScale(sim.levels.soldierArms);
    const stats = kind === "archer" ? ARCHER_UNIT : kind === "mage" ? { ...FIRE_MAGE, damage: fireballDamage(sim.levels.mageFireball ?? 0) } : kind === "valkyrie" ? VALKYRIE : kind === "darkWizard" ? DARK_WIZARD : SOLDIER;
    const at = cellCenter(door);
    const path = kind === "sword" ? swordStats(sim, b.id) : { hp: 1, damage: 1 };
    sim.soldiers.push({
      id: sim.newId(),
      kind,
      home: b.id,
      x: at.x,
      y: at.y,
      hp: stats.hp * scale * sim.bonuses.troopHp * path.hp,
      maxHp: stats.hp * scale * sim.bonuses.troopHp * path.hp,
      damage: stats.damage * scale * sim.bonuses.troopDamage * path.damage,
      cd: 0,
      target: -1,
      path: [],
      thinkT: 0,
      flash: 0,
    });
  }
}

/** What each troop building trains. */
const TRAINS: Partial<Record<Building["kind"], Soldier["kind"]>> = { barracks: "sword", archerBarracks: "archer", mageGuild: "mage", valkyriePalace: "valkyrie", darkKeep: "darkWizard" };
const isBarracks = (b: Building) => b.kind in TRAINS;

const byDistanceFrom = (p: Point) => (a: Enemy, b: Enemy) => sq(a.x - p.x) + sq(a.y - p.y) - (sq(b.x - p.x) + sq(b.y - p.y));
const inCity = (sim: DefendSim, e: Enemy) => sim.map.city[cellAt(e.x, e.y)] === 1;
/** Search limits for chasing across the whole city. */
const CITYWIDE: PathLimits = { maxCost: 1e9, maxNodes: CELL_COUNT };

// ── Swordsmen ──────────────────────────────────────────────────────────────

/** Where a swordsman may fight: within its leash of the barracks, or
 * anywhere in the city once patrols go citywide. */
class Patrol {
  readonly home: Building;
  readonly hc: Point;
  readonly leash: number;
  readonly citywide: boolean;

  constructor(
    private sim: DefendSim,
    s: Soldier,
  ) {
    this.home = sim.map.buildings[s.home];
    this.hc = center(this.home.rect);
    // Shadows (Assassins III) hunt anywhere in the city.
    this.leash = paths(sim, s.home).assassin >= 3 ? Infinity : soldierLeash(sim.levels.soldierReach ?? 0);
    this.citywide = !Number.isFinite(this.leash);
  }

  covers(e: Enemy) {
    const { hc, leash } = this;
    return this.citywide ? inCity(this.sim, e) : sq(e.x - hc.x) + sq(e.y - hc.y) <= sq(leash);
  }

  /** Enemies it may go after, nearest `s` first. */
  candidates(s: Soldier) {
    const all = this.citywide ? this.sim.enemies.filter((e) => this.covers(e)) : this.sim.enemiesNear(this.hc.x, this.hc.y, this.leash);
    return all.sort(byDistanceFrom(s)).slice(0, 3);
  }

  get limits(): PathLimits {
    return this.citywide ? CITYWIDE : { maxCost: this.leash * 3 };
  }
}

export function stepSwordsman(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  // Crusaders' field dressing.
  if (paths(sim, s.home).crusade >= 2) s.hp = Math.min(s.maxHp, s.hp + CRUSADE.heal * dt);
  if (sim.warBanner) return rally(sim, s, dt);
  const patrol = new Patrol(sim, s);
  let target = sim.enemies.find((e) => e.id === s.target && e.hp > 0) ?? null;
  if (target && !patrol.covers(target)) target = null;
  if (target && inSwordReach(s, target)) return strike(sim, s, target);
  if (s.thinkT <= 0) target = replan(sim, s, patrol);
  sim.followPath(s, target, swordSpeed(sim, s.home), dt);
}

/** Answering the war banner: strike whatever is in reach, else close on
 * what is near or march to the banner (no leash while it stands). */
function rally(sim: DefendSim, s: Soldier, dt: number) {
  const near = sim.enemiesNear(s.x, s.y, SOLDIER.reach + 1).find((e) => inSwordReach(s, e));
  if (near) return strike(sim, s, near);
  answerBanner(sim, sim.warBanner!, s, swordSpeed(sim, s.home), dt, MARCH_SIGHT);
}

const inSwordReach = (s: Soldier, e: Enemy) => dist(e.x - s.x, e.y - s.y) <= SOLDIER.reach + enemySize(e) / 2;

function strike(sim: DefendSim, s: Soldier, e: Enemy) {
  if (s.cd > 0) return;
  const assassin = paths(sim, s.home).assassin;
  s.cd = assassin >= 2 ? SOLDIER.cooldown * ASSASSIN.cooldown : SOLDIER.cooldown;
  if (!assassin) return void sim.hurtEnemy(e, bannerDamage(sim, s), true, "melee", s);
  // Assassins count their strikes: every few is critical (no dice, so a
  // replay still plays the same).
  s.strikes = (s.strikes ?? 0) + 1;
  const crit = s.strikes % ASSASSIN.every[assassin] === 0;
  sim.hurtEnemy(e, crit ? bannerDamage(sim, s) * ASSASSIN.crit : bannerDamage(sim, s), true, "melee", s);
  if (crit) sim.effects.push({ kind: "spark", x: e.x, y: e.y, t: 0, r: 0.5 });
}

/** Twice a second: path to the nearest of up to three reachable enemies, or
 * back to the barracks door when there are none. */
function replan(sim: DefendSim, s: Soldier, patrol: Patrol): Enemy | null {
  s.thinkT = 0.5;
  s.path = [];
  const target = pathToFirst(sim, s, patrol.candidates(s), patrol.limits);
  s.target = target ? target.id : -1;
  if (!target) returnToDoor(sim, s, patrol.home);
  return target;
}

/** Sets `s.path` to the first enemy that has a route, and returns it. */
function pathToFirst(sim: DefendSim, s: Soldier, enemies: Enemy[], limits: PathLimits): Enemy | null {
  for (const e of enemies) {
    const path = findPath(sim.ownSolid, s, e, limits);
    if (!path) continue;
    s.path = path;
    return e;
  }
  return null;
}

function returnToDoor(sim: DefendSim, s: Soldier, home: Building) {
  const door = sim.doorOf(home);
  if (door < 0) return;
  // (Subtracting the half cell separately keeps the original rounding.)
  const away = dist(s.x - cellX(door) - 0.5, s.y - cellY(door) - 0.5);
  if (away > 1.2) s.path = findPath(sim.ownSolid, s, cellCenter(door), { maxCost: 400 }) ?? [];
}

// ── Archers ────────────────────────────────────────────────────────────────

/** Archers shoot the nearest enemy in sight first; otherwise they hunt
 * (with Hunter's instinct) or stroll to a random street. */
export function stepArcher(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  const { ranger, skirmish } = paths(sim, s.home);
  const range = archerUnitRange(sim.levels.archerSight ?? 0) + (ranger ? RANGERS.sight : 0);
  const speed = ARCHER_UNIT.speed * (skirmish >= 2 ? SKIRMISH.speed : 1);
  const near = nearest(sim.enemiesNear(s.x, s.y, range), s, range * range, true);
  if (near) {
    shoot(sim, s, near, range);
    // Skirmishers keep walking while they shoot.
    if (skirmish < 2) return;
  }
  if (sim.warBanner) return answerBanner(sim, sim.warBanner, s, speed, dt);
  if ((sim.levels.archerHunt ?? 0) > 0 && s.thinkT <= 0) hunt(sim, s);
  if (idle(s) && sim.streets.length) stroll(sim, s);
  sim.followPath(s, null, speed, dt);
}

/** No route to walk and done thinking. */
const idle = (s: Soldier) => !s.path.length && s.thinkT <= 0;

function shoot(sim: DefendSim, s: Soldier, e: Enemy, range: number) {
  if (s.cd > 0) return;
  const { ranger, skirmish } = paths(sim, s.home);
  s.cd = ARCHER_UNIT.cooldown * SKIRMISH.reload[skirmish];
  const damage = ranger >= 2 ? bannerDamage(sim, s) * RANGERS.damage : bannerDamage(sim, s);
  const loose = (t: Enemy) => sim.arrows.push({ x: s.x, y: s.y, origin: { x: s.x, y: s.y, attacker: s.id }, target: t.id, damage, tx: t.x, ty: t.y, life: 2 });
  loose(e);
  // Rangers' twin shot: a second arrow at the next nearest in sight.
  if (ranger >= 3) {
    const next = sim.enemiesNear(s.x, s.y, range).filter((o) => o !== e && o.hp > 0 && sq(o.x - s.x) + sq(o.y - s.y) <= range * range).sort(byDistanceFrom(s))[0];
    if (next) loose(next);
  }
}

/** Path toward the nearest of up to three enemies in the city. */
function hunt(sim: DefendSim, s: Soldier) {
  s.thinkT = 0.6;
  const prey = sim.enemies.filter((e) => e.hp > 0 && inCity(sim, e)).sort(byDistanceFrom(s)).slice(0, 3);
  const e = pathToFirst(sim, s, prey, CITYWIDE);
  if (e) s.target = e.id;
}

/** Nothing to hunt (or no instinct): pick a street and stroll to it. */
function stroll(sim: DefendSim, s: Soldier) {
  s.thinkT = 0.5 + sim.rand() * 1.5;
  s.target = -1;
  const goal = sim.streets[Math.floor(sim.rand() * sim.streets.length)];
  s.path = findPath(sim.ownSolid, s, cellCenter(goal), CITYWIDE) ?? [];
}
