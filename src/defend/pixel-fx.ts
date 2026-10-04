/** Shared tools for the battle's effects drawn as pixel art at `ART` pixels
 * a cell, like the parks, the keep and the blazes: a pen that fills art
 * pixels snapped to whole screen pixels at any zoom, a blitter for baked
 * sprites, and the palettes the fire and ice draw from. */
import { ART } from "./park-art.ts";

type Ctx = CanvasRenderingContext2D;

/** The black outline round every sprite in the city. */
export const OUTLINE = "#140c0a";
/** Flame, coolest to hottest. */
export const FLAME = ["#7a1c10", "#c8452a", "#f08a34", "#f6c75a", "#fff4c8"];
/** Smoke, shaded to lit. */
export const SMOKE = ["#2a2420", "#3e3530", "#584c44", "#76685c"];

/** Fills art pixels (in `ART`ths of a cell) on the board's context, each
 * edge rounded to a whole screen pixel under the current transform, so the
 * art stays crisp at every zoom and no pixel vanishes. */
export function artPen(c: Ctx, px: number) {
  const m = c.getTransform(), s = m.a, ox = m.e, oy = m.f, u = (px / ART) * s;
  return (ax: number, ay: number, w = 1, h = 1) => {
    const x0 = Math.round(ax * u + ox), y0 = Math.round(ay * u + oy);
    const x1 = Math.max(x0 + 1, Math.round((ax + w) * u + ox)), y1 = Math.max(y0 + 1, Math.round((ay + h) * u + oy));
    c.fillRect((x0 - ox) / s, (y0 - oy) / s, (x1 - x0) / s, (y1 - y0) / s);
  };
}

/** A puff of fire or smoke `r` art pixels across from its middle: a square
 * with its corners cut, or a single pixel. */
export function puff(dot: ReturnType<typeof artPen>, x: number, y: number, r: number) {
  if (r <= 0) return dot(x, y);
  dot(x - r + 1, y - r, 2 * r - 1, 2 * r + 1);
  dot(x - r, y - r + 1, 2 * r + 1, 2 * r - 1);
}

/** Draws a baked sprite (one canvas pixel an art pixel) with its top left at
 * art pixel (ax, ay), without smoothing. */
export function blit(c: Ctx, px: number, img: HTMLCanvasElement, ax: number, ay: number) {
  const u = px / ART;
  c.drawImage(img, ax * u, ay * u, img.width * u, img.height * u);
}

/** A canvas `w` × `h` art pixels for baking a sprite into. */
export function bake(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, w);
  cv.height = Math.max(1, h);
  // Tiny sprites are built with pixel writes, then copied to the board. A
  // software backing avoids flushing a new GPU canvas for every ice shard.
  return { cv, c: cv.getContext("2d", { willReadFrequently: true })! };
}
