/** Presentation only: the Dark Blade as pixel art (pentagon body, swaying
 * cloak, greatsword) and the tears in space its cuts leave behind. */
import { ART } from "./art-scale.ts";
import { hasArtOverride } from "./art-overrides.ts";
import { basicName, basicUnitSprite } from "./basic-unit-art.ts";
import { drawSprite, sprite } from "./damage-art.ts";
import { blightDrawnPixels } from "./blight-size.ts";
import { DARK_BLADE, bladeSwing, type Tear } from "./dark-blade.ts";
import { DARK_BLADE_FACINGS, DARK_BLADE_SWAYS, darkBladeBox, darkBladeTurned, greatswordBox, greatswordTurned } from "./dark-blade-shapes.ts";
import type { DefendSim, Enemy } from "./sim.ts";

type Brush = { c: CanvasRenderingContext2D; px: number };
const TURN = Math.PI * 2 / DARK_BLADE_FACINGS;
const facingStep = (angle: number) => ((Math.round(angle / TURN) % DARK_BLADE_FACINGS) + DARK_BLADE_FACINGS) % DARK_BLADE_FACINGS;

function knightSprite(w: number, step: number, sway: number, square: boolean) {
  const m = darkBladeBox(w);
  return sprite(`darkBlade:${w}:${step}:${sway}:${square}`, m, m, () => darkBladeTurned(w, step * TURN, sway, m, square), false);
}
function swordSprite(w: number, step: number) {
  const m = greatswordBox(w);
  return sprite(`darkBladeSword:${w}:${step}`, m, m, () => greatswordTurned(w, step * TURN), false);
}

/** The knight at its facing, the sword in its right hand turned by the
 * swing. `simple` skips the cloak's sway. */
export function drawDarkBlade({ c, px }: Brush, e: Enemy, seconds: number, reduceMotion = false, simple = false) {
  const w = blightDrawnPixels(e.kind)!, cell = px / ART;
  const facing = e.facing ?? { x: 0, y: 1 }, step = facingStep(Math.atan2(facing.y, facing.x) + Math.PI / 2), angle = step * TURN;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const x = e.x * px, y = e.y * px;
  if (hasArtOverride(basicName(e.kind, true))) {
    const d = w * cell;
    c.save(); c.translate(x, y); c.rotate(angle);
    drawSprite(c, basicUnitSprite(e.kind, true), -d / 2, -d / 2, d, d);
    c.restore();
  } else {
    const sway = simple || reduceMotion ? 0 : Math.floor(seconds * 3 + e.id * .37) % DARK_BLADE_SWAYS;
    const size = darkBladeBox(w) * cell;
    drawSprite(c, knightSprite(w, step, sway, e.kind === "lesserDarkBlade"), Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  }
  // The sword hand sits at the right shoulder.
  const hx = w * .42, hy = -w * .05;
  const sx = x + (cos * hx - sin * hy) * cell, sy = y + (sin * hx + cos * hy) * cell;
  const size = greatswordBox(w) * cell;
  drawSprite(c, swordSprite(w, facingStep(angle + bladeSwing(e))), Math.round(sx - size / 2), Math.round(sy - size / 2), size, size);
}

function hash(ix: number, iy: number, seed: number) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return hash(x0, y0, seed) * (1 - u) * (1 - v) + hash(x0 + 1, y0, seed) * u * (1 - v)
    + hash(x0, y0 + 1, seed) * (1 - u) * v + hash(x0 + 1, y0 + 1, seed) * u * v;
}
const fbm = (x: number, y: number, seed: number) => noise(x, y, seed) * .6 + noise(x * 2.1, y * 2.1, seed + 17) * .28 + noise(x * 4.3, y * 4.3, seed + 31) * .12;

const TEAR_COLORS = ["#030106", "#1d0a22", "#5a1c12", "#ff7a22", "#ffe0a0"] as const;

/** Each tear: the crescent the cut swept, ragged with drifting noise, a void
 * at its heart and a burning lip, narrowing and dimming as it closes. Drawn
 * on the art lattice of the board, one batched fill per colour. */
export function drawTears({ c, px }: Brush, sim: Pick<DefendSim, "tears" | "time">, reduceMotion = false) {
  if (!sim.tears.length) return;
  const cell = px / ART;
  for (const tear of sim.tears) {
    const k = Math.min(1, tear.t / tear.life), open = 1 - k * k * (3 - 2 * k);
    if (open <= 0) continue;
    const fresh = Math.max(0, 1 - tear.t / .35), drift = reduceMotion ? 0 : sim.time * .18;
    const paths = TEAR_COLORS.map(() => new Path2D());
    const reach = tear.r * 1.12, rc = tear.r * .74, thick = tear.r * .26 * (.35 + .65 * Math.pow(open, .7));
    const a0 = Math.floor((tear.x - reach) * ART), a1 = Math.ceil((tear.x + reach) * ART);
    const b0 = Math.floor((tear.y - reach) * ART), b1 = Math.ceil((tear.y + reach) * ART);
    const cosArc = Math.cos(DARK_BLADE.halfArc * 1.08);
    for (let iy = b0; iy < b1; iy++) for (let ix = a0; ix < a1; ix++) {
      const wx = (ix + .5) / ART, wy = (iy + .5) / ART, vx = wx - tear.x, vy = wy - tear.y;
      const d = Math.sqrt(vx * vx + vy * vy);
      if (d > reach || d < rc - thick * 2.2) continue;
      const along = (vx * tear.dx + vy * tear.dy) / (d || 1);
      if (along < cosArc) continue;
      // 0 on the cut's line, 1 at the crescent's horns.
      const side = Math.acos(Math.min(1, along)) / (DARK_BLADE.halfArc * 1.08);
      const n = fbm(wx * 1.9 + drift, wy * 1.9 - drift * .6, tear.seed);
      const h = thick * Math.sqrt(Math.max(0, 1 - side * side)) * (.45 + 1.1 * n);
      const v = 1 - Math.abs(d - rc - (n - .5) * thick * .9) / (h || 1e-9);
      if (v <= 0) continue;
      const lip = fresh > 0 && v < .25 + fresh * .3 ? 4 : v < .16 ? 3 : v < .3 ? 2 : v < .6 ? 1 : 0;
      const sx = Math.round(ix * cell), sy = Math.round(iy * cell);
      paths[lip].rect(sx, sy, Math.round((ix + 1) * cell) - sx, Math.round((iy + 1) * cell) - sy);
    }
    c.save();
    c.globalAlpha *= Math.min(1, open * 1.6);
    for (let n = 0; n < paths.length; n++) { c.fillStyle = TEAR_COLORS[n]; c.fill(paths[n]); }
    c.restore();
  }
}
