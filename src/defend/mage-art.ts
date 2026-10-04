/** The fire mages and their attack as they are drawn, in the pixel art of
 * the city (`ART` pixels a cell, snapped to whole screen pixels):
 *
 * - **Mages:** little red-robed figures in a pointed hat inside a black
 *   outline, lit from the upper left, a flame flickering in hand while the
 *   next fireball is ready.
 * - **Fireballs:** a ball of fire inside a dark rim, white-hot at its heart,
 *   arcing low over the street, trailing sparks that cool from yellow
 *   through orange and red to smoke, its shadow on the ground below. The
 *   burst is the battle's usual blast (`battle-art.ts`).
 * - **Burning ground:** where a fireball lands the ground is scorched in a
 *   dithered patch strewn with glowing embers, and tongues of pixel flame
 *   dance over it, rising and dying back in new spots, thinning out as the
 *   fire dies down. Each blaze lights the streets round it (`mageLights`).
 *
 * Presentation only: it reads the sim and draws from hashes of the battle's
 * time and each blaze's seed, never from a random stream. */
import { FIRE_MAGE } from "./catalog.ts";
import { hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import type { CarriedLight } from "./lighting.ts";
import type { ReliefLight } from "./ground-relief.ts";
import type { Blaze, Fireball } from "./mages.ts";
import type { DefendSim, Soldier } from "./sim.ts";

type Ctx = CanvasRenderingContext2D;

const OUTLINE = "#140c0a";
/** Flame, coolest to hottest. */
const FLAME = ["#7a1c10", "#c8452a", "#f08a34", "#f6c75a", "#fff4c8"];
/** Smoke over the fire. */
const SMOKE = "rgba(48,40,36,0.55)";

// ── Mages ──────────────────────────────────────────────────────────────────

/** The mage, 7 × 8 sprite pixels: outline, hat (lit, dark), face, robe
 * (lit, mid, shaded), a gold belt, and in the outstretched hand (the last
 * column) a flame: `f` its foot, `F` its body and `T` the hot tip. */
const MAGE = ["..00...", ".0Hh0..", "0HHhh0T", ".0ss0.F", "0RRrd0f", "0Rggd0.", "0RRrd0.", ".0000.."];
const MAGE_COLORS: Record<string, string> = {
  "0": OUTLINE, H: "#a8282a", h: "#6e1818", s: "#e8c49a", R: "#e8573f", r: "#c8372d", d: "#8e2620", g: "#e9c46a",
};
/** Sprites: plain, struck (white), and holding a flame low and high. */
type MageLook = "plain" | "struck" | "flame" | "blaze";
let mageSprites: Record<MageLook, HTMLCanvasElement> | null = null;

function mageSprite(look: MageLook) {
  mageSprites ??= { plain: paintMage("plain"), struck: paintMage("struck"), flame: paintMage("flame"), blaze: paintMage("blaze") };
  return mageSprites[look];
}

function paintMage(look: MageLook) {
  const cv = document.createElement("canvas");
  cv.width = 7;
  cv.height = MAGE.length;
  const c = cv.getContext("2d")!;
  MAGE.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === ".") return;
      let color = MAGE_COLORS[ch];
      if ("fFT".includes(ch)) {
        if (look === "plain" || look === "struck" || (ch === "T" && look === "flame")) return;
        color = ch === "f" ? FLAME[1] : ch === "F" ? FLAME[look === "blaze" ? 3 : 2] : FLAME[4];
      } else if (look === "struck" && ch !== "0") color = "#fff";
      c.fillStyle = color;
      c.fillRect(i, j, 1, 1);
    }),
  );
  return cv;
}

/** A fire mage at its spot, `now` seconds into the battle: the sprite drawn
 * up crisp (the board draws with smoothing off). */
export function drawMage(c: Ctx, px: number, u: Soldier, now: number) {
  const k = (px * FIRE_MAGE.size * 1.5) / 6;
  const ready = u.cd <= 0.4;
  const look: MageLook = u.flash > 0 ? "struck" : ready ? (flicker(now, u.id) > 0.5 ? "blaze" : "flame") : "plain";
  c.drawImage(mageSprite(look), u.x * px - 3 * k, u.y * px - 5 * k, 7 * k, MAGE.length * k);
}

/** 0 to 1, a quick unsteady flicker for flame `id`. */
function flicker(now: number, id: number) {
  return 0.5 + 0.3 * Math.sin(now * 19 + id * 2.3) + 0.2 * Math.sin(now * 31 + id * 5.1);
}

// ── Fireballs ──────────────────────────────────────────────────────────────

/** Where a fireball is `t` seconds into its flight: along the ground, and
 * how high it has risen (cells) in its low arc. */
function fireballAt(f: Fireball, t: number) {
  const k = Math.max(0, Math.min(1, t / f.dur));
  const gx = f.x0 + (f.x1 - f.x0) * k, gy = f.y0 + (f.y1 - f.y0) * k;
  return { gx, gy, lift: Math.sin(Math.PI * k) * (0.3 + f.dur * 0.6) };
}

/** Every fireball in flight: its shadow, its trail, then the ball. */
export function drawFireballs(c: Ctx, px: number, sim: DefendSim) {
  const g = Math.max(1, Math.round(px / ART));
  const snap = (v: number) => Math.round((v * px) / g) * g;
  for (const f of sim.fireballs) {
    const id = Math.floor(f.x0 * 97 + f.y0 * 31 + f.x1 * 13);
    const { gx, gy, lift } = fireballAt(f, f.t);
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.fillRect(snap(gx) - g, snap(gy) - g / 2, g * 3, g * 2);
    // The trail: sparks shed along the flight, cooling as they fall behind.
    for (let i = 1; i <= 8; i++) {
      const back = f.t - i * 0.025;
      if (back < 0) break;
      const p = fireballAt(f, back);
      const tick = Math.floor((sim.time - back) * 40);
      const jx = (hash01(id, i, tick) - 0.5) * 0.25, jy = (hash01(id, i, tick, 1) - 0.5) * 0.25 - i * 0.02;
      c.fillStyle = i > 6 ? SMOKE : FLAME[Math.max(0, 3 - Math.floor(i / 2))];
      const s = i < 3 ? 2 * g : g;
      c.fillRect(snap(p.gx + jx), snap(p.gy - p.lift + jy), s, s);
    }
    // The ball: a dark rim (corners cut), orange body, a hot heart and a
    // glint at its upper left.
    const bx = snap(gx) - 2 * g, by = snap(gy - lift) - 2 * g;
    c.fillStyle = OUTLINE;
    c.fillRect(bx + g, by, 3 * g, 5 * g);
    c.fillRect(bx, by + g, 5 * g, 3 * g);
    c.fillStyle = FLAME[2];
    c.fillRect(bx + g, by + g, 3 * g, 3 * g);
    c.fillStyle = FLAME[3];
    c.fillRect(bx + g, by + g, 2 * g, 2 * g);
    c.fillStyle = FLAME[4];
    c.fillRect(bx + g, by + g, g, g);
    c.fillStyle = FLAME[1];
    c.fillRect(bx + 3 * g, by + 3 * g, g, g);
  }
}

// ── Burning ground ─────────────────────────────────────────────────────────

/** How strongly blaze `b` burns: catching over its first moments and dying
 * down over its last second. */
const strength = (b: Blaze) => Math.min(1, b.t / 0.2) * Math.min(1, (b.life - b.t) / 1.2);

/** Every patch of burning ground: the scorch and embers, then the flames. */
export function drawBlazes(c: Ctx, px: number, sim: DefendSim) {
  for (const b of sim.blazes) drawCachedScorch(c, px, b, sim.time);
  for (const b of sim.blazes) drawTongues(c, px, b, sim.time);
}

/** Scorch pixels change at eight Hz, with full brightness for most of a
 * blaze's life. Bake at the actual screen scale to preserve every rounded
 * pixel edge, including fractional scales. One recyclable sprite per blaze. */
const scorchSprites = new WeakMap<Blaze, { key: string; canvas: HTMLCanvasElement; x: number; y: number }>();
function drawCachedScorch(c: Ctx, px: number, b: Blaze, now: number) {
  const cx = Math.round(b.x * ART), cy = Math.round(b.y * ART), r = Math.ceil(b.r * ART);
  const key = `${px}:${cx}:${cy}:${b.r}:${b.seed}:${Math.floor(now * 8)}:${strength(b)}`;
  let sprite = scorchSprites.get(b);
  if (!sprite || sprite.key !== key) {
    const x = Math.round((cx - r) * px / ART), y = Math.round((cy - r) * px / ART);
    const w = Math.max(1, Math.round((cx + r + 1) * px / ART) - x);
    const h = Math.max(1, Math.round((cy + r + 1) * px / ART) - y);
    const canvas = sprite?.canvas ?? document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const off = canvas.getContext('2d', { willReadFrequently: true })!;
    off.translate(-x, -y);
    drawScorched(off, px, b, now);
    sprite = { key, canvas, x, y }; scorchSprites.set(b, sprite);
  }
  c.drawImage(sprite.canvas, sprite.x, sprite.y);
}

/** One art pixel at (ax, ay) (in `ART`ths of a cell), snapped to the screen. */
function dot(c: Ctx, px: number, ax: number, ay: number, w = 1, h = 1) {
  const x = Math.round((ax * px) / ART), y = Math.round((ay * px) / ART);
  c.fillRect(x, y, Math.round(((ax + w) * px) / ART) - x, Math.round(((ay + h) * px) / ART) - y);
}

/** The scorched patch, dithered thinner toward its ragged edge, with embers
 * glowing and dimming across it. */
function drawScorched(c: Ctx, px: number, b: Blaze, now: number) {
  const k = strength(b);
  const R = b.r * ART, cx = Math.round(b.x * ART), cy = Math.round(b.y * ART);
  const r = Math.ceil(R);
  const pulse = Math.floor(now * 8);
  for (let ay = -r; ay <= r; ay++)
    for (let ax = -r; ax <= r; ax++) {
      const d = Math.sqrt(ax * ax + ay * ay * 1.2) / R;
      const edge = d + (hash01(b.seed, ax, ay, 1) - 0.5) * 0.35;
      if (edge > 1) continue;
      const h = hash01(b.seed, ax, ay);
      if (h < 0.08 * (1 - d) + 0.03 && edge < 0.8) {
        // An ember: bright while the fire is high, flaring now and then.
        const flare = hash01(b.seed, ax, ay, pulse) < 0.3;
        c.fillStyle = k > 0.5 ? FLAME[flare ? 3 : 2] : FLAME[flare ? 2 : 1];
        c.globalAlpha = Math.max(0.35, k);
      } else if (h < 0.75 - edge * 0.45) {
        c.fillStyle = edge < 0.55 ? "#1a0f0a" : "#2e2018";
        c.globalAlpha = 0.65 * Math.max(0.3, k);
      } else continue;
      dot(c, px, cx + ax, cy + ay);
    }
  c.globalAlpha = 1;
}

/** Tongues of flame over the patch, each rising and dying back over its
 * own short cycle and springing up somewhere new for the next, with a puff
 * of smoke over the tallest. Fewer burn as the fire dies down. */
function drawTongues(c: Ctx, px: number, b: Blaze, now: number) {
  const k = strength(b);
  const n = Math.round((8 + b.r * 10) * k);
  const R = b.r * ART * 0.8;
  for (let i = 0; i < n; i++) {
    const rate = 1.6 + hash01(b.seed, i, 7) * 1.4;
    const phase = now * rate + hash01(b.seed, i, 8);
    const cycle = Math.floor(phase), u = phase - cycle;
    const a = hash01(b.seed, i, cycle, 9) * Math.PI * 2, rr = Math.sqrt(hash01(b.seed, i, cycle, 10)) * R;
    const ax = Math.round(b.x * ART + Math.cos(a) * rr), ay = Math.round(b.y * ART + Math.sin(a) * rr * 0.85);
    // It shoots up, holds, then sinks back.
    const grow = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7;
    const tall = Math.round((3 + hash01(b.seed, i, cycle, 11) * 5 * (1 - (rr / (R + 1)) * 0.5)) * grow * (0.5 + 0.5 * k));
    if (tall < 1) continue;
    const wide = tall >= 4 ? 2 : 1;
    // A dark foot, then the flame cooling toward its tip.
    c.fillStyle = FLAME[0];
    dot(c, px, ax - (wide === 2 ? 1 : 0), ay, wide + 1, 1);
    for (let h = 1; h <= tall; h++) {
      const heat = 1 - h / (tall + 1);
      c.fillStyle = FLAME[h === 1 ? 1 : heat > 0.6 ? 3 : heat > 0.3 ? 2 : 1];
      const w = h > tall - 1 ? 1 : wide;
      // The tip licks to one side as it sways.
      const sway = h === tall && tall > 2 ? (Math.sin(now * 9 + i) > 0 ? 1 : 0) : 0;
      dot(c, px, ax + sway - (w === 2 ? 1 : 0), ay - h, w, 1);
    }
    if (tall >= 4) {
      c.fillStyle = FLAME[4];
      dot(c, px, ax, ay - 2);
    }
    if (tall >= 3 && u > 0.5) {
      c.fillStyle = SMOKE;
      dot(c, px, ax + (hash01(b.seed, i, cycle, 12) < 0.5 ? -1 : 1), ay - tall - 1 - Math.round((u - 0.5) * 6));
    }
  }
}

// ── Light ──────────────────────────────────────────────────────────────────

/** The light the fireballs and the burning ground throw: carried through the
 * battle's lighting, and on the flagstones' relief. */
export function mageLights(sim: DefendSim): { carried: CarriedLight[]; relief: ReliefLight[] } {
  const carried: CarriedLight[] = [], relief: ReliefLight[] = [];
  for (const b of sim.blazes) {
    const k = strength(b);
    if (k <= 0) continue;
    carried.push({ x: b.x, y: b.y, id: b.seed % 100000, r: 1.4 + b.r * 2, k: 1.1 * k });
    relief.push({ x: b.x, y: b.y, r: 1.6 + b.r * 2.2, k: 0.9 * k, color: "#ff9a4a" });
  }
  for (const f of sim.fireballs) {
    const { gx, gy } = fireballAt(f, f.t);
    carried.push({ x: gx, y: gy, id: Math.floor(f.x0 * 97 + f.y0 * 31), r: 2.2, k: 1 });
    relief.push({ x: gx, y: gy, r: 2.6, k: 0.9, color: "#ffb36b" });
  }
  return { carried, relief };
}
