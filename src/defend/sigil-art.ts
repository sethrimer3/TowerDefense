/** The Sigil tower as it is drawn, as pixel art at `ART` pixels a cell.
 * The sim says how charged each tower is (`sim.sigilTowers`) and where each
 * circle is drawing (`sim.sigils`); everything here is presentation, every
 * pixel hashed from the circle's seed or the tower's id.
 *
 * - **Charging:** the tower's roof glows faintly, more as it fills, and
 *   specks like tiny fireflies gather round its roof one by one, drifting
 *   and blinking (held still under Reduce Motion).
 * - **The circle:** a magic circle draws itself on the ground where the
 *   target stood: the outer ring traced round from the top, a second ring
 *   against it, an inner ring, a six-pointed star inside, then runes
 *   between the rings, a bright pen-point at the head of every stroke; the
 *   whole circle flares as it closes. Violet at first, ember gold once it
 *   carries fire, ice blue for ice-fire. Each pixel has a dark one beneath
 *   it, so the lines read like chalk cut into the ground. */
import { ART } from "./art-scale.ts";
import { artPen } from "./pixel-fx.ts";
import { hash01 } from "./grid.ts";
import { liftPx } from "./angle-view.ts";
import type { DefendSim } from "./sim.ts";
import { sigilRank, type Sigil } from "./sigils.ts";
import type { CarriedLight } from "./lighting.ts";
import type { ReliefLight } from "./ground-relief.ts";

type Ctx = CanvasRenderingContext2D;

/** Line colours by rank: violet; ember gold (I, II); ice blue (III). Each
 * is [line, lit line, pen-point]. */
const INK = [
  ["#7a5ad8", "#b8a2ff", "#ffffff"],
  ["#d0782c", "#ffc35a", "#fff4c8"],
  ["#d0782c", "#ffc35a", "#fff4c8"],
  ["#3c8ae0", "#9fe0ff", "#ffffff"],
];
const SHADOW = "#120c1c";
/** The charging glow and fireflies: violet and pale gold, or ice blue at III. */
const GLOW = ["#8a74d8", "#7a68c4"], FLY = ["#fff2a8", "#e8dcff"], ICE_FLY = ["#c8f0ff", "#ffffff"];

/** One pixel of a circle: where (art pixels from its middle), when in the
 * drawing it appears (0 to 1), and whether it is a lit one. */
type Px = { x: number; y: number; at: number; lit: boolean };
const shapes = new Map<string, Px[]>();

/** Rune glyphs, 3 × 3, one bit a pixel from the top left. */
const RUNES = [0b010111010, 0b101010101, 0b111001111, 0b100111001, 0b011010110, 0b110010011, 0b010101010, 0b111101111];

/** Every pixel of a circle of radius `R` art pixels, in drawing order. */
function circlePixels(R: number, seed: number): Px[] {
  const out: Px[] = [], seen = new Set<number>();
  const put = (x: number, y: number, at: number, lit = false) => {
    const key = (y + 512) * 1024 + x + 512;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ x, y, at, lit });
  };
  /** A ring of radius `r`, traced from the top over [a, a + span] of the drawing, one way or the other. */
  const ring = (r: number, a: number, span: number, dir: 1 | -1, lit = false) => {
    const steps = Math.max(16, Math.ceil(r * 8));
    for (let i = 0; i < steps; i++) {
      const f = i / steps, ang = -Math.PI / 2 + dir * f * Math.PI * 2;
      put(Math.round(Math.cos(ang) * r), Math.round(Math.sin(ang) * r), a + f * span, lit);
    }
  };
  /** A straight stroke from (x0, y0) to (x1, y1), over [a, a + span]. */
  const line = (x0: number, y0: number, x1: number, y1: number, a: number, span: number) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) put(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), a + (span * i) / n);
  };
  ring(R, 0, 0.32, 1, true);
  ring(R - 2, 0.12, 0.3, -1);
  const inner = Math.max(3, Math.round(R * 0.58));
  ring(inner, 0.34, 0.2, 1, true);
  // The six-pointed star: two triangles in the inner ring, stroke by stroke.
  const turn = hash01(seed, 1) < 0.5 ? 0 : Math.PI / 6;
  for (let t = 0; t < 2; t++)
    for (let s = 0; s < 3; s++) {
      const a0 = -Math.PI / 2 + turn + t * (Math.PI / 3) + (s * 2 * Math.PI) / 3, a1 = a0 + (2 * Math.PI) / 3;
      line(Math.cos(a0) * inner, Math.sin(a0) * inner, Math.cos(a1) * inner, Math.sin(a1) * inner, 0.52 + (t * 3 + s) * 0.05, 0.05);
    }
  // Runes round the band between the rings.
  const band = (R - 2 + inner) / 2, count = R >= 12 ? 8 : 6;
  if (R - 2 - inner >= 4)
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / count, cx = Math.round(Math.cos(ang) * band), cy = Math.round(Math.sin(ang) * band);
      const glyph = RUNES[Math.floor(hash01(seed, 2, i) * RUNES.length)];
      for (let k = 0; k < 9; k++) if (glyph & (1 << (8 - k))) put(cx - 1 + (k % 3), cy - 1 + Math.floor(k / 3), 0.82 + (i / count) * 0.14, true);
    }
  put(0, 0, 0.97, true);
  return out;
}

const circleOf = (R: number, seed: number) => {
  const key = `${R}:${seed & 7}`;
  let px = shapes.get(key);
  if (!px) {
    if (shapes.size > 64) shapes.clear();
    shapes.set(key, (px = circlePixels(R, seed & 7)));
  }
  return px;
};

/** Every magic circle drawing itself on the ground, on the sim's clock. */
export function drawSigils(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.sigils.length) return;
  const dot = artPen(c, px);
  c.save();
  for (const s of sim.sigils) drawSigil(c, dot, s);
  c.restore();
}

function drawSigil(c: Ctx, dot: ReturnType<typeof artPen>, s: Sigil) {
  const k = Math.min(1, s.t / s.draw), R = Math.max(5, Math.round(s.r * ART)), ink = INK[Math.min(3, s.rank)];
  const cx = Math.round(s.x * ART), cy = Math.round(s.y * ART), pixels = circleOf(R, s.seed);
  // The circle flares in its last moments, flickering on the sim's clock.
  const flare = k > 0.88 ? (k - 0.88) / 0.12 : 0, flicker = Math.floor(s.t * 20) & 1;
  c.globalAlpha = 0.45;
  c.fillStyle = SHADOW;
  for (const p of pixels) if (p.at <= k) dot(cx + p.x, cy + p.y + 1);
  c.globalAlpha = 0.85 + 0.15 * flare;
  for (const p of pixels) {
    if (p.at > k) continue;
    c.fillStyle = k - p.at < 0.035 ? ink[2] : p.lit || (flare > 0.5 && flicker) ? ink[1] : ink[0];
    dot(cx + p.x, cy + p.y);
  }
  // As it closes, a dithered wash fills the circle.
  if (flare > 0) {
    c.globalAlpha = 0.25 * flare;
    c.fillStyle = ink[1];
    const r2 = (R - 1) * (R - 1);
    for (let y = -R + 1; y < R; y++) for (let x = -R + 1; x < R; x++) if (((x + y + flicker) & 1) === 0 && x * x + y * y < r2) dot(cx + x, cy + y);
  }
  c.globalAlpha = 1;
}

/** Charging Sigil towers: a faint glow over the roof and fireflies
 * gathering round it, on wall time. */
export function drawSigilCharge(c: Ctx, px: number, sim: DefendSim, now: number, reduceMotion: boolean) {
  let dot: ReturnType<typeof artPen> | undefined;
  const t = reduceMotion ? 0 : now / 1000;
  for (const b of sim.map.buildings) {
    if (b.kind !== "sigilTower" || !sim.intact(b)) continue;
    const q = sim.sigilTowers.charged(b.id);
    if (q <= 0) continue;
    dot ??= artPen(c, px);
    c.save();
    const lift = (liftPx(b, px) / px) * ART;
    const cx = Math.round((b.rect.x + b.rect.w / 2) * ART), cy = Math.round((b.rect.y + b.rect.h / 2) * ART - lift);
    const R = Math.round(Math.min(b.rect.w, b.rect.h) * ART * 0.32);
    const ice = sigilRank(sim, b) >= 3;
    // The roof's glow: a dithered disc, faint, filling in as it charges.
    c.globalAlpha = 0.18 + 0.4 * q;
    c.fillStyle = ice ? "#7ab8f0" : GLOW[0];
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (((x + y) & 1) === 0 && x * x + y * y <= R * R && hash01(b.id, 3, x, y) < q * 0.9 + 0.1) dot(cx + x, cy + y);
    // Fireflies: one more for every sixteenth of the charge, each drifting on
    // its own slow loop round the roof and blinking.
    const flies = Math.floor(q * 16), colors = ice ? ICE_FLY : FLY;
    for (let i = 0; i < flies; i++) {
      const h1 = hash01(b.id, 4, i), h2 = hash01(b.id, 5, i), h3 = hash01(b.id, 6, i);
      const a = h1 * Math.PI * 2 + t * (0.4 + h2 * 0.6) * (i % 2 ? 1 : -1), far = R * (0.9 + h3 * 1.3) + Math.sin(t * 1.7 + i) * 1.5;
      const x = Math.round(cx + Math.cos(a) * far), y = Math.round(cy + Math.sin(a) * far * 0.8 - 2 - Math.sin(t * 2.3 + h2 * 6) * 2);
      const blink = reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(t * (3 + h3 * 3) + h1 * 9);
      // A dim halo round each, then its bright speck.
      c.globalAlpha = (0.35 + 0.65 * blink) * 0.35;
      c.fillStyle = ice ? "#7ab8f0" : GLOW[0];
      dot(x - 1, y); dot(x + 1, y); dot(x, y - 1); dot(x, y + 1);
      c.globalAlpha = 0.35 + 0.65 * blink;
      c.fillStyle = colors[i % 2];
      dot(x, y);
    }
    c.restore();
  }
}

/** The light a charged tower and a drawing circle cast at night. */
export function sigilLights(sim: DefendSim): { carried: CarriedLight[]; relief: ReliefLight[] } {
  const carried: CarriedLight[] = [], relief: ReliefLight[] = [];
  for (const s of sim.sigils) {
    const k = Math.min(1, s.t / s.draw), r = s.r + 1;
    carried.push({ x: s.x, y: s.y, id: s.tower * 10 + 5, r, k: 0.4 + 0.6 * k });
    relief.push({ x: s.x, y: s.y, r, k: 0.4 + 0.6 * k, color: s.rank >= 3 ? "#8fd0ff" : s.rank ? "#ffb36b" : "#b8a2ff" });
  }
  return { carried, relief };
}
