/** The siege engines and their shots as they are drawn: pixel art at
 * `SP` sprite pixels a cell inside crisp black outlines, lit from the upper
 * left like the roofs, drawn up with smoothing off.
 *
 * Nobody works the engines; they drive themselves. Each is a fixed body
 * (carriage, wheels, frame) with the part that aims (a barrel, a bow, a
 * throwing arm) laid over it toward its mark in one of `DIRS` directions,
 * and the whole outlined together, so every pose is one cached sprite:
 *
 * - **Rolling cannon:** a bronze barrel on a timber carriage between two
 *   iron-shod wheels, a little boiler glowing at the back that puffs steam
 *   as it rolls.
 * - **Ballista:** a great bow across a wheeled stock, the string drawn back
 *   with a bolt laid on while it reloads, slack once loosed.
 * - **Firework launcher:** a cart with a rack of six bright-capped rockets
 *   that empties with each volley and fills again as it reloads.
 * - **Trebuchet:** a timber frame on four wheels, its throwing arm and
 *   counterweight swinging over toward the mark with each throw.
 * - **Great bombard:** a huge banded iron barrel on a heavy sledge, with a
 *   brass gear turning it.
 * - **Dragonfire battery:** a wagon with a dragon's head on the front and a
 *   rack of sixteen rockets.
 *
 * Shots: iron balls and stones lobbed in an arc over their shadows, a bolt
 * in a straight line, rockets wobbling up on a trail of sparks and bursting
 * into fireworks. Presentation only: it reads the sim and draws from hashes
 * of the battle's time, never from a random stream. */
import { ENEMIES, type EnemyKind } from "./catalog.ts";
import { hash01 } from "./grid.ts";
import type { CarriedLight } from "./lighting.ts";
import { ROCKET_GAP, SWING, type SiegeShot } from "./siege.ts";
import type { Brush } from "./battle-art.ts";
import type { DefendSim, Effect, Enemy } from "./sim.ts";

type Ctx = CanvasRenderingContext2D;

/** Sprite pixels a cell. */
export const SP = 10;
/** Directions an engine can aim in. */
export const DIRS = 16;

const C = {
  outline: "#120c0a",
  woodHi: "#c48a52", wood: "#8e5c33", woodLo: "#5a3920", woodDeep: "#3a2414",
  ironHi: "#a3a9b3", iron: "#626873", ironLo: "#363a43", ironDeep: "#1f2228",
  bronzeHi: "#f0c873", bronze: "#c08a3a", bronzeLo: "#7d5420",
  stoneHi: "#d2ccbd", stone: "#9a9385", stoneLo: "#605a50",
  ember: "#ffb347", emberHi: "#fff0b0", rope: "#e2d3a8",
  red: "#c8372d", redLo: "#7e1f1c", gold: "#f2c94c",
};
/** The rockets' caps, and their bursts: each a pair, bright and deep. */
const SPARKS: [string, string][] = [
  ["#ff6a5a", "#c8372d"], ["#ffe07a", "#e0a020"], ["#7fd0ff", "#3a78d8"], ["#9cf07a", "#3c9e3a"], ["#f59cff", "#a24ad0"], ["#ffffff", "#c9d2ff"],
];

/** A sprite under construction: colours a pixel, `null` where clear. */
class Pix {
  readonly px: (string | null)[];
  constructor(readonly w: number, readonly h: number) {
    this.px = new Array(w * h).fill(null);
  }
  dot(x: number, y: number, color: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = color;
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.dot(x + i, y + j, color);
  }
  /** A box lit from the upper left: highlight on top and left, shade on the
   * bottom and right. */
  box(x: number, y: number, w: number, h: number, [hi, mid, lo]: string[]) {
    this.rect(x, y, w, h, mid);
    this.rect(x, y, w, 1, hi);
    this.rect(x, y, 1, h, hi);
    this.rect(x, y + h - 1, w, 1, lo);
    this.rect(x + w - 1, y + 1, 1, h - 1, lo);
  }
  /** A straight run of pixels from (x0, y0) to (x1, y1), `width` across. */
  line(x0: number, y0: number, x1: number, y1: number, color: string, width = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
    const r = (width - 1) / 2;
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n,
        y = y0 + ((y1 - y0) * k) / n;
      for (let j = -r; j <= r + 0.01; j += 1) for (let i = -r; i <= r + 0.01; i += 1) this.dot(x + i, y + j, color);
    }
  }
  /** Rings every shape in one pixel of outline. */
  outline() {
    const out = this.px.slice();
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.px[y * this.w + x]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < this.w && ny < this.h && this.px[ny * this.w + nx] && this.px[ny * this.w + nx] !== C.outline;
        });
        if (near) out[y * this.w + x] = C.outline;
      }
    for (let i = 0; i < out.length; i++) this.px[i] = out[i];
  }
  canvas(struck: boolean) {
    const cv = document.createElement("canvas");
    cv.width = this.w;
    cv.height = this.h;
    const c = cv.getContext("2d")!;
    this.px.forEach((color, i) => {
      if (!color) return;
      c.fillStyle = struck && color !== C.outline ? "#fff" : color;
      c.fillRect(i % this.w, Math.floor(i / this.w), 1, 1);
    });
    return cv;
  }
}

/** A pose: which way it aims (0 to `DIRS` - 1), and a frame of its own
 * motion (recoil, the arm's swing, rockets loaded, the wheels' turn). */
type Pose = { dir: number; frame: number; rolling: boolean };

/** Sprite size in pixels (square, outline included) for each engine. */
const SIDE: Partial<Record<EnemyKind, number>> = {
  rollingCannon: 15, ballista: 15, fireworkLauncher: 15, trebuchet: 23, bombard: 21, rocketBattery: 21,
};

const sprites = new Map<string, HTMLCanvasElement>();

function sprite(kind: EnemyKind, pose: Pose, struck: boolean) {
  const key = `${kind}:${pose.dir}:${pose.frame}:${pose.rolling ? 1 : 0}:${struck ? 1 : 0}`;
  let cv = sprites.get(key);
  if (!cv) {
    const n = SIDE[kind]!;
    const p = new Pix(n, n);
    PAINT[kind]!(p, pose, unit(pose.dir));
    p.outline();
    cv = p.canvas(struck);
    sprites.set(key, cv);
  }
  return cv;
}

const unit = (dir: number) => {
  const a = (dir / DIRS) * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
};

const WOOD = [C.woodHi, C.wood, C.woodLo];
const IRON = [C.ironHi, C.iron, C.ironLo];

/** Two iron-shod wheels seen from above, their treads turning as it rolls. */
function wheel(p: Pix, x: number, y: number, h: number, frame: number) {
  p.rect(x, y, 2, h, C.ironLo);
  p.rect(x, y, 1, h, C.iron);
  for (let j = (frame % 2); j < h; j += 2) p.dot(x + 1, y + j, C.ironDeep);
}

/** A barrel from the pivot toward `d`: `len` long, `width` across, a dark
 * muzzle at the end and the breech behind. */
function barrel(p: Pix, cx: number, cy: number, d: { x: number; y: number }, len: number, width: number, back: number, [hi, mid, lo]: string[], bands = 0) {
  const bx = cx - d.x * back, by = cy - d.y * back;
  const ex = cx + d.x * len, ey = cy + d.y * len;
  p.line(bx, by, ex, ey, lo, width);
  p.line(bx - d.y * 0.5, by + d.x * 0.5, ex - d.y * 0.5, ey + d.x * 0.5, mid, Math.max(1, width - 1));
  p.line(bx - d.y * 0.7, by + d.x * 0.7 - 0.3, ex - d.y * 0.7, ey + d.x * 0.7 - 0.3, hi, 1);
  for (let k = 1; k <= bands; k++) {
    const t = (k / (bands + 1)) * (len + back) - back;
    p.line(cx + d.x * t - d.y * width * 0.5, cy + d.y * t + d.x * width * 0.5, cx + d.x * t + d.y * width * 0.5, cy + d.y * t - d.x * width * 0.5, C.ironDeep, 1);
  }
  p.line(ex - d.y * width * 0.4, ey + d.x * width * 0.4, ex + d.y * width * 0.4, ey - d.x * width * 0.4, C.ironDeep, 1);
}

type Painter = (p: Pix, pose: Pose, d: { x: number; y: number }) => void;

const PAINT: Partial<Record<EnemyKind, Painter>> = {
  rollingCannon(p, { frame, rolling }, d) {
    const turn = rolling ? frame : 0;
    wheel(p, 2, 5, 7, turn);
    wheel(p, 11, 5, 7, turn);
    p.rect(4, 8, 7, 1, C.ironLo);
    p.box(5, 4, 5, 9, WOOD);
    // The boiler at the back that drives it, its grate glowing.
    p.box(5, 1, 5, 4, IRON);
    p.dot(7, 2, frame % 2 ? C.emberHi : C.ember);
    p.dot(6, 2, C.ironDeep);
    p.dot(8, 2, C.ironDeep);
    const recoil = !rolling && frame === 3 ? 1.2 : 0;
    barrel(p, 7.5 - recoil * d.x, 8.5 - recoil * d.y, d, 6, 3, 2, [C.bronzeHi, C.bronze, C.bronzeLo], 1);
  },
  ballista(p, { frame, rolling }, d) {
    const turn = rolling ? frame : 0;
    wheel(p, 1, 3, 4, turn);
    wheel(p, 12, 3, 4, turn);
    wheel(p, 1, 9, 4, turn);
    wheel(p, 12, 9, 4, turn);
    p.box(3, 3, 9, 10, WOOD);
    p.rect(4, 7, 7, 1, C.woodLo);
    const cx = 7, cy = 8, nx = -d.y, ny = d.x;
    // Stock, then the bow across its head.
    p.line(cx - d.x * 4, cy - d.y * 4, cx + d.x * 4, cy + d.y * 4, C.woodLo, 2);
    p.line(cx - d.x * 4, cy - d.y * 4, cx + d.x * 4, cy + d.y * 4, C.woodHi, 1);
    const hx = cx + d.x * 3, hy = cy + d.y * 3;
    const tip = (s: number) => ({ x: hx + nx * 5.5 * s - d.x * 1.5, y: hy + ny * 5.5 * s - d.y * 1.5 });
    const l = tip(-1), r = tip(1);
    p.line(l.x, l.y, hx, hy, C.woodDeep, 2);
    p.line(r.x, r.y, hx, hy, C.woodDeep, 2);
    p.line(l.x, l.y, hx, hy, C.wood, 1);
    p.line(r.x, r.y, hx, hy, C.wood, 1);
    // Drawn back with a bolt laid on once it has reloaded; slack when loosed.
    const loaded = frame > 0;
    const nock = loaded ? { x: cx - d.x * 2.5, y: cy - d.y * 2.5 } : { x: hx - d.x * 1.5, y: hy - d.y * 1.5 };
    p.line(l.x, l.y, nock.x, nock.y, C.rope);
    p.line(r.x, r.y, nock.x, nock.y, C.rope);
    if (loaded) {
      p.line(nock.x, nock.y, hx + d.x * 2, hy + d.y * 2, C.woodHi);
      p.dot(hx + d.x * 2.5, hy + d.y * 2.5, C.ironHi);
    }
  },
  fireworkLauncher(p, { frame, rolling }) {
    const turn = rolling ? frame : 0;
    wheel(p, 1, 4, 4, turn);
    wheel(p, 12, 4, 4, turn);
    wheel(p, 1, 9, 4, turn);
    wheel(p, 12, 9, 4, turn);
    p.box(3, 3, 9, 10, WOOD);
    p.rect(4, 4, 7, 8, C.woodDeep);
    // Six rockets on their sticks, loaded in turn; `frame` counts them.
    for (let k = 0; k < 6; k++) {
      const x = 4 + (k % 3) * 3, y = 2 + Math.floor(k / 3) * 5;
      if (k < frame) {
        const [hi, lo] = SPARKS[k % SPARKS.length];
        p.rect(x, y + 1, 2, 3, lo);
        p.rect(x, y + 1, 1, 3, hi);
        p.dot(x, y, hi);
        p.dot(x + 1, y, "#fff");
        p.rect(x, y + 4, 1, 2, C.woodHi);
      } else p.rect(x, y + 3, 2, 2, C.ironDeep);
    }
  },
  trebuchet(p, { frame, rolling }, d) {
    const turn = rolling ? frame : 0;
    for (const [x, y] of [[1, 3], [20, 3], [1, 15], [20, 15]]) wheel(p, x, y, 5, turn);
    p.box(3, 2, 3, 19, WOOD);
    p.box(17, 2, 3, 19, WOOD);
    p.box(3, 4, 17, 2, WOOD);
    p.box(3, 17, 17, 2, WOOD);
    // The uprights and their axle across the middle.
    p.box(8, 9, 2, 5, [C.woodHi, C.woodLo, C.woodDeep]);
    p.box(13, 9, 2, 5, [C.woodHi, C.woodLo, C.woodDeep]);
    p.rect(6, 11, 11, 1, C.ironLo);
    // The arm: `frame` 0 cocked (long end behind, stone in the sling) to 7
    // thrown (long end over toward the mark).
    const k = frame / 7, cos = Math.cos(Math.PI * (1 - k));
    const cx = 11.5, cy = 11;
    const ex = cx + d.x * 9 * cos, ey = cy + d.y * 9 * cos;
    const wx = cx - d.x * 3 * cos, wy = cy - d.y * 3 * cos;
    p.box(Math.round(wx) - 2, Math.round(wy) - 2, 4, 4, [C.stoneHi, C.stone, C.stoneLo]);
    p.line(wx, wy, ex, ey, C.woodLo, 2);
    p.line(wx, wy, ex, ey, C.woodHi, 1);
    p.dot(cx, cy, C.ironDeep);
    if (frame === 0) p.box(Math.round(ex) - 1, Math.round(ey) - 1, 2, 2, [C.stoneHi, C.stone, C.stoneLo]);
    else p.dot(ex + d.x, ey + d.y, C.rope);
  },
  bombard(p, { frame, rolling }, d) {
    const turn = rolling ? frame : 0;
    for (const [x, y] of [[1, 3], [18, 3], [1, 13], [18, 13]]) wheel(p, x, y, 5, turn);
    p.box(3, 2, 15, 17, [C.woodLo, C.woodDeep, C.woodDeep]);
    p.rect(3, 6, 15, 1, C.iron);
    p.rect(3, 14, 15, 1, C.iron);
    // A brass gear on the side that turns the barrel.
    p.box(4, 15, 3, 3, [C.bronzeHi, C.bronze, C.bronzeLo]);
    p.dot(5 + (frame % 2), 16, C.bronzeLo);
    const recoil = !rolling && frame === 3 ? 1.5 : 0;
    barrel(p, 10.5 - d.x * recoil, 10.5 - d.y * recoil, d, 8, 5, 3, IRON, 3);
  },
  rocketBattery(p, { frame, rolling }) {
    const turn = rolling ? frame : 0;
    for (const [x, y] of [[1, 4], [18, 4], [1, 12], [18, 12]]) wheel(p, x, y, 5, turn);
    p.box(3, 2, 15, 16, WOOD);
    p.box(4, 3, 13, 13, [C.bronzeHi, C.bronze, C.bronzeLo]);
    p.rect(5, 4, 11, 11, C.woodDeep);
    // Sixteen rockets, loaded in turn: `frame` counts them in fours.
    for (let k = 0; k < 16; k++) {
      const x = 5 + (k % 4) * 3, y = 4 + Math.floor(k / 4) * 3 - (k % 2 ? 0 : 0);
      if (k < frame * 4) {
        const [hi, lo] = SPARKS[(k + Math.floor(k / 4)) % SPARKS.length];
        p.dot(x, y, hi);
        p.dot(x + 1, y, lo);
        p.dot(x, y + 1, C.woodHi);
        p.dot(x + 1, y + 1, C.wood);
      } else p.rect(x, y, 2, 2, C.ironDeep);
    }
    // The dragon's head on the front: red snout, gold eyes, a glowing maw.
    p.box(8, 17, 5, 3, [C.red, C.red, C.redLo]);
    p.dot(9, 18, C.gold);
    p.dot(11, 18, C.gold);
    p.rect(9, 20, 3, 1, frame % 2 ? C.ember : C.emberHi);
  },
};

/** How the engine stands now: its aim, rolling or not, and its frame. */
function poseOf(e: Enemy, now: number): Pose {
  const def = ENEMIES[e.kind];
  const aim = e.aim ?? (e.facing ? { x: e.x + e.facing.x, y: e.y + e.facing.y } : { x: e.x, y: e.y + 1 });
  const a = Math.atan2(aim.y - e.y, aim.x - e.x);
  const dir = ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
  const rolling = !e.aim;
  const since = def.cooldown - e.cd;
  const reload = Math.max(0, Math.min(1, since / def.cooldown));
  const wheels = Math.floor(now * 8 + e.id) % 2;
  let frame = wheels;
  if (rolling) return { dir, frame, rolling };
  // Just after a shot `since` is small; while bracing it is large.
  const fresh = since < 0.15;
  if (e.kind === "rollingCannon" || e.kind === "bombard") frame = fresh ? 3 : Math.floor(now * 3 + e.id) % 2;
  else if (e.kind === "ballista") frame = since > 0.4 ? 1 : 0;
  else if (e.kind === "fireworkLauncher") frame = since < 6 * ROCKET_GAP ? Math.max(0, 6 - Math.ceil(since / ROCKET_GAP)) : Math.min(6, Math.floor(reload * 7));
  else if (e.kind === "rocketBattery") frame = since < 16 * ROCKET_GAP ? 0 : Math.min(4, Math.floor(reload * 5));
  else if (e.kind === "trebuchet") {
    // Swings over as the stone leaves, then winds slowly back down.
    const throwT = SWING + 0.3;
    frame = since < throwT ? Math.min(7, Math.round((since / throwT) * 7)) : Math.max(0, 7 - Math.round(((since - throwT) / (def.cooldown - throwT)) * 9));
  }
  return { dir, frame, rolling };
}

/** A siege engine at its spot, `now` seconds into the battle. */
export function drawSiegeEngine({ c, px }: Brush, e: Enemy, now: number) {
  const pose = poseOf(e, now);
  const cv = sprite(e.kind, pose, e.flash > 0);
  const k = px / SP;
  const w = cv.width * k;
  const x = Math.round(e.x * px - w / 2),
    y = Math.round(e.y * px - w / 2);
  if (e.marked) {
    c.fillStyle = "#f2c94c";
    c.fillRect(x + k, y + k, Math.round(w - 2 * k), Math.round(w - 2 * k));
  }
  c.drawImage(cv, x, y, Math.round(w), Math.round(w));
  if (e.kind === "rollingCannon" && pose.rolling) puffs(c, px, e, now);
}

/** Steam puffing from the rolling cannon's boiler as it drives. */
function puffs(c: Ctx, px: number, e: Enemy, now: number) {
  const size = Math.max(1, Math.round(px / SP));
  for (let n = 0; n < 3; n++) {
    const age = (now * 0.9 + n / 3 + hash01(e.id, 7)) % 1;
    const x = e.x + (2 / SP) + Math.sin(age * 5 + e.id) * 0.08,
      y = e.y - 0.62 - age * 0.55;
    c.fillStyle = `rgba(220,214,204,${0.55 * (1 - age)})`;
    const s = size * (1 + Math.floor(age * 2));
    c.fillRect(Math.round(x * px - s / 2), Math.round(y * px - s / 2), s, s);
  }
}

// ── Shots ──────────────────────────────────────────────────────────────────

/** How high a shot is above its ground point, in cells, `k` of the way. */
function lift(s: SiegeShot, k: number) {
  const d = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
  if (s.kind === "bolt") return 0.25 * (1 - k);
  const arc = s.kind === "stone" ? 2 + d * 0.3 : s.kind === "rocket" ? 1.2 + d * 0.2 : 0.6 + d * 0.15;
  return Math.sin(Math.PI * k) * arc;
}

/** Where a shot is, `k` of the way: its ground point and where it flies. */
function at(s: SiegeShot, k: number) {
  let gx = s.x0 + (s.x1 - s.x0) * k,
    gy = s.y0 + (s.y1 - s.y0) * k;
  if (s.kind === "rocket") {
    // Rockets wobble as they climb, settling as they dive.
    const d = Math.hypot(s.x1 - s.x0, s.y1 - s.y0) || 1;
    const w = Math.sin(k * 9 + hash01(s.seed, 1) * 6) * 0.35 * (1 - k);
    gx += (-(s.y1 - s.y0) / d) * w;
    gy += ((s.x1 - s.x0) / d) * w;
  }
  return { gx, gy, ax: gx, ay: gy - lift(s, k) };
}

export function drawSiegeShots({ c, px }: Brush, sim: DefendSim) {
  const p = Math.max(1, Math.round(px / SP));
  const dot = (x: number, y: number, color: string, n = 1) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x * px - (p * n) / 2), Math.round(y * px - (p * n) / 2), p * n, p * n);
  };
  for (const s of sim.siegeShots) {
    if (s.t < 0) continue;
    const k = Math.min(1, s.t / s.dur);
    const { gx, gy, ax, ay } = at(s, k);
    if (s.kind === "bolt") {
      const d = Math.hypot(s.x1 - s.x0, s.y1 - s.y0) || 1;
      const ux = (s.x1 - s.x0) / d, uy = (s.y1 - s.y0) / d;
      for (let n = 0; n < 5; n++) dot(ax - ux * n * (1 / SP), ay - uy * n * (1 / SP), n === 0 ? C.ironHi : n > 3 ? C.rope : C.woodHi);
      continue;
    }
    // Shadows on the ground below.
    c.fillStyle = "rgba(0,0,0,0.3)";
    const sh = s.kind === "stone" ? 3 : s.kind === "rocket" ? 1 : 2;
    c.fillRect(Math.round(gx * px - (p * sh) / 2), Math.round(gy * px - (p * sh) / 4), p * sh, Math.max(1, (p * sh) / 2));
    if (s.kind === "rocket") {
      const [hi, lo] = SPARKS[Math.floor(hash01(s.seed, 2) * SPARKS.length)];
      for (let n = 1; n <= 6; n++) {
        const kk = k - n * 0.035;
        if (kk < 0) break;
        const t = at(s, kk);
        dot(t.ax + (hash01(s.seed, n, Math.floor(sim.time * 20)) - 0.5) * 0.08, t.ay, n < 2 ? C.emberHi : n < 4 ? C.ember : "rgba(120,100,90,0.5)");
      }
      dot(ax, ay, hi, 2);
      dot(ax, ay, lo);
      continue;
    }
    if (s.kind === "stone") {
      dot(ax, ay, C.outline, 4);
      dot(ax, ay, C.stone, 3);
      dot(ax - 1 / SP, ay - 1 / SP, C.stoneHi);
      dot(ax + 1 / SP, ay + 1 / SP, C.stoneLo);
      continue;
    }
    // An iron ball, trailing a little smoke.
    const big = s.r > 1.2 ? 3 : 2;
    for (let n = 1; n <= 3; n++) {
      const t = at(s, Math.max(0, k - n * 0.05));
      dot(t.ax, t.ay, `rgba(70,64,60,${0.4 - n * 0.1})`, big);
    }
    dot(ax, ay, C.outline, big + 1);
    dot(ax, ay, C.ironLo, big);
    dot(ax - 0.5 / SP, ay - 0.5 / SP, C.ironHi);
  }
}

/** A firework bursting: sparks flung out in rings that droop and fade. */
export function drawFirework({ c, px }: Brush, fx: Effect) {
  const k = fx.t / 0.6;
  const seed = fx.seed ?? 0;
  const [hi, lo] = SPARKS[Math.floor(hash01(seed, 3) * SPARKS.length)];
  const p = Math.max(1, Math.round(px / SP));
  const n = 14;
  c.save();
  c.globalAlpha = Math.max(0, 1 - k * k);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash01(seed, 4) * 6;
    const r = fx.r * (0.25 + Math.sqrt(k) * (0.75 + hash01(seed, 5, i) * 0.35));
    const x = fx.x + Math.cos(a) * r,
      y = fx.y + Math.sin(a) * r * 0.8 + k * k * 0.5;
    c.fillStyle = (i + Math.floor(fx.t * 25)) % 3 ? hi : lo;
    c.fillRect(Math.round(x * px - p / 2), Math.round(y * px - p / 2), p, p);
    if (k < 0.5) {
      c.fillStyle = lo;
      const tx = fx.x + Math.cos(a) * r * 0.7,
        ty = fx.y + Math.sin(a) * r * 0.56 + k * k * 0.35;
      c.fillRect(Math.round(tx * px - p / 2), Math.round(ty * px - p / 2), p, p);
    }
  }
  c.restore();
}

/** Rockets light the ground as they fly. */
export function siegeLights(sim: DefendSim): CarriedLight[] {
  const out: CarriedLight[] = [];
  for (const s of sim.siegeShots) {
    if (s.kind !== "rocket" || s.t < 0) continue;
    const { gx, gy } = at(s, Math.min(1, s.t / s.dur));
    out.push({ x: gx, y: gy, id: s.seed, r: 1.1, k: 0.6 });
  }
  for (const fx of sim.effects) if (fx.kind === "firework") out.push({ x: fx.x, y: fx.y, id: fx.seed ?? 0, r: fx.r * 1.6, k: 1.2 * (1 - fx.t / 0.6) });
  return out;
}
