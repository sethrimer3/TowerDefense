/** Each building's own upgrades. The shop sells only the basic buildings
 * (`BASIC_BUILDINGS`: the Watch tower, the Melee Guild and the Ranged Guild,
 * besides the city's own pieces); everything else is one of those upgraded,
 * one building at a time, with Knowledge, down its own branching path:
 *
 *  - while a building wears no path it can become one of the buildings its
 *    kind branches into (`BECOMES`: a Watch tower into an archer, cannon or
 *    wizard tower; a Melee Guild into a barracks of swordsmen or an
 *    assassins' den; a Ranged Guild into archers, fire mages or gunners,
 *    and a Gunner hall into musketmen, machine gunners or rockets), or set out on
 *    one of its kind's Knowledge paths (`knowledge-paths.ts`);
 *  - a building on a path climbs it rank by rank;
 *  - at a path's last rank, a path with a crown evolves the building
 *    (Crusaders: a Valkyrie palace; Stormcalling: a Dark wizard keep;
 *    Sharpshooters: a Sniper lodge; Belt feed: a Gatling emplacement).
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
import { hash } from "./defend/grid.ts";
import { keptGroups, plainAvailable, type DefendSave } from "./defend/progress.ts";
import { PATHS, isSpell, pathById, pathFits, pathTopicOf, pathsOf, type BattlePaths, type KnowledgePath, type PathId } from "./knowledge-paths.ts";
import type { Save } from "./save.ts";
import { studyPathCost } from "./economy.ts";

export const spikeKey = (g: { tx: number; ty: number; side: string }) => `spikes:${g.tx}:${g.ty}:${g.side}`;

/** A path a building wears, at the rank it has climbed to. */
export type Wear = { path: PathId; rank: number };

/** What a plain building of each kind can become, and the Knowledge it costs. */
export const BECOMES: Partial<Record<PlacedKind, { to: PlacedKind; cost: number }[]>> = {
  watchTower: [
    { to: "archerTower", cost: 3 },
    { to: "cannonTower", cost: 6 },
    { to: "wizardTower", cost: 8 },
  ],
  meleeGuild: [
    { to: "barracks", cost: 4 },
    { to: "assassinDen", cost: 6 },
  ],
  rangedGuild: [
    { to: "archerBarracks", cost: 5 },
    { to: "mageGuild", cost: 9 },
    { to: "gunHall", cost: 6 },
  ],
  gunHall: [
    { to: "musketHall", cost: 8 },
    { to: "gunNest", cost: 10 },
    { to: "rocketBattery", cost: 12 },
  ],
};

/** What each kind's troops are called on its upgrade buttons. */
export const TROOPS: Partial<Record<PlacedKind, string>> = {
  meleeGuild: "Brawlers", rangedGuild: "Stone throwers", barracks: "Swordsmen", assassinDen: "Assassins", archerBarracks: "Archers", mageGuild: "Fire mages",
  sniperLodge: "Snipers", musketHall: "Musketmen",
  gunHall: "Gunners", gunNest: "Machine gunners", gatlingNest: "Gatling gunners", rocketBattery: "Rocketeers", valkyriePalace: "Valkyries", darkKeep: "Dark wizard",
};

/** The kind `kind` was upgraded from (its parent in the tree), if any. */
export function upgradedFrom(kind: PlacedKind): PlacedKind | undefined {
  for (const [from, list] of Object.entries(BECOMES)) if (list!.some((b) => b.to === kind)) return from as PlacedKind;
  return PATHS.find((p) => p.evolves?.item === kind)?.evolves?.from;
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
  | { type: "evolve"; path: PathId; to: PlacedKind; cost: number };

/** Every upgrade a building of `kind` wearing `wear` can take next. */
export function nextSteps(kind: PlacedKind | "wallSpikes", wear?: Wear): UpgradeStep[] {
  if (wear) {
    const p = pathById(wear.path), next = p.ranks[wear.rank];
    if (next) return [{ type: "path", path: p.id, rank: wear.rank + 1, cost: next.cost }];
    return p.evolves ? [{ type: "evolve", path: p.id, to: p.evolves.item, cost: p.evolves.cost }] : [];
  }
  const becomes = kind === "wallSpikes" ? [] : (BECOMES[kind] ?? []).map((b): UpgradeStep => ({ type: "become", ...b }));
  const topic = pathTopicOf(kind);
  const paths = topic ? pathsOf(topic).map((p): UpgradeStep => ({ type: "path", path: p.id, rank: 1, cost: p.ranks[0].cost })) : [];
  return [...becomes, ...paths];
}
export const sameStep = (a: UpgradeStep, b: UpgradeStep) =>
  a.type === b.type && (a.type === "become" ? a.to === (b as typeof a).to : a.path === (b as { path: PathId }).path && (a.type !== "path" || a.rank === (b as typeof a).rank));

/** A step's name, as its button reads. */
export function stepName(s: UpgradeStep): string {
  if (s.type === "become") return ITEM_NAMES[s.to];
  if (s.type === "evolve") return ITEM_NAMES[s.to];
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
  typeof path === "string" && pathFits(kind, path as PathId) && Number.isInteger(rank) && (rank as number) >= 1 && (rank as number) <= pathById(path as PathId).ranks.length;

// ── Upgrading ──────────────────────────────────────────────────────────
export type UpgradeResult = { ok: false; reason: string } | { ok: true; kind: PlacedKind | "wallSpikes"; waiting?: boolean; copy?: SpecialtyTarget };

/** Upgrades the building at `target` by `step`, paying its Knowledge (free
 * with Unlimited money). A building that becomes another stands where it
 * was if the new one fits there (its tile reshuffled if need be), and
 * otherwise waits in the palette. Only while building. */
export function upgradeBuilding(save: Save, target: SpecialtyTarget, asked: UpgradeStep): UpgradeResult {
  if ("copy" in target) return upgradeCopy(save, target, asked);
  const d = save.defend, kind = targetKind(d.layout, target), placed = placementOf(d.layout, target);
  if (!kind || !placed) return { ok: false, reason: "That building is no longer there." };
  // The price and result are always the catalog's, never the caller's.
  const step = nextSteps(kind, wearOf(placed)).find((s) => sameStep(s, asked));
  if (!step) return { ok: false, reason: "That upgrade isn't open to it." };
  const free = save.settings.devMode;
  if (!free && save.knowledge < step.cost) return { ok: false, reason: `Needs ${step.cost} Knowledge.` };
  const next = cloneLayout(d.layout), p = placementOf(next, target)!;
  if (step.type === "path") {
    p.path = step.path;
    p.rank = step.rank;
    d.layout = next;
    if (!free) save.knowledge -= step.cost;
    return { ok: true, kind };
  }
  // Becoming another building (or evolving): one copy of the old kind
  // turns into one of the new.
  const s = p as PlacedStructure;
  s.kind = step.to;
  delete s.path;
  delete s.rank;
  if (!free) save.knowledge -= step.cost;
  d.owned[kind as PlacedKind]--;
  d.owned[step.to]++;
  d.layout = standing(next, s.uid, kind as PlacedKind);
  return { ok: true, kind: step.to, waiting: !d.layout.structures.some((o) => o.uid === s.uid) };
}

/** Upgrades one palette copy: a path step keeps it on that path and rank
 * (a kept copy), a change of kind makes it a plain copy of the new kind.
 * `copy` in the result names the copy it became. */
function upgradeCopy(save: Save, target: { copy: PaletteKind; wear?: Wear }, asked: UpgradeStep): UpgradeResult {
  const d = save.defend, kind = target.copy;
  if (!copyWaits(d, kind, target.wear)) return { ok: false, reason: "That copy is no longer in the palette." };
  const step = nextSteps(kind, target.wear).find((s) => sameStep(s, asked));
  if (!step) return { ok: false, reason: "That upgrade isn't open to it." };
  const free = save.settings.devMode;
  if (!free && save.knowledge < step.cost) return { ok: false, reason: `Needs ${step.cost} Knowledge.` };
  if (!free) save.knowledge -= step.cost;
  unkeep(d, kind, target.wear);
  if (step.type === "path") {
    d.kept.push({ kind, path: step.path, rank: step.rank });
    return { ok: true, kind, copy: { copy: kind, wear: { path: step.path, rank: step.rank } } };
  }
  d.owned[kind as PlacedKind]--;
  d.owned[step.to]++;
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
/** The Knowledge allocated to a building of `kind` wearing `wear`: every
 * step from its basic building to where it stands now, at today's prices
 * (what a respec gives back). */
export function allocated(kind: PlacedKind | "wallSpikes", wear?: Wear): number {
  let total = 0;
  if (wear) {
    const p = pathById(wear.path);
    for (let r = 0; r < wear.rank; r++) total += p.ranks[r].cost;
  }
  if (kind === "wallSpikes") return total;
  for (let k = kind, up = upgradedFrom(k); up; k = up, up = upgradedFrom(k)) {
    const become = BECOMES[up]?.find((b) => b.to === k);
    if (become) total += become.cost;
    else {
      // Evolved: the whole crowned path, then its crown.
      const p = PATHS.find((o) => o.evolves?.item === k)!;
      total += p.ranks.reduce((n, r) => n + r.cost, 0) + p.evolves!.cost;
    }
  }
  return total;
}

/** Where a building of `kind` wearing `wear` stands once tree node `id`
 * and everything after it are undone: at the node it grew from. Undefined
 * unless `id` is one it has (owned) and not its basic building. */
export function undoTo(kind: PaletteKind, wear: Wear | undefined, id: string): { kind: PaletteKind; wear?: Wear } | undefined {
  const tree = buildingTree(kind, wear), n = tree.find((o) => o.id === id);
  if (!n || n.state !== "owned" || !n.parent) return undefined;
  const to = tree.find((o) => o.id === n.parent)!;
  if (to.kind) return { kind: to.kind };
  // A path rank: the building is the nearest one below it.
  let k = to;
  while (!k.kind) k = tree.find((o) => o.id === k.parent)!;
  return { kind: k.kind, wear: { path: to.path!, rank: to.rank! } };
}

/** The Knowledge undoing node `id` gives back (0 when it can't be undone). */
export function undoRefund(kind: PaletteKind, wear: Wear | undefined, id: string): number {
  const to = undoTo(kind, wear, id);
  return to ? allocated(kind, wear) - allocated(to.kind, to.wear) : 0;
}

/** Undoes tree node `id` of the building at `target` and everything after
 * it, giving back their Knowledge: the building steps back down its tree to
 * the node `id` grew from. Free. Only while building. */
export function undoUpgrade(save: Save, target: SpecialtyTarget, id: string): UpgradeResult {
  const d = save.defend, kind = targetKind(d, target), wear = specialtyOf(d, target);
  if (!kind) return { ok: false, reason: "That building is no longer there." };
  const to = undoTo(kind, wear, id);
  if (!to) return { ok: false, reason: "Nothing to undo there." };
  return rewind(save, target, kind, wear, to);
}

/** Respecs the building at `target`: every Knowledge point back, and back
 * to its basic building with no path. Free. Only while building. */
export function respecBuilding(save: Save, target: SpecialtyTarget): UpgradeResult {
  const d = save.defend, kind = targetKind(d, target), wear = specialtyOf(d, target);
  if (!kind) return { ok: false, reason: "That building is no longer there." };
  const root = kind === "wallSpikes" ? kind : rootOf(kind);
  if (root === kind && !wear) return { ok: false, reason: "Nothing to respec: it has no upgrades." };
  return rewind(save, target, kind, wear, { kind: root });
}

/** Steps the building at `target` (a `kind` wearing `wear`) back to `to`,
 * giving back the Knowledge between them. A placed one that changes kind
 * stays where it was if it fits (its tile reshuffled if need be), else it
 * waits in the palette; a palette copy becomes a copy of `to`. */
function rewind(save: Save, target: SpecialtyTarget, kind: PaletteKind, wear: Wear | undefined, to: { kind: PaletteKind; wear?: Wear }): UpgradeResult {
  const d = save.defend;
  save.knowledge += allocated(kind, wear) - allocated(to.kind, to.wear);
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
 * (`k:<kind>`), or one rank of a path (`p:<path>:<rank>`). */
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
};

/** Where a branch stands among its node's: one of the `n` choices that turn
 * the building into another (`side`), or of the `n` paths carrying on up
 * from it, the `i`th of them in order. */
export type BranchSlot = { side: boolean; i: number; n: number };

/** The branches a plain building of `kind` has open: buildings to become,
 * then paths to climb, in the order the tree lists them. */
const openings = (kind: PlacedKind | "wallSpikes"): BranchSlot[] => {
  if (kind === "wallSpikes") return [];
  const becomes = BECOMES[kind] ?? [], paths = buildingPathsOf(kind);
  return [...becomes.map((_, i) => ({ side: true, i, n: becomes.length })), ...paths.map((_, i) => ({ side: false, i, n: paths.length }))];
};
/** `{ hidden }` for a node with branches beyond it, else nothing. */
const beyond = (kind: PlacedKind | "wallSpikes") => (openings(kind).length ? { hidden: openings(kind) } : {});

/** The live upgrade tree of one building of `kind` wearing `wear`: the
 * buildings it has been, then every branch still open to it. A choice cuts
 * off the branches beside it (a Ranged Guild that becomes a Mage Guild can
 * no longer become an archer barracks, and a Mage Guild on Pyroclasm no
 * longer has Cinders), and opens what only that choice leads to (the Mage
 * Guild's own paths appear once it is one). */
export function buildingTree(kind: PlacedKind | "wallSpikes", wear?: Wear): TreeNode[] {
  const nodes: TreeNode[] = [];
  const lineage: (PlacedKind | "wallSpikes")[] = [kind];
  if (kind !== "wallSpikes") for (let up = upgradedFrom(kind); up; up = upgradedFrom(up)) lineage.unshift(up);
  const kid = (k: string) => `k:${k}`, pid = (p: PathId, r: number) => `p:${p}:${r}`;
  /** A path's ranks from `from`, `have` of them owned, then its crown. */
  const climb = (p: KnowledgePath, from: string, have: number, cap: boolean) => {
    let parent = from;
    p.ranks.forEach((r, i) => {
      const rank = i + 1, state = rank <= have ? "owned" : rank === have + 1 ? "next" : "locked";
      nodes.push({ id: pid(p.id, rank), parent, state, path: p.id, rank, cost: r.cost, step: { type: "path", path: p.id, rank, cost: r.cost } });
      parent = pid(p.id, rank);
    });
    if (p.evolves && cap) {
      const state = have >= p.ranks.length ? "next" : "locked";
      nodes.push({ id: kid(p.evolves.item), parent, state, kind: p.evolves.item, cost: p.evolves.cost, step: { type: "evolve", path: p.id, to: p.evolves.item, cost: p.evolves.cost }, ...beyond(p.evolves.item) });
    }
  };
  lineage.forEach((k, i) => {
    const below = lineage[i - 1], cur = i === lineage.length - 1;
    const via = below && below !== "wallSpikes" ? BECOMES[below]?.find((b) => b.to === k) : undefined;
    const evolved = below ? PATHS.find((p) => p.evolves?.item === k && p.evolves.from === below) : undefined;
    if (evolved) {
      // Its crowned path, all owned, then the crown itself.
      climb(evolved, kid(below), evolved.ranks.length, false);
      nodes.push({ id: kid(k), parent: pid(evolved.id, evolved.ranks.length), state: "owned", kind: k, cost: evolved.evolves!.cost, step: { type: "evolve", path: evolved.id, to: k as PlacedKind, cost: evolved.evolves!.cost } });
    } else nodes.push({ id: kid(k), parent: below ? kid(below) : undefined, state: "owned", kind: k, cost: via?.cost ?? 0, ...(via ? { step: { type: "become" as const, ...via } } : {}) });
    // Moving on from it, up a path or into another building, closed off the rest.
    const own = nodes[nodes.length - 1], open = openings(k);
    const next = lineage[i + 1], paths = buildingPathsOf(k);
    const took = cur ? (wear ? open.find((o) => !o.side && paths[o.i]?.id === wear.path) : undefined)
      : open.find((o) => (o.side ? BECOMES[k as PlacedKind]?.[o.i]?.to === next : paths[o.i]?.evolves?.item === next));
    if (own.kind === k && took && open.length > 1) {
      own.closed = open.filter((o) => o !== took);
      own.took = took;
    }
    if (!cur) return;
    if (wear) return climb(pathById(wear.path), kid(k), wear.rank, true);
    for (const b of k === "wallSpikes" ? [] : BECOMES[k] ?? []) nodes.push({ id: kid(b.to), parent: kid(k), state: "next", kind: b.to, cost: b.cost, step: { type: "become", ...b }, side: true, ...beyond(b.to) });
    for (const p of buildingPathsOf(k)) climb(p, kid(k), 0, true);
  });
  return nodes;
}

/** Whether a palette item has an upgrade tree worth showing: something it
 * grew from, can become, or a path it can climb. */
export function hasTree(kind: string): kind is PaletteKind {
  if (buildingPathsOf(kind).length) return true;
  return kind !== "wallSpikes" && (kind in BECOMES || !!upgradedFrom(kind as PlacedKind));
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
  return topic ? pathsOf(topic) : [];
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
    if (r.crowned && p.evolves) {
      const { item, from } = p.evolves;
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
