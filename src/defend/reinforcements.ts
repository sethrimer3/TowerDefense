import {chargeIdle,chronoTarget} from "./chrono.ts";
/** DEFEND's Reinforcements, a strike spell: cast from the Skills palette onto
 * the board, a squad of soldiers drops out of the sky round where it is let
 * go (`REINFORCE.count`, each coming down for `REINFORCE.fall` seconds),
 * holds that ground (their `post`) against every enemy that comes within
 * `REINFORCE.leash` cells of it, and marches off after `REINFORCE.life`
 * seconds without counting as lost troops. Then the spell waits
 * `REINFORCE.cooldown` seconds of battle time.
 *
 * The Smithy makes them tougher (`Bonuses.reinforceHp`), harder hitting
 * (`reinforceDamage`) and slower to leave (`reinforceTime`); the Study's
 * paths (`knowledge-paths.ts`) change the squad: Hammerfall lands each with a
 * shockwave (staggering from II, and a champion at III), Muster the levy
 * drops more of them (with bowmen from II, and replaces the fallen once at
 * III), and Oathsworn binds them into a shield wall that a kill heals and
 * keeps longer, and at III makes a last stand.
 *
 * All of it is battle state, but only a cast makes any, and nothing here
 * draws from the run's random stream, so a run where nobody casts plays
 * exactly as before. */
import { dist, sq } from "../exact.ts";
import { HAMMERFALL, MUSTER, OATH } from "../knowledge-paths.ts";
import { enemySize, ENEMIES } from "./catalog.ts";
import { CELLS_H, CELLS_W } from "./grid.ts";
import { cellAt, cellCenter, findPath, type PathLimits, type Point } from "./pathing.ts";
import type { Civilian, DefendSim, Enemy, Soldier } from "./sim.ts";

/** The spell and its soldiers: the cooldown, the seconds each falls, how
 * long they stay, how far from their post they fight, the most at once, and
 * a soldier's stats. */
export const REINFORCE = {
  cooldown: 45, fall: 0.8, life: 30, leash: 6, max: 40,
  hp: 60, damage: 8, attack: 0.8, speed: 2.2, reach: 0.75, size: 0.42,
};
/** Seconds a landing's (or a departure's) ring is drawn. */
export const LAND_SHOW = 0.5;

/** Where the squad lands round the cast, in cells: a cross, then the
 * diagonals farther out, then the middle (exact constants, no trigonometry). */
const SPOTS: readonly Point[] = [
  { x: 1.1, y: 0 }, { x: -1.1, y: 0 }, { x: 0, y: 1.1 }, { x: 0, y: -1.1 },
  { x: 1.3, y: 1.3 }, { x: -1.3, y: -1.3 }, { x: 1.3, y: -1.3 }, { x: -1.3, y: 1.3 },
  { x: 0, y: 0 },
];

export type CalledLook = "knight" | "archer" | "champion";
/** What a reinforcement is beyond a soldier: seconds before it marches off,
 * the post it holds, which cast's squad it is, its size and look, the range
 * it shoots from (0: it cuts), the cleave round its blows, and whether it
 * is a replacement (`spare`), has made its last stand (`stood`) or has left
 * (`left`, so no ghost rises). */
export type Called = {
  life: number; post: Point; squad: number; size: number; look: CalledLook; range: number;
  cleave?: number; spare?: true; stood?: true; left?: true;
};
/** One coming down: where it lands, `t` of `fall` seconds on, and who it is. */
export type Drop = { x: number; y: number; t: number; fall: number; k: number; called: Called };
/** A ring on the ground: a landing's dust (and, as Hammerfall, its
 * shockwave's reach) or a soldier leaving in a column of light. */
export type Landing = { x: number; y: number; r: number; t: number; kind: "land" | "quake" | "leave" };

/** The spell's path ranks as the battle snapshot them. */
function ranks(sim: Pick<DefendSim, "bonuses">) {
  const p = sim.bonuses.reinforcements, rank = (id: string) => (p?.path === id ? p.rank : 0);
  return { hammer: rank("hammerfall"), muster: rank("muster"), oath: rank("oathsworn") };
}

const inBoard = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < CELLS_W && p.y < CELLS_H;

/** Where each soldier of a cast at `at` would land: the squad's spots on
 * open ground (a spot inside a building or off the board stays empty). The
 * champion, under Hammerfall III, lands in the middle. */
export function dropSpots(sim: Pick<DefendSim, "bonuses" | "solid">, at: Point): (Point & { look: CalledLook })[] {
  const { hammer, muster } = ranks(sim);
  const n = MUSTER.count[muster], out: (Point & { look: CalledLook })[] = [];
  for (let i = 0; i < n && i < SPOTS.length; i++) {
    const p = { x: at.x + SPOTS[i].x, y: at.y + SPOTS[i].y };
    if (!inBoard(p) || sim.solid[cellAt(p.x, p.y)]) continue;
    out.push({ ...p, look: muster >= 2 && i % MUSTER.archerEvery === MUSTER.archerEvery - 1 ? "archer" : "knight" });
  }
  if (hammer >= 3 && inBoard(at) && !sim.solid[cellAt(at.x, at.y)]) out.push({ x: at.x, y: at.y, look: "champion" });
  return out;
}

/** Casts the spell at `at`: the squad starts coming down. False while it
 * cools down. */
export function castReinforcements(sim: DefendSim, at: Point): boolean {
  if (sim.reinforceRemaining > 0) return false;
  sim.reinforceReadyAt = sim.time + REINFORCE.cooldown;
  const squad = ++sim.squads, life = REINFORCE.life * sim.bonuses.reinforceTime;
  let room = REINFORCE.max - calledCount(sim);
  dropSpots(sim, at).forEach((p, i) => {
    if (room-- <= 0) return;
    const champion = p.look === "champion", archer = p.look === "archer";
    sim.drops.push({
      x: p.x, y: p.y, t: 0, fall: REINFORCE.fall + i * 0.06, k: champion ? HAMMERFALL.hp : 1,
      called: {
        life, post: { x: at.x, y: at.y }, squad, look: p.look, range: archer ? MUSTER.range : 0,
        size: champion ? 0.7 : archer ? REINFORCE.size * 0.9 : REINFORCE.size,
        ...(champion ? { cleave: HAMMERFALL.cleave } : {}),
      },
    });
  });
  return true;
}

/** Reinforcements on the board and on their way down. */
const calledCount = (sim: DefendSim) => sim.drops.length + sim.soldiers.filter((s) => s.called && s.hp > 0).length;

/** Each step: the falling come down and land (as Hammerfall, with a
 * shockwave), and the rings on the ground fade. */
export function stepReinforcements(sim: DefendSim, dt: number) {
  if (sim.landings.length) {
    for (const l of sim.landings) l.t += dt;
    sim.landings = sim.landings.filter((l) => l.t < LAND_SHOW);
  }
  if (!sim.drops.length) return;
  const landed: Drop[] = [];
  for (const d of sim.drops) if ((d.t += dt) >= d.fall) landed.push(d);
  if (!landed.length) return;
  sim.drops = sim.drops.filter((d) => d.t < d.fall);
  const { hammer } = ranks(sim);
  for (const d of landed) {
    land(sim, d);
    const champion = d.called.look === "champion";
    if (champion) shockwave(sim, d, HAMMERFALL.quakeRadius, HAMMERFALL.quake, "quake");
    else if (hammer) shockwave(sim, d, HAMMERFALL.radius[hammer], HAMMERFALL.damage[hammer], "land");
    else sim.landings.push({ x: d.x, y: d.y, r: 0.6, t: 0, kind: "land" });
  }
}

/** One soldier touches down, ready to fight. */
function land(sim: DefendSim, d: Drop) {
  const champion = d.called.look === "champion";
  const hp = REINFORCE.hp * d.k * sim.bonuses.reinforceHp;
  sim.soldiers.push({
    id: sim.newId(), kind: "reinforcement", home: -1, x: d.x, y: d.y, hp, maxHp: hp,
    damage: REINFORCE.damage * (champion ? HAMMERFALL.damage3 : 1) * sim.bonuses.reinforceDamage,
    cd: 0, target: -1, path: [], thinkT: 0, flash: 0, called: { ...d.called, post: { ...d.called.post } },
  });
}

/** Hammerfall's shockwave: `damage` to every enemy within `r` of the
 * landing; from II they stagger. */
function shockwave(sim: DefendSim, at: Point, r: number, damage: number, kind: Landing["kind"]) {
  sim.landings.push({ x: at.x, y: at.y, r, t: 0, kind });
  const stagger = ranks(sim).hammer >= 2;
  for (const e of sim.enemiesNear(at.x, at.y, r)) {
    if (e.hp <= 0) continue;
    sim.hurtEnemy(e, damage, true, "melee", { x: at.x, y: at.y });
    if (stagger && e.hp > 0 && !ENEMIES[e.kind].unyielding) e.stagger = Math.max(e.stagger ?? 0, HAMMERFALL.stagger);
  }
}

/** A reinforcement's turn: march off when its time is up; otherwise hit
 * what is in reach, go for the nearest enemy near its post, or head back to
 * the post. */
export function stepReinforcement(sim: DefendSim, s: Soldier, dt: number) {
  const c = s.called!;
  c.life -= dt;
  if (c.life <= 0 && !lastStand(sim, s)) {
    s.hp = 0;
    c.left = true;
    sim.landings.push({ x: s.x, y: s.y, r: c.size, t: 0, kind: "leave" });
    return;
  }
  s.cd -= dt;
  s.thinkT -= dt;
  const reach = c.range || REINFORCE.reach;
  const inReach = (e: Enemy) => dist(e.x - s.x, e.y - s.y) <= reach + enemySize(e) / 2 + (c.range ? 0 : c.size / 2);
  let target = sim.enemies.find((e) => e.id === s.target && e.hp > 0) ?? null;
  if (!target || !inReach(target)) {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of sim.enemiesNear(s.x, s.y, reach + 1)) {
      const d = sq(e.x - s.x) + sq(e.y - s.y);
      if (e.hp > 0 && inReach(e) && d < bd) { bd = d; best = e; }
    }
    if (best) target = best;
  }
  if (target && inReach(target)) {
    s.target = target.id;
    s.path = [];
    return attack(sim, s, target);
  }
  if(sim.chrono.size){
    if(c.range){const aim=chronoTarget(sim,s,reach);if(aim){attack(sim,s,aim);return;}}
    else if(chargeIdle(sim,s,reach+c.size/2,s.damage,()=>s.cd<=0,()=>{s.cd=REINFORCE.attack*(c.look==="champion"?1.3:1);},true))return;
  }
  if (s.thinkT <= 0) target = seek(sim, s);
  sim.followPath(s, target, REINFORCE.speed * (c.look === "champion" ? 0.85 : 1), dt);
}

function attack(sim: DefendSim, s: Soldier, e: Enemy) {
  if (s.cd > 0) return;
  const c = s.called!;
  s.cd = REINFORCE.attack * (c.look === "champion" ? 1.3 : 1);
  if (c.range) {
    sim.arrows.push({ x: s.x, y: s.y, origin: { x: s.x, y: s.y, attacker: s.id }, target: e.id, damage: s.damage, tx: e.x, ty: e.y, life: 2 });
    return;
  }
  const struck = [e];
  if (c.cleave)
    for (const o of sim.enemiesNear(e.x, e.y, c.cleave)) if (o !== e && o.hp > 0) struck.push(o);
  for (const o of struck) {
    const alive = o.hp > 0;
    sim.hurtEnemy(o, s.damage, true, "melee", s);
    if (alive && o.hp <= 0) slew(sim, s);
  }
  if (c.cleave) sim.effects.push({ kind: "dust", x: e.x, y: e.y, t: 0, r: c.cleave });
}

/** Oathsworn II: a kill keeps the whole squad longer and heals the slayer. */
function slew(sim: DefendSim, s: Soldier) {
  if (ranks(sim).oath < 2) return;
  const squad = s.called!.squad;
  for (const o of sim.soldiers) if (o.called?.squad === squad && o.hp > 0 && !o.called.stood) o.called.life += OATH.time;
  s.hp = Math.min(s.maxHp, s.hp + s.maxHp * OATH.heal);
}

const LEASHED: PathLimits = { maxCost: 60, maxNodes: 1500 };

/** Twice a second: path to the nearest of up to three enemies near the
 * post that have a route; with none, back to the post. */
function seek(sim: DefendSim, s: Soldier): Enemy | null {
  const c = s.called!;
  s.thinkT = 0.5;
  s.path = [];
  const prey = sim.enemiesNear(c.post.x, c.post.y, REINFORCE.leash).filter((e) => e.hp > 0);
  prey.sort((a, b) => sq(a.x - s.x) + sq(a.y - s.y) - (sq(b.x - s.x) + sq(b.y - s.y)) || a.id - b.id);
  for (const e of prey.slice(0, 3)) {
    const path = findPath(sim.ownSolid, s, e, LEASHED);
    if (!path) continue;
    s.path = path;
    s.target = e.id;
    return e;
  }
  s.target = -1;
  if (dist(s.x - c.post.x, s.y - c.post.y) > 1.5) s.path = findPath(sim.ownSolid, s, cellCenter(cellAt(c.post.x, c.post.y)), LEASHED) ?? [];
  return null;
}

/** Oathsworn III: one whose time runs out or who falls fights on, unhurtable,
 * for a last few seconds; true when it does. */
function lastStand(sim: DefendSim, s: Soldier): boolean {
  const c = s.called!;
  if (c.stood || ranks(sim).oath < 3) return false;
  c.stood = true;
  c.life = OATH.stand;
  s.hp = Math.max(s.hp, 1);
  s.guard = OATH.stand;
  return true;
}

/** A reinforcement fell in battle (not one marching off): it makes its last
 * stand (Oathsworn III), or a fresh one drops in at the post (Muster III). */
export function calledFell(sim: DefendSim, s: Soldier) {
  const c = s.called!;
  if (c.left) return;
  if (lastStand(sim, s)) return;
  if (ranks(sim).muster < 3 || c.spare || c.look === "champion" || calledCount(sim) >= REINFORCE.max) return;
  const at = sim.solid[cellAt(c.post.x, c.post.y)] ? { x: s.x, y: s.y } : c.post;
  sim.drops.push({ x: at.x, y: at.y, t: 0, fall: REINFORCE.fall, k: 1, called: { ...c, post: { ...c.post }, spare: true } });
}

/** Oathsworn I: what a reinforcement's damage is multiplied by, standing
 * with the rest of its squad; exactly 1 for everyone else. */
export function shieldWall(sim: DefendSim, unit: Soldier | Civilian): number {
  if (!("called" in unit) || !unit.called || !ranks(sim).oath) return 1;
  const squad = unit.called.squad, near = OATH.near * OATH.near;
  let n = 0;
  for (const o of sim.soldiers) if (o !== unit && o.hp > 0 && o.called?.squad === squad && sq(o.x - unit.x) + sq(o.y - unit.y) <= near) n++;
  return 1 - Math.min(OATH.wallMax, n * OATH.wall);
}
