/** Draws the alchemy lab under the nave: a vaulted brick cellar, baked once
 * as pixel art and lit per pixel each frame by its fires (the athanor's
 * mouth, the brazier under the alembic, the fire under the cauldron), its
 * candles, the philosopher's stone and, when it flares, the transmutation
 * circle on the wall. Over it go what moves: flames, coals, the cauldron's
 * bubbles and steam in the colour of its brew, drips into the alembic's
 * receiver, the bellows when worked, the homunculus bobbing in its jar,
 * sparks off a chant and clouds of coloured smoke.
 *
 * The picture runs the width of the nave and its hallways, from the bottom
 * of the nave's floor (`H`) to the bottom of the lab's (`WORLD_H`); outside
 * the cellar's walls is earth. A ladder comes down from a trapdoor in the
 * nave's floor at `STAIR_X`. */
import { HALL, H, LAB_FLOOR, LAB_TOP, STAIR_X, W, WORLD_H } from "./geometry.ts";
import { ELIXIRS } from "./lab.ts";
import type { LibrarySim } from "./sim.ts";
import { stream } from "../random.ts";

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
const inRoom = (x: number, y: number) => x >= ROOM.x0 && x < ROOM.x1 && y < LAB_FLOOR && y >= ceiling(x);

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

function h01(a: number, b: number, c = 0) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const c255 = (v: number) => (v >= 255 ? 255 : v <= 0 ? 0 : v | 0);
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const flicker = (t: number, n: number) => 0.88 + 0.08 * Math.sin(t * 2.3 + n * 1.7) + 0.06 * Math.sin(t * 9.1 + n * 4.3) + 0.03 * Math.sin(t * 23 + n);

type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export class LabRenderer {
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private image: ImageData;
  private px: Uint32Array;
  private base = new Float32Array(LW * LH * 3);
  private kind = new Uint8Array(LW * LH);
  private light = new Float32Array(LW * LH * 3);
  private sparks: Spark[] = [];
  private fx = stream("effects");

  constructor() {
    this.off = document.createElement("canvas");
    this.off.width = LW;
    this.off.height = LH;
    this.offCtx = this.off.getContext("2d")!;
    this.image = this.offCtx.createImageData(LW, LH);
    this.px = new Uint32Array(this.image.data.buffer);
    this.bake();
  }

  // ── Baked once ──────────────────────────────────────────────────────

  private put(x: number, y: number, c: RGB, kind = Px.Room) {
    const lx = Math.round(x) + HALL, ly = Math.round(y) - H;
    if (lx < 0 || lx >= LW || ly < 0 || ly >= LH) return;
    const i = ly * LW + lx;
    this.base[i * 3] = c[0];
    this.base[i * 3 + 1] = c[1];
    this.base[i * 3 + 2] = c[2];
    this.kind[i] = kind;
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

  private bake() {
    // Earth all round, the cellar's masonry, its brick back wall, its vaults and its floor.
    for (let ly = 0; ly < LH; ly++)
      for (let lx = 0; lx < LW; lx++) {
        const x = lx - HALL, y = ly + H, i = ly * LW + lx;
        let c: RGB, kind = Px.Earth;
        const n = h01(x, y, 3);
        if (inRoom(x, y)) {
          kind = Px.Room;
          const pilaster = (x >= 63 && x < 69) || (x >= 123 && x < 129);
          if (pilaster) {
            const course = Math.floor((F - y) / 7), edge = (F - y) % 7 === 0 || x === 63 || x === 68 || x === 123 || x === 128;
            const t = 0.85 + h01(course, x >> 3, 5) * 0.25;
            c = edge ? [34, 30, 28] : [88 * t, 82 * t, 76 * t];
          } else {
            // Brick, course on course, each brick its own shade, darker low down.
            const course = Math.floor((F - y) / 4), off = course % 2 ? 4 : 0, bx = Math.floor((x + off) / 8);
            const mortar = (F - y) % 4 === 0 || (x + off) % 8 === 0;
            const t = (0.7 + h01(bx, course, 7) * 0.35) * (0.92 + n * 0.12) * (0.85 + (1 - (F - y) / 110) * 0.2);
            c = mortar ? [30, 26, 24] : [98 * t, 70 * t, 58 * t];
          }
        } else if (x >= ROOM.x0 - 6 && x < ROOM.x1 + 6 && y >= LAB_TOP - 6 && y < F) {
          // The cellar's masonry: big dressed blocks round the room.
          const course = Math.floor(y / 6), off = course % 2 ? 6 : 0, bx = Math.floor((x + 64 + off) / 12);
          const edge = y % 6 === 0 || (x + 64 + off) % 12 === 0;
          const t = 0.7 + h01(bx, course, 9) * 0.3;
          c = edge ? [22, 20, 20] : [64 * t, 60 * t, 56 * t];
        } else if (y >= F) {
          if (x >= ROOM.x0 - 6 && x < ROOM.x1 + 6) {
            kind = Px.Room;
            const row = Math.floor((y - F) / 5), tx = Math.floor((x + (row % 2) * 6) / 12);
            const edge = (y - F) % 5 === 0 || (x + (row % 2) * 6) % 12 === 0;
            const t = 0.78 + h01(tx, row, 11) * 0.3;
            c = edge ? [28, 26, 24] : [76 * t, 70 * t, 66 * t];
          } else c = [30 * (0.8 + n * 0.4), 23 * (0.8 + n * 0.4), 18 * (0.8 + n * 0.4)];
        } else {
          // Packed earth with stones in it.
          const stone = h01(x >> 2, y >> 2, 13) < 0.12;
          const t = 0.75 + n * 0.45;
          c = stone ? [58 * t, 54 * t, 50 * t] : [36 * t, 27 * t, 20 * t];
        }
        // The vault's ribs: voussoirs along each arch's edge.
        if (kind === Px.Room && y < F && y - ceiling(x) < 3) {
          const t = 0.85 + h01(x >> 2, 1, 15) * 0.2;
          c = (x >> 2) % 2 && y - ceiling(x) < 1 ? [40, 36, 34] : [84 * t, 78 * t, 72 * t];
        }
        this.base[i * 3] = c[0];
        this.base[i * 3 + 1] = c[1];
        this.base[i * 3 + 2] = c[2];
        this.kind[i] = kind;
      }
    this.bakeStair();
    this.bakeWall();
    this.bakeApparatus();
  }

  /** The shaft and ladder down from the nave's trapdoor. */
  private bakeStair() {
    for (let y = H; y < F; y++) {
      for (let x = STAIR_X - 4; x <= STAIR_X + 4; x++) if (!inRoom(x, y)) this.put(x, y, [12, 10, 10]);
      this.put(STAIR_X - 2, y, [150, 106, 58]);
      this.put(STAIR_X + 1, y, [150, 106, 58]);
      if (y % 3 === 0) for (let x = STAIR_X - 1; x <= STAIR_X; x++) this.put(x, y, [124, 86, 46]);
    }
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

  // ── Each frame ──────────────────────────────────────────────────────

  /** The lab's lights this frame: where, how far, how bright, what colour. */
  private lights(sim: LibrarySim, time: number) {
    const lab = sim.lab, brew = hex(ELIXIRS[lab.brew]);
    const out: { x: number; y: number; r: number; k: number; c: RGB }[] = [
      { x: (ATHANOR.mouth.x0 + ATHANOR.mouth.x1) / 2, y: F - 5, r: 64, k: (0.5 + lab.furnace * 1.1) * flicker(time * 1.3, 1), c: [1, 0.55, 0.25] },
      { x: ATHANOR.egg.x, y: ATHANOR.egg.y, r: 18, k: 0.3 + lab.furnace * 0.4, c: [1, 0.7, 0.3] },
      { x: BRAZIER.x, y: BRAZIER.y - 1, r: 28, k: 0.6 * flicker(time * 1.7, 2), c: [1, 0.5, 0.2] },
      { x: (CAULDRON.x0 + CAULDRON.x1) / 2, y: F - 2, r: 38, k: 0.8 * flicker(time * 1.5, 3), c: [1, 0.55, 0.25] },
      { x: (CAULDRON.x0 + CAULDRON.x1) / 2, y: CAULDRON.top - 1, r: 26, k: 0.45, c: [brew[0] / 255, brew[1] / 255, brew[2] / 255] },
      { x: CANDLE.x, y: CANDLE.y - 1, r: 34, k: 0.65 * flicker(time * 1.9, 4), c: [1, 0.78, 0.48] },
      ...SCONCES.map((s, n) => ({ x: s.x, y: s.y - 2, r: 52, k: 0.75 * flicker(time * 1.6, 5 + n), c: [1, 0.7, 0.4] as RGB })),
      ...LANTERNS.map((s, n) => ({ x: s.x, y: s.y + 2, r: 70, k: 0.9 * flicker(time * 1.4, 8 + n), c: [1, 0.72, 0.42] as RGB })),
      { x: STONE.x, y: STONE.y, r: 34, k: 0.2 + lab.stone * 0.9, c: [1, 0.2, 0.25] },
      { x: (JAR.x0 + JAR.x1) / 2, y: F - 12, r: 24, k: 0.35 + 0.08 * Math.sin(time * 1.3), c: [0.4, 1, 0.6] },
    ];
    if (lab.glow > 0.02) out.push({ x: CIRCLE.x, y: CIRCLE.y, r: 60, k: lab.glow * 1.3, c: [0.7, 0.45, 1] });
    return out;
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
   * (already in world pixels). Librarians are drawn after, by the caller. */
  draw(ctx: CanvasRenderingContext2D, sim: LibrarySim, time: number, dt: number, effects: boolean) {
    const L = this.light, base = this.base, kind = this.kind, px = this.px;
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
          const v = (1 - d / g.r) * (1 - d / g.r) * g.k;
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
    for (const c of [CANDLE, ...SCONCES.map((s) => ({ x: s.x, y: s.y - 1 })), ...LANTERNS.map((l) => ({ x: l.x, y: l.y + 4 }))]) dot(c.x, c.y - 1 - (flicker(time * 2, c.x) > 1 ? 1 : 0), flicker(time * 2, c.x) > 0.95 ? "#ffe9a0" : "#ffb24a", 1, 1 + (flicker(time * 2, c.x) > 1 ? 1 : 0));
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
      if (s.life <= 0) return false;
      ctx.globalAlpha = Math.min(1, s.life * 2);
      dot(Math.round(s.x), Math.round(s.y), s.color);
      return true;
    });
    ctx.globalAlpha = 1;
  }
  private spark(x: number, y: number, color: string) {
    if (this.sparks.length < 80) this.sparks.push({ x, y, vx: (this.fx() - 0.5) * 8, vy: -4 - this.fx() * 8, life: 0.6 + this.fx() * 0.8, color });
  }
}
