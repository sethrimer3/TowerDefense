/** Square ranges and target crosshairs on the DEFEND board, as pixel art on
 * the world's art lattice (`ART` pixels a cell, each art pixel snapped to
 * whole screen pixels by `artPen`, so lines stay crisp at every zoom).
 *
 * - `drawSquareRange`: a building's reach (gold), a troop building's
 *   deployment area (pale blue), a strike spell's area (violet) or the war
 *   banner's influence (crimson): a faint wash and a dashed, black-edged
 *   edge one art pixel thick, its corners solid.
 * - `drawNearbySquare`: the gold square round placed crosshairs inside which
 *   enemies are picked first, clipped to the tower's own range, gently
 *   pulsing.
 * - `drawCrosshairs`: the target crosshairs themselves, square brackets with
 *   ticks to a red middle, and `drawAimLine`, the dotted line out to them
 *   (or to a rally flag) from the building.
 *
 * Also the squares' geometry (`inSquare`, `clampToSquare`, `clipSquare`),
 * pure and engine-exact (+ − × ÷ only), for the battle to share.
 * Presentation only otherwise: nothing here changes a battle. */
import { ART } from "./art-scale.ts";
import { artPen } from "./pixel-fx.ts";

/** A square in cells: its middle and half its width. */
export type Square = { x: number; y: number; r: number };
type Box = { x0: number; y0: number; x1: number; y1: number };
type Point = { x: number; y: number };

/** Whether (x, y) lies inside `s`, edges included. */
export const inSquare = (s: Square, x: number, y: number) => Math.abs(x - s.x) <= s.r && Math.abs(y - s.y) <= s.r;

/** `to`, or the furthest point toward it from `s`'s middle still inside `s`
 * (where the line from the middle to `to` crosses its edge). */
export function clampToSquare(s: Square, to: Point): Point {
  const dx = to.x - s.x, dy = to.y - s.y, ax = Math.abs(dx), ay = Math.abs(dy);
  const most = Math.max(ax, ay);
  if (most <= s.r) return { x: to.x, y: to.y };
  const k = s.r / most;
  return { x: s.x + dx * k, y: s.y + dy * k };
}

/** Where `a` and `b` overlap, as a box in cells, or null. */
export function clipSquare(a: Square, b: Square): Box | null {
  const x0 = Math.max(a.x - a.r, b.x - b.r), x1 = Math.min(a.x + a.r, b.x + b.r);
  const y0 = Math.max(a.y - a.r, b.y - b.r), y1 = Math.min(a.y + a.r, b.y + b.r);
  return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : null;
}

export type RangeStyle = "reach" | "deploy" | "spell" | "banner";
/** Each style's edge colour and wash. */
export const RANGE_STYLES: Record<RangeStyle, { edge: string; wash: string }> = {
  reach: { edge: "#f2c14e", wash: "rgba(242, 193, 78, 0.08)" },
  deploy: { edge: "#a0cdff", wash: "rgba(140, 190, 255, 0.07)" },
  spell: { edge: "#c9a2ff", wash: "rgba(180, 140, 255, 0.09)" },
  banner: { edge: "#ff7a5c", wash: "rgba(230, 90, 60, 0.08)" },
};

/** The dashes: art pixels lit, then dark, round the edge; and how far each
 * corner's solid bracket runs along each side. */
const DASH = { on: 4, off: 3, corner: 3 };
const INK = "#0c0a0a";
const GOLD = "#f2c14e", BRIGHT = "#fff1b0", RED = "#e0281e";

/** A box's edge as art pixels, clockwise from its top left: `lit(k, side
 * pos, length)` says which to light. */
function ring(b: Box, lit: (along: number, side: number) => boolean) {
  const x0 = Math.round(b.x0 * ART), y0 = Math.round(b.y0 * ART);
  const x1 = Math.round(b.x1 * ART) - 1, y1 = Math.round(b.y1 * ART) - 1;
  const out: number[] = [];
  const add = (x: number, y: number, along: number, side: number) => { if (lit(along, side)) out.push(x, y); };
  const w = x1 - x0, h = y1 - y0;
  for (let i = 0; i < w; i++) add(x0 + i, y0, i, w);
  for (let i = 0; i < h; i++) add(x1, y0 + i, i, h);
  for (let i = 0; i < w; i++) add(x1 - i, y1, i, w);
  for (let i = 0; i < h; i++) add(x0, y1 - i, i, h);
  return out;
}

/** Fills each art pixel in `px` (x, y pairs) over a black edge round it. */
function inkAndColour(pen: ReturnType<typeof artPen>, c: CanvasRenderingContext2D, pxs: number[], colour: string) {
  c.fillStyle = INK;
  for (let i = 0; i < pxs.length; i += 2) pen(pxs[i] - 1, pxs[i + 1] - 1, 3, 3);
  c.fillStyle = colour;
  for (let i = 0; i < pxs.length; i += 2) pen(pxs[i], pxs[i + 1]);
}

/** Draws square `s` in `style`; `c` is in board space at `px` a cell.
 * `march` (seconds) slides the dashes round slowly, as while dragging. */
export function drawSquareRange(c: CanvasRenderingContext2D, px: number, s: Square, style: RangeStyle, opts: { alpha?: number; march?: number } = {}) {
  const look = RANGE_STYLES[style], b = { x0: s.x - s.r, y0: s.y - s.r, x1: s.x + s.r, y1: s.y + s.r };
  c.save();
  c.globalAlpha = opts.alpha ?? 1;
  c.fillStyle = look.wash;
  c.fillRect(b.x0 * px, b.y0 * px, (b.x1 - b.x0) * px, (b.y1 - b.y0) * px);
  const period = DASH.on + DASH.off, shift = opts.march === undefined ? 0 : Math.floor(opts.march * 8) % period;
  const lit = ring(b, (along, side) => along < DASH.corner || along >= side - DASH.corner + 1 || (along + shift) % period < DASH.on);
  inkAndColour(artPen(c, px), c, lit, look.edge);
  c.restore();
}

/** The gold square `near` round placed crosshairs, clipped to `range` (the
 * tower's own square), pulsing gently unless `reduceMotion`. */
export function drawNearbySquare(c: CanvasRenderingContext2D, px: number, near: Square, range: Square, now: number, reduceMotion: boolean) {
  const b = clipSquare(near, range);
  if (!b) return;
  const pulse = reduceMotion ? 1 : 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(now / 320));
  c.save();
  c.globalAlpha = pulse;
  c.fillStyle = "rgba(242, 193, 78, 0.12)";
  c.fillRect(b.x0 * px, b.y0 * px, (b.x1 - b.x0) * px, (b.y1 - b.y0) * px);
  const pen = artPen(c, px);
  inkAndColour(pen, c, ring(b, () => true), GOLD);
  // Its corners a little brighter.
  c.fillStyle = BRIGHT;
  for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
    const ax = Math.round(x * ART) - (x === b.x1 ? 1 : 0), ay = Math.round(y * ART) - (y === b.y1 ? 1 : 0);
    pen(ax, ay);
  }
  c.restore();
}

/** The crosshairs at `at`: square corner brackets with ticks in toward a
 * red middle pixel, breathing out a pixel now and then unless
 * `reduceMotion`; `placing` (while dragged) draws them brighter. */
export function drawCrosshairs(c: CanvasRenderingContext2D, px: number, at: Point, now: number, reduceMotion: boolean, placing = false) {
  const cx = Math.round(at.x * ART), cy = Math.round(at.y * ART);
  const out = 7 + (reduceMotion || placing ? 0 : Math.sin(now / 280) > 0.6 ? 1 : 0), arm = 3;
  const pxs: number[] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let i = 0; i < arm; i++) pxs.push(cx + sx * (out - i), cy + sy * out, cx + sx * out, cy + sy * (out - i));
  }
  for (let i = 3; i <= 5; i++) pxs.push(cx + i, cy, cx - i, cy, cx, cy + i, cx, cy - i);
  const pen = artPen(c, px);
  c.save();
  inkAndColour(pen, c, pxs, placing ? BRIGHT : GOLD);
  c.fillStyle = INK;
  pen(cx - 1, cy - 1, 3, 3);
  c.fillStyle = RED;
  pen(cx, cy);
  c.restore();
}

/** A dotted line of art pixels from `from` to `to`, one lit every three, on
 * a black edge; `colour` gold for crosshairs, pale blue for a rally flag. */
export function drawAimLine(c: CanvasRenderingContext2D, px: number, from: Point, to: Point, colour = GOLD) {
  const x0 = from.x * ART, y0 = from.y * ART, x1 = to.x * ART, y1 = to.y * ART;
  const steps = Math.floor(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 3);
  const pxs: number[] = [];
  for (let s = 1; s < steps; s++) pxs.push(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps));
  c.save();
  inkAndColour(artPen(c, px), c, pxs, colour);
  c.restore();
}
