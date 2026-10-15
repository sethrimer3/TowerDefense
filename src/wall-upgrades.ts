/** The walls' upgrade tree: one tree for every wall section the player
 * places (`Layout.walls`), its branches climbed side by side like the
 * keep's (`keep-upgrades.ts`): Stonework (their HP, then mending), Thornwork
 * (they cut whoever presses against them) and Town walls (they may stand
 * inside the city, then let your own people through). Each rank is paid
 * with Knowledge and a respec gives it all back for `RESPEC_PRICE`. The
 * ranks are saved on the Defend save (`DefendSave.wallRanks`, absent while
 * it has none) and snapshotted into `Bonuses.walls` when a battle starts. */
import { studyPathCost } from "./economy.ts";
import type { PathHue, PathRank } from "./knowledge-paths.ts";
import { RESPEC_PRICE } from "./specializations.ts";
import { spendMetals } from "./metals.ts";
import type { Save } from "./save.ts";
import { cloneLayout, dropInnerWalls, type Layout } from "./defend/layout.ts";

export type WallPathId = "stonework" | "thornwork" | "townWalls";
/** How far the walls have climbed each branch (absent: not at all). */
export type WallRanks = Partial<Record<WallPathId, number>>;
export type WallPath = { id: WallPathId; name: string; motto: string; hue: PathHue; ranks: PathRank[] };

// ── What each rank does in battle ─────────────────────────────────────────
/** Stonework: each placed wall stone's HP times `hp[rank]`; at III a
 * standing stone mends `mend` of its HP a second. */
export const STONEWORK = { hp: [1, 1.5, 2.2, 2.2], mend: 0.02 };
/** Thornwork: every `every[rank]` seconds each enemy on foot touching a
 * standing placed wall stone takes `damage[rank]`; at III it is chilled
 * for `chill` seconds too. */
export const THORNWORK = { every: [0, 1.5, 1, 1], damage: [0, 12, 25, 25], chill: 1.5 };
/** Town walls: from I wall sections may be placed inside the city; from II
 * your own troops and townsfolk pass through them (`posterns`). */
export const TOWN_WALLS = { inside: 1, posterns: 2 };

export const WALL_PATHS: WallPath[] = [
  {
    id: "stonework", name: "Stonework", motto: "Heavier stones, better laid", hue: "steel",
    ranks: [
      { name: "Dressed stone", icon: "hammer", cost: studyPathCost(2, 0), text: "Placed walls have 50% more HP" },
      { name: "Ashlar courses", icon: "mail", cost: studyPathCost(2, 1), text: "120% more HP in all" },
      { name: "Living rock", icon: "heart", cost: studyPathCost(2, 2), text: "Damaged stones mend 2% of their HP a second" },
    ],
  },
  {
    id: "thornwork", name: "Thornwork", motto: "Barbs in every joint", hue: "ember",
    ranks: [
      { name: "Briar stakes", icon: "stake", cost: studyPathCost(2, 0), text: "Every 1.5 seconds, enemies on foot touching a placed wall take 12 damage" },
      { name: "Iron thorns", icon: "shards", cost: studyPathCost(2, 1), text: "Every second, for 25" },
      { name: "Barbed coils", icon: "snowflake", cost: studyPathCost(2, 2), text: "The barbs catch: whoever they cut is slowed for 1.5 seconds" },
    ],
  },
  {
    id: "townWalls", name: "Town walls", motto: "Walls for the streets as well", hue: "verdant",
    ranks: [
      { name: "Inner walls", icon: "crate", cost: studyPathCost(2, 0), text: "Wall sections may be placed inside the city too" },
      { name: "Posterns", icon: "boot", cost: studyPathCost(2, 1), text: "Your troops and townsfolk slip through placed walls; enemies still can't" },
    ],
  },
];

export const wallPathById = (id: WallPathId) => WALL_PATHS.find((p) => p.id === id)!;
export const wallRank = (ranks: WallRanks | undefined, id: WallPathId) => ranks?.[id] ?? 0;
/** Whether wall sections may stand inside the city. */
export const innerWalls = (ranks: WallRanks | undefined) => wallRank(ranks, "townWalls") >= TOWN_WALLS.inside;

/** The Knowledge allocated to the walls: every rank bought, at today's
 * prices (what a respec gives back). */
export function wallAllocated(ranks: WallRanks | undefined): number {
  let total = 0;
  for (const p of WALL_PATHS) for (let r = 0; r < wallRank(ranks, p.id); r++) total += p.ranks[r].cost;
  return total;
}

/** The next rank of branch `id` and its price, if there is one. */
export function nextWallRank(ranks: WallRanks | undefined, id: WallPathId): { rank: number; cost: number } | undefined {
  const have = wallRank(ranks, id), r = wallPathById(id).ranks[have];
  return r ? { rank: have + 1, cost: r.cost } : undefined;
}

export type WallResult = { ok: true } | { ok: false; reason: string };

/** Buys the next rank of branch `id` for Knowledge (free with Unlimited money). */
export function upgradeWalls(save: Save, id: WallPathId): WallResult {
  const next = nextWallRank(save.defend.wallRanks, id);
  if (!next) return { ok: false, reason: "That branch is already at its top rank." };
  const free = save.settings.devMode;
  if (!free && save.knowledge < next.cost) return { ok: false, reason: `Needs ${next.cost} Knowledge.` };
  if (!free) save.knowledge -= next.cost;
  save.defend.wallRanks = { ...save.defend.wallRanks, [id]: next.rank };
  save.defend.layout = withInnerWalls(save.defend.layout, save.defend.wallRanks);
  return { ok: true };
}

/** Respecs the walls: pays `RESPEC_PRICE` in metal (free with Unlimited
 * money) and gives back every Knowledge point in them. Sections standing
 * inside the city go back to the palette. */
export function respecWalls(save: Save): WallResult {
  const spent = wallAllocated(save.defend.wallRanks);
  if (!save.defend.wallRanks) return { ok: false, reason: "Nothing to respec: the walls have no upgrades." };
  if (!spendMetals(save.smithy, RESPEC_PRICE, save.settings.devMode)) return { ok: false, reason: `A respec costs ${RESPEC_PRICE.copper} Copper.` };
  save.knowledge += spent;
  delete save.defend.wallRanks;
  save.defend.layout = withInnerWalls(save.defend.layout, undefined);
  return { ok: true };
}

/** `layout` allowing wall sections inside the city as `ranks` say; without
 * that, the sections standing there are taken up (back to the palette). */
export function withInnerWalls(layout: Layout, ranks: WallRanks | undefined): Layout {
  const inner = innerWalls(ranks);
  if (!!layout.innerWalls === inner) return layout;
  const next = cloneLayout(layout);
  if (inner) next.innerWalls = true;
  else {
    delete next.innerWalls;
    dropInnerWalls(next);
  }
  return next;
}

/** Keeps only the walls' own branches at ranks they have; undefined when none. */
export function decodeWallRanks(raw: unknown): WallRanks | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: WallRanks = {};
  for (const p of WALL_PATHS) {
    const r = (raw as Record<string, unknown>)[p.id];
    if (Number.isInteger(r) && (r as number) >= 1 && (r as number) <= p.ranks.length) out[p.id] = r as number;
  }
  return Object.keys(out).length ? out : undefined;
}
