import type { CardId } from "../cards.ts";
import type { UpgradeId } from "../config.ts";
import type { EquipmentSlot } from "../equipment.ts";
import { AREA1_ITEM_URLS } from "../area1-tileset.ts";

/** Small DOM, number and sprite helpers shared by every page. */

export const el = (id: string) => document.getElementById(id)!;
export const text = (id: string, value: unknown) =>
  (el(id).textContent = String(value));
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Dungeon coordinates are zero-based internally, but player-facing progress
// starts at 1 once the entrance is crossed. The forest is the sole height /
// depth 0 area.
export const displayedProgress = (value: number, outside = false) => outside ? 0 : value + 1;
/** `word` with its first letter in capitals. */
export const capitalized = (word: string) => word[0].toUpperCase() + word.slice(1);

export type UiSprite = "tower" | "delve" | "defend" | "gear" | "upgrades" | "settings" | "health" | "attack" | "defense" | "undo" | "automove" | "revive" | "log" | "arrow-up" | "arrow-down" | "arrow-left" | "arrow-right" | EquipmentSlot | "gold";
const UI_ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
/** A card's face, from public/assets/cards/. */
export const cardArt = (id: CardId, alt: string) =>
  `<img class="card-art" src="${UI_ASSET_BASE}assets/cards/${id}.png" alt="${alt}">`;
export const uiSprite = (name: UiSprite, className = "ui-sprite") =>
  `<img class="${className}" src="${UI_ASSET_BASE}assets/ui/${name}.png" alt="" aria-hidden="true">`;
export const itemSprite = (name: keyof typeof AREA1_ITEM_URLS, className = "ui-sprite") =>
  `<img class="${className}" src="${AREA1_ITEM_URLS[name]}" alt="" aria-hidden="true">`;

const SKILL_ITEM_SPRITES: Partial<Record<UpgradeId, keyof typeof AREA1_ITEM_URLS>> = {
  attack: "upgrade_attack",
  defense: "upgrade_defense",
  yellow: "key_yellow", blue: "key_blue", red: "key_red",
  greaterHeal: "potion_flat",
};
const SKILL_UI_SPRITES: Partial<Record<UpgradeId, UiSprite>> = {
  hp: "health", inspirationUndos: "undo", undos: "undo", archives: "log",
  delve: "delve", auto: "automove", autoPersist: "settings",
  revive: "revive", legacy: "tower", quality: "tower",
  wisdomFocus: "settings", wisdomMemory: "undo", wisdomSight: "upgrades",
  renownBanner: "tower", renownOath: "defense", renownCrown: "gear",
};
/** Skills about the hand show a card face. */
const SKILL_CARDS: Partial<Record<UpgradeId, CardId>> = { handOrdering: "stairs", combatStance: "monster", cardHeal: "heal", cardGear: "equipment" };
/** Two cards fanned out: the Deck's icon, made from the card faces. */
const DECK_ICON = `<span class="deck-icon" aria-hidden="true"><img src="${UI_ASSET_BASE}assets/cards/heal.png" alt=""><img src="${UI_ASSET_BASE}assets/cards/stairs.png" alt=""></span>`;
export const skillSprite = (id: UpgradeId) => {
  const card = SKILL_CARDS[id];
  if (card) return `<img class="skill-sprite card-sprite" src="${UI_ASSET_BASE}assets/cards/${card}.png" alt="" aria-hidden="true">`;
  const item = SKILL_ITEM_SPRITES[id];
  if (item) return itemSprite(item, "skill-sprite");
  return uiSprite(SKILL_UI_SPRITES[id] ?? "upgrades", "skill-sprite");
};
export const TAB_ICONS = {
  tower: uiSprite("tower"), delve: uiSprite("delve"), deck: DECK_ICON, defend: uiSprite("defend"), gear: uiSprite("gear"),
  upgrades: uiSprite("upgrades"), settings: uiSprite("settings"),
};
export const SLOT_ICONS: Record<EquipmentSlot, string> = {
  weapon: uiSprite("weapon"), shield: uiSprite("shield"), helmet: uiSprite("helmet"),
  chestplate: uiSprite("chestplate"), leggings: uiSprite("leggings"), boots: uiSprite("boots"),
  gloves: uiSprite("gloves"), necklace: uiSprite("necklace"), ring: uiSprite("ring"),
};
