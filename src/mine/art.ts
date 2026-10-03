/** The Mine's surface structures as pixel art at two pixels a cell, the same
 * size as the miners' and the world's pixels: the buildings' front walls
 * (boards with their joints and nails, or ashlar courses with mortar), their
 * back walls, frames, doors, windows and roofs (tiles, slates or boards,
 * course by course, with a ridge and eaves), the forge's brick chimney, the
 * headframe with its spoked wheel, and the graves. Each piece is painted
 * once into a small canvas (`Sprites`) and kept, with a copy for each step
 * of the light it is drawn in. */
import type { Building } from "./buildings.ts";
import { hash01 } from "./world.ts";

export type RGB = [number, number, number];

/** A grid of pixels to paint, two to a cell; clear where nothing is set. */
export class Pixels {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: RGB, k = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = ((y | 0) * this.w + (x | 0)) * 4;
    this.data[i] = c[0] * k;
    this.data[i + 1] = c[1] * k;
    this.data[i + 2] = c[2] * k;
    this.data[i + 3] = 255;
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, k = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, k);
  }
}

/** Painted pieces, kept by name, each with a copy per step of light. */
export class Sprites {
  private baked = new Map<string, { art: Pixels; lit: Map<number, HTMLCanvasElement> }>();
  /** The piece `key` (`w` × `h` pixels, painted by `paint` the first time)
   * dimmed to the light `k`. */
  get(key: string, w: number, h: number, paint: (p: Pixels) => void, k: number) {
    let entry = this.baked.get(key);
    if (!entry) {
      if (this.baked.size > 80) this.baked.clear();
      const art = new Pixels(Math.max(1, w), Math.max(1, h));
      paint(art);
      entry = { art, lit: new Map() };
      this.baked.set(key, entry);
    }
    const step = Math.max(1, Math.min(24, Math.round(k * 24)));
    let canvas = entry.lit.get(step);
    if (!canvas) {
      const { art } = entry, kk = step / 24;
      canvas = document.createElement("canvas");
      canvas.width = art.w;
      canvas.height = art.h;
      const g = canvas.getContext("2d")!, image = g.createImageData(art.w, art.h);
      for (let i = 0; i < art.data.length; i += 4) {
        image.data[i] = art.data[i] * kk;
        image.data[i + 1] = art.data[i + 1] * kk;
        image.data[i + 2] = art.data[i + 2] * kk;
        image.data[i + 3] = art.data[i + 3];
      }
      g.putImageData(image, 0, 0);
      entry.lit.set(step, canvas);
    }
    return canvas;
  }
}

// ── Materials ─────────────────────────────────────────────────────────

export const PLANK: RGB[] = [[138, 90, 44], [120, 78, 38]];
export const POST: RGB = [86, 54, 26];
export const ASHLAR: RGB[] = [[118, 112, 104], [98, 94, 90]];
const PLANK_HI: RGB = [158, 106, 54], PLANK_LO: RGB = [100, 64, 30], SEAM: RGB = [60, 38, 18], NAIL: RGB = [44, 40, 40];
const POST_HI: RGB = [110, 72, 36], POST_LO: RGB = [64, 40, 18];
const MORTAR: RGB = [74, 70, 66], STONE_HI: RGB = [140, 134, 124], STONE_LO: RGB = [80, 76, 72];
const BACK_BOARD: RGB[] = [[66, 45, 28], [58, 39, 24]], BACK_SEAM: RGB = [38, 25, 15];
const BACK_STONE: RGB[] = [[58, 56, 60], [52, 50, 54]], BACK_MORTAR: RGB = [36, 35, 38];
const TILE: RGB[] = [[170, 62, 40], [150, 52, 34]], TILE_LO: RGB = [104, 36, 24];
const SLATE: RGB[] = [[88, 90, 104], [76, 78, 92]], SLATE_LO: RGB = [50, 52, 62];
const SHINGLE: RGB[] = [[132, 88, 46], [116, 76, 40]], SHINGLE_LO: RGB = [78, 50, 26];
const RIDGE: RGB = [70, 44, 24], EAVE: RGB = [40, 26, 14];
const BRICK: RGB[] = [[138, 70, 52], [120, 60, 46]], BRICK_MORTAR: RGB = [90, 82, 76];
const DOOR: RGB[] = [[96, 60, 30], [82, 50, 24]], DOOR_FRAME: RGB = [52, 32, 18], BRASS: RGB = [214, 176, 90], DARK: RGB = [24, 18, 14];
export const GLASS: RGB = [44, 38, 32];
const WOOD: RGB = [132, 88, 44], WOOD_LO: RGB = [92, 58, 28], WOOD_HI: RGB = [160, 112, 60];
const IRON: RGB = [154, 158, 166], IRON_LO: RGB = [96, 98, 108], IRON_DK: RGB = [58, 58, 66];
const HEADSTONE: RGB = [136, 134, 130], HEADSTONE_LO: RGB = [100, 98, 96], HEADSTONE_HI: RGB = [168, 166, 160], MOUND: RGB[] = [[100, 70, 42], [86, 60, 36]], TUFT: RGB = [88, 140, 54];

const stoneBuilding = (b: Building) => b.id === "forge" || b.id === "smithy";
/** How many courses a building's roof rises, and the chimney's height over
 * it (the forge's). */
export const roofRows = (b: Building) => (b.id === "shaft" ? 2 : 3);
export const chimneyRows = (b: Building) => (b.id === "forge" ? 3 : 0);
const salt = (b: Building) => b.x0 * 7 + b.id.length * 131;

// ── Walls ─────────────────────────────────────────────────────────────

/** A front wall between the posts: `(x1 - x0 - 1) × height` cells. Boards for
 * timber buildings (the warehouse's upright, board and batten), ashlar for
 * the forge and smithy, with each window's frame, sill and dark panes. */
export function paintWall(p: Pixels, b: Building) {
  const s = salt(b), wpx = p.w, hpx = p.h;
  if (stoneBuilding(b)) ashlar(p, s, MORTAR, ASHLAR, STONE_HI, STONE_LO);
  else if (b.id === "warehouse") {
    // Upright boards, each four pixels, a batten over every joint.
    for (let x = 0; x < wpx; x++) {
      const board = x >> 2, batten = x % 4 === 3;
      for (let y = 0; y < hpx; y++) {
        const g = hash01(x, y, s), c = batten ? PLANK_LO : PLANK[board % 2];
        p.set(x, y, c, 0.93 + 0.12 * g);
      }
      if (x % 4 === 3) for (const y of [1, hpx - 2]) p.set(x, y, NAIL);
    }
    p.rect(0, hpx - 1, wpx, 1, SEAM);
  } else {
    // Clapboards, two pixels each: a lit lip over a shadowed face, with
    // butt joints staggered board to board, nailed either side.
    for (let y = 0; y < hpx; y++) {
      const board = y >> 1, lip = y % 2 === 0;
      const offset = Math.floor(hash01(board, 3, s) * 9);
      for (let x = 0; x < wpx; x++) {
        const joint = (x + offset) % 11 === 0 && x > 0;
        const g = hash01(x, y, s + 1);
        let c = lip ? PLANK_HI : PLANK[board % 2];
        if (joint) c = PLANK_LO;
        p.set(x, y, c, 0.92 + 0.12 * g);
        if (!lip && !joint && (x + offset) % 11 === 1 && g < 0.7) p.set(x, y, NAIL);
      }
    }
  }
  for (const wx of windowsOf(b)) {
    const x = (wx - b.x0 - 1) * 2, y = (b.floor - 4 - (b.floor - b.height + 1)) * 2;
    // Frame round two panes, a sill under it.
    p.rect(x - 1, y - 1, 4, 6, WOOD_LO);
    p.rect(x, y, 2, 2, GLASS);
    p.rect(x, y + 3, 2, 1, GLASS);
    p.set(x, y, [70, 62, 54]);
    p.rect(x - 2, y + 5, 6, 1, WOOD_HI);
  }
}

/** Ashlar courses three pixels high (one of them mortar), blocks five wide
 * plus a mortar joint, staggered course to course, each its own shade with
 * a lit top-left and a shadowed bottom-right. */
function ashlar(p: Pixels, s: number, mortar: RGB, shades: RGB[], hi: RGB | null, lo: RGB | null) {
  for (let y = 0; y < p.h; y++) {
    const course = Math.floor(y / 3), row = y % 3, shift = course % 2 ? 3 : 0;
    for (let x = 0; x < p.w; x++) {
      const bx = x + shift, block = Math.floor(bx / 6), col = bx % 6;
      if (row === 2 || col === 5) {
        p.set(x, y, mortar);
        continue;
      }
      const tone = hash01(block, course, s);
      let c = shades[tone < 0.5 ? 0 : 1];
      if (hi && row === 0 && col === 0) c = hi;
      else if (lo && row === 1 && col === 4) c = lo;
      p.set(x, y, c, 0.9 + 0.2 * tone + 0.06 * hash01(x, y, s + 9));
    }
  }
}

/** The back wall behind the room, seen while the front fades. */
export function paintBack(p: Pixels, b: Building) {
  const s = salt(b) + 5;
  if (stoneBuilding(b)) ashlar(p, s, BACK_MORTAR, BACK_STONE, null, null);
  else
    for (let x = 0; x < p.w; x++)
      for (let y = 0; y < p.h; y++) p.set(x, y, x % 3 === 2 ? BACK_SEAM : BACK_BOARD[Math.floor(x / 3) % 2], 0.9 + 0.15 * hash01(x, y, s));
}

/** The columns of a building's windows (the shaft house has none). */
export function windowsOf(b: Building) {
  const out: number[] = [];
  if (b.id === "shaft") return out;
  for (let x = b.x0 + 3; x < b.x1 - 1; x += 5) if (x !== b.door) out.push(x);
  return out;
}

// ── Frame and roof ────────────────────────────────────────────────────

/** Where a building's shell sprite starts: a cell left of its first post,
 * at its chimney's (or roof's) top row. */
export function shellOrigin(b: Building) {
  const top = b.floor - b.height + 1;
  return { x: b.x0 - 1, y: top - 1 - roofRows(b) - chimneyRows(b) };
}

/** The posts, lintel, door, roof and chimney: everything that stays put
 * while the front wall fades. */
export function paintShell(p: Pixels, b: Building) {
  const s = salt(b) + 11, o = shellOrigin(b), top = b.floor - b.height + 1;
  const X = (cx: number) => (cx - o.x) * 2, Y = (cy: number) => (cy - o.y) * 2;
  const rows = roofRows(b), stone = stoneBuilding(b);
  // Posts: lit on the left, shadowed on the right.
  for (const px of [b.x0, b.x1]) {
    p.rect(X(px), Y(top), 1, b.height * 2, POST_HI);
    p.rect(X(px) + 1, Y(top), 1, b.height * 2, POST_LO);
  }
  // The lintel, bolted at the posts.
  p.rect(X(b.x0), Y(top - 1), (b.x1 - b.x0 + 1) * 2, 1, POST_HI);
  p.rect(X(b.x0), Y(top - 1) + 1, (b.x1 - b.x0 + 1) * 2, 1, POST);
  for (const px of [b.x0, b.x1]) p.set(X(px) + (px === b.x0 ? 0 : 1), Y(top - 1) + 1, NAIL);
  if (b.id === "shaft") {
    // Open both sides, where the yard's way runs through.
    for (const px of [b.x0, b.x1]) p.rect(X(px), Y(b.floor - 1), 2, 4, DARK);
  } else {
    // A plank door with its frame, cross brace and brass handle.
    const dx = X(b.door), dy = Y(b.floor - 2);
    p.rect(dx, dy, 2, 6, DOOR_FRAME);
    p.rect(dx, dy + 1, 1, 5, DOOR[0]);
    p.rect(dx + 1, dy + 1, 1, 5, DOOR[1]);
    p.set(dx, dy + 3, DOOR_FRAME);
    p.set(dx + 1, dy + 3, DOOR_FRAME);
    p.set(b.door === b.x1 ? dx : dx + 1, dy + 4, BRASS);
  }
  // The roof: courses of tiles (barracks), slates (forge, smithy) or wooden
  // shingles, rising a cell in for each pixel row up, with a ridge cap and
  // a dark eave line under the overhang.
  const [shades, lo] = b.id === "barracks" ? [TILE, TILE_LO] : stone ? [SLATE, SLATE_LO] : [SHINGLE, SHINGLE_LO];
  const eaveL = X(b.x0) - 2, eaveR = X(b.x1) + 3, base = Y(top - 1) - 1, height = rows * 2;
  for (let j = 0; j < height; j++) {
    const y = base - j, l = eaveL + j * 2, r = eaveR - j * 2;
    if (r < l) break;
    const course = j >> 1, under = j % 2 === 0, last = j === height - 1 || r - 2 < l + 2;
    for (let x = l; x <= r; x++) {
      const tile = Math.floor((x + (course % 2) * 2) / 4), seam = (x + (course % 2) * 2) % 4 === 0;
      let c = shades[(tile + course) % 2];
      if (last) c = RIDGE;
      else if (under) c = seam ? lo : c;
      else if (seam && b.id !== "barracks") c = lo;
      p.set(x, y, c, last ? 1 : 0.92 + 0.14 * hash01(x, y, s));
    }
    // Moss or a slipped tile, now and then.
    if (!last && hash01(j, 1, s) < 0.35) {
      const mx = l + 1 + Math.floor(hash01(j, 2, s) * Math.max(1, r - l - 2));
      p.set(mx, y, b.id === "barracks" ? lo : [84, 104, 58]);
    }
  }
  p.rect(eaveL, base + 1, X(b.x0) - eaveL, 1, EAVE);
  p.rect(X(b.x1) + 2, base + 1, eaveR - X(b.x1) - 1, 1, EAVE);
  if (b.id === "forge") {
    // The brick chimney, with a stone cap.
    const cx = X(b.x0 + 2), cy = 0, ch = (rows + 3) * 2;
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < 4; x++) {
        const row = y % 2, joint = row === 1 || (x + (Math.floor(y / 2) % 2) * 2) % 4 === 3;
        p.set(cx + x, cy + y, joint ? BRICK_MORTAR : BRICK[Math.floor(y / 2) % 2], 0.92 + 0.12 * hash01(x, y, s));
      }
    p.rect(cx - 1, cy, 6, 1, ASHLAR[0]);
    p.rect(cx, cy + 1, 4, 1, DARK);
  }
}

// ── Headframe and graves ──────────────────────────────────────────────

/** The headframe's size in pixels, and its wheel's centre in cells from
 * its top-left. */
export const HEADFRAME_W = 18, HEADFRAME_H = 24, WHEEL = { x: 4.5, y: 2.5 };

/** The headframe over the shaft: an A of timber legs braced across, the
 * head beam, and the winding wheel with its rim, spokes and hub. */
export function paintHeadframe(p: Pixels) {
  const cx = 9, cy = 5;
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < HEADFRAME_W; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.sqrt(dx * dx + dy * dy);
      if (r <= 4.7 && r >= 3.7) p.set(x, y, dy < 0 ? IRON : IRON_LO);
      else if (r < 1.3) p.set(x, y, IRON_DK);
    }
  // The legs, two pixels thick, from under the beam out to the ground.
  const leg = (y: number) => Math.round(6 - ((y - 10) * 5) / 13);
  for (let y = 10; y < HEADFRAME_H; y++) {
    const l = leg(y), r = HEADFRAME_W - 1 - l;
    p.set(l, y, WOOD_HI);
    p.set(l + 1, y, WOOD);
    p.set(r - 1, y, WOOD);
    p.set(r, y, WOOD_LO);
  }
  // Supports up to the axle, the head beam, girts and an X brace.
  p.rect(7, 6, 1, 4, WOOD_LO);
  p.rect(10, 6, 1, 4, WOOD_LO);
  p.rect(4, 9, 10, 1, WOOD_HI);
  p.rect(4, 10, 10, 1, WOOD_LO);
  p.set(5, 10, NAIL);
  p.set(12, 10, NAIL);
  for (const y of [16, 21]) {
    const l = leg(y) + 2, r = HEADFRAME_W - 3 - leg(y);
    for (let x = l; x <= r; x++) p.set(x, y, x % 3 === 0 ? WOOD_LO : WOOD);
  }
  for (let t = 0; t <= 5; t++) {
    const y = 11 + t, l = leg(y) + 2 + Math.round(t * 0.4), r = HEADFRAME_W - 3 - leg(y) - Math.round(t * 0.4);
    p.set(l + t, y, WOOD_LO);
    p.set(r - t, y, WOOD_LO);
  }
}

export const GRAVE_W = 6, GRAVE_H = 8;
/** A headstone with a cross cut in it over a mound with a tuft of grass. */
export function paintGrave(p: Pixels, n: number) {
  p.rect(2, 0, 2, 1, HEADSTONE);
  p.rect(1, 1, 4, 5, HEADSTONE);
  p.set(1, 1, HEADSTONE_HI);
  p.set(2, 0, HEADSTONE_HI);
  p.rect(4, 2, 1, 4, HEADSTONE_LO);
  p.rect(2, 2, 2, 1, HEADSTONE_LO);
  p.rect(2, 1, 1, 4, HEADSTONE_LO);
  p.rect(0, 6, 6, 1, MOUND[0]);
  p.rect(0, 7, 6, 1, MOUND[1]);
  p.set(1 + (n % 4), 6, TUFT);
  if (n % 3 === 0) p.set(5, 5, TUFT);
}
