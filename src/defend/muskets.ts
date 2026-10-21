/** The Musket hall's musketmen: they roam and shoot like the other ranged
 * troops (`troops.ts`), and the hall's Knowledge paths
 * (`knowledge-paths.ts`) turn them into Grenadiers (balls bursting where
 * they land, leaving the ground burning, throw smaller bursts round them from II,
 * and set clinging fire at III), Volley fire (extra balls at the next
 * nearest enemies, and at III quicker reloads beside their comrades) or
 * Bayonets (a thrust at close quarters, hunting citywide from II,
 * staggering at III) or Sharpshooters (further and harder, aiming at the
 * toughest at III, its crown making the hall a Sniper lodge). The Rocket
 * battery's rockets burst through `burstBall` too.
 *
 * The state they leave is optional (`Arrow.grenade`) and absent in every
 * run without a hall on those paths, and nothing draws from the random
 * stream that a plain hall wouldn't, so replays are untouched. */
import { sq } from "../exact.ts";
import { BAYONET, GRENADIERS, SHARP_MUSKETS, VOLLEY, pathRank, type BattlePaths } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { ENEMIES, MUSKETEER } from "./catalog.ts";
import { fizzles } from "./boats.ts";
import type { Arrow, DefendSim, Enemy, Soldier } from "./sim.ts";

/** A hall's path ranks: each 0 unless its building climbs it. */
export function hallPaths(sim: DefendSim, home: number) {
  const p: BattlePaths | undefined = buildingPaths(sim, sim.map.buildings[home]);
  return {
    grenade: pathRank(p, "musketHall", "grenadiers"),
    volley: pathRank(p, "musketHall", "volleyFire"),
    bayonet: pathRank(p, "musketHall", "bayonets"),
    sharp: pathRank(p, "musketHall", "sharpMuskets"),
  };
}

/** What a musketman's ball carries from its hall for `damage`: a
 * Grenadier's burst, fire and bomblets; nothing otherwise. */
export function grenadeOf(sim: DefendSim, home: number, damage: number): Pick<Arrow, "grenade" | "blast"> {
  const g = hallPaths(sim, home).grenade;
  if (!g) return {};
  return { blast: MUSKETEER.blast, grenade: { life: GRENADIERS.burn[g], dps: damage * GRENADIERS.share, bomblets: GRENADIERS.bomblets[g], ...(g >= 3 ? { cling: true as const } : {}) } };
}

/** An explosive ball lands: it bursts, and a Grenadier's (or a cluster
 * rocket's) throws bomblets round it and leaves the ground burning, when
 * it burns at all (none of it in water). */
export function burstBall(sim: DefendSim, a: Arrow) {
  const r = a.blast!, origin = a.origin ?? { x: a.x, y: a.y }, g = a.grenade;
  if (!g) return void sim.explode(a.tx, a.ty, { r, damage: a.damage, friendlyFire: false, origin });
  if (fizzles(sim, a.tx, a.ty, r)) return;
  const seed = sim.explode(a.tx, a.ty, { r, damage: a.damage, friendlyFire: false, origin });
  for (const [dx, dy] of BOMBLETS.slice(0, g.bomblets))
    sim.explode(a.tx + dx * r * 0.9, a.ty + dy * r * 0.9, { r: r * GRENADIERS.bombR, damage: a.damage * GRENADIERS.bombShare, friendlyFire: false, origin });
  if (g.life) sim.blazes.push({ x: a.tx, y: a.ty, r, t: 0, life: g.life, dps: g.dps, seed, ...(g.cling ? { cling: true } : {}) });
}
/** Where a grenade's bomblets land, as shares of its burst: one each way. */
const BOMBLETS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Volley fire: the next nearest enemies within `range` of `s` besides `e`
 * that its extra balls go for (none off the path). */
export function volleyTargets(sim: DefendSim, s: Soldier, e: Enemy, range: number, pool?: Enemy[]): Enemy[] {
  const extra = VOLLEY.extra[hallPaths(sim, s.home).volley];
  if (!extra) return [];
  const d = (o: Enemy) => sq(o.x - s.x) + sq(o.y - s.y);
  return (pool ?? sim.enemiesNear(s.x, s.y, range)).filter((o) => o !== e && o.hp > 0 && d(o) <= range * range).sort((a, b) => d(a) - d(b)).slice(0, extra);
}

/** A musketman's reload: Platoon fire's is quicker for each comrade of
 * its hall standing near. */
export function musketReload(sim: DefendSim, s: Soldier) {
  if (hallPaths(sim, s.home).volley < 3) return MUSKETEER.cooldown;
  let near = 0;
  for (const o of sim.soldiers)
    if (o !== s && o.home === s.home && o.kind === "musketeer" && o.hp > 0 && sq(o.x - s.x) + sq(o.y - s.y) <= sq(VOLLEY.reach) && ++near >= VOLLEY.most) break;
  return MUSKETEER.cooldown * (1 - VOLLEY.drill * near);
}

/** How far a musketman shoots: Sharpshooters further. */
export const musketRange = (sim: DefendSim, s: Soldier) => MUSKETEER.range + SHARP_MUSKETS.range[hallPaths(sim, s.home).sharp];
/** How hard a musketman's ball hits, of `damage`: Sharpshooters harder. */
export const musketDamage = (sim: DefendSim, s: Soldier, damage: number) => damage * SHARP_MUSKETS.damage[hallPaths(sim, s.home).sharp];

/** Sharpshooters III: the toughest enemy within `range` of `s` (the nearest
 * of equals), or undefined off the path, when the nearest is shot. */
export function toughestInReach(sim: DefendSim, s: Soldier, range: number, pool?: Enemy[]): Enemy | null | undefined {
  if (s.kind !== "musketeer" || hallPaths(sim, s.home).sharp < 3) return undefined;
  let best: Enemy | null = null, bd = 0;
  for (const e of pool ?? sim.enemiesNear(s.x, s.y, range)) {
    const d = sq(e.x - s.x) + sq(e.y - s.y);
    if (e.hp <= 0 || d > range * range) continue;
    if (!best || e.hp > best.hp || (e.hp === best.hp && d < bd)) { best = e; bd = d; }
  }
  return best;
}

/** How fast a musketman walks: Bayonets charge faster from II. */
export const musketSpeed = (sim: DefendSim, s: Soldier) => MUSKETEER.speed * (hallPaths(sim, s.home).bayonet >= 2 ? BAYONET.speed : 1);

/** Whether `s` hunts enemies anywhere in the city: Bayonets from II. */
export const charges = (sim: DefendSim, s: Soldier) => s.kind === "musketeer" && hallPaths(sim, s.home).bayonet >= 2;

/** Bayonets: the enemy `s` may run through, standing within reach, or null. */
export function bayonetTarget(sim: DefendSim, s: Soldier): Enemy | null {
  if (s.kind !== "musketeer" || !hallPaths(sim, s.home).bayonet) return null;
  let best: Enemy | null = null, bd = sq(BAYONET.reach);
  for (const e of sim.enemiesNear(s.x, s.y, BAYONET.reach)) {
    const d = sq(e.x - s.x) + sq(e.y - s.y);
    if (e.hp > 0 && d <= bd) { best = e; bd = d; }
  }
  return best;
}

/** One bayonet thrust on `e` for `base` (a shot's) damage; at III it staggers. */
export function thrust(sim: DefendSim, s: Soldier, e: Enemy, base: number) {
  if (s.cd > 0) return;
  s.cd = BAYONET.cooldown;
  sim.hurtEnemy(e, base * BAYONET.damage, true, "melee", s);
  if (hallPaths(sim, s.home).bayonet >= 3 && e.hp > 0 && !ENEMIES[e.kind].unyielding) e.stagger = Math.max(e.stagger ?? 0, BAYONET.stagger);
}
