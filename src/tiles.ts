/** The tile collection, as the Tiles tab shows it: everything the player
 * owns to put into a defense is a tile, a real piece of the realm. City
 * tiles and the wall's pieces, the unit buildings (Barracks), the towers,
 * and the consumables (bombs and the war banner) are all tiles of one of
 * four types. Identical tiles stack (`tileStacks`): one stack per kind, its
 * quantity, and how many of it stand in the city. The shop sells more of a
 * kind (`shopOffer`, `buyTile`); a kind's upgrades live where they are made,
 * the Mine's Smithy and the Library's Study (`tileTopic`); a kind's higher
 * tier is its Knowledge path's crown (`higherTier`). Pure functions over the
 * save, so the page and the tests share them. */
import { BOMB_GOLD, ITEM_CATEGORY, ITEM_NAMES, PALETTE_ITEMS, purchasePrice, type PaletteItem, type Price } from "./defend/catalog.ts";
import { available, buyBomb, buyItem, canAfford, type Wallet } from "./defend/progress.ts";
import { crownBought, crownedFrom, evolvedBy, PATHS, type KnowledgePath } from "./knowledge-paths.ts";
import { METALS } from "./mine/sim.ts";
import type { Save } from "./save.ts";
import { SUBJECTS, topicItems, type Subject, type Topic } from "./upgrade-subjects.ts";

/** The four types of tile, and the filters the page offers (All shows every type). */
export type TileType = "city" | "units" | "towers" | "consumables";
export type TileFilter = "all" | TileType;
export const TILE_FILTERS: { id: TileFilter; name: string }[] = [
  { id: "all", name: "All" },
  { id: "city", name: "City" },
  { id: "units", name: "Barracks" },
  { id: "towers", name: "Towers" },
  { id: "consumables", name: "Consumables" },
];
export const TILE_TYPE_NAMES: Record<TileType, string> = { city: "City", units: "Barracks", towers: "Tower", consumables: "Consumable" };

/** Tiles used up (or carried) in battle rather than placed in the city. */
export type Consumable = "bomb" | "warBanner";
export const CONSUMABLES: Consumable[] = ["bomb", "warBanner"];
export type TileId = PaletteItem | Consumable;

const TYPE_ORDER: TileType[] = ["city", "units", "towers", "consumables"];
export const TILE_TYPE: Record<TileId, TileType> = { ...ITEM_CATEGORY, bomb: "consumables", warBanner: "consumables" };
/** Every kind of tile, by type and within a type in the palette's order. */
export const TILE_IDS: TileId[] = TYPE_ORDER.flatMap((type) => [...PALETTE_ITEMS, ...CONSUMABLES].filter((id) => TILE_TYPE[id] === type));
export const TILE_NAMES: Record<TileId, string> = { ...ITEM_NAMES, bomb: "Bomb", warBanner: "War banner" };
export const isConsumable = (id: TileId): id is Consumable => (CONSUMABLES as string[]).includes(id);
export const inFilter = (id: TileId, filter: TileFilter) => filter === "all" || TILE_TYPE[id] === filter;

/** What a consumable does, as its tile reads. */
export const CONSUMABLE_TEXT: Record<Consumable, string> = {
  bomb: "Drag onto the battlefield mid-defense to blast everything around where it lands. Used up when it goes off. Shaped charges spare your own people; the Smithy and Gunpowder make it hit harder.",
  warBanner: "Plant it mid-defense and every troop with nothing in reach marches to it and fights round it. Never used up: lift it and plant it again. The War banner study makes your troops hit harder.",
};

/** One kind's stack: how many there are, how many stand in the city, and
 * how many wait in the palette. A lasting tile (the war banner) is one
 * tile that is never used up. */
export type TileStack = { id: TileId; type: TileType; count: number; placed: number; ready: number; lasting: boolean };

/** The stack of one kind. */
export function tileStack(save: Save, id: TileId): TileStack {
  const d = save.defend, type = TILE_TYPE[id];
  if (id === "bomb") return { id, type, count: d.bombs, placed: 0, ready: d.bombs, lasting: false };
  if (id === "warBanner") return { id, type, count: 1, placed: 0, ready: 1, lasting: true };
  const ready = available(d, id);
  return { id, type, count: d.owned[id], placed: d.owned[id] - ready, ready, lasting: false };
}

/** The stacks the page shows: owned kinds in the filter (or, for the shop,
 * every kind in the filter that is for sale), by type, then palette order. */
export function tileStacks(save: Save, filter: TileFilter, shop = false): TileStack[] {
  return TILE_IDS.filter((id) => inFilter(id, filter))
    .map((id) => tileStack(save, id))
    .filter((s) => (shop ? !("reason" in shopOffer(save, s.id)) : s.count > 0));
}

/** One copy of a stack, as the expanded stack or the spread view lays them
 * out: the city's first, then the palette's. */
export type TileCopy = { key: string; id: TileId; index: number; placed: boolean };
export function tileCopies(stack: TileStack, limit = Infinity): TileCopy[] {
  const n = Math.min(stack.count, limit);
  return Array.from({ length: n }, (_, index) => ({ key: `${stack.id}#${index}`, id: stack.id, index, placed: index < stack.placed }));
}

/** The shop's offer for a kind: its price (the mine's metal, or battle Gold
 * for bombs), or why it isn't sold. */
export type ShopOffer = { price: Price; gold?: undefined } | { gold: number; price?: undefined } | { reason: string };
export function shopOffer(save: Save, id: TileId): ShopOffer {
  if (id === "bomb") return { gold: BOMB_GOLD };
  if (id === "warBanner") return { reason: "Always at hand in battle: one banner, never used up." };
  const crown = crownedFrom(save, id)?.evolves;
  if (crown) return { reason: `Crowned: every ${ITEM_NAMES[id]} is now a ${crown.name}. Buy those instead.` };
  const grown = evolvedBy(id);
  if (grown && !crownedFrom(save, grown.evolves!.from))
    return { reason: `Not sold: the crown of ${grown.name} turns every ${ITEM_NAMES[grown.evolves!.from]} into one.` };
  return { price: purchasePrice(id, save.defend.owned[id]) };
}

/** Whether the player can pay for the offer now. */
export function canBuyTile(save: Save, id: TileId): boolean {
  const offer = shopOffer(save, id);
  if (save.settings.devMode) return !("reason" in offer);
  if ("gold" in offer && offer.gold !== undefined) return save.gold >= offer.gold;
  if ("price" in offer && offer.price) return canAfford({ ...save.smithy }, offer.price);
  return false;
}

/** Buys one more tile of a kind, paying with the mine's metal (or Gold, for
 * a bomb); free with Unlimited money. A building bought while its kind is
 * crowned counts with the crown, so unlearning turns it back too. */
export function buyTile(save: Save, id: TileId): boolean {
  const offer = shopOffer(save, id), free = save.settings.devMode;
  if ("reason" in offer) return false;
  if (id === "bomb") return buyBomb(save.defend, free ? { gold: 0, free: true } : save);
  if (id === "warBanner") return false;
  const w: Wallet = { ...save.smithy, free };
  if (!buyItem(save.defend, w, id)) return false;
  if (!free) for (const k of METALS) save.smithy[k] = w[k];
  const grown = evolvedBy(id);
  if (grown) crownBought(save, grown.evolves!.from);
  return true;
}

/** Consumables' upgrades live with the battle's and the troops' topics. */
const CONSUMABLE_TOPIC: Record<Consumable, string> = { bomb: "battle", warBanner: "troops" };
/** The topic a kind's upgrades are filed in, and its subject. */
export function tileTopic(id: TileId): { subject: Subject; topic: Topic } {
  for (const subject of SUBJECTS)
    for (const topic of subject.topics)
      if (isConsumable(id) ? topic.id === CONSUMABLE_TOPIC[id] : topicItems(topic).includes(id)) return { subject, topic };
  throw new Error(`No topic holds ${id}`);
}

/** Where a kind stands among the tiers: the path whose crown turns it into
 * a greater building (`into`), or the path whose crown made it (`from`). */
export function higherTier(id: TileId): { into?: KnowledgePath; from?: KnowledgePath } {
  if (isConsumable(id)) return {};
  return { into: PATHS.find((p) => p.evolves?.from === id), from: evolvedBy(id) };
}

/** A price in words: "3 copper · 1 silver", or "60 Gold". */
export function offerText(offer: ShopOffer): string {
  if ("reason" in offer) return "";
  if (offer.gold !== undefined) return `${offer.gold} Gold`;
  return METALS.filter((k) => offer.price![k]).map((k) => `${offer.price![k]} ${k}`).join(" · ");
}
