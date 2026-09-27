import type { Save } from "./entities.ts";
import { GOLD_SHOP, UPGRADES, levelBonus, levelForXp, type GoldItemId, type UpgradeId } from "./config.ts";
import { getEquippedBonuses } from "./crafting.ts";

/** What one rank of an upgrade, or one provision, adds to a character. */
export type Grants = Partial<Record<Stat, number>>;
export type Stat = "attack" | "defense" | "maxHp" | "yellow" | "blue" | "red" | "undos";

/** The character a run starts with. */
export type Loadout = {
  attack: number;
  defense: number;
  maxHp: number;
  keys: { yellow: number; blue: number; red: number };
  undoCapacity: number;
};

/** Every character's baseline: 10 ATK and 4 DEF plus the starter weapon
 * (+2) and armor (+1), which Heirloom steel improves; one undo. */
const BASE = { attack: 12, defense: 5, maxHp: 120, undos: 1 };

const WORDS: Record<Stat, string> = {
  attack: "starting attack",
  defense: "starting defense",
  maxHp: "starting maximum HP",
  yellow: "starting amber key",
  blue: "starting azure key",
  red: "starting crimson key",
  undos: "additional undo",
};

type Granting = { grants?: Grants };

/** The most undos a character can store, with every upgrade that adds one
 * at its highest level. */
const UNDO_CAP = UPGRADES.reduce(
  (cap, u: Granting & { max: number }) => cap + (u.grants?.undos ?? 0) * u.max,
  BASE.undos,
);
const grantsOf = (row: Granting): Grants => row.grants ?? {};

/** Adds `ranks` of each row's grants to `total`. */
function add(total: Record<Stat, number>, rows: readonly (Granting & { id: string })[], ranks: Record<string, number>) {
  for (const row of rows)
    for (const [stat, n] of Object.entries(grantsOf(row)) as [Stat, number][])
      total[stat] += n * (ranks[row.id] ?? 0);
}

/** The character a run would start with now: the baseline, permanent
 * upgrades and the level bonus, then equipped gear (flat bonuses, then
 * percentages of the total, rounded), then the provisions bought for the
 * next run. */
export function loadout(save: Save): Loadout {
  const level = levelBonus(levelForXp(save.xp));
  const own = { attack: BASE.attack + level.attack, defense: BASE.defense + level.defense, maxHp: BASE.maxHp + level.hp, yellow: 0, blue: 0, red: 0, undos: BASE.undos };
  add(own, UPGRADES, save.upgrades);
  const prov = { attack: 0, defense: 0, maxHp: 0, yellow: 0, blue: 0, red: 0, undos: 0 };
  add(prov, GOLD_SHOP, save.provisions);
  const equip = getEquippedBonuses(save);
  return {
    attack: Math.round((own.attack + equip.flatAttack) * (1 + equip.percentAttack)) + prov.attack,
    defense: Math.round((own.defense + equip.flatDefense) * (1 + equip.percentDefense)) + prov.defense,
    maxHp: Math.round((own.maxHp + equip.flatMaxHp) * (1 + equip.percentMaxHp)) + prov.maxHp,
    keys: { yellow: own.yellow, blue: own.blue, red: own.red },
    undoCapacity: own.undos,
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
