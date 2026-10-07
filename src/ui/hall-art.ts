/** The walls behind the in-world menus, as lit pixel art: the Smithy's worn
 * oak boards, the Study's vault stone and the keep's hall with its great
 * window. Each wall is baked once a size (colour and a height map, at `ART`
 * screen pixels a pixel) and lit each frame, per pixel and through its
 * slopes like the Library's nave, by the torches mounted on the menu's sides
 * and, in the keep, by the sun through the window; the torches themselves
 * are small pixel sprites (`paintSconce`) with a flickering flame in a black
 * outline. Presentation only. */
import { ashlar, facing, h01 } from "../library/ashlar.ts";
import { getTorchFlicker, getTorchSway } from "../lighting.ts";

type RGB = [number, number, number];
/** Screen (CSS) pixels to an art pixel. */
export const ART = 3;
/** Fewest milliseconds between two lightings (the flicker is slow). */
const FRAME_MS = 70;

export type HallLook = "planks" | "vault" | "keep";

/** A torch on the menu's side, in CSS pixels from the backdrop's corner. */
export type TorchSpot = { x: number; y: number };

/** The window's pixels: 0 wall, 1 the stone surround, 2 the iron tracery, 3 glass. */
const WALL = 0, SURROUND = 1, TRACERY = 2, GLASS = 3;

export class HallBackdrop {
  private w = 0;
  private h = 0;
  private albedo = new Float32Array(0);
  private sx = new Float32Array(0);
  private sy = new Float32Array(0);
  /** The window: what each pixel is, and the glass's scene (sky height, or land below 0). */
  private part = new Uint8Array(0);
  private scene = new Float32Array(0);
  private win = { x0: 0, x1: 0, y0: 0, y1: 0 };
  private image: ImageData | null = null;
  private last = -Infinity;

  constructor(private canvas: HTMLCanvasElement, private look: HallLook) {}

  /** Bakes the wall when the canvas's size changed. */
  private fit() {
    const w = Math.max(8, Math.ceil(this.canvas.clientWidth / ART)), h = Math.max(8, Math.ceil(this.canvas.clientHeight / ART));
    if (w === this.w && h === this.h) return false;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.image = new ImageData(w, h);
    const n = w * h, hgt = new Float32Array(n);
    this.albedo = new Float32Array(n * 3);
    this.part = new Uint8Array(n);
    this.scene = new Float32Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x, px = this.look === "planks" ? plank(x, y) : ashlar(x, y, this.look === "vault" && (x < 6 || x >= w - 6));
        hgt[i] = px.hgt;
        this.albedo.set(this.look === "vault" ? [px.rgb[0] * 0.92, px.rgb[1] * 0.88, px.rgb[2] * 1.02] : px.rgb, i * 3);
      }
    if (this.look === "keep") this.bakeWindow(hgt);
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        this.sx[i] = (hgt[y * w + Math.min(w - 1, x + 1)] - hgt[y * w + Math.max(0, x - 1)]) / 2;
        this.sy[i] = (hgt[Math.min(h - 1, y + 1) * w + x] - hgt[Math.max(0, y - 1) * w + x]) / 2;
      }
    return true;
  }

  /** The keep's window: a tall round-headed opening in a moulded stone
   * surround, its clear glass held by a fancy iron frame (a rose with four
   * lobes in the arch, a mullion and a transom), the land outside below the sky. */
  private bakeWindow(hgt: Float32Array) {
    const { w, h } = this, ww = Math.round(Math.max(30, Math.min(w * 0.46, 110))), r = ww / 2;
    const cx = w / 2, top = Math.round(h * 0.05), wh = Math.round(Math.max(ww * 1.1, Math.min(h * 0.62, ww * 1.75)));
    const archY = top + r, bottom = top + wh, transom = archY + (bottom - archY) * 0.42, rose = { x: cx, y: archY - r * 0.08, r: r * 0.5 };
    this.win = { x0: cx - r, x1: cx + r, y0: top, y1: bottom };
    /** How far inside the opening (x, y) is: negative outside. */
    const inside = (x: number, y: number) => (y < archY ? r - Math.hypot(x - cx, y - archY) : Math.min(r - Math.abs(x - cx), bottom - y));
    const horizon = bottom - wh * 0.2;
    for (let y = Math.max(0, top - 6); y < Math.min(h, bottom + 7); y++)
      for (let x = Math.max(0, Math.floor(cx - r - 6)); x < Math.min(w, Math.ceil(cx + r + 6)); x++) {
        const i = y * w + x, px = x + 0.5, py = y + 0.5, d = inside(px, py);
        if (y >= bottom && y < bottom + 4 && Math.abs(px - cx) < r + 6) {
          // The sill: a ledge of pale stone, lit along its top.
          this.part[i] = SURROUND;
          hgt[i] = y === bottom ? 1 : 0.6 - (y - bottom) * 0.12;
          this.albedo.set(y === bottom ? [150, 140, 124] : [104, 96, 86], i * 3);
          continue;
        }
        if (d < -5 || y >= bottom) continue;
        if (d < 0) {
          // The surround's mouldings: three rolls stepping in to the glass.
          const band = Math.floor(-d);
          this.part[i] = SURROUND;
          hgt[i] = [0.55, 1, 0.75, 1, 0.4][band] ?? 0.3;
          const t = 0.9 + h01(x, y, 4) * 0.12, base = band === 1 || band === 3 ? 136 : 112;
          this.albedo.set([base * t, base * 0.94 * t, base * 0.86 * t], i * 3);
          continue;
        }
        // The iron frame: a rim, a mullion, a transom, the rose and its lobes.
        const ring = (c: { x: number; y: number }, rr: number) => Math.abs(Math.hypot(px - c.x, py - c.y) - rr) < 0.75;
        const lobe = rose.r * 0.46;
        const iron = d < 1.4 || (Math.abs(px - cx) < 0.9 && py > rose.y + rose.r - 0.5) || (Math.abs(py - transom) < 0.8)
          || ring(rose, rose.r) || ring(rose, rose.r * 0.18)
          || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => ring({ x: rose.x + a * lobe, y: rose.y + b * lobe }, lobe * 0.98))
          || (py > transom && py < bottom && Math.abs(Math.abs(px - cx) - r * 0.5) < 0.6)
          || (py > transom && Math.abs(py - (transom + bottom) / 2) < 0.6)
          || (py < rose.y + rose.r && py > archY - r * 0.1 && py > rose.y && Math.abs(Math.abs(px - cx) - (rose.r + (r - rose.r) / 2)) < 0.6);
        if (iron) {
          this.part[i] = TRACERY;
          hgt[i] = 1;
          this.albedo.set([34, 31, 30], i * 3);
          continue;
        }
        this.part[i] = GLASS;
        // Outside: hills, then the city's roofs and its wall under the sky.
        const hill = horizon + Math.sin(px * 0.11) * 2.2 + Math.sin(px * 0.037 + 1) * 3;
        const roofs = bottom - wh * 0.08 - (Math.floor(px / 5) % 3 === 0 ? 3 : Math.floor(px / 5) % 3 === 1 ? 1.5 : 0) + (h01(Math.floor(px / 5), 1, 7) * 2);
        const wall = bottom - wh * 0.045 - (Math.floor(px / 2) % 2 ? 1 : 0);
        this.scene[i] = py > wall ? -3 : py > roofs ? -2 : py > hill ? -1 : (py - top) / Math.max(1, hill - top);
      }
  }

  /** Lights the wall (at most every `FRAME_MS`, or once with Reduce
   * motion) for wall-clock `now`, its torches and, in the keep, `day` in [0, 1]. */
  draw(now: number, torches: TorchSpot[], day: number, reduced: boolean) {
    const resized = this.fit();
    if (!resized && now - this.last < (reduced ? 3000 : FRAME_MS)) return;
    this.last = now;
    const { w, h, albedo, sx, sy, part, scene } = this, out = this.image!.data;
    const keep = this.look === "keep", night = 1 - day;
    // The candle-warm torches; their flicker swells and shrinks their pools.
    const lights = torches.map((t, k) => {
      const f = getTorchFlicker({ x: k * 7 + 3, y: 11 }, now, reduced), sway = getTorchSway({ x: k * 7 + 3, y: 11 }, now, reduced);
      return { x: t.x / ART + sway.x * 2, y: t.y / ART - 3, r: Math.min(w, h) * 0.5 + 40 * f, k: 1.25 * f, rgb: [1, 0.62, 0.3] as RGB };
    });
    const amb: RGB = this.look === "planks" ? [0.2, 0.15, 0.12] : this.look === "vault" ? [0.25, 0.21, 0.32] : [0.16 + day * 0.14, 0.16 + day * 0.15, 0.2 + day * 0.15];
    const sky = skyColours(day), win = this.win, sun = keep ? day : 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4, p = part[i];
        if (p === GLASS) {
          const s = scene[i];
          let c: RGB;
          if (s >= 0) c = mix(sky.top, sky.low, s);
          else c = s === -1 ? sky.hill : s === -2 ? sky.roofs : sky.wall;
          // A faint sheen across clear glass, and a star or two at night.
          const sheen = Math.abs(((x - y * 0.6) % 14 + 14) % 14 - 3) < 1 ? 1.12 : 1;
          const star = s > 0 && s < 0.7 && night > 0.5 && h01(x, y, 11) > 0.985 ? 120 * night : 0;
          out[o] = Math.min(255, c[0] * sheen + star);
          out[o + 1] = Math.min(255, c[1] * sheen + star);
          out[o + 2] = Math.min(255, c[2] * sheen + star);
          out[o + 3] = 255;
          continue;
        }
        let lr = amb[0], lg = amb[1], lb = amb[2];
        for (const l of lights) {
          const dx = l.x - x, dy = l.y - y, d = Math.hypot(dx, dy);
          if (d >= l.r) continue;
          const f = (1 - d / l.r) ** 2 * l.k * facing(sx[i], sy[i], dx, dy, d);
          lr += l.rgb[0] * f;
          lg += l.rgb[1] * f;
          lb += l.rgb[2] * f;
        }
        if (sun > 0) {
          // The sun through the window: its glow on the stone round it, and a
          // shaft of light falling down and to the right across the wall.
          const mx = (win.x0 + win.x1) / 2, my = (win.y0 + win.y1) / 2, dx = mx - x, dy = my - y, d = Math.hypot(dx, dy);
          const glow = Math.max(0, 1 - d / ((win.x1 - win.x0) * 1.3)) ** 2 * 0.55 * sun * facing(sx[i], sy[i], dx, dy, d);
          let shaft = 0;
          if (y > win.y1 && p === WALL) {
            const run = y - win.y1, lx = win.x0 + run * 0.45, rx = win.x1 + run * 0.45;
            if (x >= lx && x <= rx) shaft = 0.5 * sun * Math.max(0, 1 - run / (h * 0.9)) * Math.min(1, Math.min(x - lx, rx - x) / 4);
          }
          lr += (glow + shaft) * 1.0;
          lg += (glow + shaft) * 0.93;
          lb += (glow + shaft) * 0.78;
        }
        out[o] = Math.min(255, albedo[i * 3] * lr * 1.5);
        out[o + 1] = Math.min(255, albedo[i * 3 + 1] * lg * 1.5);
        out[o + 2] = Math.min(255, albedo[i * 3 + 2] * lb * 1.5);
        out[o + 3] = 255;
      }
    this.canvas.getContext("2d")!.putImageData(this.image!, 0, 0);
  }
}

/** Worn oak boards laid in courses, each board its own tone, with grain,
 * knots, scuffs and a nail at each end; the boards' edges bevelled. */
function plank(x: number, y: number): { rgb: RGB; hgt: number } {
  const bh = 11, course = Math.floor(y / bh), ly = y - course * bh;
  const off = Math.floor(h01(course, 3, 1) * 60), len = 46 + Math.floor(h01(course, 5, 2) * 30);
  const board = Math.floor((x + off) / len), lx = (x + off) - board * len;
  const edge = Math.min(lx, len - 1 - lx, ly, bh - 1 - ly);
  if (ly === 0 || lx === 0) return { rgb: [22, 14, 9], hgt: 0 };
  const tone = 0.78 + h01(board, course, 3) * 0.32;
  // Grain: long streaks along the board, wavering, each row its own.
  const wave = Math.sin((lx + h01(board, course, 4) * 40) * 0.09 + ly * 0.8) * 0.5 + 0.5;
  const streak = 0.9 + (h01(course * bh + ly, board, 5) - 0.5) * 0.16 + wave * 0.06;
  // A knot or none per board: dark rings round a point.
  const kx = 8 + h01(board, course, 6) * (len - 16), ky = 3 + h01(board, course, 7) * (bh - 6);
  const kd = Math.hypot((lx - kx) * 0.6, ly - ky), knot = h01(board, course, 8) > 0.55 && kd < 2.6 ? (kd < 1.2 ? 0.55 : 0.8) : 1;
  // Scuffed where hands and boots wore it pale.
  const worn = h01(Math.floor(lx / 3), course * 31 + board, 9) > 0.93 ? 1.14 : 1;
  const nail = ly === Math.floor(bh / 2) && (lx === 2 || lx === len - 3);
  const t = tone * streak * knot * worn;
  if (nail) return { rgb: [120, 116, 108], hgt: 1 };
  return { rgb: [112 * t, 72 * t, 42 * t], hgt: Math.min(1, edge / 1.6) * (0.88 + h01(x, y, 10) * 0.12) };
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** The view's colours by daylight: night, a warm dawn and dusk, and day. */
function skyColours(day: number) {
  const dusk = Math.max(0, 1 - Math.abs(day - 0.45) * 3.2);
  const night = { top: [10, 16, 38] as RGB, low: [28, 36, 70] as RGB, hill: [14, 18, 26] as RGB, roofs: [10, 11, 16] as RGB, wall: [16, 16, 20] as RGB };
  const noon = { top: [86, 150, 214] as RGB, low: [196, 226, 238] as RGB, hill: [70, 104, 66] as RGB, roofs: [104, 66, 52] as RGB, wall: [118, 112, 102] as RGB };
  const at = (k: keyof typeof noon) => mix(night[k], noon[k], day);
  const low = mix(at("low"), [236, 150, 96], dusk * 0.7);
  return { top: at("top"), low, hill: at("hill"), roofs: at("roofs"), wall: at("wall") };
}

// ── The torches ──────────────────────────────────────────────────────────
/** A sconce's sprite size, in art pixels. */
export const SCONCE = { w: 11, h: 24 };
const OUT = "#0b0907";
/** Paints a wall torch into `canvas` (`SCONCE` pixels): an iron bracket on a
 * backplate, an oak haft wrapped in pitch-soaked rags, and its flame, which
 * leans and licks with the wall clock (still under Reduce motion). `side` is
 * the wall it hangs on, so the bracket reaches out of it. */
export function paintSconce(canvas: HTMLCanvasElement, now: number, side: "left" | "right", reduced: boolean) {
  if (canvas.width !== SCONCE.w) {
    canvas.width = SCONCE.w;
    canvas.height = SCONCE.h;
  }
  const c = canvas.getContext("2d")!, flip = side === "right";
  c.clearRect(0, 0, SCONCE.w, SCONCE.h);
  const px = (x: number, y: number, colour: string, w = 1, hh = 1) => {
    c.fillStyle = colour;
    c.fillRect(flip ? SCONCE.w - x - w : x, y, w, hh);
  };
  // The backplate on the wall, riveted.
  px(0, 13, OUT, 3, 9);
  px(0, 14, "#3a3632", 2, 7);
  px(0, 15, "#6a645c", 1, 1);
  px(0, 19, "#6a645c", 1, 1);
  // The bracket arm and its cup.
  px(2, 17, OUT, 4, 3);
  px(2, 18, "#4a4440", 3, 1);
  px(4, 13, OUT, 6, 5);
  px(5, 14, "#55504a", 4, 3);
  px(5, 14, "#8a8278", 4, 1);
  // The haft, then its rag wrapping.
  px(5, 9, OUT, 4, 5);
  px(6, 10, "#5a3a22", 2, 4);
  px(6, 9, "#2a1c14", 2, 1);
  // The flame: an outlined tongue, leaning and stretching.
  const f = getTorchFlicker({ x: flip ? 5 : 2, y: 9 }, now, reduced), sway = getTorchSway({ x: flip ? 5 : 2, y: 9 }, now, reduced);
  const lean = Math.round(sway.x * 3), tall = Math.round(7 + 2 * f + sway.y);
  const rows: [number, number, string][] = [];
  for (let k = 0; k < tall; k++) {
    const t = k / tall, half = Math.max(0, Math.round((1 - t) * 2.2 + (t < 0.3 ? 0.4 : 0))), shift = Math.round(lean * t);
    rows.push([shift, half, t < 0.35 ? "#fff3b0" : t < 0.6 ? "#ffc04a" : t < 0.85 ? "#ff7a1a" : "#c8401a"]);
  }
  rows.forEach(([shift, half], k) => px(6 + shift - half - 1, 8 - k, OUT, half * 2 + 4, 1));
  px(6 + rows[rows.length - 1][0], 8 - rows.length, OUT, 2, 1);
  rows.forEach(([shift, half, colour], k) => {
    px(6 + shift - half, 8 - k, colour, half * 2 + 2, 1);
    if (k < tall * 0.5 && half > 0) px(6 + shift - half, 8 - k, k < tall * 0.3 ? "#ffc04a" : "#ff7a1a", 1, 1);
  });
}
