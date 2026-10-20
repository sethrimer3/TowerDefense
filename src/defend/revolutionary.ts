/** The Revolutionary's laser snipers in battle. They roam and shoot like the
 * other ranged troops (`troops.ts`), and its shared tree
 * (`revolutionary-upgrades.ts`, snapshotted as `Bonuses.revolutionary`)
 * sets how many it keeps (`squadSize`), how many enemies one bullet
 * strikes (`chainTargets`: the laser picks them all before it fires, each
 * the nearest not yet picked to the last, and the bullet flies from one to
 * the next, `Arrow.chain`), the chance each hit is critical and what that
 * multiplies (`railHit`), and the burst where the bullet stops
 * (`railOn`).
 *
 * `Arrow.chain` is absent on every other shot, and a critical chance is
 * rolled (from the battle's one random stream) only while one has been
 * bought, so runs without a Revolutionary replay unchanged. */
import { sq } from "../exact.ts";
import { CHAIN, CRIT_CHANCE, CRIT_DAMAGE, DETONATOR, SQUAD, revolutionaryRank } from "../revolutionary-upgrades.ts";
import type { Point } from "./pathing.ts";
import type { Arrow, DefendSim, Enemy, Soldier } from "./sim.ts";

const rank = (sim: DefendSim, id: Parameters<typeof revolutionaryRank>[1]) => revolutionaryRank(sim.bonuses.revolutionary, id);

/** How many snipers each Revolutionary keeps. */
export const squadSize = (sim: DefendSim) => SQUAD.snipers[rank(sim, "squad")];

/** The enemies one bullet aimed at `first` will strike, in order: `first`,
 * then each the nearest living enemy not yet picked within `CHAIN.jump` of
 * the last (the lower id of equals). Pure, so the art draws the same
 * zigzag the sim fires. */
export function chainTargets(sim: DefendSim, first: Enemy): Enemy[] {
  const n = CHAIN.hits[rank(sim, "chain")], out = [first];
  while (out.length < n) {
    const last = out[out.length - 1];
    let next: Enemy | null = null, bd = sq(CHAIN.jump);
    for (const o of sim.enemiesNear(last.x, last.y, CHAIN.jump)) {
      const d = sq(o.x - last.x) + sq(o.y - last.y);
      if (o.hp > 0 && !out.includes(o) && (d < bd || (d === bd && next && o.id < next.id))) { next = o; bd = d; }
    }
    if (!next) break;
    out.push(next);
  }
  return out;
}

/** A laser sniper's bullet at `e`: it carries the rest of the chain. */
export function railShot(sim: DefendSim, s: Soldier, e: Enemy, damage: number): Arrow {
  const [, ...next] = chainTargets(sim, e);
  return { x: s.x, y: s.y, origin: { x: s.x, y: s.y, attacker: s.id }, target: e.id, damage, tx: e.x, ty: e.y, life: 2, shot: "bullet", chain: { next: next.map((o) => o.id), from: { x: s.x, y: s.y } } };
}

/** What one hit of a laser sniper's bullet does: critical, now and then, by
 * Overclock's chance, for Hollow core's multiple (a spark marks it). */
export function railHit(sim: DefendSim, a: Arrow, e: Enemy): number {
  const chance = CRIT_CHANCE.chance[rank(sim, "critChance")];
  if (!chance || sim.rand() >= chance) return a.damage;
  sim.effects.push({ kind: "spark", x: e.x, y: e.y, t: 0, r: 0.9 });
  return a.damage * CRIT_DAMAGE.times[rank(sim, "critDamage")];
}

/** A laser sniper's bullet has reached (`at`) its mark, which it struck for
 * `hit`: it flies on to the next of its chain still standing, or, at the
 * last, bursts there with Detonator, sparing your own people. */
export function railOn(sim: DefendSim, a: Arrow, at: Point, hit: number) {
  const byId = new Map(sim.enemies.map((e) => [e.id, e]));
  const left = a.chain!.next.filter((id) => (byId.get(id)?.hp ?? 0) > 0);
  if (left.length) {
    const t = byId.get(left[0])!;
    sim.arrows.push({ x: at.x, y: at.y, origin: a.origin, target: t.id, damage: a.damage, tx: t.x, ty: t.y, life: 2, shot: "bullet", chain: { next: left.slice(1), from: { x: at.x, y: at.y } } });
    return;
  }
  const r = DETONATOR.radius[rank(sim, "splash")];
  if (r) sim.explode(at.x, at.y, { r, damage: hit * DETONATOR.share, friendlyFire: false, origin: a.origin });
}
