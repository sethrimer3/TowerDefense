/** Mage Guild battle snapshots and bounded, independent elemental effects. */
import { CONDUCTION, CRYOMANCY, pathRank } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { ENEMIES, FIREBALL_RANGE } from "./catalog.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";
import type { Point } from "./pathing.ts";
import { bannerDamage } from "./war-banner.ts";

export type MageFamily = "plain" | "fire" | "frost" | "storm";
export type MageChill = { speed: number; left: number };
export type MageBolt = { pts: Point[]; critical: boolean[]; t: number; life: number; seed: number };

export function mageAttunement(sim: Pick<DefendSim, "bonuses" | "map">, home?: number): { family: MageFamily; rank: number; range: number } {
  const b = home === undefined ? undefined : sim.map.buildings[home], paths = buildingPaths(sim, b);
  const storm = pathRank(paths, "stormHall", "conduction"), frost = pathRank(paths, "cinderHall", "cinders"), fire = pathRank(paths, "infernoHall", "pyroclasm");
  if (b?.kind === "stormHall" || storm) return { family: "storm", rank: storm, range: CONDUCTION.range[storm] };
  if (b?.kind === "cinderHall" || frost) return { family: "frost", rank: frost, range: CRYOMANCY.range[frost] };
  if (b?.kind === "infernoHall" || fire) return { family: "fire", rank: fire, range: FIREBALL_RANGE };
  return { family: "plain", rank: 0, range: FIREBALL_RANGE };
}

/** Every real link rolls once; criticals never multiply the next link's base. */
export function castStorm(sim: DefendSim, s: Soldier, first: Enemy, rank: number) {
  const pts: Point[] = [{ x: s.x, y: s.y - .2 }], critical: boolean[] = [], struck = new Set<number>();
  let target: Enemy | null = first, damage = bannerDamage(sim, s);
  while (target && struck.size < CONDUCTION.targets[rank]) {
    struck.add(target.id);
    const crit = sim.rand() < CONDUCTION.crit[rank];
    critical.push(crit); pts.push({ x: target.x, y: target.y });
    // Matches existing chain lightning's shield, resistance and reflection rules.
    sim.hurtEnemy(target, damage * (crit ? CONDUCTION.critical : 1), true, "ranged", { ...pts[pts.length - 2], attacker: s.id });
    if (struck.size >= CONDUCTION.targets[rank]) break;
    target = sim.chainTarget(target.x, target.y, CONDUCTION.jump[rank], struck);
    damage *= CONDUCTION.retain;
  }
  sim.mageBolts.push({ pts, critical, t: 0, life: CONDUCTION.life, seed: first.id });
}

/** Four independently expiring strengths, never one status per attacking mage. */
export function chillByMage(e: Enemy, speed: number, seconds: number, freeze: number) {
  if (e.hp <= 0 || ENEMIES[e.kind].unyielding) return;
  const chills = e.mageChills ??= [], old = chills.find(c => c.speed === speed);
  if (old) old.left = Math.max(old.left, seconds);
  else chills.push({ speed, left: seconds });
  e.freeze = Math.max(e.freeze ?? 0, freeze);
}

export function mageChillSpeed(e: Enemy): number {
  if (!e.mageChills) return 1;
  let speed = 1;
  for (const c of e.mageChills) if (c.left > 0) speed = Math.min(speed, c.speed);
  return speed;
}

export function ageMageChill(e: Enemy, dt: number) {
  if (!e.mageChills) return;
  e.mageChills = e.mageChills.filter(c => (c.left -= dt) > 0);
  if (!e.mageChills.length) delete e.mageChills;
}
