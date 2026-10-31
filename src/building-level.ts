/** A building's level: 1, plus one for every Smithy upgrade (Forge level or
 * Training rank) that applies to it. A rough read of how far a city has
 * invested in a building, for players looking over a castle in Siege; it
 * says nothing exact about damage, since Smithy upgrades are all sorts of
 * things (range, health, reload, room for troops). Pure. */
import { ITEM_CATEGORY, type PaletteItem, type StructureKind, type UpgradeId } from "./defend/catalog.ts";
import type { TrainingId } from "./progression.ts";
import { SUBJECTS, topicItems, type Topic } from "./upgrade-subjects.ts";

/** What can carry a level: a placed structure, the keep, or one of the
 * city's own pieces a castle is built from. */
export type LeveledKind = StructureKind | "wall" | "gate" | "wallBallista" | "spikes";
export type SmithyRows = { upgrades: UpgradeId[]; training: TrainingId[] };

const topics = SUBJECTS.flatMap((s) => s.topics);
const topic = (id: string) => topics.find((t) => t.id === id)!;
const ownTopic = (item: PaletteItem) => topics.find((t) => topicItems(t).includes(item) && t.id !== "troops");
/** The topics whose Smithy rows apply to a kind: its own, and the shared
 * All troops or All towers topic it fights under. */
function topicsOf(kind: LeveledKind): { topic: Topic; only?: (id: string) => boolean }[] {
  if (kind === "keep") return [{ topic: topic("walls"), only: (id) => id.startsWith("keep") }];
  if (kind === "wall") return [{ topic: topic("walls"), only: (id) => id.startsWith("wall") }];
  if (kind === "gate") return [{ topic: topic("cityGate") }];
  if (kind === "spikes") return [{ topic: topic("spikes") }];
  if (kind === "wallBallista") return [{ topic: topic("wallBallista") }, { topic: topic("towers") }];
  const own = ownTopic(kind),
    shared = ITEM_CATEGORY[kind] === "units" ? topic("troops") : ITEM_CATEGORY[kind] === "towers" ? topic("towers") : undefined;
  return [...(own ? [{ topic: own }] : []), ...(shared ? [{ topic: shared }] : []), ...(ITEM_CATEGORY[kind] === "units" ? [{ topic: topic("repairShop"), only: (id: string) => id === "buildingHp" }] : [])];
}
/** The Smithy rows a kind's level counts. */
export function smithyRows(kind: LeveledKind): SmithyRows {
  const upgrades = new Set<UpgradeId>(),
    training = new Set<TrainingId>();
  for (const { topic: t, only } of topicsOf(kind)) {
    for (const id of t.upgrades ?? []) if (!only || only(id)) upgrades.add(id);
    for (const id of t.training ?? []) if (!only || only(id)) training.add(id);
  }
  return { upgrades: [...upgrades], training: [...training] };
}
/** 1 plus every Smithy upgrade the city has bought that applies to `kind`. */
export function buildingLevel(kind: LeveledKind, levels: Partial<Record<UpgradeId, number>>, training: Partial<Record<TrainingId, number>>) {
  const rows = smithyRows(kind);
  let level = 1;
  for (const id of rows.upgrades) level += Math.max(0, Math.floor(levels[id] ?? 0));
  for (const id of rows.training) level += Math.max(0, Math.floor(training[id] ?? 0));
  return level;
}
