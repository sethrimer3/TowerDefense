/** The Sniper lodge's snipers: they roam and shoot like the other ranged
 * troops (`troops.ts`), slowly and from far off, and the lodge's Knowledge
 * paths (`knowledge-paths.ts`) turn them into Marksmen (further still,
 * aiming at the toughest from II, a headshot every few shots at III),
 * Ricochet (bullets that glance on to the next enemies) or Suppressing fire
 * (hits that slow, stagger from II, and quicker reloads at III), Deadeye
 * (only an enemy in clear sight, `clearShot`, but much harder) or Piercing
 * rounds (`Arrow.pierce`: straight through every enemy in line, each hit
 * softer, `pierceHits`).
 *
 * The state they leave is optional (`Arrow.glance`, `Arrow.pin`,
 * `Arrow.pierce`, `Soldier.strikes`) and absent in every run without a lodge on those
 * paths, and nothing draws from the random stream, so replays are
 * untouched. */
import { dist, sq } from "../exact.ts";
import { DEADEYE, MARKSMEN, PIERCING, RICOCHET, SUPPRESS, pathRank, type BattlePaths } from "../knowledge-paths.ts";
import { CellType } from "./citygen.ts";
import { cellIndex } from "./grid.ts";
import { nearest } from "./pathing.ts";
import { buildingPaths } from "../specializations.ts";
import { ENEMIES, RAIL_SNIPER, SNIPER, enemySize } from "./catalog.ts";
import type { Arrow, DefendSim, Enemy, Soldier } from "./sim.ts";

/** A lodge's path ranks: each 0 unless its building climbs it. */
export function lodgePaths(sim: DefendSim, home: number) {
  const p: BattlePaths | undefined = buildingPaths(sim, sim.map.buildings[home]);
  return {
    marks: pathRank(p, "sniperLodge", "marksmen"),
    glance: pathRank(p, "sniperLodge", "ricochet"),
    suppress: pathRank(p, "sniperLodge", "suppressors"),
    deadeye: pathRank(p, "sniperLodge", "deadeye"),
    pierce: pathRank(p, "sniperLodge", "piercing"),
  };
}

/** How far a sniper shoots: Marksmen further. */
export function sniperRange(sim: DefendSim, s: Soldier) {
  const { marks, deadeye, pierce } = lodgePaths(sim, s.home);
  return SNIPER.range + (marks ? MARKSMEN.range : 0) + (deadeye >= 3 ? DEADEYE.range : 0) + (pierce >= 3 ? PIERCING.range : 0);
}

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

/** Whether nothing but open ground, water or the low city wall lies between
 * (x0, y0) and (x1, y1): every cell the line crosses, sampled a quarter of
 * a cell apart, is open (houses, towers, halls and gates stand in the way). */
export function inSight(sim: DefendSim, x0: number, y0: number, x1: number, y1: number) {
  const d = dist(x1 - x0, y1 - y0), n = Math.floor(d * 4);
  for (let i = 1; i < n; i++) {
    const c = cellIndex(Math.floor(x0 + ((x1 - x0) * i) / n), Math.floor(y0 + ((y1 - y0) * i) / n)), t = sim.map.type[c];
    if (sim.solid[c] && t !== CellType.WALL && t !== CellType.WATER) return false;
  }
  return true;
}

/** Deadeye: the nearest enemy within `range` of `s` it sees clearly, or null
 * when every one is hidden (it holds its fire); undefined off the path. */
export function clearShot(sim: DefendSim, s: Soldier, range: number): Enemy | null | undefined {
  if (s.kind !== "sniper" || !lodgePaths(sim, s.home).deadeye) return undefined;
  const d = (e: Enemy) => sq(e.x - s.x) + sq(e.y - s.y);
  const seen = sim.enemiesNear(s.x, s.y, range).filter((e) => e.hp > 0 && d(e) <= range * range).sort((a, b) => d(a) - d(b) || a.id - b.id);
  return seen.find((e) => inSight(sim, s.x, s.y, e.x, e.y)) ?? null;
}

/** Piercing rounds: where a bullet from `s` at `e` flies (the end of its
 * reach along the line) and its line's width; undefined off the path. */
export function pierceOf(sim: DefendSim, s: Soldier, e: Enemy, range: number): Pick<Arrow, "pierce" | "tx" | "ty" | "target"> | undefined {
  if (!lodgePaths(sim, s.home).pierce) return undefined;
  const d = dist(e.x - s.x, e.y - s.y) || 1;
  return { target: -1, tx: s.x + ((e.x - s.x) / d) * range, ty: s.y + ((e.y - s.y) / d) * range, pierce: { width: PIERCING.width, hits: [] } };
}

/** A piercing bullet's flight from (x0, y0) to where it is now: every enemy
 * within its width of that stretch it hasn't struck yet, nearest first. */
export function pierceHits(sim: DefendSim, a: Arrow, x0: number, y0: number): Enemy[] {
  const len = dist(a.x - x0, a.y - y0);
  if (len < 1e-6) return [];
  const ux = (a.x - x0) / len, uy = (a.y - y0) / len, hits = a.pierce!.hits;
  const along = (e: Enemy) => (e.x - x0) * ux + (e.y - y0) * uy;
  const out: Enemy[] = [];
  for (const e of sim.enemiesNear((x0 + a.x) / 2, (y0 + a.y) / 2, len / 2 + 1.5)) {
    if (e.hp <= 0 || hits.includes(e.id)) continue;
    const t = Math.max(0, Math.min(len, along(e))), w = a.pierce!.width + enemySize(e) / 2;
    if (sq(e.x - (x0 + ux * t)) + sq(e.y - (y0 + uy * t)) <= w * w) out.push(e);
  }
  return out.sort((p, q) => along(p) - along(q) || p.id - q.id);
}

/** What a sniper's bullet of `damage` carries from its lodge: a headshot's
 * damage (every few shots, counted in `s.strikes`), the glances it has
 * left and the hold its hits take. */
export function bulletOf(sim: DefendSim, s: Soldier, damage: number): Pick<Arrow, "damage" | "glance" | "pin"> {
  const { marks, glance, suppress, deadeye, pierce } = lodgePaths(sim, s.home);
  damage *= DEADEYE.damage[deadeye] * PIERCING.damage[pierce];
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

/** Whom a sniper or a Revolutionary's laser sniper `s` would shoot now: as
 * `stepArcher` picks (Deadeye's clear shot, Big game's toughest, else the
 * nearest in reach). Pure, for the lock-on laser. */
export function sniperAim(sim: DefendSim, s: Soldier): Enemy | null {
  const range = s.kind === "railSniper" ? RAIL_SNIPER.range : sniperRange(sim, s);
  const sight = clearShot(sim, s, range);
  if (sight !== undefined) return sight;
  const big = bigGame(sim, s, range);
  if (big !== undefined) return big;
  return nearest(sim.enemiesNear(s.x, s.y, range), s, range * range, true);
}
