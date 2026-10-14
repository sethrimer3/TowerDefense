/** Each building's own upgrades. The shop sells only the basic buildings
 * (`BASIC_BUILDINGS`: the Watch tower, the Melee Guild and the Ranged Guild,
 * besides the city's own pieces); everything else is one of those upgraded,
 * one building at a time, with Knowledge, down its own branching path:
 *
 *  - while a building wears no path it can become one of the buildings its
 *    kind branches into (`BECOMES`: a Watch tower into an archer, cannon or
 *    wizard tower; a Melee Guild into a barracks of swordsmen; a Ranged
 *    Guild into archers, fire mages, snipers or musketmen), or set out on
 *    one of its kind's Knowledge paths (`knowledge-paths.ts`);
 *  - a building on a path climbs it rank by rank;
 *  - at a path's last rank, a path with a crown evolves the building
 *    (Crusaders: a Valkyrie palace; Stormcalling: a Dark wizard keep).
 *
 * The kind is the building's kind in the city and among the copies owned
 * (`DefendSave.owned`); its path and rank live on its placement
 * (`PlacedStructure.path/rank`, `SpikeSpot.path/rank`) and move with it.
 * Taken back to the palette, a building on a path keeps it as a kept copy
 * (`DefendSave.kept`), placed again from its own palette entry. Battles
 * snapshot every building's path and rank when they start
 * (`placedBattlePaths`). */
import { ITEM_NAMES, type Bonuses, type PaletteItem } from "./defend/catalog.ts";
import { cloneLayout, fitLayout, sameGate, type GateSpot, type Layout, type PlacedKind, type PlacedStructure, type SpikeSpot } from "./defend/layout.ts";
import { hash } from "./defend/grid.ts";
import type { DefendSave } from "./defend/progress.ts";
import { PATHS, isSpell, pathById, pathFits, pathTopicOf, pathsOf, type BattlePaths, type KnowledgePath, type PathId } from "./knowledge-paths.ts";
import type { Save } from "./save.ts";

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
  meleeGuild: [{ to: "barracks", cost: 4 }],
  rangedGuild: [
    { to: "archerBarracks", cost: 5 },
    { to: "mageGuild", cost: 9 },
    { to: "sniperLodge", cost: 8 },
    { to: "musketHall", cost: 10 },
  ],
};

/** What each kind's troops are called on its upgrade buttons. */
export const TROOPS: Partial<Record<PlacedKind, string>> = {
  meleeGuild: "Brawlers", rangedGuild: "Stone throwers", barracks: "Swordsmen", archerBarracks: "Archers", mageGuild: "Fire mages",
  sniperLodge: "Snipers", musketHall: "Explosive musketmen", valkyriePalace: "Valkyries", darkKeep: "Dark wizard",
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
/** A building that can be upgraded: a structure by uid, or a row of wall
 * spikes by its spot (rows have no uid; their spot moves with them). */
export type SpecialtyTarget = { uid: number } | { spikes: GateSpot };

/** The placement `target` names in `layout`, if it stands there. */
export function placementOf(layout: Layout, target: SpecialtyTarget): PlacedStructure | SpikeSpot | undefined {
  return "uid" in target ? layout.structures.find((s) => s.uid === target.uid) : layout.spikes.find((g) => sameGate(g, target.spikes));
}
/** The palette kind standing at `target`. */
export function targetKind(layout: Layout, target: SpecialtyTarget): PlacedKind | "wallSpikes" | undefined {
  const p = placementOf(layout, target);
  return !p ? undefined : "uid" in target ? (p as PlacedStructure).kind : "wallSpikes";
}
/** The path a placement wears, at its rank, or undefined while plain. */
export const wearOf = (p: { path?: PathId; rank?: number } | undefined): Wear | undefined =>
  p?.path && p.rank ? { path: p.path, rank: p.rank } : undefined;
/** The path `target` wears, at its rank, or undefined while plain. */
export const specialtyOf = (layout: Layout, target: SpecialtyTarget) => wearOf(placementOf(layout, target));

const ROMAN = ["", "I", "II", "III", "IV", "V"];
/** "Pyromancy III", or "Unspecialized". */
export const specialtyLabel = (s: Wear | undefined) => (s ? `${pathById(s.path).name} ${ROMAN[s.rank]}` : "Unspecialized");
/** A well formed wear for `kind`: its own path, at a rank the path has. */
export const wearFits = (kind: string, path: unknown, rank: unknown): boolean =>
  typeof path === "string" && pathFits(kind, path as PathId) && Number.isInteger(rank) && (rank as number) >= 1 && (rank as number) <= pathById(path as PathId).ranks.length;

// ── Upgrading ──────────────────────────────────────────────────────────
export type UpgradeResult = { ok: false; reason: string } | { ok: true; kind: PlacedKind | "wallSpikes"; waiting?: boolean };

/** Upgrades the building at `target` by `step`, paying its Knowledge (free
 * with Unlimited money). A building that becomes another stands where it
 * was if the new one fits there (its tile reshuffled if need be), and
 * otherwise waits in the palette. Only while building. */
export function upgradeBuilding(save: Save, target: SpecialtyTarget, asked: UpgradeStep): UpgradeResult {
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
  d.layout = standing(next, s.uid);
  return { ok: true, kind: step.to, waiting: !d.layout.structures.some((o) => o.uid === s.uid) };
}

/** `l` as it is if it fits; else with the tile under structure `uid`
 * reshuffled; else with that structure taken up (back to the palette). */
function standing(l: Layout, uid: number): Layout {
  if (fitLayout(l).ok) return l;
  const s = l.structures.find((o) => o.uid === uid)!;
  for (let r = 1; r <= 8; r++) {
    const next = cloneLayout(l);
    next.rolls = l.rolls + r;
    for (const o of next.structures) if (o.tx === s.tx && o.ty === s.ty) o.spot = hash(next.rolls, o.uid, 0x5b07);
    if (fitLayout(next).ok) return next;
  }
  const next = cloneLayout(l);
  next.structures = next.structures.filter((o) => o.uid !== uid);
  return next;
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
 * building of its kind, and each placed building wore it at its researched
 * rank. Now each building owns its rank: those standing in the city keep
 * the path they wore at the rank it had (they play as before); Knowledge
 * spent on a path no building wears comes back, less a crown whose
 * evolved buildings are still owned. Study research is left for the spells.
 * Run on every load: a newer save's buildings already have their ranks. */
export function migrateResearch(save: Save) {
  const d = save.defend, next = cloneLayout(d.layout);
  const worn = new Set<PathId>();
  for (const p of [...next.structures, ...next.spikes]) {
    if (p.path && p.rank) {
      worn.add(p.path);
      continue;
    }
    const rank = p.path ? save.pathResearch[p.path]?.rank ?? 0 : 0;
    if (p.path && rank) {
      p.rank = rank;
      worn.add(p.path);
    } else {
      delete p.path;
      delete p.rank;
    }
  }
  d.layout = next;
  for (const p of PATHS) {
    const r = save.pathResearch[p.id];
    if (!r || isSpell(p.topic)) continue;
    const crownKept = r.crowned && p.evolves && d.owned[p.evolves.item] > 0 ? p.evolves.cost : 0;
    if (!worn.has(p.id)) save.knowledge += Math.max(0, r.spent - crownKept);
    delete save.pathResearch[p.id];
  }
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
