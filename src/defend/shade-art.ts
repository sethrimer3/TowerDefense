/** The Shadow's shade and its knives as they are drawn, in the city's pixel
 * art (every pixel snapped to the art's grid, whatever the zoom):
 *
 * - **The shade:** a see-through hooded figure, two pale eyes in the dark of
 *   its cowl, its black cloak billowing out round it, the hem's tatters
 *   rippling on the battle's time; light only where something just struck
 *   it.
 * - **The knives:** small acute steel triangles circling it, as many as it
 *   has (`shadowStats`) less those in flight, points leading.
 * - **A knife in flight:** the triangle racing round its loop (`loopAt`),
 *   a trail of violet dark behind it with a glint of steel at its edge.
 *
 * Presentation only: it reads the sim and never draws from a random
 * stream. */
import { SHADE } from "./catalog.ts";
import { ART } from "./park-art.ts";
import { loopAt, shadowStats, type Blade } from "./shadow.ts";
import type { DefendSim, Soldier } from "./sim.ts";

type Ctx = CanvasRenderingContext2D;

const OUTLINE = "#07060a";
const CLOAK = ["#0d0b12", "#1c1826", "#2c2640"];
const STEEL = ["#4a5266", "#c9d2e0", "#ffffff"];
const EYES = "#d8e4ff";
const TRAIL = "#5a3e8a";

/** The figure above its cloak, 7 pixels across: cowl (0), its shadowed
 * inside (1), its lit rim (2) and the eyes (e). */
const HOOD = [
  "..000..",
  ".02220.",
  "0211120",
  "01e1e10",
  "0111110",
];
/** The cloak's rows below the hood, and how wide it flares by its hem. */
const CLOAK_ROWS = 9;

/** One art pixel at board point (x, y) cells. */
function dot(c: Ctx, px: number, pix: number, x: number, y: number) {
  c.fillRect(Math.round((x * px) / pix) * pix, Math.round((y * px) / pix) * pix, pix, pix);
}

/** A shade at its spot: its cloak, the hood over it, then its knives. */
export function drawShade(c: Ctx, px: number, u: Soldier, sim: DefendSim) {
  const pix = Math.max(1, Math.round(px / ART)), a = 1 / ART;
  const struck = u.flash > 0, now = sim.time;
  const x0 = u.x - 3.5 * a, y0 = u.y - SHADE.size * 1.2;
  c.save();
  c.globalAlpha = struck ? 0.85 : 0.62;
  // The cloak, from the shoulders down: a bell flaring wider row by row,
  // its folds rippling, streaming off to one side, its hem cut into
  // tatters that lift and fall. Lit from the upper left.
  const stream = Math.sin(now * 1.7 + u.id) * 1.4;
  for (let j = 0; j < CLOAK_ROWS; j++) {
    const f = j / (CLOAK_ROWS - 1), half = 2 + f * 3.4 + Math.sin(now * 4.2 + j * 0.8 + u.id) * 0.7 * f;
    const mid = stream * f * f, left = Math.round(mid - half), right = Math.round(mid + half);
    for (let i = left; i <= right; i++) {
      const hem = j === CLOAK_ROWS - 1, side = i === left || i === right;
      if (hem && (i + Math.round(now * 6 + u.id)) % 3 === 0) continue;
      c.fillStyle = side || hem ? OUTLINE : struck ? CLOAK[2] : i - mid < -half * 0.35 && j < 6 ? CLOAK[2] : i - mid > half * 0.4 ? CLOAK[0] : CLOAK[1];
      dot(c, px, pix, u.x + (i - 0.5) * a, y0 + (4 + j) * a);
    }
  }
  // Tatters trailing off the hem.
  c.fillStyle = OUTLINE;
  for (let k = -2; k <= 2; k++) {
    const x = Math.round(stream + k * 1.6), drop = 1 + ((Math.round(now * 5) + k + u.id) & 1);
    for (let d = 0; d < drop; d++) dot(c, px, pix, u.x + (x - 0.5) * a + stream * d * 0.4 * a, y0 + (4 + CLOAK_ROWS + d) * a);
  }
  HOOD.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    c.fillStyle = ch === "e" ? EYES : ch === "0" ? OUTLINE : ch === "2" ? CLOAK[2] : struck ? CLOAK[2] : CLOAK[0];
    dot(c, px, pix, x0 + i * a, y0 + j * a);
  }));
  c.restore();
  // The knives circling it: those not out on a loop.
  const flying = sim.blades.filter((b) => b.shade === u.id).length;
  const n = Math.max(0, shadowStats(sim).knives - flying), r = SHADE.size * 1.7;
  for (let i = 0; i < n; i++) {
    const ang = now * 3.2 + (i * Math.PI * 2) / Math.max(1, shadowStats(sim).knives);
    const kx = u.x + Math.cos(ang) * r, ky = u.y - 0.1 + Math.sin(ang) * r * 0.75;
    knife(c, px, pix, kx, ky, -Math.sin(ang), Math.cos(ang) * 0.75);
  }
}

/** An acute triangle of steel at (x, y), its point leading along (dx, dy). */
function knife(c: Ctx, px: number, pix: number, x: number, y: number, dx: number, dy: number) {
  const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, a = 1 / ART;
  // Its dark back edge, the blade's body, then the bright point.
  c.fillStyle = OUTLINE;
  dot(c, px, pix, x - ux * a - uy * a, y - uy * a + ux * a);
  dot(c, px, pix, x - ux * a + uy * a, y - uy * a - ux * a);
  c.fillStyle = STEEL[0];
  dot(c, px, pix, x - ux * a, y - uy * a);
  c.fillStyle = STEEL[1];
  dot(c, px, pix, x, y);
  c.fillStyle = STEEL[2];
  dot(c, px, pix, x + ux * a, y + uy * a);
  dot(c, px, pix, x + ux * a * 2, y + uy * a * 2);
}

/** Every knife out on its loop, with its trail of dark. */
export function drawBlades(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.blades.length) return;
  const pix = Math.max(1, Math.round(px / ART));
  c.save();
  for (const b of sim.blades) drawBlade(c, px, pix, b);
  c.restore();
}

function drawBlade(c: Ctx, px: number, pix: number, b: Blade) {
  const u = Math.min(1, b.t / b.life), steps = Math.max(6, Math.ceil((b.long * px) / pix / 3));
  // The trail: the last fifth of the loop behind the knife, thinning out.
  for (let i = steps; i >= 1; i--) {
    const back = u - (0.2 * i) / steps;
    if (back <= 0) continue;
    const p = loopAt(b, back);
    c.globalAlpha = 0.55 * (1 - i / steps);
    c.fillStyle = i < 2 ? STEEL[1] : TRAIL;
    dot(c, px, pix, p.x, p.y);
  }
  c.globalAlpha = 1;
  const head = loopAt(b, u), ahead = loopAt(b, Math.min(1, u + 0.02));
  knife(c, px, pix, head.x, head.y, ahead.x - head.x || b.ax, ahead.y - head.y || b.ay);
}
