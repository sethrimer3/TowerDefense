import { drawSprite, spriteSize } from "./damage-art.ts";
/** Shared tools for the battle's effects drawn as pixel art at `ART` pixels
 * a cell, like the parks, the keep and the blazes: a pen that fills art
 * pixels snapped to whole screen pixels at any zoom, a blitter for baked
 * sprites, and the palettes the fire and ice draw from. */
import { ART } from "./art-scale.ts";
import { hash01 } from "./grid.ts";

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

/** A torch's fire, as the Obsidian Palace's torches burn: a bed of embers
 * `fire[3]` at art pixel (bx, by), and nine tongues rising off it and
 * shrinking, hottest (`fire[0]`) as they leave the bed, `tall` times their
 * height. `seed` keeps each torch's tongues its own; `t` is in seconds. */
export function fireTongues(c: Ctx, dot: ReturnType<typeof artPen>, fire: readonly string[], bx: number, by: number, seed: number, t: number, tall = 1) {
  c.fillStyle = fire[3];
  dot(bx - 2, by, 5, 2);
  for (let k = 0; k < 9; k++) {
    const u = (s: number) => hash01(seed, k, s);
    const age = (t * (1.1 + u(1840) * 0.8) + u(1841)) % 1;
    const x = bx + (u(1842) - 0.5) * 5 * (1 - age) + Math.sin(t * 5 + k) * 1.2 * age, y = by - age * (8 + u(1843) * 4) * tall;
    const r = Math.round((1 - age) * 2.2 - 0.3);
    c.fillStyle = age < 0.18 ? fire[0] : age < 0.42 ? fire[1] : age < 0.7 ? fire[2] : fire[3];
    puff(dot, Math.round(x), Math.round(y), Math.max(0, r));
  }
}

/** Draws a baked sprite (one canvas pixel an art pixel) with its top left at
 * art pixel (ax, ay), without smoothing. */
export function blit(c: Ctx, px: number, img: HTMLCanvasElement, ax: number, ay: number) {
  const u = px / ART;
  const {w,h}=spriteSize(img);
  drawSprite(c,img,ax*u,ay*u,w*u,h*u);
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
