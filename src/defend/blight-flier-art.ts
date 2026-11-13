/** Presentation only: black pixel-art paper darts and nested, periodically
 * aligned prisms, every edge stepped on the art lattice. */
import { blightDrawnPixels } from "./blight-size.ts";
import { ART } from "./art-scale.ts";
import { isBlightPrism } from "./blight-fliers.ts";
import { hasArtOverride } from "./art-overrides.ts";
import { basicName, basicUnitSprite } from "./basic-unit-art.ts";
import { drawSprite, sprite } from "./damage-art.ts";
import { BLIGHT_FLIER_FACINGS, blightFlierBox, blightFlierTurned, triangleOutlineCells } from "./blight-flier-shapes.ts";
import type { Enemy } from "./sim.ts";

type Brush = { c: CanvasRenderingContext2D; px: number };
// Rates are powers of one half; every layer returns together after 48 s.
export const PRISM_ART = { period: 6, rates: [1, 1 / 2, 1 / 4, 1 / 8], colors: ["#f5a543", "#ae593f", "#e5ba77", "#76547c"] } as const;
export const prismAngles = (seconds: number, count: number) => PRISM_ART.rates.slice(0, count).map(rate => seconds * Math.PI * 2 / PRISM_ART.period * rate);

const TURN = Math.PI * 2 / BLIGHT_FLIER_FACINGS;
const facingStep = (angle: number) => ((Math.round(angle / TURN) % BLIGHT_FLIER_FACINGS) + BLIGHT_FLIER_FACINGS) % BLIGHT_FLIER_FACINGS;

/** The body at one of the drawn facings, as an outline-free pixel mask. */
function turnedSprite(kind: Enemy["kind"], step: number) {
  const w = blightDrawnPixels(kind)!, m = blightFlierBox(w);
  return sprite(`blightFlier:${kind}:${step}`, m, m, () => blightFlierTurned(kind, w, step * TURN, m), false);
}

/** Pixel-art body: the facing's mask on the art lattice, its corner on a
 * whole screen pixel. Returns the box's centre and art-pixel size. Artist
 * PNGs keep the source sprite's own pixels, turned as before. */
function body(c: CanvasRenderingContext2D, e: Enemy, x: number, y: number, angle: number, px: number) {
  const w = blightDrawnPixels(e.kind)!, cell = px / ART, d = w * cell;
  if (hasArtOverride(basicName(e.kind, true))) {
    c.save(); c.translate(x, y); c.rotate(angle);
    drawSprite(c, basicUnitSprite(e.kind, true), -d / 2, -d / 2, d, d);
    c.restore();
    return { x, y, cell, left: x, top: y };
  }
  const step = facingStep(angle), size = blightFlierBox(w) * cell;
  const left = Math.round(x - size / 2), top = Math.round(y - size / 2);
  drawSprite(c, turnedSprite(e.kind, step), left, top, size, size);
  return { x: left + size / 2, y: top + size / 2, cell, left, top, angle: step * TURN };
}

/** One inlaid triangle as half-art-pixel cells, so its edge steps like the
 * body's. The fill stays inside the opaque body and bypasses the shared
 * silhouette stroker, which would otherwise trace every interior cell. */
function inlay(c: CanvasRenderingContext2D, at: { left: number; top: number; cell: number }, cx: number, cy: number, radius: number, angle: number) {
  const half = at.cell / 2, path = new Path2D();
  const ox = at.left + Math.round((cx - at.left) / half) * half, oy = at.top + Math.round((cy - at.top) / half) * half;
  for (const [x, y] of triangleOutlineCells(radius / half, angle)) path.rect(ox + x * half, oy + y * half, half, half);
  CanvasRenderingContext2D.prototype.fill.call(c, path);
}

export function drawBlightFlier({ c, px }: Brush, e: Enemy, seconds: number, reduceMotion = false, under?: Brush, simple = false) {
  const facing = e.facing ?? { x: 0, y: 1 }, angle = Math.atan2(facing.y, facing.x) + Math.PI / 2;
  if (under) {
    under.c.save(); under.c.globalAlpha *= .2;
    body(under.c, e, (e.x + .2) * px, (e.y + .35) * px, angle, px);
    under.c.restore();
  }
  const at = body(c, e, e.x * px, e.y * px, angle, px);
  if (isBlightPrism(e.kind) && !simple) {
    const d = blightDrawnPixels(e.kind)! * at.cell, turn = at.angle ?? angle;
    const angles = prismAngles(reduceMotion ? 0 : seconds, e.kind === "greaterBlightPrism" ? 4 : 3);
    // All rotating vertices stay within the outer triangle's incircle,
    // centred on its centroid.
    const lift = d * Math.sqrt(3) / 12, cx = at.x - Math.sin(turn) * lift, cy = at.y + Math.cos(turn) * lift;
    c.save();
    for (let n = 0; n < angles.length; n++) {
      c.fillStyle = PRISM_ART.colors[n];
      inlay(c, at, cx, cy, d * (.24 - n * .045), turn + angles[n]);
    }
    c.restore();
  }
}
