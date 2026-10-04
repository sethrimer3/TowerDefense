/** The dark wizard and his black lightning as they are drawn, in the pixel
 * art of the city (`ART` pixels a cell):
 *
 * - **The dark wizard:** a hooded figure in black and charcoal robes, 11 ×
 *   13 sprite pixels inside an outline rimmed in crimson light, crimson
 *   trim and a ruby clasp, two crimson eyes burning in the hood, a black
 *   staff crowned with a ruby that flares as he casts, and a dark crimson
 *   stain on the ground about him.
 * - **Black lightning:** every bolt is drawn into one board-sized buffer at
 *   art scale (`rasterBolts`), so a chain through hundreds of enemies costs
 *   a few pixel writes a link, not a canvas call each: a jagged black core
 *   (crimson-hot for its first instant) wrapped in a crimson glow that
 *   shrinks as it fades, short forks off its kinks, bright crimson sparks on
 *   every third enemy struck and a flare where it was cast. The buffer goes to the
 *   canvas once a frame (only the part that changed), drawn up crisp.
 *   Bolts tint the ground crimson round them (`darkLights`).
 *
 * Presentation only: it reads the sim and never draws from a random
 * stream. */
import { DARK_WIZARD } from "./catalog.ts";
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import type { CarriedLight } from "./lighting.ts";
import type { ReliefLight } from "./ground-relief.ts";
import type { DefendSim, Soldier } from "./sim.ts";
import { STAFF, type Bolt } from "./dark-wizards.ts";

type Ctx = CanvasRenderingContext2D;

const OUTLINE = "#07050a";
const RUBY = ["#3d0410", "#7e0a1c", "#c0182e", "#f0425a", "#ffc4cc"];

// ── The dark wizard ───────────────────────────────────────────────────────

/** The dark wizard, 11 × 13 sprite pixels: hood (h lit, k deep), eyes (E),
 * robe (r lit, d shaded), crimson trim (c) and the ruby clasp (R). */
const WIZ = [
  "....000....",
  "...0hhk0...",
  "..0hhkkk0..",
  ".0hhkkkkd0.",
  ".0hkEkkEd0.",
  ".0hkkkkkd0.",
  "0chhcRcddc0",
  "0rhhdcdddd0",
  "0rrhdcdddd0",
  "0rrhdcdddd0",
  "0rrrdcdddd0",
  "0ccccccccc0",
  ".000000000.",
];
const WIZ_W = WIZ[0].length;
const WIZ_COLORS: Record<string, string> = {
  "0": OUTLINE, h: "#4e4858", k: "#141017", E: "#ff3a4a", r: "#3c3644", d: "#211c27", c: "#a8182e", R: "#f0425a",
};
type WizLook = "plain" | "struck" | "aura";
let wizSprites: Record<WizLook, HTMLCanvasElement> | null = null;

function wizSprite(look: WizLook) {
  wizSprites ??= { plain: paintWiz("plain"), struck: paintWiz("struck"), aura: paintWiz("aura") };
  return wizSprites[look];
}

/** The figure, flashed white when struck, or as a crimson silhouette for
 * the aura round him. */
function paintWiz(look: WizLook) {
  const cv = document.createElement("canvas");
  cv.width = WIZ_W;
  cv.height = WIZ.length;
  const c = cv.getContext("2d")!;
  WIZ.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === ".") return;
      c.fillStyle = look === "aura" ? RUBY[2] : look === "struck" && ch !== "0" ? "#fff" : WIZ_COLORS[ch];
      c.fillRect(i, j, 1, 1);
    }),
  );
  return cv;
}

/** Sprite pixels a cell. */
const scale = (px: number) => (px * DARK_WIZARD.size * 2.6) / WIZ.length;

/** Where each wizard's staff last pointed, so it holds between casts. */
const facing = new WeakMap<object, number>();

/** A dark wizard: the stain under him, the figure, then his staff. */
export function drawDarkWizard(c: Ctx, px: number, u: Soldier, sim: DefendSim) {
  const k = scale(px), pix = Math.max(1, Math.round(k));
  const e = sim.enemies.find((e) => e.id === u.target);
  if (e) facing.set(u, Math.atan2(e.y - u.y, e.x - u.x));
  const face = facing.get(u) ?? -Math.PI / 2;
  // How freshly he cast: 1 at the moment, 0 after a quarter second.
  const cast = Math.max(0, 1 - (DARK_WIZARD.cooldown - u.cd) / 0.25);
  drawStain(c, px, u, sim.time, pix);
  const x = u.x * px - (WIZ_W / 2) * k, y = u.y * px - 7 * k;
  // A crimson rim of light round his outline, pulsing slowly.
  c.globalAlpha = 0.45 + 0.15 * Math.sin(sim.time * 3 + u.id);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.drawImage(wizSprite("aura"), x + dx * pix, y + dy * pix, WIZ_W * k, WIZ.length * k);
  c.globalAlpha = 1;
  c.drawImage(wizSprite(u.flash > 0 ? "struck" : "plain"), x, y, WIZ_W * k, WIZ.length * k);
  drawStaff(c, px, k, u.x * px, u.y * px, face, cast);
}

/** A dithered ring of dark crimson on the ground round his feet, its
 * pixels slowly turning. */
function drawStain(c: Ctx, px: number, u: Soldier, now: number, pix: number) {
  const r = px * DARK_WIZARD.size * 0.95, cx = u.x * px, cy = (u.y + 0.3) * px;
  const n = 14, turn = Math.floor(now * 4);
  c.fillStyle = "rgba(90,6,20,0.55)";
  for (let i = 0; i < n; i++) {
    if ((i + turn) % 3 === 0) continue;
    const a = (i / n) * Math.PI * 2;
    c.fillRect(Math.round((cx + Math.cos(a) * r) / pix) * pix, Math.round((cy + Math.sin(a) * r * 0.45) / pix) * pix, pix, pix);
  }
}

/** The staff, upright at his right hand and leaning a little toward
 * `face`: a black shaft in sprite-sized pixels inside an outline, a ruby at
 * its head (where his bolts leave from, `STAFF` in `dark-wizards.ts`)
 * flaring as he casts. */
function drawStaff(c: Ctx, px: number, k: number, x: number, y: number, face: number, cast: number) {
  const step = Math.max(1, Math.round(k));
  const bx = x + STAFF.x * px, by = y + 5 * k, tx = bx + Math.cos(face) * 1.5 * k, ty = y + STAFF.y * px;
  const n = Math.max(2, Math.round((by - ty) / step));
  const at = (i: number) => [Math.round((bx + ((tx - bx) * i) / n) / step) * step, Math.round((by + ((ty - by) * i) / n) / step) * step];
  c.fillStyle = OUTLINE;
  for (let i = 0; i <= n; i++) {
    const [sx, sy] = at(i);
    c.fillRect(sx - step, sy - step, step * 3, step * 2);
  }
  for (let i = 1; i < n; i++) {
    const [sx, sy] = at(i);
    c.fillStyle = i % 4 === 0 ? "#4e4858" : "#1c1922";
    c.fillRect(sx, sy - step / 2, step, step);
  }
  const [gx, gy] = at(n);
  if (cast > 0) {
    c.globalAlpha = cast * 0.6;
    c.fillStyle = RUBY[2];
    const g = step * Math.round(2 + cast * 3);
    c.fillRect(gx - g, gy, g * 2 + step, step);
    c.fillRect(gx, gy - g, step, g * 2 + step);
    c.globalAlpha = 1;
  }
  c.fillStyle = OUTLINE;
  c.fillRect(gx - step * 1.5, gy - step * 1.5, step * 4, step * 4);
  c.fillStyle = cast > 0.5 ? RUBY[4] : RUBY[2];
  c.fillRect(gx - step / 2, gy - step / 2, step * 2, step * 2);
  c.fillStyle = RUBY[3];
  c.fillRect(gx - step / 2, gy - step / 2, step, step);
}

// ── Black lightning ───────────────────────────────────────────────────────

/** A box of buffer pixels, inclusive. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Glow levels by Euclidean distance from a core pixel, out to three
 * pixels: [dx, dy, level]. */
const KERNEL: [number, number, number][] = [];
for (let dy = -3; dy <= 3; dy++)
  for (let dx = -3; dx <= 3; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0 && d <= 3.2) KERNEL.push([dx, dy, d <= 1.01 ? 3 : d <= 2.25 ? 2 : 1]);
  }

/** The glow by level (1 faint to 3 at the core's edge), the bright
 * crimson sparks (under the core), and the core: black, crimson-hot while
 * fresh. Little-endian RGBA. */
const abgr = (rgb: number, a: number) => ((a << 24) | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff)) >>> 0;
const GLOW = [0, abgr(0x5a0614, 110), abgr(0x9c0f24, 200), abgr(0xe0213b, 255)];
const SPARK = abgr(0xff4a5e, 255);
const CORE = abgr(0x050207, 255);
const CORE_HOT = abgr(0xff8090, 255);

/** Scratch for `rasterBolts`: what each buffer pixel is this frame. */
export class BoltBuffer {
  readonly w = CELLS_W * ART;
  readonly h = CELLS_H * ART;
  readonly rgba = new Uint32Array(this.w * this.h);
  /** 0 nothing, 1–3 glow, 4 spark, 5 core, 6 hot core. */
  private kind = new Uint8Array(this.w * this.h);
  private box: Box | null = null;
  // A chain can span the board while occupying very few of its pixels.
  // Record each occupied pixel once, even when glow and cores overlap.
  private touched = new Uint32Array(this.w * this.h);
  private touchedCount = 0;

  /** Clears last frame's bolts and draws `bolts` in their place; returns
   * the box that changed (last frame's and this frame's together), or null
   * when nothing did. */
  raster(bolts: readonly Bolt[]): Box | null {
    const was = this.box;
    this.clear();
    this.box = bolts.length ? rasterBolts(this, bolts) : null;
    return union(was, this.box);
  }

  private clear() {
    for (let n = 0; n < this.touchedCount; n++) {
      const i = this.touched[n];
      this.kind[i] = 0;
      this.rgba[i] = 0;
    }
    this.touchedCount = 0;
  }

  /** Marks pixel (x, y) as `k` if that outranks what it is. */
  mark(x: number, y: number, k: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (this.kind[i] < k) {
      if (!this.kind[i]) this.touched[this.touchedCount++] = i;
      this.kind[i] = k;
    }
  }

  /** Turns the marks inside `b` into colours. */
  paint(b: Box) {
    for (let n = 0; n < this.touchedCount; n++) {
      const i = this.touched[n], y = Math.floor(i / this.w), x = i - y * this.w;
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      const k = this.kind[i];
      this.rgba[i] = k <= 3 ? GLOW[k] : k === 4 ? SPARK : k === 5 ? CORE : CORE_HOT;
    }
  }
}

function union(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/** Seconds a bolt's jags hold before they shift, and its core stays hot. */
const FLICKER = 0.06;
const HOT = 0.05;

/** Draws every bolt into `buf` and returns the box they cover. Each link is
 * cut into a few jagged pieces (offsets hashed from the bolt, the link and
 * the moment, so they crackle), each a Bresenham run of core pixels ringed
 * with glow. */
export function rasterBolts(buf: BoltBuffer, bolts: readonly Bolt[]): Box | null {
  const box: Box = { x0: buf.w, y0: buf.h, x1: -1, y1: -1 };
  for (const bolt of bolts) rasterBolt(buf, bolt, box);
  if (box.x1 < 0) return null;
  box.x0 = Math.max(0, box.x0 - 3);
  box.y0 = Math.max(0, box.y0 - 3);
  box.x1 = Math.min(buf.w - 1, box.x1 + 3);
  box.y1 = Math.min(buf.h - 1, box.y1 + 3);
  buf.paint(box);
  return box;
}

function rasterBolt(buf: BoltBuffer, bolt: Bolt, box: Box) {
  const fade = 1 - bolt.t / bolt.life;
  if (fade <= 0) return;
  // The glow shrinks as it fades; the core thins out at the last.
  const reach = fade > 0.6 ? 3 : fade > 0.3 ? 2 : 1;
  const core = bolt.t < HOT ? 6 : 5;
  const tick = Math.floor(bolt.t / FLICKER);
  const plot = (x: number, y: number) => {
    if (fade < 0.25 && (x + y) & 1) return;
    buf.mark(x, y, core);
    for (const [dx, dy, level] of KERNEL) {
      const l = level - (3 - reach);
      if (l > 0) buf.mark(x + dx, y + dy, l);
    }
    if (x < box.x0) box.x0 = x;
    if (y < box.y0) box.y0 = y;
    if (x > box.x1) box.x1 = x;
    if (y > box.y1) box.y1 = y;
  };
  const p = bolt.pts;
  for (let k = 1; k < p.length / 2; k++) {
    const j = bolt.from[k - 1] ?? k - 1;
    jagged(p[j * 2] * ART, p[j * 2 + 1] * ART, p[k * 2] * ART, p[k * 2 + 1] * ART, hash(bolt.seed, k, tick), plot);
  }
  // The flare where it was cast, and while fresh a spark on every third
  // enemy struck (the core runs over them).
  const sx = Math.round(p[0] * ART), sy = Math.round(p[1] * ART);
  burst(buf, sx, sy, fade > 0.5 ? 3 : 2, 4);
  if (fade > 0.55) for (let i = 2; i < p.length; i += 6) burst(buf, Math.round(p[i] * ART), Math.round(p[i + 1] * ART), 1, 4);
}

/** A little cross of `k` pixels `r` long. */
function burst(buf: BoltBuffer, x: number, y: number, r: number, k: number) {
  for (let d = -r; d <= r; d++) {
    buf.mark(x + d, y, k);
    buf.mark(x, y + d, k);
  }
}

/** A jagged run from (ax, ay) to (bx, by), in buffer pixels: kinks pushed
 * off the straight line by up to a quarter of its length (three pixels at
 * most), and now and then a short fork off one. */
function jagged(ax: number, ay: number, bx: number, by: number, seed: number, plot: (x: number, y: number) => void) {
  const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
  const n = Math.max(1, Math.min(4, Math.round(len / 6)));
  const amp = Math.min(3, len * 0.25), nx = len > 0 ? -dy / len : 0, ny = len > 0 ? dx / len : 0;
  let px = Math.round(ax), py = Math.round(ay);
  for (let j = 1; j <= n; j++) {
    const f = j / n, off = j === n ? 0 : (hash01(seed, j) * 2 - 1) * amp;
    const qx = Math.round(ax + dx * f + nx * off), qy = Math.round(ay + dy * f + ny * off);
    line(px, py, qx, qy, plot);
    if (j < n && hash01(seed, j, 7) < 0.3) {
      // A fork: a few pixels off at a slant, ahead along the bolt.
      const s = hash01(seed, j, 8) < 0.5 ? 1 : -1, fl = 2 + Math.floor(hash01(seed, j, 9) * 4);
      line(qx, qy, Math.round(qx + (dx / Math.max(len, 1) + nx * s) * fl), Math.round(qy + (dy / Math.max(len, 1) + ny * s) * fl), plot);
    }
    px = qx;
    py = qy;
  }
}

/** Bresenham's line, every pixel from (x0, y0) to (x1, y1). */
function line(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Draws the battle's bolts over the board each frame from one buffer. */
export class DarkArt {
  private buf: BoltBuffer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private image: ImageData | null = null;
  private shown = false;

  draw(c: Ctx, px: number, sim: DefendSim) {
    if (!sim.bolts.length && !this.shown) return;
    this.buf ??= new BoltBuffer();
    const buf = this.buf;
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = buf.w;
      this.canvas.height = buf.h;
      this.image = new ImageData(new Uint8ClampedArray(buf.rgba.buffer), buf.w, buf.h);
    }
    const changed = buf.raster(sim.bolts);
    if (changed) this.canvas.getContext("2d")!.putImageData(this.image!, 0, 0, changed.x0, changed.y0, changed.x1 - changed.x0 + 1, changed.y1 - changed.y0 + 1);
    this.shown = sim.bolts.length > 0;
    if (!this.shown) return;
    const smooth = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.canvas, 0, 0, buf.w, buf.h, 0, 0, CELLS_W * px, CELLS_H * px);
    c.imageSmoothingEnabled = smooth;
  }
}

/** Bolts tint the ground crimson along them as they fade (a few lights a
 * bolt however long its chain), and the wizards' rubies glow. */
export function darkLights(sim: DefendSim): { carried: CarriedLight[]; relief: ReliefLight[] } {
  const carried: CarriedLight[] = [], relief: ReliefLight[] = [];
  for (const b of sim.bolts) {
    const k = 1 - b.t / b.life, n = b.pts.length / 2;
    const every = Math.max(1, Math.ceil(n / 5));
    for (let i = 0; i < n; i += every) {
      const x = b.pts[i * 2], y = b.pts[i * 2 + 1];
      carried.push({ x, y, id: (b.seed + i) % 100000, r: 2, k: 0.8 * k });
      relief.push({ x, y, r: 2.4, k: 0.9 * k, color: "#e0213b" });
    }
  }
  for (const s of sim.soldiers) if (s.kind === "darkWizard") relief.push({ x: s.x, y: s.y, r: 1.6, k: 0.5, color: "#c0182e" });
  return { carried, relief };
}
