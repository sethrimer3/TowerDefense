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
    grants: { undos: 1 },
    base: 6,
    max: 4,
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
export const goldReward = (kills: number, treasures: number) =>
  Math.floor(kills / 3) + treasures;
export const xpForKill = (tier: number, attack: number) =>
  3 + tier * 4 + Math.floor(attack / 5);
export const levelForXp = (xp: number) =>
  Math.floor((Math.sqrt(1 + xp / 5) - 1) / 2);
/** The lifetime XP that reaches `level`: 20 × level × (level + 1). */
export const xpForLevel = (level: number) => 20 * level * (level + 1);
/** Training points each level earns, to spend on the hero's stats. */
export const TRAINING_PER_LEVEL = 3;
/** The stats training raises: each rank costs `cost` points and adds
 * `grants` to the character, the same price every rank for now. */
export const TRAINING = [
  { id: "hp", name: "Max HP", grants: { maxHp: 10 }, cost: 1 },
  { id: "attack", name: "ATK", grants: { attack: 1 }, cost: 5 },
  { id: "defense", name: "DEF", grants: { defense: 1 }, cost: 3 },
] as const;
export type TrainingId = (typeof TRAINING)[number]["id"];
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
