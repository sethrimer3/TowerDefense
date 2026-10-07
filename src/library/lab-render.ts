/** Draws the alchemy lab under the nave: a vaulted cellar walled in the
 * nave's ashlar, baked once (again when the lab grows a level) as pixel art
 * and lit per pixel each frame through the stones' bump map, so each block's
 * face turns toward its fires (the athanor's mouth, the brazier under the
 * alembic, the fire under the cauldron), its candles and lanterns, the
 * philosopher's stone, the runes on the pilasters and, when it flares, the
 * transmutation circle on the wall. Over it go what moves: flames, coals,
 * embers, the cauldron's bubbles and steam in the colour of its brew, drips
 * into the alembic's receiver, the bellows when worked, the homunculus
 * bobbing in its jar, sparks off a chant, clouds of coloured smoke, the
 * lights' glow, a spider on its thread and the lab's black cat.
 *
 * A bigger lab opens annexes either side, under the hallways: to the west a
 * mandrake garden, a lectern with a grimoire floating over it and (level 4)
 * a salamander in its cage; to the east a crucible casting gold, an orrery
 * and (level 5) a scrying orb.
 *
 * The picture runs the width of the nave and its hallways, from the bottom
 * of the nave's floor (`H`) to the bottom of the lab's (`WORLD_H`); outside
 * the cellar's walls is earth. A ladder comes down through a hatch in the
 * vault (`HATCH_Y`) from the trapdoor in the nave's floor at `STAIR_X`. */
import { ANNEXES, HALL, H, LAB_FLOOR, LAB_TOP, STAIR_X, W, WORLD_H } from "./geometry.ts";
import { ELIXIRS, hasStation } from "./lab.ts";
import type { LibrarySim } from "./sim.ts";
import { stream } from "../random.ts";
import { ashlar, facing, h01 } from "./ashlar.ts";

type RGB = [number, number, number];
const LW = W + 2 * HALL, LH = WORLD_H - H;
const enum Px { Earth, Room, Glass }

/** The cellar's walls and its three barrel vaults. */
const ROOM = { x0: 4, x1: W - 4 };
const SPANS = [[ROOM.x0, 66], [66, 126], [126, ROOM.x1]];
const ceiling = (x: number) => {
  const [a, b] = SPANS.find(([a, b]) => x >= a && x < b) ?? SPANS[0];
  const t = Math.max(-1, Math.min(1, (x + 0.5 - (a + b) / 2) / ((b - a) / 2)));
  return LAB_TOP + 4 + 18 * (1 - Math.sqrt(1 - t * t));
};
/** The annexes' single vaults, lower than the cellar's. */
const ANNEX_TOP = LAB_TOP + 24;
const annexCeiling = (x: number, a: { x0: number; x1: number }) => {
  const t = Math.max(-1, Math.min(1, (x + 0.5 - (a.x0 + a.x1) / 2) / ((a.x1 - a.x0) / 2)));
  return ANNEX_TOP + 16 * (1 - Math.sqrt(1 - t * t));
};
/** The piers between the cellar and the annexes once they are dug out:
 * pilasters from the annexes' vaults down, the floor running on under them. */
const DOORS = { west: { x0: ANNEXES.west.x1, x1: ROOM.x0 }, east: { x0: ROOM.x1, x1: ANNEXES.east.x0 } };
const DOOR_TOP = ANNEX_TOP + 16;
/** The row the ladder comes down through the vault from. */
export const HATCH_Y = Math.ceil(ceiling(STAIR_X));
const open = (side: "west" | "east", level: number) => level >= ANNEXES[side].level;
function inRoom(x: number, y: number, level = 1) {
  if (y >= LAB_FLOOR) return false;
  if (x >= ROOM.x0 && x < ROOM.x1) return y >= ceiling(x);
  for (const side of ["west", "east"] as const) {
    if (!open(side, level)) continue;
    const a = ANNEXES[side], d = DOORS[side];
    if (x >= a.x0 && x < a.x1) return y >= annexCeiling(x, a);
    if (x >= d.x0 && x < d.x1) return y >= DOOR_TOP;
  }
  return false;
}

/** Where things stand in the lab (world pixels). */
const F = LAB_FLOOR;
const ATHANOR = { x0: 64, x1: 81, mouth: { x0: 69, x1: 76, top: F - 8 }, egg: { x: 72, y: F - 27 } };
const BRAZIER = { x: 46, y: F - 6 };
const RECEIVER = { x0: 56, x1: 60, top: F - 8, bottom: F - 4 };
const CAULDRON = { x0: 117, x1: 132, top: F - 10 };
const PEDESTAL = { x0: 104, x1: 109 };
const STONE = { x: 106, y: F - 11 };
const CIRCLE = { x: 106, y: F - 58, r: 17 };
const DESK = { x0: 134, x1: 153, top: F - 7 };
const CANDLE = { x: 150, y: F - 9 };
const SCONCES = [{ x: 9, y: F - 52 }, { x: W - 10, y: F - 52 }];
/** Iron lanterns hanging in the outer vaults. */
const LANTERNS = [{ x: 36, y: LAB_TOP + 34 }, { x: 156, y: LAB_TOP + 40 }];
const JAR = { x0: 177, x1: 187, top: F - 23, bottom: F - 3 };

/** Alchemical signs chalked on the wall, five pixels square. */
const GLYPHS: Record<string, string[]> = {
  sun: [".###.", "#...#", "#.#.#", "#...#", ".###."],
  moon: [".##..", "#....", "#....", "#....", ".##.."],
  mercury: ["#...#", ".###.", "#...#", ".###.", "..#.."],
  fire: ["..#..", ".#.#.", ".#.#.", "#...#", "#####"],
  water: ["#####", "#...#", ".#.#.", ".#.#.", "..#.."],
  air: ["..#..", ".#.#.", "#####", "#...#", "#####"],
  earth: ["#####", "#...#", "#####", ".#.#.", "..#.."],
  sulfur: ["..#..", ".#.#.", "#####", "..#..", ".###."],
  salt: [".###.", "#...#", "#####", "#...#", ".###."],
};
const SIGNS: [string, number, number][] = [
  ["sun", 14, F - 78], ["moon", 26, F - 66], ["mercury", 40, F - 82], ["fire", 52, F - 60], ["sulfur", 90, F - 84], ["water", 122, F - 82],
  ["air", 160, F - 76], ["earth", 172, F - 62], ["salt", 136, F - 62], ["moon", 90, F - 46], ["sun", 116, F - 36],
];

const c255 = (v: number) => (v >= 255 ? 255 : v <= 0 ? 0 : v | 0);
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const flicker = (t: number, n: number) => 0.88 + 0.08 * Math.sin(t * 2.3 + n * 1.7) + 0.06 * Math.sin(t * 9.1 + n * 4.3) + 0.03 * Math.sin(t * 23 + n);

type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string; up?: number };
/** The lab's black cat: where it is, where it is going, what it is doing
 * and until when (seconds of the renderer's time). */
type Cat = { x: number; to: number; facing: number; act: "walk" | "sit" | "groom" | "sleep" | "stretch"; until: number };

/** Runes cut into the pilasters, glowing faintly in turn. */
const RUNES = [{ x: 65, y: F - 70 }, { x: 65, y: F - 50 }, { x: 125, y: F - 70 }, { x: 125, y: F - 50 }];
const RUNE: string[][] = [["#.#", ".#.", "#.#"], [".#.", "###", ".#."], ["##.", "#.#", ".##"], ["#..", "###", "..#"]];
/** Candles stood on the floor at the pilasters' feet. */
const FLOOR_CANDLES = [{ x: 60, y: F - 3 }, { x: 62, y: F - 2 }, { x: 130, y: F - 3 }, { x: 132, y: F - 2 }];
/** What stands in the annexes. */
const GARDEN = { x0: -47, x1: -37, top: F - 6 };
const LECTERN = { x: -28, top: F - 11 };
const CAGE = { x0: -15, x1: -5, top: F - 17 };
const FURNACE = { x0: 196, x1: 208, top: F - 13 };
const ORRERY = { x: 222, y: F - 18 };
const ORB = { x: 236, y: F - 17 };
const ANNEX_LANTERNS = { west: { x: -25, y: ANNEX_TOP + 22 }, east: { x: 217, y: ANNEX_TOP + 22 } };

export class LabRenderer {
  /** Wall-clock seconds, for the flames' flicker (set by the nave's renderer). */
  flame = 0;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private image: ImageData;
  private px: Uint32Array;
  private base = new Float32Array(LW * LH * 3);
  private kind = new Uint8Array(LW * LH);
  private light = new Float32Array(LW * LH * 3);
  /** The stones' bump map: slopes, and which pixels have one. */
  private sx = new Float32Array(LW * LH);
  private sy = new Float32Array(LW * LH);
  private relief = new Uint8Array(LW * LH);
  private height = new Float32Array(LW * LH);
  private sparks: Spark[] = [];
  private glows = new Map<string, HTMLCanvasElement>();
  private fx = stream("effects");
  /** The level the picture was baked for. */
  private level = 0;
  private orreryAngle = 0;
  private clock = 0;
  private cat: Cat = { x: 140, to: 140, facing: -1, act: "sit", until: 4 };

  constructor() {
    this.off = document.createElement("canvas");
    this.off.width = LW;
    this.off.height = LH;
    this.offCtx = this.off.getContext("2d")!;
    this.image = this.offCtx.createImageData(LW, LH);
    this.px = new Uint32Array(this.image.data.buffer);
  }

  // ── Baked once a level ──────────────────────────────────────────────

  private put(x: number, y: number, c: RGB, kind = Px.Room) {
    const lx = Math.round(x) + HALL, ly = Math.round(y) - H;
    if (lx < 0 || lx >= LW || ly < 0 || ly >= LH) return;
    const i = ly * LW + lx;
    this.base[i * 3] = c[0];
    this.base[i * 3 + 1] = c[1];
    this.base[i * 3 + 2] = c[2];
    this.kind[i] = kind;
    this.relief[i] = 0;
  }
  private rect(x: number, y: number, w: number, h: number, c: RGB | ((x: number, y: number) => RGB), kind = Px.Room) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.put(xx, yy, typeof c === "function" ? c(xx, yy) : c, kind);
  }
  private blend(x: number, y: number, c: RGB, a: number) {
    const lx = x + HALL, ly = y - H;
    if (lx < 0 || lx >= LW || ly < 0 || ly >= LH) return;
    const i = (ly * LW + lx) * 3;
    for (let k = 0; k < 3; k++) this.base[i + k] = this.base[i + k] * (1 - a) + c[k] * a;
  }

  private bake(level: number) {
    this.level = level;
    const height = this.height;
    height.fill(0);
    this.relief.fill(0);
    const rooms = [{ x0: ROOM.x0, x1: ROOM.x1, top: LAB_TOP }, ...(["west", "east"] as const).filter((s) => open(s, level)).map((s) => ({ ...ANNEXES[s], top: ANNEX_TOP }))];
    const masonry = (x: number, y: number) => rooms.some((r) => x >= r.x0 - 6 && x < r.x1 + 6 && y >= r.top - 6);
    // Earth all round, the cellar's masonry, its ashlar walls, its vaults and its floor.
    for (let ly = 0; ly < LH; ly++)
      for (let lx = 0; lx < LW; lx++) {
        const x = lx - HALL, y = ly + H, i = ly * LW + lx;
        let c: RGB, kind = Px.Earth, hgt = -1;
        const n = h01(x, y, 3);
        if (inRoom(x, y, level)) {
          kind = Px.Room;
          // The nave's ashlar, the pilasters in the bigger blocks of its piers.
          const pier = DOORS.west.x0 <= x && x < DOORS.west.x1 ? DOORS.west : DOORS.east.x0 <= x && x < DOORS.east.x1 ? DOORS.east : null;
          const pilaster = (x >= 63 && x < 69) || (x >= 123 && x < 129) || !!pier;
          const stone = ashlar(x, y, pilaster);
          const side = pilaster && (x === 63 || x === 68 || x === 123 || x === 128 || (pier !== null && (x === pier.x0 || x === pier.x1 - 1)));
          c = side ? [30, 27, 26] : stone.rgb;
          hgt = side ? 0 : stone.hgt;
          // Darker low down, where the damp gets in.
          const damp = 0.86 + Math.min(1, (F - y) / 40) * 0.14;
          c = [c[0] * damp, c[1] * damp, c[2] * damp];
        } else if (y < F && masonry(x, y)) {
          // The cellar's masonry: big dressed blocks round the rooms.
          const course = Math.floor(y / 6), off = course % 2 ? 6 : 0, bx = Math.floor((x + 64 + off) / 12);
          const edge = y % 6 === 0 || (x + 64 + off) % 12 === 0;
          const t = 0.7 + h01(bx, course, 9) * 0.3;
          c = edge ? [22, 20, 20] : [64 * t, 60 * t, 56 * t];
        } else if (y >= F) {
          if (rooms.some((r) => x >= r.x0 - 6 && x < r.x1 + 6)) {
            kind = Px.Room;
            // Flagstones, each a slab with bevelled edges.
            const row = Math.floor((y - F) / 5), shift = (row % 2) * 6, tx = Math.floor((x + 64 + shift) / 12);
            const lx2 = (x + 64 + shift) % 12, ly2 = (y - F) % 5, edge = Math.min(lx2, 11 - lx2, ly2, 4 - ly2);
            const t = 0.78 + h01(tx, row, 11) * 0.3;
            c = edge === 0 ? [28, 26, 24] : [76 * t, 70 * t, 66 * t];
            hgt = edge === 0 ? 0 : Math.min(1, edge / 1.5);
          } else c = [30 * (0.8 + n * 0.4), 23 * (0.8 + n * 0.4), 18 * (0.8 + n * 0.4)];
        } else {
          // Packed earth with stones in it, and roots reaching down.
          const stone = h01(x >> 2, y >> 2, 13) < 0.12, root = y < H + 30 && Math.abs(x - Math.round(h01(x >> 4, 1, 14) * 16 + (x >> 4) * 16 + Math.sin(y * 0.4) * 1.5)) < 1 && h01(x >> 4, 2, 14) < 0.4;
          const t = 0.75 + n * 0.45;
          c = root ? [52, 34, 20] : stone ? [58 * t, 54 * t, 50 * t] : [36 * t, 27 * t, 20 * t];
        }
        // The vaults' ribs: voussoirs along each arch's edge.
        if (kind === Px.Room && y < F) {
          const annex = (["west", "east"] as const).find((s) => open(s, level) && x >= ANNEXES[s].x0 && x < ANNEXES[s].x1);
          const top = annex ? annexCeiling(x, ANNEXES[annex]) : x >= ROOM.x0 && x < ROOM.x1 ? ceiling(x) : -99;
          if (y - top < 3) {
            const t = 0.85 + h01(x >> 2, 1, 15) * 0.2, joint = (x >> 2) % 2 && y - top < 1;
            c = joint ? [40, 36, 34] : [96 * t, 90 * t, 84 * t];
            hgt = joint ? 0 : 1 - (y - top) / 3;
          }
        }
        this.base[i * 3] = c[0];
        this.base[i * 3 + 1] = c[1];
        this.base[i * 3 + 2] = c[2];
        this.kind[i] = kind;
        this.relief[i] = hgt >= 0 ? 1 : 0;
        height[i] = Math.max(0, hgt);
      }
    this.bakeStair();
    this.bakeWall();
    this.bakeApparatus();
    this.bakeAnnexes(level);
    for (let y = 1; y < LH - 1; y++)
      for (let x = 1; x < LW - 1; x++) {
        const i = y * LW + x;
        if (!this.relief[i]) continue;
        // A neighbour without relief (an object before the wall) reads as level ground.
        const h = height[i], at = (j: number) => (this.relief[j] ? height[j] : h);
        this.sx[i] = (at(i + 1) - at(i - 1)) * 0.5;
        this.sy[i] = (at(i + LW) - at(i - LW)) * 0.5;
      }
  }

  /** The ladder down through the hatch in the vault (the shaft above it,
   * under the nave's floor, is out of sight), and a barrel beside its foot. */
  private bakeStair() {
    this.rect(STAIR_X - 4, HATCH_Y - 1, 9, 2, (x) => (x === STAIR_X - 4 || x === STAIR_X + 4 ? [74, 72, 78] : [8, 6, 6]));
    for (let y = HATCH_Y - 1; y < F; y++) {
      this.put(STAIR_X - 2, y, [150, 106, 58]);
      this.put(STAIR_X + 1, y, [118, 82, 44]);
      if (y % 3 === 0) for (let x = STAIR_X - 1; x <= STAIR_X; x++) this.put(x, y, [124, 86, 46]);
    }
    // A barrel of salts, iron-hooped.
    this.rect(6, F - 9, 8, 9, (x, y) => (y === F - 9 ? [150, 146, 140] : y === F - 7 || y === F - 2 ? [70, 70, 76] : x === 6 || x === 13 ? [70, 44, 24] : [118 - Math.abs(x - 9.5) * 6, 78, 42]));
  }

  /** What hangs on and is chalked on the back wall. */
  private bakeWall() {
    const chalk: RGB = [196, 190, 172];
    for (const [g, x0, y0] of SIGNS)
      GLYPHS[g].forEach((row, dy) => [...row].forEach((ch, dx) => ch === "#" && this.blend(x0 + dx, y0 + dy, chalk, 0.45)));
    // The transmutation circle: two rings, a square and a triangle within,
    // and the seven planets' points round it.
    const { x: cx, y: cy, r } = CIRCLE;
    for (let a = 0; a < 720; a++) {
      const t = (a / 720) * Math.PI * 2;
      this.blend(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), chalk, 0.5);
      this.blend(Math.round(cx + Math.cos(t) * (r - 3)), Math.round(cy + Math.sin(t) * (r - 3)), chalk, 0.4);
    }
    const line = (a: number, b: number, rr: number, n: number, rot: number) => {
      for (let k = 0; k < n; k++) {
        const t0 = rot + (k / n) * Math.PI * 2, t1 = rot + ((k + 1) / n) * Math.PI * 2;
        for (let s = 0; s <= 40; s++) {
          const u = s / 40;
          this.blend(Math.round(a + Math.cos(t0) * rr * (1 - u) + Math.cos(t1) * rr * u), Math.round(b + Math.sin(t0) * rr * (1 - u) + Math.sin(t1) * rr * u), chalk, 0.4);
        }
      }
    };
    line(cx, cy, r - 3, 4, Math.PI / 4);
    line(cx, cy, r - 3, 3, -Math.PI / 2);
    for (let k = 0; k < 7; k++) {
      const t = (k / 7) * Math.PI * 2 - Math.PI / 2;
      this.rect(Math.round(cx + Math.cos(t) * (r + 3)), Math.round(cy + Math.sin(t) * (r + 3)), 1, 1, [210, 200, 150]);
    }
    this.blend(cx, cy, [230, 220, 180], 0.7);

    // A star chart pinned over the desk, and a shelf of scrolls and books.
    this.rect(138, F - 46, 13, 10, (x, y) => (x === 138 || x === 150 || y === F - 46 || y === F - 37 ? [150, 126, 86] : [196, 176, 128]));
    for (let k = 0; k < 7; k++) this.put(139 + Math.floor(h01(k, 1, 17) * 11), F - 45 + Math.floor(h01(k, 2, 17) * 8), [60, 50, 90]);
    for (let k = 0; k < 4; k++) this.put(140 + k * 3, F - 41 + (k % 2) * 2, [130, 40, 30]);
    this.rect(134, F - 28, 19, 1, [96, 62, 34]);
    for (let x = 135; x < 152; x++) {
      const book = h01(x, 3, 19);
      if (book < 0.45) this.rect(x, F - 31, 1, 3, [[110, 40, 34], [40, 60, 90], [60, 80, 40], [100, 80, 30]][Math.floor(book * 8.9) % 4] as RGB);
      else if (x % 3 === 0) this.rect(x, F - 30, 2, 2, [220, 206, 170]);
    }

    // The shelf of jars, flasks and bottles, with a skull on top.
    for (const sy of [F - 11, F - 21, F - 31]) {
      this.rect(26, sy, 16, 1, [96, 62, 34]);
      this.put(27, sy + 1, [70, 44, 24]);
      this.put(40, sy + 1, [70, 44, 24]);
      for (let x = 27; x < 41; ) {
        const v = h01(x, sy, 21), w = v < 0.4 ? 2 : 3, tall = 3 + Math.floor(h01(x, sy, 23) * 4);
        if (sy === F - 31 && x >= 34) {
          // The skull: dome, sockets, teeth.
          this.rect(35, sy - 4, 4, 3, [222, 214, 194]);
          this.rect(36, sy - 1, 2, 1, [200, 192, 172]);
          this.put(35, sy - 3, [20, 16, 14]);
          this.put(37, sy - 3, [20, 16, 14]);
          break;
        }
        const glass = hex(ELIXIRS[1 + Math.floor(h01(x, sy, 25) * (ELIXIRS.length - 1))]), brown: RGB = [90, 54, 30];
        const col = h01(x, sy, 27) < 0.3 ? brown : glass;
        this.rect(x, sy - tall, w, tall, (xx, yy) => (yy === sy - tall ? [150, 112, 70] : xx === x ? [Math.min(255, col[0] + 50), Math.min(255, col[1] + 50), Math.min(255, col[2] + 50)] : col), Px.Glass);
        x += w + 1;
      }
    }

    // A crocodile hanging from the vault on two chains.
    for (const cx of [90, 103]) for (let y = Math.ceil(ceiling(cx)); y < LAB_TOP + 27; y++) this.put(cx, y, y % 2 ? [70, 68, 72] : [110, 108, 114]);
    for (let x = 82; x < 112; x++) {
      const u = (x - 82) / 30;
      const top = LAB_TOP + 27 - (u < 0.25 ? 0 : 1), bottom = LAB_TOP + 28 + (u > 0.18 && u < 0.7 ? 1 : 0) + (u > 0.3 && u < 0.55 ? 1 : 0);
      for (let y = top; y <= bottom; y++) this.put(x, y, y === top ? (x % 2 ? [124, 144, 84] : [100, 120, 66]) : [80, 98, 54]);
    }
    for (const lx of [89, 93, 100, 104]) this.rect(lx, LAB_TOP + 31, 1, 2, [80, 98, 54]);
    this.put(83, LAB_TOP + 27, [220, 214, 194]);
    this.put(85, LAB_TOP + 27, [200, 160, 40]);

    // Bunches of herbs drying from a pole.
    this.rect(156, LAB_TOP + 26, 16, 1, [96, 62, 34]);
    for (const hx of [158, 162, 166, 170]) {
      this.put(hx, LAB_TOP + 27, [140, 120, 80]);
      this.rect(hx - 1, LAB_TOP + 28, 3, 3 + (hx % 3), (x, y) => (h01(x, y, 29) < 0.5 ? [70, 100, 50] : [96, 116, 60]));
    }
    // Cobwebs in the vaults' corners.
    for (const [x0, dir] of [[ROOM.x0, 1], [ROOM.x1 - 1, -1], [65, -1], [67, 1], [125, -1], [127, 1]] as const)
      for (let k = 0; k < 6; k++) this.blend(x0 + dir * k, Math.round(ceiling(x0 + dir * k)) + 3 + (k % 2), [170, 170, 176], 0.35);
    // The sconces' iron brackets.
    for (const s of SCONCES) {
      this.rect(s.x - 1, s.y + 1, 3, 1, [50, 48, 52]);
      this.rect(s.x, s.y + 2, 1, 3, [50, 48, 52]);
      this.rect(s.x, s.y - 1, 1, 2, [226, 220, 200]);
    }
    for (const l of LANTERNS) {
      for (let y = Math.ceil(ceiling(l.x)); y < l.y; y++) this.put(l.x, y, y % 2 ? [60, 58, 62] : [96, 94, 100]);
      this.rect(l.x - 2, l.y, 5, 1, [50, 48, 52]);
      this.rect(l.x - 2, l.y + 5, 5, 1, [50, 48, 52]);
      for (let y = l.y + 1; y < l.y + 5; y++) {
        this.put(l.x - 2, y, [50, 48, 52]);
        this.put(l.x + 2, y, [50, 48, 52]);
        for (let x = l.x - 1; x <= l.x + 1; x++) this.put(x, y, [200, 170, 110], Px.Glass);
      }
    }
  }

  /** The athanor, the alembic, the stone, the cauldron, the desk, the
   * mortar bench and the homunculus's jar. */
  private bakeApparatus() {
    // The athanor: a brick tower to the vault, its arched mouth at the foot,
    // the philosophers' egg's window halfway up, bellows on its flank.
    const A = ATHANOR;
    for (let y = Math.ceil(ceiling(72)); y < F; y++)
      for (let x = A.x0; x < A.x1; x++) {
        const base = y >= F - 7, chimney = y < F - 40;
        if (chimney && (x < A.x0 + 3 || x >= A.x1 - 3)) continue;
        if (!base && !chimney && (x < A.x0 + 1 || x >= A.x1 - 1)) continue;
        const course = Math.floor((F - y) / 3), off = course % 2 ? 3 : 0, mortar = (F - y) % 3 === 0 || (x + off) % 6 === 0;
        const t = 0.75 + h01((x + off) >> 3, course, 31) * 0.3;
        const edge = x === A.x0 || x === A.x1 - 1 || (chimney && (x === A.x0 + 3 || x === A.x1 - 4)) || (!base && !chimney && (x === A.x0 + 1 || x === A.x1 - 2));
        this.put(x, y, edge ? [36, 26, 22] : mortar ? [70, 52, 40] : [172 * t, 128 * t, 92 * t]);
      }
    this.rect(A.x0 - 1, F - 7, A.x1 - A.x0 + 2, 1, [80, 74, 70]);
    for (let y = A.mouth.top; y < F - 1; y++)
      for (let x = A.mouth.x0; x < A.mouth.x1; x++) {
        const dx = x + 0.5 - (A.mouth.x0 + A.mouth.x1) / 2, arch = y - A.mouth.top < 3 && Math.abs(dx) > 1.5 + (y - A.mouth.top);
        if (!arch) this.put(x, y, [18, 10, 8]);
      }
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 3.6) this.put(A.egg.x + dx, A.egg.y + dy, d > 2.6 ? [60, 50, 40] : [120, 80, 40], d > 2.6 ? Px.Room : Px.Glass);
      }
    // Bellows.
    this.rect(81, F - 8, 2, 1, [60, 58, 62]);
    for (let y = F - 10; y < F - 5; y++) this.rect(83, y, 1 + Math.min(y - (F - 10), F - 6 - y) + 2, 1, [112, 72, 40]);

    // The alembic: a brazier, the retort over it, the tube down to the receiver on a stool.
    const B = BRAZIER;
    this.rect(B.x - 4, B.y, 8, 2, [62, 60, 64]);
    this.put(B.x - 3, B.y + 2, [50, 48, 52]);
    for (let y = B.y + 2; y < F; y++) {
      this.put(B.x - 3, y, [50, 48, 52]);
      this.put(B.x + 2, y, [50, 48, 52]);
    }
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 10) this.put(B.x + dx, B.y - 5 + dy, dx === -2 && dy === -1 ? [210, 230, 240] : [130, 168, 180], Px.Glass);
    for (let k = 0; k < 4; k++) this.put(B.x + 2 + k, B.y - 9 - k, [150, 188, 200], Px.Glass);
    for (let k = 0; k <= 10; k++) this.put(B.x + 6 + Math.round(k * 0.55), B.y - 13 + k, [150, 188, 200], Px.Glass);
    for (let y = RECEIVER.top; y <= RECEIVER.bottom; y++)
      for (let x = RECEIVER.x0; x < RECEIVER.x1; x++) this.put(x, y, x === RECEIVER.x0 ? [200, 226, 236] : [120, 156, 170], Px.Glass);
    this.rect(RECEIVER.x0 - 1, F - 3, 6, 1, [96, 62, 34]);
    this.put(RECEIVER.x0 - 1, F - 2, [70, 44, 24]);
    this.put(RECEIVER.x1, F - 2, [70, 44, 24]);
    this.put(RECEIVER.x0 - 1, F - 1, [70, 44, 24]);
    this.put(RECEIVER.x1, F - 1, [70, 44, 24]);

    // The pedestal the philosopher's stone rests on.
    this.rect(PEDESTAL.x0 - 1, F - 9, PEDESTAL.x1 - PEDESTAL.x0 + 2, 1, [120, 114, 108]);
    this.rect(PEDESTAL.x0, F - 8, PEDESTAL.x1 - PEDESTAL.x0, 7, (x) => (x === PEDESTAL.x0 ? [130, 124, 118] : [96, 92, 88]));
    this.rect(PEDESTAL.x0 - 1, F - 1, PEDESTAL.x1 - PEDESTAL.x0 + 2, 1, [80, 76, 72]);

    // The cauldron on its tripod, logs beneath.
    const C = CAULDRON;
    for (let y = F - 4; y < F; y++) {
      this.put(C.x0 + 1, y, [44, 42, 46]);
      this.put(C.x1 - 2, y, [44, 42, 46]);
    }
    this.rect(C.x0 + 4, F - 2, 7, 2, (x, y) => (y === F - 1 ? [74, 48, 26] : x % 3 ? [96, 62, 34] : [60, 40, 22]));
    const widths = [C.x1 - C.x0, C.x1 - C.x0 - 1, C.x1 - C.x0 - 1, C.x1 - C.x0 - 2, C.x1 - C.x0 - 3, C.x1 - C.x0 - 5];
    widths.forEach((w, k) => {
      const y = C.top + 1 + k, x0 = Math.round(C.x0 + (C.x1 - C.x0 - w) / 2);
      this.rect(x0, y, w, 1, (x) => (x === x0 + 1 && k < 4 ? [96, 94, 102] : [36, 34, 38]));
    });
    this.rect(C.x0, C.top, C.x1 - C.x0, 1, [70, 68, 74]);

    // The desk: a slab on legs, an armillary sphere, an inkwell and quill,
    // the open grimoire, a candle; the stool beside it.
    const D = DESK;
    this.rect(D.x0, D.top, D.x1 - D.x0, 1, [140, 92, 50]);
    this.rect(D.x0, D.top + 1, D.x1 - D.x0, 1, [84, 54, 28]);
    for (let y = D.top + 2; y < F; y++) {
      this.put(D.x0 + 1, y, [70, 44, 24]);
      this.put(D.x1 - 2, y, [70, 44, 24]);
    }
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      this.put(Math.round(138 + Math.cos(t) * 2.5), Math.round(D.top - 4 + Math.sin(t) * 2.5), [190, 150, 60]);
      this.put(Math.round(138 + Math.cos(t) * 2.5 * 0.4), Math.round(D.top - 4 + Math.sin(t) * 2.5), [160, 124, 50]);
    }
    this.rect(138, D.top - 1, 1, 1, [120, 90, 40]);
    this.rect(142, D.top - 1, 2, 1, [20, 18, 22]);
    for (let k = 0; k < 4; k++) this.put(143 + (k >> 1), D.top - 2 - k, [236, 232, 220]);
    this.rect(145, D.top - 1, 3, 1, [232, 220, 186]);
    this.rect(148, D.top - 1, 3, 1, [222, 208, 172]);
    this.put(146, D.top - 1, [150, 40, 30]);
    this.put(149, D.top - 1, [60, 50, 90]);
    this.rect(147, D.top, 1, 1, [110, 40, 34]);
    this.rect(CANDLE.x, CANDLE.y, 1, 2, [230, 222, 200]);
    this.rect(154, F - 5, 4, 1, [120, 80, 44]);
    for (let y = F - 4; y < F; y++) {
      this.put(154, y, [80, 52, 28]);
      this.put(157, y, [80, 52, 28]);
    }

    // The mortar bench.
    this.rect(158, F - 6, 9, 1, [120, 80, 44]);
    for (let y = F - 5; y < F; y++) {
      this.put(159, y, [80, 52, 28]);
      this.put(165, y, [80, 52, 28]);
    }
    this.rect(160, F - 9, 4, 3, (x, y) => (y === F - 9 ? [150, 146, 140] : x === 160 ? [140, 136, 130] : [104, 100, 96]));
    this.rect(161, F - 9, 2, 1, [70, 100, 50]);
    this.rect(163, F - 12, 1, 3, [180, 160, 120]);

    // The homunculus's jar: a tall glass on a stone base, under a brass lid.
    const J = JAR;
    this.rect(J.x0 - 1, J.bottom, J.x1 - J.x0 + 2, 3, (x, y) => (y === J.bottom ? [120, 114, 108] : [86, 82, 78]));
    this.rect(J.x0, J.top - 1, J.x1 - J.x0, 2, (x, y) => (y === J.top - 1 ? [200, 160, 70] : [150, 112, 46]));
    for (let y = J.top + 1; y < J.bottom; y++)
      for (let x = J.x0; x < J.x1; x++) this.put(x, y, x === J.x0 + 1 ? [150, 220, 180] : x === J.x0 || x === J.x1 - 1 ? [90, 140, 120] : [44, 110, 76], Px.Glass);
  }

  /** The annexes a bigger lab has dug out, and what stands in them. */
  private bakeAnnexes(level: number) {
    // Candles at the pilasters' feet.
    for (const c of FLOOR_CANDLES) this.rect(c.x, c.y, 1, F - c.y, [230, 222, 200]);
    if (open("west", level)) {
      // A shelf of grimoires on the wall, and herbs hung from the vault.
      this.rect(-46, F - 40, 18, 1, [96, 62, 34]);
      for (let x = -45; x < -29; x++) {
        const b = h01(x, 5, 61);
        if (b < 0.7) this.rect(x, F - 44 - (b < 0.2 ? 1 : 0), 1, 4 + (b < 0.2 ? 1 : 0), [[110, 40, 34], [40, 60, 90], [60, 80, 40], [100, 80, 30], [70, 40, 90]][Math.floor(b * 7) % 5] as RGB);
      }
      this.rect(-20, F - 56, 13, 9, (x, y) => (x === -20 || x === -8 || y === F - 56 || y === F - 48 ? [150, 126, 86] : [196, 176, 128]));
      // A sketch of the mandrake on it.
      this.rect(-15, F - 54, 2, 4, [120, 90, 60]);
      this.rect(-16, F - 55, 4, 1, [70, 110, 50]);
      this.put(-16, F - 51, [120, 90, 60]);
      this.put(-12, F - 51, [120, 90, 60]);
      // The mandrakes' bench, its clay pots.
      this.rect(GARDEN.x0, GARDEN.top, GARDEN.x1 - GARDEN.x0, 1, [120, 80, 44]);
      for (let y = GARDEN.top + 1; y < F; y++) {
        this.put(GARDEN.x0 + 1, y, [80, 52, 28]);
        this.put(GARDEN.x1 - 2, y, [80, 52, 28]);
      }
      for (const px of [GARDEN.x0, GARDEN.x0 + 4, GARDEN.x0 + 8])
        this.rect(px, GARDEN.top - 3, 3, 3, (x, y) => (y === GARDEN.top - 3 ? [176, 96, 60] : x === px ? [168, 92, 56] : [138, 72, 44]));
      // The lectern: a post on a foot, its slanted desk.
      const L = LECTERN;
      this.rect(L.x - 2, F - 1, 5, 1, [84, 54, 28]);
      this.rect(L.x, L.top + 2, 1, F - L.top - 3, [96, 62, 34]);
      for (let k = 0; k < 5; k++) this.put(L.x - 2 + k, L.top + 1 - (k >> 1), [140, 92, 50]);
      if (level >= 4) {
        // The salamander's cage: iron bars on a stone plinth, a bed of coals.
        const C = CAGE;
        this.rect(C.x0 - 1, F - 3, C.x1 - C.x0 + 2, 3, (x, y) => (y === F - 3 ? [130, 124, 118] : [96, 92, 88]));
        this.rect(C.x0, F - 5, C.x1 - C.x0, 2, (x) => (x % 2 ? [90, 30, 14] : [60, 22, 12]));
        this.rect(C.x0, C.top, C.x1 - C.x0, 1, [70, 70, 76]);
        for (let x = C.x0; x < C.x1; x += 3) this.rect(x, C.top, 1, F - 3 - C.top, [70, 70, 76]);
        this.rect(C.x1 - 1, C.top, 1, F - 3 - C.top, [70, 70, 76]);
        this.rect((C.x0 + C.x1) >> 1, C.top - 3, 1, 3, [60, 58, 62]);
      }
    }
    if (open("east", level)) {
      // The crucible's furnace: dressed stone, a firebox, the crucible on top;
      // the mould on the floor before it and the anvil the bars cool on.
      const U = FURNACE;
      this.rect(U.x0, U.top, U.x1 - U.x0, F - U.top, (x, y) => {
        const edge = x === U.x0 || x === U.x1 - 1 || y === U.top || (y - U.top) % 4 === 0;
        return edge ? [40, 36, 34] : [104 * (0.85 + h01(x >> 2, y >> 2, 63) * 0.2), 96 * (0.85 + h01(x >> 2, y >> 2, 63) * 0.2), 90 * (0.85 + h01(x >> 2, y >> 2, 63) * 0.2)];
      });
      this.rect(U.x0 + 3, F - 6, 6, 5, [16, 8, 6]);
      this.rect(U.x0 + 3, U.top - 4, 6, 4, (x, y) => (y === U.top - 4 ? [120, 116, 120] : x === U.x0 + 3 ? [96, 94, 102] : [52, 50, 56]));
      this.rect(U.x1 - 3, U.top - 12, 3, 8, (x) => (x === U.x1 - 3 ? [60, 56, 54] : [44, 40, 38]));
      // The orrery's table.
      this.rect(ORRERY.x - 5, F - 7, 11, 1, [140, 92, 50]);
      for (let y = F - 6; y < F; y++) {
        this.put(ORRERY.x - 4, y, [84, 54, 28]);
        this.put(ORRERY.x + 4, y, [84, 54, 28]);
      }
      this.rect(ORRERY.x, ORRERY.y + 2, 1, F - 8 - ORRERY.y - 1, [190, 150, 60]);
      this.rect(ORRERY.x - 1, F - 8, 3, 1, [160, 124, 50]);
      // A tapestry of the sun and moon wed, on the annex's back wall.
      this.rect(200, F - 62, 30, 22, (x, y) => {
        if (y === F - 62) return [96, 62, 34];
        const border = x === 200 || x === 229 || y === F - 41 || y === F - 61;
        if (border) return [170, 130, 50];
        const sx = x - 210, sy = y - (F - 52), mx = x - 220, my = y - (F - 52);
        if (sx * sx + sy * sy <= 12) return [220, 170, 50];
        if (mx * mx + my * my <= 12 && (mx + 2) * (mx + 2) + my * my > 9) return [210, 210, 220];
        return h01(x, y, 65) < 0.06 ? [210, 190, 120] : [70, 30, 60];
      });
      for (let x = 200; x < 230; x += 3) this.put(x, F - 40, [170, 130, 50]);
      if (level >= 5) {
        // The orb's tripod over a chalked ring on the flags.
        for (let k = 0; k < 7; k++) {
          this.put(ORB.x - 3 + Math.round(k * 0.4), F - 1 - k, [150, 112, 46]);
          this.put(ORB.x + 3 - Math.round(k * 0.4), F - 1 - k, [150, 112, 46]);
        }
        this.rect(ORB.x - 1, F - 8, 3, 1, [200, 160, 70]);
        for (let x = ORB.x - 6; x <= ORB.x + 6; x++) this.blend(x, F + 1, [210, 200, 170], 0.5);
      }
    }
  }

  // ── Each frame ──────────────────────────────────────────────────────

  /** The lab's lights this frame: where, how far, how bright, what colour. */
  private lights(sim: LibrarySim, time: number) {
    const lab = sim.lab, brew = hex(ELIXIRS[lab.brew]), level = lab.level;
    const out: { x: number; y: number; r: number; k: number; c: RGB }[] = [
      { x: (ATHANOR.mouth.x0 + ATHANOR.mouth.x1) / 2, y: F - 5, r: 64, k: (0.5 + lab.furnace * 1.1) * flicker(this.flame * 1.3, 1), c: [1, 0.55, 0.25] },
      { x: ATHANOR.egg.x, y: ATHANOR.egg.y, r: 18, k: 0.3 + lab.furnace * 0.4, c: [1, 0.7, 0.3] },
      { x: BRAZIER.x, y: BRAZIER.y - 1, r: 28, k: 0.6 * flicker(this.flame * 1.7, 2), c: [1, 0.5, 0.2] },
      { x: (CAULDRON.x0 + CAULDRON.x1) / 2, y: F - 2, r: 38, k: 0.8 * flicker(this.flame * 1.5, 3), c: [1, 0.55, 0.25] },
      { x: (CAULDRON.x0 + CAULDRON.x1) / 2, y: CAULDRON.top - 1, r: 30, k: 0.55, c: [brew[0] / 255, brew[1] / 255, brew[2] / 255] },
      { x: CANDLE.x, y: CANDLE.y - 1, r: 34, k: 0.65 * flicker(this.flame * 1.9, 4), c: [1, 0.78, 0.48] },
      ...SCONCES.map((s, n) => ({ x: s.x, y: s.y - 2, r: 52, k: 0.75 * flicker(this.flame * 1.6, 5 + n), c: [1, 0.7, 0.4] as RGB })),
      ...LANTERNS.map((s, n) => ({ x: s.x, y: s.y + 2, r: 70, k: 0.9 * flicker(this.flame * 1.4, 8 + n), c: [1, 0.72, 0.42] as RGB })),
      ...FLOOR_CANDLES.filter((_, n) => n % 2 === 0).map((c, n) => ({ x: c.x + 1, y: c.y - 2, r: 22, k: 0.45 * flicker(this.flame * 2.1, 12 + n), c: [1, 0.74, 0.44] as RGB })),
      ...RUNES.map((r, n) => ({ x: r.x + 1, y: r.y + 1, r: 14, k: 0.25 * this.runeGlow(time, n), c: [0.7, 0.45, 1] as RGB })),
      { x: STONE.x, y: STONE.y, r: 34, k: 0.2 + lab.stone * 0.9, c: [1, 0.2, 0.25] },
      { x: (JAR.x0 + JAR.x1) / 2, y: F - 12, r: 24, k: 0.35 + 0.08 * Math.sin(time * 1.3), c: [0.4, 1, 0.6] },
    ];
    if (lab.glow > 0.02) out.push({ x: CIRCLE.x, y: CIRCLE.y, r: 60, k: lab.glow * 1.3, c: [0.7, 0.45, 1] });
    if (open("west", level)) {
      out.push({ x: ANNEX_LANTERNS.west.x, y: ANNEX_LANTERNS.west.y + 2, r: 56, k: 0.8 * flicker(this.flame * 1.4, 20), c: [1, 0.72, 0.42] });
      out.push({ x: LECTERN.x, y: LECTERN.top - 5, r: 22, k: 0.4 + 0.1 * Math.sin(time * 1.7), c: [0.75, 0.6, 1] });
      if (level >= 4) out.push({ x: (CAGE.x0 + CAGE.x1) / 2, y: F - 6, r: 30, k: 0.6 * flicker(this.flame * 2.4, 21) + (sim.time - lab.breath < 2 ? 1.2 : 0), c: [1, 0.45, 0.15] });
    }
    if (open("east", level)) {
      const hot = Math.max(0, 1 - (sim.time - lab.cast) / 8);
      out.push({ x: ANNEX_LANTERNS.east.x, y: ANNEX_LANTERNS.east.y + 2, r: 56, k: 0.8 * flicker(this.flame * 1.4, 22), c: [1, 0.72, 0.42] });
      out.push({ x: FURNACE.x0 + 6, y: F - 4, r: 40, k: 0.9 * flicker(this.flame * 1.8, 23), c: [1, 0.5, 0.18] });
      out.push({ x: FURNACE.x0 + 6, y: FURNACE.top - 4, r: 26, k: 0.5 + hot * 0.6, c: [1, 0.62, 0.2] });
      out.push({ x: ORRERY.x, y: ORRERY.y, r: 18, k: 0.3, c: [1, 0.85, 0.5] });
      if (level >= 5) out.push({ x: ORB.x, y: ORB.y, r: 46, k: 0.35 + lab.orb * 0.9, c: [0.45, 0.75, 1] });
    }
    return out;
  }
  /** How brightly rune `n` glows: each in its turn. */
  private runeGlow(time: number, n: number) {
    return 0.35 + 0.65 * Math.max(0, Math.sin(time * 0.5 + n * 1.6));
  }

  /** How lit a point in the lab is (0 to 1), for what is drawn over it. */
  lum(x: number, y: number) {
    const lx = Math.round(x) + HALL, ly = Math.min(LH - 1, Math.max(0, Math.round(y) - H));
    if (lx < 0 || lx >= LW) return 0.1;
    const i = ly * LW + lx;
    return Math.min(1, 0.3 + (this.light[i * 3] + this.light[i * 3 + 1]) * 0.4);
  }

  /** Whether any of rows `top` to `bottom` (world) are of the lab. */
  static visible(top: number, bottom: number) {
    return bottom > H && top < WORLD_H;
  }

  /** Lights the baked lab and draws it, with what moves in it, on `ctx`
   * (already in world pixels). Librarians are drawn after, by the caller,
   * then `drawOver`. */
  draw(ctx: CanvasRenderingContext2D, sim: LibrarySim, time: number, dt: number, effects: boolean) {
    if (sim.lab.level !== this.level) this.bake(sim.lab.level);
    this.clock = time;
    const L = this.light, base = this.base, kind = this.kind, px = this.px, sx = this.sx, sy = this.sy, relief = this.relief;
    for (let i = 0; i < LW * LH; i++) {
      const room = kind[i] !== Px.Earth;
      L[i * 3] = room ? 0.3 : 0.08;
      L[i * 3 + 1] = room ? 0.27 : 0.07;
      L[i * 3 + 2] = room ? 0.32 : 0.08;
    }
    for (const g of this.lights(sim, time)) {
      const cx = g.x + HALL, cy = g.y - H;
      const x0 = Math.max(0, Math.floor(cx - g.r)), x1 = Math.min(LW - 1, Math.ceil(cx + g.r));
      const y0 = Math.max(0, Math.floor(cy - g.r)), y1 = Math.min(LH - 1, Math.ceil(cy + g.r));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * LW + x;
          if (kind[i] === Px.Earth) continue;
          const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
          if (d >= g.r) continue;
          // The face of a stone that looks toward the light catches it.
          const v = (1 - d / g.r) * (1 - d / g.r) * g.k * (relief[i] ? facing(sx[i], sy[i], dx, dy, d) : 1);
          L[i * 3] += v * g.c[0];
          L[i * 3 + 1] += v * g.c[1];
          L[i * 3 + 2] += v * g.c[2];
        }
    }
    for (let i = 0; i < LW * LH; i++) {
      // Glass glows a little of itself.
      const own = kind[i] === Px.Glass ? 0.35 : 0;
      px[i] = 0xff000000 | (c255(base[i * 3 + 2] * (L[i * 3 + 2] + own)) << 16) | (c255(base[i * 3 + 1] * (L[i * 3 + 1] + own)) << 8) | c255(base[i * 3] * (L[i * 3] + own));
    }
    this.offCtx.putImageData(this.image, 0, 0);
    ctx.drawImage(this.off, -HALL, H);
    this.drawMoving(ctx, sim, time, dt, effects);
    this.drawAnnexes(ctx, sim, time);
    this.drawCat(ctx, sim, time, dt);
  }

  /** What goes over the researchers: the lights' glow, sparks and smoke. */
  drawOver(ctx: CanvasRenderingContext2D, sim: LibrarySim, time: number, dt: number, effects: boolean) {
    if (effects) this.drawGlow(ctx, sim, time);
    this.drawSparks(ctx, sim, dt);
  }

  private drawMoving(ctx: CanvasRenderingContext2D, sim: LibrarySim, time: number, dt: number, effects: boolean) {
    const lab = sim.lab, tick = Math.floor(time * 10);
    const dot = (x: number, y: number, c: string, w = 1, h = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    // The athanor's fire in its mouth, and the egg glowing in its window.
    const M = ATHANOR.mouth;
    for (let x = M.x0; x < M.x1; x++) {
      const h = Math.round((1 + lab.furnace * 4) * (0.5 + h01(x, tick, 41) * 0.7));
      for (let k = 0; k < h; k++) dot(x, F - 2 - k, k === 0 ? "#ffe8a0" : k < 2 ? "#ffad3a" : "#e2601c");
    }
    ctx.globalAlpha = 0.4 + lab.furnace * 0.5;
    dot(ATHANOR.egg.x - 1, ATHANOR.egg.y - 1, "#ffcf70", 3, 3);
    ctx.globalAlpha = 1;
    // The bellows squeezed while someone works them.
    const stoking = sim.librarians.some((l) => l.action === "stoke");
    if (stoking && Math.floor(time * 3) % 2) dot(83, F - 10, "#0b0908", 4, 1);
    // Coals under the alembic, the retort's brew, the receiver filling drop by drop.
    for (let x = BRAZIER.x - 3; x < BRAZIER.x + 3; x++) dot(x, BRAZIER.y - 1, h01(x, tick >> 1, 43) < 0.4 ? "#ffb040" : "#c04018");
    dot(BRAZIER.x - 2, BRAZIER.y - 5, h01(1, tick >> 2, 47) < 0.5 ? "#7ad0e0" : "#5ab0c8", 4, 2);
    const fill = Math.round(lab.still * (RECEIVER.bottom - RECEIVER.top));
    if (fill > 0) dot(RECEIVER.x0 + 1, RECEIVER.bottom - fill + 1, "#70c8f0", RECEIVER.x1 - RECEIVER.x0 - 1, fill);
    const drip = (time * 1.4) % 1;
    if (lab.furnace > 0.25) dot(RECEIVER.x0 + 2, RECEIVER.top - 3 + Math.round(drip * 4), "#a0e0ff");
    // The cauldron: its fire, its brew bubbling, steam off it.
    for (let x = CAULDRON.x0 + 4; x < CAULDRON.x0 + 11; x++) {
      const h = 1 + Math.round(h01(x, tick, 49) * 3);
      for (let k = 0; k < h; k++) dot(x, F - 3 - k, k === 0 ? "#ffd070" : "#ff7a2a");
    }
    const brew = ELIXIRS[lab.brew];
    dot(CAULDRON.x0 + 2, CAULDRON.top + 1, brew, CAULDRON.x1 - CAULDRON.x0 - 4, 1);
    for (let k = 0; k < 4; k++) {
      const p = (time * (0.8 + k * 0.3) + k * 0.37) % 1, bx = CAULDRON.x0 + 3 + ((k * 4 + Math.floor(time * 0.5 + k)) % (CAULDRON.x1 - CAULDRON.x0 - 6));
      if (p < 0.6) dot(bx, CAULDRON.top - Math.round(p * 2), brew);
    }
    if (effects) {
      ctx.globalAlpha = 0.25;
      for (let k = 0; k < 5; k++) {
        const p = (time * 0.35 + k / 5) % 1;
        dot(CAULDRON.x0 + 4 + ((k * 3) % 8) + Math.round(Math.sin(time + k) * 2), CAULDRON.top - 2 - Math.round(p * 22), brew, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    // Candles.
    for (const c of [CANDLE, ...SCONCES.map((s) => ({ x: s.x, y: s.y - 1 })), ...LANTERNS.map((l) => ({ x: l.x, y: l.y + 4 }))]) dot(c.x, c.y - 1 - (flicker(this.flame * 2, c.x) > 1 ? 1 : 0), flicker(this.flame * 2, c.x) > 0.95 ? "#ffe9a0" : "#ffb24a", 1, 1 + (flicker(this.flame * 2, c.x) > 1 ? 1 : 0));
    // The philosopher's stone, glowing as it has been fed.
    const pulse = 0.6 + 0.4 * Math.sin(time * 2.1);
    dot(STONE.x - 1, STONE.y, "#5a0a14", 3, 2);
    ctx.globalAlpha = Math.min(1, 0.3 + lab.stone * pulse);
    dot(STONE.x - 1, STONE.y, "#ff3a4a", 3, 2);
    dot(STONE.x, STONE.y - 1, "#ffb0b8");
    ctx.globalAlpha = 1;
    // The homunculus, bobbing in its jar, and bubbles rising past it.
    const J = JAR, bob = Math.round(Math.sin(time * 0.9) * 2), hx = (J.x0 + J.x1) / 2 - 1, hy = F - 14 + bob;
    dot(hx, hy, "#e8c8b0", 2, 2);
    dot(hx, hy + 2, "#d0a890", 2, 3);
    dot(hx - 1, hy + 3, "#d0a890");
    dot(hx + 2, hy + 3 + (Math.floor(time * 2) % 2), "#d0a890");
    if (Math.floor(time * 0.7) % 5 === 0) dot(hx + (sim.librarians.some((l) => l.action === "observe") ? 1 : 0), hy, "#200a0a");
    for (let k = 0; k < 3; k++) dot(J.x0 + 2 + k * 3, J.bottom - 1 - Math.round(((time * (0.4 + k * 0.15) + k * 0.3) % 1) * (J.bottom - J.top - 2)), "#a0f0c8");
    // The circle flaring: its rings traced in light, sparks off it.
    if (lab.glow > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = lab.glow;
      ctx.strokeStyle = "#c890ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(CIRCLE.x + 0.5, CIRCLE.y + 0.5, CIRCLE.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k <= 3; k++) {
        const t = -Math.PI / 2 + (k / 3) * Math.PI * 2;
        const x = CIRCLE.x + 0.5 + Math.cos(t + time * 0.3) * (CIRCLE.r - 3), y = CIRCLE.y + 0.5 + Math.sin(t + time * 0.3) * (CIRCLE.r - 3);
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      if (effects && this.fx() < lab.glow * 0.5) this.spark(CIRCLE.x + (this.fx() - 0.5) * CIRCLE.r * 2, CIRCLE.y + (this.fx() - 0.5) * CIRCLE.r * 2, "#e0c0ff");
    }
    // Sparks off a chant, and off a stone being fed.
    if (effects)
      for (const l of sim.librarians)
        if (l.action === "chant" && this.fx() < 0.3) this.spark(l.x + l.facing * 2, l.y - 7, this.fx() < 0.5 ? "#d0a0ff" : "#ffe08a");
    // The runes on the pilasters, glowing in turn.
    RUNES.forEach((r, n) => {
      ctx.globalAlpha = this.runeGlow(time, n);
      RUNE[n % RUNE.length].forEach((row, dy) => [...row].forEach((ch, dx) => ch === "#" && dot(r.x + dx, r.y + dy, "#c8a0ff")));
    });
    ctx.globalAlpha = 1;
    // The floor candles.
    FLOOR_CANDLES.forEach((c, n) => dot(c.x, c.y - 1, flicker(this.flame * 2.1, 12 + n) > 0.95 ? "#ffe9a0" : "#ffb24a"));
    // Soot and spilt brew by the cauldron after a mishap, till it's swept.
    if (lab.mess > 0.05) {
      ctx.globalAlpha = Math.min(1, lab.mess) * 0.8;
      for (let k = 0; k < 9; k++) dot(CAULDRON.x0 - 6 + Math.round(h01(k, 1, 71) * 22), F - (h01(k, 2, 71) < 0.7 ? 1 : 2), k % 3 ? "#1a1614" : ELIXIRS[lab.brew], 1 + (k % 2), 1);
      ctx.globalAlpha = 1;
    }
    // Embers off the fires, drifting up.
    if (effects && this.sparks.length < 70) {
      if (this.fx() < 0.06 + lab.furnace * 0.1) this.spark((ATHANOR.mouth.x0 + ATHANOR.mouth.x1) / 2 + (this.fx() - 0.5) * 6, F - 4, this.fx() < 0.5 ? "#ffb040" : "#ff7020", 1);
      if (this.fx() < 0.05) this.spark(CAULDRON.x0 + 5 + this.fx() * 6, F - 3, "#ffa040", 1);
      // Motes of the brew rising off the cauldron.
      if (this.fx() < 0.05) this.spark(CAULDRON.x0 + 3 + this.fx() * 10, CAULDRON.top - 1, ELIXIRS[lab.brew], 1);
    }
    // A spider letting itself down from its web, and climbing back.
    const sp = Math.max(0, Math.sin(time * 0.21)), sy = Math.round(ceiling(8) + 4 + sp * sp * 26);
    ctx.globalAlpha = 0.5;
    dot(8, Math.round(ceiling(8)) + 3, "#9a9aa0", 1, sy - Math.round(ceiling(8)) - 3);
    ctx.globalAlpha = 1;
    dot(7, sy, "#141014", 3, 2);
    if (Math.floor(time * 4) % 2) dot(6, sy + 1, "#141014");
    else dot(10, sy + 1, "#141014");
    // A drop off the vault now and then, splashing on the flags.
    const dp = (time * 0.37) % 1, dx = 150 + Math.round(h01(Math.floor(time * 0.37), 1, 73) * 30), top = ceiling(dx) + 3;
    if (dp < 0.6) dot(dx, Math.round(top + Math.min(1, (dp / 0.6) * (dp / 0.6)) * (F - 1 - top)), "#8ab8d8");
    else if (dp < 0.7) {
      dot(dx - 1, F - 2, "#8ab8d8");
      dot(dx + 1, F - 2, "#8ab8d8");
    }
  }

  /** Smoke and sparks, drawn over the researchers. */
  private drawSparks(ctx: CanvasRenderingContext2D, sim: LibrarySim, dt: number) {
    const lab = sim.lab;
    const dot = (x: number, y: number, c: string, w = 1, h = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    // Clouds of smoke: a brew poured, a distillate placed, a brew gone wrong.
    for (const p of lab.puffs) {
      const age = sim.time - p.at, life = p.big ? 5 : 2.5;
      if (age < 0 || age > life) continue;
      const a = 1 - age / life, c = ELIXIRS[p.color];
      ctx.globalAlpha = a * (p.big ? 0.55 : 0.4);
      const n = p.big ? 14 : 5;
      for (let k = 0; k < n; k++) {
        const ang = h01(k, Math.floor(p.at * 10), 53) * Math.PI * 2, spread = (p.big ? 4 + age * 5 : 1 + age * 2) * (0.5 + h01(k, 3, 53) * 0.5);
        const s = p.big ? 2 + Math.round(age * 1.2) : 1 + Math.round(age);
        dot(Math.round(p.x + Math.cos(ang) * spread), Math.round((Math.abs(p.x - CIRCLE.x) < 12 ? STONE.y - 2 : CAULDRON.top - 2) - age * (p.big ? 4 : 6) + Math.sin(ang) * spread * 0.6), c, s, s);
      }
      ctx.globalAlpha = 1;
    }
    this.sparks = this.sparks.filter((s) => {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.up) s.vx += (this.fx() - 0.5) * 6 * dt;
      if (s.life <= 0) return false;
      ctx.globalAlpha = Math.min(1, s.life * 2);
      dot(Math.round(s.x), Math.round(s.y), s.color);
      return true;
    });
    ctx.globalAlpha = 1;
  }
  /** What moves in the annexes: the mandrakes' leaves, the floating
   * grimoire, the salamander, the crucible's melt and its gold, the orrery's
   * planets and the orb. */
  private drawAnnexes(ctx: CanvasRenderingContext2D, sim: LibrarySim, time: number) {
    const lab = sim.lab, level = lab.level;
    const dot = (x: number, y: number, c: string, w = 1, h = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    const doing = (act: string) => sim.librarians.find((l) => l.action === act && l.y > H);
    const lanterns = (["west", "east"] as const).filter((s) => open(s, level)).map((s) => ANNEX_LANTERNS[s]);
    for (const l of lanterns) {
      // Hanging lanterns, as in the cellar.
      ctx.fillStyle = "#3a383c";
      ctx.fillRect(l.x, ANNEX_TOP + 2, 1, l.y - ANNEX_TOP - 2);
      dot(l.x - 2, l.y, "#323034", 5, 1);
      dot(l.x - 2, l.y + 5, "#323034", 5, 1);
      dot(l.x - 2, l.y + 1, "#323034", 1, 4);
      dot(l.x + 2, l.y + 1, "#323034", 1, 4);
      dot(l.x - 1, l.y + 1, "#e8c070", 3, 4);
      dot(l.x, l.y + 3 - (flicker(this.flame * 2, l.x) > 1 ? 1 : 0), "#fff0b0");
    }
    if (open("west", level)) {
      // The mandrakes' leaves, swaying; a gap where one has been pulled.
      const pulling = doing("pull");
      [GARDEN.x0, GARDEN.x0 + 4, GARDEN.x0 + 8].forEach((px, n) => {
        if (pulling && n === 2) return;
        const sw = Math.round(Math.sin(time * 1.3 + n * 2) * 0.6);
        dot(px + sw, GARDEN.top - 5, "#5a9a40");
        dot(px + 2 + sw, GARDEN.top - 5, "#5a9a40");
        dot(px + 1, GARDEN.top - 4, "#78b850");
        dot(px + 1 + sw, GARDEN.top - 6, "#78b850");
      });
      // Its shriek: rings off the pulled root.
      const age = sim.time - lab.shriek;
      if (age >= 0 && age < 2.2) {
        ctx.strokeStyle = "#f0e8c8";
        ctx.lineWidth = 0.5;
        for (let k = 0; k < 3; k++) {
          const r = 3 + ((age * 9 + k * 4) % 12);
          ctx.globalAlpha = Math.max(0, 1 - r / 15) * 0.8;
          ctx.beginPath();
          ctx.arc(GARDEN.x0 + 9, F - 12, r, Math.PI * 0.7, Math.PI * 1.3);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(GARDEN.x0 + 9, F - 12, r, -Math.PI * 0.3, Math.PI * 0.3);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // The grimoire floating over the lectern, its pages turning, glowing.
      const L = LECTERN, by = L.top - 6 + Math.round(Math.sin(time * 1.4) * 1.2), reading = doing("recite");
      dot(L.x - 3, by + 1, "#5a2018", 7, 1);
      dot(L.x - 3, by, "#efe6cc", 3, 1);
      dot(L.x + 1, by, "#e2d6b4", 3, 1);
      dot(L.x, by, "#3a1410", 1, 2);
      if (reading && Math.floor(time * 1.5) % 3 === 0) dot(L.x + 1, by - 1, "#efe6cc", 2, 1);
      if (reading && this.fx() < 0.08) this.spark(L.x + (this.fx() - 0.5) * 6, by - 1, this.fx() < 0.5 ? "#d8c0ff" : "#ffe8a0", 1);
      if (level >= 4) {
        // The salamander padding about its coals, its tail aflame; fed, it breathes fire.
        const C = CAGE, walk = (Math.sin(time * 0.4) + 1) / 2, sx = Math.round(C.x0 + 2 + walk * (C.x1 - C.x0 - 7)), dir = Math.cos(time * 0.4) > 0 ? 1 : -1;
        dot(sx, F - 7, "#d84a1a", 4, 1);
        dot(dir > 0 ? sx + 4 : sx - 1, F - 8, "#e86a2a", 1, 1);
        dot(dir > 0 ? sx + 4 : sx - 1, F - 7, "#e86a2a", 1, 1);
        dot(dir > 0 ? sx + 4 : sx - 1, F - 8, "#ffe060");
        dot(sx + (Math.floor(time * 4) % 2), F - 6, "#a83010", 1, 1);
        dot(sx + 2 + (Math.floor(time * 4 + 1) % 2), F - 6, "#a83010", 1, 1);
        const tail = dir > 0 ? sx - 1 : sx + 4, fl = flicker(this.flame * 3, 31);
        dot(tail, F - 8 - (fl > 1 ? 1 : 0), "#ffb040", 1, 1 + (fl > 1 ? 1 : 0));
        const age2 = sim.time - lab.breath;
        if (age2 >= 0 && age2 < 1.6) {
          // A jet of flame out through the bars, toward whoever fed it.
          const len = Math.round(Math.min(1, age2 * 3) * 12 * (1 - Math.max(0, age2 - 1.2) / 0.4));
          for (let k = 0; k < len; k++) dot(C.x0 + 1 - k, F - 8 + Math.round(Math.sin(k + time * 20) * 0.6), k < len * 0.3 ? "#fff0b0" : k < len * 0.7 ? "#ffad3a" : "#e2601c");
        }
      }
    }
    if (open("east", level)) {
      const U = FURNACE, hot = Math.max(0, 1 - (sim.time - lab.cast) / 8);
      // Fire in the firebox; the melt in the crucible.
      for (let x = U.x0 + 3; x < U.x0 + 9; x++) {
        const h = 1 + Math.round(h01(x, Math.floor(time * 10), 75) * 3);
        for (let k = 0; k < h; k++) dot(x, F - 2 - k, k === 0 ? "#ffe8a0" : "#ff8a2a");
      }
      dot(U.x0 + 4, U.top - 3, h01(1, Math.floor(time * 3), 77) < 0.5 ? "#ffb040" : "#ffd070", 4, 1);
      // Being poured into the mould.
      if (doing("cast")) {
        dot(U.x1, U.top - 2, "#ffcf50");
        for (let y = U.top - 1; y < F - 2; y++) dot(U.x1 + 1, y, (y + Math.floor(time * 12)) % 3 ? "#ffb030" : "#fff0a0");
      }
      // The bars cast so far, stacked on the floor; the newest cooling from red to gold.
      const bars = Math.min(6, lab.casts);
      for (let k = 0; k < bars; k++) {
        const newest = k === bars - 1, bx = U.x1 + 2, by = F - 1 - k;
        const c = newest && hot > 0.4 ? (hot > 0.75 ? "#ff6a2a" : "#ffa040") : k % 2 ? "#e8b830" : "#d0a020";
        dot(bx - (k % 2), by, c, 4, 1);
        if (newest && hot < 0.4 && Math.floor(time * 2) % 4 === 0) dot(bx + 1, by - 1, "#fff8d0");
      }
      // The orrery: the planets wheeling round their sun at the speed it was wound.
      const O = ORRERY;
      this.orreryAngle += 0.016 * (0.2 + this.speedOf(lab.orrery) * 2);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = "#b08a40";
      ctx.lineWidth = 0.5;
      for (const r of [3, 5, 7]) {
        ctx.beginPath();
        ctx.ellipse(O.x + 0.5, O.y + 0.5, r, r * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      dot(O.x - 1, O.y, "#ffd860", 3, 1);
      dot(O.x, O.y - 1, "#ffd860", 1, 3);
      [[3, 3.1, "#c0c0d0"], [5, 1.7, "#4a8ad8"], [7, 1, "#d84a3a"]].forEach(([r, w, c]) => {
        const t = this.orreryAngle * (w as number);
        dot(Math.round(O.x + Math.cos(t) * (r as number)), Math.round(O.y + Math.sin(t) * (r as number) * 0.35), c as string);
      });
      if (level >= 5) {
        // The orb, floating over its tripod, swirling with what it shows.
        const oy = ORB.y + Math.round(Math.sin(time * 1.1) * 1), k = 0.35 + lab.orb * 0.65;
        ctx.fillStyle = "#1a2848";
        ctx.beginPath();
        ctx.arc(ORB.x + 0.5, oy + 0.5, 3.5, 0, Math.PI * 2);
        ctx.fill();
        for (let n = 0; n < 4; n++) {
          const t = time * (1.2 + n * 0.4) + n * 1.7;
          ctx.globalAlpha = k;
          dot(Math.round(ORB.x + Math.cos(t) * 2), Math.round(oy + Math.sin(t * 1.3) * 2), ["#80c0ff", "#c890ff", "#a0ffe0", "#ffffff"][n]);
        }
        ctx.globalAlpha = 1;
        dot(ORB.x - 2, oy - 2, "#e0f0ff");
      }
    }
  }
  private speedOf(v: number) {
    return v * v;
  }

  /** The lab's black cat, its own master: it wanders, sits, washes, stretches
   * and sleeps (by the athanor when it's warm), and keeps clear of the
   * researchers' feet. Presentation only. */
  private drawCat(ctx: CanvasRenderingContext2D, sim: LibrarySim, time: number, dt: number) {
    const c = this.cat, r = this.fx, level = sim.lab.level;
    const x0 = open("west", level) ? ANNEXES.west.x0 + 4 : ROOM.x0 + 16, x1 = open("east", level) ? ANNEXES.east.x1 - 4 : ROOM.x1 - 8;
    if (time >= c.until) {
      if (c.act === "walk" && Math.abs(c.x - c.to) > 0.5) c.until = time + 0.5;
      else {
        const roll = r();
        if (roll < 0.4) {
          c.act = "walk";
          c.to = sim.lab.furnace > 0.6 && r() < 0.4 ? 88 : x0 + r() * (x1 - x0);
          c.until = time + 30;
        } else if (roll < 0.6) [c.act, c.until] = ["sit", time + 4 + r() * 8];
        else if (roll < 0.75) [c.act, c.until] = ["groom", time + 3 + r() * 4];
        else if (roll < 0.85) [c.act, c.until] = ["stretch", time + 1.5];
        else [c.act, c.until] = ["sleep", time + 15 + r() * 25];
      }
    }
    if (c.act === "walk") {
      const d = c.to - c.x, go = 9 * dt;
      if (d) c.facing = Math.sign(d);
      if (Math.abs(d) <= go) {
        c.x = c.to;
        c.until = time;
      } else c.x += go * c.facing;
    }
    const x = Math.round(c.x), f = c.facing, k = this.lum(x, F - 2), dot = (dx: number, dy: number, w = 1, h = 1) => ctx.fillRect(f > 0 ? x + dx : x - dx - w + 1, F + dy, w, h);
    ctx.fillStyle = `rgb(${Math.round(46 * (0.5 + k))},${Math.round(42 * (0.5 + k))},${Math.round(54 * (0.5 + k))})`;
    const step = c.act === "walk" && Math.floor(time * 8) % 2;
    if (c.act === "sleep") {
      // Curled up, breathing, its tail round it.
      dot(-2, -2, 5, 2);
      dot(2, -3, 2, 1);
      dot(-3, -1, 1, 1);
      if (Math.floor(time * 0.8) % 2) dot(-1, -3, 2, 1);
    } else if (c.act === "sit" || c.act === "groom") {
      dot(-1, -4, 3, 4);
      dot(1, -6, 2, 2);
      dot(1, -7);
      dot(2, -7);
      const sw = Math.round(Math.sin(time * 2) * 1);
      dot(-2, -1 + Math.min(0, sw), 1, 1);
      dot(-3, -2 + sw, 1, 1);
      if (c.act === "groom" && Math.floor(time * 3) % 2) dot(2, -5);
    } else {
      // Walking (or stretching, front low and tail high).
      const low = c.act === "stretch" ? 1 : 0;
      dot(-2, -3, 5, 2);
      dot(2, -5 + low, 2, 2);
      dot(2, -6 + low);
      dot(3, -6 + low);
      dot(-2, -1, 1, 1);
      dot(2, -1, 1, 1);
      if (step) dot(0, -1, 1, 1);
      dot(-3, -4 - low, 1, 1);
      dot(-4, -5 - low, 1, 1);
    }
    if (c.act !== "sleep") {
      // Eyes that catch the light.
      ctx.fillStyle = "#e8d040";
      dot(c.act === "sit" || c.act === "groom" ? 2 : 3, c.act === "sit" || c.act === "groom" ? -6 : c.act === "stretch" ? -4 : -5);
    }
  }

  /** A glow sprite in colour `c` (cached). */
  private glowOf(c: string) {
    let g = this.glows.get(c);
    if (g) return g;
    g = document.createElement("canvas");
    g.width = g.height = 32;
    const x = g.getContext("2d")!, grad = x.createRadialGradient(16, 16, 0, 16, 16, 16), [r, gg, b] = hex(c);
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.85)`);
    grad.addColorStop(0.35, `rgba(${r},${gg},${b},0.28)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 32, 32);
    this.glows.set(c, g);
    return g;
  }
  /** Soft light round the flames, the brew, the stone, the jar, the runes and
   * the annexes' marvels. */
  private drawGlow(ctx: CanvasRenderingContext2D, sim: LibrarySim, time: number) {
    const lab = sim.lab, level = lab.level;
    const glow = (x: number, y: number, r: number, c: string, a: number) => {
      if (a <= 0.01) return;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(this.glowOf(c), x + 0.5 - r, y + 0.5 - r, r * 2, r * 2);
    };
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glow((ATHANOR.mouth.x0 + ATHANOR.mouth.x1) / 2, F - 3, 12, "#ff8a30", (0.35 + lab.furnace * 0.45) * flicker(this.flame * 1.3, 1));
    glow(ATHANOR.egg.x, ATHANOR.egg.y, 6, "#ffc060", 0.3 + lab.furnace * 0.4);
    glow(BRAZIER.x, BRAZIER.y - 1, 7, "#ff8030", 0.45 * flicker(this.flame * 1.7, 2));
    glow(BRAZIER.x, BRAZIER.y - 5, 6, "#70d0f0", 0.25);
    glow((CAULDRON.x0 + CAULDRON.x1) / 2, F - 3, 9, "#ff8030", 0.45 * flicker(this.flame * 1.5, 3));
    glow((CAULDRON.x0 + CAULDRON.x1) / 2, CAULDRON.top, 10, ELIXIRS[lab.brew], 0.45 + 0.1 * Math.sin(time * 2));
    glow(CANDLE.x, CANDLE.y - 1, 6, "#ffc070", 0.4 * flicker(this.flame * 1.9, 4));
    for (const [n, s] of SCONCES.entries()) glow(s.x, s.y - 2, 9, "#ffb060", 0.45 * flicker(this.flame * 1.6, 5 + n));
    for (const [n, l] of LANTERNS.entries()) glow(l.x, l.y + 3, 11, "#ffc070", 0.5 * flicker(this.flame * 1.4, 8 + n));
    for (const [n, c] of FLOOR_CANDLES.entries()) glow(c.x, c.y - 1, 5, "#ffc070", 0.35 * flicker(this.flame * 2.1, 12 + n));
    RUNES.forEach((r, n) => glow(r.x + 1, r.y + 1, 6, "#b080ff", 0.4 * this.runeGlow(time, n)));
    glow(STONE.x, STONE.y, 8 + lab.stone * 6, "#ff3040", 0.3 + lab.stone * 0.5 * (0.6 + 0.4 * Math.sin(time * 2.1)));
    glow((JAR.x0 + JAR.x1) / 2, F - 12, 10, "#60ffa0", 0.3 + 0.08 * Math.sin(time * 1.3));
    glow(RECEIVER.x0 + 2, RECEIVER.bottom - 1, 4, "#70c8f0", lab.still * 0.4);
    if (lab.glow > 0.02) glow(CIRCLE.x, CIRCLE.y, CIRCLE.r + 10, "#b080ff", lab.glow * 0.6);
    if (open("west", level)) {
      glow(ANNEX_LANTERNS.west.x, ANNEX_LANTERNS.west.y + 3, 11, "#ffc070", 0.5 * flicker(this.flame * 1.4, 20));
      glow(LECTERN.x, LECTERN.top - 6, 8, "#c8a8ff", 0.35 + 0.15 * Math.sin(time * 1.7));
      if (level >= 4) glow((CAGE.x0 + CAGE.x1) / 2, F - 6, sim.time - lab.breath < 1.6 ? 18 : 8, "#ff7a2a", (sim.time - lab.breath < 1.6 ? 0.8 : 0.4) * flicker(this.flame * 2.4, 21));
    }
    if (open("east", level)) {
      const hot = Math.max(0, 1 - (sim.time - lab.cast) / 8);
      glow(ANNEX_LANTERNS.east.x, ANNEX_LANTERNS.east.y + 3, 11, "#ffc070", 0.5 * flicker(this.flame * 1.4, 22));
      glow(FURNACE.x0 + 6, F - 3, 9, "#ff8030", 0.5 * flicker(this.flame * 1.8, 23));
      glow(FURNACE.x0 + 6, FURNACE.top - 3, 7, "#ffb040", 0.35 + hot * 0.4);
      if (hot > 0) glow(FURNACE.x1 + 2, F - Math.min(6, lab.casts), 6, "#ff9040", hot * 0.6);
      glow(ORRERY.x, ORRERY.y, 5, "#ffd860", 0.4);
      if (level >= 5) glow(ORB.x, ORB.y, 9 + lab.orb * 12, "#80b8ff", 0.35 + lab.orb * 0.5);
    }
    // A researcher drinking, floating or gazing glows with it.
    for (const l of sim.librarians) {
      if (l.y <= H) continue;
      if (l.action === "float") glow(l.x, l.y - 4, 7, ELIXIRS[l.vial] || "#c890ff", 0.5);
      if (l.action === "scry") glow(l.x, l.y - 4, 5, "#80b8ff", 0.3);
      if (l.action === "chant") glow(l.x, l.y - 6, 5, "#c890ff", 0.3);
    }
    ctx.restore();
  }

  /** A spark flying off (or, `up`, an ember or mote drifting up slowly). */
  private spark(x: number, y: number, color: string, up = 0) {
    if (this.sparks.length >= 80) return;
    if (up) this.sparks.push({ x, y, vx: (this.fx() - 0.5) * 2, vy: -3 - this.fx() * 5, life: 1.5 + this.fx() * 2, color, up: 1 });
    else this.sparks.push({ x, y, vx: (this.fx() - 0.5) * 8, vy: -4 - this.fx() * 8, life: 0.6 + this.fx() * 0.8, color });
  }
}
