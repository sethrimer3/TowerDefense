/** Which Knowledge path each placed building wears. What the player owns is
 * plain counts (`DefendSave.owned`): five Wizard towers are five Wizard
 * towers. A building's specialization lives on its placement in the city
 * layout (`PlacedStructure.path`, `SpikeSpot.path`): chosen in Defend when
 * it is placed, changed there while building, carried along when it moves,
 * and gone when it is taken back to the palette. The rank is never stored:
 * a building wears its path's furthest researched rank, read when a defense
 * starts (`placedBattlePaths`), so research raises every building on the
 * path at once. */
import type { Bonuses, PaletteItem } from "./defend/catalog.ts";
import { cloneLayout, removeStructure, sameGate, type GateSpot, type Layout, type PlacedKind, type PlacedStructure, type SpikeSpot } from "./defend/layout.ts";
import { available, type DefendSave } from "./defend/progress.ts";
import { PATHS, pathById, pathFits, pathTopicOf, pathsOf, type BattlePaths, type KnowledgePath, type PathChoices, type PathId, type PathResearch } from "./knowledge-paths.ts";
import type { Save } from "./save.ts";

export const spikeKey = (g: { tx: number; ty: number; side: string }) => `spikes:${g.tx}:${g.ty}:${g.side}`;

/** A building that can wear a path: a structure by uid, or a row of wall
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

/** One of a kind's paths and the rank researched on it (0: still to research). */
export type Specialty = { path: KnowledgePath; rank: number };
/** Every path `kind` could wear, in the catalog's order. */
export function specialties(research: PathResearch, kind: PaletteItem | string): Specialty[] {
  const topic = pathTopicOf(kind);
  return topic ? pathsOf(topic).map((path) => ({ path, rank: research[path.id]?.rank ?? 0 })) : [];
}
/** Whether a newly placed `kind` has a researched path to choose from. */
export const canSpecialize = (research: PathResearch, kind: PaletteItem | string) => specialties(research, kind).some((s) => s.rank > 0);

/** The path `target` wears, at its researched rank, or undefined while unspecialized. */
export function specialtyOf(layout: Layout, research: PathResearch, target: SpecialtyTarget): { path: PathId; rank: number } | undefined {
  const path = placementOf(layout, target)?.path, rank = path ? research[path]?.rank ?? 0 : 0;
  return path && rank ? { path, rank } : undefined;
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];
/** "Pyromancy III", or "Unspecialized". */
export const specialtyLabel = (s: { path: PathId; rank: number } | undefined) => (s ? `${pathById(s.path).name} ${ROMAN[s.rank]}` : "Unspecialized");

/** Puts `path` on the building at `target` (or, with none, takes its path
 * off). Free: the Study already paid for the research. Refused for a path
 * that isn't researched or isn't the building's own. */
export function specialize(d: DefendSave, research: PathResearch, target: SpecialtyTarget, path?: PathId): boolean {
  const kind = targetKind(d.layout, target);
  if (!kind || (path && (!pathFits(kind, path) || !research[path]?.rank))) return false;
  const next = cloneLayout(d.layout), placed = placementOf(next, target)!;
  if (path) placed.path = path;
  else delete placed.path;
  d.layout = next;
  return true;
}

/** Takes off every path that isn't researched or isn't its building's own
 * (an unlearned topic, or a save edited by hand). */
export function settlePaths(d: DefendSave, research: PathResearch) {
  const wrong = (kind: string, p: { path?: PathId }) => p.path && (!pathFits(kind, p.path) || !research[p.path]?.rank);
  if (!d.layout.structures.some((s) => wrong(s.kind, s)) && !d.layout.spikes.some((g) => wrong("wallSpikes", g))) return;
  const next = cloneLayout(d.layout);
  for (const s of next.structures) if (wrong(s.kind, s)) delete s.path;
  for (const g of next.spikes) if (wrong("wallSpikes", g)) delete g.path;
  d.layout = next;
}

/** What the next defense's buildings fight with, keyed by structure uid (or
 * a spike row's wall spot): each one's own path at its researched rank. A
 * battle keeps this snapshot however the city is changed after it starts. */
export function placedBattlePaths(save: Save): Pick<Bonuses, "structurePaths" | "spikePaths"> {
  const structurePaths: Record<number, BattlePaths> = {}, spikePaths: Record<string, BattlePaths> = {};
  const wear = (kind: string, path?: PathId): BattlePaths | undefined => {
    const topic = pathTopicOf(kind), rank = path ? save.pathResearch[path]?.rank ?? 0 : 0;
    return topic && path && rank && pathFits(kind, path) ? { [topic]: { path, rank } } : undefined;
  };
  for (const s of save.defend.layout.structures) {
    const paths = wear(s.kind, s.path);
    if (paths) structurePaths[s.uid] = paths;
  }
  for (const g of save.defend.layout.spikes) {
    const paths = wear("wallSpikes", g.path);
    if (paths) spikePaths[spikeKey(g)] = paths;
  }
  return { ...(Object.keys(structurePaths).length ? { structurePaths } : {}), ...(Object.keys(spikePaths).length ? { spikePaths } : {}) };
}

/** Read a building's own choices; the global fallback supports old isolated
 * battle fixtures. Live saves always supply per-building choices. */
export const buildingPaths = (sim: { bonuses: Readonly<Bonuses> }, b?: { structureUid?: number }) =>
  b?.structureUid !== undefined ? sim.bonuses.structurePaths?.[b.structureUid] ?? sim.bonuses.paths : sim.bonuses.paths;

// ── Evolutions ──────────────────────────────────────────────────────────
/** Frees one `kind` for an evolution: a copy waiting in the palette if
 * there is one, else the city's newest, preferring one wearing `prefer`. */
function takeOne(d: DefendSave, kind: PlacedKind, prefer?: PathId) {
  if (available(d, kind) > 0) return;
  const placed = d.layout.structures.filter((s) => s.kind === kind)
    .sort((a, b) => Number(b.path === prefer) - Number(a.path === prefer) || b.uid - a.uid)[0];
  if (placed) d.layout = removeStructure(d.layout, placed.uid);
}

/** With `id`'s crown researched, turns one owned base building into its
 * evolution, free. One standing in the city is taken up first (the
 * footprints differ); the new building waits in the palette. */
export function evolveOne(save: Save, id: PathId): boolean {
  const e = pathById(id).evolves, d = save.defend;
  if (!e || !save.pathResearch[id]?.crowned || d.owned[e.from] < 1) return false;
  takeOne(d, e.from, id);
  d.owned[e.from]--;
  d.owned[e.item]++;
  return true;
}

/** Returns one evolved building to its base kind, free; the crown stays researched. */
export function unevolveOne(save: Save, item: PlacedKind): boolean {
  const e = PATHS.find((p) => p.evolves?.item === item)?.evolves, d = save.defend;
  if (!e || d.owned[item] < 1) return false;
  takeOne(d, item);
  d.owned[item]--;
  d.owned[e.from]++;
  return true;
}

// ── Older saves ─────────────────────────────────────────────────────────
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
export function migrateTopicPaths(choices: PathChoices, save: Save) {
  const next = cloneLayout(save.defend.layout);
  for (const placed of [...next.structures.map((s) => [s.kind, s] as const), ...next.spikes.map((g) => ["wallSpikes", g] as const)]) {
    const [kind, p] = placed, topic = pathTopicOf(kind), choice = topic ? choices[topic] : undefined;
    if (choice && !p.path && save.pathResearch[choice.path]?.rank) p.path = choice.path;
  }
  save.defend.layout = next;
}
