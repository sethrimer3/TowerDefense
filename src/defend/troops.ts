import { buildingPaths } from "../specializations.ts";
import { bannerDamage } from "./war-banner.ts";
import { enemySize } from "./catalog.ts";
/** DEFEND troops: barracks keep their garrison topped up; swordsmen (and
 * the Melee Guild's brawlers, with their fists) chase
 * enemies within their leash of the barracks (anywhere in the city at the
 * last Patrol routes level) and head home when there's nothing to fight;
 * archers roam the streets, shooting whatever comes within sight, or with
 * Hunter's instinct path toward the nearest enemy in the city; the Ranged
 * Guild's stone throwers, the gunner line (pistols, muskets, machine guns,
 * Gatlings, rockets), the snipers and the javelineers roam the same way
 * with shots of their own. The spearmen line's spearmen, hoplites and
 * lancers chase like swordsmen, striking through `spears.ts`. A Mage
 * Guild trains fire mages the same way (`mages.ts`), a Valkyrie palace
 * valkyries (`valkyries.ts`), a dark wizard keep its one dark wizard
 * (`dark-wizards.ts`), and the Hero's hall its one Hero (`hero.ts`). */
import { dist, sq } from "../exact.ts";
import {
  ARCHER_UNIT,
  archerUnitRange,
  ASSASSIN_UNIT,
  BRAWLER,
  GATLING_GUNNER,
  JAVELINEER,
  RAIL_SNIPER,
  GUNNER,
  MACHINE_GUNNER,
  MUSKETEER,
  ROCKETEER,
  SLINGER,
  SNIPER,
  DARK_WIZARD,
  ENEMIES,
  FIRE_MAGE,
  fireballDamage,
  HERO,
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
import { BERSERK, CRUSADE, HALBERD, RANGERS, SKIRMISH, VOLLEY, pathRank } from "../knowledge-paths.ts";
import { bigGame, bulletOf, clearShot, pierceOf, sniperRange, sniperReload } from "./snipers.ts";
import { railShot, squadSize } from "./revolutionary.ts";
import { bayonetTarget, charges, grenadeOf, musketDamage, musketRange, musketReload, musketSpeed, thrust, toughestInReach, volleyTargets } from "./muskets.ts";
import { gunDamage, gunExtras, gunHp, gunRange, gunReload, gunSpeed, isGun, gunShot, rocketOf, type Gun } from "./gunners.ts";
import { cloudRank, diveIn, hostDrill, hostGarrison, musterPoint } from "./sky-palace.ts";
import { holdLine, isSpear, javelinExtras, javelinOf, javelinRange, javelinReload, spearLeash, spearReach, spearSpeed, spearStrike, SPEARS } from "./spears.ts";
import { heroHp } from "./hero.ts";
import { assassinHp, assassinStrike, headhunter, huntReach, recruitState, stepCloak, toughestFirst } from "./assassins.ts";

/** The barracks' Study path and rank (`knowledge-paths.ts`): each 0 unless chosen. */
const paths = (sim: DefendSim, home: number) => {
  const p = buildingPaths(sim, sim.map.buildings[home]);
  return {
    crusade: pathRank(p, "barracks", "crusaders"),
    berserk: pathRank(p, "barracks", "berserkers"), halberd: pathRank(p, "barracks", "halberdiers"),
    ranger: pathRank(p, "archerBarracks", "rangers"), skirmish: pathRank(p, "archerBarracks", "skirmishers"),
  };
};
/** A swordsman's HP and damage, as shares of his own, by his barracks' path. */
function swordStats(sim: DefendSim, home: number) {
  const { crusade, halberd } = paths(sim, home);
  return { hp: CRUSADE.hp[crusade], damage: crusade >= 3 ? CRUSADE.damage : halberd ? HALBERD.damage : 1 };
}
/** How fast a swordsman (or brawler) walks. */
function swordSpeed(sim: DefendSim, s: Soldier) {
  if (isSpear(s.kind)) return spearSpeed(sim, s as Soldier & { kind: typeof s.kind });
  return melee(s).speed * (s.kind === "sword" && paths(sim, s.home).crusade ? CRUSADE.speed : 1);
}
/** A melee troop's own numbers: a brawler's fists, an assassin's knives,
 * the spear line's spears, else a swordsman's blade. */
const melee = (s: Soldier) => (s.kind === "brawler" ? BRAWLER : s.kind === "assassin" ? ASSASSIN_UNIT : isSpear(s.kind) ? SPEARS[s.kind] : SOLDIER);
/** A ranged troop's own numbers, besides an archer's. */
const RANGED = { slinger: SLINGER, sniper: SNIPER, musketeer: MUSKETEER, gunner: GUNNER, machineGunner: MACHINE_GUNNER, gatlingGunner: GATLING_GUNNER, rocketeer: ROCKETEER, railSniper: RAIL_SNIPER, javelineer: JAVELINEER };
/** What each ranged troop looses: an arrow (none), a stone, a bullet, a ball or a rocket. */
const SHOT = { slinger: "stone", sniper: "bullet", musketeer: "ball", gunner: "bullet", machineGunner: "bullet", gatlingGunner: "bullet", rocketeer: "rocket", railSniper: "bullet", javelineer: "javelin" } as const;
const isRanged = (kind: Soldier["kind"]): kind is keyof typeof RANGED => kind in RANGED;

/** Trains one troop at a time per barracks, while it's standing and below
 * its garrison cap. */
export class Barracks {
  /** Seconds until each barracks' next recruit is ready. */
  readonly training = new Map<number, number>();

  step(sim: DefendSim, dt: number) {
    const cap = soldierCap(sim.levels.barracksCapacity);
    for (const b of sim.map.buildings) {
      if (!isBarracks(b) || !sim.intact(b)) continue;
      const garrison = b.kind === "darkKeep" ? DARK_WIZARD.garrison : b.kind === "heroHall" ? HERO.garrison : b.kind === "revolutionary" ? squadSize(sim) : cap + hostGarrison(sim, b);
      if (this.drilled(sim, b, garrison, dt)) this.recruit(sim, b);
    }
  }

  /** Counts down the barracks' drill; true when a recruit is ready. A full
   * garrison keeps the clock at a whole drill. */
  private drilled(sim: DefendSim, b: Building, cap: number, dt: number) {
    const slow = b.kind === "darkKeep" ? DARK_WIZARD.drill : b.kind === "heroHall" ? HERO.drill : hostDrill(sim, b);
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
    // A cloudborne palace's valkyries drop from wherever it floats.
    const at = musterPoint(sim, b);
    if (!at) return;
    const kind = TRAINS[b.kind] ?? "sword";
    const scale = soldierScale(sim.levels.soldierArms);
    const stats = kind === "archer" ? ARCHER_UNIT : kind === "mage" ? { ...FIRE_MAGE, damage: fireballDamage(sim.levels.mageFireball ?? 0) } : kind === "valkyrie" ? VALKYRIE : kind === "darkWizard" ? DARK_WIZARD : kind === "hero" ? HERO
      : kind === "brawler" ? BRAWLER : kind === "assassin" ? ASSASSIN_UNIT : isSpear(kind) ? SPEARS[kind] : isRanged(kind) ? RANGED[kind] : SOLDIER;
    const path = kind === "sword" ? swordStats(sim, b.id) : kind === "assassin" ? { hp: assassinHp(sim, b.id), damage: 1 } : kind === "hero" ? { hp: heroHp(sim, b.id), damage: 1 } : { hp: gunHp(sim, b.id, kind), damage: 1 };
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
      ...(kind === "assassin" ? recruitState(sim, b.id) : {}),
    });
    if (kind === "valkyrie" && sim.skyPalaces.length) diveIn(sim, sim.soldiers[sim.soldiers.length - 1], cloudRank(sim, b));
  }
}

/** What each troop building trains. */
const TRAINS: Partial<Record<Building["kind"], Soldier["kind"]>> = {
  barracks: "sword", heroHall: "hero", archerBarracks: "archer", mageGuild: "mage", valkyriePalace: "valkyrie", darkKeep: "darkWizard",
  meleeGuild: "brawler", rangedGuild: "slinger", assassinDen: "assassin", sniperLodge: "sniper", musketHall: "musketeer",
  spearHall: "spearman", phalanx: "hoplite", javelinCamp: "javelineer", lancerStable: "lancer",
  gunHall: "gunner", gunNest: "machineGunner", gatlingNest: "gatlingGunner", rocketBattery: "rocketeer", revolutionary: "railSniper",
};
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
  /** Headhunters go for the toughest prey, not the nearest. */
  readonly toughest: boolean;

  constructor(
    private sim: DefendSim,
    s: Soldier,
  ) {
    this.home = sim.map.buildings[s.home];
    this.hc = center(this.home.rect);
    // Headhunters range further, and at Kingslayer anywhere in the city.
    // Winged lancers ride further from the stable.
    this.leash = soldierLeash(sim.levels.soldierReach ?? 0) * (s.kind === "assassin" ? huntReach(sim, s.home) : spearLeash(sim, s));
    this.toughest = headhunter(sim, s);
    this.citywide = !Number.isFinite(this.leash);
  }

  covers(e: Enemy) {
    const { hc, leash } = this;
    return this.citywide ? inCity(this.sim, e) : sq(e.x - hc.x) + sq(e.y - hc.y) <= sq(leash);
  }

  /** Enemies it may go after, nearest `s` first (a headhunter's toughest first). */
  candidates(s: Soldier) {
    const all = this.citywide ? this.sim.enemies.filter((e) => this.covers(e)) : this.sim.enemiesNear(this.hc.x, this.hc.y, this.leash);
    return all.sort(this.toughest ? toughestFirst(s) : byDistanceFrom(s)).slice(0, 3);
  }

  get limits(): PathLimits {
    return this.citywide ? CITYWIDE : { maxCost: this.leash * 3 };
  }
}

export function stepSwordsman(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  stepCloak(s, dt);
  holdLine(sim, s);
  // Crusaders' field dressing.
  if (paths(sim, s.home).crusade >= 2) s.hp = Math.min(s.maxHp, s.hp + CRUSADE.heal * dt);
  if (sim.warBanner) return rally(sim, s, dt);
  const patrol = new Patrol(sim, s);
  let target = sim.enemies.find((e) => e.id === s.target && e.hp > 0) ?? null;
  if (target && !patrol.covers(target)) target = null;
  if (target && inSwordReach(sim, s, target)) return strike(sim, s, target);
  if (s.thinkT <= 0) target = replan(sim, s, patrol);
  sim.followPath(s, target, swordSpeed(sim, s), dt);
}

/** Answering the war banner: strike whatever is in reach, else close on
 * what is near or march to the banner (no leash while it stands). */
function rally(sim: DefendSim, s: Soldier, dt: number) {
  const near = sim.enemiesNear(s.x, s.y, swordReach(sim, s) + 1).find((e) => inSwordReach(sim, s, e));
  if (near) return strike(sim, s, near);
  answerBanner(sim, sim.warBanner!, s, swordSpeed(sim, s), dt, MARCH_SIGHT);
}

/** How far a melee troop reaches: Halberdiers further. */
const swordReach = (sim: DefendSim, s: Soldier) =>
  isSpear(s.kind) ? spearReach(sim, s as Soldier & { kind: typeof s.kind }) : melee(s).reach + (s.kind === "sword" && paths(sim, s.home).halberd ? HALBERD.reach : 0);
const inSwordReach = (sim: DefendSim, s: Soldier, e: Enemy) => dist(e.x - s.x, e.y - s.y) <= swordReach(sim, s) + enemySize(e) / 2;

function strike(sim: DefendSim, s: Soldier, e: Enemy) {
  if (s.cd > 0) return;
  const { berserk, halberd } = s.kind === "sword" ? paths(sim, s.home) : { berserk: 0, halberd: 0 };
  s.cd = melee(s).cooldown * (berserk ? BERSERK.cooldown : 1);
  if (s.kind === "assassin") return assassinStrike(sim, s, e, bannerDamage(sim, s));
  if (isSpear(s.kind)) return spearStrike(sim, s as Soldier & { kind: typeof s.kind }, e, bannerDamage(sim, s));
  const damage = bannerDamage(sim, s);
  if (!berserk && !halberd) return void sim.hurtEnemy(e, damage, true, "melee", s);
  // Set for the charge: big enemies are hit far harder.
  sim.hurtEnemy(e, damage * (halberd >= 3 && enemySize(e) >= HALBERD.big ? HALBERD.bigDamage : 1), true, "melee", s);
  // Hooked blades slow what they strike.
  if (halberd >= 2 && e.hp > 0) e.chill = Math.max(e.chill ?? 0, HALBERD.chill);
  let slain = e.hp <= 0 ? 1 : 0;
  // Cleave: every other enemy beside the target.
  if (berserk >= 3)
    for (const o of sim.enemiesNear(e.x, e.y, BERSERK.cleave))
      if (o !== e && o.hp > 0 && sq(o.x - e.x) + sq(o.y - e.y) <= sq(BERSERK.cleave) && sim.hurtEnemy(o, damage * BERSERK.share, true, "melee", s) && o.hp <= 0) slain++;
  // Bloodlust: each kill heals the slayer.
  if (berserk >= 2 && slain) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * BERSERK.heal * slain);
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
  const own = s.kind === "archer" ? null : RANGED[s.kind as keyof typeof RANGED];
  const gun = isGun(s.kind) ? (s as Soldier & { kind: Gun }) : null;
  const range = s.kind === "sniper" ? sniperRange(sim, s) : s.kind === "javelineer" ? javelinRange(sim, s) : s.kind === "musketeer" ? musketRange(sim, s) : gun ? gunRange(sim, gun) : own ? own.range : archerUnitRange(sim.levels.archerSight ?? 0) + (ranger ? RANGERS.sight : 0);
  const speed = s.kind === "musketeer" ? musketSpeed(sim, s) : gun ? gunSpeed(sim, gun) : (own ?? ARCHER_UNIT).speed * (skirmish >= 2 ? SKIRMISH.speed : 1);
  // Bayonets: an enemy at close quarters is run through, not shot.
  const close = bayonetTarget(sim, s);
  if (close) return thrust(sim, s, close, bannerDamage(sim, s));
  const charge = charges(sim, s);
  // Big game: the toughest in reach rather than the nearest.
  // Deadeye: only an enemy in clear sight, holding fire when none is.
  const sight = clearShot(sim, s, range);
  const near = sight !== undefined ? sight : bigGame(sim, s, range) ?? toughestInReach(sim, s, range) ?? nearest(sim.enemiesNear(s.x, s.y, range), s, range * range, true);
  if (near) {
    shoot(sim, s, near, range);
    // Skirmishers keep walking while they shoot, and charging bayonets
    // close in.
    if (skirmish < 2 && !charge) return;
  }
  if (sim.warBanner) return answerBanner(sim, sim.warBanner, s, speed, dt);
  if ((own ? charge : (sim.levels.archerHunt ?? 0) > 0) && s.thinkT <= 0) hunt(sim, s);
  if (idle(s) && sim.streets.length) stroll(sim, s);
  sim.followPath(s, null, speed, dt);
}

/** No route to walk and done thinking. */
const idle = (s: Soldier) => !s.path.length && s.thinkT <= 0;

function shoot(sim: DefendSim, s: Soldier, e: Enemy, range: number) {
  if (s.cd > 0) return;
  const { ranger, skirmish } = paths(sim, s.home);
  if (s.kind !== "archer") {
    // Stone throwers, the gunner line and snipers: one shot of their own.
    const kind = s.kind as keyof typeof RANGED, own = RANGED[kind], base = bannerDamage(sim, s);
    const gun = isGun(kind) ? (s as Soldier & { kind: Gun }) : null;
    const damage = kind === "musketeer" ? musketDamage(sim, s, base) : gun ? gunDamage(sim, gun, base) : base;
    s.cd = kind === "musketeer" ? musketReload(sim, s) : kind === "javelineer" ? javelinReload(sim, s) : kind === "sniper" ? sniperReload(sim, s) : gun ? gunReload(sim, gun) : own.cooldown;
    // A laser sniper's bullet carries its chain.
    if (kind === "railSniper") return void sim.arrows.push(railShot(sim, s, e, damage));
    // A sniper's bullet carries its lodge's path.
    if (kind === "sniper") {
      const { damage: hit, ...bullet } = bulletOf(sim, s, damage);
      return void sim.arrows.push({ x: s.x, y: s.y, origin: { x: s.x, y: s.y, attacker: s.id }, target: e.id, damage: hit, tx: e.x, ty: e.y, life: 2, shot: "bullet", ...bullet, ...pierceOf(sim, s, e, range) });
    }
    // A javelin carries its camp's barbs; Throwing arms throw a second.
    if (kind === "javelineer") {
      for (const t of [e, ...javelinExtras(sim, s, e, range)])
        sim.arrows.push({ x: s.x, y: s.y, origin: { x: s.x, y: s.y, attacker: s.id }, target: t.id, tx: t.x, ty: t.y, life: 2, shot: "javelin", ...javelinOf(sim, s, t, damage) });
      return;
    }
    const fire = (t: Enemy, share = 1) => sim.arrows.push({ x: s.x, y: s.y, origin: { x: s.x, y: s.y, attacker: s.id }, target: t.id, damage: damage * share, tx: t.x, ty: t.y, life: 2, shot: SHOT[kind],
      ...(kind === "musketeer" ? grenadeOf(sim, s.home, damage * share) : kind === "rocketeer" ? rocketOf(sim, s.home, damage * share) : gun ? gunShot(sim, gun) : {}) });
    fire(e);
    // Volley fire: buck and ball at the next nearest; Twin pistols and
    // Salvo racks: full shots at the next nearest.
    if (kind === "musketeer") for (const t of volleyTargets(sim, s, e, range)) fire(t, VOLLEY.share);
    if (gun) for (const t of gunExtras(sim, gun, e, range)) fire(t);
    return;
  }
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
