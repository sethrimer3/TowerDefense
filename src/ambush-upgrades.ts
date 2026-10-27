/** Ambush's permanent tree spends only best-level stars. No Defend currency or ranks. */
import { decodeSideRanks, sideAllocated, type SidePath, type SideRanks } from "./side-ranks.ts";
import { totalStars, type AmbushProgress } from "./campaign/levels.ts";
import type { PathIcon, PathHue } from "./knowledge-paths.ts";
export type AmbushPathId = "warChest" | "bounty" | "masons" | "quartermaster" | "drillmasters" | "palisades" | "keepWalls" | "battleMagic" | "headStart";
export type AmbushRanks = SideRanks<AmbushPathId>;
function branch(id: AmbushPathId, name: string, icon: PathIcon, hue: PathHue, text: (rank: number) => string): SidePath<AmbushPathId> {
  const costs = id === "headStart" ? [3, 7] : [2, 3, 5];
  return { id, name, motto: text(1), hue, ranks: costs.map((cost, i) => ({ name: name + " " + ["I", "II", "III"][i], icon, cost, text: text(i + 1) })) };
}
export const AMBUSH_PATHS: SidePath<AmbushPathId>[] = [
  branch("warChest", "War chest", "oath", "verdant", (r) => "Start each level with " + r * 50 + " more gold."),
  branch("bounty", "Bounty", "arrow", "verdant", (r) => "Earn " + r * 5 + "% more gold per kill."),
  branch("masons", "Masons", "mail", "steel", (r) => "Base buildings cost " + r * 5 + "% less, rounded to tens."),
  branch("quartermaster", "Quartermaster", "helm", "steel", (r) => "After wave 1, selling refunds " + (70 + r * 5) + "% of all investment."),
  branch("drillmasters", "Drillmasters", "dagger", "ember", (r) => "Troops and towers deal " + r * 5 + "% more damage; troops have " + r * 5 + "% more HP."),
  branch("palisades", "Palisades", "mail", "verdant", (r) => "Outpost houses and fences have " + r * 15 + "% more HP."),
  branch("keepWalls", "Keep walls", "helm", "steel", (r) => "Keep and castle walls have " + r * 20 + "% more HP."),
  branch("battleMagic", "Battle magic", "bolt", "storm", (r) => "Strike spells recharge " + r * 10 + "% sooner."),
  branch("headStart", "Head start", "bow", "verdant", (r) => r + " free Archer Tower" + (r === 1 ? "" : "s") + " beside the track at level start."),
];
export const ambushAllocated = (ranks: AmbushRanks | undefined) => sideAllocated(AMBUSH_PATHS, ranks);
export const ambushPool = (progress: AmbushProgress) => Math.max(0, totalStars(progress) - ambushAllocated(progress.ranks));
export function decodeAmbushRanks(raw: unknown, stars: number): AmbushRanks | undefined {
  const ranks = decodeSideRanks(AMBUSH_PATHS, raw);
  if (!ranks) return undefined;
  // Malformed/imported overspending cannot create permanent power.
  for (const p of [...AMBUSH_PATHS].reverse())
    while ((ranks[p.id] ?? 0) > 0 && ambushAllocated(ranks) > stars) {
      const n = (ranks[p.id] ?? 0) - 1;
      if (n) ranks[p.id] = n;
      else delete ranks[p.id];
    }
  return Object.keys(ranks).length ? ranks : undefined;
}
export function buyAmbush(progress: AmbushProgress, id: AmbushPathId) {
  const p = AMBUSH_PATHS.find((p) => p.id === id),
    rank = progress.ranks?.[id] ?? 0,
    next = p?.ranks[rank];
  if (!next || next.cost > ambushPool(progress)) return false;
  (progress.ranks ??= {})[id] = rank + 1;
  return true;
}
export function undoAmbush(progress: AmbushProgress, id: AmbushPathId, rank: number) {
  const have = progress.ranks?.[id] ?? 0;
  if (!Number.isInteger(rank) || rank < 1 || rank > have) return false;
  if (rank === 1) delete progress.ranks![id];
  else progress.ranks![id] = rank - 1;
  if (!Object.keys(progress.ranks!).length) delete progress.ranks;
  return true;
}
export function respecAmbush(progress: AmbushProgress) {
  delete progress.ranks;
}
export function ambushBonuses(ranks?: AmbushRanks) {
  const r = (id: AmbushPathId) => ranks?.[id] ?? 0;
  return {
    gold: 50 * r("warChest"),
    bounty: 1 + 0.05 * r("bounty"),
    price: 1 - 0.05 * r("masons"),
    refund: 0.7 + 0.05 * r("quartermaster"),
    damage: 1 + 0.05 * r("drillmasters"),
    troopHp: 1 + 0.05 * r("drillmasters"),
    palisade: 1 + 0.15 * r("palisades"),
    keep: 1 + 0.2 * r("keepWalls"),
    cooldown: 1 - 0.1 * r("battleMagic"),
    free: r("headStart"),
  };
}
