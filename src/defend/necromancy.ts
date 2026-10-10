/** DEFEND's Necromancy, a strike spell: cast from the Skills palette onto
 * the board, it raises every enemy that died within `NECRO.radius` cells of
 * where it lands (in the last `NECRO.graveLife` seconds) as a friendly
 * undead warrior, one a fallen enemy, then waits `NECRO.cooldown` seconds of
 * battle time before it can be cast again. The risen hunt the nearest enemy
 * anywhere on the board and crumble after `NECRO.life` seconds.
 *
 * The Smithy makes them tougher and harder hitting (`Bonuses.undeadHp`,
 * `undeadDamage`); the Study's paths (`knowledge-paths.ts`) change what
 * rises: Bone archers shoot from afar, Soul weighing raises each as strong
 * as the enemy it was, and Amalgam fuses all the fallen into one giant.
 *
 * Every death leaves a grave (`sim.graves`), aged with the battle; graves
 * follow from the enemies' deaths, which the replay hashes already, so they
 * draw nothing from the run's random stream and a run where nobody casts
 * plays exactly as before. */
import { dist, sq } from "../exact.ts";
import { AMALGAM, BONE_ARCHERS, SOUL_WEIGHT } from "../knowledge-paths.ts";
import { enemySize, ENEMIES } from "./catalog.ts";
import { CELL_COUNT } from "./grid.ts";
import { cellAt, findPath, type PathLimits, type Point } from "./pathing.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";

/** The spell and its plain warriors: the reach it raises from, its
 * cooldown, how long a grave can still be raised, the most graves kept, the
 * most risen at once, how long one lasts, and a warrior's stats, as strong
 * as an enemy of `difficulty`. */
export const NECRO = {
  radius: 3, cooldown: 30, graveLife: 30, maxGraves: 4000, maxRisen: 60, life: 60,
  hp: 30, damage: 5, attack: 0.9, speed: 1.7, reach: 0.7, size: 0.4, sight: 8, difficulty: 4,
};
/** Seconds the cast's flare and rising wisps are drawn. */
export const RAISE_SHOW = 1.2;

/** Where an enemy fell: its place, its difficulty, and seconds it can still be raised. */
export type Grave = { x: number; y: number; difficulty: number; life: number };
/** A cast, drawn while it flares: where, how far, and where each warrior rose. */
export type Raising = { x: number; y: number; r: number; t: number; risen: Point[] };
/** What a risen warrior is beyond a soldier: seconds before it crumbles
 * (absent: never), its size, the range it shoots from (0: it cuts), whether
 * it looses a second arrow, the cleave round its blows, and its look. */
export type Risen = { life?: number; size: number; range: number; twin?: boolean; cleave?: number; look: "warrior" | "archer" | "amalgam" };

const CITYWIDE: PathLimits = { maxCost: 1e9, maxNodes: CELL_COUNT };

/** An enemy fell: it leaves a grave (a fortress's parts don't; its core does). */
export function bury(sim: DefendSim, e: Enemy) {
  if (e.fortressPart) return;
  if (sim.graves.length >= NECRO.maxGraves) sim.graves.shift();
  sim.graves.push({ x: e.x, y: e.y, difficulty: ENEMIES[e.kind].cost, life: NECRO.graveLife });
}

/** Graves age; the old can no longer be raised. Raisings fade. */
export function ageGraves(sim: DefendSim, dt: number) {
  let spent = false;
  for (const g of sim.graves) if ((g.life -= dt) <= 0) spent = true;
  if (spent) sim.graves = sim.graves.filter((g) => g.life > 0);
  if (sim.raisings.length) {
    for (const r of sim.raisings) r.t += dt;
    sim.raisings = sim.raisings.filter((r) => r.t < RAISE_SHOW);
  }
}

/** The graves within the spell's reach of `at`. */
export const gravesNear = (sim: Pick<DefendSim, "graves">, at: Point, r = NECRO.radius) =>
  sim.graves.filter((g) => sq(g.x - at.x) + sq(g.y - at.y) <= r * r);

/** Casts the spell at `at`: raises the fallen there and starts the
 * cooldown. Returns how many warriors rose, or -1 while it cools down. */
export function castNecromancy(sim: DefendSim, at: Point): number {
  if (sim.necroRemaining > 0) return -1;
  sim.necroReadyAt = sim.time + NECRO.cooldown;
  const graves = gravesNear(sim, at).filter((g) => !sim.solid[cellAt(g.x, g.y)]);
  const raising: Raising = { x: at.x, y: at.y, r: NECRO.radius, t: 0, risen: [] };
  sim.raisings.push(raising);
  if (!graves.length) return 0;
  const path = sim.bonuses.necromancy, rank = (id: string) => (path?.path === id ? path.rank : 0);
  const amalgam = rank("amalgam"), weigh = rank("soulWeighing"), archer = rank("boneArchers");
  const alive = sim.soldiers.filter((s) => s.risen).length;
  if (amalgam) {
    if (alive >= NECRO.maxRisen) return 0;
    // The giant rises among them, where the nearest of them fell to the middle.
    let sum = 0, mx = 0, my = 0;
    for (const g of graves) { sum += g.difficulty; mx += g.x; my += g.y; }
    mx /= graves.length; my /= graves.length;
    let spot = graves[0], best = Infinity;
    for (const g of graves) {
      const d = sq(g.x - mx) + sq(g.y - my);
      if (d < best) { best = d; spot = g; }
    }
    const k = (sum / NECRO.difficulty) * AMALGAM.share[amalgam];
    raise(sim, spot, Math.max(k, AMALGAM.share[amalgam]), {
      size: Math.min(1.2, NECRO.size + 0.08 * Math.sqrt(k)), range: 0, look: "amalgam",
      ...(amalgam >= 2 ? { cleave: AMALGAM.cleave } : {}), ...(amalgam >= 3 ? {} : { life: NECRO.life }),
    });
    raising.risen.push({ x: spot.x, y: spot.y });
    const fused = new Set(graves);
    sim.graves = sim.graves.filter((g) => !fused.has(g));
    return 1;
  }
  let n = 0;
  for (const g of graves) {
    if (alive + n >= NECRO.maxRisen) break;
    const k = weigh ? Math.min(SOUL_WEIGHT.cap[weigh], Math.max(SOUL_WEIGHT.floor, g.difficulty / NECRO.difficulty)) * SOUL_WEIGHT.boost[weigh] : 1;
    raise(sim, g, k, archer
      ? { life: NECRO.life, size: NECRO.size * 0.9, range: BONE_ARCHERS.range[archer], look: "archer", ...(archer >= 3 ? { twin: true } : {}) }
      : { life: NECRO.life, size: NECRO.size, range: 0, look: "warrior" });
    raising.risen.push({ x: g.x, y: g.y });
    n++;
  }
  const raised = new Set(graves.slice(0, n));
  sim.graves = sim.graves.filter((g) => !raised.has(g));
  return n;
}

/** One warrior, `k` times as strong as a plain one, risen at `at`. */
function raise(sim: DefendSim, at: Point, k: number, risen: Risen) {
  const hp = NECRO.hp * k * sim.bonuses.undeadHp;
  const ranged = risen.range > 0 && (sim.bonuses.necromancy?.rank ?? 0) >= 2 ? BONE_ARCHERS.damage : 1;
  sim.soldiers.push({
    id: sim.newId(), kind: "undead", home: -1, x: at.x, y: at.y, hp, maxHp: hp,
    damage: NECRO.damage * k * sim.bonuses.undeadDamage * ranged,
    cd: 0, target: -1, path: [], thinkT: 0, flash: 0, risen,
  });
}

/** A risen warrior's turn: crumble when its time is up; otherwise hit
 * what is in reach, or walk to the nearest enemy anywhere. */
export function stepUndead(sim: DefendSim, s: Soldier, dt: number) {
  const r = s.risen!;
  if (r.life !== undefined) {
    r.life -= dt;
    if (r.life <= 0) {
      s.hp = 0;
      sim.effects.push({ kind: "dust", x: s.x, y: s.y, t: 0, r: r.size });
      return;
    }
  }
  s.cd -= dt;
  s.thinkT -= dt;
  const reach = r.range || NECRO.reach;
  let target = sim.enemies.find((e) => e.id === s.target && e.hp > 0) ?? null;
  const inReach = (e: Enemy) => dist(e.x - s.x, e.y - s.y) <= reach + enemySize(e) / 2 + (r.range ? 0 : r.size / 2);
  if (!target || !inReach(target)) {
    const near = sim.enemiesNear(s.x, s.y, reach + 1).filter((e) => e.hp > 0 && inReach(e));
    let best: Enemy | null = null, bd = Infinity;
    for (const e of near) {
      const d = sq(e.x - s.x) + sq(e.y - s.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) target = best;
  }
  if (target && inReach(target)) {
    s.target = target.id;
    s.path = [];
    return attack(sim, s, target);
  }
  if (s.thinkT <= 0) target = hunt(sim, s);
  sim.followPath(s, target, NECRO.speed * (r.look === "amalgam" ? 0.8 : 1), dt);
}

function attack(sim: DefendSim, s: Soldier, e: Enemy) {
  if (s.cd > 0) return;
  const r = s.risen!;
  s.cd = NECRO.attack * (r.look === "amalgam" ? 1.4 : 1);
  if (r.range) {
    const loose = (t: Enemy) => sim.arrows.push({ x: s.x, y: s.y, origin: { x: s.x, y: s.y, attacker: s.id }, target: t.id, damage: s.damage, tx: t.x, ty: t.y, life: 2 });
    loose(e);
    if (r.twin) {
      let next: Enemy | null = null, bd = r.range * r.range;
      for (const o of sim.enemiesNear(s.x, s.y, r.range)) {
        const d = sq(o.x - s.x) + sq(o.y - s.y);
        if (o !== e && o.hp > 0 && d <= bd) { bd = d; next = o; }
      }
      if (next) loose(next);
    }
    return;
  }
  sim.hurtEnemy(e, s.damage, true, "melee", s);
  if (r.cleave) {
    for (const o of sim.enemiesNear(e.x, e.y, r.cleave))
      if (o !== e && o.hp > 0 && sq(o.x - e.x) + sq(o.y - e.y) <= r.cleave * r.cleave) sim.hurtEnemy(o, s.damage, true, "melee", s);
    sim.effects.push({ kind: "dust", x: e.x, y: e.y, t: 0, r: r.cleave });
  }
}

/** Twice a second: path to the nearest of up to three enemies with a route,
 * looking near first and then across the whole board. */
function hunt(sim: DefendSim, s: Soldier): Enemy | null {
  s.thinkT = 0.5;
  s.path = [];
  let prey = sim.enemiesNear(s.x, s.y, NECRO.sight).filter((e) => e.hp > 0);
  if (!prey.length) prey = sim.enemies.filter((e) => e.hp > 0);
  const byDistance = (a: Enemy, b: Enemy) => sq(a.x - s.x) + sq(a.y - s.y) - (sq(b.x - s.x) + sq(b.y - s.y));
  for (const e of nearestFew(prey, byDistance)) {
    const path = findPath(sim.ownSolid, s, e, CITYWIDE);
    if (!path) continue;
    s.path = path;
    s.target = e.id;
    return e;
  }
  s.target = -1;
  return null;
}

/** The first three of `list` by `order`, without sorting all of it. */
function nearestFew(list: Enemy[], order: (a: Enemy, b: Enemy) => number): Enemy[] {
  const out: Enemy[] = [];
  for (const e of list) {
    let i = out.length;
    while (i > 0 && order(e, out[i - 1]) < 0) i--;
    if (i < 3) { out.splice(i, 0, e); if (out.length > 3) out.pop(); }
  }
  return out;
}
