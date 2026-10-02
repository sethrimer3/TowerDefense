/** Draws the Mine: the grid one pixel a cell into an offscreen image, lit by
 * daylight falling in from the sky and by the torches, lamps and miners
 * underground (a two-channel light map spread cell to cell, dimmed faster
 * through rock than air), then scaled up crisp under a camera, with the
 * headframe, hut, carts, hoist bucket, miners and dust drawn over it. */
import { stream } from "../random.ts";
import { CART_LOAD, type MineSim } from "./sim.ts";
import {
  AIR, BEDROCK, CELLS, DIRT, GOLD, GRASS, H, IRON, LADDER, LAMP, RAIL, ROCK, RUBBLE, STONE, TIMBER, TORCH, W, hash01, idx, isPassable, type Material,
} from "./world.ts";

type RGB = [number, number, number];
/** Each material's shades, picked per cell by a fixed hash. */
const SHADES: Record<number, RGB[]> = {
  [GRASS]: [[86, 140, 52], [74, 124, 44], [98, 152, 60]],
  [DIRT]: [[110, 76, 46], [98, 67, 40], [121, 85, 52], [90, 61, 37]],
  [ROCK]: [[124, 118, 110], [106, 101, 95], [138, 132, 122]],
  [STONE]: [[78, 78, 86], [70, 70, 79], [86, 85, 92], [64, 64, 72]],
  [IRON]: [[170, 104, 72], [196, 132, 96], [146, 86, 62]],
  [GOLD]: [[236, 190, 72], [255, 226, 120], [205, 158, 52]],
  [BEDROCK]: [[32, 30, 36], [26, 25, 30], [40, 37, 44]],
  [TIMBER]: [[140, 92, 46], [118, 76, 38], [156, 106, 56]],
  [RUBBLE]: [[104, 102, 104], [88, 86, 90], [118, 114, 112]],
};
const DIRT_BACK: RGB = [44, 31, 21], STONE_BACK: RGB = [30, 30, 36];
const TORCH_RGB: RGB = [255, 196, 96], LAMP_RGB: RGB = [255, 238, 176];
const SKY_TOP: RGB = [70, 104, 156], SKY_LOW: RGB = [206, 188, 160];

/** Little pixel sprites over the surface: `.` is clear. */
const PALETTE: Record<string, string> = {
  w: "#8a5a2c", d: "#5c3a1c", r: "#a33a26", R: "#7a2a1c", s: "#3a3632", g: "#9a9ea6", y: "#ffd27a", k: "#1a1410",
};
const HEADFRAME = [
  "...ddd...",
  "..dgggd..",
  ".dg.d.gd.",
  ".dgd.dgd.",
  "..dgggd..",
  "..wd.dw..",
  "..w...w..",
  ".w.....w.",
  ".w.....w.",
  ".ww...ww.",
  "w.......w",
  "w.......w",
];
const HUT = [
  "....RRR....",
  "..RRrrrRR..",
  ".RrrrrrrrR.",
  "RRRRRRRRRRR",
  ".wwwwwwwww.",
  ".wyw.wkkdw.",
  ".wwww.kkdw.",
  ".wwwwwkkdw.",
];

type Dust = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export class MineRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private image: ImageData;
  private pixels: Uint32Array;
  private sky = new Float32Array(CELLS);
  private warm = new Float32Array(CELLS);
  private shade = new Uint8Array(CELLS);
  private glow: HTMLCanvasElement;
  private litAt = -1e9;
  private paintedVersion = -1;
  private paintedRows = "";
  private seed = -1;
  private dust: Dust[] = [];
  private fx = stream("effects");
  /** The camera: the top-left cell in view and the zoom step (1 = fit width). */
  camX = 0;
  camY = 20;
  zoom = 1;
  follow = false;
  private size = { w: 1, h: 1, scale: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.off = document.createElement("canvas");
    this.off.width = W;
    this.off.height = H;
    this.offCtx = this.off.getContext("2d")!;
    this.image = this.offCtx.createImageData(W, H);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.glow = makeGlow();
  }

  /** Matches the canvas to its box; returns the cells per screen pixel. */
  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.size = { w, h, scale: (w / W) * this.zoom };
    this.clamp();
    return dpr / this.size.scale;
  }
  get scale() {
    return this.size.scale;
  }
  private clamp() {
    const { w, h, scale } = this.size, vw = w / scale, vh = h / scale;
    this.camX = vw >= W ? (W - vw) / 2 : Math.max(0, Math.min(W - vw, this.camX));
    this.camY = Math.max(-8, Math.min(H - vh + 4, this.camY));
  }
  /** Pans by a drag of (dx, dy) device pixels. */
  pan(dx: number, dy: number) {
    this.camX -= dx / this.size.scale;
    this.camY -= dy / this.size.scale;
    this.clamp();
  }
  /** Steps the zoom in (+1) or out (-1) about the device pixel (px, py). */
  zoomBy(step: number, px: number, py: number) {
    const next = Math.max(1, Math.min(4, this.zoom + step));
    if (next === this.zoom) return;
    const cx = this.camX + px / this.size.scale, cy = this.camY + py / this.size.scale;
    this.zoom = next;
    this.size.scale = (this.size.w / W) * next;
    this.camX = cx - px / this.size.scale;
    this.camY = cy - py / this.size.scale;
    this.clamp();
  }
  /** Looks at the top of the shaft. */
  home(sim: MineSim) {
    this.camY = sim.strata.surface[sim.shaftX] - (this.size.h / this.size.scale) * 0.3;
    this.camX = sim.shaftX - this.size.w / this.size.scale / 2;
    this.clamp();
  }

  // ── Light ───────────────────────────────────────────────────────────

  private light(sim: MineSim) {
    const cells = sim.world.cells, sky = this.sky, warm = this.warm, surface = sim.strata.surface;
    sky.fill(0);
    warm.fill(0);
    for (let x = 0; x < W; x++) for (let y = 0; y < surface[x]; y++) if (isPassable(cells[idx(x, y)])) sky[idx(x, y)] = 1;
    for (let i = 0; i < CELLS; i++) {
      const m = cells[i];
      if (m === TORCH) warm[i] = 1.05;
      else if (m === LAMP) warm[i] = 1.3;
    }
    for (const m of sim.miners) if (m.y > surface[m.x]) warm[idx(m.x, m.y - 1)] = Math.max(warm[idx(m.x, m.y - 1)], 0.5);
    for (let pass = 0; pass < 2; pass++) {
      spread(cells, sky, 0.07, 0.24, true);
      spread(cells, warm, 0.075, 0.3, true);
      spread(cells, sky, 0.07, 0.24, false);
      spread(cells, warm, 0.075, 0.3, false);
    }
  }

  // ── Painting ────────────────────────────────────────────────────────

  private paint(sim: MineSim, y0: number, y1: number) {
    const cells = sim.world.cells, px = this.pixels, sky = this.sky, warm = this.warm, shade = this.shade;
    const { surface, stoneTop } = sim.strata;
    for (let y = y0; y < y1; y++) {
      const t = Math.min(1, Math.max(0, y / 50));
      const skyRgb = mix(SKY_TOP, SKY_LOW, t * t);
      for (let x = 0; x < W; x++) {
        const i = idx(x, y), m = cells[i];
        let rgb: RGB;
        if (m === TORCH) {
          px[i] = pack(TORCH_RGB, 1);
          continue;
        }
        if (m === LAMP) {
          px[i] = pack(LAMP_RGB, 1);
          continue;
        }
        if (isPassable(m) && y < surface[x]) {
          rgb = skyRgb;
          if (m === AIR) {
            px[i] = pack(rgb, 1);
            continue;
          }
        } else rgb = y < stoneTop[x] ? DIRT_BACK : STONE_BACK;
        if (m === LADDER) rgb = y % 2 ? [150, 104, 54] : [96, 64, 32];
        else if (m === RAIL) rgb = x % 2 ? [150, 150, 158] : [92, 66, 40];
        else if (m !== AIR) {
          const shades = SHADES[m];
          rgb = shades[shade[i] % shades.length];
          if (m === TIMBER && y % 3 === 0) rgb = [rgb[0] * 0.7, rgb[1] * 0.7, rgb[2] * 0.7];
        }
        // Near the surface the ground keeps a little daylight, fading with depth.
        const s = Math.max(sky[i], 0.5 - (y - surface[x]) * 0.022), w = warm[i];
        const r = s * 0.98 + w * 1.15 + 0.025, g = s * 0.96 + w * 0.8 + 0.025, b = s * 0.94 + w * 0.5 + 0.03;
        px[i] = 0xff000000 | (clamp255(rgb[2] * b) << 16) | (clamp255(rgb[1] * g) << 8) | clamp255(rgb[0] * r);
      }
    }
    this.offCtx.putImageData(this.image, 0, 0, 0, y0, W, y1 - y0);
  }

  /** Draws a frame. `time` is in ms; `effects` turns dust and glow on. */
  draw(sim: MineSim, time: number, effects: boolean) {
    if (sim.seed !== this.seed) {
      this.seed = sim.seed;
      for (let i = 0; i < CELLS; i++) this.shade[i] = Math.floor(hash01(i % W, (i / W) | 0, sim.seed + 77) * 12);
      this.paintedVersion = -1;
      this.litAt = -1e9;
    }
    this.resize();
    const { w, h, scale } = this.size;
    if (this.follow) {
      const below = sim.miners.filter((m) => m.y > sim.strata.surface[m.x]);
      const target = below.length ? Math.max(...below.map((m) => m.y)) - (h / scale) * 0.55 : sim.strata.surface[sim.shaftX] - (h / scale) * 0.3;
      this.camY += (target - this.camY) * 0.05;
      this.clamp();
    }
    const y0 = Math.max(0, Math.floor(this.camY)), y1 = Math.min(H, Math.ceil(this.camY + h / scale) + 1);
    const relight = time - this.litAt > 120;
    if (relight) {
      this.light(sim);
      this.litAt = time;
    }
    const rows = `${y0}:${y1}`;
    if (relight || sim.world.version !== this.paintedVersion || rows !== this.paintedRows) {
      this.paint(sim, y0, y1);
      this.paintedVersion = sim.world.version;
      this.paintedRows = rows;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0b0908";
    ctx.fillRect(0, 0, w, h);
    const ox = Math.round(-this.camX * scale), oy = Math.round(-this.camY * scale);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.drawImage(this.off, 0, y0, W, y1 - y0, 0, y0, W, y1 - y0);
    this.drawSurface(sim);
    if (effects) this.drawGlow(sim, time, y0, y1);
    this.drawHoist(sim);
    for (const c of sim.carts) {
      if (c.y < y0 - 3 || c.y > y1 + 1) continue;
      ctx.fillStyle = "#4a4a52";
      ctx.fillRect(c.x - 1, c.y - 1, 3, 1);
      ctx.fillStyle = "#16141a";
      ctx.fillRect(c.x - 1, c.y, 1, 1);
      ctx.fillRect(c.x + 1, c.y, 1, 1);
      const load = c.iron + c.gold;
      if (load > 0) {
        ctx.fillStyle = c.gold > c.iron ? "#f0c850" : "#c07a50";
        ctx.fillRect(load > CART_LOAD / 2 ? c.x - 1 : c.x, c.y - 2, load > CART_LOAD / 2 ? 3 : 1, 1);
      }
    }
    for (const m of sim.miners) {
      if (m.y < y0 - 2 || m.y > y1 + 2) continue;
      ctx.fillStyle = "#f4f2ec";
      ctx.fillRect(m.x, m.y - 1, 1, 2);
      if (m.iron + m.gold > 0) {
        ctx.fillStyle = m.gold > 0 ? "#f0c850" : "#c07a50";
        ctx.fillRect(m.x - m.facing, m.y, 1, 1);
      }
      if (m.action === "dig" && m.work >= 0 && Math.floor(time / 180 + m.id) % 2 === 0) {
        ctx.fillStyle = "#b9bcc4";
        const wx = m.work % W, wy = (m.work - wx) / W;
        ctx.fillRect(m.x + Math.sign(wx - m.x), wy < m.y - 1 ? m.y - 2 : m.y - 1, 1, 1);
        if (effects && this.fx() < 0.18) this.kick(wx, wy, sim.world.get(wx, wy));
      }
    }
    if (effects) this.drawDust();
  }

  private drawSurface(sim: MineSim) {
    const x0 = sim.shaftX, top = sim.strata.surface[x0];
    sprite(this.ctx, HEADFRAME, x0 - 4, top - HEADFRAME.length);
    const hx = sim.hutX, ht = Math.min(sim.strata.surface[hx - 2], sim.strata.surface[hx + 2], sim.strata.surface[hx]);
    sprite(this.ctx, HUT, hx + 2, ht - HUT.length);
  }

  private drawHoist(sim: MineSim) {
    const ctx = this.ctx, x = sim.shaftX, top = sim.strata.surface[x] - HEADFRAME.length + 2;
    for (const b of sim.buckets) {
      ctx.fillStyle = "#c9c3b4";
      ctx.fillRect(x + 0.45, top, 0.1, b.y - top);
      ctx.fillStyle = "#6a4422";
      ctx.fillRect(x, b.y, 1, 1);
      ctx.fillStyle = b.gold > b.iron ? "#f0c850" : "#c07a50";
      ctx.fillRect(x, b.y - 0.3, 1, 0.3);
    }
  }

  private drawGlow(sim: MineSim, time: number, y0: number, y1: number) {
    const ctx = this.ctx, cells = sim.world.cells;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let y = Math.max(0, y0 - 8); y < Math.min(H, y1 + 8); y++)
      for (let x = 0; x < W; x++) {
        const m = cells[idx(x, y)];
        if (m !== TORCH && m !== LAMP) continue;
        const r = m === LAMP ? 9 : 7;
        const flicker = m === TORCH ? 0.75 + 0.25 * Math.sin(time / 90 + x * 7.3 + y) * Math.sin(time / 230 + y * 3.1) : 0.9;
        ctx.globalAlpha = (m === LAMP ? 0.32 : 0.38) * flicker;
        ctx.drawImage(this.glow, x + 0.5 - r, y + 0.5 - r, r * 2, r * 2);
      }
    ctx.restore();
  }

  /** A few specks of `m` thrown off the face being dug. */
  private kick(x: number, y: number, m: Material) {
    const shades = SHADES[m];
    if (!shades) return;
    const [r, g, b] = shades[Math.floor(this.fx() * shades.length)];
    this.dust.push({ x: x + 0.5, y: y + 0.5, vx: (this.fx() - 0.5) * 0.25, vy: -this.fx() * 0.2, life: 30 + this.fx() * 20, color: `rgb(${r},${g},${b})` });
    if (this.dust.length > 200) this.dust.shift();
  }
  private drawDust() {
    const ctx = this.ctx;
    this.dust = this.dust.filter((d) => {
      d.x += d.vx;
      d.y += d.vy;
      d.vy += 0.02;
      ctx.fillStyle = d.color;
      ctx.fillRect(d.x - 0.25, d.y - 0.25, 0.5, 0.5);
      return --d.life > 0;
    });
  }
}

/** Spreads light cell to cell, keeping the brightest of each cell's own and
 * its neighbours' less the cost of entering it: one sweep down and right
 * (`forward`) or up and left. */
function spread(cells: Uint8Array, light: Float32Array, airCost: number, rockCost: number, forward: boolean) {
  const step = forward ? 1 : -1;
  for (let k = 0; k < H; k++) {
    const y = forward ? k : H - 1 - k;
    for (let j = 0; j < W; j++) {
      const x = forward ? j : W - 1 - j, i = y * W + x;
      const cost = isPassable(cells[i]) ? airCost : rockCost;
      let v = light[i];
      const px = x - step, py = y - step;
      if (px >= 0 && px < W) v = Math.max(v, light[i - step] - cost);
      if (py >= 0 && py < H) v = Math.max(v, light[i - step * W] - cost);
      light[i] = v;
    }
  }
}

const clamp255 = (v: number) => (v >= 255 ? 255 : v <= 0 ? 0 : v | 0);
const pack = (c: RGB, k: number) => 0xff000000 | (clamp255(c[2] * k) << 16) | (clamp255(c[1] * k) << 8) | clamp255(c[0] * k);
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function sprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number) {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const c = PALETTE[row[dx]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  });
}

/** A soft warm disc, drawn additively round each torch and lamp. */
function makeGlow() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,190,100,0.9)");
  grad.addColorStop(0.35, "rgba(255,140,50,0.35)");
  grad.addColorStop(1, "rgba(255,120,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}
