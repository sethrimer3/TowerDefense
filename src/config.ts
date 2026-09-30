import type { EnemyStrength } from "./entities.ts";
import { intPow } from "./exact.ts";
export const UNGUARDED_LOOT_CHANCE = 1 / 1000;
export const WIDTH = 30;
export const CHUNK = 20;
export const START_X = 15;
export const VIEWPORT_TILES = 17;
export const TOWER_WIDTH = 17;
export const TOWER_HEIGHT = 17;
export const TOWER_START_X = 8;
/** Tower floors come in isolated sections of this many rooms. */
export const TOWER_SECTION = 10;
export const SAVE_KEY = "towerincramental.v1";
export const COLORS = { yellow: "#eac16b", blue: "#6dbdf1", red: "#df797e" };
export type KeyColor = keyof typeof COLORS;
export type Currency = "courage" | "inspiration";
/** Upgrades that make the character stronger say so in `grants` (what one
 * rank adds; see loadout.ts), which also writes their description. */
/** Focus uses a run starts with, once the Focus skill is owned. */
export const FOCUS_PER_RUN = 1;
export const UPGRADES = [
  { id: "delve", name: "Into the depths", description: "Unlock Delve and the Courage skill tree", base: 3, max: 1, currency: "inspiration" },
  { id: "legacy", name: "An enduring legacy", description: "Unlock the Legacy skill tree and unlock Defend", base: 8, max: 1, currency: "courage" },
  {
    id: "revive",
    name: "Revive",
    description: "Undo a fatal move before moving in the new run",
    base: 12,
    max: 1,
    currency: "courage",
  },
  {
    id: "undos",
    name: "Echoes of time",
    grants: { undos: 1 },
    base: 5,
    max: 4,
    currency: "courage",
  },
  {
    id: "hp",
    name: "Vital ember",
    grants: { maxHp: 20 },
    base: 3,
    max: 50,
    currency: "courage",
  },
  {
    id: "attack",
    name: "Tempered edge",
    grants: { attack: 2 },
    base: 4,
    max: 50,
    currency: "courage",
  },
  {
    id: "defense",
    name: "Stone skin",
    grants: { defense: 1 },
    base: 4,
    max: 50,
    currency: "courage",
  },
  {
    id: "yellow",
    name: "Gilded passage",
    grants: { yellow: 1 },
    base: 3,
    max: 10,
    currency: "courage",
  },
  {
    id: "blue",
    name: "Azure passage",
    grants: { blue: 1 },
    base: 5,
    max: 10,
    currency: "courage",
  },
  {
    id: "red",
    name: "Crimson passage",
    grants: { red: 1 },
    base: 7,
    max: 10,
    currency: "courage",
  },
  {
    id: "quality",
    name: "Heirloom steel",
    grants: { attack: 2, defense: 1 },
    words: { attack: "weapon attack", defense: "armor defense" },
    base: 6,
    max: 20,
    currency: "courage",
  },
  {
    id: "auto",
    name: "Automove",
    description: "Unlock automatic movement in both Tower and Delve",
    base: 3,
    max: 1,
    currency: "courage",
  },
  {
    id: "aiMemory", name: "Route memory", description: "Delve: remember explored routes, then recognize dead ends", base: 3, max: 2, currency: "courage",
  },
  {
    id: "aiEvaluation", name: "Resource judgment", description: "Delve: learn combat cost, key cost, contextual rewards, then scarcity", base: 4, max: 4, currency: "courage",
  },
  {
    id: "aiLookahead", name: "Labyrinth scouting", description: "Delve: +4 scouting radius and +2 interactions of route lookahead", base: 5, max: 4, currency: "courage",
  },
  {
    id: "autoPersist",
    name: "Steadfast wayfinder",
    description: "Choose whether Automove turns off when you fall in battle",
    base: 6,
    max: 1,
    currency: "courage",
  },
  {
    id: "handOrdering",
    name: "Hand Ordering",
    description: "Open the Deck, where you reorder the cards in your hand before a run",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "combatStance",
    name: "Combat Stance",
    description: "Unlock the Deck: add its cards to your hand, or set them aside, to choose what a run heads for",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "cardHeal",
    name: "Heal",
    description: "Add the HEAL card to your deck: it moves you toward the closest healing potion",
    card: "heal",
    base: 3,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "greaterHeal",
    name: "Greater Heal",
    description: "Unlock Potion HP research in the Archives: every potion restores more HP",
    base: 3,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "recovery",
    name: "Recovery",
    description: "Percent potions appear on the floors: each restores 35 HP and a share of your max HP, raised by Potion % training",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "cardGear",
    name: "Gear",
    description: "Add the EQUIPMENT card to your deck: it moves you toward the closest ATK or DEF pickup",
    card: "equipment",
    base: 5,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "focus",
    name: "Focus",
    description: `Inside a run, press a card in your hand to put it ahead of the others until it reaches its target (${FOCUS_PER_RUN} use a run)`,
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "archives",
    name: "Archives",
    description: "Unlock the Archives on the Upgrades page: research that lasts, paid in Gold and real time",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "inspirationUndos",
    name: "Rehearsed steps",
    description: "Rewind an action, and open Undo Count research in the Archives",
    grants: { undos: 1 },
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "wisdomFocus",
    name: "Quiet focus",
    description: "A placeholder Wisdom upgrade",
    base: 5,
    max: 5,
    currency: "inspiration",
  },
  {
    id: "wisdomMemory",
    name: "Long memory",
    description: "A placeholder Wisdom upgrade",
    base: 7,
    max: 5,
    currency: "inspiration",
  },
  {
    id: "wisdomSight",
    name: "Far sight",
    description: "A placeholder Wisdom upgrade",
    base: 9,
    max: 5,
    currency: "inspiration",
  },
  {
    id: "renownBanner",
    name: "Raised banner",
    description: "A placeholder Renown upgrade",
    base: 6,
    max: 5,
    currency: "courage",
  },
  {
    id: "renownOath",
    name: "Hero's oath",
    description: "A placeholder Renown upgrade",
    base: 8,
    max: 5,
    currency: "courage",
  },
  {
    id: "renownCrown",
    name: "Laurel crown",
    description: "A placeholder Renown upgrade",
    base: 10,
    max: 5,
    currency: "courage",
  },
] as const;
export type UpgradeId = (typeof UPGRADES)[number]["id"];
export const cost = (id: UpgradeId, level: number) =>
  Math.ceil(UPGRADES.find((u) => u.id === id)!.base * intPow(1.65, level));
/** Gold a beaten enemy pays, by its strength, in both modes. */
export const ENEMY_GOLD: Record<EnemyStrength, number> = { weak: 0, normal: 1, strong: 2, elite: 4, boss: 5 };
/** Silver, the currency spent inside a run, that a beaten enemy pays per
 * base amount, by its strength. */
export const SILVER_MULTIPLIER: Record<EnemyStrength, number> = { weak: 1, normal: 2, strong: 3, elite: 4, boss: 5 };
/** Silver a beaten enemy pays on equivalent floor `floor` (0 is the first):
 * a weak enemy's 1, plus 1 every ten floors (2 from floor 11), times its
 * strength's multiplier. */
export const silverForKill = (strength: EnemyStrength, floor: number) =>
  (1 + Math.floor(Math.max(0, floor) / TOWER_SECTION)) * SILVER_MULTIPLIER[strength];
/** Gold the Delve pays at a run's end: one for each treasure opened. */
export const goldReward = (treasures: number) => treasures;
/** XP a beaten enemy pays per base amount, by its strength (the same
 * proportions as the forks' `GATE_VALUE`). */
export const XP_MULTIPLIER: Record<EnemyStrength, number> = { weak: 2, normal: 3, strong: 5, elite: 8, boss: 12 };
/** The base XP a kill pays on equivalent floor `floor` (0 is the first): 3,
 * rising with the square root of the floor (×2 by floor 30, ×3.3 by 100,
 * ×10 by 1000). The XP a level needs rises faster, so each floor is worth a
 * smaller share of a level than the one before. */
export const xpBase = (floor: number) => 3 * Math.sqrt(1 + Math.max(0, floor) / TOWER_SECTION);
/** XP a beaten enemy pays on equivalent floor `floor`, in both modes. */
export const xpForKill = (strength: EnemyStrength, floor: number) =>
  Math.round(xpBase(floor) * XP_MULTIPLIER[strength]);
/** The lifetime XP that reaches `level`: 20 × level × (level + 1) ×
 * (1 + level / 5), written in whole numbers. It grows with the cube of the
 * level, faster than kills pay more on higher floors, so levels come more
 * slowly the higher the hero climbs, even replaying the floors below. */
export const xpForLevel = (level: number) => 4 * level * (level + 1) * (level + 5);
/** The level `xp` lifetime XP reaches, found among the exact whole-number
 * costs (a cube root could differ between engines). */
export function levelForXp(xp: number) {
  let low = 0, high = 1;
  while (xpForLevel(high) <= xp) high *= 2;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (xpForLevel(mid) <= xp) low = mid;
    else high = mid;
  }
  return low;
}
/** Training points each level earns, to spend on the hero's stats. */
export const TRAINING_PER_LEVEL = 3;
/** The groups the Training tab shows its rows in, in order. */
export const TRAINING_GROUPS = { offense: "Offense", defense: "Defense" } as const;
/** What training raises, each rank costing `cost` points. A stat row is
 * worth `base` × (1 + level / `growth`) of `stat` at the hero's level (see
 * `trainingWorth`), so every rank already bought grows as the hero levels
 * up and saving points up never pays. Potion % adds `POTION_PERCENT_RANK`
 * to what a percent potion restores, the same at every level. A row with
 * `requires` shows, and trains, only once that upgrade is owned. */
export const TRAINING = [
  { id: "hp", name: "Max HP", group: "defense", stat: "maxHp", base: 10, growth: 10, cost: 1 },
  { id: "attack", name: "ATK", group: "offense", stat: "attack", base: 1, growth: 5, cost: 5 },
  { id: "defense", name: "DEF", group: "defense", stat: "defense", base: 1, growth: 12, cost: 3 },
  { id: "potion", name: "Potion %", group: "defense", requires: "recovery", cost: 1 },
] as const;
export type TrainingId = (typeof TRAINING)[number]["id"];
export type TrainingRow = (typeof TRAINING)[number];
/** A row that raises one of the character's stats. */
export type StatTrainingRow = Extract<TrainingRow, { stat: string }>;
export const isStatRow = (row: TrainingRow): row is StatTrainingRow => "stat" in row;
/** Whether `row` can be seen and trained with `upgrades` owned. */
export const trainingOpen = (row: TrainingRow, upgrades: Record<UpgradeId, number>) =>
  !("requires" in row) || upgrades[row.requires] > 0;
/** What a percent potion restores beyond its HP, in hundredths of a percent
 * of max HP: 1% with Recovery, and 0.25% more for each Potion % rank. */
export const POTION_PERCENT_BASE = 100, POTION_PERCENT_RANK = 25;
/** What one rank of `row` is worth at `level`, unrounded. */
export const trainingWorth = (row: StatTrainingRow, level: number) => row.base * (1 + level / row.growth);
/** What `ranks` ranks of `row` add to the character at `level`, rounded
 * once. */
export const trained = (row: StatTrainingRow, ranks: number, level: number) => Math.round(ranks * trainingWorth(row, level));
export const GOLD_SHOP = [
  {
    id: "heal",
    name: "Traveler's elixir",
    grants: { maxHp: 20 },
    words: { maxHp: "max HP next run" },
    cost: 6,
  },
  {
    id: "edge",
    name: "Whetstone",
    grants: { attack: 3 },
    words: { attack: "attack next run" },
    cost: 10,
  },
  {
    id: "guard",
    name: "Aegis charm",
    grants: { defense: 3 },
    words: { defense: "defense next run" },
    cost: 10,
  },
] as const;
export type GoldItemId = (typeof GOLD_SHOP)[number]["id"];
