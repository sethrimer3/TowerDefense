/** DEFEND's Frost nova, a strike spell: cast from the Skills palette onto
 * the board, ice bursts out where it is let go, freezing every enemy within
 * `FROST_NOVA.radius` cells solid (not the unyielding), and leaves a patch
 * of rime (`sim.rime`) that chills and bites whatever walks through it until
 * it melts. Then the spell waits `FROST_NOVA.cooldown` seconds of battle time.
 *
 * The Smithy makes it last longer (`Bonuses.frostTime`: the freeze and the
 * rime) and reach farther (`frostRadius`); the Study's paths
 * (`knowledge-paths.ts`) change what the cold does: Shatter makes the frozen
 * brittle and burst into shards as they thaw (or die), Wandering blizzard
 * sets the rime hunting the nearest enemy and refreezing all inside it, and
 * Rime ward turns it into a shelter for the city's own people and walls.
 *
 * Unlike Meteor's Frost comet, nothing falls and nothing is blasted: the
 * nova's work is the freeze and the rime left behind.
 *
 * All of it is battle state, but only a cast makes any, and nothing here
 * draws from the run's random stream, so a run where nobody casts plays
 * exactly as before. */
import { dist } from "../exact.ts";
import { BLIZZARD, RIME_WARD, SHATTER } from "../knowledge-paths.ts";
import { ENEMIES } from "./catalog.ts";
import { center, type Point } from "./pathing.ts";
import type { Civilian, DefendSim, Enemy, Soldier } from "./sim.ts";

/** The spell: its reach, how long it freezes, how long the rime lasts, its
 * cooldown, how long the rime keeps what is in it chilled (refreshed each
 * step), and the damage a second the rime does. */
export const FROST_NOVA = { radius: 3, freeze: 2, life: 6, cooldown: 35, chill: 0.4, dps: 4 };
/** Seconds a burst (the nova's own, or a shatter's shards) is drawn. */
export const BURST_SHOW = 0.6;

/** A patch of rime: where, how far it reaches, `t` of `life` seconds on, a
 * seed for its frost pattern, and the seconds to a blizzard's next refreeze. */
export type Rime = { x: number; y: number; r: number; t: number; life: number; seed: number; pulse: number };
/** A burst of ice: the nova's own (`nova`: it freezes for `freeze` seconds,
 * no damage) or a shatter's shards, which hurt `damage` (and freeze for
 * `freeze` seconds); either strikes once, on the step after it was made
 * (`hit`). */
export type FrostBurst = { x: number; y: number; r: number; t: number; nova: boolean; damage: number; freeze: number; hit: boolean };

/** The spell's path ranks as the battle snapshot them. */
function ranks(sim: Pick<DefendSim, "bonuses">) {
  const p = sim.bonuses.frostNova, rank = (id: string) => (p?.path === id ? p.rank : 0);
  return { shatter: rank("shatter"), blizzard: rank("blizzard"), ward: rank("rimeWard") };
}

/** How far the nova reaches (for aiming). */
export function frostReach(sim: Pick<DefendSim, "bonuses">): number {
  return FROST_NOVA.radius * sim.bonuses.frostRadius;
}

/** Freezes `e` for `seconds`; the unyielding shrug it off. Shatter marks
 * it brittle, unless shards froze it (`mark` false), so a crowd of the
 * frozen bursts once rather than over and over. */
function freeze(sim: DefendSim, e: Enemy, seconds: number, mark = true) {
  if (e.hp <= 0 || ENEMIES[e.kind].unyielding) return false;
  e.freeze = Math.max(e.freeze ?? 0, seconds);
  if (mark && ranks(sim).shatter && !e.brittle) {
    e.brittle = true;
    sim.brittle.push(e);
  }
  return true;
}

/** Casts the spell at `at`: the burst (which freezes on the next step,
 * when the enemies are where the step finds them), the rime, and the
 * cooldown. False while it cools down. */
export function castFrostNova(sim: DefendSim, at: Point): boolean {
  const gate = sim.scenario?.spellGate;
  if (gate) {
    if (!gate.canCast("frostNova")) return false;
    gate.spend("frostNova");
  } else {
    if (sim.frostRemaining > 0) return false;
    sim.frostReadyAt = sim.time + FROST_NOVA.cooldown;
  }
  const { blizzard } = ranks(sim), r = frostReach(sim), time = sim.bonuses.frostTime;
  sim.frostBursts.push({ x: at.x, y: at.y, r, t: 0, nova: true, damage: 0, freeze: FROST_NOVA.freeze * time, hit: false });
  sim.rime.push({
    x: at.x, y: at.y, r: blizzard >= 2 ? r * BLIZZARD.grow : r, t: 0,
    life: (blizzard ? BLIZZARD.life[blizzard] : FROST_NOVA.life) * time,
    seed: Math.floor(at.x * 97 + at.y * 31) + sim.rime.length * 7919, pulse: BLIZZARD.pulse,
  });
  return true;
}

/** Whether `p` stands in any patch of rime. */
export function inRime(sim: Pick<DefendSim, "rime">, p: Point) {
  for (const f of sim.rime) if (dist(p.x - f.x, p.y - f.y) <= f.r) return true;
  return false;
}

/** How much of a blow to `unit` gets through Rime ward (1 without it). */
export function wardDefender(sim: DefendSim, unit: Soldier | Civilian) {
  return sim.rime.length && ranks(sim).ward && inRime(sim, unit) ? 1 - RIME_WARD.guard : 1;
}

/** How much of a blow to building `id` gets through Rime ward II (1 without it). */
export function wardBuilding(sim: DefendSim, id: number) {
  return sim.rime.length && ranks(sim).ward >= 2 && inRime(sim, center(sim.map.buildings[id].rect)) ? 1 - RIME_WARD.walls : 1;
}

/** An enemy dies: at Shatter III, one frozen or in the rime bursts into shards. */
export function frostDeath(sim: DefendSim, e: Enemy) {
  const { shatter } = ranks(sim);
  if (shatter < 3 || !(e.freeze || (sim.rime.length && inRime(sim, e)))) return;
  shards(sim, e, shatter);
}

function shards(sim: DefendSim, at: Point, rank: number) {
  sim.frostBursts.push({ x: at.x, y: at.y, r: SHATTER.radius[rank], t: 0, nova: false, damage: SHATTER.damage[rank], freeze: rank >= 3 ? SHATTER.freeze : 0, hit: false });
}

/** Bursts hit and fade; the brittle thaw (and at Shatter II burst); the
 * rime chills, bites, drifts, refreezes, heals and melts. */
export function stepFrostNova(sim: DefendSim, dt: number) {
  if (sim.frostBursts.length) {
    for (const b of sim.frostBursts) {
      b.t += dt;
      if (b.hit) continue;
      b.hit = true;
      for (const e of sim.enemiesNear(b.x, b.y, b.r)) {
        if (e.hp <= 0 || dist(e.x - b.x, e.y - b.y) > b.r) continue;
        if (b.nova) {
          freeze(sim, e, b.freeze);
          continue;
        }
        sim.hurtEnemy(e, b.damage, true, "ranged", { x: b.x, y: b.y });
        if (b.freeze) freeze(sim, e, b.freeze, false);
      }
    }
    sim.frostBursts = sim.frostBursts.filter((b) => b.t < BURST_SHOW);
  }
  if (sim.brittle.length) {
    const { shatter } = ranks(sim);
    for (const e of sim.brittle) {
      if (e.hp > 0 && e.freeze) continue;
      delete e.brittle;
      // Thawed: from II it bursts (and takes its own shards).
      if (e.hp > 0 && shatter >= 2) shards(sim, e, shatter);
    }
    sim.brittle = sim.brittle.filter((e) => e.brittle);
  }
  if (!sim.rime.length) return;
  const { blizzard, ward } = ranks(sim);
  const bite = FROST_NOVA.dps * (blizzard >= 3 ? BLIZZARD.bite : 1);
  for (const f of sim.rime) {
    f.t += dt;
    if (blizzard) hunt(sim, f, BLIZZARD.speed[blizzard] * dt);
    const pulse = blizzard >= 2 && (f.pulse -= dt) <= 0;
    if (pulse) f.pulse += BLIZZARD.pulse;
    for (const e of sim.enemiesNear(f.x, f.y, f.r)) {
      if (e.hp <= 0 || dist(e.x - f.x, e.y - f.y) > f.r) continue;
      if (!ENEMIES[e.kind].unyielding || e.kind === "blightWorm") e.chill = Math.max(e.chill ?? 0, FROST_NOVA.chill);
      sim.hurtEnemy(e, bite * dt, false);
      if (pulse) freeze(sim, e, BLIZZARD.pulseFreeze);
    }
    if (ward >= 3)
      for (const s of sim.soldiers)
        if (s.hp > 0 && dist(s.x - f.x, s.y - f.y) <= f.r) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * RIME_WARD.heal * dt);
  }
  sim.rime = sim.rime.filter((f) => f.t < f.life);
}

/** A wandering blizzard moves up to `step` cells toward the nearest living
 * enemy (the first found, on a tie). */
function hunt(sim: DefendSim, f: Rime, step: number) {
  let best: Enemy | null = null, bd = Infinity;
  for (const e of sim.enemies) {
    if (e.hp <= 0 || e.fortressPart) continue;
    const d = dist(e.x - f.x, e.y - f.y);
    if (d < bd) { best = e; bd = d; }
  }
  if (!best || bd < 0.05) return;
  const k = Math.min(step, bd) / bd;
  f.x += (best.x - f.x) * k;
  f.y += (best.y - f.y) * k;
}
