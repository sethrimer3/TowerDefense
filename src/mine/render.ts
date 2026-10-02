/** Draws the Mine: the grid one pixel a cell into an offscreen image, lit by
 * daylight falling in from the sky (dimmed by night and cloud) and by the
 * torches, lamps, lava, fires and miners underground (a two-channel light
 * map spread cell to cell, dimmed faster through rock than air), then scaled
 * up crisp under a camera. Over it: clouds, rain and lightning, the
 * headframe, the hut (its window lit at night) and the graves of the miners
 * lost, the carts, hoist bucket, miners and dust. Water is tinted into the
 * cells it fills; stars glint in the night sky. */
import { stream } from "../random.ts";
import { CART_LOAD, type MineSim, type Sky } from "./sim.ts";
import {
  AIR, BEDROCK, CELLS, DIRT, GOLD, GRASS, GRAVEL, H, IRON, LADDER, LAMP, LAVA, LOOSE, RAIL, ROCK, RUBBLE, STONE, TIMBER, TORCH, W, hash01, idx, isPassable,
  type Material,
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
  [GRAVEL]: [[132, 126, 118], [112, 108, 104], [150, 142, 130], [96, 92, 90]],
  [LOOSE]: [[132, 96, 62], [120, 86, 54], [142, 106, 70]],
  [LAVA]: [[255, 112, 32], [255, 150, 44], [236, 84, 24]],
};
const DIRT_BACK: RGB = [44, 31, 21], STONE_BACK: RGB = [30, 30, 36];
const TORCH_RGB: RGB = [255, 196, 96], LAMP_RGB: RGB = [255, 238, 176];
const SKY_TOP: RGB = [70, 104, 156], SKY_LOW: RGB = [206, 188, 160];
const NIGHT_TOP: RGB = [8, 11, 26], NIGHT_LOW: RGB = [28, 30, 50], OVERCAST: RGB = [96, 100, 108];
const WATER_RGB: RGB = [44, 104, 196], FIRE_RGB: RGB[] = [[255, 136, 40], [255, 204, 84], [240, 90, 30]];

/** Little pixel sprites over the surface: `.` is clear; `y` is the hut's
 * window, lit at night. */
const PALETTE: Record<string, RGB> = {
  w: [138, 90, 44], d: [92, 58, 28], r: [163, 58, 38], R: [122, 42, 28], s: [58, 54, 50], g: [154, 158, 166], y: [58, 50, 40], k: [26, 20, 16],
  c: [128, 126, 122], C: [96, 94, 92],
};
const WINDOW_LIT: RGB = [255, 214, 122];
/** A grave for each miner lost. */
const GRAVE = [".c.", "ccc", ".C.", ".C."];
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
type Bolt = { points: [number, number][]; until: number };

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
  /** The newest piece of the sim's news already shown, lightning bolts in
   * flight, and the screen flash's end. */
  private newsTick = -1;
  private bolts: Bolt[] = [];
  private flashUntil = 0;
  private skyNow: Sky = { weather: "clear", daylight: 1, clouds: 0, rain: 0 };
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

  /** How much daylight reaches the open sky now: night and cloud dim it. */
  private skyLight() {
    const s = this.skyNow;
    return 0.1 + 0.9 * s.daylight * (1 - 0.45 * s.clouds);
  }

  private light(sim: MineSim) {
    const cells = sim.world.cells, sky = this.sky, warm = this.warm, surface = sim.strata.surface, burn = sim.burn;
    sky.fill(0);
    warm.fill(0);
    const open = this.skyLight();
    for (let x = 0; x < W; x++) for (let y = 0; y < surface[x]; y++) if (isPassable(cells[idx(x, y)])) sky[idx(x, y)] = open;
    for (let i = 0; i < CELLS; i++) {
      const m = cells[i];
      if (m === TORCH) warm[i] = 1.05;
      else if (m === LAMP) warm[i] = 1.3;
      else if (m === LAVA) warm[i] = 1.15;
      if (burn[i]) warm[i] = 1.4;
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

  private paint(sim: MineSim, y0: number, y1: number, time: number) {
    const cells = sim.world.cells, water = sim.world.water, burn = sim.burn, px = this.pixels, sky = this.sky, warm = this.warm, shade = this.shade;
    const { surface, stoneTop } = sim.strata;
    const { daylight, clouds } = this.skyNow, night = 1 - daylight, starlight = night * (1 - clouds), open = this.skyLight();
    const flicker = Math.floor(time / 110);
    for (let y = y0; y < y1; y++) {
      const t = Math.min(1, Math.max(0, y / 50));
      let skyRgb = mix(mix(NIGHT_TOP, NIGHT_LOW, t), mix(SKY_TOP, SKY_LOW, t * t), daylight);
      skyRgb = mix(skyRgb, mix(NIGHT_TOP, OVERCAST, daylight), clouds * 0.65);
      for (let x = 0; x < W; x++) {
        const i = idx(x, y), m = cells[i];
        let rgb: RGB;
        if (m === TORCH && !burn[i]) {
          px[i] = pack(TORCH_RGB, 1);
          continue;
        }
        if (m === LAMP) {
          px[i] = pack(LAMP_RGB, 1);
          continue;
        }
        // Lava and fire give their own light.
        if (m === LAVA) {
          px[i] = pack(SHADES[LAVA][(shade[i] + ((flicker + shade[i]) >> 2)) % 3], 1);
          continue;
        }
        if (burn[i]) {
          px[i] = pack(FIRE_RGB[(shade[i] + flicker) % 3], 1);
          continue;
        }
        if (isPassable(m) && y < surface[x]) {
          rgb = skyRgb;
          if (water[i]) rgb = mix(WATER_RGB, rgb, 0.3).map((v) => v * (0.35 + 0.65 * open)) as RGB;
          if (m === AIR) {
            // Stars, now and then, through clear night skies.
            const star = hash01(x, y, sim.seed + 5);
            if (!water[i] && starlight > 0.05 && star < 0.014 && y < surface[x] - 6) {
              const twinkle = 0.55 + 0.45 * Math.sin(time / 380 + star * 9000);
              rgb = mix(rgb, [236, 236, 255], starlight * twinkle * (star < 0.004 ? 1 : 0.6));
            }
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
        const s = Math.max(sky[i], (0.5 - (y - surface[x]) * 0.022) * open), w = warm[i];
        const r = s * 0.98 + w * 1.15 + 0.025, g = s * 0.96 + w * 0.8 + 0.025, b = s * 0.94 + w * 0.5 + 0.03;
        if (water[i]) {
          // Water: deep blue, catching whatever light there is, its surface brighter.
          const k = Math.min(1, 0.22 + (s + w) * 0.9), top = i >= W && !water[i - W] ? 1.35 : 1;
          rgb = [rgb[0] * r * 0.3 + WATER_RGB[0] * k * top, rgb[1] * g * 0.3 + WATER_RGB[1] * k * top, rgb[2] * b * 0.3 + WATER_RGB[2] * k * top];
          px[i] = pack(rgb, 1);
          continue;
        }
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
      this.skyNow = sim.sky;
      this.light(sim);
      this.litAt = time;
    }
    this.readNews(sim, time, effects);
    const rows = `${y0}:${y1}`;
    if (relight || sim.world.version !== this.paintedVersion || rows !== this.paintedRows) {
      this.paint(sim, y0, y1, time);
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
    if (y0 < 60) this.drawClouds(sim, time);
    this.drawSurface(sim, time, effects);
    if (effects && y0 < 60) this.drawRain(sim, time);
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
      if (m.y < y0 - 2 || m.y > y1 + 2 || m.action === "shelter") continue;
      ctx.fillStyle = "#f4f2ec";
      ctx.fillRect(m.x, m.y - 1, 1, 2);
      if (m.iron + m.gold > 0) {
        ctx.fillStyle = m.gold > 0 ? "#f0c850" : "#c07a50";
        ctx.fillRect(m.x - m.facing, m.y, 1, 1);
      }
      // A bucket swung at floodwater or a fire.
      if ((m.action === "bail" || m.action === "douse") && m.work >= 0) {
        const wx = m.work % W, up = Math.floor(time / 240 + m.id) % 2;
        ctx.fillStyle = m.action === "douse" ? "#9fc6f0" : "#5a86c8";
        ctx.fillRect(m.x + (Math.sign(wx - m.x) || m.facing), m.y - up, 1, 1);
      }
      if (m.action === "dig" && m.work >= 0 && Math.floor(time / 180 + m.id) % 2 === 0) {
        ctx.fillStyle = "#b9bcc4";
        const wx = m.work % W, wy = (m.work - wx) / W;
        ctx.fillRect(m.x + Math.sign(wx - m.x), wy < m.y - 1 ? m.y - 2 : m.y - 1, 1, 1);
        if (effects && this.fx() < 0.18) this.kick(wx, wy, sim.world.get(wx, wy));
      }
    }
    if (effects) this.drawDust();
    this.drawLightning(time);
  }

  /** The headframe, the hut (its window aglow after dark) and a grave
   * beside it for each miner lost, all in the light of the hour. */
  private drawSurface(sim: MineSim, time: number, effects: boolean) {
    const ctx = this.ctx, k = 0.3 + 0.7 * this.skyLight(), night = 1 - this.skyNow.daylight;
    const x0 = sim.shaftX, top = sim.strata.surface[x0];
    sprite(ctx, HEADFRAME, x0 - 4, top - HEADFRAME.length, k);
    const hx = sim.hutX, ht = Math.min(sim.strata.surface[hx - 2], sim.strata.surface[hx + 2], sim.strata.surface[hx]);
    sprite(ctx, HUT, hx + 2, ht - HUT.length, k, mix(PALETTE.y, WINDOW_LIT, Math.min(1, night * 1.4)));
    if (night > 0.2) {
      const wx = hx + 4, wy = ht - 3, flick = 0.85 + 0.15 * Math.sin(time / 170) * Math.sin(time / 410);
      if (effects) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(1, (night - 0.2) * 1.3) * 0.5 * flick;
        ctx.drawImage(this.glow, wx + 0.5 - 6, wy + 0.5 - 6, 12, 12);
        ctx.restore();
      }
    }
    const graves = Math.min(10, sim.lostTotal);
    for (let g = 0; g < graves; g++) {
      const gx = sim.hutX - 5 - g * 4;
      sprite(ctx, GRAVE, gx - 1, sim.standY(gx) - 3, k);
    }
  }

  /** Clouds drifting along the sky, more and darker as the weather turns. */
  private drawClouds(sim: MineSim, time: number) {
    const ctx = this.ctx, { clouds, daylight } = this.skyNow;
    if (clouds < 0.08) return;
    const count = Math.round(2 + clouds * 9), k = 0.18 + 0.82 * daylight;
    const tone = mix([46, 50, 64], [236, 238, 242], k * (1 - clouds * 0.35));
    ctx.fillStyle = `rgb(${tone.map((v) => v | 0).join(",")})`;
    for (let i = 0; i < count; i++) {
      const r = (n: number) => hash01(i, n, sim.seed + 41);
      const w = 12 + r(1) * 22, span = W + w + 20;
      const x = ((r(2) * span + time * (0.0012 + r(3) * 0.0016)) % span) - w - 10;
      const y = 3 + r(4) * 16 + i * 0.6;
      ctx.globalAlpha = Math.min(0.95, 0.35 + clouds * 0.6);
      // A cloud: a flat bottom with a few lumps on top, pixel by pixel.
      ctx.fillRect(Math.round(x), Math.round(y + 3), Math.round(w), 2);
      for (let b = 0; b < 4; b++) {
        const bw = w * (0.25 + r(10 + b) * 0.3), bx = x + r(20 + b) * (w - bw);
        ctx.fillRect(Math.round(bx), Math.round(y + 1 + r(30 + b) * 1.5), Math.round(bw), 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Rain streaks falling through the open sky. */
  private drawRain(sim: MineSim, time: number) {
    const ctx = this.ctx, rain = this.skyNow.rain;
    if (rain < 0.03) return;
    ctx.fillStyle = "rgba(176,198,236,0.55)";
    const n = Math.round(rain * 160), fall = 60;
    for (let i = 0; i < n; i++) {
      const r1 = hash01(i, 1, 7), r2 = hash01(i, 2, 7);
      const y = (r2 * fall + time * (0.075 + r1 * 0.03)) % fall;
      const x = Math.floor((r1 * W * 1.2 + y * 0.35) % W);
      if (y + 1.5 >= sim.strata.surface[x]) continue;
      ctx.fillRect(x + (y * 0.35) % 1, y, 0.3, 1.5);
    }
  }

  /** Takes up the sim's latest news: lightning bolts, and a wisp rising
   * where a miner was lost or saved. */
  private readNews(sim: MineSim, time: number, effects: boolean) {
    for (const n of sim.news) {
      if (n.tick <= this.newsTick) continue;
      if (n.kind === "strike") {
        const points: [number, number][] = [[n.x + (this.fx() - 0.5) * 16, -4]];
        for (let y = 4; y < n.y; y += 3 + this.fx() * 4) points.push([n.x + (this.fx() - 0.5) * 6 * (1 - y / n.y), y]);
        points.push([n.x + 0.5, n.y + 1]);
        this.bolts.push({ points, until: time + 260 });
        this.flashUntil = time + 160;
      } else if (effects && (n.kind === "lost" || n.kind === "saved"))
        for (let k = 0; k < 10; k++)
          this.dust.push({ x: n.x + 0.5, y: n.y - 1, vx: (this.fx() - 0.5) * 0.08, vy: -0.05 - this.fx() * 0.08, life: 60 + this.fx() * 40, color: n.kind === "lost" ? "#dfe6ff" : "#ffe9a8" });
    }
    if (sim.news.length) this.newsTick = sim.news[sim.news.length - 1].tick;
  }

  private drawLightning(time: number) {
    const ctx = this.ctx;
    this.bolts = this.bolts.filter((b) => b.until > time);
    for (const b of this.bolts) {
      ctx.strokeStyle = "rgba(240,244,255,0.95)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      b.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    if (time < this.flashUntil) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(230,236,255,${((this.flashUntil - time) / 160) * 0.3})`;
      ctx.fillRect(0, 0, this.size.w, this.size.h);
      ctx.restore();
    }
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

/** Draws a sprite with its colours dimmed to `k` (the light it stands in);
 * `lit` overrides the window colour, which glows whatever the light. */
function sprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, k = 1, lit?: RGB) {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const c = PALETTE[row[dx]];
      if (!c) continue;
      const rgb = row[dx] === "y" && lit ? lit : [c[0] * k, c[1] * k, c[2] * k];
      ctx.fillStyle = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
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
