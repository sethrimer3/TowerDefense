/** DEFEND's structure art, seen from above: the keep, barracks and towers
 * (drawn into the city layer and the palette icons), the keep's live banner,
 * and the shared palette. */
import { SOLDIER, type StructureKind } from "./catalog.ts";
import { hash } from "./grid.ts";
import { ART } from "./park-art.ts";

/** Medieval roofing: terracotta tile, old brick, weathered timber, thatch,
 * slate and straw. */
export const ROOFS = ["#8e4a36", "#a35a3e", "#6b5540", "#86704b", "#5a5c62", "#9a7a4a"];
export const OUTLINE = "#0b0907";
export const ROAD = "#5f584d";
const PARK = "#3c5d31";

/** Where a structure is drawn, in canvas pixels, and the cell size. */
export type ArtBox = { x: number; y: number; w: number; h: number; px: number };

/** A structure's box snapped to whole pixels, with its outline widths. */
type Frame = ArtBox & { inset: number; line: number };

export function paintStructureArt(c: CanvasRenderingContext2D, kind: StructureKind, box: ArtBox) {
  const px = box.px;
  const f: Frame = {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.w),
    h: Math.round(box.h),
    px,
    inset: Math.max(1, Math.round(px * 0.1)),
    line: Math.max(1, Math.round(px * 0.08)),
  };
  STRUCTURES[kind](c, f);
}

const STRUCTURES: Record<StructureKind, (c: CanvasRenderingContext2D, f: Frame) => void> = {
  keep: (c, f) => paintKeep(c, f),
  barracks: paintBarracks,
  archerBarracks: paintArcherBarracks,
  archerTower: paintArcherTower,
  cannonTower: paintCannonTower,
  watchTower: paintWatchTower,
  wizardTower: paintWizardTower,
};

/** A solid black outline, then the fill inside it. */
function stone(c: CanvasRenderingContext2D, { x, y, w, h, inset, line }: Frame, fill: string) {
  c.fillStyle = OUTLINE;
  c.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  c.fillStyle = fill;
  c.fillRect(x + inset + line, y + inset + line, w - (inset + line) * 2, h - (inset + line) * 2);
}

/** A hall roof inside the stone, its sunny half lighter. */
function hallRoof(c: CanvasRenderingContext2D, { x, y, w, h, inset }: Frame, fill: string, sun: number) {
  c.fillStyle = fill;
  c.fillRect(x + inset * 2, y + inset * 2, w - inset * 4, h - inset * 4);
  c.fillStyle = `rgba(255,255,255,${sun})`;
  c.fillRect(x + inset * 2, y + inset * 2, (w - inset * 4) / 2, h - inset * 4);
}

function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function paintBarracks(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h, px } = f;
  stone(c, f, "#7a6a5a");
  hallRoof(c, f, "#a03a2e", 0.15);
  c.fillStyle = SOLDIER.color;
  c.fillRect(x + w / 2 - px * 0.3, y + h / 2 - px * 0.3, px * 0.6, px * 0.6);
}

/** Green-roofed hall with a target butt out front. */
function paintArcherBarracks(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h } = f;
  stone(c, f, "#7a6e5c");
  hallRoof(c, f, "#5e4632", 0.14);
  const cx = x + w / 2,
    cy = y + h / 2,
    r = Math.min(w, h) * 0.16;
  c.fillStyle = "#e8dcc0";
  disc(c, cx, cy, r);
  c.fillStyle = "#b3372f";
  disc(c, cx, cy, r * 0.6);
  c.fillStyle = "#e8dcc0";
  disc(c, cx, cy, r * 0.25);
}

function paintArcherTower(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h, px } = f;
  stone(c, f, "#8c8577");
  c.fillStyle = "#6e4a2c";
  disc(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.3);
  c.fillStyle = "#c9a36a";
  c.fillRect(x + w / 2 - px * 0.12, y + h / 2 - px * 0.5, px * 0.24, px);
}

/** Iron gun on a round turntable, barrel pointing north. */
function paintCannonTower(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h, px } = f;
  stone(c, f, "#6f6a62");
  c.fillStyle = "#4a4038";
  disc(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.32);
  c.fillStyle = "#26262a";
  c.fillRect(x + w / 2 - px * 0.2, y + h * 0.12, px * 0.4, h * 0.45);
  disc(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.17);
  c.fillStyle = "#6a6a70";
  c.fillRect(x + w / 2 - px * 0.1, y + h * 0.14, px * 0.12, h * 0.1);
}

function paintWatchTower(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h } = f;
  stone(c, f, "#7d8288");
  c.fillStyle = "#3d3f44";
  c.fillRect(x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.4);
  c.fillStyle = "#f2d27a";
  disc(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.13);
}

/** A round tower of pale stone under a pointed violet roof, seen from
 * above: eight slate slopes meeting at a gold finial, the sunny ones to
 * the upper left, with a ring of runes glowing round the eaves. */
function paintWizardTower(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h, line } = f;
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.46;
  c.fillStyle = OUTLINE;
  disc(c, cx, cy, r);
  c.fillStyle = "#9a958c";
  disc(c, cx, cy, r - line);
  const roof = r * 0.78;
  c.fillStyle = OUTLINE;
  disc(c, cx, cy, roof + line);
  // Eight roof slopes, lit from the upper left like every other roof.
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2, mid = (a0 + a1) / 2;
    const lit = 0.5 + 0.5 * -Math.cos(mid + Math.PI / 4);
    c.fillStyle = `rgb(${Math.round(70 + lit * 70)},${Math.round(44 + lit * 40)},${Math.round(110 + lit * 70)})`;
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, roof, a0, a1);
    c.closePath();
    c.fill();
  }
  c.strokeStyle = "rgba(20,8,30,0.6)";
  c.lineWidth = Math.max(1, line * 0.6);
  c.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a) * roof, cy + Math.sin(a) * roof);
  }
  c.stroke();
  // Runes round the eaves.
  c.fillStyle = "#9fe3ff";
  const dot = Math.max(1, Math.round(line));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.13;
    c.fillRect(Math.round(cx + Math.cos(a) * (r - line * 2.2) - dot / 2), Math.round(cy + Math.sin(a) * (r - line * 2.2) - dot / 2), dot, dot);
  }
  c.fillStyle = "#e9c46a";
  disc(c, cx, cy, Math.max(1, r * 0.13));
  c.fillStyle = "#fff4c8";
  disc(c, cx - r * 0.04, cy - r * 0.04, Math.max(0.6, r * 0.05));
}

export type IconItem = StructureKind | "cityTile" | "bomb";

/** Palette icon for an item, drawn into a small square canvas. */
export function paintIcon(canvas: HTMLCanvasElement, item: IconItem) {
  const c = canvas.getContext("2d")!;
  const n = canvas.width;
  c.clearRect(0, 0, n, n);
  c.imageSmoothingEnabled = false;
  if (item === "cityTile") return paintCityIcon(c, n);
  if (item === "bomb") return paintBombIcon(c, n);
  const def = { keep: [3, 3], barracks: [3, 4], archerBarracks: [3, 3], archerTower: [2, 2], cannonTower: [2, 2], watchTower: [2, 2], wizardTower: [2, 2] }[item];
  const px = n / Math.max(def[0], def[1]) / 1.1;
  const w = def[0] * px,
    h = def[1] * px;
  paintStructureArt(c, item, { x: (n - w) / 2, y: (n - h) / 2, w, h, px });
}

/** A block of roofs round a little park. */
function paintCityIcon(c: CanvasRenderingContext2D, n: number) {
  const px = n / 7;
  c.fillStyle = ROAD;
  c.fillRect(0, 0, n, n);
  const houses: [number, number, number, number, number][] = [
    [0, 0, 3, 2, 0], [4, 0, 3, 3, 2], [0, 3, 2, 4, 3], [4, 4, 3, 3, 1], [3, 5, 1, 2, 4],
  ];
  for (const [x, y, w, h, v] of houses) {
    c.fillStyle = ROOFS[v];
    c.fillRect(x * px + 1, y * px + 1, w * px - 2, h * px - 2);
  }
  c.fillStyle = PARK;
  c.fillRect(2 * px, 3 * px + 1, px, px);
}

function paintBombIcon(c: CanvasRenderingContext2D, n: number) {
  c.fillStyle = "#2a2a2e";
  disc(c, n * 0.45, n * 0.58, n * 0.3);
  c.fillStyle = "rgba(255,255,255,0.25)";
  c.fillRect(n * 0.3, n * 0.42, n * 0.1, n * 0.1);
  c.fillStyle = "#8a6a3c";
  c.fillRect(n * 0.58, n * 0.18, n * 0.08, n * 0.18);
  c.fillStyle = "#ffb347";
  c.fillRect(n * 0.62, n * 0.1, n * 0.12, n * 0.1);
}

// ── The keep ──────────────────────────────────────────────────────────────
//
// The keep and its banner are pixel art at `ART` pixels a cell, like the
// parks' ponds and trees: painted pixel by pixel, then drawn up to size
// with smoothing off, so they sit with the blocky roofs and canopies.

/** Art pixels across the keep (3 cells). */
const KEEP = 3 * ART;

/** 0xRRGGBB colours, lit from the upper left like every other roof. */
const K = {
  outline: 0x0b0907,
  merlon: 0xc9c2b2, crenel: 0x5c574e, walk: 0x9d968a, walkLit: 0xb0a99b, walkShade: 0x847e72,
  court: 0x6f6a60, courtLit: 0x7d786c, courtDark: 0x5f5a51, courtShade: 0x4d4942,
  roof: { n: 0x7c838e, w: 0x5d636c, e: 0x494e57, s: 0x3c4048 }, ridge: 0x2a2d33, ridgeLit: 0x8f96a1,
  turret: 0xa8a194, turretLit: 0xc4bdae, cap: [0x3a3e45, 0x50555e, 0x6c727c, 0x8b929d], finial: 0xd8b572,
  door: 0x6b4a2c, doorDark: 0x4a321e,
};

/** Opaque little-endian RGBA for 0xRRGGBB, at `alpha`. */
const rgba = (c: number, alpha = 255) => ((alpha << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** The keep, from above, as `KEEP × KEEP` RGBA pixels: a square curtain of
 * crenellated wall with a round turret on each corner and a gate to the
 * south, a flagstone courtyard, and the great tower in the middle under a
 * four-sided slate roof. The banner is drawn live (drawFlag). */
export function keepPixels(): Uint32Array {
  const n = KEEP, out = new Uint32Array(n * n);
  const set = (x: number, y: number, c: number) => (out[y * n + x] = rgba(c));
  // Curtain wall: outline, merlons on the outer edge, the wall walk, and an
  // inner outline round the courtyard.
  for (let y = 1; y < n - 1; y++)
    for (let x = 1; x < n - 1; x++) {
      const ring = Math.min(x - 1, y - 1, n - 2 - x, n - 2 - y);
      if (ring === 0 || ring === 3) set(x, y, K.outline);
      else if (ring === 1) set(x, y, (x + y) % 3 === 0 ? K.crenel : K.merlon);
      else if (ring === 2) set(x, y, x === 3 || y === 3 ? K.walkLit : x === n - 4 || y === n - 4 ? K.walkShade : K.walk);
      else courtyard(x, y, set);
    }
  greatTower(set);
  for (const [cx, cy] of [[4, 4], [n - 4, 4], [4, n - 4], [n - 4, n - 4]]) turret(cx, cy, set);
  // The gate: oak doors across the south wall.
  for (let y = n - 4; y < n - 1; y++)
    for (let x = n / 2 - 2; x < n / 2 + 2; x++) set(x, y, y === n - 2 ? K.outline : x === n / 2 - 1 ? K.doorDark : K.door);
  return out;
}

type Put = (x: number, y: number, c: number) => void;

/** Flagstones, speckled, in the shade of the walls along the north and
 * west and of the tower to its lower right. */
function courtyard(x: number, y: number, set: Put) {
  if (x === 5 || y === 5) return set(x, y, K.courtShade);
  const t = KEEP - 7; // Just past the tower's lower-right edge.
  if ((x === t && y >= 8 && y <= t) || (y === t && x >= 8 && x <= t)) return set(x, y, K.courtShade);
  const r = hash(x, y, 71) % 7;
  set(x, y, r === 0 ? K.courtLit : r === 1 ? K.courtDark : K.court);
}

/** The great tower: an outlined square under a hipped slate roof, four
 * faces meeting at a point, its ridges dark but for the sunny north-west
 * one, with faint tile courses. */
function greatTower(set: Put) {
  const lo = 7, hi = KEEP - 8, mid = KEEP / 2 - 0.5;
  for (let y = lo; y <= hi; y++)
    for (let x = lo; x <= hi; x++) {
      if (x === lo || y === lo || x === hi || y === hi) {
        set(x, y, K.outline);
        continue;
      }
      const dx = x - mid, dy = y - mid;
      if (Math.abs(dx) === Math.abs(dy)) {
        set(x, y, dx < 0 && dy < 0 ? K.ridgeLit : K.ridge);
        continue;
      }
      const ns = Math.abs(dy) > Math.abs(dx);
      const face = ns ? (dy < 0 ? K.roof.n : K.roof.s) : dx < 0 ? K.roof.w : K.roof.e;
      const course = ns ? y % 2 === 0 : x % 2 === 0;
      set(x, y, course ? shade(face, 0.88) : face);
    }
}

/** A round turret centred at (cx, cy): outline, a pale stone rim lit to the
 * upper left, and a conical slate cap shaded by facing and dithered between
 * shades, with a gold finial. */
function turret(cx: number, cy: number, set: Put) {
  const r = 3.9;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      if (d > r - 1) set(x, y, K.outline);
      else if (d > r - 1.9) set(x, y, dx + dy < 0 ? K.turretLit : K.turret);
      else if (d < 0.8 && dx < 0 && dy < 0) set(x, y, K.finial);
      else {
        const lit = (-(dx + dy) / (d * Math.SQRT2)) * 1.5 + 1.5; // 0 (lower right) to 3 (upper left)
        const k = Math.max(0, Math.min(3, Math.floor(lit + ((x + y) % 2 ? 0.25 : -0.25))));
        set(x, y, K.cap[k]);
      }
    }
}

/** `c` darkened (or lightened) by `f`. */
function shade(c: number, f: number) {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 0xff) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

let keepSprite: HTMLCanvasElement | null = null;

/** The keep's pixels drawn up to fill its box, smoothing off. */
function paintKeep(c: CanvasRenderingContext2D, { x, y, w, h }: ArtBox) {
  if (typeof document === "undefined") return;
  keepSprite ??= spriteCanvas(keepPixels(), KEEP, KEEP);
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(keepSprite, x, y, w, h);
  c.restore();
}

function spriteCanvas(px: Uint32Array, w: number, h: number, cv = document.createElement("canvas")) {
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  const img = c.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(px);
  c.putImageData(img, 0, 0);
  return cv;
}

// ── The keep's banner ─────────────────────────────────────────────────────

/** Where the banner's pole stands (canvas pixels) and the time it waves at. */
export type FlagPose = { x: number; y: number; t: number; reduceMotion: boolean };

/** The banner's pixel grid: `FLAG_W × FLAG_H` art pixels with the pole at
 * art pixel corner (POLE, POLE). */
export const FLAG_W = 30, FLAG_H = 24;
const POLE = 12;
/** The cloth: columns long, rows deep. */
const CLOTH_L = 11, CLOTH_D = 5;
const RED = [0x7a2022, 0xa8302a, 0xd2412f], GOLD = [0x9c7a34, 0xd2a84a, 0xf0cf6a];

/** The banner, seen from above, as `FLAG_W × FLAG_H` RGBA pixels at time
 * `t` (seconds): red cloth with a gold stripe and a swallowtail, each
 * column lifted by the ripple running down it and shaded by its fold, with
 * a one-pixel outline, a shadow on the roof below, and the pole's gold cap.
 * The ripple steps at 12 frames a second, like a sprite; under reduced
 * motion it holds still. */
export function flagPixels(t: number, reduceMotion: boolean): Uint32Array {
  const out = new Uint32Array(FLAG_W * FLAG_H);
  const tick = reduceMotion ? 0 : Math.floor(t * 12) / 12;
  // 0 off the cloth, else 1 + shade index (+ 3 on the stripe).
  const cloth = new Uint8Array(FLAG_W * FLAG_H);
  for (let i = 0; i < CLOTH_L; i++) {
    const phase = tick * 6 - i * 0.5;
    const lift = Math.round(Math.sin(phase) * 1.6 * ((i + 1) / CLOTH_L));
    const fold = Math.cos(phase);
    const tone = fold > 0.35 ? 2 : fold < -0.35 ? 0 : 1;
    for (let j = 0; j < CLOTH_D; j++) {
      // The swallowtail: the last column's middle is cut away.
      if (i === CLOTH_L - 1 && j > 0 && j < CLOTH_D - 1) continue;
      const x = POLE + 1 + i, y = POLE - 2 + j + lift;
      cloth[y * FLAG_W + x] = 1 + tone + (j === (CLOTH_D - 1) / 2 ? 3 : 0);
    }
  }
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < FLAG_W && y < FLAG_H && cloth[y * FLAG_W + x] > 0;
  const edge = (x: number, y: number) => !on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1));
  // Shadow two pixels down and right, under the cloth and its outline.
  for (let y = 2; y < FLAG_H; y++)
    for (let x = 2; x < FLAG_W; x++) if (on(x - 2, y - 2) || edge(x - 2, y - 2)) out[y * FLAG_W + x] = rgba(0, 80);
  for (let y = 0; y < FLAG_H; y++)
    for (let x = 0; x < FLAG_W; x++) {
      const v = cloth[y * FLAG_W + x];
      if (v) out[y * FLAG_W + x] = rgba(v > 3 ? GOLD[v - 4] : RED[v - 1]);
      else if (edge(x, y)) out[y * FLAG_W + x] = rgba(K.outline);
    }
  // The pole's cap: two by two gold pixels in an outline, over the cloth's
  // hoist.
  for (let y = POLE - 2; y < POLE + 2; y++)
    for (let x = POLE - 2; x < POLE + 2; x++) {
      const rim = x === POLE - 2 || y === POLE - 2 || x === POLE + 1 || y === POLE + 1;
      out[y * FLAG_W + x] = rgba(rim ? K.outline : x === POLE - 1 && y === POLE - 1 ? 0xf6e2a8 : K.finial);
    }
  return out;
}

let flagCanvas: HTMLCanvasElement | null = null;

/** The keep's banner, redrawn every frame from the time so it keeps
 * waving, at the city's art scale. */
export function drawFlag(c: CanvasRenderingContext2D, px: number, pose: FlagPose) {
  flagCanvas = spriteCanvas(flagPixels(pose.t, pose.reduceMotion), FLAG_W, FLAG_H, flagCanvas ?? undefined);
  const s = px / ART;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(flagCanvas, pose.x - POLE * s, pose.y - POLE * s, FLAG_W * s, FLAG_H * s);
  c.restore();
}
