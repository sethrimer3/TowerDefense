/** The magic boats as they are drawn: pixel art at `SP` sprite pixels a
 * cell inside crisp black outlines, lit from the upper left, one cached
 * sprite per heading (`DIRS` of them) and rune-glow frame, so they turn
 * toward the keep without blurring.
 *
 * Seen from above: a pointed planked hull with a lit gunwale, glowing runes
 * along its sides and an enchanted crystal at the bow; masts with their
 * sails billowing toward the bow, and a stern cabin on the bigger boats.
 *
 * - **Enchanted Skiff:** one mast, a cream sail and teal runes.
 * - **Spellbound Sloop:** two masts, sea-green sails and a cabin.
 * - **Arcane Galleon:** three masts, deep blue sails, a gilded rail.
 * - **Deluge Ark:** four masts, violet sails over a near-black hull, gold
 *   rails and runes burning purple.
 *
 * Foam curls off the bow as it sails. Presentation only: it reads the sim
 * and draws from hashes of the battle's time. */
import { ENEMIES, type EnemyKind } from "./catalog.ts";
import { hash01 } from "./grid.ts";
import type { CarriedLight } from "./lighting.ts";
import type { Brush } from "./battle-art.ts";
import type { DefendSim, Enemy } from "./sim.ts";

/** Sprite pixels a cell. */
const SP = 10;
/** Headings a boat can be drawn at. */
const DIRS = 16;

const OUTLINE = "#0b0907";

type Look = {
  hull: [string, string, string];
  deck: [string, string];
  sail: [string, string, string];
  rune: [string, string];
  trim: string | null;
  masts: number;
  cabin: boolean;
};

const LOOK: Partial<Record<EnemyKind, Look>> = {
  boatDinghy: { hull: ["#c48a52", "#8e5c33", "#5a3920"], deck: ["#a7744a", "#946640"], sail: ["#fbf3d8", "#e6dab4", "#b8a984"], rune: ["#8ff6ff", "#3cc6d8"], trim: null, masts: 1, cabin: false },
  boatLesser: { hull: ["#c48a52", "#8e5c33", "#5a3920"], deck: ["#a7744a", "#946640"], sail: ["#fbf3d8", "#e6dab4", "#b8a984"], rune: ["#8ff6ff", "#3cc6d8"], trim: null, masts: 1, cabin: false },
  boatSailboat: { hull: ["#b07a48", "#7e5130", "#4e321e"], deck: ["#9a6a42", "#875c38"], sail: ["#c6f0dc", "#8fd2b4", "#5a9e83"], rune: ["#9effe2", "#3ad4a8"], trim: null, masts: 1, cabin: false },
  boat: { hull: ["#b07a48", "#7e5130", "#4e321e"], deck: ["#9a6a42", "#875c38"], sail: ["#c6f0dc", "#8fd2b4", "#5a9e83"], rune: ["#9effe2", "#3ad4a8"], trim: null, masts: 2, cabin: true },
  boatCutter: { hull: ["#8e5e44", "#5f3c2c", "#3a241b"], deck: ["#7c5440", "#6c4838"], sail: ["#9cc4ff", "#5a86da", "#34529a"], rune: ["#b8e4ff", "#5ab0ff"], trim: "#f2c94c", masts: 1, cabin: true },
  boatGreater: { hull: ["#8e5e44", "#5f3c2c", "#3a241b"], deck: ["#7c5440", "#6c4838"], sail: ["#9cc4ff", "#5a86da", "#34529a"], rune: ["#b8e4ff", "#5ab0ff"], trim: "#f2c94c", masts: 3, cabin: true },
  boatCog: { hull: ["#5a4a62", "#382c40", "#201a28"], deck: ["#4a3c52", "#3e3246"], sail: ["#e2b8ff", "#a674e0", "#6a3ea8"], rune: ["#ffc8ff", "#d26aff"], trim: "#f2c94c", masts: 2, cabin: true },
  boatSovereign: { hull: ["#5a4a62", "#382c40", "#201a28"], deck: ["#4a3c52", "#3e3246"], sail: ["#e2b8ff", "#a674e0", "#6a3ea8"], rune: ["#ffc8ff", "#d26aff"], trim: "#f2c94c", masts: 4, cabin: true },
};

const sprites = new Map<string, HTMLCanvasElement>();

/** Paints one boat at heading `dir` and rune `frame` into a fresh canvas. */
function sprite(kind: EnemyKind, dir: number, frame: number, struck: boolean): HTMLCanvasElement {
  const key = `${kind}:${dir}:${frame}:${struck ? 1 : 0}`;
  let cv = sprites.get(key);
  if (cv) return cv;
  const look = LOOK[kind]!, size = ENEMIES[kind].size;
  const L = (size * SP) / 2, half = Math.max(2.6, L * 0.34);
  const N = Math.ceil(L * 2 + 6) | 1, c = (N - 1) / 2;
  const a = (dir / DIRS) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
  const px: (string | null)[] = new Array(N * N).fill(null);
  /** The hull's half-width at `u` along it (bow +L, stern -L). */
  const width = (u: number) => {
    const t = u / L;
    if (t > 1 || t < -1) return -1;
    // A pointed bow, the beam just aft of the middle, a flat transom.
    return t > 0 ? half * Math.pow(1 - t * t, 0.75) : half * (1 - 0.3 * t * t);
  };
  const masts = Array.from({ length: look.masts }, (_, k) => L * (look.masts === 1 ? 0.05 : 0.38 - (0.82 * k) / (look.masts - 1)));
  const gap = look.masts > 1 ? (L * 0.82) / (look.masts - 1) : L;
  const span = half * 1.6, belly = Math.max(2.4, Math.min(L * 0.3, gap * 0.62));
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = i - c, y = j - c;
      const u = x * dx + y * dy, v = -x * dy + y * dx;
      let col: string | null = null;
      const w = width(u);
      if (w >= 0 && Math.abs(v) <= w) {
        // The gunwale, lit on the side that faces the upper left.
        if (Math.abs(v) > w - 1.3 || u > L - 1.6) {
          const nx = -dy * Math.sign(v || 1), ny = dx * Math.sign(v || 1);
          const lit = nx * -0.7 + ny * -0.7 > 0;
          col = look.trim && Math.abs(v) > w - 0.7 ? look.trim : lit ? look.hull[0] : look.hull[2];
        } else {
          // Deck planks running along the hull, with staggered butt joints.
          const plank = Math.floor((v + half) / 1.8);
          col = look.deck[plank & 1];
          if (Math.abs(((u + plank * 3.7) % 6) + 6) % 6 < 0.6) col = look.hull[2];
          // Runes glowing just inside the rail, in a slow wave along it.
          if (Math.abs(v) > w - 2.4 && Math.abs(v) <= w - 1.3 && Math.round(u) % 3 === 0 && u < L * 0.7 && u > -L * 0.85)
            col = (Math.round(u / 3) + frame) % 4 === 0 ? look.rune[0] : look.rune[1];
        }
        // The stern cabin, roofed.
        if (look.cabin && u < -L * 0.5 && u > -L * 0.86 && Math.abs(v) < half * 0.62) {
          const edge = u < -L * 0.82 || u > -L * 0.54 || Math.abs(v) > half * 0.5;
          col = edge ? look.hull[2] : v < 0 ? look.hull[0] : look.hull[1];
        }
        // The crystal at the bow.
        if (Math.abs(u - L * 0.72) < 1.2 && Math.abs(v) < 1.2) col = frame % 2 ? "#ffffff" : look.rune[0];
      }
      // Sails across each mast, bellied toward the bow, the spar behind.
      for (const m of masts) {
        if (Math.abs(v) > span) continue;
        const front = m + 0.6 + belly * (1 - (v / span) * (v / span));
        if (u <= front && u >= m - 0.4) {
          const k = (u - m) / Math.max(0.5, front - m);
          col = v < -span * 0.3 ? look.sail[0] : k > 0.7 ? look.sail[2] : look.sail[1];
          if (u < m + 0.6) col = look.hull[2];
        }
        if (Math.abs(u - m) < 1 && Math.abs(v) < 1) col = look.hull[2];
      }
      px[j * N + i] = col;
    }
  // One pixel of black outline round everything.
  const out = px.slice();
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      if (px[j * N + i]) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
        const x = i + ox, y = j + oy;
        return x >= 0 && y >= 0 && x < N && y < N && px[y * N + x];
      })) out[j * N + i] = OUTLINE;
    }
  cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const g = cv.getContext("2d")!;
  out.forEach((color, k) => {
    if (!color) return;
    g.fillStyle = struck && color !== OUTLINE ? "#fff" : color;
    g.fillRect(k % N, Math.floor(k / N), 1, 1);
  });
  sprites.set(key, cv);
  return cv;
}

/** The heading a boat is drawn at, from where it's going. */
function headingOf(e: Enemy) {
  const f = e.facing ?? { x: 0, y: 1 };
  const a = Math.atan2(f.y, f.x);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

export function drawBoat({ c, px }: Brush, e: Enemy, now: number) {
  const dir = headingOf(e), frame = Math.floor(now * 4 + hash01(e.id, 3) * 4) % 4;
  const cv = sprite(e.kind, dir, frame, e.flash > 0);
  const k = px / SP, w = cv.width * k;
  const x = Math.round(e.x * px - w / 2), y = Math.round(e.y * px - w / 2);
  if (e.marked) {
    c.fillStyle = "rgba(242,201,76,0.45)";
    c.fillRect(x + w * 0.3, y + w * 0.3, w * 0.4, w * 0.4);
  }
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(cv, x, y, Math.round(w), Math.round(w));
  c.restore();
  foam(c, px, e, now);
}

/** White water curling off the bow and down both sides. */
function foam(c: CanvasRenderingContext2D, px: number, e: Enemy, now: number) {
  const f = e.facing ?? { x: 0, y: 1 }, L = ENEMIES[e.kind].size / 2;
  const s = Math.max(1, Math.round(px / SP));
  for (let n = 0; n < 10; n++) {
    const age = (now * 1.4 + n / 10 + hash01(e.id, n)) % 1;
    const side = n % 2 ? 1 : -1;
    // From the bow, spreading back and out along the hull.
    const back = age * L * 1.6, out = L * 0.12 + age * L * 0.55;
    const x = e.x + f.x * (L - back) - f.y * side * out, y = e.y + f.y * (L - back) + f.x * side * out;
    c.fillStyle = `rgba(232,246,250,${(0.85 * (1 - age)).toFixed(3)})`;
    c.fillRect(Math.round(x * px - s / 2), Math.round(y * px - s / 2), s, s);
  }
}

/** The boats' runes and bow crystals glow on the water. */
export function boatLights(sim: DefendSim): CarriedLight[] {
  const out: CarriedLight[] = [];
  for (const e of sim.enemies) {
    const def = ENEMIES[e.kind];
    if (def.boat) out.push({ x: e.x, y: e.y, id: e.id, r: def.size * 0.9 + 0.6, k: 0.55 });
  }
  return out;
}
