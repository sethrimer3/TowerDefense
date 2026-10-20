/** The Melee Guild's spearmen line: a Spearmen hall's spearmen (a long
 * reach), and the three halls it becomes, a Phalanx's hoplites (slow,
 * shielded, taking `HOPLITE.guard` of every blow), a Javelin camp's
 * javelineers (thrown spears, through `troops.ts`'s `stepArcher`) and a
 * Lancer stable's lancers (fast riders whose first thrust at each enemy is
 * a charge). The spearmen, hoplites and lancers chase through
 * `stepSwordsman`, with their strikes here.
 *
 * Their paths: the hall's Long spears (further, running through to the
 * enemy behind) and Set spears (braced thrusts on the unhurt, staggering);
 * the Phalanx's Testudo (locked shields, holding the line) and Spear wall
 * (every enemy in reach struck); the camp's Barbed javelins (slowing,
 * staggering, boar spears for big game) and Throwing arms (further, two at
 * a time, quicker); the stable's Heavy lance (harder charges that stagger
 * and trample) and Winged lancers (faster, further, healing charges),
 * whose crown makes it a Valkyrie palace.
 *
 * Nothing here draws from the random stream, and the one state it leaves,
 * `Soldier.lanced`, is absent without lancers, so replays are untouched. */
import { BARBED, HEAVY_LANCE, LONG_SPEARS, SET_SPEARS, SPEAR_WALL, TESTUDO, THROWING, WINGED, pathRank, type BattlePaths } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { dist, sq } from "../exact.ts";
import { ENEMIES, HOPLITE, JAVELINEER, LANCER, SPEARMAN, enemySize } from "./catalog.ts";
import type { Arrow, Civilian, DefendSim, Enemy, Soldier } from "./sim.ts";

/** The spear line's path ranks of the building `home`: 0 for each it doesn't climb. */
export function spearPaths(sim: DefendSim, home: number) {
  const p: BattlePaths | undefined = home >= 0 ? buildingPaths(sim, sim.map.buildings[home]) : undefined;
  return {
    long: pathRank(p, "spearHall", "longSpears"),
    set: pathRank(p, "spearHall", "setSpears"),
    testudo: pathRank(p, "phalanx", "testudo"),
    wall: pathRank(p, "phalanx", "spearWall"),
    barbed: pathRank(p, "javelinCamp", "barbed"),
    arms: pathRank(p, "javelinCamp", "throwingArms"),
    heavy: pathRank(p, "lancerStable", "heavyLance"),
    winged: pathRank(p, "lancerStable", "wingedLancers"),
  };
}

/** The line's melee kinds, which chase like swordsmen. */
export type Spear = "spearman" | "hoplite" | "lancer";
export const SPEARS = { spearman: SPEARMAN, hoplite: HOPLITE, lancer: LANCER };
export const isSpear = (kind: string): kind is Spear => kind in SPEARS;

/** How far a spear reaches: Long spears further. */
export const spearReach = (sim: DefendSim, s: Soldier & { kind: Spear }) =>
  SPEARS[s.kind].reach + (s.kind === "spearman" ? LONG_SPEARS.reach[spearPaths(sim, s.home).long] : 0);

/** How fast it walks (or rides): Winged lancers faster. */
export const spearSpeed = (sim: DefendSim, s: Soldier & { kind: Spear }) =>
  SPEARS[s.kind].speed * (s.kind === "lancer" ? WINGED.speed[spearPaths(sim, s.home).winged] : 1);

/** Its leash as a share of a swordsman's: Winged lancers' far patrols. */
export const spearLeash = (sim: DefendSim, s: Soldier) => (s.kind === "lancer" ? WINGED.leash[spearPaths(sim, s.home).winged] : 1);

/** Whether `e` can be staggered, and staggers it for `t` seconds. */
function stagger(e: Enemy, t: number) {
  if (e.hp > 0 && !ENEMIES[e.kind].unyielding) e.stagger = Math.max(e.stagger ?? 0, t);
}

/** One thrust of `s` at `e` for `base` damage. */
export function spearStrike(sim: DefendSim, s: Soldier & { kind: Spear }, e: Enemy, base: number) {
  const p = spearPaths(sim, s.home);
  if (s.kind === "hoplite") {
    const damage = base * SPEAR_WALL.damage[p.wall];
    sim.hurtEnemy(e, damage, true, "melee", s);
    // A hedge of spears: every other enemy within reach.
    const share = SPEAR_WALL.share[p.wall];
    if (share) {
      const reach = HOPLITE.reach;
      for (const o of sim.enemiesNear(s.x, s.y, reach + 1))
        if (o !== e && o.hp > 0 && dist(o.x - s.x, o.y - s.y) <= reach + enemySize(o) / 2) sim.hurtEnemy(o, damage * share, true, "melee", s);
    }
    return;
  }
  if (s.kind === "lancer") {
    const charge = s.lanced !== e.id;
    s.lanced = e.id;
    const damage = base * (charge ? HEAVY_LANCE.charge[p.heavy] : 1);
    sim.hurtEnemy(e, damage, true, "melee", s);
    if (!charge) return;
    sim.effects.push({ kind: "spark", x: e.x, y: e.y, t: 0, r: 0.6 });
    if (p.heavy >= 2) stagger(e, HEAVY_LANCE.stagger);
    // Trample: every other enemy beside the target.
    if (p.heavy >= 3)
      for (const o of sim.enemiesNear(e.x, e.y, HEAVY_LANCE.trample))
        if (o !== e && o.hp > 0 && sq(o.x - e.x) + sq(o.y - e.y) <= sq(HEAVY_LANCE.trample)) sim.hurtEnemy(o, damage * HEAVY_LANCE.share, true, "melee", s);
    if (p.winged >= 3) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * WINGED.heal);
    return;
  }
  // A spearman: braced against the unhurt, then on through to the one behind.
  const fresh = e.hp >= e.maxHp;
  const damage = base * (p.long >= 3 ? LONG_SPEARS.damage : 1);
  sim.hurtEnemy(e, damage * (fresh ? SET_SPEARS.fresh[p.set] : 1), true, "melee", s);
  if (p.set >= 2) stagger(e, SET_SPEARS.stagger);
  const share = LONG_SPEARS.share[p.long];
  if (share) {
    const behind = runThrough(sim, s, e);
    if (behind) sim.hurtEnemy(behind, damage * share, true, "melee", s);
  }
}

/** The nearest living enemy within `LONG_SPEARS.through` cells of `e` and
 * beyond it, seen from `s`; ties to the lowest id. */
export function runThrough(sim: DefendSim, s: Soldier, e: Enemy): Enemy | null {
  const fx = e.x - s.x, fy = e.y - s.y;
  let best: Enemy | null = null, bd = sq(LONG_SPEARS.through);
  for (const o of sim.enemiesNear(e.x, e.y, LONG_SPEARS.through)) {
    if (o === e || o.hp <= 0 || (o.x - e.x) * fx + (o.y - e.y) * fy <= 0) continue;
    const d = sq(o.x - e.x) + sq(o.y - e.y);
    if (d < bd || (d === bd && best && o.id < best.id)) { best = o; bd = d; }
  }
  return best;
}

/** Hold the line: Testudo III hoplites slow every enemy within reach. */
export function holdLine(sim: DefendSim, s: Soldier) {
  if (s.kind !== "hoplite" || spearPaths(sim, s.home).testudo < 3) return;
  const reach = HOPLITE.reach;
  for (const e of sim.enemiesNear(s.x, s.y, reach + 1))
    if (e.hp > 0 && dist(e.x - s.x, e.y - s.y) <= reach + enemySize(e) / 2) e.chill = Math.max(e.chill ?? 0, TESTUDO.chill);
}

/** The share of a blow a defender takes from its shield: a hoplite's guard,
 * less with Testudo and its comrades close by; exactly 1 for everyone else. */
export function hopliteGuard(sim: DefendSim, u: Soldier | Civilian) {
  if (!("kind" in u) || u.kind !== "hoplite") return 1;
  const t = spearPaths(sim, u.home).testudo;
  let guard = HOPLITE.guard * TESTUDO.guard[t];
  if (t >= 2) {
    let near = 0;
    for (const o of sim.soldiers)
      if (o !== u && o.kind === "hoplite" && o.hp > 0 && sq(o.x - u.x) + sq(o.y - u.y) <= sq(TESTUDO.near) && ++near >= TESTUDO.most) break;
    guard *= 1 - TESTUDO.ally * near;
  }
  return guard;
}

// ── Javelineers ─────────────────────────────────────────────────────────

/** How far a javelineer throws. */
export const javelinRange = (sim: DefendSim, s: Soldier) => JAVELINEER.range + THROWING.range[spearPaths(sim, s.home).arms];
/** How long it takes to throw again. */
export const javelinReload = (sim: DefendSim, s: Soldier) => JAVELINEER.cooldown * THROWING.reload[spearPaths(sim, s.home).arms];

/** What a javelin of `damage` thrown at `e` carries: Boar spears' weight
 * on big game, and the barbs' hold (`Arrow.pin`, absent off the path). */
export function javelinOf(sim: DefendSim, s: Soldier, e: Enemy, damage: number): Pick<Arrow, "damage" | "pin"> {
  const barbed = spearPaths(sim, s.home).barbed;
  return {
    damage: damage * (barbed >= 3 && enemySize(e) >= BARBED.big ? BARBED.bigDamage : 1),
    ...(barbed ? { pin: { chill: BARBED.chill, ...(barbed >= 2 ? { stagger: BARBED.stagger } : {}) } } : {}),
  };
}

/** Throwing arms' second javelin: the next nearest enemies in reach. */
export function javelinExtras(sim: DefendSim, s: Soldier, e: Enemy, range: number): Enemy[] {
  const n = THROWING.extra[spearPaths(sim, s.home).arms];
  if (!n) return [];
  return sim.enemiesNear(s.x, s.y, range)
    .filter((o) => o !== e && o.hp > 0 && sq(o.x - s.x) + sq(o.y - s.y) <= range * range)
    .sort((a, b) => sq(a.x - s.x) + sq(a.y - s.y) - (sq(b.x - s.x) + sq(b.y - s.y)) || a.id - b.id)
    .slice(0, n);
}
