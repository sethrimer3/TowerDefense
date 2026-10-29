/** The Gunner hall's line: the gunners' own numbers bent by their
 * buildings' paths. The Gunner hall's Quickdraw (quicker reloads, a second
 * pistol at III) and Duelists (harder, further, every 3rd shot critical at
 * III); the Machine-gun nest's Belt feed (quicker reloads, harder bullets
 * from II, crowned into the Gatling emplacement) and Tripod (further,
 * harder); the Gatling emplacement's Gun shield (more life, a quicker gun
 * from II), Overdrive (all damage, no push) and Stopping power (all push,
 * little damage: each bullet knocks its enemy back, `knockBack`); the Rocket
 * battery's Cluster rockets (wider bursts, bomblets from II, burning
 * ground at III) and Salvo racks (quicker reloads, more rockets a launch).
 * The gunners, Gatling gunners and rocketeers shoot through `troops.ts`,
 * the rockets bursting through `burstBall` (`muskets.ts`). Nothing here
 * draws from the random stream, and off the paths every number is the
 * catalog's. */
import { BELT_FEED, CLUSTER, DUELISTS, GUN_SHIELD, OVERDRIVE, QUICKDRAW, SALVO, STOPPING, TRIPOD, pathRank, type BattlePaths } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { dist, sq } from "../exact.ts";
import { blocked } from "./pathing.ts";
import { cellInBounds } from "./grid.ts";
import { ENEMIES, GATLING_GUNNER, GUNNER, MACHINE_GUNNER, ROCKETEER } from "./catalog.ts";
import type { Arrow, DefendSim, Enemy, Soldier } from "./sim.ts";

/** The gun line's path ranks of the building `home`: 0 for each it doesn't climb. */
export function gunPaths(sim: DefendSim, home: number) {
  const p: BattlePaths | undefined = buildingPaths(sim, sim.map.buildings[home]);
  return {
    belt: pathRank(p, "gunNest", "beltFeed"),
    tripod: pathRank(p, "gunNest", "tripod"),
    quick: pathRank(p, "gunHall", "quickdraw"),
    duel: pathRank(p, "gunHall", "duelists"),
    shield: pathRank(p, "gatlingNest", "gunShield"),
    over: pathRank(p, "gatlingNest", "overdrive"),
    stop: pathRank(p, "gatlingNest", "stoppingPower"),
    cluster: pathRank(p, "rocketBattery", "clusterRockets"),
    salvo: pathRank(p, "rocketBattery", "salvoRacks"),
  };
}

/** The gun line's kinds this module bends. */
export type Gun = "gunner" | "machineGunner" | "gatlingGunner" | "rocketeer";
const BASE = { gunner: GUNNER, machineGunner: MACHINE_GUNNER, gatlingGunner: GATLING_GUNNER, rocketeer: ROCKETEER };
export const isGun = (kind: string): kind is Gun => kind in BASE;

/** How far a gunner of the line shoots. */
export function gunRange(sim: DefendSim, s: Soldier & { kind: Gun }) {
  const g = gunPaths(sim, s.home), base = BASE[s.kind].range;
  if (s.kind === "gunner") return base + DUELISTS.range[g.duel];
  if (s.kind === "machineGunner") return base + TRIPOD.range[g.tripod];
  return base;
}

/** How hard its shot hits, of `damage`; a Duelist's every 3rd shot counts
 * in `Soldier.strikes`, which stays absent off that path. */
export function gunDamage(sim: DefendSim, s: Soldier & { kind: Gun }, damage: number) {
  const g = gunPaths(sim, s.home);
  if (s.kind === "gunner") {
    if (g.duel < 3) return damage * DUELISTS.damage[g.duel];
    s.strikes = (s.strikes ?? 0) + 1;
    return damage * DUELISTS.damage[g.duel] * (s.strikes % DUELISTS.every === 0 ? DUELISTS.crit : 1);
  }
  if (s.kind === "machineGunner") return damage * (g.belt >= 2 ? BELT_FEED.damage : 1) * TRIPOD.damage[g.tripod];
  if (s.kind === "gatlingGunner") return damage * OVERDRIVE.damage[g.over] * STOPPING.damage[g.stop];
  return damage;
}

/** Its reload. */
export function gunReload(sim: DefendSim, s: Soldier & { kind: Gun }) {
  const g = gunPaths(sim, s.home), base = BASE[s.kind].cooldown;
  if (s.kind === "gunner") return base * QUICKDRAW.reload[g.quick];
  if (s.kind === "machineGunner") return base * BELT_FEED.reload[g.belt];
  if (s.kind === "gatlingGunner") return base * OVERDRIVE.reload[g.over];
  return base * SALVO.reload[g.salvo];
}

/** How fast it walks: a Gun shield's wheeled carriage quicker. */
export const gunSpeed = (sim: DefendSim, s: Soldier & { kind: Gun }) =>
  BASE[s.kind].speed * (s.kind === "gatlingGunner" && gunPaths(sim, s.home).shield >= 2 ? GUN_SHIELD.speed : 1);

/** A recruit's life, as a share of its catalog's: Gun shield's more. */
export const gunHp = (sim: DefendSim, home: number, kind: string) => (kind === "gatlingGunner" ? GUN_SHIELD.hp[gunPaths(sim, home).shield] : 1);

/** The next nearest enemies within `range` of `s` besides `e` that its
 * extra shots go for: Twin pistols' one, Salvo racks' rockets. */
export function gunExtras(sim: DefendSim, s: Soldier & { kind: Gun }, e: Enemy, range: number, pool?: Enemy[]): Enemy[] {
  const g = gunPaths(sim, s.home);
  const extra = s.kind === "gunner" ? (g.quick >= 3 ? 1 : 0) : s.kind === "rocketeer" ? SALVO.rockets[g.salvo] - 1 : 0;
  if (!extra) return [];
  const d = (o: Enemy) => sq(o.x - s.x) + sq(o.y - s.y);
  return (pool ?? sim.enemiesNear(s.x, s.y, range)).filter((o) => !o.untargetable && o !== e && o.hp > 0 && d(o) <= range * range).sort((a, b) => d(a) - d(b)).slice(0, extra);
}

/** What a rocket carries from its battery for `damage`: its burst, wider
 * on Cluster rockets, with bomblets from II and burning ground at III. */
export function rocketOf(sim: DefendSim, home: number, damage: number): Pick<Arrow, "grenade" | "blast"> {
  const c = gunPaths(sim, home).cluster, blast = ROCKETEER.blast + CLUSTER.blast[c];
  if (c < 2) return { blast };
  return { blast, grenade: { life: CLUSTER.burn[c], dps: damage * CLUSTER.burnShare, bomblets: CLUSTER.bomblets[c] } };
}

/** What a bullet of `s` carries: Stopping power's knock; nothing otherwise. */
export function gunShot(sim: DefendSim, s: Soldier & { kind: Gun }): Pick<Arrow, "knock"> {
  const stop = s.kind === "gatlingGunner" ? gunPaths(sim, s.home).stop : 0;
  return stop ? { knock: STOPPING.push[stop] } : {};
}

/** A Stopping power bullet has hit `e`: knock it `a.knock` cells straight
 * back from where it was fired, in short steps that stop at anything solid
 * (fliers only at the board's edge). Bosses, fortresses, boats and the
 * unyielding stand firm. */
export function knockBack(sim: DefendSim, a: Arrow, e: Enemy) {
  const def = ENEMIES[e.kind], from = a.origin ?? { x: a.x, y: a.y };
  if (!a.knock || e.hp <= 0 || def.boss || def.fortress || e.fortressPart || def.boat || def.unyielding) return;
  const d = dist(e.x - from.x, e.y - from.y);
  if (d < 0.01) return;
  const n = Math.max(1, Math.ceil(a.knock / 0.1)), dx = ((e.x - from.x) / d) * a.knock / n, dy = ((e.y - from.y) / d) * a.knock / n;
  for (let i = 0; i < n; i++) {
    const x = e.x + dx, y = e.y + dy;
    if (def.flying ? !cellInBounds(x, y) : blocked(sim.foeSolid, x, y)) break;
    e.x = x;
    e.y = y;
  }
}
