/** The valkyries and their charge stab as they are drawn, in the pixel art
 * of the city (sprites drawn up crisp, effects snapped to the art's pixel):
 *
 * - **Valkyries:** armoured angels, 11 × 9 sprite pixels inside a black
 *   outline, lit from the upper left: white wings spread either side of a
 *   steel cuirass, a winged gold helm, and a golden spear held toward
 *   whatever she last went for. While nothing can hurt her (just after a
 *   charge) a gold halo shimmers round her.
 * - **The charge stab:** she blinks along the line, so where she was and
 *   where she lands are joined by a blazing gold streak, white-hot at its
 *   core, narrowing as it fades, with speed lines either side, gold
 *   after-images of her strung along it, a star flaring at the spear's
 *   tip, a ring bursting out where she lands and a spark on every enemy it
 *   ran through. The streak lights the streets round it (`stabLights`).
 *
 * Presentation only: it reads the sim and never draws from a random
 * stream. */
import { VALKYRIE } from "./catalog.ts";
import { ART } from "./park-art.ts";
import type { CarriedLight } from "./lighting.ts";
import type { ReliefLight } from "./ground-relief.ts";
import type { DefendSim, Soldier } from "./sim.ts";
import type { Stab } from "./valkyries.ts";

type Ctx = CanvasRenderingContext2D;

const OUTLINE = "#120e0a";
const GOLD = ["#9a7428", "#e9c46a", "#fff4c8"];

// ── Valkyries ──────────────────────────────────────────────────────────────

/** The valkyrie, 11 × 9 sprite pixels: wings (W lit, w shaded), the helm
 * (H gold, h its crest), face (s), cuirass (A lit, a shaded), skirt of
 * gold scales (g) and boots (b). */
const VALK = [
  "0W0.0H0.0W0",
  "0WW0HhH0WW0",
  "0WWw0s0wWW0",
  ".0wwAAAaww0",
  "..00AAAa00.",
  "...0Aaa0...",
  "...0ggg0...",
  "...0g0g0...",
  "...0b0b0...",
];
const VALK_COLORS: Record<string, string> = {
  "0": OUTLINE, W: "#fbfaf4", w: "#c9cbd8", H: "#e9c46a", h: "#fff4c8", s: "#f0d2ae", A: "#e2e6ee", a: "#9aa2b4", g: "#d2a640", b: "#5a4632",
};
type ValkLook = "plain" | "struck" | "ghost";
let valkSprites: Record<ValkLook, HTMLCanvasElement> | null = null;

function valkSprite(look: ValkLook) {
  valkSprites ??= { plain: paintValk("plain"), struck: paintValk("struck"), ghost: paintValk("ghost") };
  return valkSprites[look];
}

function paintValk(look: ValkLook) {
  const cv = document.createElement("canvas");
  cv.width = 11;
  cv.height = VALK.length;
  const c = cv.getContext("2d")!;
  VALK.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === ".") return;
      let color = VALK_COLORS[ch];
      if (look === "struck" && ch !== "0") color = "#fff";
      // An after-image: the figure in gold, lightest where she is lit.
      if (look === "ghost") color = ch === "0" ? GOLD[0] : "Wwh".includes(ch) ? GOLD[2] : GOLD[1];
      c.fillStyle = color;
      c.fillRect(i, j, 1, 1);
    }),
  );
  return cv;
}

/** What the renderer remembers of each valkyrie: the way her spear points. */
const facing = new WeakMap<object, number>();

/** Sprite pixels a cell. */
const scale = (px: number) => (px * VALKYRIE.size * 1.9) / 9;

/** A valkyrie at her spot: halo while guarded, the spear, then the figure. */
export function drawValkyrie(c: Ctx, px: number, u: Soldier, sim: DefendSim) {
  const k = scale(px);
  const e = sim.enemies.find((e) => e.id === u.target);
  if (e) facing.set(u, Math.atan2(e.y - u.y, e.x - u.x));
  for (const st of sim.stabs) if (st.x1 === u.x && st.y1 === u.y) facing.set(u, Math.atan2(st.y1 - st.y0, st.x1 - st.x0));
  const face = facing.get(u) ?? -Math.PI / 2;
  if (u.guard) drawHalo(c, px, u, u.guard, sim.time);
  drawSpear(c, k, u.x * px, u.y * px, face);
  c.drawImage(valkSprite(u.flash > 0 ? "struck" : "plain"), u.x * px - 5.5 * k, u.y * px - 5 * k, 11 * k, VALK.length * k);
}

/** The spear: an outlined ash shaft with a gold blade, from her off hand
 * out past her along `face`, drawn in sprite-sized pixel steps. */
function drawSpear(c: Ctx, k: number, x: number, y: number, face: number) {
  const ux = Math.cos(face), uy = Math.sin(face);
  const step = Math.max(1, k);
  for (let t = -3; t <= 7; t++) {
    const sx = Math.round(x + ux * t * k), sy = Math.round(y + 0.5 * k + uy * t * k);
    c.fillStyle = OUTLINE;
    c.fillRect(sx - step, sy - step, step * 2, step * 2);
  }
  for (let t = -3; t <= 7; t++) {
    const sx = Math.round(x + ux * t * k), sy = Math.round(y + 0.5 * k + uy * t * k);
    c.fillStyle = t >= 5 ? (t === 7 ? GOLD[2] : GOLD[1]) : "#b08a5a";
    c.fillRect(sx - step / 2, sy - step / 2, step, step);
  }
}

/** A shimmering gold ring while nothing can hurt her, fading as it runs out. */
function drawHalo(c: Ctx, px: number, u: Soldier, left: number, now: number) {
  const a = Math.min(1, left * 2) * (0.55 + 0.25 * Math.sin(now * 24 + u.id));
  c.save();
  c.globalAlpha = a;
  c.strokeStyle = GOLD[1];
  c.lineWidth = Math.max(1, px * 0.08);
  c.beginPath();
  c.arc(u.x * px, u.y * px, px * VALKYRIE.size * 1.25, 0, Math.PI * 2);
  c.stroke();
  c.globalAlpha = a * 0.35;
  c.fillStyle = GOLD[2];
  c.fill();
  c.restore();
}

// ── The charge stab ───────────────────────────────────────────────────────

/** Every stab: the streak and speed lines under the after-images, then the
 * tip's star, the landing ring and the hit sparks over them. */
export function drawStabs(c: Ctx, px: number, sim: DefendSim) {
  for (const st of sim.stabs) drawStab(c, px, st);
}

function drawStab(c: Ctx, px: number, st: Stab) {
  const life = st.t / st.life, fade = 1 - life;
  const dx = st.x1 - st.x0, dy = st.y1 - st.y0, len = Math.sqrt(dx * dx + dy * dy);
  const ux = len > 0 ? dx / len : 0, uy = len > 0 ? dy / len : -1;
  const pix = Math.max(1, Math.round(px / ART));
  c.save();
  // The streak: a wide soft gold band, a gold body and a white-hot core,
  // each narrowing as it fades, laid in art-sized squares along the line.
  const band = (width: number, color: string, alpha: number) => {
    const w = Math.max(pix, Math.round(width * px * fade / pix) * pix);
    c.globalAlpha = alpha;
    c.fillStyle = color;
    for (let d = 0; d <= len; d += 0.5 / ART) {
      // Thinner toward where she started: the charge gathers to its tip.
      const taper = 0.35 + 0.65 * (len > 0 ? d / len : 1);
      const ww = Math.max(pix, Math.round((w * taper) / pix) * pix);
      const x = Math.round(((st.x0 + ux * d) * px) / pix) * pix, y = Math.round(((st.y0 + uy * d) * px) / pix) * pix;
      c.fillRect(x - ww / 2, y - ww / 2, ww, ww);
    }
  };
  band(0.7, GOLD[1], 0.25 * fade);
  band(0.34, GOLD[1], 0.85 * fade);
  band(0.14, GOLD[2], fade);
  // Speed lines either side, dashed and trailing behind her.
  c.globalAlpha = 0.8 * fade;
  c.fillStyle = GOLD[2];
  for (const side of [-1, 1])
    for (let n = 0; n < 4; n++) {
      const off = side * (0.35 + 0.12 * n), from = len * (0.1 + 0.2 * n) + life * 1.2, to = from + 0.6;
      for (let d = from; d < Math.min(len, to); d += 1 / ART) {
        const x = (st.x0 + ux * d - uy * off) * px, y = (st.y0 + uy * d + ux * off) * px;
        c.fillRect(Math.round(x / pix) * pix, Math.round(y / pix) * pix, pix, pix);
      }
    }
  // Gold after-images of her along the way, the oldest faintest.
  const k = scale(px), ghost = valkSprite("ghost");
  for (let n = 1; n <= 4; n++) {
    const f = n / 5;
    c.globalAlpha = Math.max(0, fade * (0.15 + 0.45 * f) - life * 0.3);
    const x = (st.x0 + dx * f) * px, y = (st.y0 + dy * f) * px;
    c.drawImage(ghost, x - 5.5 * k, y - 5 * k, 11 * k, VALK.length * k);
  }
  // The star flaring at the spear's tip.
  const tx = (st.x1 + ux * 0.6) * px, ty = (st.y1 + uy * 0.6) * px;
  const arm = Math.round((px * (0.25 + 0.6 * fade)) / pix) * pix;
  c.globalAlpha = fade;
  c.fillStyle = GOLD[1];
  c.fillRect(tx - arm, ty - pix, arm * 2, pix * 2);
  c.fillRect(tx - pix, ty - arm, pix * 2, arm * 2);
  c.fillStyle = GOLD[2];
  c.fillRect(tx - arm / 2, ty - pix / 2, arm, pix);
  c.fillRect(tx - pix / 2, ty - arm / 2, pix, arm);
  // The ring bursting out where she lands.
  c.globalAlpha = 0.7 * fade;
  c.strokeStyle = GOLD[2];
  c.lineWidth = Math.max(1, pix * 1.5 * fade);
  c.beginPath();
  c.arc(st.x1 * px, st.y1 * px, px * (0.3 + life * 1.3), 0, Math.PI * 2);
  c.stroke();
  // A spark on every enemy it ran through: a white cross, then gold.
  for (const h of st.hits) {
    const r = Math.round((px * (0.15 + life * 0.45)) / pix) * pix;
    c.globalAlpha = fade;
    c.fillStyle = life < 0.3 ? "#fff" : GOLD[1];
    c.fillRect(h.x * px - r, h.y * px - pix / 2, r * 2, pix);
    c.fillRect(h.x * px - pix / 2, h.y * px - r, pix, r * 2);
  }
  c.restore();
}

/** The streaks light the streets along them as they fade. */
export function stabLights(sim: DefendSim): { carried: CarriedLight[]; relief: ReliefLight[] } {
  const carried: CarriedLight[] = [], relief: ReliefLight[] = [];
  for (const st of sim.stabs) {
    const k = 1 - st.t / st.life;
    for (const f of [0.25, 0.75]) {
      const x = st.x0 + (st.x1 - st.x0) * f, y = st.y0 + (st.y1 - st.y0) * f;
      carried.push({ x, y, id: Math.floor(st.x0 * 131 + st.y0 * 17 + f * 7), r: 2.4, k: 1.1 * k });
      relief.push({ x, y, r: 2.6, k: 0.8 * k, color: "#ffe08a" });
    }
  }
  return { carried, relief };
}
