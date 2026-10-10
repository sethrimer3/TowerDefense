/** DEFEND's Meteor strike, a strike spell: cast from the Skills palette onto
 * the board, a meteor falls there `METEOR.fall` seconds later and bursts
 * through `sim.explode`, sparing the city's own people, then the spell waits
 * `METEOR.cooldown` seconds of battle time before it can be cast again.
 *
 * The Smithy makes it hit harder and wider (`Bonuses.meteorDamage`,
 * `meteorRadius`); the Study's paths (`knowledge-paths.ts`) change what
 * falls: Starfall breaks it into a shower of fragments, Molten core leaves
 * a burning crater, and Frost comet chills (at III freezes) all it hits.
 *
 * A meteor in flight and its landing's ring are battle state, but only a
 * cast makes them, and nothing here draws from the run's random stream until
 * one lands (`explode` does), so a run where nobody casts plays exactly as
 * before. */
import { dist } from "../exact.ts";
import { FROST_COMET, MOLTEN_CORE, STARFALL } from "../knowledge-paths.ts";
import { ENEMIES } from "./catalog.ts";
import { sheltered } from "./boats.ts";
import type { Point } from "./pathing.ts";
import type { DefendSim } from "./sim.ts";

/** The spell: the reach of its blast, the damage at its middle (falling to
 * 40% at the edge, as every blast does), its cooldown, the seconds a meteor
 * takes to fall, and the gap between a shower's fragments landing. */
export const METEOR = { radius: 2.5, damage: 120, cooldown: 40, fall: 1.2, stagger: 0.12 };
/** Seconds a landing's ring and flying rocks are drawn. */
export const IMPACT_SHOW = 0.8;
/** Where a shower's fragments land round the cast, as unit offsets: the
 * middle first, then round it so every prefix spreads evenly. */
const SHOWER: readonly [number, number][] = [
  [0, 0], [1, 0], [-0.5, 0.866], [-0.5, -0.866], [-1, 0], [0.5, 0.866], [0.5, -0.866],
];

/** What falls: rock, or Frost comet's ice. */
export type MeteorLook = "rock" | "ice";
/** A meteor in flight: where it lands, `t` of `fall` seconds down, its
 * blast's reach and damage, its size (1 whole, less for a fragment), its
 * look, and a seed for how it tumbles. */
export type Meteor = { x: number; y: number; t: number; fall: number; r: number; damage: number; size: number; look: MeteorLook; seed: number };
/** A landing, drawn while its ring spreads: where, how far, `t` seconds on. */
export type Impact = { x: number; y: number; r: number; t: number; size: number; look: MeteorLook };

/** The spell's path ranks as the battle snapshot them. */
function ranks(sim: DefendSim) {
  const p = sim.bonuses.meteor, rank = (id: string) => (p?.path === id ? p.rank : 0);
  return { starfall: rank("starfall"), molten: rank("moltenCore"), frost: rank("frostComet") };
}

/** How far the whole spell reaches (for aiming): its blast, or a shower's
 * spread plus a fragment's blast. */
export function meteorReach(sim: Pick<DefendSim, "bonuses">): number {
  const { starfall, frost } = ranks(sim as DefendSim);
  const r = METEOR.radius * sim.bonuses.meteorRadius * FROST_COMET.reach[frost];
  return starfall ? r * (STARFALL.spread + STARFALL.radius) : r;
}

/** Casts the spell at `at`: sends its meteors down and starts the cooldown.
 * Returns how many fall, or 0 while it cools down. */
export function castMeteor(sim: DefendSim, at: Point): number {
  if (sim.meteorRemaining > 0) return 0;
  sim.meteorReadyAt = sim.time + METEOR.cooldown;
  const { starfall, frost } = ranks(sim);
  const r = METEOR.radius * sim.bonuses.meteorRadius * FROST_COMET.reach[frost];
  const damage = METEOR.damage * sim.bonuses.meteorDamage;
  const look: MeteorLook = frost ? "ice" : "rock";
  const n = STARFALL.count[starfall];
  for (let i = 0; i < n; i++) {
    const [ox, oy] = SHOWER[i], out = starfall ? r * STARFALL.spread : 0;
    const x = at.x + ox * out, y = at.y + oy * out;
    sim.meteors.push({
      x, y, t: 0, fall: METEOR.fall + i * METEOR.stagger, look,
      r: starfall ? r * STARFALL.radius : r, damage: damage * STARFALL.damage[starfall], size: starfall ? 0.6 : 1,
      seed: Math.floor(x * 97 + y * 31) + i * 7919,
    });
  }
  return n;
}

/** Meteors fall and land; landings' rings spread and fade. */
export function stepMeteors(sim: DefendSim, dt: number) {
  if (sim.impacts.length) {
    for (const m of sim.impacts) m.t += dt;
    sim.impacts = sim.impacts.filter((m) => m.t < IMPACT_SHOW);
  }
  if (!sim.meteors.length) return;
  for (const m of sim.meteors) if ((m.t += dt) >= m.fall) land(sim, m);
  sim.meteors = sim.meteors.filter((m) => m.t < m.fall);
}

/** A meteor strikes: the blast, then its path's crater or frost. */
function land(sim: DefendSim, m: Meteor) {
  // One landing in a magic boat's water hisses out (`explode` makes no blast).
  const wet = sheltered(sim, m.x, m.y);
  const seed = sim.explode(m.x, m.y, { r: m.r, damage: m.damage, friendlyFire: false });
  sim.impacts.push({ x: m.x, y: m.y, r: m.r, t: 0, size: m.size, look: m.look });
  if (wet) return;
  const { molten, frost } = ranks(sim);
  if (molten)
    sim.blazes.push({
      x: m.x, y: m.y, r: m.r * MOLTEN_CORE.share[molten], t: 0, life: MOLTEN_CORE.life[molten],
      dps: MOLTEN_CORE.dps[molten] * sim.bonuses.meteorDamage, seed, ...(molten >= 3 ? { cling: true } : {}),
    });
  if (frost)
    for (const e of sim.enemiesNear(m.x, m.y, m.r)) {
      if (e.hp <= 0 || ENEMIES[e.kind].unyielding || dist(e.x - m.x, e.y - m.y) > m.r || sheltered(sim, e.x, e.y)) continue;
      e.chill = Math.max(e.chill ?? 0, FROST_COMET.chill[frost]);
      if (frost >= 3) e.freeze = Math.max(e.freeze ?? 0, FROST_COMET.freeze);
    }
}
