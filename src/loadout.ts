import type { Save } from "./entities.ts";
import { GOLD_SHOP, POTION_PERCENT_BASE, POTION_PERCENT_RANK, TRAINING, TRAINING_PER_LEVEL, UPGRADES, isStatRow, levelForXp, trained, trainingWorth, type GoldItemId, type TrainingId, type UpgradeId } from "./config.ts";
import { getEquippedBonuses } from "./crafting.ts";
import { RESEARCH, researched } from "./archives.ts";

/** What one rank of an upgrade, or one provision, adds to a character. */
export type Grants = Partial<Record<Stat, number>>;
export type Stat = "attack" | "defense" | "maxHp" | "shroud" | "yellow" | "blue" | "red" | "undos";

/** The character a run starts with. */
export type Loadout = {
  attack: number;
  defense: number;
  maxHp: number;
  /** The damage the shroud blocks at the start of every fight. */
  shroud: number;
  keys: { yellow: number; blue: number; red: number };
  undoCapacity: number;
};

/** Every character's baseline: 10 ATK plus the starter weapon (+2), which
 * Heirloom steel improves; no DEF; 100 HP; no shroud (Shroud gives the
 * first point); no undo (Rehearsed steps gives the first). */
const BASE = { attack: 12, defense: 0, maxHp: 100, shroud: 0, undos: 0 };

const WORDS: Record<Stat, string> = {
  attack: "starting attack",
  defense: "starting defense",
  maxHp: "starting maximum HP",
  shroud: "damage blocked each fight",
  yellow: "starting amber key",
  blue: "starting azure key",
  red: "starting crimson key",
  undos: "additional undo",
};

type Granting = { grants?: Grants };

/** The most undos a character can store, with every upgrade that adds one
 * at its highest level and every level of Undo Count. */
const UNDO_CAP = UPGRADES.reduce(
  (cap, u: Granting & { max: number }) => cap + (u.grants?.undos ?? 0) * u.max,
  BASE.undos + RESEARCH.undoCount.levels.length,
);
/** The last `capacity` snapshots of an undo history (none at 0, where
 * `slice(-0)` would keep them all). */
export const keepUndos = <T>(history: T[], capacity: number) => (capacity > 0 ? history.slice(-capacity) : []);
const grantsOf = (row: Granting): Grants => row.grants ?? {};

/** Adds `ranks` of each row's grants to `total`. */
function add(total: Record<Stat, number>, rows: readonly (Granting & { id: string })[], ranks: Record<string, number>) {
  for (const row of rows)
    for (const [stat, n] of Object.entries(grantsOf(row)) as [Stat, number][])
      total[stat] += n * (ranks[row.id] ?? 0);
}

/** The character a run would start with now: the baseline, permanent
 * upgrades and training, then equipped gear (flat bonuses, then
 * percentages of the total, rounded), then the provisions bought for the
 * next run. */
export function loadout(save: Save): Loadout {
  const own = { ...BASE, yellow: 0, blue: 0, red: 0 };
  add(own, UPGRADES, save.upgrades);
  const level = levelForXp(save.xp);
  for (const row of TRAINING) if (isStatRow(row)) own[row.stat] += trained(row, save.training[row.id], level);
  const prov = { attack: 0, defense: 0, maxHp: 0, shroud: 0, yellow: 0, blue: 0, red: 0, undos: 0 };
  add(prov, GOLD_SHOP, save.provisions);
  const equip = getEquippedBonuses(save);
  return {
    attack: Math.round((own.attack + equip.flatAttack) * (1 + equip.percentAttack)) + prov.attack,
    defense: Math.round((own.defense + equip.flatDefense) * (1 + equip.percentDefense)) + prov.defense,
    maxHp: Math.round((own.maxHp + equip.flatMaxHp) * (1 + equip.percentMaxHp)) + prov.maxHp,
    shroud: own.shroud,
    keys: { yellow: own.yellow, blue: own.blue, red: own.red },
    // Undo needs Rehearsed steps: without it nothing else stores one.
    undoCapacity: save.upgrades.inspirationUndos ? researched(save.archives, "undoCapacity", own.undos) : 0,
  };
}

/** Text for a row's grants: "+2 starting attack", joined by "and". A row
 * may name a stat its own way. */
export function describeGrants(grants: Grants, words: Partial<Record<Stat, string>> = {}) {
  return (Object.entries(grants) as [Stat, number][])
    .map(([stat, n]) =>
      stat === "undos"
        ? `Store ${n === 1 ? "one" : n} ${words.undos ?? WORDS.undos}${n === 1 ? "" : "s"} (up to ${UNDO_CAP})`
        : `+${n} ${words[stat] ?? WORDS[stat]}`)
    .join(" and ");
}

/** An upgrade's description, written from its grants when it has any. */
export function upgradeText(id: UpgradeId) {
  const u: { description?: string; grants?: Grants; words?: Partial<Record<Stat, string>> } =
    UPGRADES.find((u) => u.id === id)!;
  return u.description ?? describeGrants(u.grants!, u.words);
}

/** A provision's description, written from its grants. */
export function provisionText(id: GoldItemId) {
  const item = GOLD_SHOP.find((g) => g.id === id)!;
  return describeGrants(item.grants, item.words);
}

/** Training points: earned per level, spent on ranks of training. `left`
 * never goes below zero, even if undo takes back a level already spent. */
export function trainingPoints(save: Pick<Save, "xp" | "training"> & Partial<Pick<Save, "freeTraining">>) {
  const earned = TRAINING_PER_LEVEL * levelForXp(save.xp),
    spent = TRAINING.reduce((sum, t) => sum + t.cost * save.training[t.id], 0) - (save.freeTraining ?? 0);
  return { earned, spent, left: Math.max(0, earned - spent) };
}

/** What a percent potion restores beyond its HP, in hundredths of a
 * percent of max HP: none without Recovery. */
export const potionPercent = (save: Pick<Save, "upgrades" | "training">) =>
  save.upgrades.recovery ? POTION_PERCENT_BASE + POTION_PERCENT_RANK * save.training.potion : 0;

/** What one more rank of `id` costs and does: to the next run's character
 * for a stat, or to what a percent potion restores (in % of max HP). */
export function trainingStep(save: Save, id: TrainingId) {
  const row = TRAINING.find((t) => t.id === id)!, affordable = save.settings.freePurchases || trainingPoints(save).left >= row.cost;
  if (!isStatRow(row)) {
    const ranks = save.training[id];
    const percent = (r: number) => (POTION_PERCENT_BASE + POTION_PERCENT_RANK * r) / 100;
    return { row, unit: "%", now: percent(ranks), next: percent(ranks + 1), worth: POTION_PERCENT_RANK / 100, affordable };
  }
  const stat = row.stat;
  const now = loadout(save)[stat], next = loadout({ ...save, training: { ...save.training, [id]: save.training[id] + 1 } })[stat];
  const worth = trainingWorth(row, levelForXp(save.xp));
  return { row, unit: "", now, next, worth, affordable };
}
