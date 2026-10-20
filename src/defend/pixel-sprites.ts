/** Pixel Art: native PNG sheets for the clean building families in
 * `building-sprite-manifest.ts`, plus imported sprites from Tower Delve's
 * Defend. Clean families keep their identity through damage, paths, rubble,
 * reconstruction and UI. The remaining imports stand
 * in for the procedural art of the pieces they cover while the Settings
 * page's Pixel Art is on (`setPixelArt`, on by default): the keep, the plain
 * barracks, archer barracks and towers, the houses' roofs, park trees, pond
 * lilies and reeds, rebuilding scaffolds, rubble, Mossbound Ruins' floor and
 * wall, lanterns, civilians, swordsmen, archers, the roach, orc, ogre,
 * warlord and bat, and the bomb's and city tile's palette icons. Each
 * painter asks `pixelSprite(id)` and draws its own art when it gets null
 * (Pixel Art off, the PNG still loading, or no `Image`, as in Node), so
 * turning it off brings back exactly the art from before.
 *
 * Presentation only: images live in `public/assets/pixel/`, load once on
 * first use, and bump `pixelKey()` as they arrive or the switch flips, which
 * the renderer's caches (the city layer, the ground relief, the combat
 * frame, the palette icons) fold into their keys. */
import type { EnemyKind, StructureKind } from "./catalog.ts";
import { BUILDING_PNGS } from "./building-sprite-manifest.ts";

const BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";

export const PIXEL_SPRITES = [
  "civilian", "swordsman", "archer", "goblin", "enemy-orc", "enemy-ogre", "enemy-bat",
  "defend-keep", "defend-barracks", "defend-barracks-wide", "defend-archer-barracks", "defend-archer-tower", "defend-cannon-tower", "defend-watch-tower",
  "roof-terracotta", "roof-brick", "roof-timber", "roof-thatch", "roof-slate", "roof-straw",
  "city-oak", "city-pine", "city-rubble", "city-scaffold", "city-wall-cap", "city-wall-face", "city-lantern", "pond-lily", "pond-reeds",
  "city-tile", "bomb", "floor-1", "floor-2", "floor-3", "floor-4",
  ...BUILDING_PNGS,
] as const;
export type PixelSprite = (typeof PIXEL_SPRITES)[number];

export const pixelUrl = (id: PixelSprite) => `${BASE}assets/pixel/${id}.png`;

let on = true;
let revision = 0;
const images = new Map<PixelSprite, HTMLImageElement>();
const listeners = new Set<() => void>();

/** Turns Pixel Art on or off (the Settings page's `pixelArt`). */
export function setPixelArt(value: boolean) {
  if (value === on) return;
  on = value;
  revision++;
  listeners.forEach((f) => f());
}
export const pixelArtOn = () => on;
/** Changes whenever the switch flips or a sprite arrives: caches drawn with
 * these sprites key on it. */
export const pixelKey = () => (on ? `px${revision}` : "off");
/** Calls `f` whenever `pixelKey` changes. */
export const onPixelArt = (f: () => void) => void listeners.add(f);

/** Sprite `id`, once loaded, while Pixel Art is on; null otherwise. */
export function pixelSprite(id: PixelSprite): HTMLImageElement | null {
  if (!on || typeof Image === "undefined") return null;
  let image = images.get(id);
  if (!image) {
    image = new Image();
    image.onload = () => {
      revision++;
      listeners.forEach((f) => f());
    };
    image.src = pixelUrl(id);
    images.set(id, image);
  }
  return image.complete && image.naturalWidth ? image : null;
}

/** Starts loading every sprite while Pixel Art is on, so they are in hand
 * before they are first drawn. */
export function preloadPixelArt() {
  for (const id of PIXEL_SPRITES) pixelSprite(id);
}

/** Draws sprite `id` over (x, y, w, h), nearest-neighbour: false (drawing
 * nothing) when it isn't to be drawn, so the caller paints its own. */
export function drawPixel(c: CanvasRenderingContext2D, id: PixelSprite, x: number, y: number, w: number, h = w) {
  const image = pixelSprite(id);
  if (!image) return false;
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  c.drawImage(image, x, y, w, h);
  c.imageSmoothingEnabled = smooth;
  return true;
}

/** A native frame from a PNG sheet. Keep all copies nearest-neighbour. */
export function drawPixelFrame(c: CanvasRenderingContext2D, id: PixelSprite, frame: { sx: number; sy: number; sw: number; sh: number }, x: number, y: number, w: number, h: number) {
  const image = pixelSprite(id);
  if (!image) return false;
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  c.drawImage(image, frame.sx, frame.sy, frame.sw, frame.sh, x, y, w, h);
  c.imageSmoothingEnabled = smooth;
  return true;
}

/** The enemies with a sprite, as Tower Delve's Defend draws them. */
const ENEMY_SPRITES: Partial<Record<EnemyKind, PixelSprite>> = { roach: "goblin", orc: "enemy-orc", ogre: "enemy-ogre", warlord: "goblin", bat: "enemy-bat" };
export const enemySprite = (kind: EnemyKind) => ENEMY_SPRITES[kind];

/** The structures with a sprite (the barracks has a wide one too). */
const STRUCTURE_SPRITES: Partial<Record<StructureKind, PixelSprite>> = {
  keep: "defend-keep", barracks: "defend-barracks", archerBarracks: "defend-archer-barracks",
  archerTower: "defend-archer-tower", cannonTower: "defend-cannon-tower", watchTower: "defend-watch-tower",
};
export const structureSprite = (kind: StructureKind, wide = false): PixelSprite | undefined =>
  kind === "barracks" && wide ? "defend-barracks-wide" : STRUCTURE_SPRITES[kind];

export const ROOF_SPRITES = ["roof-terracotta", "roof-brick", "roof-timber", "roof-thatch", "roof-slate", "roof-straw"] as const satisfies readonly PixelSprite[];

/** A house's roof from its variant's sprite over `box` (canvas pixels, `px`
 * a cell): the corners kept their size, the middle repeated on one pixel
 * grid, so long houses aren't stretched. False when it isn't to be drawn. */
export function drawRoof(c: CanvasRenderingContext2D, variant: number, box: { x: number; y: number; w: number; h: number }, px: number) {
  if (box.w <= 0 || box.h <= 0 || px <= 0) return false;
  const image = pixelSprite(ROOF_SPRITES[variant % ROOF_SPRITES.length]);
  if (!image) return false;
  const unit = px / 12;
  const edge = Math.min(11, box.w / unit / 2, box.h / unit / 2);
  const source = [0, edge, 24 - edge, 24];
  const xs = [box.x, box.x + edge * unit, box.x + box.w - edge * unit, box.x + box.w];
  const ys = [box.y, box.y + edge * unit, box.y + box.h - edge * unit, box.y + box.h];
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const sw = source[col + 1] - source[col], sh = source[row + 1] - source[row];
    if (sw <= 0 || sh <= 0) continue;
    for (let y = ys[row]; y < ys[row + 1] - 0.0001; y += sh * unit)
      for (let x = xs[col]; x < xs[col + 1] - 0.0001; x += sw * unit) {
        const w = Math.min(sw, (xs[col + 1] - x) / unit), h = Math.min(sh, (ys[row + 1] - y) / unit);
        c.drawImage(image, source[col], source[row], w, h, x, y, w * unit, h * unit);
      }
  }
  c.imageSmoothingEnabled = smooth;
  return true;
}
