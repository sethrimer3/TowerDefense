/** Draws the Mine: the grid two pixels a cell each way into an offscreen
 * image (the same size as the miners' pixels), each cell's four pixels
 * detailed by its material and the open air beside it, lit by daylight
 * falling in from the sky (dimmed by night and cloud) and by the torches,
 * lamps, lava, fires and miners underground (a two-channel light map spread
 * cell to cell, dimmed faster through rock than air, blended between cells
 * pixel by pixel), then scaled up crisp under a camera (an even number of
 * screen pixels a cell, so every pixel is whole and they meet without
 * seams). Over it: clouds, rain and lightning, the headframe, the buildings
 * (pixel art from `art.ts`, their front walls fading to show who's inside),
 * the graves of the miners lost, the carts, the hoist's rope and bucket, the
 * yard's ore, the miners (2 × 4 figures, `figures.ts`) and the effects
 * (`particles.ts`). Water is tinted into the cells it fills; stars glint in
 * the night sky. */
import { stream } from "../random.ts";
import { CART_LOAD, MEAL_TICKS, metalSum, type Footprint, type Metals, type Inside, type Miner, type MineSim, type Rebuild, type Sky } from "./sim.ts";
import { drawFigure, drawSleeper, outfit, type Fine, type Pose } from "./figures.ts";
import { Particles } from "./particles.ts";
import { habitAt, habitPose, hammerAt, shovelAt } from "./acts.ts";
import {
  ASHLAR, GLASS, GRAVE_H, GRAVE_W, HEADFRAME_H, HEADFRAME_W, PLANK, POST, Sprites, WHEEL, chimneyRows, paintBack, paintGrave, paintHeadframe, paintShell, paintWall, roofRows, shellOrigin, windowsOf,
  type RGB,
} from "./art.ts";
import { BUILDINGS, along, anvils, pathTicks, type Building, type BuildingId } from "./buildings.ts";
import {
  AIR, BEDROCK, CELLS, COPPER, DIRT, GOLD, GRASS, GRAVEL, H, LADDER, LAMP, LAVA, LOOSE, RAIL, ROCK, RUBBLE, SILVER, STONE, TIMBER, TORCH, W, hash01, idx, isPassable,
  type Material,
} from "./world.ts";

/** Fills a rectangle in cells (to half a cell) in a colour dimmed to `k`. */
type Fill = (c: RGB, k: number, x: number, y: number, w?: number, h?: number) => void;
/** Each material's shades, picked per cell by a fixed hash. */
const SHADES: Record<number, RGB[]> = {
  [GRASS]: [[86, 140, 52], [74, 124, 44], [98, 152, 60]],
  [DIRT]: [[110, 76, 46], [98, 67, 40], [121, 85, 52], [90, 61, 37]],
  [ROCK]: [[124, 118, 110], [106, 101, 95], [138, 132, 122]],
  [STONE]: [[78, 78, 86], [70, 70, 79], [86, 85, 92], [64, 64, 72]],
  [COPPER]: [[184, 104, 62], [212, 136, 88], [150, 82, 52]],
  [SILVER]: [[176, 182, 194], [214, 220, 230], [142, 148, 160]],
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
/** The finer details of the workings' fittings and ground. */
const TORCH_HOT: RGB = [255, 238, 170], TORCH_DIM: RGB = [214, 120, 48], TORCH_STICK: RGB = [120, 78, 38], LAMP_CAP: RGB = [70, 70, 78];
const SCAFFOLD_BOARD: RGB = [176, 138, 88], SCAFFOLD_LO: RGB = [150, 114, 70];
const RUNG: RGB = [160, 112, 58], RAIL_WOOD: RGB = [104, 68, 34], RAIL_WOOD_LO: RGB = [84, 54, 26];
const RAIL_HI: RGB = [168, 168, 178], RAIL_LO: RGB = [110, 110, 120], SLEEPER: RGB = [92, 66, 40];
const PEBBLE: RGB = [128, 118, 106], ROOT: RGB = [70, 48, 30], BLADE: RGB = [112, 168, 64], BLADE_HI: RGB = [140, 192, 82];

const WINDOW_LIT: RGB = [255, 214, 122];
/** The buildings' materials. */
const FOOTING: RGB = [84, 80, 76], IRON_DARK: RGB = [58, 58, 66], BLANKET: RGB = [96, 112, 150], BAR: Record<keyof Metals, RGB> = { copper: [200, 118, 70], silver: [206, 212, 222], gold: [240, 200, 80] };
/** The colour a load of ore shows: its richest metal. */
const loadColor = (m: Metals) => (m.gold > 0 ? "#f0c850" : m.silver > 0 ? "#cdd2dc" : "#c07a50");
const SCAFFOLD: RGB = [176, 138, 88];
/** Cells across the view at the furthest zoom out, and how far in it goes. */
export const VIEW_CELLS = 256, MAX_ZOOM = 8;

type Bolt = { points: [number, number][]; forks: [number, number][][]; until: number };

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
  /** A fixed number (0 to 255) for each of the four pixels of every cell,
   * picking its grain; and the light at a cell's four pixels as it paints. */
  private grain = new Uint8Array(CELLS * 4);
  private lr = new Float32Array(4);
  private lg = new Float32Array(4);
  private lb = new Float32Array(4);
  private sprites = new Sprites();
  private glow: HTMLCanvasElement;
  private litAt = -1e9;
  private paintedVersion = -1;
  private paintedAt = -1e9;
  private paintedRows = "";
  private seed = -1;
  private fx2 = new Particles();
  /** The last beat each one-off effect played on, by key. */
  private beats = new Map<string, number>();
  /** Until when (ms) the furnace flares from ore just thrown in. */
  private flareUntil = 0;
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
    this.off.width = W * 2;
    this.off.height = H * 2;
    this.offCtx = this.off.getContext("2d")!;
    this.image = this.offCtx.createImageData(W * 2, H * 2);
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
    const before = this.size, ref = this.refWidth > 0 ? this.refWidth * dpr : w;
    // An even number of device pixels a cell, near `VIEW_CELLS` across but
    // never so few that the view is wider than the world.
    let min = 2 * Math.max(1, Math.floor(ref / (VIEW_CELLS * 2)));
    if (ref / min > W) min += 2;
    const scale = this.scaleFor(min, this.want);
    if (before.w > 1) {
      this.camX += before.w / (2 * before.scale) - w / (2 * scale);
      this.camY += before.h / (2 * before.scale) - h / (2 * scale);
    }
    this.size = { w, h, scale, min };
    this.clamp();
    return dpr / scale;
  }
  /** Device pixels a cell: always even, so each of a cell's pixels is a
   * whole number of them. */
  private scaleFor(min: number, want: number) {
    return Math.max(min, Math.min(min * MAX_ZOOM, 2 * Math.round((min * want) / 2)));
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

  /** Paints rows `y0` to `y1` of the grid, two pixels a cell each way: every
   * cell's four pixels take its material's detail (grains of gravel, specks
   * in dirt, cracks in stone, ore glinting in its rock, blades of grass, a
   * ladder's rung over its rails, a rail on its sleeper, a torch's flame on
   * its stick), a lit lip where solid ground meets open air above and a
   * shadow under it, and a light blended from the cell's and its
   * neighbours'. */
  private paint(sim: MineSim, y0: number, y1: number, time: number) {
    const cells = sim.world.cells, water = sim.world.water, burn = sim.burn, px = this.pixels, sky = this.sky, warm = this.warm, shade = this.shade, grain = this.grain;
    const { surface, stoneTop } = sim.strata;
    const { daylight, clouds } = this.skyNow, night = 1 - daylight, starlight = night * (1 - clouds), open = this.skyLight();
    const flicker = Math.floor(time / 110), W2 = W * 2, lr = this.lr, lg = this.lg, lb = this.lb;
    for (let y = y0; y < y1; y++) {
      const t = Math.min(1, Math.max(0, y / 50));
      let skyRgb = mix(mix(NIGHT_TOP, NIGHT_LOW, t), mix(SKY_TOP, SKY_LOW, t * t), daylight);
      skyRgb = mix(skyRgb, mix(NIGHT_TOP, OVERCAST, daylight), clouds * 0.65);
      const skyPx = pack(skyRgb, 1), up = y > 0 ? -W : 0, down = y < H - 1 ? W : 0;
      for (let x = 0; x < W; x++) {
        const i = idx(x, y), m = cells[i], o = 2 * y * W2 + 2 * x, g4 = 4 * i;
        if (m === TORCH && !burn[i]) {
          // A flame flickering on its stick.
          const f = (flicker + shade[i]) % 3;
          px[o] = pack(f === 0 ? TORCH_HOT : TORCH_RGB, 1);
          px[o + 1] = pack(f === 1 ? TORCH_HOT : f === 2 ? TORCH_RGB : TORCH_DIM, 1);
          px[o + W2] = pack(TORCH_STICK, 1);
          px[o + W2 + 1] = pack(TORCH_DIM, 0.7);
          continue;
        }
        if (m === LAMP) {
          // A lamp: its iron cap over the glass.
          px[o] = px[o + 1] = pack(LAMP_CAP, 1);
          px[o + W2] = pack(LAMP_RGB, 1);
          px[o + W2 + 1] = pack(LAMP_RGB, 0.9);
          continue;
        }
        // Lava and fire give their own light, each pixel flickering apart.
        if (m === LAVA || burn[i]) {
          const shades = m === LAVA ? SHADES[LAVA] : FIRE_RGB, slow = m === LAVA ? 2 : 0;
          for (let q = 0; q < 4; q++) px[o + (q >> 1) * W2 + (q & 1)] = pack(shades[(grain[g4 + q] + ((flicker + grain[g4 + q]) >> slow)) % 3], 1);
          continue;
        }
        const passable = isPassable(m), inSky = passable && y < surface[x];
        if (inSky && m === AIR) {
          let c = skyPx;
          if (water[i]) {
            const rgb = mix(WATER_RGB, skyRgb, 0.3).map((v) => v * (0.35 + 0.65 * open)) as RGB;
            c = pack(rgb, 1);
            px[o] = px[o + 1] = i >= W && !water[i - W] ? pack(rgb, 1.25) : c;
            px[o + W2] = px[o + W2 + 1] = c;
            continue;
          }
          px[o] = px[o + 1] = px[o + W2] = px[o + W2 + 1] = c;
          // Stars, now and then, through clear night skies.
          const star = hash01(x, y, sim.seed + 5);
          if (starlight > 0.05 && star < 0.014 && y < surface[x] - 6) {
            const twinkle = 0.55 + 0.45 * Math.sin(time / 380 + star * 9000);
            px[o + (shade[i] & 1) + ((shade[i] >> 1) & 1) * W2] = pack(mix(skyRgb, [236, 236, 255], starlight * twinkle * (star < 0.004 ? 1 : 0.6)), 1);
          }
          continue;
        }
        // The light at each of the cell's pixels: half its own, a quarter
        // each from its neighbours beside and above or below that pixel.
        const near = (0.5 - (y - surface[x]) * 0.022) * open, l = x > 0 ? -1 : 0, r = x < W - 1 ? 1 : 0;
        if (near <= 0 && !water[i] && sky[i] + warm[i] + sky[i + l] + warm[i + l] + sky[i + r] + warm[i + r] + sky[i + up] + warm[i + up] + sky[i + down] + warm[i + down] === 0) {
          // Unlit: too dark for any detail to show.
          const shades = SHADES[m], c = shades ? shades[shade[i] % shades.length] : y < stoneTop[x] ? DIRT_BACK : STONE_BACK;
          px[o] = px[o + 1] = px[o + W2] = px[o + W2 + 1] = pack3(c[0] * 0.025, c[1] * 0.025, c[2] * 0.03);
          continue;
        }
        for (let q = 0; q < 4; q++) {
          const h = q & 1 ? r : l, v = q >> 1 ? down : up;
          const s = Math.max(sky[i] * 0.5 + sky[i + h] * 0.25 + sky[i + v] * 0.25, near), w = warm[i] * 0.5 + warm[i + h] * 0.25 + warm[i + v] * 0.25;
          lr[q] = s * 0.98 + w * 1.15 + 0.025;
          lg[q] = s * 0.96 + w * 0.8 + 0.025;
          lb[q] = s * 0.94 + w * 0.5 + 0.03;
        }
        const back: RGB = inSky ? skyRgb : y < stoneTop[x] ? DIRT_BACK : STONE_BACK;
        if (water[i]) {
          // Water: deep blue, catching whatever light there is, its surface brighter.
          const top = i >= W && !water[i - W];
          for (let q = 0; q < 4; q++) {
            const k = Math.min(1, 0.22 + (lr[q] + lg[q]) * 0.45) * (top && q < 2 ? 1.35 : 1), c = passable ? back : SHADES[m]?.[shade[i] % SHADES[m].length] ?? back;
            px[o + (q >> 1) * W2 + (q & 1)] = pack3(c[0] * lr[q] * 0.3 + WATER_RGB[0] * k, c[1] * lg[q] * 0.3 + WATER_RGB[1] * k, c[2] * lb[q] * 0.3 + WATER_RGB[2] * k);
          }
          continue;
        }
        // Open ground above and below, beside: the lit lip and the shadow.
        const solid = !passable, openUp = solid && up !== 0 && isPassable(cells[i + up]), openDown = solid && down !== 0 && isPassable(cells[i + down]);
        const openL = solid && l !== 0 && isPassable(cells[i - 1]), openR = solid && r !== 0 && isPassable(cells[i + 1]);
        const shades = SHADES[m];
        for (let q = 0; q < 4; q++) {
          const sx = q & 1, sy = q >> 1, g = grain[g4 + q];
          let c: RGB = back, k = 1;
          if (m === AIR) {
            k = 0.86 + g * 0.0011;
            if (inSky) {
              px[o + sy * W2 + sx] = skyPx;
              continue;
            }
          } else if (m === LADDER && !inSky && x > 0 && x < W - 1 && isPassable(cells[i - 1]) && isPassable(cells[i + 1])) {
            // Standing free in a cave: scaffolding, a pole with a board
            // across it every few cells.
            if (sy === 0 && y % 4 === 0) c = sx ? SCAFFOLD_LO : SCAFFOLD_BOARD;
            else if (sx === (x & 1)) c = sy ? RAIL_WOOD_LO : RAIL_WOOD;
            else k = 0.86 + g * 0.0011;
          } else if (m === LADDER) {
            if (sy === 0) c = RUNG;
            else c = sx ? RAIL_WOOD_LO : RAIL_WOOD;
            if (inSky && sy === 1 && sx === 1) {
              px[o + W2 + 1] = skyPx;
              continue;
            }
          } else if (m === RAIL) {
            if (sy === 1) c = x % 3 === 0 && sx === 0 ? SLEEPER : sx ? RAIL_LO : RAIL_HI;
            else if (inSky) {
              px[o + sx] = skyPx;
              continue;
            } else k = 0.86 + g * 0.0011;
          } else {
            switch (m) {
              case GRAVEL:
              case RUBBLE:
              case LOOSE:
                c = shades[g % shades.length];
                break;
              case DIRT:
                c = g < 14 ? PEBBLE : g > 248 ? ROOT : shades[(shade[i] + (g >> 6)) % shades.length];
                k = 0.93 + g * 0.0005;
                break;
              case STONE:
              case BEDROCK:
                c = shades[shade[i] % shades.length];
                k = g < 16 ? 0.72 : g > 246 ? 1.18 : 0.94 + g * 0.0003;
                break;
              case COPPER:
              case SILVER:
              case GOLD:
                // Nuggets of ore set in their stone, the odd one glinting.
                if (g < 150) {
                  c = shades[(shade[i] + g) % shades.length];
                  k = g < 12 ? 1.3 : 1;
                } else c = SHADES[STONE][shade[i] % 4];
                break;
              case GRASS:
                // Blades against the sky along the top; dirt showing below.
                if (sy === 0 && openUp) {
                  if (g < 100) {
                    px[o + sx] = y - 1 < surface[x] ? skyPx : pack(back, 0.5);
                    continue;
                  }
                  c = g > 200 ? BLADE_HI : BLADE;
                } else c = sy === 1 && cells[i + down] === DIRT && g < 90 ? SHADES[DIRT][g & 3] : shades[(shade[i] + g) % shades.length];
                break;
              case TIMBER:
                if (openDown) {
                  // A beam over open air: a trestle, its deck over a post.
                  if (sy === 0) c = shades[shade[i] % shades.length];
                  else if ((x & 1) === sx) c = RAIL_WOOD_LO;
                  else {
                    c = back;
                    k = 0.86 + g * 0.0011;
                  }
                  break;
                }
                c = shades[shade[i] % shades.length];
                k = sy === 0 ? 1.12 : y % 3 === 0 ? 0.7 : 0.88;
                break;
              default:
                c = shades ? shades[shade[i] % shades.length] : back;
                k = 0.94 + g * 0.0003;
            }
            // Boulders and timbers stand out from the ground round them.
            if ((m === ROCK || m === TIMBER) && !openUp && !openDown) {
              if (sy === 0 && up !== 0 && cells[i + up] !== m) k *= 1.16;
              else if (sy === 1 && down !== 0 && cells[i + down] !== m) k *= 0.78;
              if (sx === 0 && l !== 0 && cells[i - 1] !== m) k *= 1.06;
              else if (sx === 1 && r !== 0 && cells[i + 1] !== m) k *= 0.88;
            }
            if (openUp && sy === 0) k *= 1.2;
            else if (openDown && sy === 1) k *= 0.74;
            if (openL && sx === 0) k *= 1.08;
            else if (openR && sx === 1) k *= 0.88;
          }
          px[o + sy * W2 + sx] = pack3(c[0] * k * lr[q], c[1] * k * lg[q], c[2] * k * lb[q]);
        }
      }
    }
    this.offCtx.putImageData(this.image, 0, 0, 0, y0 * 2, W2, (y1 - y0) * 2);
  }

  /** Draws a frame. `time` is in ms; `effects` turns dust and glow on. */
  draw(sim: MineSim, time: number, effects: boolean) {
    if (sim.seed !== this.seed) {
      this.seed = sim.seed;
      for (let i = 0; i < CELLS; i++) {
        const x = i % W, y = (i / W) | 0;
        this.shade[i] = Math.floor(hash01(x, y, sim.seed + 77) * 12);
        for (let q = 0; q < 4; q++) this.grain[i * 4 + q] = Math.floor(hash01(2 * x + (q & 1), 2 * y + (q >> 1), sim.seed + 78) * 256);
      }
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
    // The world changes most frames while the crew works: repaint for it at
    // most every 60 ms (each cell is four pixels now).
    if (relight || rows !== this.paintedRows || (sim.world.version !== this.paintedVersion && time - this.paintedAt > 60)) {
      this.paint(sim, y0, y1, time);
      this.paintedAt = time;
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
    ctx.drawImage(this.off, 0, y0 * 2, W * 2, (y1 - y0) * 2, 0, y0, W, y1 - y0);
    if (y0 < 60) this.drawClouds(sim, time);
    this.drawSurface(sim, time, effects);
    if (effects && y0 < 60) this.drawRain(sim, time);
    if (effects) this.drawGlow(sim, time, y0, y1);
    this.drawHoist(sim);
    const fine = this.fine;
    for (const c of sim.carts) {
      if (c.y < y0 - 3 || c.y > y1 + 1) continue;
      // A tub with an iron rim and rivets on two spoked wheels.
      fine(c.x - 1, c.y - 1, 3, 0.25, "#8a8a96");
      fine(c.x - 1, c.y - 0.75, 3, 0.75, "#4a4a52");
      fine(c.x - 0.5, c.y - 0.5, 0.25, 0.25, "#6e6e7a");
      fine(c.x + 1.25, c.y - 0.5, 0.25, 0.25, "#6e6e7a");
      for (const wx of [c.x - 0.75, c.x + 1.25]) {
        fine(wx, c.y, 0.5, 0.5, "#16141a");
        fine(wx + 0.125, c.y + 0.125, 0.25, 0.25, "#5a5a64");
      }
      const load = metalSum(c);
      if (load > 0) oreHeap(fine, c.x + 0.5, c.y - 0.75, [6, 4, 2], Math.min(12, Math.ceil((12 * load) / CART_LOAD)), Math.round((12 * c.gold) / Math.max(1, load)), 1, Math.round((12 * c.silver) / Math.max(1, load)));
    }
    const waiting = sim.miners.filter((m) => !m.inside && (m.action === "idle" || m.action === "rest"));
    for (const m of sim.miners) {
      if (m.inside || m.y < y0 - 2 || m.y > y1 + 2) continue;
      this.drawMiner(sim, m, time, effects, waiting);
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
    this.drawLightning(sim, time);
  }

  /** True once each time `n` moves on for the key: a beat's one-off effect. */
  private once(key: string, n: number) {
    if (this.beats.get(key) === n) return false;
    const fresh = this.beats.has(key);
    this.beats.set(key, n);
    if (this.beats.size > 400) this.beats.clear();
    return fresh;
  }

  /** A miner out in the world, at what it's doing: the pick raised over its
   * head and struck at the face, the hammer at a fitting, a bucket swung,
   * a sack on its back, a lamp on its hat lighting the dark; waiting, it
   * falls into its habits (`acts.ts`) or, beside another waiting, chats. */
  private drawMiner(sim: MineSim, m: Miner, time: number, effects: boolean, waiting: Miner[]) {
    const fine = this.fine, look = outfit(m.name, m.job), step = Math.floor(time / 140 + m.id * 3);
    const climbing = m.action === "walk" && sim.world.get(m.x, m.y) === LADDER;
    let pose: Pose = climbing ? "climb" : m.action === "walk" ? "walk" : "work", facing = m.facing;
    const front = () => (facing > 0 ? m.x + 1 : m.x - 0.5);
    const below = m.y > sim.strata.surface[m.x];
    if (m.action === "idle" || m.action === "rest") {
      const mate = waiting.find((o) => o !== m && o.y === m.y && Math.abs(o.x - m.x) <= 2 && Math.abs(o.x - m.x) >= 1);
      if (mate) {
        // Two waiting side by side turn to each other and talk in turns.
        facing = Math.sign(mate.x - m.x);
        pose = "stand";
        const turn = Math.floor((time + Math.min(m.id, mate.id) * 977) / 2600);
        if (effects && (turn + (m.id < mate.id ? 0 : 1)) % 2 === 0 && this.once(`talk${m.id}`, turn)) this.fx2.add("word", m.x + 0.6, m.y - 2, 0, 0, 50, "#f0ead8");
      } else {
        const h = habitAt(m.name, time + m.id * 313), hp = habitPose(h.habit, h.t, m.facing, step);
        pose = hp.pose;
        facing = hp.facing;
        if (effects && h.habit === "whistle" && h.t > 0.2 && this.once(`note${m.id}`, h.spell * 4 + Math.floor(h.t * 3)))
          this.fx2.add("note", m.x + (facing > 0 ? 1.2 : -0.2), m.y - 1.6, facing * 0.004, -0.02, 70, "#f4e9c0");
        if (effects && h.habit === "sift" && pose === "crouch" && this.fx() < 0.04) this.kick(m.x + (facing > 0 ? 1 : -1), m.y, sim.world.get(m.x + (facing > 0 ? 1 : -1), m.y + 1));
      }
    }
    if (m.action === "dig" && m.work >= 0) {
      // The pick: raised over the head, then struck at the face.
      const wx = m.work % W, wy = (m.work - wx) / W, dir = Math.sign(wx - m.x) || m.facing, beat = Math.floor(time / 180 + m.id), raised = beat % 2 === 0;
      facing = dir;
      pose = raised ? "reach" : "work";
      const hx = dir > 0 ? m.x + 1 : m.x - 0.5, hy = wy < m.y - 1 ? m.y - 1.5 : wy > m.y ? m.y + 0.5 : m.y - 1;
      drawFigure(fine, look, m.x, m.y, facing, pose, step);
      if (raised) {
        fine(dir > 0 ? m.x + 0.5 : m.x, m.y - 1.5, 0.5, 0.5, "#7a5230");
        fine(dir > 0 ? m.x + 1 : m.x - 0.5, m.y - 2, 0.5, 0.5, "#b9bcc4");
      } else {
        fine(hx, hy, 0.5, 0.5, "#b9bcc4");
        fine(dir > 0 ? m.x + 0.5 : m.x, m.y, 0.5, 0.5, "#7a5230");
        if (effects && this.once(`dig${m.id}`, beat) && this.fx() < 0.5) this.kick(wx, wy, sim.world.get(wx, wy));
      }
    } else if (m.action === "build" && m.work >= 0) {
      // A hammer at the fitting: up, then down with a puff of dust.
      const wx = m.work % W, beat = Math.floor(time / 200 + m.id), up = beat % 2 === 0;
      facing = Math.sign(wx - m.x) || m.facing;
      drawFigure(fine, look, m.x, m.y, facing, up ? "reach" : "work", step);
      fine(up ? (facing > 0 ? m.x + 0.5 : m.x) : front(), up ? m.y - 2 : m.y - 0.5, 0.5, 0.5, "#c8ccd4");
      if (effects && !up && this.once(`build${m.id}`, beat) && this.fx() < 0.4) this.fx2.add("dust", front() + 0.25, m.y - 0.25, facing * 0.05, -0.06, 30, "#bcb4a4", 0.25);
    } else if ((m.action === "bail" || m.action === "douse") && m.work >= 0) {
      // A bucket dipped low, then swung out.
      const up = step % 2;
      drawFigure(fine, look, m.x, m.y, facing, up ? "work" : "crouch", step);
      fine(front(), m.y - up * 0.5 + (up ? 0 : 0.5), 0.5, 0.5, m.action === "douse" ? "#9fc6f0" : "#5a86c8");
      fine(front(), m.y - up * 0.5 + (up ? 0 : 0.5) - 0.25, 0.5, 0.25, "#7a7a82");
      if (effects && up && this.once(`splash${m.id}`, step) && this.fx() < 0.6) this.fx2.add("drop", front() + 0.25, m.y - 0.5, facing * 0.06, -0.08, 40, "#9fc6f0");
    } else drawFigure(fine, look, m.x, m.y, facing, pose, step);
    const back = facing > 0 ? m.x - 0.5 : m.x + 1;
    // A sack of ore on the back, or a basket of spoil.
    if (metalSum(m) > 0) {
      fine(back, m.y - 0.5, 0.5, 1, "#6a5236");
      fine(back, m.y - 0.5, 0.5, 0.5, loadColor(m));
    } else if (m.spoil > 0) fine(back, m.y - 0.5, 0.5, 1, "#5a4630");
    // Hungry and hard at it: now and then a drop of sweat.
    if (effects && m.fed > MEAL_TICKS * 0.8 && m.action !== "idle" && this.fx() < 0.006) this.fx2.add("drop", m.x + 0.5, m.y - 1, facing * -0.02, -0.03, 40, "#cfe4ff");
    // A lamp on the hat lights the dark round its wearer.
    if (effects && look.lamp && below) this.glowAt(m.x + (facing > 0 ? 0.75 : 0.25), m.y - 1, 4, 0.22);
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
    ctx.drawImage(this.sprites.get("headframe", HEADFRAME_W, HEADFRAME_H, paintHeadframe, k), x0 - 4, top - HEADFRAME_H / 2, HEADFRAME_W / 2, HEADFRAME_H / 2);
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
      ctx.drawImage(this.sprites.get(`grave${g}`, GRAVE_W, GRAVE_H, (p) => paintGrave(p, g), k), gx - 1, sim.standY(gx) - 3, GRAVE_W / 2, GRAVE_H / 2);
    }
  }

  /** A building's front wall, back wall or shell, painted once for its
   * place and size and dimmed to `k`. */
  private piece(b: Footprint & { id: BuildingId }, part: "wall" | "back" | "shell", k: number) {
    const bb = b as Building, key = `${part}:${b.id}:${b.x0}:${b.x1}:${b.floor}:${b.height}:${bb.door}`;
    if (part === "shell") {
      const o = shellOrigin(bb), w = (b.x1 - b.x0 + 3) * 2, h = (b.floor - o.y + 1) * 2;
      return this.sprites.get(key, w, h, (p) => paintShell(p, bb), k);
    }
    const w = (b.x1 - b.x0 - 1) * 2, h = b.height * 2;
    return this.sprites.get(key, w, h, (p) => (part === "wall" ? paintWall(p, bb) : paintBack(p, bb)), k);
  }

  /** The stone footing under a building, down to the ground. */
  private footing(sim: MineSim, b: Footprint, k: number, fill: Fill) {
    const surface = sim.strata.surface;
    for (let x = b.x0; x <= b.x1; x++) {
      if (surface[x] <= b.floor + 1) continue;
      fill(FOOTING, k, x, b.floor + 1, 1, surface[x] - b.floor - 1);
      fill(FOOTING, k * 1.2, x, b.floor + 1, 1, 0.5);
      for (let y = b.floor + 2; y < surface[x]; y++) fill(FOOTING, k * 0.78, x + ((y + x) % 2) * 0.5, y - 0.5, 0.5, 0.5);
    }
  }

  /** One building: its footing down to the ground, then (while its wall is
   * fading) the room behind with its fittings and the miners in it, then
   * the front wall, frame and roof. */
  private drawBuilding(sim: MineSim, b: Building, crew: Miner[], time: number, k: number, night: number, effects: boolean) {
    const ctx = this.ctx, F = b.floor, top = F - b.height + 1;
    const fill = this.filler();
    this.footing(sim, b, k, fill);
    const open = this.open[b.id], lamp = 0.78 + 0.06 * Math.sin(time / 300), inner = b.x1 - b.x0 - 1;
    if (open > 0.01) {
      ctx.drawImage(this.piece(b, "back", lamp), b.x0 + 1, top, inner, b.height);
      this.drawRoom(sim, b, time, lamp, fill);
      for (const m of crew) this.drawInside(sim, b, m, time, effects);
    }
    // The front wall, its windows lit: the barracks' at night, the forge's by its fire.
    ctx.globalAlpha = 1 - open * 0.88;
    ctx.drawImage(this.piece(b, "wall", k), b.x0 + 1, top, inner, b.height);
    const lit = b.id === "forge" ? (sim.working("forge") ? 1 : 0.25) : b.id === "barracks" || b.id === "shaft" ? Math.min(1, night * 1.4) : 0;
    if (lit > 0)
      for (const wx of windowsOf(b)) {
        const c = mix(GLASS, b.id === "forge" ? [255, 150, 60] : WINDOW_LIT, lit);
        fill(c, 1, wx, F - 4, 1, 1);
        fill(c, 0.85, wx, F - 2.5, 1, 0.5);
        fill(c, 1.15, wx, F - 4, 0.5, 0.5);
      }
    ctx.globalAlpha = 1;
    // Frame, door and roof stay put.
    const o = shellOrigin(b);
    ctx.drawImage(this.piece(b, "shell", k), o.x, o.y, b.x1 - b.x0 + 3, F - o.y + 1);
    const rows = roofRows(b);
    if (b.id === "forge" && effects && this.fx() < (sim.working("forge") ? 0.22 : 0.03)) {
      // The chimney smokes while the furnace is worked.
      const grey = 110 + Math.floor(this.fx() * 50);
      this.fx2.add("smoke", b.x0 + 2.5 + this.fx(), top - rows - 4.2, (this.fx() - 0.5) * 0.01, -0.035 - this.fx() * 0.025, 140 + this.fx() * 90, `rgb(${grey},${grey - 4},${grey - 8})`, 0.5);
    }
    if (b.id === "forge" && effects && open > 0.3 && sim.working("forge") && this.fx() < 0.06)
      this.fx2.add("ember", b.x0 + 2 + this.fx() * 1.5, F - 2.5, (this.fx() - 0.5) * 0.02, -0.015 - this.fx() * 0.015, 50 + this.fx() * 40, "#ffb050", 0.25);
    if (b.id === "shaft") {
      // The lantern by the door on its bracket, aglow after dark.
      const lx = b.x1 + 1, ly = F - 3, glow = mix([150, 120, 60], [255, 220, 130], Math.min(1, night * 1.5)), gk = night > 0.3 ? 1 : k;
      fill(IRON_DARK, k, lx - 0.5, ly - 1, 1, 0.5);
      fill(IRON_DARK, k, lx, ly - 0.5, 1, 0.5);
      fill(glow, gk, lx, ly, 1, 0.5);
      fill(glow, gk * 0.8, lx, ly + 0.5, 0.5, 0.5);
      fill(IRON_DARK, k, lx + 0.5, ly + 0.5, 0.5, 0.5);
      if (effects && night > 0.2) this.glowAt(lx, ly, 10, Math.min(1, (night - 0.2) * 1.3) * 0.55 * (0.85 + 0.15 * Math.sin(time / 170) * Math.sin(time / 410)));
    }
    if (this.picked === b.id) this.outline(b, top - 1 - rows - chimneyRows(b), time);
    if (effects && b.id === "barracks" && night > 0.2)
      for (const wx of windowsOf(b).filter((_, i) => i % 2 === 0)) this.glowAt(wx, F - 4, 8, Math.min(1, (night - 0.2) * 1.3) * 0.35);
  }
  /** Fills a rectangle in cells (to half a cell) in a colour dimmed to `k`. */
  private filler(): Fill {
    const ctx = this.ctx;
    return (c, kk, x, y, w = 1, h = 1) => {
      ctx.fillStyle = `rgb(${clamp255(c[0] * kk)},${clamp255(c[1] * kk)},${clamp255(c[2] * kk)})`;
      ctx.fillRect(x, y, w, h);
    };
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
    const ctx = this.ctx, F = site.floor, fill = this.filler();
    this.footing(sim, site, k, fill);
    // The walls, risen (or still standing) to the share of the work done,
    // half a cell at a time.
    const rows = Math.round(site.height * 2 * done) / 2, top = F - site.height + 1;
    if (rows > 0) {
      const wall = this.piece({ ...site, id: b.id, door: down ? site.x1 : b.door } as Building, "wall", k);
      const from = (site.height - rows) * 2;
      ctx.drawImage(wall, 0, from, wall.width, wall.height - from, site.x0 + 1, F + 1 - rows, site.x1 - site.x0 - 1, rows);
      for (const x of [site.x0, site.x1]) {
        fill(POST, k * 1.25, x, F + 1 - rows, 0.5, rows);
        fill(POST, k * 0.75, x + 0.5, F + 1 - rows, 0.5, rows);
      }
    }
    // The scaffold: poles either side and every few columns, boards across
    // with their ends shadowed, and lashings where they cross.
    ctx.globalAlpha = 0.92;
    const poles: number[] = [];
    for (let x = site.x0 - 1; x <= site.x1 + 1; x += 4) poles.push(x);
    if (poles[poles.length - 1] !== site.x1 + 1) poles.push(site.x1 + 1);
    for (const x of poles) {
      fill(SCAFFOLD, k, x, top - 2, 0.5, site.height + 2);
      fill(SCAFFOLD, k * 0.7, x + 0.5, top - 2, 0.5, site.height + 2);
    }
    for (let y = F - 1; y >= top - 2; y -= 3) {
      fill(SCAFFOLD, k, site.x0 - 1, y, site.x1 - site.x0 + 3, 0.5);
      fill(SCAFFOLD, k * 0.7, site.x0 - 1, y + 0.5, site.x1 - site.x0 + 3, 0.5);
      for (const x of poles) fill([90, 70, 44], k, x, y, 0.5, 0.5);
    }
    ctx.globalAlpha = 1;
    // Timber stacked by the site, and a hoisting rope swaying from the top.
    const sx = site.x1 + 2;
    for (let n = 0; n < 4; n++) fill(n % 2 ? TIMBER_END : [140, 96, 50], k, sx + n * 0.5, F + 0.5, 0.5, 0.5);
    fill(PLANK[0], k, sx, F, 2, 0.5);
    fill(PLANK[1], k, sx + 0.5, F - 0.5, 1.5, 0.5);
    const sway = Math.round(Math.sin(time / 500) * 2) / 2;
    fill([140, 120, 90], k, Math.floor((site.x0 + site.x1) / 2) + 0.25 + sway, top - 1, 0.5, Math.max(1, site.height - rows));
    if (this.picked === b.id) this.outline(site, top - 3, time);
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
  private drawRoom(sim: MineSim, b: Building, time: number, k: number, fill: Fill) {
    const F = b.floor, x0 = b.x0, flick = Math.floor(time / 120);
    if (b.id === "shaft") {
      // The hatch over the shaft, the top of its ladder and the winch.
      fill([20, 16, 14], k, sim.shaftX, F, 1, 1);
      for (let y = F - b.height + 1; y <= F; y++) {
        fill(PLANK[1], k, sim.shaftX, y + 0.5, 0.5, 0.5);
        fill(POST, k, sim.shaftX + 0.5, y + 0.5, 0.5, 0.5);
        fill(PLANK[0], k * 1.1, sim.shaftX, y, 1, 0.5);
      }
      // The winch drum, its rope wraps turning while the hoist runs.
      fill(IRON_DARK, k, b.x1 - 2, F - 1, 1.5, 1);
      const turn = sim.hoist.state === "idle" ? 0 : Math.floor(this.hoistY * 2) % 3;
      for (let n = 0; n < 3; n++) fill([120, 100, 70], k * (n === turn ? 1.25 : 0.9), b.x1 - 2 + n * 0.5, F - 1.5, 0.5, 0.5);
      fill(POST, k, b.x1 - 2, F, 0.5, 1);
      fill(POST, k, b.x1 - 1, F, 0.5, 1);
    } else if (b.id === "barracks") {
      // The lounge: a table with a mug and a candle, two stools, a hanging lamp.
      fill(PLANK[0], k * 1.1, x0 + 3, F - 1, 2, 0.5);
      fill(PLANK[1], k, x0 + 3, F - 0.5, 2, 0.5);
      fill(POST, k, x0 + 3, F, 0.5, 1);
      fill(POST, k, x0 + 4.5, F, 0.5, 1);
      for (const sx of [x0 + 2, x0 + 5]) {
        fill(PLANK[1], k, sx, F + 0.5 - 0.5, 1, 0.5);
        fill(POST, k, sx, F + 0.5, 0.5, 0.5);
        fill(POST, k, sx + 0.5, F + 0.5, 0.5, 0.5);
      }
      fill([210, 200, 180], k, x0 + 4.5, F - 1.5, 0.5, 0.5);
      fill([240, 228, 200], k, x0 + 3.5, F - 1.5, 0.5, 0.5);
      fill(WINDOW_LIT, 1, x0 + 3.5, F - 2, 0.5, 0.5);
      fill(IRON_DARK, k, x0 + 4, F - b.height + 1, 0.5, 1.5);
      fill(IRON_DARK, k, x0 + 3.5, F - 5.5, 1.5, 0.5);
      fill(WINDOW_LIT, 1, x0 + 3.5, F - 5, 1.5, 0.5);
      // Bays of bunks, three tiers a side of each ladder: a pillow by the
      // ladder, a blanket folded at the foot.
      const bays = (b.spots.sleep?.length ?? 0) / 6;
      for (let p = 0; p < bays; p++) {
        const px = x0 + 7 + p * 7, ladder = px + 3;
        fill(POST, k, ladder, F - 5, 0.5, 6);
        fill(POST, k * 0.8, ladder + 0.5, F - 5, 0.5, 6);
        for (let y = F - 5; y <= F; y++) fill(PLANK[0], k * 1.1, ladder, y, 1, 0.5);
        fill(POST, k, px, F - 5, 0.5, 6);
        fill(POST, k, px + 6.5, F - 5, 0.5, 6);
        for (let tier = 0; tier < 3; tier++) {
          const y = F - 2 * tier;
          for (const [bx, pillow, foot] of [[px, px + 2.5, px + 0.5], [px + 4, px + 4, px + 6]] as const) {
            fill(PLANK[1], k, bx, y, 3, 0.5);
            fill(POST, k * 0.8, bx, y + 0.5, 3, 0.5);
            fill([226, 220, 206], k, pillow, y - 0.5, 0.5, 0.5);
            fill(BLANKET, k * 0.8, foot, y - 0.5, 0.5, 0.5);
            fill(BLANKET, k * 0.65, foot, y - 1, 0.5, 0.5);
          }
        }
      }
    } else if (b.id === "warehouse") {
      // Shelves on brackets: timber and rails below, lamps and torches
      // above, as full as the warehouse's supplies; props by the wall.
      for (const y of [F - 2, F - 4]) {
        fill(PLANK[0], k * 1.1, x0 + 1, y, b.x1 - x0 - 1, 0.5);
        fill(POST, k, x0 + 1, y + 0.5, b.x1 - x0 - 1, 0.5);
        for (let x = x0 + 2; x < b.x1 - 1; x += 3) fill(IRON_DARK, k, x, y + 0.5, 0.5, 0.5);
      }
      const slots = (b.x1 - x0 - 1) * 2;
      let left = Math.round((2 * slots * Math.min(sim.stock, sim.stockCap)) / Math.max(1, sim.stockCap));
      for (let n = 0; n < slots && left > 0; n++, left--) {
        const x = x0 + 1 + n * 0.5;
        if (n % 4 < 2) {
          fill(TIMBER_END, k, x, F - 2.5, 0.5, 0.5);
          fill([126, 84, 42], k, x, F - 3, 0.5, 0.5);
        } else fill(n % 4 === 2 ? [168, 168, 178] : [110, 110, 120], k, x, F - 2.5, 0.5, 0.5);
      }
      for (let n = 0; n < slots && left > 0; n++, left--) {
        const x = x0 + 1 + n * 0.5, kind = n % 3;
        if (kind === 0) {
          fill(TORCH_STICK, k, x, F - 4.5, 0.5, 0.5);
          fill(TORCH_RGB, k, x, F - 5, 0.5, 0.5);
        } else if (kind === 1) {
          fill(LAMP_CAP, k, x, F - 5, 0.5, 0.5);
          fill([230, 220, 170], k * 0.9, x, F - 4.5, 0.5, 0.5);
        } else fill(TIMBER_END, k * 0.9, x, F - 4.5, 0.5, 0.5);
      }
      fill(PLANK[0], k, x0 + 1, F - 1, 0.5, 2);
      fill(PLANK[1], k, x0 + 1.5, F - 0.5, 0.5, 1.5);
      fill(PLANK[1], k, x0 + 2, F, 1, 0.5);
      fill(TIMBER_END, k, x0 + 2, F + 0.5, 1, 0.5);
    } else if (b.id === "forge") {
      // The furnace: brick, an arched mouth roaring while it is worked, a
      // flue to the chimney, and the bellows; ore by the door.
      const hot = sim.working("forge") > 0;
      for (let y = F - 4; y <= F + 0.5; y += 0.5)
        for (let x = x0 + 1; x < x0 + 4; x += 0.5) {
          const joint = (y * 2) % 2 === 1 || ((x * 2 + (Math.floor(y) % 2) * 2) % 4 === 3);
          fill(joint ? [90, 82, 76] : [138, 70, 52], k * (0.9 + 0.1 * ((x * 7 + y * 3) % 2)), x, y, 0.5, 0.5);
        }
      for (let y = F - 2.5; y <= F - 0.5; y += 0.5)
        for (let x = x0 + 1.5; x < x0 + 3.5; x += 0.5) {
          if (y === F - 2.5 && (x === x0 + 1.5 || x === x0 + 3)) continue;
          const f = Math.floor(x * 2 + y * 2 + flick) % 3, flare = time < this.flareUntil ? 1.3 : 1;
          fill(hot ? (flare > 1 && f === 0 ? [255, 236, 160] : FIRE_RGB[f]) : [90, 40, 24], hot ? (y === F - 0.5 ? 1.15 : 1) * flare : 1, x, y, 0.5, 0.5);
        }
      fill(ASHLAR[1], k, x0 + 2, F - b.height + 1, 1, b.height - 5);
      fill(ASHLAR[0], k, x0 + 2, F - b.height + 1, 0.5, b.height - 5);
      // The bellows, pumping while the furnace is worked.
      const pump = hot && Math.floor(time / 450) % 2 === 0 ? 0.5 : 0;
      fill([110, 74, 44], k, x0 + 4, F - 0.5 - pump, 1, 0.5);
      if (pump) fill([70, 46, 26], k, x0 + 4, F - 0.5, 1, 0.5);
      fill([80, 52, 30], k, x0 + 4, F, 1, 0.5);
      fill(IRON_DARK, k, x0 + 3.5, F - 0.25, 0.5, 0.25);
      this.forgeStock(sim, b, k, fill);
    } else if (b.id === "smithy") {
      // An anvil for each smith (face, horn, waist and foot on a stump),
      // the rack of bars waiting, the quench trough, tongs on the wall.
      for (const ax of anvils(b)) {
        fill([130, 132, 142], k, ax, F - 1, 2, 0.5);
        fill(IRON_DARK, k, ax + 2, F - 1, 1, 0.5);
        fill(IRON_DARK, k, ax + 0.5, F - 0.5, 1.5, 0.5);
        fill(IRON_DARK, k, ax + 0.5, F, 1, 0.5);
        fill(POST, k, ax + 0.5, F + 0.5, 1, 0.5);
        fill([90, 90, 98], k, ax + 1.5, F - 4, 0.5, 1.5);
      }
      // The rack: copper and silver stacked on the left post, gold on the right.
      fill(POST, k, x0 + 1, F - 3, 2, 0.5);
      const copper = Math.min(6, sim.bars.copper), silver = Math.min(6 - Math.ceil(copper / 2), sim.bars.silver), gold = Math.min(6, sim.bars.gold);
      const bar = (c: RGB, x: number, y: number) => {
        fill(c, k, x, y + 0.5, 1, 0.5);
        fill(c, k * 1.25, x, y + 0.5, 0.5, 0.25);
      };
      for (let n = 0; n < copper; n++) bar(BAR.copper, x0 + 1, F - Math.floor(n / 2) + (n % 2) * -0.5);
      for (let n = 0; n < silver; n++) bar(BAR.silver, x0 + 1, F - Math.ceil(copper / 2) - n * 0.5);
      for (let n = 0; n < gold; n++) bar(BAR.gold, x0 + 2, F - n * 0.5);
      fill(POST, k, b.x1 - 2, F, 2, 1);
      fill(POST, k * 1.2, b.x1 - 2, F - 1, 0.5, 1);
      fill(POST, k * 1.2, b.x1 - 0.5, F - 1, 0.5, 1);
      fill(WATER_RGB, k, b.x1 - 1.5, F - 0.5, 1, 0.5);
      fill([120, 170, 230], k, b.x1 - 1.5, F - 0.5, 0.5, 0.25);
    }
  }

  /** The forge's ore, filling a heap by the door, then a low shelf and a
   * high one along the back wall, as it nears what the forge holds. */
  private forgeStock(sim: MineSim, b: Building, k: number, fill: Fill) {
    const F = b.floor, fine = this.fine, sx0 = b.x0 + 4, sx1 = b.x1 - 1, tone = (c: RGB) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;
    for (const sy of [F - 2, F - 4]) {
      fill(PLANK[0], k * 1.1, sx0, sy + 0.5, sx1 - sx0, 0.25);
      fill(PLANK[1], k, sx0, sy + 0.75, sx1 - sx0, 0.25);
      fill(POST, k, sx0, sy, 0.5, 1);
    }
    const total = metalSum(sim.ore);
    if (!total) return;
    const heapRows = [6, 6, 5, 4, 3, 2], heapSlots = 26, shelfSlots = (sx1 - sx0) * 2 * 2;
    const slots = Math.max(1, Math.round(((heapSlots + 2 * shelfSlots) * Math.min(total, sim.forgeCap)) / sim.forgeCap));
    const goldShare = sim.ore.gold / total, silverShare = sim.ore.silver / total;
    const heap = Math.min(heapSlots, slots);
    oreHeap(fine, b.x1 - 1.5, F + 0.5, heapRows, heap, Math.round(heap * goldShare), k, Math.round(heap * silverShare));
    let left = slots - heap;
    for (const sy of [F - 2, F - 4]) {
      for (let r = 0; r < 2 && left > 0; r++)
        for (let i = 0; i < (sx1 - sx0) * 2 && left > 0; i++, left--) {
          const pick = hash01(i, r + sy, 5), shades = pick < goldShare ? SHADES[GOLD] : pick < goldShare + silverShare ? SHADES[SILVER] : SHADES[COPPER];
          fine(sx0 + 0.5 + i * 0.5, sy + 0.25 - r * 0.5, 0.5, 0.5, tone(shades[(i + r) % shades.length]));
        }
    }
  }

  /** A miner inside, at its place on its way in or out, or at its spot:
   * lying in its bunk breathing, eating and talking in the lounge, reaching
   * along the warehouse's shelves, shovelling ore into the furnace (scoop,
   * carry, throw, and the fire flares), or hammering a bar on the anvil as
   * it cools from orange heat until it is quenched in a hiss of steam; a
   * hand with nothing to work falls into its habits. */
  private drawInside(sim: MineSim, b: Building, m: Miner, time: number, effects: boolean) {
    const fine = this.fine, s = m.inside as Inside, spot = sim.spotOf(s), walk = pathTicks(spot.path);
    const t = s.out ? walk - s.t : Math.min(s.t, walk), at = along([b.door, b.floor], spot.path, t);
    const arrived = !s.out && s.t >= walk, look = outfit(m.name, m.job), step = Math.floor(time / 140 + m.id * 3);
    if (arrived && spot.lie && s.why === "sleep") {
      drawSleeper(fine, look, spot.x, spot.y, spot.facing, `rgb(${BLANKET.join(",")})`, Math.floor((time + m.id * 911) / 1700) % 2 === 0);
      // Now and then, a snore drifts up.
      if (effects && this.fx() < 0.006) this.fx2.add("zzz", spot.x + 0.5, spot.y - 0.4, 0, -0.012, 110, "#e8ecff");
      return;
    }
    const prev = t > 0 ? along([b.door, b.floor], spot.path, t - 8) : at;
    let facing = arrived ? spot.facing : Math.sign(at.x - prev.x) || (s.out ? -spot.facing : spot.facing);
    const climbing = !arrived && at.x === prev.x && at.y !== prev.y;
    if (!arrived) {
      drawFigure(fine, look, at.x, at.y, facing, climbing ? "climb" : "walk", step);
      return;
    }
    const out = (f: number) => (f > 0 ? at.x + 1 : at.x - 0.5);
    if (m.action === "smelt") {
      // The shovel: scooped from the pile behind, carried round, thrown in.
      const beat = shovelAt(m.id, time), ore = sim.ore.gold > 0 && beat.n % 5 === 0 ? "#f0c850" : sim.ore.silver > 0 && beat.n % 3 === 0 ? "#cdd2dc" : "#c07a50";
      if (beat.stage === "scoop") {
        facing = -spot.facing;
        drawFigure(fine, look, at.x, at.y, facing, "crouch", step);
        fine(out(facing), at.y + 0.5, 0.5, 0.5, "#9a9ca4");
      } else if (beat.stage === "carry") {
        drawFigure(fine, look, at.x, at.y, facing, "work", step);
        fine(out(facing), at.y, 0.5, 0.5, "#9a9ca4");
        fine(out(facing), at.y - 0.25, 0.5, 0.25, ore);
      } else {
        drawFigure(fine, look, at.x, at.y, facing, "reach", step);
        fine(out(facing), at.y - 1, 0.5, 0.5, "#9a9ca4");
        if (effects && this.once(`throw${m.id}`, beat.n)) this.flare(b, time);
      }
      return;
    }
    if (m.action === "smith") {
      // The hammer raised and struck on a bar cooling from orange to dull
      // red, then the bar quenched.
      const beat = hammerAt(m.id, time), ax = at.x + 1, ay = b.floor - 1.5;
      const hot: RGB = mix([150, 40, 20], [255, 190, 90], beat.heat);
      const metal = BAR[(["copper", "silver", "gold"] as const)[beat.bar % 3]];
      if (beat.stage === "quench") {
        drawFigure(fine, look, at.x, at.y, facing, "stand", step);
        fine(ax + 0.5, ay, 1, 0.5, `rgb(${metal.join(",")})`);
        if (effects && this.once(`quench${m.id}`, beat.bar))
          for (let n = 0; n < 4; n++) this.fx2.add("steam", ax + 0.5 + this.fx(), ay - 0.2, (this.fx() - 0.5) * 0.02, -0.02 - this.fx() * 0.02, 60 + this.fx() * 40, "rgb(220,224,232)", 0.5);
        return;
      }
      const raised = beat.stage === "raise";
      drawFigure(fine, look, at.x, at.y, facing, raised ? "reach" : "work", step);
      fine(ax + 0.5, ay, 1, 0.5, `rgb(${hot.map((v) => v | 0).join(",")})`);
      if (beat.heat > 0.5) fine(ax + 0.5, ay, 0.5, 0.25, "#ffe6a8");
      if (raised) {
        fine(facing > 0 ? at.x + 0.5 : at.x, at.y - 1.5, 0.5, 0.5, "#6a4428");
        fine(facing > 0 ? at.x + 0.5 : at.x, at.y - 2, 0.5, 0.5, "#c8ccd4");
      } else {
        fine(facing > 0 ? at.x + 0.5 : at.x, at.y - 0.5, 0.5, 0.5, "#6a4428");
        fine(ax + 0.5, ay - 0.5, 0.5, 0.5, "#c8ccd4");
        if (effects && this.once(`strike${m.id}`, beat.n)) {
          const n = 2 + Math.round(beat.heat * 4);
          for (let k = 0; k < n; k++)
            this.fx2.add("spark", ax + 0.75, ay, (this.fx() - 0.5) * 0.24, -0.06 - this.fx() * 0.14, 14 + this.fx() * 14, this.fx() < 0.5 ? "#ffd27a" : "#ff9a3c", 0.25);
        }
      }
      return;
    }
    if (m.action === "stock") {
      // Reaching along the shelves, then a timber on the shoulder.
      const beat = Math.floor((time + m.id * 400) / 600) % 3;
      drawFigure(fine, look, at.x, at.y, facing, beat === 0 ? "reach" : beat === 1 ? "work" : "stand", step);
      fine(facing > 0 ? at.x - 0.5 : at.x + 1, at.y - 0.5, 0.5, 1, `rgb(${TIMBER_END.join(",")})`);
      return;
    }
    if (m.action === "lounge") {
      // At the table: seated, a mug or a spoon to the mouth now and then,
      // and a word with whoever sits nearest.
      const sits = s.slot % 3 !== 2, sip = Math.floor((time + m.id * 733) / 900) % 4 === 0;
      drawFigure(fine, look, at.x, at.y, facing, sits ? "sit" : sip ? "reach" : "stand", step);
      if (sits && sip) fine(out(facing), at.y - 0.5, 0.5, 0.5, "#d8ccb0");
      const turn = Math.floor((time + s.slot * 1500) / 3300);
      if (effects && turn % 3 === 0 && this.once(`lounge${m.id}`, turn)) this.fx2.add("word", at.x + 0.6, at.y - (sits ? 1.5 : 2), 0, 0, 45, "#f0ead8");
      return;
    }
    // Waiting at its station with nothing to work: its habits, kept in place.
    const h = habitAt(m.name, time + m.id * 313), hp = habitPose(h.habit === "sift" ? "look" : h.habit, h.t, facing, step);
    drawFigure(fine, look, at.x, at.y, hp.facing, hp.pose, step);
    if (effects && h.habit === "whistle" && h.t > 0.2 && this.once(`note${m.id}`, h.spell * 4 + Math.floor(h.t * 3)))
      this.fx2.add("note", at.x + 0.5, at.y - 1.6, 0, -0.02, 70, "#f4e9c0");
  }

  /** Ore thrown into the furnace: the fire flares, sparks and embers fly
   * out of its mouth. */
  private flare(b: Building, time: number) {
    const mx = b.x0 + 2.5, my = b.floor - 1.5;
    this.flareUntil = Math.max(this.flareUntil, time + 260);
    for (let n = 0; n < 5; n++) this.fx2.add("spark", mx + this.fx(), my, 0.04 + this.fx() * 0.1, -0.05 - this.fx() * 0.1, 14 + this.fx() * 12, this.fx() < 0.5 ? "#ffd27a" : "#ff8a3c", 0.25);
    for (let n = 0; n < 2; n++) this.fx2.add("ember", mx + this.fx(), my - 0.5, (this.fx() - 0.5) * 0.02, -0.02 - this.fx() * 0.02, 70 + this.fx() * 50, "#ffb050", 0.25);
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
        // A fork or two off the bolt's upper half, dying out.
        const forks: [number, number][][] = [];
        for (let f = 0; f < 2; f++) {
          const from = points[1 + Math.floor(this.fx() * Math.max(1, points.length / 2))], dir = this.fx() < 0.5 ? -1 : 1;
          if (!from) continue;
          const fork: [number, number][] = [from];
          for (let j = 1; j <= 3; j++) fork.push([from[0] + dir * j * (1.5 + this.fx() * 2), from[1] + j * (2 + this.fx() * 2)]);
          forks.push(fork);
        }
        this.bolts.push({ points, forks, until: time + 260 });
        this.flashUntil = time + 160;
      } else if (effects && (n.kind === "lost" || n.kind === "saved"))
        for (let k = 0; k < 10; k++)
          this.fx2.add("wisp", n.x + 0.5 + (this.fx() - 0.5), n.y - 1, 0, -0.03 - this.fx() * 0.04, 80 + this.fx() * 60, n.kind === "lost" ? "#b8c6ff" : "#ffe9a8", this.fx() < 0.5 ? 0.5 : 0.25);
    }
    if (sim.news.length) this.newsTick = sim.news[sim.news.length - 1].tick;
  }

  /** Lightning as pixel art: each bolt's path traced in half-cell pixels, a
   * white core with a pale blue fringe, its forks fainter, fading as it
   * goes; the flash lights only the sky, down to the ground, and softly. */
  private drawLightning(sim: MineSim, time: number) {
    const fine = this.fine, ctx = this.ctx;
    this.bolts = this.bolts.filter((b) => b.until > time);
    for (const b of this.bolts) {
      const life = Math.max(0, (b.until - time) / 260);
      const trace = (pts: [number, number][], core: number) => {
        for (let i = 1; i < pts.length; i++) {
          const [ax, ay] = pts[i - 1], [bx, by] = pts[i], steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2));
          for (let k = 0; k <= steps; k++) {
            const x = Math.floor((ax + ((bx - ax) * k) / steps) * 2) / 2, y = Math.floor((ay + ((by - ay) * k) / steps) * 2) / 2;
            if (y >= sim.strata.surface[Math.max(0, Math.min(W - 1, Math.floor(x)))] + 1) continue;
            ctx.globalAlpha = life * core * 0.45;
            fine(x - 0.5, y, 0.5, 0.5, "#9fb4ff");
            fine(x + 0.5, y, 0.5, 0.5, "#9fb4ff");
            ctx.globalAlpha = life * core;
            fine(x, y, 0.5, 0.5, "#f4f6ff");
          }
        }
      };
      trace(b.points, 0.9);
      for (const f of b.forks) trace(f, 0.5);
    }
    ctx.globalAlpha = 1;
    if (time < this.flashUntil) {
      // The sky alone lights up, column runs down to the ground.
      ctx.globalAlpha = ((this.flashUntil - time) / 160) * 0.14;
      const surface = sim.strata.surface;
      for (let x = 0; x < W; ) {
        let end = x + 1;
        while (end < W && surface[end] === surface[x]) end++;
        fine(x, -8, end - x, surface[x] + 8, "#dfe6ff");
        x = end;
      }
      ctx.globalAlpha = 1;
    }
  }

  /** The hoist: its rope always hangs from the headframe's wheel down the
   * shaft to the bucket, which waits at the top, is let down to a load and
   * wound up with it (eased between the sim's steps). */
  private drawHoist(sim: MineSim) {
    const ctx = this.ctx, fine = this.fine, x = sim.shaftX, wheel = sim.strata.surface[x] - HEADFRAME_H / 2 + WHEEL.y;
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
    // The wheel's spokes, turning as the rope runs over it.
    const k = 0.3 + 0.7 * this.skyLight(), spoke = `rgb(${(96 * k) | 0},${(98 * k) | 0},${(108 * k) | 0})`, cx = x + 0.5, turn = y / 2.25;
    for (let n = 0; n < 4; n++) {
      const a = turn + (n * Math.PI) / 4, dx = Math.cos(a), dy = Math.sin(a);
      for (const r of [1.5, 2.5, 3.3, -1.5, -2.5, -3.3]) fine(Math.floor((cx + (dx * r) / 2) * 2) / 2, Math.floor((wheel + (dy * r) / 2) * 2) / 2, 0.5, 0.5, spoke);
    }
    // The hook, the bucket's bail and the bucket itself.
    fine(x + 0.25, y - 0.25, 0.5, 0.25, "#5a5a62");
    fine(x, y, 1, 0.25, "#4a4a52");
    fine(x, y + 0.25, 1, 0.75, "#6a4422");
    fine(x, y + 0.5, 1, 0.125, "#3a2a1a");
    const h = sim.hoist;
    if (metalSum(h) > 0) {
      fine(x, y, 0.5, 0.25, loadColor(h));
      fine(x + 0.5, y, 0.5, 0.25, h.copper > 0 ? "#b06a44" : loadColor(h));
    }
    // The yard by the shaft house, where the ore brought up is tipped.
    const n = metalSum(sim.yard);
    if (n > 0) {
      const lumps = Math.min(30, Math.ceil(n / 3)), gold = Math.round((lumps * sim.yard.gold) / n), silver = Math.round((lumps * sim.yard.silver) / n), fy = sim.standY(sim.yardX) + 0.5;
      oreHeap(fine, sim.yardX + 0.5, fy, [6, 5, 4, 3, 2, 1, 1], lumps, gold, 1, silver);
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
const pack3 = (r: number, g: number, b: number) => 0xff000000 | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r);
const pack = (c: RGB, k: number) => 0xff000000 | (clamp255(c[2] * k) << 16) | (clamp255(c[1] * k) << 8) | clamp255(c[0] * k);
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const TIMBER_END: RGB = [168, 116, 62];

/** A heap of `n` half-cell lumps of ore (`gold` of them gold, then `silver`
 * silver, the rest copper) centred on column `cx`, its bottom row ending at
 * `floor`, `rows` lumps wide from the bottom up, dimmed to `k`. */
function oreHeap(fine: Fine, cx: number, floor: number, rows: number[], n: number, gold: number, k = 1, silver = 0) {
  let placed = 0;
  for (let r = 0; r < rows.length && placed < n; r++)
    for (let i = 0; i < rows[r] && placed < n; i++, placed++) {
      const shades = placed < gold ? SHADES[GOLD] : placed < gold + silver ? SHADES[SILVER] : SHADES[COPPER], c = shades[(i + r) % shades.length];
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
