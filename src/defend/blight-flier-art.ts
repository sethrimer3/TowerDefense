/** Presentation only: black paper darts and nested, periodically aligned prisms. */
import { ENEMIES } from "./catalog.ts";
import { isBlightPrism } from "./blight-fliers.ts";
import { hasArtOverride } from "./art-overrides.ts";
import { basicName, basicUnitSprite } from "./basic-unit-art.ts";
import { drawSprite } from "./damage-art.ts";
import type { Enemy } from "./sim.ts";

type Brush = { c: CanvasRenderingContext2D; px: number };
// Rates are powers of one half; every layer returns together after 48 s.
export const PRISM_ART = { period: 6, rates: [1, 1 / 2, 1 / 4, 1 / 8], colors: ["#f5a543", "#ae593f", "#e5ba77", "#76547c"] } as const;
export const prismAngles = (seconds: number, count: number) => PRISM_ART.rates.slice(0, count).map(rate => seconds * Math.PI * 2 / PRISM_ART.period * rate);

function triangle(c: CanvasRenderingContext2D, radius: number, angle: number) {
  const path = new Path2D();
  for (let n = 0; n < 3; n++) {
    const a = angle - Math.PI / 2 + n * Math.PI * 2 / 3;
    const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
    if (n === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  path.closePath();
  // This inlaid detail stays inside the opaque body. Avoid adding hundreds
  // of overlapping interior paths to the shared silhouette stroker.
  CanvasRenderingContext2D.prototype.stroke.call(c, path);
}

/** Default geometry keeps large flocks to three/four contour vertices per
 * body. Artist PNGs retain the source sprite's exact pixel silhouette. */
function body(c: CanvasRenderingContext2D, e: Enemy, d: number) {
  if (hasArtOverride(basicName(e.kind, true))) {
    drawSprite(c, basicUnitSprite(e.kind, true), -d / 2, -d / 2, d, d);
    return;
  }
  const h = d * Math.sqrt(3) / 2;
  c.fillStyle = "#000000"; c.beginPath();
  c.moveTo(0, -h / 2); c.lineTo(d / 2, h / 2);
  if (e.kind === "blightDart") c.lineTo(0, h * .18);
  c.lineTo(-d / 2, h / 2); c.closePath(); c.fill();
}

export function drawBlightFlier({ c, px }: Brush, e: Enemy, seconds: number, reduceMotion = false, under?: Brush, simple = false) {
  const d = ENEMIES[e.kind].size * px;
  const facing = e.facing ?? { x: 0, y: 1 }, angle = Math.atan2(facing.y, facing.x) + Math.PI / 2;
  if (under) {
    under.c.save(); under.c.globalAlpha *= .2;
    under.c.translate((e.x + .2) * px, (e.y + .35) * px); under.c.rotate(angle);
    body(under.c, e, d);
    under.c.restore();
  }
  c.save(); c.translate(e.x * px, e.y * px); c.rotate(angle);
  body(c, e, d);
  if (isBlightPrism(e.kind) && !simple) {
    const angles = prismAngles(reduceMotion ? 0 : seconds, e.kind === "greaterBlightPrism" ? 4 : 3);
    // All rotating vertices stay within the outer triangle's incircle.
    c.translate(0, d * Math.sqrt(3) / 12);
    c.lineWidth = px / 8 * .5; c.lineJoin = "miter";
    for (let n = 0; n < angles.length; n++) {
      c.strokeStyle = PRISM_ART.colors[n];
      triangle(c, d * (.24 - n * .045), angles[n]);
    }
  }
  c.restore();
}
