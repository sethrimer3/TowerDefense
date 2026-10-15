/** The keep's own upgrade tree. Unlike every other building, whose paths
 * are a choice of one, the keep climbs each of its branches on its own:
 * Bastions (its HP), Arrow loops (it shoots) and Boiling oil (it scalds
 * what reaches its walls). Each rank is paid with Knowledge, and a respec
 * gives it all back for `RESPEC_PRICE`. The ranks are saved on the Defend
 * save (`DefendSave.keepRanks`, absent while it has none: there is only
 * ever one keep, and it never leaves the city) and snapshotted into
 * `Bonuses.keep` when a battle starts. */
import { studyPathCost } from "./economy.ts";
import type { PathHue, PathRank } from "./knowledge-paths.ts";
import { RESPEC_PRICE } from "./specializations.ts";
import { spendMetals } from "./metals.ts";
import type { Save } from "./save.ts";

export type KeepPathId = "bastions" | "arrowLoops" | "boilingOil";
/** How far the keep has climbed each branch (absent: not at all). */
export type KeepRanks = Partial<Record<KeepPathId, number>>;
export type KeepPath = { id: KeepPathId; name: string; motto: string; hue: PathHue; ranks: PathRank[] };

// ── What each rank does in battle ─────────────────────────────────────────
/** Bastions: the keep's HP times `hp[rank]`. */
export const BASTIONS = { hp: [1, 1.3, 1.7, 2.4] };
/** Arrow loops: the keep shoots the nearest enemy within `range[rank]`
 * cells every `reload[rank]` seconds, with an archer tower's arrow times
 * `damage[rank]`; at III it looses `volley` arrows at once, each at another
 * of the nearest. */
export const ARROW_LOOPS = { range: [0, 5, 6.5, 6.5], reload: [0, 1.6, 1.1, 1.1], damage: [0, 1, 1.3, 1.3], volley: 3 };
/** Boiling oil: every `every[rank]` seconds every enemy on foot within
 * `reach[rank]` cells of the keep's walls is scalded for `damage[rank]`;
 * from II it keeps burning `burn[rank]` seconds at `dps[rank]` a second. */
export const BOILING_OIL = { reach: [0, 1.5, 2, 2.5], every: [0, 3, 2.5, 2], damage: [0, 25, 40, 60], burn: [0, 0, 3, 4], dps: [0, 0, 10, 20] };

export const KEEP_PATHS: KeepPath[] = [
  {
    id: "bastions", name: "Bastions", motto: "Thicker walls, a keep that holds", hue: "steel",
    ranks: [
      { name: "Buttresses", icon: "mail", cost: studyPathCost(4, 0), text: "The keep has 30% more HP" },
      { name: "Curtain wall", icon: "helm", cost: studyPathCost(4, 1), text: "70% more HP in all" },
      { name: "Citadel", icon: "oath", cost: studyPathCost(4, 2), text: "140% more HP in all" },
    ],
  },
  {
    id: "arrowLoops", name: "Arrow loops", motto: "Archers behind the keep's walls", hue: "verdant",
    ranks: [
      { name: "Arrow slits", icon: "arrow", cost: studyPathCost(4, 0), text: "The keep shoots an arrow at the nearest enemy within 5 cells" },
      { name: "Longbows", icon: "bow", cost: studyPathCost(4, 1), text: "It shoots faster, 30% harder and 6.5 cells far" },
      { name: "Loosing volleys", icon: "volley", cost: studyPathCost(4, 2), text: "It looses 3 arrows at once, at the 3 nearest enemies" },
    ],
  },
  {
    id: "boilingOil", name: "Boiling oil", motto: "Scald whatever reaches the walls", hue: "ember",
    ranks: [
      { name: "Oil cauldrons", icon: "flame", cost: studyPathCost(4, 0), text: "Every 3 seconds, enemies on foot within 1.5 cells of the keep are scalded for 25" },
      { name: "Burning pitch", icon: "embers", cost: studyPathCost(4, 1), text: "Every 2.5 seconds, 2 cells out, for 40, and they burn for 3 seconds" },
      { name: "Murder holes", icon: "fireball", cost: studyPathCost(4, 2), text: "Every 2 seconds, 2.5 cells out, for 60, and they burn twice as hot" },
    ],
  },
];

export const keepPathById = (id: KeepPathId) => KEEP_PATHS.find((p) => p.id === id)!;
export const keepRank = (ranks: KeepRanks | undefined, id: KeepPathId) => ranks?.[id] ?? 0;

/** The Knowledge allocated to the keep: every rank bought, at today's prices
 * (what a respec gives back). */
export function keepAllocated(ranks: KeepRanks | undefined): number {
  let total = 0;
  for (const p of KEEP_PATHS) for (let r = 0; r < keepRank(ranks, p.id); r++) total += p.ranks[r].cost;
  return total;
}

/** The next rank of branch `id` and its price, if there is one. */
export function nextKeepRank(ranks: KeepRanks | undefined, id: KeepPathId): { rank: number; cost: number } | undefined {
  const have = keepRank(ranks, id), r = keepPathById(id).ranks[have];
  return r ? { rank: have + 1, cost: r.cost } : undefined;
}

export type KeepResult = { ok: true } | { ok: false; reason: string };

/** Buys the next rank of branch `id` for Knowledge (free with Unlimited money). */
export function upgradeKeep(save: Save, id: KeepPathId): KeepResult {
  const next = nextKeepRank(save.defend.keepRanks, id);
  if (!next) return { ok: false, reason: "That branch is already at its top rank." };
  const free = save.settings.devMode;
  if (!free && save.knowledge < next.cost) return { ok: false, reason: `Needs ${next.cost} Knowledge.` };
  if (!free) save.knowledge -= next.cost;
  save.defend.keepRanks = { ...save.defend.keepRanks, [id]: next.rank };
  return { ok: true };
}

/** Respecs the keep: pays `RESPEC_PRICE` in metal (free with Unlimited
 * money) and gives back every Knowledge point in it. */
export function respecKeep(save: Save): KeepResult {
  const spent = keepAllocated(save.defend.keepRanks);
  if (!save.defend.keepRanks) return { ok: false, reason: "Nothing to respec: it has no upgrades." };
  if (!spendMetals(save.smithy, RESPEC_PRICE, save.settings.devMode)) return { ok: false, reason: `A respec costs ${RESPEC_PRICE.copper} Copper.` };
  save.knowledge += spent;
  delete save.defend.keepRanks;
  return { ok: true };
}

/** Keeps only the keep's own branches at ranks they have; undefined when none. */
export function decodeKeepRanks(raw: unknown): KeepRanks | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: KeepRanks = {};
  for (const p of KEEP_PATHS) {
    const r = (raw as Record<string, unknown>)[p.id];
    if (Number.isInteger(r) && (r as number) >= 1 && (r as number) <= p.ranks.length) out[p.id] = r as number;
  }
  return Object.keys(out).length ? out : undefined;
}
