/** Retained visual-setting/cache hooks. The checkbox-gated PNG collection
 * and its authoring pipeline were removed at the user's request.
 * Sprite probes deliberately return no image so every existing caller
 * uses its established procedural drawing, without making asset requests. */
import type { EnemyKind, StructureKind } from "./catalog.ts";

export type PixelSprite = string;
export const PIXEL_SPRITES: readonly PixelSprite[] = [];
let on = true;
let revision = 0;
const listeners = new Set<() => void>();

export function setPixelArt(value: boolean) {
  if (value === on) return;
  on = value;
  revision++;
  listeners.forEach(f => f());
}
export const pixelArtOn = () => on;
/** Redraws everything cached from sprites (an artist's sprites arrived). */
export function bumpPixelArt() {
  revision++;
  listeners.forEach(f => f());
}
export const pixelKey = () => on ? `px${revision}` : "off";
export const onPixelArt = (f: () => void) => void listeners.add(f);

/** Compatibility probes leave legacy renderers and their canvas state alone. */
export const pixelSprite = (_id: PixelSprite): HTMLImageElement | null => null;
export function preloadPixelArt() {}
export function drawPixel(_c: CanvasRenderingContext2D, _id: PixelSprite, _x: number, _y: number, _w: number, _h = _w): boolean { return false; }
export function drawPixelFrame(_c: CanvasRenderingContext2D, _id: PixelSprite, _frame: { sx: number; sy: number; sw: number; sh: number }, _x: number, _y: number, _w: number, _h: number): boolean { return false; }
export const enemySprite = (_kind: EnemyKind): PixelSprite | undefined => undefined;
export const structureSprite = (_kind: StructureKind, _wide = false): PixelSprite | undefined => undefined;
export function drawRoof(_c: CanvasRenderingContext2D, _variant: number, _box: { x: number; y: number; w: number; h: number }, _px: number): boolean { return false; }
