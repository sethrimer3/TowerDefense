/** The bookkeeping shared by the trees climbed side by side: the keep's,
 * the walls', the city gate's and the wall ballistas' (`keep-upgrades.ts`,
 * `wall-upgrades.ts`, `gate-upgrades.ts`, `ballista-upgrades.ts`): each
 * rank paid with Knowledge, undone or respecced for free, and saved on the
 * Defend save under `key` (absent while it has none). */
import type { PathHue, PathRank } from "./knowledge-paths.ts";
import type { Save } from "./save.ts";

export type SidePath<Id extends string> = { id: Id; name: string; motto: string; hue: PathHue; ranks: PathRank[] };
export type SideRanks<Id extends string> = Partial<Record<Id, number>>;
export type SideResult = { ok: true } | { ok: false; reason: string };
/** Where on the Defend save a tree keeps its ranks. */
export type SideKey = "keepRanks" | "wallRanks" | "gateRanks" | "ballistaRanks";

export const sideRank = <Id extends string>(ranks: SideRanks<Id> | undefined, id: Id) => ranks?.[id] ?? 0;

/** The Knowledge allocated to a tree: every rank bought, at today's prices. */
export function sideAllocated<Id extends string>(paths: SidePath<Id>[], ranks: SideRanks<Id> | undefined): number {
  let total = 0;
  for (const p of paths) for (let r = 0; r < sideRank(ranks, p.id); r++) total += p.ranks[r].cost;
  return total;
}

const ranksOf = (save: Save, key: SideKey) => save.defend[key] as SideRanks<string> | undefined;

/** Buys the next rank of branch `id` for Knowledge (free with Unlimited money). */
export function buySide<Id extends string>(save: Save, key: SideKey, paths: SidePath<Id>[], id: Id): SideResult {
  const p = paths.find((o) => o.id === id), have = sideRank(ranksOf(save, key), id), step = p?.ranks[have];
  if (!step) return { ok: false, reason: "That branch is already at its top rank." };
  const free = save.settings.devMode;
  if (!free && save.knowledge < step.cost) return { ok: false, reason: `Needs ${step.cost} Knowledge.` };
  if (!free) save.knowledge -= step.cost;
  (save.defend as Record<SideKey, unknown>)[key] = { ...ranksOf(save, key), [id]: have + 1 };
  return { ok: true };
}

/** Undoes rank `rank` of branch `id` and the ranks above it, free, giving
 * back their Knowledge: the branch steps back to rank `rank - 1`. */
export function undoSide<Id extends string>(save: Save, key: SideKey, paths: SidePath<Id>[], id: Id, rank: number): SideResult {
  const have = sideRank(ranksOf(save, key), id), p = paths.find((o) => o.id === id);
  if (!p || rank < 1 || rank > have) return { ok: false, reason: "Nothing to undo there." };
  for (let r = rank; r <= have; r++) save.knowledge += p.ranks[r - 1].cost;
  const next = { ...ranksOf(save, key) };
  if (rank > 1) next[id] = rank - 1;
  else delete next[id];
  if (Object.keys(next).length) (save.defend as Record<SideKey, unknown>)[key] = next;
  else delete save.defend[key];
  return { ok: true };
}

/** Respecs a tree, free: every Knowledge point in it comes back. `none`
 * says there is nothing to respec ("the gates have no upgrades"). */
export function respecSide<Id extends string>(save: Save, key: SideKey, paths: SidePath<Id>[], none: string): SideResult {
  const ranks = ranksOf(save, key) as SideRanks<Id> | undefined;
  if (!ranks) return { ok: false, reason: `Nothing to respec: ${none}.` };
  save.knowledge += sideAllocated(paths, ranks);
  delete save.defend[key];
  return { ok: true };
}

/** Keeps only a tree's own branches at ranks they have; undefined when none. */
export function decodeSideRanks<Id extends string>(paths: SidePath<Id>[], raw: unknown): SideRanks<Id> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: SideRanks<Id> = {};
  for (const p of paths) {
    const r = (raw as Record<string, unknown>)[p.id];
    if (Number.isInteger(r) && (r as number) >= 1 && (r as number) <= p.ranks.length) out[p.id] = r as number;
  }
  return Object.keys(out).length ? out : undefined;
}
