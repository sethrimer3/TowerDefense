import { tileRandom } from "./themes.ts";
import { doorId } from "./doors.ts";
import type { Tile } from "./entities.ts";

export const AREA1_TILE_SIZE = 24;
// Vite serves Pages builds beneath /TowerProject/. Root-absolute asset URLs
// work on localhost but escape that project path in production, causing the
// renderer to silently fall back to procedural tiles. BASE_URL is "./" in
// this project build and "/" in direct Node tests.
const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const assetUrl = (path: string) => `${ASSET_BASE}assets/tilesets/area1/${path}`;
export const AREA1_FLOOR_URLS = [1, 2, 3, 4].map((n) => assetUrl(`floor_0${n}.png`));
export const AREA1_DOOR_URLS = Object.fromEntries(
  ["a", "b", "c", "ab", "ac", "bc", "abc", "steel", "heart"].map((id) => [id, assetUrl(`doors/door_${id}.png`)]),
) as Record<ReturnType<typeof doorId>, string>;
export const AREA1_ITEM_URLS = {
  key_yellow: assetUrl("items/key_yellow.png"), key_blue: assetUrl("items/key_blue.png"), key_red: assetUrl("items/key_red.png"),
  potion_flat: assetUrl("items/potion_flat.png"), potion_percent: assetUrl("items/potion_percent.png"),
  upgrade_attack: assetUrl("items/upgrade_attack.png"), upgrade_defense: assetUrl("items/upgrade_defense.png"),
  chest_treasure: assetUrl("items/chest_treasure.png"), chest_silver: assetUrl("items/chest_silver.png"),
  chest_gold: assetUrl("items/chest_gold.png"), chest_platinum: assetUrl("items/chest_platinum.png"),
  chest_treasure_open: assetUrl("items/chest_treasure_open.png"), chest_silver_open: assetUrl("items/chest_silver_open.png"),
  chest_gold_open: assetUrl("items/chest_gold_open.png"), chest_platinum_open: assetUrl("items/chest_platinum_open.png"),
} as const;
export type Area1ItemId = keyof typeof AREA1_ITEM_URLS;
/** The sprite for each kind of pickup or chest. */
const ITEM_IDS: Partial<Record<Tile["kind"], (tile: Tile) => Area1ItemId>> = {
  key: (t) => `key_${t.color ?? "yellow"}`,
  potion: (t) => (t.color === "red" ? "potion_percent" : "potion_flat"),
  attack: () => "upgrade_attack",
  defense: () => "upgrade_defense",
  treasure: () => "chest_treasure",
  reward: (t) => `chest_${t.tier ?? "silver"}`,
  openedChest: (t) => `chest_${t.tier ?? "treasure"}_open`,
};
export function area1ItemId(tile: Tile): Area1ItemId | null {
  return ITEM_IDS[tile.kind]?.(tile) ?? null;
}

type Neighbors = { northWall: boolean; eastWall: boolean; southWall: boolean; westWall: boolean };
export function wallAdjacencyMask(n: Neighbors) {
  return (n.northWall ? 1 : 0) | (n.eastWall ? 2 : 0) | (n.southWall ? 4 : 0) | (n.westWall ? 8 : 0);
}
export function floorVariant(x: number, y: number, seed: number) {
  return Math.floor(tileRandom(x, y, seed ^ 0x41ea) * AREA1_FLOOR_URLS.length);
}

const cache = new Map<string, HTMLImageElement>();
function image(url: string) {
  if (typeof Image === "undefined") return null;
  let result = cache.get(url);
  if (!result) { result = new Image(); result.src = url; cache.set(url, result); }
  return result;
}
/** The sprite at `url` once it has loaded, or null. */
function loaded(url: string) {
  const sprite = image(url);
  return sprite?.complete && sprite.naturalWidth ? sprite : null;
}
/** Draws the sprite at `url` over the tile; false while it's still loading. */
function drawSprite(c: CanvasRenderingContext2D, url: string) {
  const sprite = loaded(url);
  if (!sprite) return false;
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(sprite, 0, 0, AREA1_TILE_SIZE, AREA1_TILE_SIZE); c.restore();
  return true;
}
/** The loaded floor sprite for a tile, or null while it's still loading. */
export function area1FloorSprite(x: number, y: number, seed: number) {
  return loaded(AREA1_FLOOR_URLS[floorVariant(x, y, seed)]);
}
export function drawArea1Door(c: CanvasRenderingContext2D, tile: Tile) {
  return drawSprite(c, AREA1_DOOR_URLS[doorId(tile)]);
}
export function drawArea1Item(c: CanvasRenderingContext2D, tile: Tile) {
  const id = area1ItemId(tile);
  return !!id && drawSprite(c, AREA1_ITEM_URLS[id]);
}
