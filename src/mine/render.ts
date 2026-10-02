/** Draws the Mine: the grid one pixel a cell into an offscreen image, lit by
 * daylight falling in from the sky (dimmed by night and cloud) and by the
 * torches, lamps, lava, fires and miners underground (a two-channel light
 * map spread cell to cell, dimmed faster through rock than air), then scaled
 * up crisp under a camera (a whole number of screen pixels a cell, so the
 * pixels meet without seams). Over it: clouds, rain and lightning, the
 * headframe, the buildings (their front walls fading to show who's inside),
 * the graves of the miners lost, the carts, the hoist's rope and bucket, the
 * yard's ore, the miners (2 × 4 half-cell figures, `figures.ts`) and the
 * effects (`particles.ts`). Water is tinted into the
 * cells it fills; stars glint in the night sky. */
import { stream } from "../random.ts";
import { CART_LOAD, type Footprint, type Inside, type Miner, type MineSim, type Rebuild, type Sky } from "./sim.ts";
import { drawFigure, drawSleeper, outfit, type Fine, type Pose } from "./figures.ts";
import { Particles } from "./particles.ts";
import { BUILDINGS, along, anvils, pathTicks, type Building, type BuildingId } from "./buildings.ts";
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

/** Little pixel sprites over the surface: `.` is clear. */
const PALETTE: Record<string, RGB> = {
  w: [138, 90, 44], d: [92, 58, 28], r: [163, 58, 38], R: [122, 42, 28], s: [58, 54, 50], g: [154, 158, 166], y: [58, 50, 40], k: [26, 20, 16],
  c: [128, 126, 122], C: [96, 94, 92],
};
const WINDOW_DARK: RGB = [44, 38, 32], WINDOW_LIT: RGB = [255, 214, 122];
/** The buildings' materials. */
const PLANK: RGB[] = [[138, 90, 44], [120, 78, 38]], POST: RGB = [86, 54, 26], BACK: RGB = [62, 42, 26], BACK_STONE: RGB = [54, 52, 56];
const ROOF: RGB[] = [[163, 58, 38], [122, 42, 28]], SLATE: RGB[] = [[84, 86, 98], [66, 68, 80]], ASHLAR: RGB[] = [[118, 112, 104], [98, 94, 90]];
const FOOTING: RGB = [84, 80, 76], IRON_DARK: RGB = [58, 58, 66], BLANKET: RGB = [96, 112, 150], BAR_IRON: RGB = [176, 180, 190], BAR_GOLD: RGB = [240, 200, 80];
const SCAFFOLD: RGB = [176, 138, 88];
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

/** Cells across the view at the furthest zoom out, and how far in it goes. */
export const VIEW_CELLS = 256, MAX_ZOOM = 8;

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
  private fx2 = new Particles();
  /** Fills a rectangle in cells, snapped to whole screen pixels (set each
   * frame, for the half-cell figures and the effects). */
  private fine: Fine = () => {};
  /** Where the hoist's bucket is drawn, eased after the sim's. */
  private hoistY = -1;
  /** The building the player tapped, shown open and outlined. */
  picked: BuildingId | null = null;
  private fx = stream("effects");
  /** The newest piece of the sim's news already shown, lightning bolts in
   * flight, and the screen flash's end. */
  private newsTick = -1;
  private bolts: Bolt[] = [];
  private flashUntil = 0;
  private skyNow: Sky = { weather: "clear", daylight: 1, clouds: 0, rain: 0 };
  /** How far each building's front wall has faded (1: see-through). */
  private open: Record<BuildingId, number> = { shaft: 0, barracks: 0, warehouse: 0, forge: 0, smithy: 0 };
  /** The camera: the top-left cell in view, and the zoom (1 = the furthest
   * out, `VIEW_CELLS` across the view's full width). `follow` keeps the
   * crew's deepest in view; `target` keeps one miner in the middle. */
  camX = 0;
  camY = 20;
  private want = 1;
  follow = false;
  target: Miner | null = null;
  /** The view's full width in CSS pixels (the canvas narrows while the
   * crew's list is open, without the zoom changing); 0 for the canvas's. */
  refWidth = 0;
  private size = { w: 1, h: 1, scale: 1, min: 1 };

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

  /** Matches the canvas to its box (keeping the middle of the view where
   * it was); returns the cells per screen pixel. */
  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const before = this.size, min = Math.max(1, Math.floor((this.refWidth > 0 ? this.refWidth * dpr : w) / VIEW_CELLS));
    const scale = this.scaleFor(min, this.want);
    if (before.w > 1) {
      this.camX += before.w / (2 * before.scale) - w / (2 * scale);
      this.camY += before.h / (2 * before.scale) - h / (2 * scale);
    }
    this.size = { w, h, scale, min };
    this.clamp();
    return dpr / scale;
  }
  /** Device pixels a cell: always whole. */
  private scaleFor(min: number, want: number) {
    return Math.max(min, Math.min(min * MAX_ZOOM, Math.round(min * want)));
  }
  get scale() {
    return this.size.scale;
  }
  /** How far in the view is zoomed (1: all the way out). */
  get zoom() {
    return this.size.scale / this.size.min;
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
  /** Zooms by `factor` (above 1 in) about the device pixel (px, py). */
  zoomBy(factor: number, px: number, py: number) {
    this.want = Math.max(1, Math.min(MAX_ZOOM, this.want * factor));
    const next = this.scaleFor(this.size.min, this.want);
    if (next === this.size.scale) return;
    const cx = this.camX + px / this.size.scale, cy = this.camY + py / this.size.scale;
    this.size.scale = next;
    this.camX = cx - px / next;
    this.camY = cy - py / next;
    this.clamp();
  }
  /** Centres the view on cell (x, y) at `zoom`. */
  lookAt(x: number, y: number, zoom: number) {
    this.want = Math.max(1, Math.min(MAX_ZOOM, zoom));
    this.size.scale = this.scaleFor(this.size.min, this.want);
    this.camX = x - this.size.w / this.size.scale / 2;
    this.camY = y - this.size.h / this.size.scale / 2;
    this.target = null;
    this.follow = false;
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
    if (this.target && !sim.miners.includes(this.target)) this.target = null;
    if (this.target) {
      const at = this.whereIs(sim, this.target);
      this.camX += (at.x + 0.5 - w / scale / 2 - this.camX) * 0.12;
      this.camY += (at.y - h / scale / 2 - this.camY) * 0.12;
      this.clamp();
    } else if (this.follow) {
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
    this.fine = (x, y, fw, fh, color) => {
      const x0 = Math.round(ox + x * scale), y0 = Math.round(oy + y * scale);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, Math.round(ox + (x + fw) * scale) - x0, Math.round(oy + (y + fh) * scale) - y0);
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
    };
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
    const fine = this.fine;
    for (const m of sim.miners) {
      if (m.inside || m.y < y0 - 2 || m.y > y1 + 2) continue;
      const climbing = m.action === "walk" && sim.world.get(m.x, m.y) === LADDER;
      const pose: Pose = climbing ? "climb" : m.action === "walk" ? "walk" : m.action === "idle" || m.action === "rest" ? "stand" : "work";
      const step = Math.floor(time / 140 + m.id * 3);
      drawFigure(fine, outfit(m.name, m.job), m.x, m.y, m.facing, pose, step);
      const front = m.facing > 0 ? m.x + 1 : m.x - 0.5;
      // A sack of ore on the back.
      if (m.iron + m.gold > 0) {
        fine(m.facing > 0 ? m.x - 0.5 : m.x + 1, m.y - 0.5, 0.5, 1, "#6a5236");
        fine(m.facing > 0 ? m.x - 0.5 : m.x + 1, m.y - 0.5, 0.5, 0.5, m.gold > 0 ? "#f0c850" : "#c07a50");
      }
      // A bucket swung at floodwater or a fire.
      if ((m.action === "bail" || m.action === "douse") && m.work >= 0) {
        const up = step % 2;
        fine(front, m.y - up * 0.5, 0.5, 0.5, m.action === "douse" ? "#9fc6f0" : "#5a86c8");
        fine(front, m.y - up * 0.5 - 0.25, 0.5, 0.25, "#7a7a82");
      }
      if (m.action === "dig" && m.work >= 0) {
        // The pick: raised, then struck at the face.
        const wx = m.work % W, wy = (m.work - wx) / W, dir = Math.sign(wx - m.x) || m.facing, raised = Math.floor(time / 180 + m.id) % 2 === 0;
        const hx = dir > 0 ? m.x + 1 : m.x - 0.5, hy = wy < m.y - 1 ? m.y - 1.5 : wy > m.y ? m.y + 0.5 : m.y - 1;
        fine(hx, raised ? hy - 0.5 : hy, 0.5, 0.5, "#b9bcc4");
        fine(dir > 0 ? m.x + 0.5 : m.x, m.y - (raised ? 0.5 : 0), 0.5, 0.5, "#7a5230");
        if (effects && !raised && this.fx() < 0.25) this.kick(wx, wy, sim.world.get(wx, wy));
      }
      if (m.action === "build" && m.work >= 0 && Math.floor(time / 200 + m.id) % 2 === 0) fine(front, m.y - 1, 0.5, 0.5, "#c8ccd4");
    }
    if (this.target) {
      // A brass marker bobbing over the miner picked in the crew's list.
      const at = this.whereIs(sim, this.target), bob = Math.floor(time / 300) % 2 ? 0.5 : 0;
      fine(at.x - 0.5, at.y - 3 - bob, 2, 0.5, "#f0c850");
      fine(at.x, at.y - 2.5 - bob, 1, 0.5, "#f0c850");
    }
    if (effects) {
      const cells = sim.world.cells;
      this.fx2.step((x, y) => x < 0 || x >= W || y < 0 || y >= H || !isPassable(cells[idx(Math.floor(x), Math.floor(y))]), 1 + this.skyNow.clouds + this.skyNow.rain * 2);
      this.fx2.draw(ctx, fine);
    }
    this.drawLightning(time);
  }

  /** A miner's feet cell, inside a building or out. */
  private whereIs(sim: MineSim, m: Miner) {
    if (!m.inside) return { x: m.x, y: m.y };
    const s = m.inside, b = sim.buildings[s.b], spot = sim.spotOf(s), walk = pathTicks(spot.path);
    return along([b.door, b.floor], spot.path, s.out ? walk - s.t : Math.min(s.t, walk));
  }

  /** The headframe, the buildings (each front wall fading away while
   * anyone is inside, to show them at work or asleep), the shaft house's
   * lantern and the barracks' windows aglow after dark, and a grave for
   * each miner lost, all in the light of the hour. */
  private drawSurface(sim: MineSim, time: number, effects: boolean) {
    const ctx = this.ctx, k = 0.3 + 0.7 * this.skyLight(), night = 1 - this.skyNow.daylight;
    const x0 = sim.shaftX, top = sim.strata.surface[x0];
    sprite(ctx, HEADFRAME, x0 - 4, top - HEADFRAME.length, k);
    const inside: Record<BuildingId, Miner[]> = { shaft: [], barracks: [], warehouse: [], forge: [], smithy: [] };
    for (const m of sim.miners) if (m.inside) inside[m.inside.b].push(m);
    const shaft = sim.buildings.shaft;
    // The shaft house shows the miners passing through its mouth.
    const passing = sim.miners.some((m) => !m.inside && m.x >= shaft.x0 && m.x <= shaft.x1 && m.y >= shaft.floor - shaft.height && m.y <= shaft.floor + 3);
    for (const id of BUILDINGS) {
      const want = id === this.picked || (id === "shaft" ? passing : inside[id].length > 0) ? 1 : 0;
      this.open[id] += (want - this.open[id]) * 0.12;
      if (Math.abs(want - this.open[id]) < 0.01) this.open[id] = want;
      const rebuild = sim.rebuilding(id);
      if (rebuild) this.drawRebuild(sim, sim.buildings[id], rebuild, time, k);
      else this.drawBuilding(sim, sim.buildings[id], inside[id], time, k, night, effects);
    }
    const graves = Math.min(10, sim.lostTotal);
    for (let g = 0; g < graves; g++) {
      const gx = sim.buildings.smithy.x0 - 4 - g * 4;
      sprite(ctx, GRAVE, gx - 1, sim.standY(gx) - 3, k);
    }
  }

  /** One building: its footing down to the ground, then (while its wall is
   * fading) the room behind with its fittings and the miners in it, then
   * the front wall, frame and roof. */
  private drawBuilding(sim: MineSim, b: Building, crew: Miner[], time: number, k: number, night: number, effects: boolean) {
    const ctx = this.ctx, F = b.floor, top = F - b.height + 1, surface = sim.strata.surface;
    const stone = b.id === "forge" || b.id === "smithy";
    const fill = (c: RGB, kk: number, x: number, y: number, w = 1, h = 1) => {
      ctx.fillStyle = `rgb(${(c[0] * kk) | 0},${(c[1] * kk) | 0},${(c[2] * kk) | 0})`;
      ctx.fillRect(x, y, w, h);
    };
    for (let x = b.x0; x <= b.x1; x++) if (surface[x] > F + 1) fill(FOOTING, k, x, F + 1, 1, surface[x] - F - 1);
    const open = this.open[b.id], lamp = 0.78 + 0.06 * Math.sin(time / 300);
    if (open > 0.01) {
      fill(stone ? BACK_STONE : BACK, lamp, b.x0 + 1, top, b.x1 - b.x0 - 1, b.height);
      this.drawRoom(sim, b, time, lamp, fill);
      for (const m of crew) this.drawInside(sim, b, m, time, effects);
    }
    // The front wall.
    ctx.globalAlpha = 1 - open * 0.88;
    for (let y = top; y <= F; y++)
      for (let x = b.x0 + 1; x < b.x1; x++) {
        const c = stone ? ASHLAR[((x + (y % 2) * 2) >> 1) % 2 === 0 && y % 2 === 0 ? 1 : 0] : PLANK[y % 2];
        fill(c, k * (stone && (x + y) % 5 === 0 ? 0.86 : 1), x, y);
      }
    // Windows: the barracks' lit at night, the forge's by its fire.
    const lit = b.id === "forge" ? (sim.working("forge") ? 1 : 0.25) : b.id === "barracks" || b.id === "shaft" ? Math.min(1, night * 1.4) : 0;
    for (const wx of this.windows(b)) fill(lit > 0 ? mix(WINDOW_DARK, b.id === "forge" ? [255, 150, 60] : WINDOW_LIT, lit) : WINDOW_DARK, lit > 0 ? 1 : k, wx, F - 4, 1, 2);
    ctx.globalAlpha = 1;
    // Frame, door and roof stay put.
    fill(POST, k, b.x0, top, 1, b.height);
    fill(POST, k, b.x1, top, 1, b.height);
    fill(POST, k, b.x0, top - 1, b.x1 - b.x0 + 1, 1);
    if (b.id === "shaft") {
      // Open both sides: the yard's way runs through it.
      fill([24, 18, 14], k, b.x0, F - 1, 1, 2);
      fill([24, 18, 14], k, b.x1, F - 1, 1, 2);
    } else fill([52, 32, 18], k, b.door, F - 2, 1, 3);
    const roof = b.id === "forge" || b.id === "smithy" ? SLATE : b.id === "barracks" ? ROOF : PLANK;
    const rows = b.id === "shaft" ? 2 : 3;
    for (let r = 1; r <= rows; r++) {
      const a = b.x0 - 1 + r * 2 - 1, z = b.x1 + 1 - r * 2 + 1;
      if (z >= a) fill(roof[r % 2], k, a, top - 1 - r, z - a + 1, 1);
    }
    if (b.id === "forge") {
      // The chimney, smoking while the furnace is worked.
      fill(ASHLAR[1], k, b.x0 + 2, top - 1 - rows - 3, 2, rows + 3);
      if (effects && this.fx() < (sim.working("forge") ? 0.22 : 0.03)) {
        const grey = 110 + Math.floor(this.fx() * 50);
        this.fx2.add("smoke", b.x0 + 2.5 + this.fx(), top - rows - 4.2, (this.fx() - 0.5) * 0.01, -0.035 - this.fx() * 0.025, 140 + this.fx() * 90, `rgb(${grey},${grey - 4},${grey - 8})`, 0.5);
      }
    }
    if (b.id === "shaft") {
      // The lantern by the door, aglow after dark.
      const lx = b.x1 + 1, ly = F - 3;
      fill(IRON_DARK, k, lx, ly - 1);
      fill(mix([150, 120, 60], [255, 220, 130], Math.min(1, night * 1.5)), night > 0.3 ? 1 : k, lx, ly);
      if (effects && night > 0.2) this.glowAt(lx, ly, 10, Math.min(1, (night - 0.2) * 1.3) * 0.55 * (0.85 + 0.15 * Math.sin(time / 170) * Math.sin(time / 410)));
    }
    if (this.picked === b.id) this.outline(b, top - 1 - rows - (b.id === "forge" ? 3 : 0), time);
    if (effects && b.id === "barracks" && night > 0.2)
      for (const wx of this.windows(b).filter((_, i) => i % 2 === 0)) this.glowAt(wx, F - 4, 8, Math.min(1, (night - 0.2) * 1.3) * 0.35);
  }
  /** The building picked: an outline of brass, gently pulsing, from the
   * roof's row `roof` down to its floor. */
  private outline(b: Footprint, roof: number, time: number) {
    const ctx = this.ctx, { scale } = this.size, ox = Math.round(-this.camX * scale), oy = Math.round(-this.camY * scale);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = `rgba(240,207,134,${0.65 + 0.35 * Math.sin(time / 260)})`;
    ctx.lineWidth = Math.max(1, Math.round(scale / 3));
    const x0 = Math.round(ox + (b.x0 - 1) * scale), y0 = Math.round(oy + (roof - 0.5) * scale);
    ctx.strokeRect(x0, y0, Math.round(ox + (b.x1 + 2) * scale) - x0, Math.round(oy + (b.floor + 1.5) * scale) - y0);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
  }
  /** A building being rebuilt: if it is moving, first taken down where it
   * stood, course by course inside its scaffold, then raised the same way
   * in its new place; timber stacked by the site. */
  private drawRebuild(sim: MineSim, b: Building, r: Rebuild, time: number, k: number) {
    const p = r.t / r.total, down = r.from !== null && p < 0.5;
    const site: Footprint = down ? r.from! : b, done = r.from ? (down ? 1 - p * 2 : (p - 0.5) * 2) : p;
    const ctx = this.ctx, F = site.floor, surface = sim.strata.surface, stone = b.id === "forge" || b.id === "smithy";
    const fill = (c: RGB, kk: number, x: number, y: number, w = 1, h = 1) => {
      ctx.fillStyle = `rgb(${(c[0] * kk) | 0},${(c[1] * kk) | 0},${(c[2] * kk) | 0})`;
      ctx.fillRect(x, y, w, h);
    };
    for (let x = site.x0; x <= site.x1; x++) if (surface[x] > F + 1) fill(FOOTING, k, x, F + 1, 1, surface[x] - F - 1);
    // The walls, risen (or still standing) to the share of the work done.
    const rows = Math.round(site.height * done), top = F - site.height + 1;
    for (let y = F - rows + 1; y <= F; y++)
      for (let x = site.x0; x <= site.x1; x++) {
        const edge = x === site.x0 || x === site.x1;
        const c = edge ? POST : stone ? ASHLAR[((x + (y % 2) * 2) >> 1) % 2 === 0 && y % 2 === 0 ? 1 : 0] : PLANK[y % 2];
        fill(c, k * (stone && (x + y) % 5 === 0 ? 0.86 : 1), x, y);
      }
    // The scaffold: poles either side and every few columns, boards across.
    ctx.globalAlpha = 0.9;
    for (let x = site.x0 - 1; x <= site.x1 + 1; x += 4) fill(SCAFFOLD, k, x, top - 2, 1, site.height + 2);
    fill(SCAFFOLD, k, site.x1 + 1, top - 2, 1, site.height + 2);
    for (let y = F - 1; y >= top - 2; y -= 3) fill(SCAFFOLD, k * 0.85, site.x0 - 1, y, site.x1 - site.x0 + 3, 1);
    ctx.globalAlpha = 1;
    // Timber stacked by the site, and a hoisting rope swaying from the top.
    const sx = site.x1 + 2;
    fill(TIMBER_END, k, sx, F, 2, 1);
    fill(PLANK[1], k, sx, F - 1, 2, 1);
    const sway = Math.round(Math.sin(time / 500));
    fill([140, 120, 90], k, Math.floor((site.x0 + site.x1) / 2) + sway, top - 1, 1, Math.max(1, site.height - rows));
    if (this.picked === b.id) this.outline(site, top - 3, time);
  }
  private windows(b: Building) {
    const out: number[] = [];
    if (b.id === "shaft") return out;
    for (let x = b.x0 + 3; x < b.x1 - 1; x += 5) if (x !== b.door) out.push(x);
    return out;
  }
  private glowAt(x: number, y: number, size: number, alpha: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.glow, x + 0.5 - size / 2, y + 0.5 - size / 2, size, size);
    ctx.restore();
  }

  /** What's inside each building, lit by its own lamps. */
  private drawRoom(sim: MineSim, b: Building, time: number, k: number, fill: (c: RGB, k: number, x: number, y: number, w?: number, h?: number) => void) {
    const F = b.floor, x0 = b.x0, flick = Math.floor(time / 120);
    if (b.id === "shaft") {
      // The hatch over the shaft and the top of its ladder.
      fill([20, 16, 14], k, sim.shaftX, F, 1, 1);
      for (let y = F - b.height + 1; y <= F; y += 2) fill(PLANK[0], k, sim.shaftX, y);
    } else if (b.id === "barracks") {
      // The lounge: a table, two stools, a mug or two, a hanging lamp.
      fill(PLANK[0], k, x0 + 3, F - 1, 2, 1);
      fill(POST, k, x0 + 3, F, 1, 1);
      fill(POST, k, x0 + 4, F, 1, 1);
      fill(POST, k, x0 + 2, F, 1, 1);
      fill(POST, k, x0 + 5, F, 1, 1);
      fill([210, 200, 180], k, x0 + 4, F - 2);
      fill(WINDOW_LIT, 1, x0 + 4, F - 6);
      // Bays of bunks, three tiers a side of each ladder.
      const bays = (b.spots.sleep?.length ?? 0) / 6;
      for (let p = 0; p < bays; p++) {
        const px = x0 + 7 + p * 7, ladder = px + 3;
        for (let y = F - 5; y <= F; y++) fill(y % 2 ? PLANK[0] : POST, k, ladder, y);
        fill(POST, k, px, F - 5, 1, 6);
        fill(POST, k, px + 6, F - 5, 1, 6);
        for (let tier = 0; tier < 3; tier++) {
          fill(PLANK[1], k, px, F - 2 * tier, 3, 1);
          fill(PLANK[1], k, px + 4, F - 2 * tier, 3, 1);
          // A folded blanket at the foot of each bunk.
          fill(BLANKET, k * 0.8, px, F - 2 * tier - 1);
          fill(BLANKET, k * 0.8, px + 6, F - 2 * tier - 1);
        }
      }
    } else if (b.id === "warehouse") {
      // Shelves of timber, rails and lights, as full as the warehouse's
      // supplies; props stacked by the wall.
      for (const y of [F - 2, F - 4]) fill(PLANK[1], k, x0 + 1, y, b.x1 - x0 - 1, 1);
      const width = b.x1 - x0 - 1;
      let left = Math.round((2 * width * Math.min(sim.stock, sim.stockCap)) / Math.max(1, sim.stockCap));
      for (let x = x0 + 1; x < b.x1 && left > 0; x++, left--) fill(x % 2 ? TIMBER_END : [150, 150, 158], k, x, F - 3);
      for (let x = x0 + 1; x < b.x1 && left > 0; x++, left--) fill(x % 3 === 0 ? TORCH_RGB : x % 3 === 1 ? [230, 220, 170] : TIMBER_END, k * 0.9, x, F - 5);
      fill(PLANK[0], k, x0 + 1, F - 1, 1, 2);
      fill(PLANK[1], k, x0 + 2, F, 1, 1);
    } else if (b.id === "forge") {
      // The furnace, its mouth roaring while it is worked; ore by the door.
      const hot = sim.working("forge") > 0;
      fill(ASHLAR[1], k, x0 + 1, F - 4, 3, 5);
      for (let y = F - 2; y <= F - 1; y++)
        for (let x = x0 + 2; x <= x0 + 3; x++) fill(hot ? FIRE_RGB[(x + y + flick) % 3] : [90, 40, 24], 1, x, y);
      this.forgeStock(sim, b, k, fill);
    } else if (b.id === "smithy") {
      // An anvil for each smith, the rack of bars waiting, the quench trough.
      for (const ax of anvils(b)) {
        fill(IRON_DARK, k, ax, F - 1, 3, 1);
        fill(IRON_DARK, k, ax + 1, F, 1, 1);
      }
      const iron = Math.min(12, sim.bars.iron), gold = Math.min(6, sim.bars.gold);
      for (let n = 0; n < iron; n++) fill(BAR_IRON, k, x0 + 1, F - Math.floor(n / 2), 1, 1);
      for (let n = 0; n < gold; n++) fill(BAR_GOLD, k, x0 + 2, F - n, 1, 1);
      fill(POST, k, b.x1 - 2, F, 2, 1);
      fill(WATER_RGB, k, b.x1 - 2, F - 1, 2, 1);
    }
  }

  /** The forge's ore, filling a heap by the door, then a low shelf and a
   * high one along the back wall, as it nears what the forge holds. */
  private forgeStock(sim: MineSim, b: Building, k: number, fill: (c: RGB, k: number, x: number, y: number, w?: number, h?: number) => void) {
    const F = b.floor, fine = this.fine, sx0 = b.x0 + 4, sx1 = b.x1 - 1, tone = (c: RGB) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;
    for (const sy of [F - 2, F - 4]) {
      fill(PLANK[1], k, sx0, sy, sx1 - sx0, 1);
      fill(POST, k, sx0, sy, 1, 1);
    }
    const total = sim.ore.iron + sim.ore.gold;
    if (!total) return;
    const heapRows = [6, 6, 5, 4, 3, 2], heapSlots = 26, shelfSlots = (sx1 - sx0) * 2 * 2;
    const slots = Math.max(1, Math.round(((heapSlots + 2 * shelfSlots) * Math.min(total, sim.forgeCap)) / sim.forgeCap));
    const goldShare = sim.ore.gold / total;
    const heap = Math.min(heapSlots, slots);
    oreHeap(fine, b.x1 - 1.5, F + 0.5, heapRows, heap, Math.round(heap * goldShare), k);
    let left = slots - heap;
    for (const sy of [F - 2, F - 4]) {
      for (let r = 0; r < 2 && left > 0; r++)
        for (let i = 0; i < (sx1 - sx0) * 2 && left > 0; i++, left--) {
          const gold = hash01(i, r + sy, 5) < goldShare, shades = gold ? SHADES[GOLD] : SHADES[IRON];
          fine(sx0 + 0.5 + i * 0.5, sy + 0.25 - r * 0.5, 0.5, 0.5, tone(shades[(i + r) % shades.length]));
        }
    }
  }

  /** A miner inside, at its place on its way in or out, or at its spot:
   * lying in its bunk, or at work (a shovel at the furnace, a hammer on
   * the anvil, striking sparks). */
  private drawInside(sim: MineSim, b: Building, m: Miner, time: number, effects: boolean) {
    const fine = this.fine, s = m.inside as Inside, spot = sim.spotOf(s), walk = pathTicks(spot.path);
    const t = s.out ? walk - s.t : Math.min(s.t, walk), at = along([b.door, b.floor], spot.path, t);
    const arrived = !s.out && s.t >= walk, look = outfit(m.name, m.job);
    if (arrived && spot.lie && s.why === "sleep") {
      drawSleeper(fine, look, spot.x, spot.y, spot.facing, `rgb(${BLANKET.join(",")})`);
      // Now and then, a snore drifts up.
      if (effects && this.fx() < 0.006) this.fx2.add("zzz", spot.x + 0.5, spot.y - 0.4, 0, -0.012, 110, "#e8ecff");
      return;
    }
    const prev = t > 0 ? along([b.door, b.floor], spot.path, t - 8) : at;
    const facing = arrived ? spot.facing : Math.sign(at.x - prev.x) || (s.out ? -spot.facing : spot.facing);
    const climbing = !arrived && at.x === prev.x && at.y !== prev.y;
    drawFigure(fine, look, at.x, at.y, facing, arrived ? "work" : climbing ? "climb" : "walk", Math.floor(time / 140 + m.id * 3));
    if (!arrived) return;
    const beat = Math.floor(time / 220 + m.id) % 2, front = facing > 0 ? at.x + 1 : at.x - 0.5;
    if (m.action === "smelt") {
      // A shovel of ore into the furnace.
      fine(front, at.y - beat * 0.5, 0.5, 0.5, "#9a9ca4");
      if (beat === 0) fine(front, at.y - 0.25, 0.5, 0.25, "#c07a50");
    } else if (m.action === "smith") {
      fine(front, at.y - 1 + beat * 0.5, 0.5, 0.5, "#c8ccd4");
      fine(facing > 0 ? at.x + 0.5 : at.x, at.y - 0.5 + beat * 0.5, 0.5, 0.5, "#6a4428");
      if (effects && beat === 1 && this.fx() < 0.3)
        for (let n = 0; n < 3; n++)
          this.fx2.add("spark", front + 0.25, at.y + 0.1, (this.fx() - 0.5) * 0.24, -0.06 - this.fx() * 0.14, 14 + this.fx() * 14, this.fx() < 0.5 ? "#ffd27a" : "#ff9a3c", 0.25);
    } else if (m.action === "stock") {
      fine(facing > 0 ? at.x - 0.5 : at.x + 1, at.y - 0.5, 0.5, 1, `rgb(${TIMBER_END.join(",")})`);
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
          this.fx2.add("wisp", n.x + 0.5 + (this.fx() - 0.5), n.y - 1, 0, -0.03 - this.fx() * 0.04, 80 + this.fx() * 60, n.kind === "lost" ? "#b8c6ff" : "#ffe9a8", this.fx() < 0.5 ? 0.5 : 0.25);
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

  /** The hoist: its rope always hangs from the headframe's wheel down the
   * shaft to the bucket, which waits at the top, is let down to a load and
   * wound up with it (eased between the sim's steps). */
  private drawHoist(sim: MineSim) {
    const ctx = this.ctx, fine = this.fine, x = sim.shaftX, wheel = sim.strata.surface[x] - HEADFRAME.length + 2.5;
    const target = sim.hoist.y;
    this.hoistY = this.hoistY < 0 || Math.abs(target - this.hoistY) > 30 ? target : this.hoistY + (target - this.hoistY) * 0.3;
    const y = this.hoistY, { scale } = this.size;
    // The rope: a screen pixel or so wide, in two strands' tones.
    const ox = Math.round(-this.camX * scale), oy = Math.round(-this.camY * scale);
    const rx = Math.round(ox + (x + 0.5) * scale - scale / 8), rw = Math.max(1, Math.round(scale / 4));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#b8a47c";
    ctx.fillRect(rx, Math.round(oy + wheel * scale), rw, Math.round(oy + (y - 0.25) * scale) - Math.round(oy + wheel * scale));
    if (rw > 1) {
      ctx.fillStyle = "#8a7656";
      for (let ry = wheel; ry < y - 0.5; ry += 1) ctx.fillRect(rx, Math.round(oy + ry * scale), rw, Math.max(1, Math.round(scale / 4)));
    }
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    // The hook, the bucket's bail and the bucket itself.
    fine(x + 0.25, y - 0.25, 0.5, 0.25, "#5a5a62");
    fine(x, y, 1, 0.25, "#4a4a52");
    fine(x, y + 0.25, 1, 0.75, "#6a4422");
    fine(x, y + 0.5, 1, 0.125, "#3a2a1a");
    const h = sim.hoist;
    if (h.iron + h.gold > 0) {
      fine(x, y, 0.5, 0.25, h.gold > 0 ? "#f0c850" : "#c07a50");
      fine(x + 0.5, y, 0.5, 0.25, h.gold > h.iron ? "#f0c850" : "#b06a44");
    }
    // The yard by the shaft house, where the ore brought up is tipped.
    const n = sim.yard.iron + sim.yard.gold;
    if (n > 0) {
      const lumps = Math.min(30, Math.ceil(n / 3)), gold = Math.round((lumps * sim.yard.gold) / n), fy = sim.standY(sim.yardX) + 0.5;
      oreHeap(fine, sim.yardX + 0.5, fy, [6, 5, 4, 3, 2, 1, 1], lumps, gold);
    }
  }

  /** The building drawn at device pixel (px, py) of the view, if any. */
  buildingAt(sim: MineSim, px: number, py: number): BuildingId | null {
    const cx = this.camX + px / this.size.scale, cy = this.camY + py / this.size.scale;
    for (const id of BUILDINGS) {
      const b = sim.buildings[id], roof = b.floor - b.height - (id === "forge" ? 7 : 3);
      if (cx >= b.x0 - 1 && cx < b.x1 + 2 && cy >= roof && cy < b.floor + 2) return id;
    }
    return null;
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

  /** A few specks of `m` thrown off the face being dug: they fall and settle. */
  private kick(x: number, y: number, m: Material) {
    const shades = SHADES[m];
    if (!shades) return;
    for (let n = 0; n < 2; n++) {
      const [r, g, b] = shades[Math.floor(this.fx() * shades.length)];
      this.fx2.add("dust", x + 0.25 + this.fx() * 0.5, y + 0.25 + this.fx() * 0.5, (this.fx() - 0.5) * 0.18, -0.04 - this.fx() * 0.12, 40 + this.fx() * 30, `rgb(${r},${g},${b})`, this.fx() < 0.5 ? 0.5 : 0.25);
    }
    // A puff of fine dust hangs a moment.
    if (this.fx() < 0.3) this.fx2.add("steam", x + 0.5, y + 0.5, (this.fx() - 0.5) * 0.02, -0.004, 50, "rgb(150,140,128)", 0.5);
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

const TIMBER_END: RGB = [168, 116, 62];

/** A heap of `n` half-cell lumps of ore (`gold` of them gold) centred on
 * column `cx`, its bottom row ending at `floor`, `rows` lumps wide from the
 * bottom up, dimmed to `k`. */
function oreHeap(fine: Fine, cx: number, floor: number, rows: number[], n: number, gold: number, k = 1) {
  let placed = 0;
  for (let r = 0; r < rows.length && placed < n; r++)
    for (let i = 0; i < rows[r] && placed < n; i++, placed++) {
      const shades = placed < gold ? SHADES[GOLD] : SHADES[IRON], c = shades[(i + r) % shades.length];
      fine(cx - rows[r] / 4 + i * 0.5, floor - 0.5 - r * 0.5, 0.5, 0.5, `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`);
    }
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
