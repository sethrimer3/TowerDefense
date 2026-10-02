/** Draws the Library: a cathedral nave in pixels, one pixel a world unit,
 * scaled up crisp. The stone walls are lit by their torches through a bump
 * map, the technique Defend's flagstones use (`defend/ground-relief.ts`):
 * each block's height comes from its own art, and the side of each block
 * facing a light brightens while the side facing away darkens. Here it is
 * done per pixel, since the whole nave is only 192 × 300.
 *
 * By day light bleeds in through the stained-glass window and god rays
 * slant down through the dusty air; by night the glass goes dark and stars
 * glint through its clear panes now and then. Shelves, ladders and tables
 * are painted into the same lit image; librarians, flames and the light's
 * glow go over it. */
import { stream } from "../random.ts";
import {
  BAYS, BAY_W, BOOKS_PER_ROW, BOOK_COLORS, FLOOR, H, ROW_H, SHELF_ORDER, TABLES, TABLE_TOP, W, WINDOW,
  bayX, ladderX, slotIndex, unitTop, type Librarian, type LibrarySim,
} from "./sim.ts";

/** One day and night, in ms of wall-clock time. */
export const DAY_MS = 8 * 60 * 1000;
/** Daylight in [0, 1] at wall-clock time `now`: a long day, a long night, a
 * dawn and a dusk between. */
export function daylight(now: number) {
  const s = Math.sin(((now % DAY_MS) / DAY_MS) * Math.PI * 2);
  return Math.min(1, Math.max(0, 0.5 + s * 1.4));
}

/** The torches on the nave's walls and piers, and the tables' candles. */
const TORCHES = [
  { x: 8, y: 150 }, { x: 8, y: 226 }, { x: W - 9, y: 150 }, { x: W - 9, y: 226 }, { x: 60, y: 92 }, { x: W - 61, y: 92 },
];
const CANDLES = TABLES.map((t) => ({ x: t.x + Math.floor(t.w / 2), y: TABLE_TOP - 3 }));
/** The vault: a pointed arch springing at SPRING, its arcs of radius ARCH. */
const SPRING = 140, ARCH = 134;
const vaultY = (x: number) => {
  const half = x <= W / 2 ? x : W - x, dx = half - ARCH;
  return SPRING - Math.sqrt(ARCH * ARCH - dx * dx);
};
/** The window's outline: a lancet whose pointed head starts at HEAD. */
const HEAD = WINDOW.top + 30;
function inWindow(x: number, y: number) {
  const { x0, x1, top, bottom } = WINDOW;
  if (x < x0 || x >= x1 || y < top || y >= bottom) return false;
  if (y >= HEAD) return true;
  const span = x1 - x0, r = span * 0.75, half = x - x0 < span / 2 ? x - x0 + 0.5 : x1 - x - 0.5, dx = half - r;
  return y + 0.5 >= HEAD - Math.sqrt(r * r - dx * dx);
}

const enum Kind { Outside, Wall, Floor, Glass, Lead, Clear }
type RGB = [number, number, number];
const GLASS: RGB[] = [[170, 30, 40], [30, 60, 170], [200, 150, 30], [30, 120, 70], [110, 40, 140], [190, 90, 30]];

/** A fixed number in [0, 1) for a few integers. */
function h01(a: number, b: number, c = 0) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Mote = { x: number; y: number; vx: number; vy: number; life: number };

export class LibraryRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private image: ImageData;
  private px: Uint32Array;
  // The baked nave: what each pixel is, its colour, and its slope.
  private kind = new Uint8Array(W * H);
  private base = new Float32Array(W * H * 3);
  private sx = new Float32Array(W * H);
  private sy = new Float32Array(W * H);
  // Each frame's scene colour (nave with shelves, ladders, tables) and light.
  private scene = new Float32Array(W * H * 3);
  private relief = new Uint8Array(W * H);
  private light = new Float32Array(W * H * 3);
  private sceneKey = "";
  private glow: HTMLCanvasElement;
  private motes: Mote[] = [];
  private fx = stream("effects");
  private view = { scale: 1, ox: 0, oy: 0 };
  /** Zoom (1 shows the whole nave) and the world point at the view's centre. */
  zoom = 1;
  focus = { x: W / 2, y: H / 2 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.off = document.createElement("canvas");
    this.off.width = W;
    this.off.height = H;
    this.offCtx = this.off.getContext("2d")!;
    this.image = this.offCtx.createImageData(W, H);
    this.px = new Uint32Array(this.image.data.buffer);
    this.glow = makeGlow();
    this.bake();
  }

  // ── The nave, baked once ────────────────────────────────────────────

  private bake() {
    const height = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let kind = Kind.Wall, rgb: RGB, hgt = 0;
        if (y < vaultY(x)) {
          kind = Kind.Outside;
          rgb = [5, 4, 7];
        } else if (y >= FLOOR) {
          kind = Kind.Floor;
          const tile = Math.floor((x + (y >= FLOOR + 6 ? 7 : 0)) / 14), edge = Math.min((x + (y >= FLOOR + 6 ? 7 : 0)) % 14, 13 - ((x + (y >= FLOOR + 6 ? 7 : 0)) % 14), (y - FLOOR) % 6, 5 - ((y - FLOOR) % 6));
          const t = 0.8 + h01(tile, y >= FLOOR + 6 ? 1 : 0, 5) * 0.35;
          rgb = [86 * t, 80 * t, 76 * t];
          hgt = Math.min(1, edge / 1.5);
        } else if (inWindow(x, y)) {
          const { x0 } = WINDOW, cx = (WINDOW.x0 + WINDOW.x1) / 2, rose = { x: cx, y: HEAD - 4, r: 13 };
          const dx = x + 0.5 - rose.x, dy = y + 0.5 - rose.y, dr = Math.sqrt(dx * dx + dy * dy);
          if (dr < rose.r) {
            // The rose: petals of colour round a golden eye, ringed in lead.
            const petal = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 8);
            const ring = Math.abs(dr - rose.r + 1) < 0.8 || Math.abs(dr - 5) < 0.6 || (dr > 5 && Math.abs(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 8 - Math.round(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 8)) * dr < 0.5);
            kind = ring ? Kind.Lead : Kind.Glass;
            rgb = ring ? [20, 18, 16] : dr < 5 ? GLASS[2] : GLASS[petal % 2 ? 0 : 1];
          } else {
            const col = Math.floor((x - x0) / 7), row = Math.floor((y - WINDOW.top) / 9);
            const lead = (x - x0) % 7 === 0 || (y - WINDOW.top) % 9 === 0 || x === WINDOW.x1 - 1;
            const clear = h01(col, row, 11) < 0.22;
            kind = lead ? Kind.Lead : clear ? Kind.Clear : Kind.Glass;
            rgb = lead ? [20, 18, 16] : clear ? [150, 170, 190] : GLASS[Math.floor(h01(col, row, 3) * GLASS.length)];
          }
        } else {
          // Ashlar: courses of blocks, bigger on the piers at either side.
          const pier = x < BAYS_EDGE || x >= W - BAYS_EDGE;
          const ch = pier ? 12 : 9, bw = pier ? 16 : 18;
          const course = Math.floor(y / ch), off = course % 2 ? bw / 2 : 0;
          const bx = Math.floor((x + off) / bw), lx = (x + off) % bw, ly = y % ch;
          const edge = Math.min(lx, bw - 1 - lx, ly, ch - 1 - ly);
          const t = (pier ? 0.95 : 0.82) * (0.82 + h01(bx, course, 9) * 0.3) * (0.93 + h01(x, y, 1) * 0.12);
          rgb = edge === 0 ? [30, 27, 26] : [92 * t, 86 * t, 80 * t];
          hgt = edge === 0 ? 0 : Math.min(1, edge / 2.2) * (0.85 + h01(x, y, 2) * 0.15);
        }
        // A carved rib along the vault's edge.
        if (kind === Kind.Wall && y - vaultY(x) < 3) {
          rgb = [60, 55, 52];
          hgt = 1 - (y - vaultY(x)) / 3;
        }
        this.kind[i] = kind;
        this.base[i * 3] = rgb[0];
        this.base[i * 3 + 1] = rgb[1];
        this.base[i * 3 + 2] = rgb[2];
        height[i] = hgt;
      }
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        this.sx[i] = (height[i + 1] - height[i - 1]) * 0.5;
        this.sy[i] = (height[i + W] - height[i - W]) * 0.5;
      }
  }

  // ── The scene: the nave with what the library has put in it ─────────

  private paintScene(sim: LibrarySim) {
    const scene = this.scene, base = this.base;
    scene.set(base);
    for (let i = 0; i < W * H; i++) this.relief[i] = this.kind[i] === Kind.Wall || this.kind[i] === Kind.Floor ? 1 : 0;
    const put = (x: number, y: number, c: RGB) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      const i = y * W + x;
      scene[i * 3] = c[0];
      scene[i * 3 + 1] = c[1];
      scene[i * 3 + 2] = c[2];
      this.relief[i] = 0;
    };
    const heights = new Array(BAYS).fill(0);
    for (let n = 0; n < sim.shelves; n++) {
      const { bay, unit } = SHELF_ORDER[n];
      heights[bay] = Math.max(heights[bay], unit + 1);
      const x0 = bayX(bay), y0 = unitTop(unit);
      for (let y = y0; y < y0 + 14; y++)
        for (let x = x0; x < x0 + BAY_W; x++) {
          const post = x === x0 || x === x0 + BAY_W - 1, plank = (y - y0) % ROW_H === ROW_H - 1;
          put(x, y, post || plank ? [96, 62, 34] : [40, 26, 16]);
        }
      for (let row = 0; row < 2; row++)
        for (let i = 0; i < BOOKS_PER_ROW; i++) {
          const c = sim.slots[slotIndex(bay, unit, row, i)];
          if (!c) continue;
          const rgb = hex(BOOK_COLORS[c]), tall = 4 + Math.floor(h01(bay * 31 + unit, row * 7 + i, 4) * 3), band = h01(bay * 31 + unit, row * 7 + i, 6) < 0.4 ? 2 + (c % 2) : -1;
          const bx = x0 + 1 + i * 2, by = y0 + row * ROW_H + ROW_H - 1;
          for (let k = 1; k <= tall && k < ROW_H; k++) {
            put(bx, by - k, rgb);
            put(bx + 1, by - k, k === band ? [190, 160, 84] : [rgb[0] * 0.75, rgb[1] * 0.75, rgb[2] * 0.75]);
          }
        }
    }
    // A cornice on each bay's top unit.
    for (let b = 0; b < BAYS; b++) if (heights[b]) for (let x = bayX(b) - 1; x <= bayX(b) + BAY_W; x++) put(x, unitTop(heights[b] - 1) - 1, [120, 80, 44]);
    for (let b = 0; b < BAYS; b++) {
      const h = sim.ladders[b];
      if (!h) continue;
      const lx = ladderX(b), top = unitTop(h - 1);
      for (let y = top; y < FLOOR; y++) {
        put(lx, y, [150, 106, 58]);
        put(lx + 2, y, [150, 106, 58]);
        if (y % 3 === 0) put(lx + 1, y, [128, 90, 48]);
      }
    }
    for (const t of TABLES) {
      for (let x = t.x; x < t.x + t.w; x++) {
        put(x, TABLE_TOP, [128, 84, 44]);
        put(x, TABLE_TOP + 1, [84, 54, 28]);
      }
      for (let y = TABLE_TOP + 2; y < FLOOR; y++) {
        put(t.x + 1, y, [70, 44, 24]);
        put(t.x + t.w - 2, y, [70, 44, 24]);
      }
      const c = t.x + Math.floor(t.w / 2);
      put(c, TABLE_TOP - 1, [230, 220, 190]);
      put(c, TABLE_TOP - 2, [230, 220, 190]);
      // A stack of ledgers at one end.
      for (let k = 0; k < 3; k++) for (let x = t.x + 3; x < t.x + 7; x++) put(x, TABLE_TOP - 1 - k, k === 1 ? [40, 60, 90] : [110, 40, 34]);
    }
  }

  // ── Light ───────────────────────────────────────────────────────────

  private lightUp(time: number, day: number) {
    const L = this.light, sx = this.sx, sy = this.sy, relief = this.relief;
    const ar = 0.07 + day * 0.12, ag = 0.07 + day * 0.115, ab = 0.11 + day * 0.11;
    const wx = (WINDOW.x0 + WINDOW.x1) / 2, wy = (WINDOW.top + WINDOW.bottom) / 2;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, dx = x - wx, dy = y - wy;
        // Daylight from the window, strongest near it.
        const near = day * 0.34 * Math.max(0, 1 - Math.sqrt(dx * dx * 1.4 + dy * dy) / 230);
        L[i * 3] = ar + near;
        L[i * 3 + 1] = ag + near * 0.96;
        L[i * 3 + 2] = ab + near * 0.9;
      }
    const shine = (lx: number, ly: number, r: number, k: number, cr: number, cg: number, cb: number) => {
      const x0 = Math.max(1, Math.floor(lx - r)), x1 = Math.min(W - 2, Math.ceil(lx + r));
      const y0 = Math.max(1, Math.floor(ly - r)), y1 = Math.min(H - 2, Math.ceil(ly + r));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = lx - x, dy = ly - y, d = Math.sqrt(dx * dx + dy * dy);
          if (d >= r) continue;
          const i = y * W + x, fall = (1 - d / r) * (1 - d / r) * k;
          // The face of a block that looks toward the light catches it.
          const face = relief[i] && d > 0.5 ? Math.max(0.15, 1 + 2.6 * (-(sx[i] * dx + sy[i] * dy) / d)) : 1;
          const v = fall * face;
          L[i * 3] += v * cr;
          L[i * 3 + 1] += v * cg;
          L[i * 3 + 2] += v * cb;
        }
    };
    TORCHES.forEach((t, n) => shine(t.x, t.y - 3, 70, flicker(time, n) * 1.25, 1, 0.62, 0.3));
    CANDLES.forEach((c, n) => shine(c.x, c.y, 28, flicker(time * 1.7, n + 9) * 0.75, 1, 0.75, 0.45));
  }

  // ── A frame ─────────────────────────────────────────────────────────

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const scale = Math.min(w / W, h / H) * this.zoom;
    const half = { x: w / scale / 2, y: h / scale / 2 };
    this.focus.x = half.x * 2 >= W ? W / 2 : Math.max(half.x, Math.min(W - half.x, this.focus.x));
    this.focus.y = half.y * 2 >= H ? H / 2 : Math.max(half.y, Math.min(H - half.y, this.focus.y));
    this.view = { scale, ox: Math.round(w / 2 - this.focus.x * scale), oy: Math.round(h / 2 - this.focus.y * scale) };
  }
  /** Pans by a drag of device pixels. */
  pan(dx: number, dy: number) {
    this.focus.x -= dx / this.view.scale;
    this.focus.y -= dy / this.view.scale;
  }
  /** Zooms to `zoom` keeping the world point under device pixel (px, py). */
  zoomTo(zoom: number, px: number, py: number) {
    const wx = (px - this.view.ox) / this.view.scale, wy = (py - this.view.oy) / this.view.scale;
    this.zoom = Math.max(1, Math.min(4, zoom));
    this.focus = { x: wx, y: wy };
  }

  draw(sim: LibrarySim, now: number, time: number, effects: boolean) {
    this.resize();
    const day = daylight(now);
    const key = `${sim.shelves}|${sim.ladders.join(",")}|${slotsKey(sim)}`;
    if (key !== this.sceneKey) {
      this.sceneKey = key;
      this.paintScene(sim);
    }
    this.lightUp(time, day);
    const px = this.px, S = this.scene, L = this.light, kind = this.kind;
    const sky: RGB = [8 + day * 120, 14 + day * 150, 40 + day * 170];
    for (let i = 0; i < W * H; i++) {
      const k = kind[i];
      let r: number, g: number, b: number;
      if (k === Kind.Glass || k === Kind.Clear) {
        // Glass glows with the sky behind it.
        const lum = (0.1 + day * 0.85) * (0.85 + h01(i % W >> 2, (i / W) >> 2, 21) * 0.3);
        r = S[i * 3] * lum + (k === Kind.Clear ? sky[0] * 0.5 : 0);
        g = S[i * 3 + 1] * lum + (k === Kind.Clear ? sky[1] * 0.5 : 0);
        b = S[i * 3 + 2] * lum + (k === Kind.Clear ? sky[2] * 0.5 : 0);
      } else {
        r = S[i * 3] * L[i * 3];
        g = S[i * 3 + 1] * L[i * 3 + 1];
        b = S[i * 3 + 2] * L[i * 3 + 2];
      }
      px[i] = 0xff000000 | (c255(b) << 16) | (c255(g) << 8) | c255(r);
    }
    this.offCtx.putImageData(this.image, 0, 0);

    const ctx = this.ctx, { scale, ox, oy } = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#050407";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.drawImage(this.off, 0, 0);
    if (day < 0.6) this.drawStars(now, 1 - day / 0.6);
    if (effects && day > 0.02) this.drawRays(now, day);
    for (const l of sim.librarians) this.drawLibrarian(l, time);
    this.drawFlames(time, effects);
  }

  private drawStars(now: number, night: number) {
    const ctx = this.ctx;
    for (let n = 0; n < 40; n++) {
      const x = WINDOW.x0 + Math.floor(h01(n, 1, 77) * (WINDOW.x1 - WINDOW.x0)), y = WINDOW.top + Math.floor(h01(n, 2, 77) * (WINDOW.bottom - WINDOW.top));
      const i = y * W + x;
      if (this.kind[i] !== Kind.Clear) continue;
      // Each star shows only now and then, for a few seconds.
      const phase = Math.sin(now / (900 + h01(n, 3, 77) * 1600) + n * 2.1);
      if (phase < 0.55) continue;
      ctx.globalAlpha = night * Math.min(1, (phase - 0.55) * 4);
      ctx.fillStyle = h01(n, 4, 77) < 0.3 ? "#ffe9b0" : "#e8f0ff";
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** Sunbeams from the window, slanting with the hour, and dust in them. */
  private drawRays(now: number, day: number) {
    const ctx = this.ctx, tilt = Math.sin(((now % DAY_MS) / DAY_MS) * Math.PI * 2 - Math.PI / 2) * 0.55;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const tints = ["255,214,150", "255,170,150", "170,190,255", "255,230,170", "200,255,190"];
    for (let k = 0; k < 5; k++) {
      const a = WINDOW.x0 + 3 + k * 8, b = a + 6, top = HEAD + 6 + (k % 2) * 10, len = FLOOR - top;
      const pulse = 0.75 + 0.25 * Math.sin(now / (3100 + k * 700) + k);
      const grad = ctx.createLinearGradient(0, top, 0, FLOOR);
      grad.addColorStop(0, `rgba(${tints[k]},${0.2 * day * pulse})`);
      grad.addColorStop(1, `rgba(${tints[k]},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(a, top);
      ctx.lineTo(b, top);
      ctx.lineTo(b + 6 + tilt * len, FLOOR);
      ctx.lineTo(a - 6 + tilt * len, FLOOR);
      ctx.closePath();
      ctx.fill();
    }
    // Motes drifting through the light.
    while (this.motes.length < 26) {
      const top = HEAD + this.fx() * (FLOOR - HEAD - 20);
      this.motes.push({ x: WINDOW.x0 + this.fx() * (WINDOW.x1 - WINDOW.x0) + tilt * (top - HEAD), y: top, vx: (this.fx() - 0.5) * 0.05, vy: (this.fx() - 0.3) * 0.04, life: 200 + this.fx() * 300 });
    }
    ctx.fillStyle = "#fff4d0";
    this.motes = this.motes.filter((m) => {
      m.x += m.vx;
      m.y += m.vy;
      ctx.globalAlpha = day * 0.5 * Math.min(1, m.life / 60);
      ctx.fillRect(m.x, m.y, 0.6, 0.6);
      return --m.life > 0;
    });
    ctx.restore();
  }

  private drawLibrarian(l: Librarian, time: number) {
    const ctx = this.ctx, x = Math.round(l.x) - 1, y = Math.round(l.y), i = Math.min(H - 1, Math.max(0, y - 3)) * W + Math.min(W - 1, Math.max(0, x));
    const lum = Math.min(1, 0.5 + (this.light[i * 3] + this.light[i * 3 + 1]) * 0.35);
    const c = Math.round(240 * lum);
    ctx.fillStyle = `rgb(${c},${c - 4},${c - 12})`;
    // A step's bob while walking.
    const bob = l.action === "walk" && Math.floor(time * 6 + l.id) % 2 ? 1 : 0;
    ctx.fillRect(x, y - 4 - bob, 2, 4 + bob);
    hat(ctx, l, x, y - 4 - bob);
    if (l.carrying) {
      ctx.fillStyle = BOOK_COLORS[l.carrying];
      ctx.fillRect(l.facing > 0 ? x + 2 : x - 1, y - 2 - bob, 1, 2);
    }
    if ((l.action === "build" || l.action === "grab" || l.action === "place") && Math.floor(time * 5) % 2) {
      ctx.fillStyle = l.action === "build" ? "#9a9ca4" : "#e8d8a8";
      ctx.fillRect(l.facing > 0 ? x + 2 : x - 1, y - 4, 1, 1);
    }
    if (l.action === "write") {
      if (l.reading) {
        ctx.fillStyle = "#efe6cc";
        ctx.fillRect(l.facing > 0 ? x + 3 : x - 4, TABLE_TOP - 1, 2, 1);
        ctx.fillStyle = BOOK_COLORS[l.reading];
        ctx.fillRect(l.facing > 0 ? x + 5 : x - 2, TABLE_TOP - 1, 1, 1);
      }
      if (Math.floor(time * 3 + l.id) % 3 === 0) {
        ctx.fillStyle = "#d8d2c4";
        ctx.fillRect(l.facing > 0 ? x + 2 : x - 1, y - 3, 1, 1);
      }
    }
    if (l.action === "read") {
      ctx.fillStyle = "#efe6cc";
      ctx.fillRect(l.facing > 0 ? x + 2 : x - 1, y - 3, 1, 1);
    }
  }

  private drawFlames(time: number, effects: boolean) {
    const ctx = this.ctx;
    TORCHES.forEach((t, n) => {
      ctx.fillStyle = "#2a2622";
      ctx.fillRect(t.x - 1, t.y, 3, 1);
      ctx.fillRect(t.x, t.y - 1, 1, 3);
      const f = flicker(time, n);
      ctx.fillStyle = "#ff8a2a";
      ctx.fillRect(t.x - (f > 1 ? 1 : 0), t.y - 3, f > 1 ? 3 : 1, 2);
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(t.x, t.y - 3 - (f > 0.95 ? 1 : 0), 1, 1 + (f > 0.95 ? 1 : 0));
    });
    CANDLES.forEach((c, n) => {
      ctx.fillStyle = flicker(time * 1.7, n + 9) > 1 ? "#ffe9a0" : "#ffb24a";
      ctx.fillRect(c.x, c.y, 1, 1);
    });
    if (!effects) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    TORCHES.forEach((t, n) => {
      ctx.globalAlpha = 0.35 * flicker(time, n);
      ctx.drawImage(this.glow, t.x + 0.5 - 14, t.y - 2.5 - 14, 28, 28);
    });
    CANDLES.forEach((c, n) => {
      ctx.globalAlpha = 0.3 * flicker(time * 1.7, n + 9);
      ctx.drawImage(this.glow, c.x + 0.5 - 7, c.y + 0.5 - 7, 14, 14);
    });
    ctx.restore();
  }
}

/** Each librarian's scholarly hat, over the head whose top row is `top`. */
function hat(ctx: CanvasRenderingContext2D, l: Librarian, x: number, top: number) {
  ctx.fillStyle = l.tint;
  const f = l.facing > 0 ? 0 : 1;
  switch (l.hat) {
    case "mortarboard":
      ctx.fillStyle = "#16141a";
      ctx.fillRect(x - 1, top - 1, 4, 1);
      ctx.fillRect(x, top, 2, 1);
      ctx.fillStyle = "#e0b040";
      ctx.fillRect(f ? x - 1 : x + 2, top, 1, 1);
      break;
    case "wizard":
      ctx.fillRect(x - 1, top - 1, 4, 1);
      ctx.fillRect(x, top - 2, 2, 1);
      ctx.fillRect(f ? x : x + 1, top - 3, 1, 1);
      ctx.fillRect(f ? x - 1 : x + 2, top - 4, 1, 1);
      ctx.fillStyle = "#ffd860";
      ctx.fillRect(x + f, top - 2, 1, 1);
      break;
    case "beret":
      ctx.fillStyle = "#8a2424";
      ctx.fillRect(x - 1, top - 1, 4, 1);
      ctx.fillRect(f ? x - 1 : x + 1, top - 2, 2, 1);
      break;
    case "hood":
      ctx.fillStyle = "#5a3a22";
      ctx.fillRect(x, top - 1, 2, 1);
      ctx.fillRect(f ? x + 2 : x - 1, top - 1, 1, 3);
      break;
    case "coif":
      ctx.fillRect(x, top - 2, 2, 2);
      ctx.fillStyle = "#c8a050";
      ctx.fillRect(x, top - 1, 2, 1);
      break;
  }
}

const BAYS_EDGE = (W - BAYS * BAY_W) / 2;
const c255 = (v: number) => (v >= 255 ? 255 : v <= 0 ? 0 : v | 0);
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
/** A torch's brightness over time: slow sway and quick gutter. */
const flicker = (t: number, n: number) => 0.88 + 0.08 * Math.sin(t * 2.3 + n * 1.7) + 0.06 * Math.sin(t * 9.1 + n * 4.3) + 0.03 * Math.sin(t * 23 + n);

/** Changes to the shelves' books, cheaply: a running sum. */
function slotsKey(sim: LibrarySim) {
  let h = 0;
  for (let i = 0; i < sim.slots.length; i++) if (sim.slots[i]) h = (h * 31 + i * 7 + sim.slots[i]) | 0;
  return h;
}

function makeGlow() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,200,110,0.9)");
  grad.addColorStop(0.4, "rgba(255,140,50,0.3)");
  grad.addColorStop(1, "rgba(255,120,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

