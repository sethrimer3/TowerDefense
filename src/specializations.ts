/** Each building's own upgrades. The shop sells only the basic buildings
 * (`BASIC_BUILDINGS`: the Watch tower, the Melee Guild and the Ranged Guild,
 * besides the city's own pieces); everything else is one of those upgraded,
 * one building at a time, with Knowledge. Every line has the same shape
 * (`ATTUNED`):
 *
 *  - a basic building becomes one of three attuned buildings (a Watch tower
 *    an archer, cannon or wizard tower; a Melee Guild a barracks of
 *    swordsmen, an assassins' den or a spearmen hall; a Ranged Guild an
 *    archer barracks, a Mage Guild or a gunner hall);
 *  - an attuned building takes one of its three branches, the others closing
 *    off, and climbs it three ranks. Each branch is one Knowledge path; the
 *    spearmen's and the gunners' branches start with an attunement that
 *    turns the hall into a building with troops of its own (`Branch.via`: a
 *    phalanx, javelin camp or lancer stable; a musket hall, machine-gun nest
 *    or rocket battery), which then climbs the path. Until one is taken the
 *    tree shows only each branch's first step;
 *  - three buildings of one attuned kind, each at the last rank of a
 *    different branch, merge into its ultimate (`Attuned.ultimate`: the Dark
 *    wizard keep, the Hero, the Shadow, the Valkyrie palace, the Sniper
 *    lodge, the Gatling emplacement, C4 nanobots). The one whose tree the merge is bought in becomes
 *    it; the other two are used up. Lines without an ultimate yet show it
 *    to come.
 *
 * An ultimate keeps the paths of its own it had (the Hero's, the Gatling's,
 * the Sniper lodge's, Cloudborne), and the Sniper lodge can still become the
 * Revolutionary (`BEYOND`).
 *
 * The kind is the building's kind in the city and among the copies owned
 * (`DefendSave.owned`); its path and rank live on its placement
 * (`PlacedStructure.path/rank`, `SpikeSpot.path/rank`) and move with it.
 * Taken back to the palette, a building on a path keeps it as a kept copy
 * (`DefendSave.kept`), placed again from its own palette entry. Battles
 * snapshot every building's path and rank when they start
 * (`placedBattlePaths`). */
import { ITEM_NAMES, footprint, type Bonuses, type PaletteItem } from "./defend/catalog.ts";
import { cloneLayout, fitLayout, sameGate, type GateSpot, type Layout, type PlacedKind, type PlacedStructure, type SpikeSpot } from "./defend/layout.ts";
import { keptGroups, plainAvailable, type DefendSave } from "./defend/progress.ts";
import { PATHS, isSpell, pathById, pathFits, pathTopicOf, pathsOf, type BattlePaths, type KnowledgePath, type PathId } from "./knowledge-paths.ts";
import type { Save } from "./save.ts";
import { studyPathCost } from "./economy.ts";

export const spikeKey = (g: { tx: number; ty: number; side: string }) => `spikes:${g.tx}:${g.ty}:${g.side}`;

/** A path a building wears, at the rank it has climbed to. */
export type Wear = { path: PathId; rank: number };

// ── The shape of every line ─────────────────────────────────────────────
/** One branch of an attuned building: a path climbed rank by rank. With
 * `via`, an attunement comes first, turning the building into another kind
 * for `via.cost`, which then climbs the path. */
export type Branch = { path: PathId; via?: { kind: PlacedKind; cost: number } };
/** An attuned building: what it grows from and costs, its three branches,
 * and the ultimate three of it, each maxed on a different branch, merge
 * into (none yet: still to come). */
export type Attuned = { kind: PlacedKind; from: PlacedKind; cost: number; branches: Branch[]; ultimate?: PlacedKind };

export const ATTUNED: Attuned[] = [
  { kind: "archerTower", from: "watchTower", cost: 3, branches: [{ path: "fireArrows" }, { path: "sharpshooters" }] },
  { kind: "cannonTower", from: "watchTower", cost: 6, branches: [{ path: "gunnery" }, { path: "siegeShot" }], ultimate: "nanoTower" },
  { kind: "wizardTower", from: "watchTower", cost: 8, ultimate: "darkKeep", branches: [
    { path: "pyromancy", via: { kind: "pyreTower", cost: 6 } },
    { path: "rime", via: { kind: "frostTower", cost: 6 } },
    { path: "storm", via: { kind: "stormTower", cost: 8 } },
  ] },
  { kind: "barracks", from: "meleeGuild", cost: 4, branches: [{ path: "crusaders" }, { path: "berserkers" }, { path: "halberdiers" }], ultimate: "heroHall" },
  { kind: "assassinDen", from: "meleeGuild", cost: 6, branches: [{ path: "bloodletters" }, { path: "shadowcloak" }, { path: "venom" }], ultimate: "shadow" },
  { kind: "spearHall", from: "meleeGuild", cost: 5, ultimate: "valkyriePalace", branches: [
    { path: "testudo", via: { kind: "phalanx", cost: 7 } },
    { path: "barbed", via: { kind: "javelinCamp", cost: 8 } },
    { path: "wingedLancers", via: { kind: "lancerStable", cost: 10 } },
  ] },
  { kind: "archerBarracks", from: "rangedGuild", cost: 5, branches: [{ path: "rangers" }, { path: "skirmishers" }], ultimate: "sniperLodge" },
  { kind: "mageGuild", from: "rangedGuild", cost: 9, branches: [{ path: "pyroclasm" }, { path: "cinders" }] },
  { kind: "gunHall", from: "rangedGuild", cost: 6, ultimate: "gatlingNest", branches: [
    { path: "volleyFire", via: { kind: "musketHall", cost: 8 } },
    { path: "beltFeed", via: { kind: "gunNest", cost: 10 } },
    { path: "clusterRockets", via: { kind: "rocketBattery", cost: 12 } },
  ] },
];
/** Knowledge a merge costs on top of the three buildings it uses up. */
export const MERGE_COST = 0;
/** What an ultimate can go on to become. */
export const BEYOND: Partial<Record<PlacedKind, { to: PlacedKind; cost: number }[]>> = {
  sniperLodge: [{ to: "revolutionary", cost: 100000 }],
};
/** What a plain building of each kind can become, and the Knowledge it
 * costs: a basic building its attuned ones, and `BEYOND`. */
export const BECOMES: Partial<Record<PlacedKind, { to: PlacedKind; cost: number }[]>> = {
  ...Object.fromEntries(["watchTower", "meleeGuild", "rangedGuild"].map((b) => [b, ATTUNED.filter((a) => a.from === b).map((a) => ({ to: a.kind, cost: a.cost }))])),
  ...BEYOND,
};

/** Where a kind stands in its line. */
export type Place =
  | { tier: "basic"; kind: PlacedKind }
  | { tier: "attuned"; a: Attuned }
  | { tier: "via"; a: Attuned; branch: number }
  | { tier: "ultimate"; a: Attuned }
  | { tier: "beyond"; from: PlacedKind; cost: number }
  | { tier: "other" };
export function placeOf(kind: PlacedKind | "wallSpikes"): Place {
  if (kind === "wallSpikes") return { tier: "other" };
  if (ATTUNED.some((a) => a.from === kind)) return { tier: "basic", kind };
  for (const a of ATTUNED) {
    if (a.kind === kind) return { tier: "attuned", a };
    const branch = a.branches.findIndex((b) => b.via?.kind === kind);
    if (branch >= 0) return { tier: "via", a, branch };
    if (a.ultimate === kind) return { tier: "ultimate", a };
  }
  for (const [from, list] of Object.entries(BEYOND)) {
    const b = list!.find((o) => o.to === kind);
    if (b) return { tier: "beyond", from: from as PlacedKind, cost: b.cost };
  }
  return { tier: "other" };
}
/** The attuned building `kind` is, branches from, or was merged from. */
export function attunedOf(kind: PlacedKind | "wallSpikes"): Attuned | undefined {
  const p = placeOf(kind);
  return p.tier === "attuned" || p.tier === "via" || p.tier === "ultimate" ? p.a : p.tier === "beyond" ? attunedOf(p.from) : undefined;
}
/** The kind a building on `branch` of `a` is. */
export const branchKind = (a: Attuned, branch: Branch): PlacedKind => branch.via?.kind ?? a.kind;
/** The branch of `a` a building of `kind` wearing `wear` is on, if any. */
const branchOf = (a: Attuned, kind: PlacedKind | "wallSpikes", wear?: Wear) =>
  a.branches.findIndex((b) => branchKind(a, b) === kind && (b.via ? true : b.path === wear?.path));
/** The branch the tree stands an ultimate on: the middle one. */
const MIDDLE = 1;
const topRank = (path: PathId) => pathById(path).ranks.length;

/** What each kind's troops are called on its upgrade buttons. */
export const TROOPS: Partial<Record<PlacedKind, string>> = {
  meleeGuild: "Brawlers", rangedGuild: "Stone throwers", barracks: "Swordsmen", heroHall: "Hero", shadow: "Shade", assassinDen: "Assassins", spearHall: "Spearmen", phalanx: "Hoplites", javelinCamp: "Javelineers", lancerStable: "Lancers", archerBarracks: "Archers", mageGuild: "Fire mages",
  sniperLodge: "Snipers", musketHall: "Musketmen",
  gunHall: "Gunners", gunNest: "Machine gunners", gatlingNest: "Gatling gunners", rocketBattery: "Rocketeers", revolutionary: "Laser snipers", valkyriePalace: "Valkyries", darkKeep: "Dark wizard",
};

/** The kind `kind` was upgraded from (its parent in the tree), if any: an
 * ultimate's is its attuned building. */
export function upgradedFrom(kind: PlacedKind): PlacedKind | undefined {
  const p = placeOf(kind);
  return p.tier === "attuned" ? p.a.from : p.tier === "via" || p.tier === "ultimate" ? p.a.kind : p.tier === "beyond" ? p.from : undefined;
}
/** The basic building `kind` grows from (itself for a basic one). */
export function rootOf(kind: PlacedKind): PlacedKind {
  let k = kind;
  for (let up = upgradedFrom(k); up; up = upgradedFrom(k)) k = up;
  return k;
}

/** One upgrade a building can take next. */
export type UpgradeStep =
  | { type: "become"; to: PlacedKind; cost: number }
  | { type: "path"; path: PathId; rank: number; cost: number }
  /** Three buildings maxed on different branches made one ultimate. */
  | { type: "merge"; to: PlacedKind; cost: number };

/** Every upgrade a building of `kind` wearing `wear` can take next. */
export function nextSteps(kind: PlacedKind | "wallSpikes", wear?: Wear): UpgradeStep[] {
  const place = placeOf(kind);
  if (wear) {
    const p = pathById(wear.path), next = p.ranks[wear.rank];
    if (next) return [{ type: "path", path: p.id, rank: wear.rank + 1, cost: next.cost }];
    const a = place.tier === "attuned" || place.tier === "via" ? place.a : undefined;
    return a?.ultimate ? [{ type: "merge", to: a.ultimate, cost: MERGE_COST }] : [];
  }
  if (place.tier === "attuned")
    return place.a.branches.map((b): UpgradeStep =>
      b.via ? { type: "become", to: b.via.kind, cost: b.via.cost } : { type: "path", path: b.path, rank: 1, cost: pathById(b.path).ranks[0].cost });
  if (place.tier === "via") {
    // The branch's attunement made it: it climbs its path from the first rank.
    const p = pathById(place.a.branches[place.branch].path);
    return [{ type: "path", path: p.id, rank: 1, cost: p.ranks[0].cost }];
  }
  const becomes = kind === "wallSpikes" ? [] : (BECOMES[kind] ?? []).map((b): UpgradeStep => ({ type: "become", ...b }));
  return [...becomes, ...buildingPathsOf(kind).map((p): UpgradeStep => ({ type: "path", path: p.id, rank: 1, cost: p.ranks[0].cost }))];
}
export const sameStep = (a: UpgradeStep, b: UpgradeStep) =>
  a.type === b.type && (a.type === "become" || a.type === "merge" ? a.to === (b as typeof a).to
    : a.path === (b as { path: PathId }).path && (a.type !== "path" || a.rank === (b as typeof a).rank));

/** A step's name, as its button reads. */
export function stepName(s: UpgradeStep): string {
  if (s.type === "become" || s.type === "merge") return ITEM_NAMES[s.to];
  return `${pathById(s.path).name} ${ROMAN[s.rank]}`;
}

// ── Where a building stands ────────────────────────────────────────────
/** A building that can be upgraded: a structure by uid, a row of wall
 * spikes by its spot (rows have no uid; their spot moves with them), or a
 * copy still in the palette by its kind and the path it keeps, if any. */
export type SpecialtyTarget = { uid: number } | { spikes: GateSpot } | { copy: PaletteKind; wear?: Wear };
/** A kind with an upgrade tree, as the palette holds it. */
export type PaletteKind = PlacedKind | "wallSpikes";

/** The placement `target` names in `layout`, if it stands there (never a palette copy). */
export function placementOf(layout: Layout, target: SpecialtyTarget): PlacedStructure | SpikeSpot | undefined {
  return "uid" in target ? layout.structures.find((s) => s.uid === target.uid) : "spikes" in target ? layout.spikes.find((g) => sameGate(g, target.spikes)) : undefined;
}
/** Whether the palette holds a copy of `kind` wearing exactly `wear` (plain when unset). */
export function copyWaits(d: DefendSave, kind: PaletteKind, wear?: Wear): boolean {
  return wear ? keptGroups(d, kind).some((g) => g.path === wear.path && g.rank === wear.rank) : plainAvailable(d, kind) > 0;
}
const layoutOf = (where: DefendSave | Layout): Layout => ("layout" in where ? where.layout : where);
/** The palette kind standing at `target` (in the palette, for a copy: that needs the whole Defend save). */
export function targetKind(where: DefendSave | Layout, target: SpecialtyTarget): PaletteKind | undefined {
  if ("copy" in target) return "layout" in where && copyWaits(where, target.copy, target.wear) ? target.copy : undefined;
  const p = placementOf(layoutOf(where), target);
  return !p ? undefined : "uid" in target ? (p as PlacedStructure).kind : "wallSpikes";
}
/** The path a placement wears, at its rank, or undefined while plain. */
export const wearOf = (p: { path?: PathId; rank?: number } | undefined): Wear | undefined =>
  p?.path && p.rank ? { path: p.path, rank: p.rank } : undefined;
/** The path `target` wears, at its rank, or undefined while plain. */
export const specialtyOf = (where: DefendSave | Layout, target: SpecialtyTarget) =>
  "copy" in target ? target.wear : wearOf(placementOf(layoutOf(where), target));

const ROMAN = ["", "I", "II", "III", "IV", "V"];
/** "Pyromancy III", or "Unspecialized". */
export const specialtyLabel = (s: Wear | undefined) => (s ? `${pathById(s.path).name} ${ROMAN[s.rank]}` : "Unspecialized");
/** A well formed wear for `kind`: its own path, at a rank the path has. */
export const wearFits = (kind: string, path: unknown, rank: unknown): boolean =>
  typeof path === "string" && buildingPathsOf(kind).some((p) => p.id === path) && Number.isInteger(rank) && (rank as number) >= 1 && (rank as number) <= pathById(path as PathId).ranks.length;


// ── Upgrading ──────────────────────────────────────────────────────────
export type UpgradeResult = { ok: false; reason: string } | { ok: true; kind: PlacedKind | "wallSpikes"; waiting?: boolean; copy?: SpecialtyTarget };

/** One building a merge uses up: where it is, or that none is. */
export type Partner = { branch: Branch; kind: PlacedKind; found?: { kept: true } | { uid: number } };

/** The buildings a merge into the ultimate would use up beside a building
 * of `kind` wearing `wear`: one at the last rank of each other branch,
 * from the palette first, then the city (never `except`, the building
 * itself). Empty unless it is maxed on a branch of a line with an ultimate. */
export function mergePartners(d: DefendSave, kind: PaletteKind, wear: Wear | undefined, except?: number): Partner[] {
  const a = attunedOf(kind), mine = a ? branchOf(a, kind, wear) : -1;
  if (!a?.ultimate || mine < 0 || !wear || wear.rank < topRank(wear.path)) return [];
  return a.branches.filter((_, i) => i !== mine).map((branch): Partner => {
    const k = branchKind(a, branch), top = topRank(branch.path);
    if (d.kept.some((o) => o.kind === k && o.path === branch.path && o.rank === top)) return { branch, kind: k, found: { kept: true } };
    const s = d.layout.structures.find((o) => o.uid !== except && o.kind === k && o.path === branch.path && o.rank === top);
    return { branch, kind: k, ...(s ? { found: { uid: s.uid } } : {}) };
  });
}
/** Why a merge can't happen yet, naming the buildings still missing. */
const missing = (partners: Partner[]) =>
  `Needs ${partners.filter((p) => !p.found).map((p) => `a ${ITEM_NAMES[p.kind]} at ${pathById(p.branch.path).name} ${ROMAN[topRank(p.branch.path)]}`).join(" and ")} to merge with.`;

/** Uses up the merge's partners: those in the palette and the city alike. */
function consume(d: DefendSave, layout: Layout, partners: Partner[]) {
  for (const p of partners) {
    if (p.found && "uid" in p.found) {
      const uid = p.found.uid;
      layout.structures = layout.structures.filter((s) => s.uid !== uid);
    } else unkeep(d, p.kind, { path: p.branch.path, rank: topRank(p.branch.path) });
    d.owned[p.kind]--;
  }
}

/** Upgrades the building at `target` by `step`, paying its Knowledge (free
 * with Unlimited money). A building that becomes another stands where it
 * was if the new one fits there (its tile reshuffled if need be), and
 * otherwise waits in the palette. A merge uses up its partners. Only while
 * building. */
export function upgradeBuilding(save: Save, target: SpecialtyTarget, asked: UpgradeStep): UpgradeResult {
  if ("copy" in target) return upgradeCopy(save, target, asked);
  const d = save.defend, kind = targetKind(d.layout, target), placed = placementOf(d.layout, target);
  if (!kind || !placed) return { ok: false, reason: "That building is no longer there." };
  // The price and result are always the catalog's, never the caller's.
  const step = nextSteps(kind, wearOf(placed)).find((s) => sameStep(s, asked));
  if (!step) return { ok: false, reason: "That upgrade isn't open to it." };
  const free = save.settings.devMode;
  if (!free && save.knowledge < step.cost) return { ok: false, reason: `Needs ${step.cost} Knowledge.` };
  const uid = "uid" in target ? target.uid : undefined;
  const partners = step.type === "merge" ? mergePartners(d, kind, wearOf(placed), uid) : [];
  if (partners.some((p) => !p.found)) return { ok: false, reason: missing(partners) };
  const next = cloneLayout(d.layout), p = placementOf(next, target)!;
  if (step.type === "path") {
    p.path = step.path;
    p.rank = step.rank;
    d.layout = next;
    if (!free) save.knowledge -= step.cost;
    recordFound(d);
    return { ok: true, kind };
  }
  // Becoming another building (taking a branch that makes it one, or
  // merging): one copy of the old kind turns into one of the new.
  consume(d, next, partners);
  const s = p as PlacedStructure;
  s.kind = step.to;
  delete s.path;
  delete s.rank;
  if (!free) save.knowledge -= step.cost;
  d.owned[kind as PlacedKind]--;
  d.owned[step.to]++;
  d.layout = standing(next, s.uid, kind as PlacedKind);
  const waiting = !d.layout.structures.some((o) => o.uid === s.uid);
  recordFound(d);
  return { ok: true, kind: step.to, waiting };
}

/** Upgrades one palette copy: a path step keeps it on that path and rank
 * (a kept copy), a change of kind makes it a copy of the new kind (kept on
 * its branch's first rank for a branch). `copy` in the result names the
 * copy it became. */
function upgradeCopy(save: Save, target: { copy: PaletteKind; wear?: Wear }, asked: UpgradeStep): UpgradeResult {
  const d = save.defend, kind = target.copy;
  if (!copyWaits(d, kind, target.wear)) return { ok: false, reason: "That copy is no longer in the palette." };
  const step = nextSteps(kind, target.wear).find((s) => sameStep(s, asked));
  if (!step) return { ok: false, reason: "That upgrade isn't open to it." };
  const free = save.settings.devMode;
  if (!free && save.knowledge < step.cost) return { ok: false, reason: `Needs ${step.cost} Knowledge.` };
  // The copy itself is a kept one: set it aside before looking for partners.
  unkeep(d, kind, target.wear);
  const partners = step.type === "merge" ? mergePartners(d, kind, target.wear) : [];
  if (partners.some((p) => !p.found)) {
    if (target.wear) d.kept.push({ kind, ...target.wear });
    return { ok: false, reason: missing(partners) };
  }
  if (!free) save.knowledge -= step.cost;
  if (step.type === "path") {
    d.kept.push({ kind, path: step.path, rank: step.rank });
    recordFound(d);
    return { ok: true, kind, copy: { copy: kind, wear: { path: step.path, rank: step.rank } } };
  }
  const layout = cloneLayout(d.layout);
  consume(d, layout, partners);
  d.layout = layout;
  d.owned[kind as PlacedKind]--;
  d.owned[step.to]++;
  recordFound(d);
  return { ok: true, kind: step.to, copy: { copy: step.to } };
}

/** Takes one kept copy of `kind` wearing `wear` off the list (none when plain). */
function unkeep(d: DefendSave, kind: PaletteKind, wear?: Wear) {
  if (!wear) return;
  const i = d.kept.findIndex((k) => k.kind === kind && k.path === wear.path && k.rank === wear.rank);
  if (i >= 0) d.kept.splice(i, 1);
}

/** `l` as it is if structure `uid`, now `was`'s kind, kept its size and
 * still fits where it stood; else with it taken up (back to the palette,
 * where the player places it again). */
function standing(l: Layout, uid: number, was: PlacedKind): Layout {
  const s = l.structures.find((o) => o.uid === uid)!;
  const size = (k: PlacedKind) => footprint(k, l.compact.includes(k));
  const a = size(was), b = size(s.kind);
  if (a.w === b.w && a.h === b.h && a.span === b.span && fitLayout(l).ok) return l;
  const next = cloneLayout(l);
  next.structures = next.structures.filter((o) => o.uid !== uid);
  return next;
}

// ── The tree a building grows ──────────────────────────────────────────
const pathCost = (path: PathId, ranks = topRank(path)) => pathById(path).ranks.slice(0, ranks).reduce((n, r) => n + r.cost, 0);

/** The Knowledge it takes to make a plain building of `kind` from its
 * basic building: an ultimate's counts all three buildings merged into it. */
function lineageCost(kind: PlacedKind | "wallSpikes"): number {
  const p = placeOf(kind);
  if (p.tier === "attuned") return p.a.cost;
  if (p.tier === "via") return p.a.cost + p.a.branches[p.branch].via!.cost;
  if (p.tier === "ultimate") return p.a.branches.reduce((n, b) => n + p.a.cost + (b.via?.cost ?? 0) + pathCost(b.path), MERGE_COST);
  if (p.tier === "beyond") return lineageCost(p.from) + p.cost;
  return 0;
}

/** The Knowledge allocated to a building of `kind` wearing `wear`: every
 * step from its basic building to where it stands now (for an ultimate,
 * all three buildings merged into it), at today's prices (what a respec
 * gives back). */
export function allocated(kind: PlacedKind | "wallSpikes", wear?: Wear): number {
  return lineageCost(kind) + (wear ? pathCost(wear.path, wear.rank) : 0);
}

/** Where a building stands once an undo is done, and, past a merge, the
 * other buildings it comes apart into (each a kind, maybe on a path). */
type Undone = { kind: PaletteKind; wear?: Wear; apart?: { kind: PlacedKind; wear?: Wear }[] };

/** Where a building of `kind` wearing `wear` stands once tree node `id`
 * and everything after it are undone: at the node it grew from. Undoing an
 * ultimate's merge parts it into the three buildings merged into it; what
 * lies below a merge can't be undone on its own (respec it). Undefined
 * unless `id` is one it has (owned) and not its basic building. */
export function undoTo(kind: PaletteKind, wear: Wear | undefined, id: string): Undone | undefined {
  const tree = buildingTree(kind, wear), n = tree.find((o) => o.id === id);
  if (!n || n.state !== "owned" || !n.parent || n.merged) return undefined;
  if (n.step?.type === "merge") {
    const a = attunedOf(n.kind!)!, at = (b: Branch) => ({ kind: branchKind(a, b), wear: { path: b.path, rank: topRank(b.path) } });
    return { ...at(a.branches[MIDDLE]), apart: a.branches.filter((_, i) => i !== MIDDLE).map(at) };
  }
  const to = tree.find((o) => o.id === n.parent)!;
  if (!to.path) return { kind: to.kind! };
  // A path rank: the building is the nearest one at or below it.
  let k = to;
  while (!k.kind) k = tree.find((o) => o.id === k.parent)!;
  return { kind: k.kind, wear: { path: to.path, rank: to.rank! } };
}

/** The Knowledge `to` gives back from a building of `kind` wearing `wear`. */
const refund = (kind: PaletteKind, wear: Wear | undefined, to: Undone) =>
  allocated(kind, wear) - allocated(to.kind, to.wear) - (to.apart ?? []).reduce((n, o) => n + allocated(o.kind, o.wear), 0);

/** The Knowledge undoing node `id` gives back (0 when it can't be undone). */
export function undoRefund(kind: PaletteKind, wear: Wear | undefined, id: string): number {
  const to = undoTo(kind, wear, id);
  return to ? refund(kind, wear, to) : 0;
}

/** Undoes tree node `id` of the building at `target` and everything after
 * it, giving back their Knowledge: the building steps back down its tree to
 * the node `id` grew from (an unmerged ultimate's two others wait in the
 * palette). Free. Only while building. */
export function undoUpgrade(save: Save, target: SpecialtyTarget, id: string): UpgradeResult {
  const d = save.defend, kind = targetKind(d, target), wear = specialtyOf(d, target);
  if (!kind) return { ok: false, reason: "That building is no longer there." };
  const to = undoTo(kind, wear, id);
  if (!to) return { ok: false, reason: "Nothing to undo there." };
  return rewind(save, target, kind, wear, to);
}

/** Respecs the building at `target`: every Knowledge point back, and back
 * to its basic building with no path (an ultimate to the three basic
 * buildings merged into it, two of them waiting in the palette). Free.
 * Only while building. */
export function respecBuilding(save: Save, target: SpecialtyTarget): UpgradeResult {
  const d = save.defend, kind = targetKind(d, target), wear = specialtyOf(d, target);
  if (!kind) return { ok: false, reason: "That building is no longer there." };
  const root = kind === "wallSpikes" ? kind : rootOf(kind);
  if (root === kind && !wear) return { ok: false, reason: "Nothing to respec: it has no upgrades." };
  const merged = kind !== "wallSpikes" && mergedFrom(kind);
  return rewind(save, target, kind, wear, { kind: root, ...(merged ? { apart: [{ kind: root as PlacedKind }, { kind: root as PlacedKind }] } : {}) });
}
/** Whether `kind` is an ultimate, or grew from one. */
export const mergedFrom = (kind: PlacedKind): boolean => {
  const p = placeOf(kind);
  return p.tier === "ultimate" || (p.tier === "beyond" && mergedFrom(p.from));
};

/** Steps the building at `target` (a `kind` wearing `wear`) back to `to`,
 * giving back the Knowledge between them. A placed one that changes kind
 * stays where it was if it fits (its tile reshuffled if need be), else it
 * waits in the palette; a palette copy becomes a copy of `to`. The
 * buildings it comes apart into wait in the palette. */
function rewind(save: Save, target: SpecialtyTarget, kind: PaletteKind, wear: Wear | undefined, to: Undone): UpgradeResult {
  const d = save.defend;
  save.knowledge += refund(kind, wear, to);
  for (const o of to.apart ?? []) {
    d.owned[o.kind]++;
    if (o.wear) d.kept.push({ kind: o.kind, ...o.wear });
  }
  const shift = () => {
    if (to.kind === kind) return;
    d.owned[kind as PlacedKind]--;
    d.owned[to.kind as PlacedKind]++;
  };
  if ("copy" in target) {
    unkeep(d, kind, wear);
    shift();
    if (to.wear) d.kept.push({ kind: to.kind, path: to.wear.path, rank: to.wear.rank });
    return { ok: true, kind: to.kind, copy: { copy: to.kind, ...(to.wear ? { wear: to.wear } : {}) } };
  }
  const next = cloneLayout(d.layout), p = placementOf(next, target)!;
  if (to.wear) {
    p.path = to.wear.path;
    p.rank = to.wear.rank;
  } else {
    delete p.path;
    delete p.rank;
  }
  if (to.kind === kind) {
    d.layout = next;
    return { ok: true, kind };
  }
  const st = p as PlacedStructure;
  st.kind = to.kind as PlacedKind;
  shift();
  d.layout = standing(next, st.uid, kind as PlacedKind);
  const waiting = !d.layout.structures.some((o) => o.uid === st.uid);
  // Taken up wearing a path, it waits as a kept copy.
  if (waiting && to.wear) d.kept.push({ kind: to.kind, path: to.wear.path, rank: to.wear.rank });
  return { ok: true, kind: to.kind, waiting };
}

/** One node of a building's upgrade tree: a building it is or can become
 * (`k:<kind>`), one rank of a path (`p:<path>:<rank>`; a branch's first
 * rank that makes it another building has that `kind` too), or a line's
 * ultimate still to come (`u:<attuned kind>`). */
export type TreeNode = {
  id: string;
  /** The node it grows from (none for the basic building at the root). */
  parent?: string;
  /** owned: the building has it; next: it can be bought now; locked:
   * further along a live branch. */
  state: "owned" | "next" | "locked";
  /** The step that buys it from its parent. */
  step?: UpgradeStep;
  /** What it is: a kind (a building), or a path at a rank. */
  kind?: PlacedKind | "wallSpikes";
  path?: PathId;
  rank?: number;
  cost: number;
  /** A choice that turns the building down another branch (becoming
   * another building), rather than carrying on up the one it is on. */
  side?: boolean;
  /** Branches beyond it not shown until it is bought, each where it would
   * stand. */
  hidden?: BranchSlot[];
  /** Branches it once had open that the choice after it closed off, each
   * where it stood... */
  closed?: BranchSlot[];
  /** ...and the branch it took instead. */
  took?: BranchSlot;
  /** Owned below an ultimate's merge: undone only with the merge. */
  merged?: boolean;
  /** The ultimate of attuned kind `soon`, not made yet. */
  soon?: PlacedKind;
};

/** Where a branch stands among its node's: one of the `n` choices that turn
 * the building into another (`side`), or of the `n` paths carrying on up
 * from it, the `i`th of them in order. */
export type BranchSlot = { side: boolean; i: number; n: number };

/** The branches a plain building of `kind` has open: buildings to become,
 * then paths to climb (an attuned building's branches), in the order the
 * tree lists them. */
const openings = (kind: PlacedKind | "wallSpikes"): BranchSlot[] => {
  if (kind === "wallSpikes") return buildingPathsOf(kind).map((_, i, all) => ({ side: false, i, n: all.length }));
  const place = placeOf(kind);
  if (place.tier === "attuned") return place.a.branches.map((_, i, all) => ({ side: false, i, n: all.length }));
  if (place.tier === "via") return [];
  const becomes = BECOMES[kind] ?? [], paths = buildingPathsOf(kind);
  return [...becomes.map((_, i) => ({ side: true, i, n: becomes.length })), ...paths.map((_, i) => ({ side: false, i, n: paths.length }))];
};
/** `{ hidden }` for a node with branches beyond it, else nothing. */
const beyond = (kind: PlacedKind | "wallSpikes") => (openings(kind).length ? { hidden: openings(kind) } : {});

const kid = (k: string) => `k:${k}`, pid = (p: PathId, r: number) => `p:${p}:${r}`;

/** The live upgrade tree of one building of `kind` wearing `wear`: the
 * buildings it has been, then every branch still open to it. A choice cuts
 * off the branches beside it (a Ranged Guild that becomes a Mage Guild can
 * no longer become an archer barracks, and a Mage Guild on Pyroclasm no
 * longer has Cinders), and opens what only that choice leads to (the Mage
 * Guild's branches appear once it is one). Every branch tops out in the
 * line's ultimate, bought by merging. An ultimate's tree shows all three
 * branches owned under it. */
export function buildingTree(kind: PlacedKind | "wallSpikes", wear?: Wear): TreeNode[] {
  const nodes: TreeNode[] = [];
  const place = placeOf(kind);
  /** A path's ranks from `from`, `have` of them owned; with `via`, the
   * building its attunement makes comes first (`made`: it is that building).
   * With `peek`, only the branch's first node shows, its ranks hidden
   * beyond it. Returns the top node's id. */
  const climb = (p: KnowledgePath, from: string, have: number, via?: { kind: PlacedKind; cost: number }, made = false, merged = false, peek = false) => {
    let parent = from;
    const more = { hidden: [{ side: false, i: 0, n: 1 }] };
    if (via) {
      nodes.push({ id: kid(via.kind), parent, state: made ? "owned" : "next", kind: via.kind, cost: via.cost, step: { type: "become", to: via.kind, cost: via.cost },
        ...(merged ? { merged } : {}), ...(peek ? more : {}) });
      if (peek) return kid(via.kind);
      parent = kid(via.kind);
    }
    p.ranks.forEach((r, i) => {
      if (peek && i > 0) return;
      const rank = i + 1, state = rank <= have ? "owned" : rank === have + 1 && (made || !via) ? "next" : "locked";
      nodes.push({ id: pid(p.id, rank), parent, state, path: p.id, rank, cost: r.cost, step: { type: "path", path: p.id, rank, cost: r.cost },
        ...(merged ? { merged } : {}), ...(peek ? more : {}) });
      parent = pid(p.id, rank);
    });
    return parent;
  };
  /** The line's ultimate over `top`, the end of the branch it is bought from. */
  const crown = (a: Attuned, top: string, state: TreeNode["state"]) => {
    if (a.ultimate) nodes.push({ id: kid(a.ultimate), parent: top, state, kind: a.ultimate, cost: MERGE_COST, step: { type: "merge", to: a.ultimate, cost: MERGE_COST }, ...beyond(a.ultimate) });
    else nodes.push({ id: `u:${a.kind}`, parent: top, state: "locked", cost: 0, soon: a.kind });
  };
  /** The basic building and the attuned one it became, owned, the other
   * attuned ones closed off. */
  const roots = (a: Attuned, merged: boolean) => {
    const others = ATTUNED.filter((o) => o.from === a.from), i = others.indexOf(a);
    nodes.push({ id: kid(a.from), state: "owned", kind: a.from, cost: 0,
      closed: others.map((_, j) => ({ side: true, i: j, n: others.length })).filter((o) => o.i !== i), took: { side: true, i, n: others.length }, ...(merged ? { merged } : {}) });
    nodes.push({ id: kid(a.kind), parent: kid(a.from), state: "owned", kind: a.kind, cost: a.cost, step: { type: "become", to: a.kind, cost: a.cost }, ...(merged ? { merged } : {}) });
  };
  /** A kind's own paths and what it can become beyond, over node `from`. */
  const own = (k: PlacedKind | "wallSpikes", from: string) => {
    const node = nodes.find((n) => n.id === from)!, open = openings(k), paths = buildingPathsOf(k);
    if (wear) {
      const took = open.find((o) => !o.side && paths[o.i]?.id === wear.path);
      if (took && open.length > 1) Object.assign(node, { closed: open.filter((o) => o !== took), took });
      return climb(pathById(wear.path), from, wear.rank);
    }
    for (const b of k === "wallSpikes" ? [] : BECOMES[k] ?? []) nodes.push({ id: kid(b.to), parent: from, state: "next", kind: b.to, cost: b.cost, step: { type: "become", ...b }, side: true, ...beyond(b.to) });
    for (const p of paths) climb(p, from, 0);
  };

  if (place.tier === "attuned" || place.tier === "via") {
    const a = place.a, mine = branchOf(a, kind, wear);
    roots(a, false);
    const attuned = nodes[nodes.length - 1];
    if (mine < 0) {
      // Every branch open: only their attunements show until one is taken.
      for (const b of a.branches) climb(pathById(b.path), kid(a.kind), 0, b.via, false, false, true);
      return nodes;
    }
    const b = a.branches[mine], open = openings(a.kind);
    if (open.length > 1) Object.assign(attuned, { closed: open.filter((o) => o.i !== mine), took: open[mine] });
    const have = wear?.path === b.path ? wear.rank : 0;
    const top = climb(pathById(b.path), kid(a.kind), have, b.via, place.tier === "via");
    crown(a, top, have >= topRank(b.path) ? "next" : "locked");
    return nodes;
  }
  if (place.tier === "ultimate" || (place.tier === "beyond" && mergedFrom(place.from))) {
    // The lineage up to the ultimate, all owned and merged, then what is beyond.
    const chain: PlacedKind[] = [kind as PlacedKind];
    for (let p = placeOf(chain[0]); p.tier === "beyond"; p = placeOf(chain[0])) chain.unshift(p.from);
    const a = attunedOf(chain[0])!;
    roots(a, true);
    let top = kid(a.kind);
    a.branches.forEach((b, i) => {
      const end = climb(pathById(b.path), kid(a.kind), topRank(b.path), b.via, !!b.via, true);
      if (i === MIDDLE) top = end;
    });
    nodes.push({ id: kid(chain[0]), parent: top, state: "owned", kind: chain[0], cost: MERGE_COST, step: { type: "merge", to: chain[0], cost: MERGE_COST } });
    for (let i = 1; i < chain.length; i++) {
      const b = BECOMES[chain[i - 1]]!.find((o) => o.to === chain[i])!, open = openings(chain[i - 1]), j = BECOMES[chain[i - 1]]!.indexOf(b);
      const from = nodes.find((n) => n.id === kid(chain[i - 1]))!;
      if (open.length > 1) Object.assign(from, { closed: open.filter((o) => !(o.side && o.i === j)), took: open.find((o) => o.side && o.i === j) });
      nodes.push({ id: kid(chain[i]), parent: kid(chain[i - 1]), state: "owned", kind: chain[i], cost: b.cost, step: { type: "become", ...b } });
    }
    own(kind, kid(kind));
    return nodes;
  }
  // A basic building, or one outside the lines (bait, spikes).
  nodes.push({ id: kid(kind), state: "owned", kind, cost: 0 });
  if (place.tier === "basic") {
    for (const a of ATTUNED.filter((o) => o.from === kind)) nodes.push({ id: kid(a.kind), parent: kid(kind), state: "next", kind: a.kind, cost: a.cost, step: { type: "become", to: a.kind, cost: a.cost }, side: true, ...beyond(a.kind) });
    return nodes;
  }
  own(kind, kid(kind));
  return nodes;
}

/** Whether a palette item has an upgrade tree worth showing: something it
 * grew from, can become, or a path it can climb. */
export function hasTree(kind: string): kind is PaletteKind {
  if (buildingPathsOf(kind).length) return true;
  return kind !== "wallSpikes" && placeOf(kind as PlacedKind).tier !== "other";
}


// ── In battle ──────────────────────────────────────────────────────────
/** What the next defense's buildings fight with, keyed by structure uid (or
 * a spike row's wall spot): each one's own path at its own rank. A battle
 * keeps this snapshot however the city is changed after it starts. */
export function placedBattlePaths(save: Save): Pick<Bonuses, "structurePaths" | "spikePaths"> {
  const structurePaths: Record<number, BattlePaths> = {}, spikePaths: Record<string, BattlePaths> = {};
  const wear = (kind: string, p: { path?: PathId; rank?: number }): BattlePaths | undefined => {
    const topic = pathTopicOf(kind);
    return topic && p.path && wearFits(kind, p.path, p.rank) ? { [topic]: { path: p.path, rank: p.rank! } } : undefined;
  };
  for (const s of save.defend.layout.structures) {
    const paths = wear(s.kind, s);
    if (paths) structurePaths[s.uid] = paths;
  }
  for (const g of save.defend.layout.spikes) {
    const paths = wear("wallSpikes", g);
    if (paths) spikePaths[spikeKey(g)] = paths;
  }
  return { ...(Object.keys(structurePaths).length ? { structurePaths } : {}), ...(Object.keys(spikePaths).length ? { spikePaths } : {}) };
}

/** Read a building's own choices; the global fallback supports old isolated
 * battle fixtures. Live saves always supply per-building choices. */
export const buildingPaths = (sim: { bonuses: Readonly<Bonuses> }, b?: { structureUid?: number }) =>
  b?.structureUid !== undefined ? sim.bonuses.structurePaths?.[b.structureUid] ?? sim.bonuses.paths : sim.bonuses.paths;

/** Every path a building of `kind` can wear (none for a spell). */
export const buildingPathsOf = (kind: PaletteItem | string): KnowledgePath[] => {
  const topic = pathTopicOf(kind);
  if (!topic) return [];
  const place = placeOf(kind as PlacedKind);
  // Basic buildings have none: they become attuned ones. An attuned one's
  // are its branches (those that make it another building are that one's).
  if (place.tier === "basic") return [];
  if (place.tier === "attuned") return place.a.branches.filter((b) => !b.via).map((b) => pathById(b.path));
  if (place.tier === "via") return [pathById(place.a.branches[place.branch].path)];
  return pathsOf(topic);
};

// ── Older saves ─────────────────────────────────────────────────────────
/** Before version 5 a path was researched once in the Study for every
 * building of its kind, and buildings wore it at its researched rank.
 * Now each building climbs its own path with Knowledge it can be respecced
 * for, so all that research comes back as Knowledge, the buildings in the
 * city stand plain to be upgraded again, and evolved buildings (made free
 * from a researched crown) turn back into the buildings they grew from.
 * Study research is left for the spells. Run on every load: a newer save's
 * buildings already have their own ranks, and nothing is left to refund. */
export function migrateResearch(save: Save) {
  const d = save.defend;
  let next = cloneLayout(d.layout);
  for (const p of [...next.structures, ...next.spikes]) {
    if (p.path && p.rank) continue;
    delete p.path;
    delete p.rank;
  }
  for (const p of PATHS) {
    const r = save.pathResearch[p.id];
    if (!r || isSpell(p.topic)) continue;
    save.knowledge += Math.max(0, r.spent);
    if (r.crowned && p.legacyCrown) {
      const { item, from } = p.legacyCrown;
      // Those standing are taken up: the base building's footprint differs.
      next.structures = next.structures.filter((st) => st.kind !== item);
      d.owned[from] += d.owned[item];
      d.owned[item] = 0;
      d.kept = d.kept.filter((k) => k.kind !== item);
    }
    delete save.pathResearch[p.id];
  }
  d.layout = next;
}

/** The Barracks once had an Assassins path, retired when assassins got a
 * building of their own (the Assassins' den, from the Melee Guild). Every
 * Knowledge point it took comes back: the ranks barracks wore (standing or
 * kept), its Study research from before version 5, and an unfinished
 * project on it. The barracks themselves stand plain (their decoder drops
 * the path). Reads the raw saved JSON, so run once, on load. */
export function refundRetiredAssassins(raw: any, save: Save) {
  const ranks = (r: unknown) => (Number.isInteger(r) && (r as number) >= 1 && (r as number) <= 3 ? (r as number) : 0);
  const paid = (rank: number) => Array.from({ length: rank }, (_, i) => studyPathCost(4, i)).reduce((a, b) => a + b, 0);
  const worn = (list: unknown) => (Array.isArray(list) ? list : []).reduce((n: number, p: any) => n + (p?.kind === "barracks" && p.path === "assassins" ? paid(ranks(p.rank)) : 0), 0);
  let back = worn(raw?.defend?.layout?.structures) + worn(raw?.defend?.kept);
  const research = raw?.pathResearch?.assassins?.spent;
  if (Number.isFinite(research) && research > 0) back += research;
  // Version 2 chose it for every barracks at once.
  const legacy = raw?.pathResearch === undefined && raw?.paths?.barracks?.path === "assassins" ? raw.paths.barracks.spent : 0;
  if (Number.isFinite(legacy) && legacy > 0) back += legacy;
  const job = raw?.researchJob;
  if (job?.id === "assassins" && Number.isSafeInteger(job.paid) && job.paid > 0) back += job.paid;
  save.knowledge += back;
  return back;
}

/** Before version 6 a Ranged Guild became a Musket hall (10 Knowledge) or a
 * Sniper lodge (8) at once; now a Musket hall grows from a Gunner hall,
 * and a Sniper lodge is a Musket hall's crowned Sharpshooters. Every copy
 * of either turns back into a Ranged Guild, its Knowledge (the change and
 * every path rank it wore) given back; those standing are taken up, to be
 * placed and upgraded again. Run on loading a save from before then. */
export function migrateGunLine(save: Save) {
  const d = save.defend, was: [PlacedKind, number][] = [["musketHall", 10], ["sniperLodge", 8]];
  const ranks = (w: { path?: PathId; rank?: number }) => (w.path && w.rank ? allocated("rangedGuild", { path: w.path, rank: w.rank }) : 0);
  const next = cloneLayout(d.layout);
  for (const [kind, cost] of was) {
    let back = d.owned[kind] * cost;
    for (const s of next.structures) if (s.kind === kind) back += ranks(s);
    for (const k of d.kept) if (k.kind === kind) back += ranks(k);
    next.structures = next.structures.filter((s) => s.kind !== kind);
    d.kept = d.kept.filter((k) => k.kind !== kind);
    d.owned.rangedGuild += d.owned[kind];
    d.owned[kind] = 0;
    save.knowledge += back;
  }
  d.layout = next;
}

/** What each ultimate cost before version 7, when it was a path's crown
 * (the Hero and the Revolutionary a change of kind): every step from its
 * basic building, at version 6's prices. */
const OLD_ULTIMATES: Partial<Record<PlacedKind, number>> = {
  darkKeep: 175023, heroHall: 100004, valkyriePalace: 120027, sniperLodge: 70026, gatlingNest: 70028, revolutionary: 170026,
};

/** Version 7 gave every line one shape (`ATTUNED`): basic buildings lost
 * their paths, each attuned building kept three branches (the spearmen's
 * and gunners' one path each of the buildings they branch into), and
 * ultimates are merged rather than crowned. Every rank worn on a path the
 * building can no longer take comes back as Knowledge (its decoder has
 * already dropped it, so this reads the raw saved JSON), and each ultimate
 * owned gets back what it cost then beyond what a respec gives back now.
 * Run once, on loading a save from before then, after `migrateGunLine`. */
export function migrateTrees(raw: any, save: Save): number {
  let back = 0;
  const worn = (list: unknown) => {
    for (const p of Array.isArray(list) ? list : []) {
      const path = PATHS.find((o) => o.id === p?.path), kind = p?.kind;
      if (!path || typeof kind !== "string" || !Number.isInteger(p.rank) || p.rank < 1 || p.rank > path.ranks.length) continue;
      if (path.topic !== pathTopicOf(kind) || buildingPathsOf(kind).some((o) => o.id === path.id)) continue;
      back += pathCost(path.id, p.rank);
    }
  };
  worn(raw?.defend?.layout?.structures);
  worn(raw?.defend?.kept);
  for (const [kind, old] of Object.entries(OLD_ULTIMATES)) back += save.defend.owned[kind as PlacedKind] * Math.max(0, old! - lineageCost(kind as PlacedKind));
  save.knowledge += back;
  return back;
}

/** Version 3 kept a card per owned copy, each with its own path and the
 * placement it was bound to. The buildings standing in the city keep their
 * card's path; cards waiting in the palette become plain copies. */
export function migrateCards(raw: unknown, save: Save) {
  if (!Array.isArray(raw)) return;
  const d = save.defend, next = cloneLayout(d.layout);
  for (const c of raw) {
    if (!c || typeof c !== "object" || typeof c.placement !== "string" || c.evolved !== undefined || typeof c.path !== "string") continue;
    const path = PATHS.find((p) => p.id === c.path)?.id;
    if (!path || !save.pathResearch[path]?.rank) continue;
    const placed = c.placement.startsWith("structure:")
      ? next.structures.find((s) => `structure:${s.uid}` === c.placement && s.kind === c.kind)
      : c.kind === "wallSpikes" ? next.spikes.find((g) => spikeKey(g) === c.placement) : undefined;
    if (placed && !placed.path && pathFits(c.kind, path)) placed.path = path;
  }
  d.layout = next;
}

/** Version 2 chose one path a topic for every copy: the buildings standing
 * in the city keep it. */
export function migrateTopicPaths(choices: Partial<Record<string, { path: PathId }>>, save: Save) {
  const next = cloneLayout(save.defend.layout);
  for (const placed of [...next.structures.map((s) => [s.kind, s] as const), ...next.spikes.map((g) => ["wallSpikes", g] as const)]) {
    const [kind, p] = placed, topic = pathTopicOf(kind), choice = topic ? choices[topic] : undefined;
    if (choice && !p.path && save.pathResearch[choice.path]?.rank) p.path = choice.path;
  }
  save.defend.layout = next;
}

/** Keeps `d.kept` (buildings on a path waiting in the palette) in step
 * with a change of city from `prev` to `next`: a building on a path that
 * leaves the city is kept, and one placed from a kept copy is no longer
 * waiting. Counted per kind, path and rank, so moves change nothing. */
export function settleKept(d: DefendSave, prev: Layout, next: Layout) {
  const tally = (l: Layout) => {
    const n = new Map<string, number>();
    for (const [kind, p] of [...l.structures.map((s) => [s.kind, s] as const), ...l.spikes.map((g) => ["wallSpikes", g] as const)]) {
      const w = wearOf(p);
      if (w) n.set(`${kind}|${w.path}|${w.rank}`, (n.get(`${kind}|${w.path}|${w.rank}`) ?? 0) + 1);
    }
    return n;
  };
  const before = tally(prev), after = tally(next);
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const [kind, path, rank] = key.split("|");
    let diff = (before.get(key) ?? 0) - (after.get(key) ?? 0);
    for (; diff > 0; diff--) d.kept.push({ kind: kind as PlacedKind | "wallSpikes", path: path as PathId, rank: Number(rank) });
    for (; diff < 0; diff++) {
      const i = d.kept.findIndex((k) => k.kind === kind && k.path === path && k.rank === Number(rank));
      if (i >= 0) d.kept.splice(i, 1);
    }
  }
}

// ── Discoveries ─────────────────────────────────────────────────────────
/** Every upgrade a basic building's line can ever reach, as one web: the
 * attuned buildings it can become, each one's branches rank by rank, its
 * ultimate (over the middle branch), and the ultimate's own paths and what
 * it becomes beyond. Ids match `buildingTree`'s, so a node any building of
 * the line has owned is found in it. States are all `locked`: the map sets
 * its own. */
export function fullTree(root: PaletteKind): TreeNode[] {
  const nodes: TreeNode[] = [];
  const climb = (p: KnowledgePath, from: string, via?: Branch["via"]) => {
    if (via) {
      nodes.push({ id: kid(via.kind), parent: from, state: "locked", kind: via.kind, cost: via.cost, step: { type: "become", to: via.kind, cost: via.cost } });
      from = kid(via.kind);
    }
    p.ranks.forEach((r, i) => {
      const id = pid(p.id, i + 1);
      nodes.push({ id, parent: from, state: "locked", path: p.id, rank: i + 1, cost: r.cost, step: { type: "path", path: p.id, rank: i + 1, cost: r.cost } });
      from = id;
    });
    return from;
  };
  const grow = (k: PaletteKind, parent: string | undefined, step: UpgradeStep | undefined, cost: number) => {
    const id = kid(k);
    nodes.push({ id, ...(parent ? { parent } : {}), state: "locked", kind: k, cost, ...(step ? { step } : {}) });
    const place = placeOf(k);
    if (place.tier === "attuned") {
      const a = place.a;
      a.branches.forEach((b, i) => {
        const top = climb(pathById(b.path), id, b.via);
        if (i === MIDDLE && a.ultimate) grow(a.ultimate, top, { type: "merge", to: a.ultimate, cost: MERGE_COST }, MERGE_COST);
      });
      return;
    }
    if (k !== "wallSpikes") for (const b of BECOMES[k] ?? []) grow(b.to, id, { type: "become", ...b }, b.cost);
    for (const p of buildingPathsOf(k)) climb(p, id);
  };
  grow(root, undefined, undefined, 0);
  return nodes;
}

/** The basic buildings whose lines have a map: every root with a tree. */
export const MAP_ROOTS: PaletteKind[] = ["watchTower", "meleeGuild", "rangedGuild", "monsterBait", "wallSpikes"];
/** Every node id any map can show. */
const MAP_IDS = () => new Set(MAP_ROOTS.flatMap((r) => fullTree(r).map((n) => n.id)));

/** The nodes the city's buildings and the palette's copies have now: each
 * one's lineage and the ranks it wears. */
export function heldNodes(d: DefendSave): Set<string> {
  const held = new Set<string>();
  const add = (kind: PaletteKind, wear?: Wear) => {
    if (!hasTree(kind)) return;
    for (const n of buildingTree(kind, wear)) if (n.state === "owned") held.add(n.id);
  };
  for (const s of d.layout.structures) add(s.kind, wearOf(s));
  for (const g of d.layout.spikes) add("wallSpikes", wearOf(g));
  for (const k of d.kept) add(k.kind, { path: k.path, rank: k.rank });
  for (const [kind, n] of Object.entries(d.owned)) if (n > 0) add(kind as PaletteKind);
  return held;
}

/** Every upgrade discovered: those any building ever reached (saved in
 * `upgradesFound`) and those held now. Shared by every building of a line,
 * whatever each one's own upgrades. */
export const foundNodes = (d: DefendSave): Set<string> => new Set([...(d.upgradesFound ?? []), ...heldNodes(d)]);

/** Saves what is held now as discovered (after an upgrade). */
export function recordFound(d: DefendSave) {
  const found = [...foundNodes(d)].sort();
  if (found.length) d.upgradesFound = found;
}

/** The saved discoveries, keeping only nodes some map has (absent with none). */
export function decodeFound(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = MAP_IDS(), found = [...new Set(raw.filter((id): id is string => typeof id === "string" && ids.has(id)))].sort();
  return found.length ? found : undefined;
}
