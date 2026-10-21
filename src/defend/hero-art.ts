/** The Hero and its sword combos as they are drawn, in the pixel art of the
 * city (sprites drawn up crisp, effects snapped to the art's pixel):
 *
 * - **The Hero:** a knight, 11 × 11 sprite pixels inside a black outline, lit
 *   from the upper left: a gold helm with a plume, a steel cuirass, and a
 *   cape thrown out either side in its hall's colours (royal red; storm
 *   blue for Whirlwind, black under a red plume for Blade dance, white and gold
 *   for Legend), its long cape (`hero-cape.ts`) streaming out behind it as
 *   it runs, rippling in the breeze and flung round it through a spin, cut
 *   swallowtail with a trimmed hem, folds lit from the upper left. Its longsword, a bright blade on a gold guard, points
 *   where it last struck and whirls right round it through a spin. While
 *   nothing can hurt it (an Undying Hero just risen) a gold halo shimmers.
 * - **A slash:** a crescent of steel light sweeping across the Hero's front
 *   from one side to the other (alternate slashes sweep back), white at its
 *   leading edge and thinning behind.
 * - **A spin:** a ring of blade light whirling right round it, its leading
 *   edge white-hot, trailing streaks and sparks flung outward.
 * - **A dash:** a silver streak from where it was to where it lands, with
 *   after-images of it strung along it.
 * - **Rising:** a pillar of gold light and a ring bursting out.
 *
 * The spins and risings light the streets round them (`heroLights`).
 * Presentation only: it reads the sim and never draws from a random
 * stream. */
import { HERO } from "./catalog.ts";
import { ART } from "./park-art.ts";
import type { CarriedLight } from "./lighting.ts";
import type { ReliefLight } from "./ground-relief.ts";
import type { DefendSim, Soldier } from "./sim.ts";
import { heroPaths, type Swing } from "./hero.ts";
import { CAPE_EDGE, capePixels, newCape, stepCape, type Cape } from "./hero-cape.ts";

type Ctx = CanvasRenderingContext2D;

const OUTLINE = "#120e0a";
const GOLD = ["#9a7428", "#e9c46a", "#fff4c8"];
const STEEL = ["#5a6478", "#c9d2e0", "#ffffff"];

/** The Hero, 11 × 11 sprite pixels: plume (P), helm (H gold, h lit),
 * visor (v), gold pauldrons (G), cape (C, c its shaded side), cuirass (A
 * lit, a shaded), gold belt (g) and boots (b). */
const HERO_ART = [
  "....000....",
  "...0PPP0...",
  "...0HhH0...",
  "..0HHhHH0..",
  "..0HvvvH0..",
  "0GGGAAAaGG0",
  "0CCAAgAacc0",
  "0CCAgggacc0",
  "0CC0AAa0cc0",
  ".0C0A0a0c0.",
  ".000b0b000.",
];
const W = HERO_ART[0].length;
const BODY: Record<string, string> = { "0": OUTLINE, H: GOLD[1], h: GOLD[2], G: "#c9a24e", v: "#1c1a22", A: "#dfe4ec", a: "#8e98ac", g: "#d2a640", b: "#4a3626" };
/** Each look's cape, its shaded side and plume. */
const CAPES: Record<string, [string, string, string]> = {
  "": ["#b8302e", "#7a1e1e", "#e8483e"],
  whirlwind: ["#3e64a8", "#26406e", "#9fd8f4"],
  bladeDance: ["#2a1c24", "#140e12", "#e04a3a"],
  legend: ["#f4f3f6", "#b8b9c8", "#e9c46a"],
};
type Look = { cape: string; mode: "plain" | "struck" | "ghost" };
const sprites = new Map<string, HTMLCanvasElement>();

function sprite({ cape, mode }: Look) {
  const key = `${cape}|${mode}`;
  let cv = sprites.get(key);
  if (cv) return cv;
  cv = document.createElement("canvas");
  cv.width = W;
  cv.height = HERO_ART.length;
  const c = cv.getContext("2d")!, [C, lining, plume] = CAPES[cape] ?? CAPES[""];
  HERO_ART.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === ".") return;
      let color = ch === "C" ? C : ch === "c" ? lining : ch === "P" ? plume : BODY[ch];
      // Struck: washed pale rather than white, so a hero in the thick of a
      // crowd still reads.
      if (mode === "struck" && ch !== "0") color = pale(color);
      // An after-image: the figure in pale steel, lightest where it is lit.
      if (mode === "ghost") color = ch === "0" ? STEEL[0] : "hAP".includes(ch) ? STEEL[2] : STEEL[1];
      c.fillStyle = color;
      c.fillRect(i, j, 1, 1);
    }),
  );
  sprites.set(key, cv);
  return cv;
}

/** Sprite pixels a cell. */
const scale = (px: number) => (px * HERO.size * 2) / W;
/** Which way each Hero's sword last pointed, as an angle. */
const facing = new WeakMap<object, number>();

/** The Hero's latest swing at its spot, if any is still showing. */
function latest(sim: DefendSim, u: Soldier): Swing | undefined {
  let best: Swing | undefined;
  for (const w of sim.swings) if ((w.kind === "slash" || w.kind === "spin") && Math.abs(w.x - u.x) < 0.01 && Math.abs(w.y - u.y) < 0.01 && (!best || w.t <= best.t)) best = w;
  return best;
}

/** A Hero at its spot: halo while guarded, the sword, then the figure. */
export function drawHero(c: Ctx, px: number, u: Soldier, sim: DefendSim) {
  const k = scale(px);
  const e = sim.enemies.find((o) => o.id === u.target);
  if (e) facing.set(u, Math.atan2(e.y - u.y, e.x - u.x));
  const w = latest(sim, u);
  let face = facing.get(u) ?? -Math.PI / 2;
  if (w?.kind === "slash") {
    // The blade sweeps across the slash's arc, then rests at its far end.
    const base = Math.atan2(w.fy, w.fx), p = Math.min(1, w.t / (w.life * 0.6));
    face = base + w.turn * (-1.1 + 2.2 * ease(p));
    facing.set(u, base + w.turn * 1.1);
  } else if (w?.kind === "spin") face += w.turn * Math.PI * 2 * ease(Math.min(1, w.t / (w.life * 0.7)));
  const p = heroPaths(sim, u.home), cape = p.legend ? "legend" : p.dance ? "bladeDance" : p.whirl ? "whirlwind" : "";
  if (u.guard) drawHalo(c, px, u, u.guard, sim.time);
  drawCape(c, k, u, sim, cape, w?.kind === "spin" && w.t < w.life * 0.7 ? w.turn : 0, u.flash > 0);
  // The sword behind the figure while held up, in front while it sweeps low.
  const behind = Math.sin(face) < 0;
  if (behind) drawSword(c, k, u.x * px, u.y * px, face);
  c.drawImage(sprite({ cape, mode: u.flash > 0 ? "struck" : "plain" }), u.x * px - (W / 2) * k, u.y * px - (HERO_ART.length / 2) * k, W * k, HERO_ART.length * k);
  if (!behind) drawSword(c, k, u.x * px, u.y * px, face);
}

// ── The cape ───────────────────────────────────────────────────────────────

type Flowing = { cape: Cape; canvas: HTMLCanvasElement };
const capes = new WeakMap<Soldier, Flowing>();

/** The Hero's cape, stepped to the battle's time and rasterized on the
 * sprite's own pixel grid: base, lit folds, shaded folds, the shaded
 * underside, the trimmed hem, inside a black outline. */
function drawCape(c: Ctx, k: number, u: Soldier, sim: DefendSim, look: string, spin: number, struck: boolean) {
  let f = capes.get(u);
  if (!f) capes.set(u, (f = { cape: newCape(u.x, u.y, sim.time, u.id * 1.7), canvas: document.createElement("canvas") }));
  const cape = stepCape(f.cape, u.x, u.y, sim.time, spin);
  const per = W / (HERO.size * 2), H = HERO_ART.length;
  const { x0, y0, w, h, tone } = capePixels(cape, u.x - W / 2 / per, u.y - (H / 2 - 0.5) / per, per, sim.time);
  const [base, shade, plume] = CAPES[look] ?? CAPES[""];
  const colors = [base, base, mix(base, "#ffffff", 0.3), shade, mix(shade, "#000000", 0.35), look ? plume : GOLD[1], OUTLINE].map((col, i) => rgb(struck && i !== CAPE_EDGE ? pale(col) : col));
  const cv = f.canvas;
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  const cc = cv.getContext("2d")!, img = cc.createImageData(w, h);
  for (let p = 0; p < tone.length; p++) {
    if (!tone[p]) continue;
    const [r, g, b] = colors[tone[p]];
    img.data[p * 4] = r;
    img.data[p * 4 + 1] = g;
    img.data[p * 4 + 2] = b;
    img.data[p * 4 + 3] = 255;
  }
  cc.putImageData(img, 0, 0);
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(cv, u.x * k * per - (W / 2) * k + x0 * k, u.y * k * per - (H / 2) * k + y0 * k, w * k, h * k);
  c.restore();
}

/** `a` mixed `t` of the way to `b`, as hex. */
function mix(a: string, b: string, t: number) {
  const [r, g, bl] = rgb(a), [r2, g2, b2] = rgb(b), m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${((1 << 24) | (m(r, r2) << 16) | (m(g, g2) << 8) | m(bl, b2)).toString(16).slice(1)}`;
}

/** A colour as red, green and blue, from hex or `rgb(...)`. */
function rgb(col: string): [number, number, number] {
  if (col.startsWith("rgb")) {
    const [r, g, b] = col.slice(4, -1).split(",").map(Number);
    return [r, g, b];
  }
  const n = parseInt(col.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** `hex` two thirds of the way to white. */
function pale(hex: string) {
  const n = parseInt(hex.slice(1), 16), up = (v: number) => Math.round(v + (255 - v) * 0.67);
  return `rgb(${up(n >> 16)},${up((n >> 8) & 255)},${up(n & 255)})`;
}

const ease = (t: number) => 1 - (1 - t) * (1 - t);

/** The longsword: an outlined silver blade on a gold guard and grip, from
 * the Hero's hand out along `face`, drawn in sprite-sized pixel steps. */
function drawSword(c: Ctx, k: number, x: number, y: number, face: number) {
  const ux = Math.cos(face), uy = Math.sin(face);
  const step = Math.max(1, Math.round(k));
  const at = (t: number) => [Math.round(x + ux * t * k), Math.round(y + 0.6 * k + uy * t * k)];
  for (let t = 1; t <= 10; t++) {
    const [sx, sy] = at(t);
    c.fillStyle = OUTLINE;
    c.fillRect(sx - step, sy - step, step * 2, step * 2);
  }
  // The guard, across the blade.
  for (const side of [-1, 1]) {
    const [gx, gy] = at(3);
    c.fillStyle = OUTLINE;
    c.fillRect(Math.round(gx - uy * side * 1.6 * k) - step, Math.round(gy + ux * side * 1.6 * k) - step, step * 2, step * 2);
    c.fillStyle = GOLD[1];
    c.fillRect(Math.round(gx - uy * side * 1.6 * k) - step / 2, Math.round(gy + ux * side * 1.6 * k) - step / 2, step, step);
  }
  for (let t = 1; t <= 10; t++) {
    const [sx, sy] = at(t);
    c.fillStyle = t <= 2 ? "#6a4a2a" : t === 3 ? GOLD[1] : t >= 9 ? STEEL[2] : STEEL[1];
    c.fillRect(sx - step / 2, sy - step / 2, step, step);
  }
}

/** A shimmering gold ring while nothing can hurt it, fading as it runs out. */
function drawHalo(c: Ctx, px: number, u: Soldier, left: number, now: number) {
  c.save();
  c.globalAlpha = Math.min(1, left * 2) * (0.55 + 0.25 * Math.sin(now * 24 + u.id));
  c.strokeStyle = GOLD[1];
  c.lineWidth = Math.max(1, px * 0.08);
  c.beginPath();
  c.arc(u.x * px, u.y * px, px * HERO.size * 1.3, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

// ── The swings ─────────────────────────────────────────────────────────────

/** Every swing still showing: slashes, spins, dashes and risings. */
export function drawSwings(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.swings.length) return;
  const pix = Math.max(1, Math.round(px / ART));
  c.save();
  for (const w of sim.swings) {
    if (w.kind === "slash") drawSlash(c, px, pix, w);
    else if (w.kind === "spin") drawSpin(c, px, pix, w);
    else if (w.kind === "dash") drawDash(c, px, pix, w);
    else drawRise(c, px, pix, w);
  }
  c.restore();
}

/** One art pixel at board point (x, y) cells. */
function dot(c: Ctx, px: number, pix: number, x: number, y: number, size = 1) {
  c.fillRect(Math.round((x * px) / pix) * pix - ((size - 1) * pix) / 2, Math.round((y * px) / pix) * pix - ((size - 1) * pix) / 2, pix * size, pix * size);
}

/** Pixels along the arc about (x, y) at radius `r` cells from angle `a0` to `a1`. */
function arc(c: Ctx, px: number, pix: number, x: number, y: number, r: number, a0: number, a1: number, size = 1) {
  const steps = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r * px) / pix));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    dot(c, px, pix, x + Math.cos(a) * r, y + Math.sin(a) * r, size);
  }
}

/** A crescent swept across the Hero's front: drawn from where the blade
 * began to where it has reached, the old end thinning first. */
function drawSlash(c: Ctx, px: number, pix: number, w: Swing) {
  const life = w.t / w.life, fade = 1 - life, base = Math.atan2(w.fy, w.fx);
  const reach = ease(Math.min(1, life / 0.6)), span = 1.1;
  const a0 = base - w.turn * span, lead = a0 + w.turn * 2 * span * reach;
  const tail = a0 + w.turn * 2 * span * Math.max(0, (life - 0.25) / 0.75);
  const from = Math.min(tail, lead), to = Math.max(tail, lead);
  for (const [rr, color, alpha] of [[0.55, STEEL[1], 0.45], [0.75, STEEL[1], 0.8], [0.95, STEEL[2], 1], [1.1, "#9fe3ff", 0.4]] as const) {
    c.globalAlpha = alpha * fade;
    c.fillStyle = color;
    arc(c, px, pix, w.x, w.y, w.r * rr, from, to, rr === 0.95 ? 2 : 1);
  }
  // The blade's edge flaring where it has reached.
  c.globalAlpha = fade;
  c.fillStyle = "#fff";
  dot(c, px, pix, w.x + Math.cos(lead) * w.r * 0.95, w.y + Math.sin(lead) * w.r * 0.95, 3);
}

/** A whirl of blade light right round the Hero, its trail spanning most of
 * the circle, streaks and sparks flung out past it. */
function drawSpin(c: Ctx, px: number, pix: number, w: Swing) {
  const life = w.t / w.life, fade = 1 - life;
  const lead = -Math.PI / 2 + w.turn * Math.PI * 2 * ease(Math.min(1, life / 0.7));
  const r = w.r * (0.75 + 0.25 * ease(life));
  for (let n = 0; n < 3; n++) {
    const rr = r * (0.6 + 0.2 * n), trail = Math.PI * (1.2 + 0.3 * n);
    c.globalAlpha = (0.35 + 0.25 * n) * fade;
    c.fillStyle = n === 2 ? STEEL[2] : STEEL[1];
    arc(c, px, pix, w.x, w.y, rr, lead - w.turn * trail, lead, n === 2 ? 2 : 1);
  }
  // A faint disc of wind inside, and the leading edge white-hot.
  c.globalAlpha = 0.12 * fade;
  c.fillStyle = "#cfe8ff";
  c.beginPath();
  c.arc(w.x * px, w.y * px, r * px, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = fade;
  c.fillStyle = "#fff";
  for (let i = 0; i < 4; i++) dot(c, px, pix, w.x + Math.cos(lead) * r * (0.55 + i * 0.15), w.y + Math.sin(lead) * r * (0.55 + i * 0.15), 2);
  // Sparks flung out past the ring, at fixed bearings.
  c.fillStyle = GOLD[2];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + w.x * 3, d = r * (1 + 0.5 * life);
    dot(c, px, pix, w.x + Math.cos(a) * d, w.y + Math.sin(a) * d);
  }
}

/** A silver streak along the dash, after-images of the Hero strung along it. */
function drawDash(c: Ctx, px: number, pix: number, w: Swing) {
  const life = w.t / w.life, fade = 1 - life;
  const steps = Math.max(1, Math.ceil((w.r * px) / pix));
  for (const [off, color, alpha] of [[0, STEEL[2], 1], [0.14, STEEL[1], 0.6], [-0.14, STEEL[1], 0.6]] as const) {
    c.globalAlpha = alpha * fade;
    c.fillStyle = color;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      // The streak thins toward where it started and burns out from there.
      if (f < life) continue;
      dot(c, px, pix, w.x + (w.x1 - w.x) * f - w.fy * off, w.y + (w.y1 - w.y) * f + w.fx * off);
    }
  }
  const k = scale(px), ghost = sprite({ cape: "", mode: "ghost" });
  for (let n = 1; n <= 3; n++) {
    const f = n / 4;
    c.globalAlpha = Math.max(0, fade * (0.15 + 0.4 * f) - life * 0.3);
    c.drawImage(ghost, (w.x + (w.x1 - w.x) * f) * px - (W / 2) * k, (w.y + (w.y1 - w.y) * f) * px - (HERO_ART.length / 2) * k, W * k, HERO_ART.length * k);
  }
}

/** A pillar of gold light where an Undying Hero rises, and a ring bursting out. */
function drawRise(c: Ctx, px: number, pix: number, w: Swing) {
  const life = w.t / w.life, fade = 1 - life;
  c.globalAlpha = 0.5 * fade;
  c.fillStyle = GOLD[1];
  const half = Math.round((px * 0.35 * fade) / pix) * pix + pix;
  c.fillRect(Math.round(w.x * px) - half, Math.round((w.y - 3) * px), half * 2, Math.round(3 * px));
  c.globalAlpha = fade;
  c.fillStyle = GOLD[2];
  c.fillRect(Math.round(w.x * px) - pix, Math.round((w.y - 3) * px), pix * 2, Math.round(3 * px));
  c.fillStyle = GOLD[1];
  arc(c, px, pix, w.x, w.y, w.r * (0.3 + life * 1.4), 0, Math.PI * 2, 2);
}

/** Spins and risings light the streets round them as they fade. */
export function heroLights(sim: DefendSim): { carried: CarriedLight[]; relief: ReliefLight[] } {
  const carried: CarriedLight[] = [], relief: ReliefLight[] = [];
  for (const w of sim.swings) {
    if (w.kind !== "spin" && w.kind !== "rise") continue;
    const k = 1 - w.t / w.life;
    carried.push({ x: w.x, y: w.y, id: Math.floor(w.x * 131 + w.y * 17), r: w.r + 1, k: (w.kind === "rise" ? 1.3 : 0.7) * k });
    relief.push({ x: w.x, y: w.y, r: w.r + 1.2, k: 0.6 * k, color: w.kind === "rise" ? "#ffe08a" : "#cfe8ff" });
  }
  return { carried, relief };
}
