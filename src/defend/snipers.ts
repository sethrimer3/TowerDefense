/** The Sniper lodge's snipers: they roam and shoot like the other ranged
 * troops (`troops.ts`), slowly and from far off, and the lodge's Knowledge
 * paths (`knowledge-paths.ts`) turn them into Marksmen (further still,
 * aiming at the toughest from II, a headshot every few shots at III),
 * Ricochet (bullets that glance on to the next enemies) or Suppressing fire
 * (hits that slow, stagger from II, and quicker reloads at III).
 *
 * The state they leave is optional (`Arrow.glance`, `Arrow.pin`,
 * `Soldier.strikes`) and absent in every run without a lodge on those
 * paths, and nothing draws from the random stream, so replays are
 * untouched. */
import { sq } from "../exact.ts";
import { MARKSMEN, RICOCHET, SUPPRESS, pathRank, type BattlePaths } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { ENEMIES, SNIPER } from "./catalog.ts";
import type { Arrow, DefendSim, Enemy, Soldier } from "./sim.ts";

/** A lodge's path ranks: each 0 unless its building climbs it. */
export function lodgePaths(sim: DefendSim, home: number) {
  const p: BattlePaths | undefined = buildingPaths(sim, sim.map.buildings[home]);
  return {
    marks: pathRank(p, "sniperLodge", "marksmen"),
    glance: pathRank(p, "sniperLodge", "ricochet"),
    suppress: pathRank(p, "sniperLodge", "suppressors"),
  };
}

/** How far a sniper shoots: Marksmen further. */
export const sniperRange = (sim: DefendSim, s: Soldier) => SNIPER.range + (lodgePaths(sim, s.home).marks ? MARKSMEN.range : 0);

/** A sniper's reload: Quick hands' is shorter. */
export const sniperReload = (sim: DefendSim, s: Soldier) => SNIPER.cooldown * (lodgePaths(sim, s.home).suppress >= 3 ? SUPPRESS.reload : 1);

/** Big game: the toughest enemy within `range` of `s` (the nearest of
 * equals), or undefined off the path, when the nearest is shot. */
export function bigGame(sim: DefendSim, s: Soldier, range: number): Enemy | null | undefined {
  if (s.kind !== "sniper" || lodgePaths(sim, s.home).marks < 2) return undefined;
  let best: Enemy | null = null, bd = 0;
  for (const e of sim.enemiesNear(s.x, s.y, range)) {
    const d = sq(e.x - s.x) + sq(e.y - s.y);
    if (e.hp <= 0 || d > range * range) continue;
    if (!best || e.hp > best.hp || (e.hp === best.hp && d < bd)) { best = e; bd = d; }
  }
  return best;
}

/** What a sniper's bullet of `damage` carries from its lodge: a headshot's
 * damage (every few shots, counted in `s.strikes`), the glances it has
 * left and the hold its hits take. */
export function bulletOf(sim: DefendSim, s: Soldier, damage: number): Pick<Arrow, "damage" | "glance" | "pin"> {
  const { marks, glance, suppress } = lodgePaths(sim, s.home);
  if (marks >= 3) {
    s.strikes = (s.strikes ?? 0) + 1;
    if (s.strikes % MARKSMEN.every === 0) damage *= MARKSMEN.crit;
  }
  return {
    damage,
    ...(glance ? { glance: { left: RICOCHET.bounces[glance], share: RICOCHET.share[glance], struck: [] } } : {}),
    ...(suppress ? { pin: { chill: SUPPRESS.chill, ...(suppress >= 2 ? { stagger: SUPPRESS.stagger } : {}) } } : {}),
  };
}

/** A bullet has hit `e` (`landed`: hurt it, not stopped by a shield): its
 * hold slows and staggers it, and a glancing bullet flies on to the
 * nearest enemy it hasn't struck within reach. */
export function bulletHit(sim: DefendSim, a: Arrow, e: Enemy, landed: boolean) {
  if (landed && a.pin && e.hp > 0) {
    e.chill = Math.max(e.chill ?? 0, a.pin.chill);
    if (a.pin.stagger && !ENEMIES[e.kind].unyielding) e.stagger = Math.max(e.stagger ?? 0, a.pin.stagger);
  }
  const g = a.glance;
  if (!g || g.left <= 0) return;
  const struck = [...g.struck, e.id];
  let next: Enemy | null = null, bd = sq(RICOCHET.jump);
  for (const o of sim.enemiesNear(e.x, e.y, RICOCHET.jump)) {
    const d = sq(o.x - e.x) + sq(o.y - e.y);
    if (o.hp > 0 && d <= bd && !struck.includes(o.id)) { next = o; bd = d; }
  }
  if (!next) return;
  sim.arrows.push({
    x: e.x, y: e.y, origin: a.origin, target: next.id, damage: a.damage * g.share, tx: next.x, ty: next.y, life: 2, shot: "bullet",
    ...(g.left > 1 ? { glance: { left: g.left - 1, share: g.share, struck } } : {}),
    ...(a.pin ? { pin: a.pin } : {}),
  });
}
