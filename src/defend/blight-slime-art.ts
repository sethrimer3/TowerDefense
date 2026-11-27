/** Presentation only: the Blight Slime as pixel art. Its body is the Blight
 * Essence glob (`currency-icons.ts`): pitch black with a glossy sheen and a
 * glint on its upper left and an edge that wobbles with Perlin noise, here
 * sitting on a flattened foot, stretched and squashed through each hop.
 * Outline-free: the shared portal contour draws the burning rim. Landing
 * splats and the death splat are dark flecks on the ground. */
import { ART } from "./art-scale.ts";
import { hasArtOverride } from "./art-overrides.ts";
import { basicName, basicUnitSprite } from "./basic-unit-art.ts";
import { drawSprite, sprite } from "./damage-art.ts";
import { blightDrawnPixels } from "./blight-size.ts";
import { slimeHop, slimeScale, SLIME_SQUASH_MAX, SLIME_SQUASH_MIN } from "./blight-slime.ts";
import { SLIME_WOBBLES, slimeBox, slimePixels } from "./blight-slime-shapes.ts";
import type { Effect, Enemy } from "./sim.ts";

type Brush = { c: CanvasRenderingContext2D; px: number };

function slimeSprite(w: number, level: number, frame: number) {
  const n = slimeBox(w);
  return sprite(`blightSlime:${w}:${level}:${frame}`, n, n, () => slimePixels(w, level, frame), false);
}

const WOBBLE_RATE = 7;

const hash01 = (a: number, b: number) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const GOO = ["#0b0810", "#1c1426", "#3a2c4a"] as const;

/** Flecks of Blight thrown out round `x, y` (cells): `k` 0–1 through the
 * splat, `r` the reach in cells, `count` flecks, each an art pixel or two,
 * fading as they land. */
function flecks({ c, px }: Brush, x: number, y: number, r: number, k: number, count: number, seed: number) {
  const dot = Math.max(1, Math.round(px / ART));
  c.globalAlpha = Math.max(0, 1 - k * k);
  for (let i = 0; i < count; i++) {
    const a = (i + hash01(seed, i) * .6) / count * Math.PI * 2;
    const out = r * (.45 + .55 * hash01(i, seed)) * (1 - (1 - k) * (1 - k));
    const big = hash01(seed + 3, i) > .45 ? 2 : 1;
    c.fillStyle = GOO[i % GOO.length];
    c.fillRect(Math.round((x + Math.cos(a) * out) * px), Math.round((y + Math.sin(a) * out * .6) * px), dot * big, dot * (big > 1 && i % 3 === 0 ? 2 : 1));
  }
  c.globalAlpha = 1;
}

/** The slime at battle time `seconds`: hopping, squashing, its edge
 * wobbling, with a shadow under it while airborne and a splat of flecks on
 * `under` where it lands. `simple` and Reduce Motion sit it still. */
export function drawBlightSlime(b: Brush, e: Enemy, seconds: number | undefined, reduceMotion = false, under = b, simple = false) {
  const { c, px } = b;
  const w = blightDrawnPixels(e.kind)!, cell = px / ART;
  const still = simple || reduceMotion || seconds === undefined;
  const hop = slimeHop(e, still ? undefined : seconds);
  const gx = hop.x * px, foot = hop.y * px + w / 2 * cell;
  if (hop.lift > .5) {
    // A shadow that shrinks as it rises.
    const sw = Math.max(1, Math.round(w * (1 - hop.lift / 12))) * cell;
    under.c.fillStyle = "rgba(0,0,0,.28)";
    under.c.fillRect(Math.round(gx - sw / 2), Math.round(foot - cell), Math.round(sw), Math.max(1, Math.round(cell)));
  }
  if (hop.splat >= 0) flecks(under, hop.landX, hop.landY + w / 2 / ART, w / ART * 1.3, hop.splat, 8, e.id);
  const level = Math.max(SLIME_SQUASH_MIN, Math.min(SLIME_SQUASH_MAX, hop.squash));
  const lift = Math.round(hop.lift) * cell;
  if (hasArtOverride(basicName(e.kind, true))) {
    const { sx, sy } = slimeScale(level), dw = w * cell * sx, dh = w * cell * sy;
    drawSprite(c, basicUnitSprite(e.kind, true), Math.round(gx - dw / 2), Math.round(foot - lift - dh), dw, dh);
    return;
  }
  const frame = still ? 0 : Math.floor(seconds! * WOBBLE_RATE + e.id * .37) % SLIME_WOBBLES;
  const n = slimeBox(w), size = n * cell, base = Math.floor(n / 2 + w / 2);
  drawSprite(c, slimeSprite(w, level, frame), Math.round(gx - size / 2), Math.round(foot - lift - base * cell), size, size);
}

/** A slime's death: a puddle that soaks away and a ring of flecks. */
export function drawSlimeSplat(b: Brush, fx: Effect, k: number) {
  const { c, px } = b, cell = px / ART, r = fx.r;
  const rows = Math.max(1, Math.round(r * ART * .6));
  c.globalAlpha = .75 * (1 - k);
  c.fillStyle = GOO[0];
  for (let i = 0; i < rows; i++) {
    // An ellipse of art-pixel rows, spreading as it soaks in.
    const v = (i + .5) / rows * 2 - 1, half = r * (.7 + .4 * k) * Math.sqrt(1 - v * v);
    c.fillRect(Math.round((fx.x - half) * px), Math.round((fx.y + r * .2 + v * r * .35) * px), Math.round(half * 2 * px), Math.max(1, Math.round(cell)));
  }
  c.globalAlpha = 1;
  flecks(b, fx.x, fx.y + r * .2, r * 1.8, k, 14, Math.round(fx.x * 64) ^ Math.round(fx.y * 64));
}
