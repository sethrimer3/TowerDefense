/** The Assassins' den's assassins: quick, frail swordsmen of a kind (they
 * walk and chase through `troops.ts`) whose strikes are their own. Every
 * `every`th strike is critical (counted, never rolled, so a replay plays
 * the same), and the den's Knowledge paths (`knowledge-paths.ts`) turn
 * them into Bloodletters (huge criticals, less HP), Shadowcloak (unseen
 * until they strike, ambushing from the cloak), Venomblades (poison that
 * makes an enemy take more damage from everything, spreading at III) or
 * Headhunters (the toughest prey in reach first, a bounty of its HP).
 *
 * The state they leave is optional (`Soldier.cloak`, `Enemy.venom`) and
 * absent in every run without a den on those paths, so replays are
 * untouched. */
import { sq } from "../exact.ts";
import { BLOODLETTERS, HEADHUNT, SHADOWCLOAK, VENOM, pathRank, type BattlePaths } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";

/** A den's path ranks: each 0 unless its building climbs it. */
export function denPaths(sim: DefendSim, home: number) {
  const p: BattlePaths | undefined = buildingPaths(sim, sim.map.buildings[home]);
  return {
    blood: pathRank(p, "assassinDen", "bloodletters"),
    cloak: pathRank(p, "assassinDen", "shadowcloak"),
    venom: pathRank(p, "assassinDen", "venom"),
    hunt: pathRank(p, "assassinDen", "headhunters"),
  };
}

/** An assassin's HP as a share of its own: Bloodletters give theirs up. */
export const assassinHp = (sim: DefendSim, home: number) => BLOODLETTERS.hp[denPaths(sim, home).blood];

/** A fresh recruit's optional state: Shadowcloak's start cloaked. */
export const recruitState = (sim: DefendSim, home: number): Partial<Soldier> => (denPaths(sim, home).cloak ? { cloak: 0 } : {});

/** Whether no enemy can pick `u` out: an assassin in its cloak. */
export const cloaked = (u: object) => "cloak" in u && (u as Soldier).cloak === 0;

/** Counts down an assassin's unveiling: at 0 it is cloaked again. */
export function stepCloak(s: Soldier, dt: number) {
  if (s.cloak) s.cloak = Math.max(0, s.cloak - dt);
}

/** How far a headhunter ranges, as a share of the leash (Infinity: the whole city). */
export function huntReach(sim: DefendSim, home: number) {
  const hunt = denPaths(sim, home).hunt;
  return hunt >= 3 ? Infinity : hunt >= 2 ? HEADHUNT.leash : 1;
}

/** Whether `s` goes for the toughest prey rather than the nearest. */
export const headhunter = (sim: DefendSim, s: Soldier) => s.kind === "assassin" && denPaths(sim, s.home).hunt > 0;

/** The toughest first (most HP), the nearest among equals. */
export const toughestFirst = (from: { x: number; y: number }) => (a: Enemy, b: Enemy) =>
  b.hp - a.hp || sq(a.x - from.x) + sq(a.y - from.y) - (sq(b.x - from.x) + sq(b.y - from.y));

/** One assassin's strike on `e` for `base` damage. */
export function assassinStrike(sim: DefendSim, s: Soldier, e: Enemy, base: number) {
  const { blood, cloak, venom, hunt } = denPaths(sim, s.home);
  s.strikes = (s.strikes ?? 0) + 1;
  const crit = s.strikes % BLOODLETTERS.every[blood] === 0;
  const ambush = cloak > 0 && s.cloak === 0;
  let damage = base * (crit ? BLOODLETTERS.crit[blood] : 1) * (ambush ? SHADOWCLOAK.ambush[cloak] : 1);
  if (hunt) damage += Math.min(e.maxHp * HEADHUNT.bounty[hunt], base * HEADHUNT.cap);
  // Poisoned before the blow lands, so the blow itself bites harder.
  if (venom) envenom(e, VENOM.time[venom], VENOM.more[venom], base * VENOM.share, venom >= 3);
  sim.hurtEnemy(e, damage, true, "melee", s);
  if (cloak) s.cloak = cloak >= 3 && e.hp <= 0 ? 0 : SHADOWCLOAK.reveal[cloak];
  if (crit || ambush) sim.effects.push({ kind: "spark", x: e.x, y: e.y, t: 0, r: crit && ambush ? 0.8 : 0.5 });
}

/** Poisons `e` for `t` seconds: `more` times the damage it takes, `dps` a
 * second; a fresh dose renews it, never weakening one already stronger. */
export function envenom(e: Enemy, t: number, more: number, dps: number, spread: boolean) {
  const v = e.venom;
  e.venom = {
    t: Math.max(t, v?.t ?? 0),
    more: Math.max(more, v?.more ?? 1),
    dps: Math.max(dps, v?.dps ?? 0),
    ...(spread || v?.spread ? { spread: true as const } : {}),
  };
}

/** The venom bites and wears off. */
export function stepVenom(sim: DefendSim, dt: number) {
  for (const e of sim.enemies) {
    const v = e.venom;
    if (!v) continue;
    if (e.hp > 0) sim.hurtEnemy(e, v.dps * Math.min(dt, v.t), false, "melee");
    if ((v.t -= dt) <= 0) delete e.venom;
  }
}

/** Plague: an enemy that dies envenomed passes its venom on. */
export function spreadVenom(sim: DefendSim, e: Enemy) {
  const v = e.venom;
  if (!v?.spread) return;
  for (const o of sim.enemiesNear(e.x, e.y, VENOM.spread))
    if (o !== e && o.hp > 0 && sq(o.x - e.x) + sq(o.y - e.y) <= sq(VENOM.spread)) envenom(o, VENOM.time[3], v.more, v.dps, true);
}
