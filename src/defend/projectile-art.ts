/** The battle's plain projectiles as pixel art at `ART` pixels a cell inside
 * the city's black outline, like the wizard's fire and the blasts:
 *
 * - **Arrows** (archers and archer towers): an iron head, an ash shaft and
 *   red-and-white fletching, baked once per one of `ARROW_DIRS` headings
 *   and drawn on the art lattice where the sim says each flies.
 * - **Cannon shells:** an outlined iron ball with a glint, lifted along its
 *   arc over a dithered shadow on the ground, trailing three puffs of smoke.
 * - **Dragon breath:** the fire a dragon pours down at the city, puffs of
 *   the shared flame palette all inside one black outline.
 * - **Sparks:** a hit's chips, single art pixels flung out and cooling.
 *
 * All of it is presentation: it reads the sim and never changes it, and
 * draws no random numbers (the breath's spread hashes the dragon's id). */
import { hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { artPen, bake, blit, FLAME, OUTLINE, puff, SMOKE } from "./pixel-fx.ts";
import type { DefendSim, Effect, Enemy } from "./sim.ts";

type Ctx = CanvasRenderingContext2D;

/** Headings an arrow is baked at. */
export const ARROW_DIRS = 16;
/** An arrow sprite's side, in art pixels: the drawn 7 × 7 and its outline. */
const ARROW_BOX = 9;
/** How far behind its head (the sim's point) an arrow's middle is drawn, in
 * cells. */
const ARROW_BACK = 0.4;

/** The arrow drawn by hand at the first three headings (right, then a
 * sixteenth and an eighth of a turn clockwise); the rest are these turned
 * and mirrored. H/h head, S/s shaft, F/R fletching. */
const ARROW_ART = [
  [".......", ".......", "FR...h.", "sSSSShH", "FR...h.", ".......", "......."],
  [".......", ".......", "RF.....", "FsS....", "...SSh.", ".....hH", "......."],
  [".......", ".RF....", ".Fs....", "...S...", "....Sh.", "....hH.", "......."],
];

/** How many puffs make a dragon's breath, and how far it reaches, in cells. */
const BREATH_PUFFS = 18;
const BREATH_REACH = 4.6;

const C = {
  head: "#d9dde2",
  headLo: "#8a9099",
  shaft: "#c79a5e",
  shaftLo: "#8c6236",
  fletch: "#f2ead2",
  fletchRed: "#c23a2a",
  iron: "#2c2a2e",
  ironLo: "#1b1a1d",
  ironHi: "#8c8c96",
  shadow: "rgba(12,8,6,0.4)",
};

/** The heading nearest a direction, 0 pointing right, turning clockwise. */
export function arrowDir(dx: number, dy: number) {
  const a = Math.atan2(dy, dx);
  return ((Math.round((a / (Math.PI * 2)) * ARROW_DIRS) % ARROW_DIRS) + ARROW_DIRS) % ARROW_DIRS;
}

/** One arrow's pixels at heading `dir`: a `ARROW_BOX`² grid of palette
 * colours, outline included ("" where clear). Pure, for tests. */
export function arrowPixels(dir: number): string[] {
  const n = ARROW_BOX;
  const key: Record<string, string> = { H: C.head, h: C.headLo, S: C.shaft, s: C.shaftLo, F: C.fletch, R: C.fletchRed };
  // Which hand-drawn heading, and how to turn its (x, y) into this one's.
  let base = dir, turn = (x: number, y: number) => [x, y];
  if (dir > 8) {
    const up = arrowTurn(16 - dir);
    base = up.base;
    turn = (x, y) => { const [tx, ty] = up.turn(x, y); return [tx, 6 - ty]; };
  } else ({ base, turn } = arrowTurn(dir));
  const px: string[] = new Array(n * n).fill("");
  const art = ARROW_ART[base];
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const ch = art[y][x];
      if (ch === ".") continue;
      const [tx, ty] = turn(x, y);
      px[(ty + 1) * n + tx + 1] = key[ch];
    }
  return outlined(px, n, n);
}

/** Headings 0 to 8 from the three drawn ones: past an eighth of a turn the
 * drawing is transposed (mirrored in the diagonal), past a quarter also
 * mirrored left to right. */
function arrowTurn(dir: number): { base: number; turn: (x: number, y: number) => number[] } {
  if (dir <= 2) return { base: dir, turn: (x, y) => [x, y] };
  if (dir <= 4) return { base: 4 - dir, turn: (x, y) => [y, x] };
  const r = arrowTurn(8 - dir);
  return { base: r.base, turn: (x, y) => { const [tx, ty] = r.turn(x, y); return [6 - tx, ty]; } };
}

/** Rings every coloured pixel's four neighbours that are clear in the
 * outline colour. */
function outlined(px: string[], w: number, h: number) {
  const out = px.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (px[y * w + x]) continue;
      const near = (x > 0 && px[y * w + x - 1]) || (x < w - 1 && px[y * w + x + 1]) || (y > 0 && px[(y - 1) * w + x]) || (y < h - 1 && px[(y + 1) * w + x]);
      if (near) out[y * w + x] = OUTLINE;
    }
  return out;
}

function paint(px: string[], w: number, h: number) {
  const { cv, c } = bake(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const color = px[y * w + x];
      if (!color) continue;
      c.fillStyle = color;
      c.fillRect(x, y, 1, 1);
    }
  return cv;
}

const arrowSprites: HTMLCanvasElement[] = [];
function arrowSprite(dir: number) {
  return (arrowSprites[dir] ??= paint(arrowPixels(dir), ARROW_BOX, ARROW_BOX));
}

/** Arrows in flight, pointing where they fly (from where they were loosed
 * once they reach the target). */
export function drawArrows(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.arrows.length) return;
  c.imageSmoothingEnabled = false;
  for (const a of sim.arrows) {
    let dx = a.tx - a.x, dy = a.ty - a.y;
    if (dx * dx + dy * dy < 1e-4 && a.origin) (dx = a.x - a.origin.x), (dy = a.y - a.origin.y);
    const d = Math.hypot(dx, dy) || 1;
    const dir = arrowDir(dx, dy);
    const mx = a.x - (dx / d) * ARROW_BACK, my = a.y - (dy / d) * ARROW_BACK;
    blit(c, px, arrowSprite(dir), Math.round(mx * ART - ARROW_BOX / 2), Math.round(my * ART - ARROW_BOX / 2));
  }
}

/** A cannon ball's pixels: an iron disc `d` art pixels across in its
 * outline, lit from the upper left. Pure, for tests. */
export function ballPixels(d: number): { px: string[]; size: number } {
  const size = d + 2, mid = (size - 1) / 2, r = d / 2;
  const px: string[] = new Array(size * size).fill("");
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const ox = x - mid, oy = y - mid;
      if (ox * ox + oy * oy > r * r) continue;
      const glint = Math.round(ox + r * 0.45) === 0 && Math.round(oy + r * 0.45) === 0;
      px[y * size + x] = glint ? C.ironHi : ox + oy > r * 0.6 ? C.ironLo : C.iron;
    }
  return { px: outlined(px, size, size), size };
}

/** Its dithered shadow: an ellipse, every other pixel at the rim. */
function shadowPixels(d: number) {
  const w = d + 2, h = Math.ceil(d / 2) + 2;
  const px: string[] = new Array(w * h).fill("");
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ox = (x - (w - 1) / 2) / (w / 2), oy = (y - (h - 1) / 2) / (h / 2);
      const q = ox * ox + oy * oy;
      if (q <= 0.55 || (q <= 1 && (x + y) % 2 === 0)) px[y * w + x] = C.shadow;
    }
  return { px, w, h };
}

const balls = new Map<number, { cv: HTMLCanvasElement; size: number; shadow: HTMLCanvasElement; sw: number; sh: number }>();
function ballSprite(d: number) {
  let s = balls.get(d);
  if (!s) {
    const b = ballPixels(d), sh = shadowPixels(d);
    s = { cv: paint(b.px, b.size, b.size), size: b.size, shadow: paint(sh.px, sh.w, sh.h), sw: sh.w, sh: sh.h };
    balls.set(d, s);
  }
  return s;
}

/** Where a shell is a fraction `k` of its flight: on the ground (gx, gy)
 * and lifted (lift cells up) on its arc. */
function shellAt(sh: DefendSim["shells"][number], k: number) {
  const gx = sh.x0 + (sh.x1 - sh.x0) * k, gy = sh.y0 + (sh.y1 - sh.y0) * k;
  const lift = Math.sin(Math.PI * k) * (0.8 + Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0) * 0.12);
  return { gx, gy, lift };
}

/** Cannon shells: an iron ball arcing over its shadow, trailing smoke. */
export function drawShells(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.shells.length) return;
  c.imageSmoothingEnabled = false;
  const dot = artPen(c, px);
  for (const sh of sim.shells) {
    const k = sh.t / sh.dur;
    const { gx, gy, lift } = shellAt(sh, k);
    const ball = ballSprite(sh.r > 2.1 ? 5 : 4);
    blit(c, px, ball.shadow, Math.round(gx * ART - ball.sw / 2), Math.round(gy * ART - ball.sh / 2));
    for (let n = 3; n >= 1; n--) {
      const t = shellAt(sh, Math.max(0, k - n * 0.07));
      const s = n < 3 ? 2 : 1;
      c.fillStyle = SMOKE[3];
      c.globalAlpha = 0.8 - n * 0.2;
      dot(Math.round(t.gx * ART - s / 2), Math.round((t.gy - t.lift) * ART - s / 2), s, s);
    }
    c.globalAlpha = 1;
    blit(c, px, ball.cv, Math.round(gx * ART - ball.size / 2), Math.round((gy - lift) * ART - ball.size / 2));
  }
}

/** A dragon's breath, drawn like the wizard tower's fire: puffs poured
 * along `breath`'s aim, white hot at the jaws, turning yellow, orange and
 * red as they spread, then smoke at the far end, all inside one black
 * outline, with embers flicking off; fading in as it starts. */
export function drawBreath(c: Ctx, px: number, e: Enemy, time: number) {
  if (!e.breath) return;
  const { dx, dy, t } = e.breath;
  const dot = artPen(c, px);
  const flick = Math.floor(time * 15);
  const puffs: { x: number; y: number; r: number; tone: number }[] = [];
  const embers: { x: number; y: number; tone: number }[] = [];
  for (let n = 0; n < BREATH_PUFFS; n++) {
    // Each puff slides out along the jet as the flicker turns over.
    const along = ((n + (time * 15 - flick)) / BREATH_PUFFS) * BREATH_REACH + 0.3;
    const k = along / BREATH_REACH;
    const spread = (hash01(e.id, n, flick) - 0.5) * (0.2 + k * 1.3);
    const x = e.x + dx * along - dy * spread, y = e.y + dy * along + dx * spread;
    const tone = k < 0.12 ? 4 : k < 0.3 ? 3 : k < 0.55 ? 2 : k < 0.8 ? 1 : 0;
    puffs.push({ x: Math.round(x * ART), y: Math.round(y * ART), r: Math.round(1 + k * 2.4 + hash01(e.id, n, flick, 1)), tone });
    if (hash01(e.id, n, flick, 2) < 0.3)
      embers.push({ x: Math.round((x + (hash01(e.id, n, 3) - 0.5) * 0.9) * ART), y: Math.round((y - k * 0.4) * ART), tone: k < 0.5 ? 4 : 3 });
  }
  c.save();
  c.globalAlpha = Math.min(1, t / 0.2);
  c.fillStyle = OUTLINE;
  for (const p of puffs) puff(dot, p.x, p.y, p.r + 1);
  // Coolest first, so the white-hot core shows through.
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    c.fillStyle = FLAME[p.tone];
    puff(dot, p.x, p.y, p.r);
    if (p.tone < 4 && p.r > 0) {
      c.fillStyle = FLAME[p.tone + 1];
      dot(p.x - p.r + 1, p.y - p.r + 1, p.r, 1);
      dot(p.x - p.r + 1, p.y - p.r + 1, 1, p.r);
    }
  }
  for (const m of embers) {
    c.fillStyle = FLAME[m.tone];
    dot(m.x, m.y);
  }
  c.restore();
}

/** A hit's sparks: four art pixels flung out from the point, cooling from
 * white to ember as they fade. */
export function drawSparks(c: Ctx, px: number, fx: Effect) {
  const k = fx.t / 0.6;
  const dot = artPen(c, px);
  c.save();
  c.globalAlpha = Math.max(0, 1 - k);
  c.fillStyle = FLAME[Math.max(1, 4 - Math.floor(k * 4))];
  for (let n = 0; n < 4; n++) {
    const a = n * 1.57 + fx.x;
    dot(Math.round((fx.x + Math.cos(a) * k * 0.6) * ART), Math.round((fx.y + Math.sin(a) * k * 0.6 + k * k * 0.3) * ART));
  }
  c.restore();
}
