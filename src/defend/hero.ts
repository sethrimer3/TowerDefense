/** DEFEND's Hero, the swordsmen's ultimate, trained one at a time at the
 * Hero's hall (a Barracks become one with Knowledge). It hunts the nearest
 * enemies anywhere in the city and fights with a combo, counted in
 * `Soldier.strikes`: sweeping slashes, each cutting every enemy within
 * `HERO.arc` cells in front of it, then a spin cutting every enemy within
 * `HERO.spin` cells round it, harder. Crowds of small enemies melt away.
 *
 * Its paths: Whirlwind (spins sooner, wider and harder, at III every
 * strike), Blade dance (each strike a flurry of slashes, the Hero dashing
 * from enemy to enemy, kills extending it at III) and Legend (more HP,
 * kills healing it, and at III rising once when it falls).
 *
 * `sim.swings` keeps each slash, spin, dash and rising for the renderer
 * (`hero-art.ts`); it is not part of the replayed state. Only a Hero adds
 * to it or to `Soldier.rallied`, and its stroll is the only draw from the
 * random stream, so runs without one replay unchanged. */
import { BLADE_DANCE, LEGEND, WHIRLWIND, pathRank, type BattlePaths } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { dist, sq } from "../exact.ts";
import { HERO, enemySize } from "./catalog.ts";
import { blocked, nearest } from "./pathing.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";
import { seek } from "./valkyries.ts";
import { answerBanner, bannerDamage } from "./war-banner.ts";

/** One of the Hero's moves, fading: a slash from (x, y) facing (fx, fy) out
 * to `r` cells, sweeping one way or the other (`turn`); a spin `r` cells
 * round (x, y); a dash from (x, y) to (x1, y1); or a rising. How it looks
 * is the renderer's. */
export type Swing = { kind: "slash" | "spin" | "dash" | "rise"; x: number; y: number; fx: number; fy: number; r: number; x1: number; y1: number; turn: number; t: number; life: number };

/** How long each move's trail lingers, in seconds. */
export const SWING_LIFE = { slash: 0.24, spin: 0.34, dash: 0.28, rise: 0.9 };
/** Steps along a dash, in cells, testing for something in the way. */
const STRIDE = 0.2;

/** The Hero's path ranks at its hall `home`: 0 for each it doesn't climb. */
export function heroPaths(sim: DefendSim, home: number) {
  const p: BattlePaths | undefined = home >= 0 ? buildingPaths(sim, sim.map.buildings[home]) : undefined;
  return {
    whirl: pathRank(p, "heroHall", "whirlwind"),
    dance: pathRank(p, "heroHall", "bladeDance"),
    legend: pathRank(p, "heroHall", "legend"),
  };
}

/** The Hero's HP as a share of its own, by its hall's Legend rank. */
export const heroHp = (sim: DefendSim, home: number) => LEGEND.hp[heroPaths(sim, home).legend];

const inReach = (s: Soldier, e: Enemy, r: number) => e.hp > 0 && dist(e.x - s.x, e.y - s.y) <= r + enemySize(e) / 2;

export function stepHero(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  const near = nearest(sim.enemiesNear(s.x, s.y, HERO.reach + 1).filter((e) => inReach(s, e, HERO.reach)), s, Infinity, true);
  if (near) {
    // In reach: it holds its ground until its blade is ready.
    if (s.cd <= 0) combo(sim, s, near);
    return;
  }
  if (sim.warBanner) return answerBanner(sim, sim.warBanner, s, HERO.speed, dt);
  if (s.thinkT <= 0) seek(sim, s);
  sim.followPath(s, null, HERO.speed, dt);
}

/** The combo's next strike at `e`: a spin every `WHIRLWIND.every`th, else a
 * slash, or with Blade dance a flurry of them. */
export function combo(sim: DefendSim, s: Soldier, e: Enemy) {
  const p = heroPaths(sim, s.home);
  const n = (s.strikes ?? 0) + 1;
  s.strikes = n;
  s.cd = HERO.cooldown * BLADE_DANCE.cooldown[p.dance];
  const base = bannerDamage(sim, s);
  let slain = 0;
  if (n % WHIRLWIND.every[p.whirl] === 0) slain = spin(sim, s, base, p.whirl);
  else {
    // A flurry: slash, dash to the next nearest enemy not yet slashed,
    // slash again. Thousand cuts: each kill adds another.
    const struck = new Set<number>();
    let limit = BLADE_DANCE.slashes[p.dance], target: Enemy | null = e;
    for (let done = 0; target && done < limit; done++) {
      if (done) dash(sim, s, target);
      struck.add(target.id);
      const k = slash(sim, s, target, base, done + n);
      slain += k;
      if (p.dance >= 3 && k) limit = Math.min(BLADE_DANCE.most, limit + k);
      target = done + 1 < limit ? nearest(sim.enemiesNear(s.x, s.y, BLADE_DANCE.jump).filter((o) => o.hp > 0 && !struck.has(o.id)), s, sq(BLADE_DANCE.jump)) : null;
    }
  }
  // Bloodied blade: each kill heals it.
  if (p.legend >= 2 && slain) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * LEGEND.heal * slain);
}

/** A sweeping slash at `e`: every enemy within `HERO.arc` cells in front
 * of the Hero (and `e` itself). Returns the kills. */
function slash(sim: DefendSim, s: Soldier, e: Enemy, base: number, count: number) {
  const d = dist(e.x - s.x, e.y - s.y);
  const fx = d > 0.01 ? (e.x - s.x) / d : 1, fy = d > 0.01 ? (e.y - s.y) / d : 0;
  let slain = 0;
  for (const o of sim.enemiesNear(s.x, s.y, HERO.arc + 1)) {
    if (o !== e && (!inReach(s, o, HERO.arc) || (o.x - s.x) * fx + (o.y - s.y) * fy < 0)) continue;
    if (sim.hurtEnemy(o, base, true, "melee", s) && o.hp <= 0) slain++;
  }
  sim.swings.push({ kind: "slash", x: s.x, y: s.y, fx, fy, r: HERO.arc, x1: e.x, y1: e.y, turn: count % 2 ? 1 : -1, t: 0, life: SWING_LIFE.slash });
  return slain;
}

/** A spin: every enemy within the Whirlwind's reach round the Hero, harder.
 * Returns the kills. */
function spin(sim: DefendSim, s: Soldier, base: number, whirl: number) {
  const r = whirl ? WHIRLWIND.radius[whirl] : HERO.spin, damage = base * (whirl ? WHIRLWIND.damage[whirl] : HERO.spinDamage);
  let slain = 0;
  for (const o of sim.enemiesNear(s.x, s.y, r + 1))
    if (inReach(s, o, r) && sim.hurtEnemy(o, damage, true, "melee", s) && o.hp <= 0) slain++;
  sim.swings.push({ kind: "spin", x: s.x, y: s.y, fx: 0, fy: 0, r, x1: s.x, y1: s.y, turn: (s.strikes ?? 0) % 2 ? 1 : -1, t: 0, life: SWING_LIFE.spin });
  return slain;
}

/** Dashes toward `e`, stopping beside it or where something solid stands
 * in the way. */
function dash(sim: DefendSim, s: Soldier, e: Enemy) {
  const d = dist(e.x - s.x, e.y - s.y), want = d - HERO.reach * 0.7;
  if (want <= 0.05) return;
  const ux = (e.x - s.x) / d, uy = (e.y - s.y) / d;
  let free = 0;
  for (let k = 1; free < want; k++) {
    const at = Math.min(want, k * STRIDE);
    if (blocked(sim.ownSolid, s.x + ux * at, s.y + uy * at)) break;
    free = at;
  }
  if (free <= 0) return;
  const x0 = s.x, y0 = s.y;
  s.x += ux * free;
  s.y += uy * free;
  s.path = [];
  sim.swings.push({ kind: "dash", x: x0, y: y0, fx: ux, fy: uy, r: free, x1: s.x, y1: s.y, turn: 1, t: 0, life: SWING_LIFE.dash });
}

/** Undying: the first time a Legend III Hero falls it rises at once with
 * half its HP, unhurtable for a moment. */
export function heroRises(sim: DefendSim, s: Soldier) {
  if (s.rallied || heroPaths(sim, s.home).legend < 3) return;
  s.rallied = true;
  s.hp = s.maxHp * LEGEND.rise;
  s.guard = LEGEND.stand;
  sim.swings.push({ kind: "rise", x: s.x, y: s.y, fx: 0, fy: 0, r: 1.2, x1: s.x, y1: s.y, turn: 1, t: 0, life: SWING_LIFE.rise });
}

/** The swings' trails fade. */
export function stepSwings(sim: DefendSim, dt: number) {
  if (!sim.swings.length) return;
  for (const w of sim.swings) w.t += dt;
  sim.swings = sim.swings.filter((w) => w.t < w.life);
}
