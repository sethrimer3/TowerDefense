/** Draws the Library: a cathedral nave in pixels, one pixel a world unit,
 * scaled up crisp. The stone walls are lit by their torches through a bump
 * map, the technique Defend's flagstones use (`defend/ground-relief.ts`):
 * each block's height comes from its own art, and the side of each block
 * facing a light brightens while the side facing away darkens. Here it is
 * done per pixel, since the whole nave is only 192 × 300.
 *
 * By day light bleeds in through the stained-glass window and god rays
 * slant down through the dusty air; by night the glass goes dark and stars
 * glint through its clear panes now and then. The window sits in an oak
 * frame with a deep sill, its shadow softening the stone round it.
 *
 * Shelves (an outline, then plank by plank, then whole), ladders and tables
 * are painted into the same lit image, charred where they burnt and with
 * soot above. Librarians, carts, flames, smoke, thrown water and the light's
 * glow go over it. A dark hallway leads out of each side wall: it shows
 * only where a librarian has lately walked, fading back to dark behind them.
 * The return shelf stands on the floor before the stacks, and a trapdoor
 * by the left-hand bay opens on the ladder down to the alchemy lab, which
 * `lab-render.ts` draws below the nave; the view pans down to it. Each role
 * dresses its own way: shelvers in undyed smocks with plain caps, professors
 * in blue gowns and mortarboards, researchers in violet robes and pointed
 * hats. */
import { stream } from "../random.ts";
import {
  BAYS, BAY_W, BAY_X0, BOOKS_PER_ROW, BOOK_COLORS, BUTTS, BUTT_FULL, FLOOR, H, HALL, HALL_H, MAX_UNITS, PLANKS, RETURN, RETURN_PER_ROW, ROW_H, STAIR_X, TABLES, TABLE_PLANKS,
  TABLE_TOP, W, WINDOW, WORLD_H, bayX, ladderX, slotIndex, unitTop, type Cart, type Librarian, type LibrarySim, type Role,
} from "./sim.ts";
import { CELL, FW } from "./fire.ts";
import { ELIXIRS } from "./lab.ts";
import { HATCH_Y, LabRenderer } from "./lab-render.ts";
import { ashlar, facing } from "./ashlar.ts";

/** Each role's robe. */
const ROBES: Record<Role, RGB> = { shelver: [240, 236, 228], professor: [104, 124, 200], researcher: [160, 104, 210] };

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

const enum Kind { Outside, Wall, Floor, Glass, Lead, Clear, Door }
/** The oak frame round the window: how far it reaches out from the glass,
 * and the sill under it. */
const FRAME = 3, SILL = { x0: WINDOW.x0 - 6, x1: WINDOW.x1 + 6, top: WINDOW.bottom, bottom: WINDOW.bottom + 4 };
/** The hallways' pictures: from the lintel over them to the bottom of the
 * floor, and how far the light of a librarian walking them reaches. */
const HALL_TOP = FLOOR - HALL_H - 4, HALL_ROWS = H - HALL_TOP, LANTERN = 20;
/** The doorways through the piers into the hallways. */
const inDoor = (x: number, y: number) => (x < BAY_X0 || x >= W - BAY_X0) && y < FLOOR && y >= FLOOR - HALL_H;
/** Chebyshev distance from (x, y) to the nearest pane, up to `max`. */
function windowDistance(x: number, y: number, max: number) {
  let d = max + 1;
  for (let dy = -max; dy <= max; dy++)
    for (let dx = -max; dx <= max; dx++) if (inWindow(x + dx, y + dy)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
  return d;
}
type RGB = [number, number, number];
const GLASS: RGB[] = [[170, 30, 40], [30, 60, 170], [200, 150, 30], [30, 120, 70], [110, 40, 140], [190, 90, 30]];

/** A fixed number in [0, 1) for a few integers. */
function h01(a: number, b: number, c = 0) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Mote = { x: number; y: number; vx: number; vy: number; life: number };
/** Smoke and embers off the flames. */
type Puff = { x: number; y: number; vx: number; vy: number; age: number; life: number; ember: boolean };
/** How far in the view zooms. */
const MAX_ZOOM = 6;
/** How much of the hallways the view shows at the widest zoom: all the
 * nave and most of each hallway (the rest pans into view). */
const FIT_W = W + HALL * 1.2;

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
  private puffs: Puff[] = [];
  /** The hallways: baked colour, each frame's picture, and how much of each
   * column (door and hallway, from the outer end in) has lately been seen. */
  private hallBase = [new Float32Array(HALL * HALL_ROWS * 3), new Float32Array(HALL * HALL_ROWS * 3)];
  private hallCanvas: HTMLCanvasElement[] = [];
  private hallImage: ImageData[] = [];
  private seen = [new Float32Array(HALL + BAY_X0), new Float32Array(HALL + BAY_X0)];
  private hallSx = [new Float32Array(HALL * HALL_ROWS), new Float32Array(HALL * HALL_ROWS)];
  private hallSy = [new Float32Array(HALL * HALL_ROWS), new Float32Array(HALL * HALL_ROWS)];
  private hallRelief = [new Uint8Array(HALL * HALL_ROWS), new Uint8Array(HALL * HALL_ROWS)];
  private lastTime = -1;
  /** Which tables stand whole, their candles lit. */
  private candles = TABLES.map(() => true);
  /** This frame's fire, gathered into blocks of 24 pixels: centres and sizes. */
  private blazes: { x: number; y: number; n: number }[] = [];
  private fx = stream("effects");
  private view = { scale: 1, ox: 0, oy: 0 };
  /** Zoom (1 shows the whole nave) and the world point at the view's centre. */
  zoom = 1;
  focus = { x: W / 2, y: H / 2 };
  /** The librarian the view follows (null for none), and a height the view
   * is gliding to (null for none). */
  target: Librarian | null = null;
  goal: number | null = null;
  private lab = new LabRenderer();

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
    for (let side = 0; side < 2; side++) {
      const c = document.createElement("canvas");
      c.width = HALL;
      c.height = HALL_ROWS;
      this.hallCanvas.push(c);
      this.hallImage.push(c.getContext("2d")!.createImageData(HALL, HALL_ROWS));
    }
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
        } else if (inDoor(x, y)) {
          // The passage through the pier: dark stone, lit by the hallway.
          kind = Kind.Door;
          const lx = x % 6, ly = (FLOOR - y) % 5;
          rgb = lx === 0 || ly === 0 ? [20, 18, 18] : [58, 52, 48];
        } else {
          // Ashlar: courses of blocks, bigger on the piers at either side.
          const stone = ashlar(x, y, x < BAYS_EDGE || x >= W - BAYS_EDGE);
          rgb = stone.rgb;
          hgt = stone.hgt;
        }
        // The lintel over each doorway: three wedged stones.
        if (kind === Kind.Wall && (x < BAY_X0 || x >= W - BAY_X0) && y >= FLOOR - HALL_H - 4 && y < FLOOR - HALL_H) {
          const lx = (x < BAY_X0 ? x : x - (W - BAY_X0)) % 6, ly = y - (FLOOR - HALL_H - 4);
          rgb = lx === 0 || ly === 0 ? [26, 23, 22] : [104 - ly * 6, 96 - ly * 6, 88 - ly * 6];
          hgt = lx === 0 || ly === 0 ? 0 : 1 - ly * 0.2;
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
    // The window's oak frame and sill, and the stone's shadow round them,
    // so the glass sits in the wall rather than cut out of it.
    for (let y = WINDOW.top - 10; y < SILL.bottom + 8; y++)
      for (let x = SILL.x0 - 8; x < SILL.x1 + 8; x++) {
        if (x < 0 || x >= W || y < 0 || this.kind[y * W + x] !== Kind.Wall) continue;
        const i = y * W + x, d = windowDistance(x, y, FRAME + 5);
        const sill = x >= SILL.x0 && x < SILL.x1 && y >= SILL.top && y < SILL.bottom;
        let rgb: RGB | null = null, hgt = height[i];
        if (sill) {
          // The sill: a deep board, lit along its top edge.
          const t = 0.8 + h01(x >> 3, y, 31) * 0.25, row = y - SILL.top;
          rgb = row === 0 ? [168 * t, 118 * t, 66 * t] : row === SILL.bottom - SILL.top - 1 ? [48, 32, 20] : [122 * t, 82 * t, 44 * t];
          hgt = 1 - row * 0.2;
        } else if (d <= FRAME) {
          // Stiles and head: oak, its grain running along it, rebated dark against the glass.
          const t = 0.78 + h01(x, y >> 2, 33) * 0.18 + h01(x >> 1, y >> 3, 34) * 0.1;
          rgb = d === 1 ? [44, 28, 16] : d === FRAME ? [96 * t, 62 * t, 34 * t] : [132 * t, 88 * t, 48 * t];
          hgt = d === 1 ? 0.1 : d === FRAME ? 0.5 : 1;
        } else if (d <= FRAME + 5 || (y >= SILL.bottom && y < SILL.bottom + 4 && x >= SILL.x0 && x < SILL.x1)) {
          // The stone in the frame's shadow.
          const k = y >= SILL.bottom && x >= SILL.x0 && x < SILL.x1 ? 0.5 + (y - SILL.bottom) * 0.12 : 0.5 + ((d - FRAME) / 6) * 0.5;
          this.base[i * 3] *= k;
          this.base[i * 3 + 1] *= k;
          this.base[i * 3 + 2] *= k;
        }
        if (!rgb) continue;
        this.base[i * 3] = rgb[0];
        this.base[i * 3 + 1] = rgb[1];
        this.base[i * 3 + 2] = rgb[2];
        height[i] = hgt;
      }
    // The trapdoor: an iron-bound frame let into the floor, its opening a
    // dark slot (the ladder goes down out of sight, under the floor).
    for (let x = STAIR_X - 4; x <= STAIR_X + 4; x++) {
      const i = FLOOR * W + x, rim = x === STAIR_X - 4 || x === STAIR_X + 4;
      const rgb: RGB = rim ? [74, 72, 78] : [8, 6, 6];
      this.base[i * 3] = rgb[0];
      this.base[i * 3 + 1] = rgb[1];
      this.base[i * 3 + 2] = rgb[2];
      height[i] = rim ? 1 : 0;
    }
    this.bakeHalls();
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        this.sx[i] = (height[i + 1] - height[i - 1]) * 0.5;
        this.sy[i] = (height[i + W] - height[i - W]) * 0.5;
      }
  }

  /** The two hallways: the nave's ashlar on their walls under a beamed
   * ceiling, a flagged floor, a water butt by each door, fading to black
   * where they lead out. Walls and floor are bump mapped, lit each frame by
   * whoever walks them. */
  private bakeHalls() {
    for (let side = 0; side < 2; side++) {
      const base = this.hallBase[side], height = new Float32Array(HALL * HALL_ROWS), relief = this.hallRelief[side];
      for (let y = 0; y < HALL_ROWS; y++)
        for (let hx = 0; hx < HALL; hx++) {
          const wy = HALL_TOP + y, wx = side ? W + hx : hx - HALL, i = y * HALL + hx;
          let rgb: RGB, hgt = 0;
          relief[i] = 1;
          if (wy < FLOOR - HALL_H) {
            // Oak beams across the ceiling, end on.
            const lx = (wx + 64) % 9, ly = wy - HALL_TOP, t = 0.8 + h01((wx + 64) >> 3, 7, 43) * 0.3;
            rgb = lx === 0 || ly === 3 ? [22, 16, 12] : [84 * t, 56 * t, 32 * t];
            hgt = lx === 0 || ly === 3 ? 0 : Math.min(1, Math.min(lx, 8 - lx, ly, 2 - ly + 1) / 1.5);
          } else if (wy < FLOOR) {
            const stone = ashlar(wx, wy, false);
            rgb = stone.rgb;
            hgt = stone.hgt;
          } else if (wy < FLOOR + 6) {
            const lx = (wx + 64) % 12, t = 0.8 + h01((wx + 64) >> 4, 3, 45) * 0.3;
            rgb = lx === 0 || wy === FLOOR + 5 ? [26, 24, 22] : [86 * t, 80 * t, 76 * t];
            hgt = lx === 0 || wy === FLOOR + 5 ? 0 : Math.min(1, Math.min(lx, 11 - lx, wy - FLOOR, FLOOR + 4 - wy) / 1.5);
          } else {
            rgb = [10, 9, 9];
            relief[i] = 0;
          }
          // The water butt: staves, two iron hoops, the water's face.
          const bx = wx - BUTTS[side];
          if (Math.abs(bx) <= 3 && wy >= FLOOR - 9 && wy < FLOOR) {
            const by = wy - (FLOOR - 9);
            rgb = by === 0 ? [60, 110, 150] : by === 2 || by === 6 ? [70, 70, 76] : Math.abs(bx) === 3 ? [70, 44, 24] : [118 - Math.abs(bx) * 8, 78, 42];
            relief[i] = 0;
          }
          // Out of sight where the hallway leads away.
          const fade = Math.min(1, (side ? HALL - hx : hx) / 18);
          base[i * 3] = rgb[0] * fade;
          base[i * 3 + 1] = rgb[1] * fade;
          base[i * 3 + 2] = rgb[2] * fade;
          height[i] = hgt;
        }
      const sx = this.hallSx[side], sy = this.hallSy[side];
      for (let y = 1; y < HALL_ROWS - 1; y++)
        for (let hx = 1; hx < HALL - 1; hx++) {
          const i = y * HALL + hx;
          sx[i] = (height[i + 1] - height[i - 1]) * 0.5;
          sy[i] = (height[i + HALL] - height[i - HALL]) * 0.5;
        }
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
    for (let bay = 0; bay < BAYS; bay++)
      for (let unit = 0; unit < MAX_UNITS; unit++) {
        const p = sim.units[bay * MAX_UNITS + unit];
        if (p < 0) break;
        const x0 = bayX(bay), y0 = unitTop(unit);
        if (p === 0) {
          // Just bought: a chalk outline on the stone.
          for (let y = y0; y < y0 + 14; y++)
            for (let x = x0; x < x0 + BAY_W; x++) {
              const edge = x === x0 || x === x0 + BAY_W - 1 || y === y0 || y === y0 + 13;
              if (edge && (x + y) % 3 !== 0) put(x, y, [176, 166, 136]);
            }
          continue;
        }
        // Built plank by plank: the posts, then the shelves, then the back.
        for (let y = y0; y < y0 + 14; y++)
          for (let x = x0; x < x0 + BAY_W; x++) {
            const left = x === x0, right = x === x0 + BAY_W - 1, plank = (y - y0) % ROW_H === ROW_H - 1;
            if ((left && p >= 1) || (right && p >= 2) || (plank && p >= 3)) put(x, y, [96, 62, 34]);
            else if (p >= PLANKS) put(x, y, [40, 26, 16]);
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
    // A cornice on each bay's top built unit.
    for (let b = 0; b < BAYS; b++) {
      const top = sim.bayComplete(b);
      if (top) for (let x = bayX(b) - 1; x <= bayX(b) + BAY_W; x++) put(x, unitTop(top - 1) - 1, [120, 80, 44]);
    }
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
    TABLES.forEach((t, n) => {
      const p = sim.tables[n];
      if (p === 0) {
        for (let x = t.x; x < t.x + t.w; x += 2) put(x, TABLE_TOP, [176, 166, 136]);
        return;
      }
      for (let y = TABLE_TOP + 2; y < FLOOR; y++) {
        put(t.x + 1, y, [70, 44, 24]);
        put(t.x + t.w - 2, y, [70, 44, 24]);
      }
      if (p < 2) return;
      for (let x = t.x; x < t.x + t.w; x++) {
        put(x, TABLE_TOP, [128, 84, 44]);
        put(x, TABLE_TOP + 1, [84, 54, 28]);
      }
      if (p < TABLE_PLANKS) return;
      const c = t.x + Math.floor(t.w / 2);
      put(c, TABLE_TOP - 1, [230, 220, 190]);
      put(c, TABLE_TOP - 2, [230, 220, 190]);
      // A stack of ledgers at one end.
      for (let k = 0; k < 3; k++) for (let x = t.x + 3; x < t.x + 7; x++) put(x, TABLE_TOP - 1 - k, k === 1 ? [40, 60, 90] : [110, 40, 34]);
    });
    // The return shelf: two rows of books read, waiting to go out.
    for (let y = FLOOR - 11; y < FLOOR; y++)
      for (let x = RETURN.x; x < RETURN.x + RETURN.w; x++) {
        const post = x === RETURN.x || x === RETURN.x + RETURN.w - 1, plank = y === FLOOR - 11 || y === FLOOR - 6 || y === FLOOR - 1;
        put(x, y, post || plank ? [110, 72, 40] : [44, 30, 18]);
      }
    sim.returns.forEach((c, n) => {
      const row = n < RETURN_PER_ROW ? 1 : 0, i = n % RETURN_PER_ROW, rgb = hex(BOOK_COLORS[c]), bx = RETURN.x + 1 + i * 2, by = row ? FLOOR - 2 : FLOOR - 7;
      for (let k = 0; k < 4; k++) {
        put(bx, by - k, rgb);
        put(bx + 1, by - k, [rgb[0] * 0.75, rgb[1] * 0.75, rgb[2] * 0.75]);
      }
    });
    // Charred wood, and soot on the stone above where it burnt.
    const { char, soot } = sim.fire;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, c = (y >> 1) * FW + (x >> 1);
        const k = this.relief[i] ? (this.kind[i] === Kind.Wall ? soot[c] * 0.8 : 0) : char[c] * 0.85;
        if (k <= 0) continue;
        scene[i * 3] = scene[i * 3] * (1 - k) + 18 * k;
        scene[i * 3 + 1] = scene[i * 3 + 1] * (1 - k) + 14 * k;
        scene[i * 3 + 2] = scene[i * 3 + 2] * (1 - k) + 12 * k;
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
    this.blazes.forEach((b, n) => shine(b.x, b.y, 26 + Math.min(44, b.n * 0.9), Math.min(1.9, 0.35 + b.n * 0.03) * flicker(time * 2.3, n + 20), 1, 0.52, 0.22));
    CANDLES.forEach((c, n) => this.candles[n] && shine(c.x, c.y, 28, flicker(time * 1.7, n + 9) * 0.75, 1, 0.75, 0.45));
  }

  // ── A frame ─────────────────────────────────────────────────────────

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const scale = Math.min(w / FIT_W, h / H) * this.zoom;
    const half = { x: w / scale / 2, y: h / scale / 2 };
    if (this.target) {
      this.focus.x = this.target.x;
      this.focus.y = this.target.y - 12;
    }
    this.focus.x = half.x * 2 >= W + 2 * HALL ? W / 2 : Math.max(half.x - HALL, Math.min(W + HALL - half.x, this.focus.x));
    this.focus.y = half.y * 2 >= WORLD_H ? WORLD_H / 2 : Math.max(half.y, Math.min(WORLD_H - half.y, this.focus.y));
    this.view = { scale, ox: Math.round(w / 2 - this.focus.x * scale), oy: Math.round(h / 2 - this.focus.y * scale) };
  }
  /** Pans by a drag of device pixels (letting go of whoever was followed). */
  pan(dx: number, dy: number) {
    this.target = null;
    this.goal = null;
    this.focus.x -= dx / this.view.scale;
    this.focus.y -= dy / this.view.scale;
  }
  /** Whether the view looks mostly at the lab. */
  get inLab() {
    return this.focus.y > H;
  }
  /** Zooms by `factor` (above 1 in), from the whole nave in to `MAX_ZOOM`,
   * keeping the world point under device pixel (px, py) where it is. */
  zoomBy(factor: number, px: number, py: number) {
    const { scale, ox, oy } = this.view, wx = (px - ox) / scale, wy = (py - oy) / scale;
    const zoom = Math.max(1, Math.min(MAX_ZOOM, this.zoom * factor));
    if (zoom === this.zoom) return;
    const next = (scale / this.zoom) * zoom, w = this.canvas.width, h = this.canvas.height;
    this.zoom = zoom;
    this.focus = { x: wx - (px - w / 2) / next, y: wy - (py - h / 2) / next };
    this.resize();
  }

  draw(sim: LibrarySim, now: number, time: number, effects: boolean) {
    const day = daylight(now);
    const dt = this.lastTime < 0 ? 0 : Math.min(0.2, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    if (this.target && !sim.librarians.includes(this.target)) this.target = null;
    if (this.goal !== null) {
      // Glide down to the lab, or back up to the nave.
      const d = this.goal - this.focus.y;
      this.focus.y += d * Math.min(1, dt * 5);
      if (Math.abs(d) < 0.5) this.goal = null;
    }
    this.resize();
    this.gatherFire(sim);
    this.candles = sim.tables.map((p) => p === TABLE_PLANKS);
    const f = sim.fire;
    const key = `${sim.units.join(",")}|${sim.tables.join(",")}|${sim.ladders.join(",")}|${slotsKey(sim)}|${sim.returns.join("")}|${f.active ? f.version : 0}|${f.sooty ? Math.floor(sim.time / 3) : 0}`;
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
      if (k === Kind.Door) {
        // The doorways: dark, but for the hallway's light from beyond.
        const x = i % W, side = x < W / 2 ? 0 : 1, v = this.seen[side][side ? x - (W - BAY_X0) : x + HALL];
        r = S[i * 3] * (L[i * 3] * 0.3 + v);
        g = S[i * 3 + 1] * (L[i * 3 + 1] * 0.3 + v * 0.82);
        b = S[i * 3 + 2] * (L[i * 3 + 2] * 0.3 + v * 0.6);
      } else if (k === Kind.Glass || k === Kind.Clear) {
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
    this.drawHalls(sim, dt);
    ctx.drawImage(this.off, 0, 0);
    const top = -oy / scale, bottom = (this.canvas.height - oy) / scale, labShown = LabRenderer.visible(top, bottom);
    if (labShown) this.lab.draw(ctx, sim, time, dt, effects);
    this.drawTrapdoor();
    if (day < 0.6) this.drawStars(now, 1 - day / 0.6);
    if (effects && day > 0.02) this.drawRays(now, day);
    for (const r of sim.remains) this.drawRemains(r.x, Math.min(1, (600 - (sim.time - r.at)) / 30));
    this.drawButts(sim);
    for (const c of [sim.barrow, sim.bookCart]) if (c.here) this.drawCart(c);
    // Whoever is on the ladder between the nave's floor and the lab's vault
    // is out of sight, through the trapdoor.
    ctx.save();
    ctx.beginPath();
    ctx.rect(-HALL - 8, -8, W + 2 * HALL + 16, FLOOR + 8);
    ctx.rect(-HALL - 8, HATCH_Y, W + 2 * HALL + 16, WORLD_H - HATCH_Y + 8);
    ctx.clip();
    for (const l of sim.librarians) if (!l.away) this.drawLibrarian(l, time);
    ctx.restore();
    if (labShown) this.lab.drawOver(ctx, sim, time, dt, effects);
    if (this.target && !this.target.away) {
      // A brass marker over whoever is followed.
      const t = this.target, y = Math.round(t.y) - 12 - (Math.floor(time * 2) % 2);
      ctx.fillStyle = "#ffd76a";
      ctx.fillRect(Math.round(t.x) - 2, y, 3, 1);
      ctx.fillRect(Math.round(t.x) - 1, y + 1, 1, 1);
    }
    this.drawFlames(time, effects);
    if (f.active || this.puffs.length) this.drawFire(sim, time, dt, effects);
  }

  // ── The hallways ────────────────────────────────────────────────────

  /** Each hallway lit as far as librarians have lately walked it. */
  private drawHalls(sim: LibrarySim, dt: number) {
    for (let side = 0; side < 2; side++) {
      const seen = this.seen[side], n = seen.length;
      for (let c = 0; c < n; c++) seen[c] = Math.max(0, seen[c] - dt * 0.22);
      for (const l of sim.librarians) {
        if (l.away) continue;
        const c0 = side ? l.x - (W - BAY_X0) : l.x + HALL;
        if (c0 < -LANTERN || c0 > n + LANTERN) continue;
        for (let c = Math.max(0, Math.floor(c0 - LANTERN)); c < Math.min(n, Math.ceil(c0 + LANTERN)); c++) {
          const want = Math.pow(1 - Math.abs(c - c0) / LANTERN, 0.7);
          if (want > seen[c]) seen[c] = Math.min(want, seen[c] + dt * 1.6);
        }
      }
      const base = this.hallBase[side], img = this.hallImage[side], px = new Uint32Array(img.data.buffer);
      const sx = this.hallSx[side], sy = this.hallSy[side], relief = this.hallRelief[side];
      // Whoever walks the hallway lights it close by, the stones' faces
      // turned toward them catching it; further off, only the memory of it.
      const walkers = sim.librarians.filter((l) => !l.away && l.y <= FLOOR && (side ? l.x > W - BAY_X0 - LANTERN : l.x < BAY_X0 + LANTERN));
      for (let y = 0; y < HALL_ROWS; y++)
        for (let hx = 0; hx < HALL; hx++) {
          const i = y * HALL + hx, wx = side ? W + hx : hx - HALL, wy = HALL_TOP + y;
          let v = 0.025 + seen[side ? hx + BAY_X0 : hx] * 0.6;
          for (const l of walkers) {
            const dx = wx - l.x, dy = wy - (l.y - 5), d = Math.sqrt(dx * dx + dy * dy);
            if (d >= LANTERN * 1.2) continue;
            const fall = 1 - d / (LANTERN * 1.2);
            v += fall * fall * 0.75 * (relief[i] ? facing(sx[i], sy[i], dx, dy, d) : 1);
          }
          px[i] = 0xff000000 | (c255(base[i * 3 + 2] * v * 0.62) << 16) | (c255(base[i * 3 + 1] * v * 0.84) << 8) | c255(base[i * 3] * v);
        }
      const ctx = this.hallCanvas[side].getContext("2d")!;
      ctx.putImageData(img, 0, 0);
      this.ctx.drawImage(this.hallCanvas[side], side ? W : -HALL, HALL_TOP);
    }
  }
  /** The trapdoor's lid, standing open beside its opening, and the ladder's
   * top poking up through it. */
  private drawTrapdoor() {
    const ctx = this.ctx, x = STAIR_X + 5, k = this.lum(x, FLOOR - 4);
    ctx.fillStyle = shade([150, 106, 58], k);
    ctx.fillRect(STAIR_X - 2, FLOOR - 4, 1, 4);
    ctx.fillRect(STAIR_X + 1, FLOOR - 4, 1, 4);
    ctx.fillStyle = shade([124, 86, 46], k);
    ctx.fillRect(STAIR_X - 1, FLOOR - 3, 2, 1);
    ctx.fillStyle = shade([118, 78, 42], k);
    ctx.fillRect(x, FLOOR - 8, 2, 8);
    ctx.fillStyle = shade([70, 46, 24], k);
    ctx.fillRect(x + 1, FLOOR - 8, 1, 8);
    ctx.fillStyle = shade([90, 90, 96], k);
    ctx.fillRect(x - 1, FLOOR - 5, 1, 2);
  }
  /** How lit a point is: the nave's light, the hallway's, or the lab's. */
  private lum(x: number, y: number) {
    if (y > H) return this.lab.lum(x, y);
    const xi = Math.round(x);
    if (xi >= BAY_X0 && xi < W - BAY_X0) {
      const i = Math.min(H - 1, Math.max(0, Math.round(y))) * W + xi;
      return Math.min(1, 0.45 + (this.light[i * 3] + this.light[i * 3 + 1]) * 0.35);
    }
    const side = xi < W / 2 ? 0 : 1, seen = this.seen[side], c = side ? xi - (W - BAY_X0) : xi + HALL;
    return 0.05 + (seen[Math.max(0, Math.min(seen.length - 1, c))] ?? 0) * 0.85;
  }

  // ── Carts, the fallen ───────────────────────────────────────────────

  private drawCart(c: Cart) {
    const ctx = this.ctx, x = Math.round(c.x), f = c.facing, k = this.lum(x, FLOOR - 4);
    const fill = (rgb: RGB, px: number, py: number, w: number, h: number) => {
      ctx.fillStyle = shade(rgb, k);
      ctx.fillRect(px, py, w, h);
    };
    if (c.kind === "cart") {
      // A four-wheeled book cart: a box on two pairs of spoked wheels, a handle behind.
      fill([110, 72, 40], x - 6, FLOOR - 6, 12, 3);
      fill([70, 44, 24], x - 6, FLOOR - 6, 12, 1);
      fill([60, 40, 22], f > 0 ? x - 8 : x + 6, FLOOR - 8, 2, 1);
      fill([60, 40, 22], f > 0 ? x - 7 : x + 6, FLOOR - 7, 1, 2);
      for (const wx of [x - 5, x + 2]) {
        fill([36, 28, 22], wx, FLOOR - 3, 3, 3);
        fill([150, 120, 80], wx + 1, FLOOR - 2, 1, 1);
      }
      c.books.forEach((b, n) => {
        const layer = Math.floor(n / 8), col = n % 8;
        fill(hex(BOOK_COLORS[b]), x - 5 + col + (layer ? 1 : 0), FLOOR - 8 - layer * 2, 1, 2);
      });
    } else {
      // The wheelbarrow: a tray on one wheel at the front, legs and handles behind.
      fill([92, 92, 98], x - 4, FLOOR - 5, 8, 2);
      fill([70, 70, 76], x - 3, FLOOR - 3, 6, 1);
      fill([36, 28, 22], f > 0 ? x + 3 : x - 5, FLOOR - 3, 3, 3);
      fill([60, 40, 22], f > 0 ? x - 3 : x + 2, FLOOR - 2, 1, 2);
      fill([90, 60, 32], f > 0 ? x - 8 : x + 4, FLOOR - 5, 4, 1);
      for (let n = 0; n < c.planks; n += 2) fill([176, 132, 76], x - 4 + (n % 4 ? 1 : 0), FLOOR - 6 - Math.floor(n / 2), 8, 1);
    }
  }
  private drawRemains(x: number, a: number) {
    if (a <= 0) return;
    const ctx = this.ctx, k = this.lum(x, FLOOR - 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = shade([58, 54, 52], k);
    ctx.fillRect(Math.round(x) - 2, FLOOR - 1, 5, 1);
    ctx.fillRect(Math.round(x) - 1, FLOOR - 2, 2, 1);
    ctx.fillStyle = shade([200, 192, 176], k);
    ctx.fillRect(Math.round(x) + 1, FLOOR - 2, 1, 1);
    ctx.globalAlpha = 1;
  }

  /** How full each water butt is: dark where the buckets have emptied it. */
  private drawButts(sim: LibrarySim) {
    const ctx = this.ctx;
    sim.butts.forEach((b, side) => {
      const x = BUTTS[side], k = this.lum(x, FLOOR - 6), empty = Math.round((1 - b / BUTT_FULL) * 6);
      if (!empty) return;
      ctx.fillStyle = shade([24, 18, 14], k);
      ctx.fillRect(x - 2, FLOOR - 9, 5, empty);
      if (b > 0) {
        ctx.fillStyle = shade([60, 110, 150], k);
        ctx.fillRect(x - 2, FLOOR - 9 + empty, 5, 1);
      }
    });
  }

  // ── Fire ────────────────────────────────────────────────────────────

  /** Gathers the burning cells into blocks for their light and glow. */
  private gatherFire(sim: LibrarySim) {
    this.blazes = [];
    const f = sim.fire;
    if (!f.active) return;
    const B = 12, cols = Math.ceil(FW / B), rows = Math.ceil(H / CELL / B), count = new Array(cols * rows).fill(0), sx = new Array(cols * rows).fill(0), sy = new Array(cols * rows).fill(0);
    for (let i = 0; i < f.heat.length; i++) {
      if (!f.burningAt(i)) continue;
      const cx = i % FW, cy = (i / FW) | 0, b = Math.floor(cy / B) * cols + Math.floor(cx / B);
      count[b]++;
      sx[b] += cx * CELL + 1;
      sy[b] += cy * CELL + 1;
    }
    count.forEach((n, b) => {
      if (n) this.blazes.push({ x: sx[b] / n, y: sy[b] / n, n });
    });
  }

  /** The flames cell by cell, licking upward, with smoke, embers and thrown water. */
  private drawFire(sim: LibrarySim, time: number, dt: number, effects: boolean) {
    const ctx = this.ctx, f = sim.fire, tick = Math.floor(time * 12);
    for (let i = 0; i < f.heat.length; i++) {
      if (!f.burningAt(i)) continue;
      const cx = i % FW, cy = (i / FW) | 0, h = f.heat[i], r = h01(i, tick, 51), x = cx * CELL, y = cy * CELL;
      ctx.fillStyle = h > 1.3 ? "#ffe8a0" : h > 0.9 ? "#ffad3a" : "#e2601c";
      ctx.fillRect(x, y, CELL, CELL);
      // Tongues of flame flick up from the hottest cells.
      if (r < h * 0.45) {
        const up = 1 + Math.floor(r * 6);
        ctx.fillStyle = r < 0.15 ? "#fff0b8" : "#ff8a2a";
        ctx.fillRect(x + (r < 0.3 ? 0 : 1), y - up, 1, up);
      }
      if (effects && this.fx() < 0.012 && this.puffs.length < 260) {
        const ember = this.fx() < 0.3;
        this.puffs.push({ x: x + 1, y: y - 2, vx: (this.fx() - 0.5) * 6, vy: ember ? -14 - this.fx() * 12 : -6 - this.fx() * 6, age: 0, life: ember ? 1 + this.fx() * 1.5 : 3 + this.fx() * 3, ember });
      }
    }
    this.puffs = this.puffs.filter((p) => {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx += (this.fx() - 0.5) * 8 * dt;
      const a = 1 - p.age / p.life;
      if (a <= 0 || p.y < 0) return false;
      const s = p.ember ? 1 : 1 + p.age * 1.3;
      ctx.globalAlpha = p.ember ? a : a * 0.32;
      ctx.fillStyle = p.ember ? (a > 0.5 ? "#ffd070" : "#ff7a2a") : "#2a2624";
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      return true;
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#9ad0ff";
    for (const d of f.drops) ctx.fillRect(d.x, d.y, 1, 1);
    if (!effects) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.blazes.forEach((b, n) => {
      const r = 10 + Math.min(40, b.n * 0.8);
      ctx.globalAlpha = Math.min(0.85, 0.25 + b.n * 0.012) * flicker(time * 2.3, n + 20);
      ctx.drawImage(this.glow, b.x - r, b.y - r, r * 2, r * 2);
    });
    ctx.restore();
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
    // Lifted off the flags by a sip of the brew.
    const float = l.action === "float" ? 2 + Math.round(Math.sin(time * 3 + l.id)) : 0;
    const ctx = this.ctx, x = Math.round(l.x) - 1, y = Math.round(l.y) - float, lum = this.lum(l.x, y - 3);
    ctx.fillStyle = shade(ROBES[l.role], lum);
    // A step's bob while walking (quicker running from a fire); crouched when cowering.
    const bob = l.action === "walk" && Math.floor(time * (l.mode === "work" ? 6 : 10) + l.id) % 2 ? 1 : 0;
    // Crouched cowering, head bowed mourning, slumped dozing, bent to the mortar.
    const low = l.action === "cower" || l.action === "mourn" || l.action === "doze" || (l.action === "grind" && Math.floor(time * 4 + l.id) % 2) ? 1 : 0;
    ctx.fillRect(x, y - 4 - bob + low, 2, 4 + bob - low);
    if (l.soot > 0.05) {
      // Blackened by a brew gone wrong.
      ctx.globalAlpha = Math.min(1, l.soot * 1.5);
      ctx.fillStyle = "#1a1614";
      ctx.fillRect(x, y - 4 - bob + low, 2, 2);
      ctx.globalAlpha = 1;
    }
    hat(ctx, l, x, y - 4 - bob + low + (l.action === "stumble" ? 1 : 0));
    const front = l.facing > 0 ? x + 2 : x - 1;
    if (l.hand === "plank") {
      ctx.fillStyle = shade([176, 132, 76], lum);
      ctx.fillRect(l.facing > 0 ? x - 1 : x - 2, y - 3 - bob, 5, 1);
    }
    if (l.hand === "bucket" || l.action === "fill") {
      const raised = l.action === "throw";
      ctx.fillStyle = shade([120, 120, 128], lum);
      ctx.fillRect(front + (l.facing > 0 ? 0 : -1), raised ? y - 6 : y - 2, 2, 2);
      if (l.water > 0) {
        ctx.fillStyle = "#6aa8e0";
        ctx.fillRect(front + (l.facing > 0 ? 0 : -1), raised ? y - 6 : y - 2, 2, 1);
      }
    }
    if (l.carrying && l.action !== "read") {
      ctx.fillStyle = BOOK_COLORS[l.carrying];
      ctx.fillRect(l.facing > 0 ? x + 2 : x - 1, y - 2 - bob, 1, 2);
    }
    if ((l.action === "build" || l.action === "grab" || l.action === "place") && Math.floor(time * 5) % 2) {
      ctx.fillStyle = l.action === "build" ? "#9a9ca4" : "#e8d8a8";
      ctx.fillRect(l.facing > 0 ? x + 2 : x - 1, y - 4, 1, 1);
    }
    if (l.action === "study") {
      // Reading at the table: the book open on it, a page turning now and then.
      if (l.reading) {
        const page = Math.floor(time * 0.4 + l.id) % 4 === 0;
        ctx.fillStyle = "#efe6cc";
        ctx.fillRect(l.facing > 0 ? x + 3 : x - 4, TABLE_TOP - 1, 2, 1);
        if (page) ctx.fillRect(l.facing > 0 ? x + 4 : x - 3, TABLE_TOP - 2, 1, 1);
        ctx.fillStyle = BOOK_COLORS[l.reading];
        ctx.fillRect(l.facing > 0 ? x + 5 : x - 2, TABLE_TOP - 1, 1, 1);
      }
    }
    if (l.hand === "flask") {
      // A flask of an elixir, raised to the lips when drinking.
      const up = l.action === "drink" || l.action === "taste" ? 3 : 0;
      ctx.fillStyle = shade([200, 226, 236], lum);
      ctx.fillRect(front, y - 3 - up, 1, 1);
      ctx.fillStyle = ELIXIRS[l.vial];
      ctx.fillRect(front, y - 2 - up, 1, 1);
    }
    if (l.action === "stir") {
      // The paddle going round in the pot.
      const k = Math.floor(time * 3 + l.id) % 4;
      ctx.fillStyle = shade([150, 110, 64], lum);
      ctx.fillRect(front + (k < 2 ? 1 : 2) * l.facing, y - 5 + (k % 2), 1, 4);
    }
    if (l.action === "stoke" && Math.floor(time * 3) % 2) {
      ctx.fillStyle = shade(ROBES[l.role], lum);
      ctx.fillRect(front, y - 3, 1, 1);
    }
    if (l.action === "distill" && Math.floor(time * 2 + l.id) % 3 === 0) {
      ctx.fillStyle = "#a0e0ff";
      ctx.fillRect(front, y - 5, 1, 1);
    }
    if (l.action === "grind") {
      ctx.fillStyle = shade([180, 160, 120], lum);
      ctx.fillRect(front, y - 4 + (Math.floor(time * 4 + l.id) % 2), 1, 2);
    }
    if (l.action === "chant") {
      // Arms raised to the circle, turn and turn about.
      ctx.fillStyle = shade(ROBES[l.role], lum);
      const k = Math.floor(time * 2 + l.id) % 2;
      ctx.fillRect(x - 1 + k * 3, y - 6, 1, 2);
    }
    if (l.action === "observe") {
      ctx.fillStyle = "rgba(170,255,200,0.7)";
      ctx.fillRect(x + (l.facing > 0 ? 1 : 0), y - 4, 1, 1);
    }
    if (float) {
      // Sparkles under their feet while they hang in the air.
      ctx.fillStyle = Math.floor(time * 6) % 2 ? "#e8d0ff" : ELIXIRS[l.vial] || "#c890ff";
      ctx.fillRect(x + (Math.floor(time * 5 + l.id) % 3) - 1, y + 1 + (Math.floor(time * 7) % 2), 1, 1);
    }
    if (l.action === "hiccup") {
      // Bubbles of the brew rising off them, one a hiccup.
      const p = (time * 1.6 + l.id * 0.3) % 1;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = ELIXIRS[l.vial] || "#4ad86a";
      ctx.fillRect(x + (l.facing > 0 ? 2 : -1) + Math.round(Math.sin(p * 6)), y - 6 - Math.round(p * 6), 1, 1);
      ctx.fillRect(x + (l.facing > 0 ? 3 : -2), y - 5 - Math.round(((p + 0.5) % 1) * 6), 1, 1);
      ctx.globalAlpha = 1;
    }
    if (l.action === "scroll") {
      // A scroll unrolled before them, a line of writing across it.
      ctx.fillStyle = shade([232, 220, 186], lum);
      ctx.fillRect(l.facing > 0 ? x + 2 : x - 3, y - 4, 3, 2);
      ctx.fillStyle = shade([150, 120, 70], lum);
      ctx.fillRect(l.facing > 0 ? x + 2 : x - 3, y - 4, 1, 2);
      ctx.fillRect(l.facing > 0 ? x + 4 : x - 1, y - 4, 1, 2);
    }
    if (l.action === "confer" && Math.floor(time * 0.8 + l.id) % 2) {
      // An alchemical sign held up in talk: sulphur, then salt.
      ctx.fillStyle = shade([236, 228, 206], lum);
      const sign = Math.floor(time * 0.4 + l.id) % 2 ? [[1, 0], [0, 1], [2, 1], [1, 2]] : [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]];
      for (const [dx, dy] of sign) ctx.fillRect(x - 1 + dx, y - 10 + dy, 1, 1);
    }
    if (l.action === "feed") {
      // A morsel held out, then tossed.
      ctx.fillStyle = shade([150, 100, 60], lum);
      ctx.fillRect(front + (Math.floor(time * 2) % 2) * l.facing, y - 4 - (Math.floor(time * 2) % 2), 1, 1);
    }
    if (l.action === "tend") {
      // A watering can, tipped, dripping.
      ctx.fillStyle = shade([120, 124, 132], lum);
      ctx.fillRect(front, y - 3, 2, 2);
      ctx.fillStyle = "#6aa8e0";
      ctx.fillRect(front + 2 * l.facing, y - 1 + (Math.floor(time * 8) % 3), 1, 1);
    }
    if (l.action === "pull") {
      // The mandrake held up by its leaves, its little face howling.
      const up = Math.min(4, Math.floor(time * 6) % 10);
      ctx.fillStyle = shade([200, 160, 110], lum);
      ctx.fillRect(front, y - 4 - up, 2, 3);
      ctx.fillStyle = "#3a2010";
      ctx.fillRect(front, y - 3 - up, 1, 1);
      ctx.fillStyle = "#5a9a40";
      ctx.fillRect(front, y - 6 - up, 2, 2);
    }
    if (l.action === "recite" || l.action === "scry") {
      // Hands raised to the book, or held over the orb.
      ctx.fillStyle = shade(ROBES[l.role], lum);
      const k = l.action === "recite" ? Math.floor(time * 1.5 + l.id) % 2 : 0;
      ctx.fillRect(front, y - 5 + k, 1, 1);
      if (l.action === "scry") {
        ctx.fillStyle = "rgba(150,200,255,0.8)";
        ctx.fillRect(x + (l.facing > 0 ? 1 : 0), y - 4, 1, 1);
      }
    }
    if (l.action === "cast") {
      // Tongs gripping the crucible, tipped to pour.
      ctx.fillStyle = shade([70, 70, 76], lum);
      ctx.fillRect(l.facing > 0 ? front : front - 1, y - 4, 2, 1);
      ctx.fillStyle = "#ffb030";
      ctx.fillRect(front + l.facing, y - 3, 1, 1);
    }
    if (l.action === "wind") {
      // A brass key turned round and round.
      const k = Math.floor(time * 4 + l.id) % 4;
      ctx.fillStyle = shade([200, 160, 70], lum);
      ctx.fillRect(front + (k === 1 ? l.facing : 0), y - 4 + (k === 2 ? 1 : 0), 1, 1);
    }
    if (l.hand === "cup") {
      ctx.fillStyle = shade([226, 220, 206], lum);
      ctx.fillRect(front, y - 3, 1, 1);
      // Steam off the tea.
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#e8e4dc";
      ctx.fillRect(front + (Math.floor(time * 2 + l.id) % 2), y - 5 - (Math.floor(time * 3) % 2), 1, 1);
      ctx.globalAlpha = 1;
    }
    if (l.hand === "broom") {
      const sw = l.action === "sweep" && Math.floor(time * 4 + l.id) % 2 ? 1 : 0;
      ctx.fillStyle = shade([120, 84, 44], lum);
      ctx.fillRect(front, y - 4, 1, 3);
      ctx.fillStyle = shade([196, 170, 96], lum);
      ctx.fillRect(front + (l.facing > 0 ? sw : -sw), y - 1, 2, 1);
    }
    if (l.action === "pour") {
      ctx.fillStyle = l.y > H ? ELIXIRS[l.vial] : "#6aa8e0";
      ctx.fillRect(front + l.facing, y - 2 + (Math.floor(time * 8) % 2), 1, 2);
    }
    if (l.action === "chat" && Math.floor(time * 2 + l.id * 0.7) % 3 === 0) {
      // A few words, turn and turn about.
      ctx.fillStyle = shade([236, 228, 206], lum);
      for (let k = 0; k < 3; k++) ctx.fillRect(x - 1 + k * 2, y - 9, 1, 1);
    }
    if (l.action === "doze") {
      const z = (time * 0.8 + l.id * 0.37) % 1;
      ctx.globalAlpha = 1 - z;
      ctx.fillStyle = "#cfd8f0";
      ctx.fillRect(x + 2 + Math.round(z * 3), y - 7 - Math.round(z * 6), 2, 1);
      ctx.fillRect(x + 3 + Math.round(z * 3), y - 6 - Math.round(z * 6), 1, 1);
      ctx.fillRect(x + 2 + Math.round(z * 3), y - 5 - Math.round(z * 6), 2, 1);
      ctx.globalAlpha = 1;
    }
    if (l.action === "gaze") {
      // Face turned up to the glass, catching its light.
      ctx.fillStyle = "rgba(255,236,190,0.8)";
      ctx.fillRect(x + (l.facing > 0 ? 1 : 0), y - 4, 1, 1);
    }
    if (l.action === "read" && l.carrying) {
      // The book held open: its pages and its cover's colour.
      ctx.fillStyle = shade([239, 230, 204], lum);
      ctx.fillRect(l.facing > 0 ? x + 2 : x - 2, y - 3, 2, 1);
      ctx.fillStyle = BOOK_COLORS[l.carrying];
      ctx.fillRect(l.facing > 0 ? x + 2 : x - 2, y - 2, 2, 1);
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
      if (!this.candles[n]) return;
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
      if (!this.candles[n]) return;
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
const shade = (c: RGB, k: number) => `rgb(${c255(c[0] * k)},${c255(c[1] * k)},${c255(c[2] * k)})`;
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

