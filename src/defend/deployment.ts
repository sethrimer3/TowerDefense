/** DEFEND deployment: how far a troop building's troops may go from it.
 * Each troop has a base deployment range by kind (`DEPLOY_RANGE`, stronger
 * troops further), times the Smithy's Deployment range (`Bonuses.deployRange`),
 * measured from its home building's middle. Troops never step out of it
 * (`fence`, after each troop's step), hunt and stroll only within it, and
 * answer the war banner or a rally flag only when it stands inside it
 * (`bannerFor`).
 *
 * The player may aim a troop building in battle (`DefendSim.rallies`): its
 * rally point is where its troops go when they have nothing to fight
 * (`postPath`), kept inside the range (`rallyAim`). Snapped onto a watch
 * tower (`Rally.tower`), the gunner line climbs into it; nobody climbs a
 * tower otherwise. Troops a spell brought (`home` -1) and a cloudborne
 * palace's valkyries have no range. Nothing draws from the random stream. */
import { dist, sq } from "../exact.ts";
import type { Bonuses } from "./catalog.ts";
import type { Building, BuildingKind } from "./citygen.ts";
import { CELLS_H, CELLS_W, cellInBounds, cellIndex } from "./grid.ts";
import { cellAt, cellCenter, center, findPath, type Point } from "./pathing.ts";
import type { DefendSim, Soldier } from "./sim.ts";
import { WarBanner } from "./war-banner.ts";

/** What each troop building trains. */
export const TRAINS: Partial<Record<BuildingKind, Soldier["kind"]>> = {
  barracks: "sword", chapterHouse: "sword", berserkerLodge: "sword", halberdYard: "sword", heroHall: "hero", shadow: "shade", archerBarracks: "archer", rangerLodge: "archer", skirmishCamp: "archer", skyrangerLodge: "archer", mageGuild: "mage", infernoHall: "mage", cinderHall: "mage", stormHall: "mage", valkyriePalace: "valkyrie", darkKeep: "darkWizard",
  meleeGuild: "brawler", rangedGuild: "slinger", assassinDen: "assassin", bloodHall: "assassin", veilHouse: "assassin", poisonDen: "assassin", sniperLodge: "sniper", musketHall: "musketeer",
  spearHall: "spearman", phalanx: "hoplite", javelinCamp: "javelineer", lancerStable: "lancer",
  gunHall: "gunner", gunNest: "machineGunner", gatlingNest: "gatlingGunner", rocketBattery: "rocketeer", revolutionary: "railSniper",
};

/** Each troop's base deployment range, in cells (a tile is 8): the basic
 * guilds' least, the ultimates' most. */
export const DEPLOY_RANGE: Partial<Record<Soldier["kind"], number>> = {
  brawler: 14, slinger: 14,
  sword: 16, archer: 16, assassin: 16, spearman: 16, gunner: 16,
  hoplite: 18, javelineer: 18, mage: 18, musketeer: 18, machineGunner: 18,
  rocketeer: 20, sniper: 20, gatlingGunner: 20,
  lancer: 22, valkyrie: 24, railSniper: 26, darkWizard: 26, hero: 30, shade: 30,
};

/** How near a watch tower (cells from its middle) a dragged flag snaps onto it. */
export const TOWER_SNAP = 2.5;

/** A troop building's rally point; `tower`: the watch tower it was snapped onto. */
export type Rally = Point & { tower?: number };
export type Circle = Point & { r: number };

/** How far building kind `kind`'s troops deploy with `bonuses`; 0 for a
 * building that trains none. */
export function deployRangeOf(kind: BuildingKind, bonuses: Pick<Bonuses, "deployRange">) {
  const trained = TRAINS[kind];
  return trained ? (DEPLOY_RANGE[trained] ?? 0) * (bonuses.deployRange ?? 1) : 0;
}

/** Building `b`'s deployment circle, or null for one that trains nobody. */
export function deployCircle(b: Building, bonuses: Pick<Bonuses, "deployRange">): Circle | null {
  const r = deployRangeOf(b.kind, bonuses);
  return r ? { ...center(b.rect), r } : null;
}

/** Where `s` may go: its home's deployment circle, or null when it has no
 * bounds (a spell's troops, a cloudborne palace's). */
export function deployment(sim: DefendSim, s: Soldier): Circle | null {
  if (sim.scenario?.unrestricted || s.home < 0) return null;
  const b = sim.map.buildings[s.home], base = DEPLOY_RANGE[s.kind];
  if (!b || !base || sim.aloft(s.home)) return null;
  const c = center(b.rect);
  return { x: c.x, y: c.y, r: base * (sim.bonuses.deployRange ?? 1) };
}

/** Whether `p` lies within `pad` of circle `d` (always, without one). */
export const within = (d: Circle | null, p: Point, pad = 0) => !d || sq(p.x - d.x) + sq(p.y - d.y) <= sq(d.r + pad);

/** The war banner or rally flag, if `s` may answer it: only one standing
 * inside its deployment range. */
export function bannerFor(sim: DefendSim, s: Soldier): WarBanner | null {
  const post=s.home>=0&&sim.scenario?.unrestricted&&sim.map.buildings[s.home]?.hidden?sim.rallies.get(s.home):undefined;
  if(post){
    let flags=STAGING_FLAGS.get(sim);if(!flags)STAGING_FLAGS.set(sim,flags=new Map());
    const key=post.x+','+post.y;let flag=flags.get(key);
    if(!flag){
      const used=new Set([...sim.rallies.values()].map(p=>p.x+','+p.y));for(const key of flags.keys())if(!used.has(key))flags.delete(key);
      flags.set(key,flag=new WarBanner(post.x,post.y,true));
    }
    flag.refresh(sim);return flag;
  }
  const w = sim.warBanner;
  return w && within(deployment(sim, s), w) ? w : null;
}

/** After `s`'s step from (x0, y0): a step that took it further out past its
 * deployment range is taken back, and its route with it. */
export function fence(sim: DefendSim, s: Soldier, x0: number, y0: number) {
  if (s.x === x0 && s.y === y0) return;
  const d = deployment(sim, s);
  if (!d) return;
  const now = sq(s.x - d.x) + sq(s.y - d.y);
  if (now <= sq(d.r) || now <= sq(x0 - d.x) + sq(y0 - d.y)) return;
  s.x = x0;
  s.y = y0;
  s.path = [];
}

/** `s`'s rally point, if its building has one. */
export const postOf = (sim: DefendSim, s: Soldier): Rally | undefined => (s.home < 0 ? undefined : sim.rallies.get(s.home));

/** Whether `s` stands at its post: troops gather on rings round it. */
export const atPost = (s: Soldier, p: Point) => dist(s.x - p.x, s.y - p.y) <= 0.8 + (s.id % 4) * 0.5;

const POST_WALK = { maxCost: 400, maxNodes: 4000 };

/** With a rally point, sets `s` walking to it (or standing, once there)
 * and returns true; without one, false. */
export function postPath(sim: DefendSim, s: Soldier): boolean {
  const p = postOf(sim, s);
  if (!p) return false;
  s.target = -1;
  if (atPost(s, p)) s.path = [];
  else {
    const goal = openNear(sim, p);
    s.path = goal ? (findPath(sim.ownSolid, s, goal, POST_WALK) ?? []) : [];
  }
  return true;
}

/** The open cell nearest `p` within three cells (its own when open), as a point. */
function openNear(sim: DefendSim, p: Point): Point | null {
  const at = cellAt(p.x, p.y);
  if (!sim.ownSolid[at]) return p;
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  let best = -1, bestD = Infinity;
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      if (!cellInBounds(cx + dx, cy + dy)) continue;
      const i = cellIndex(cx + dx, cy + dy), d = dx * dx + dy * dy;
      if (!sim.ownSolid[i] && d < bestD) { best = i; bestD = d; }
    }
  return best < 0 ? null : cellCenter(best);
}

/** The streets `s` may stroll to: those within its deployment range. */
export function strollStreets(sim: DefendSim, s: Soldier): readonly number[] {
  const d = deployment(sim, s);
  if (!d) return sim.streets;
  let byHome = STREETS.get(sim);
  if (!byHome) STREETS.set(sim, (byHome = new Map()));
  let list = byHome.get(s.home);
  if (!list) byHome.set(s.home, (list = sim.streets.filter((c) => within(d, cellCenter(c)))));
  return list;
}
const STREETS = new WeakMap<DefendSim, Map<number, number[]>>();

/** Whether building `b`'s troops climb watch towers (the gunner line). */
export const climbsTowers = (kind: BuildingKind, flat: (k: Soldier["kind"]) => boolean) => {
  const t = TRAINS[kind];
  return !!t && flat(t);
};

/** Where a rally point dragged to `p` from building `b` goes: nowhere (the
 * troops' own ways) when dragged back onto `b`; onto a standing watch tower
 * within `TOWER_SNAP` of it when `towers` (the gunner line's) and that
 * tower is in range; else `p`, pulled in to the deployment range and onto
 * the board. */
export function rallyAim(b: Building, p: Point, circle: Circle, towers: readonly Building[] = []): Rally | undefined {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return undefined;
  const r = b.rect;
  if (p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h) return undefined;
  let snap: Building | null = null, snapD = sq(TOWER_SNAP);
  for (const t of towers) {
    const c = center(t.rect), d = sq(p.x - c.x) + sq(p.y - c.y);
    if (d <= snapD && within(circle, c)) { snap = t; snapD = d; }
  }
  if (snap) return { ...center(snap.rect), tower: snap.id };
  const d = dist(p.x - circle.x, p.y - circle.y), k = d > circle.r ? circle.r / d : 1;
  const x = circle.x + (p.x - circle.x) * k, y = circle.y + (p.y - circle.y) * k;
  return { x: Math.max(0.5, Math.min(CELLS_W - 0.5, x)), y: Math.max(0.5, Math.min(CELLS_H - 0.5, y)) };
}

/** At most one native walking field per current staging-group destination. */
const STAGING_FLAGS=new WeakMap<DefendSim,Map<string,WarBanner>>();
