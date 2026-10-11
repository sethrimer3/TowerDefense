/** DEFEND's structure art, seen from above: the keep, and the barracks and
 * towers from `tower-art.ts` at their damage stages and as rubble (drawn
 * into the city layer and the palette icons), the keep's live banner, and
 * the shared palette. */
import { GATE, STRUCTURES, type StructureKind } from "./catalog.ts";
import { gatePixels } from "./gate-art.ts";
import { BALLISTA_ART, BALLISTA_DIRS, ballistaPixels, bastionPixels, spikePixels } from "./wall-defense-art.ts";
import { TILE_ICON_CELLS, cityTilePixels } from "./tile-art.ts";
import { hash, hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { drawSprite, sprite } from "./damage-art.ts";
import { artLook, structurePixels, structureRubblePixels } from "./tower-art.ts";

/** Medieval roofing: terracotta tile, old brick, weathered timber, thatch,
 * slate and straw. */
export const ROOFS = ["#8e4a36", "#a35a3e", "#6b5540", "#86704b", "#5a5c62", "#9a7a4a"];
export const OUTLINE = "#0b0907";
export const ROAD = "#62523f";
const PARK = "#3c5d31";

/** Where a structure is drawn, in canvas pixels, and the cell size. */
export type ArtBox = { x: number; y: number; w: number; h: number; px: number };

/** Paints a structure into `box`: the keep at its damage `stage` (see
 * `keepStage`), anything else at its `damageStage`, seeded by `seed` (its
 * lot) so each looks its own, in its path's `look` (`PATH_LOOKS`). */
export function paintStructureArt(c: CanvasRenderingContext2D, kind: StructureKind, box: ArtBox, stage = 0, seed = 0, path?: string) {
  const x = Math.round(box.x), y = Math.round(box.y), w = Math.round(box.w), h = Math.round(box.h);
  if (kind === "keep") return paintKeep(c, { x, y, w, h, px: box.px }, stage);
  const cw = Math.max(1, Math.round(box.w / box.px)), ch = Math.max(1, Math.round(box.h / box.px));
  const look = artLook(kind, path);
  const art = sprite(`${kind}:${cw}x${ch}:${stage}:${seed}${look ? `:${look}` : ""}`, cw * ART, ch * ART, () => structurePixels(kind, cw, ch, stage, seed, look));
  drawSprite(c, art, x, y, w, h);
}

/** A fallen structure's rubble over its cells (`box`, canvas pixels). */
export function paintStructureRubble(c: CanvasRenderingContext2D, kind: StructureKind, box: ArtBox, seed = 0) {
  if (kind === "keep") return paintKeepRubble(c, box);
  const cw = Math.max(1, Math.round(box.w / box.px)), ch = Math.max(1, Math.round(box.h / box.px));
  const art = sprite(`${kind}:${cw}x${ch}:rubble:${seed}`, cw * ART, ch * ART, () => structureRubblePixels(kind, cw, ch, seed));
  drawSprite(c, art, Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h));
}

function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

export type IconItem = StructureKind | "cityTile" | "cityGate" | "wallSpikes" | "wallBallista" | "bomb" | "banner" | "necromancy" | "meteor";

/** Paints `item`'s palette icon into a small square canvas; a structure takes the path look named by
 * the canvas's `data-look` (the path the building wears), when it has one. */
export function paintIcon(canvas: HTMLCanvasElement, item: IconItem) {
  const c = canvas.getContext("2d")!;
  const n = canvas.width;
  c.clearRect(0, 0, n, n);
  c.imageSmoothingEnabled = false;
  if (item === "cityTile") return paintCityIcon(c, n);
  if (item === "cityGate") return paintGateIcon(c, n);
  if (item === "wallSpikes") return paintSpikesIcon(c, n);
  if (item === "wallBallista") return paintBallistaIcon(c, n);
  if (item === "bomb") return paintBombIcon(c, n);
  if (item === "banner") return paintBannerIcon(c, n);
  if (item === "necromancy") return paintNecroIcon(c, n);
  if (item === "meteor") return paintMeteorIcon(c, n);
  const def = [STRUCTURES[item].w, STRUCTURES[item].h];
  const px = n / Math.max(def[0], def[1]) / 1.1;
  const w = def[0] * px,
    h = def[1] * px;
  paintStructureArt(c, item, { x: (n - w) / 2, y: (n - h) / 2, w, h, px }, 0, 0, canvas.dataset.look);
}

/** A corner of the city: streets, roofs and a park, in the board's own
 * pixel art (`tile-art.ts`). */
function paintCityIcon(c: CanvasRenderingContext2D, n: number) {
  const size = TILE_ICON_CELLS * ART;
  drawSprite(c, sprite("icon:cityTile", size, size, cityTilePixels), 0, 0, n, n);
}

/** The city gate, shut, with a stretch of wall either side. */
function paintGateIcon(c: CanvasRenderingContext2D, n: number) {
  const w = GATE.long * ART, h = GATE.deep * ART;
  const k = Math.floor(n / w) || 1;
  const x = Math.round((n - w * k) / 2), y = Math.round((n - h * k) / 2);
  c.fillStyle = "#8f897d";
  c.fillRect(0, y + k, n, h * k - 2 * k);
  c.fillStyle = OUTLINE;
  c.fillRect(0, y, n, k);
  c.fillRect(0, y + h * k - k, n, k);
  drawSprite(c, sprite("icon:cityGate", w, h, () => gatePixels("s")), x, y, w * k, h * k);
}

/** A stretch of wall two stones long, its stakes pointing up and out. */
function paintSpikesIcon(c: CanvasRenderingContext2D, n: number) {
  const k = Math.floor(n / (2 * ART)) || 1, s = ART * k;
  const x = Math.round((n - 2 * s) / 2), y = Math.round((n - s) / 2 + (5 / ART) * s / 2);
  c.fillStyle = "#8f897d";
  c.fillRect(x, y, 2 * s, s);
  c.fillStyle = "#b7b0a2";
  c.fillRect(x + k, y + k, 2 * s - 2 * k, k);
  c.fillStyle = OUTLINE;
  c.fillRect(x, y + s - k, 2 * s, k);
  c.fillRect(x, y, k, s);
  c.fillRect(x + 2 * s - k, y, k, s);
  c.fillRect(x + s - k, y + 2 * k, k, s - 2 * k);
  for (let i = 0; i < 2; i++) drawSprite(c, sprite(`icon:spikes:${i}`, ART, ART, () => spikePixels("n", i)), x + i * s, y - Math.round((5 / ART) * s), s, s);
}

/** The bastion with its ballista aimed up and to the right, loaded. */
function paintBallistaIcon(c: CanvasRenderingContext2D, n: number) {
  const b = 2 * ART, k = Math.max(1, Math.floor(n / BALLISTA_ART));
  const x = Math.round((n - b * k) / 2), y = Math.round((n - b * k) / 2);
  drawSprite(c, sprite("icon:bastion", b, b, () => bastionPixels()), x, y, b * k, b * k);
  const w = BALLISTA_ART * k, o = Math.round((n - w) / 2);
  const dir = Math.round(BALLISTA_DIRS * 7 / 8);
  drawSprite(c, sprite(`ballista:${dir}:1`, BALLISTA_ART, BALLISTA_ART, () => ballistaPixels(dir, true)), o, o, w, w);
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

/** The Necromancy spell: a skull with grave-green eyes over a sigil ring, 14 × 14 art pixels. */
const NECRO_ICON = [
  ".....rrrr.....",
  "...rr....rr...",
  "..r..oooo..r..",
  ".r..owwwwo..r.",
  ".r.owwwwwlo.r.",
  "r..owwwwwlo..r",
  "r.owggwggwlo.r",
  "r.owgowgowlo.r",
  "r..owwoowlo..r",
  ".r..owwwlo..r.",
  ".r..olwlwo..r.",
  "..r..oooo..r..",
  "...rr....rr...",
  ".....rrrr.....",
];
const NECRO_COLORS: Record<string, string> = { o: OUTLINE, w: "#e8e2cf", l: "#a39a82", g: "#8dffa6", r: "#3f9a5c" };

function paintNecroIcon(c: CanvasRenderingContext2D, n: number) {
  const w = 14, h = NECRO_ICON.length, k = Math.max(1, Math.floor(n / w));
  const x0 = Math.round((n - w * k) / 2), y0 = Math.round((n - h * k) / 2);
  NECRO_ICON.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    c.fillStyle = NECRO_COLORS[ch];
    c.fillRect(x0 + i * k, y0 + j * k, k, k);
  }));
}

/** The Meteor strike: a cracked rock glowing through its seams, trailing
 * fire from the upper right, 14 × 14 art pixels. */
const METEOR_ICON = [
  "............r.",
  "..........rryr",
  ".........ryyr.",
  "........ryyr..",
  "...ooooryyr...",
  "..odmmmoyr....",
  ".odmllmmo.....",
  "odmlcllmdo....",
  "odmlccmmdo....",
  "odmmlcmmdo....",
  "oddmmmmddo....",
  ".oddmmddo.....",
  "..oooooo......",
  "..............",
];
const METEOR_COLORS: Record<string, string> = { o: OUTLINE, d: "#3a2a24", m: "#6b4e3c", l: "#9a7a5a", c: "#f08a34", r: "#c8452a", y: "#f6c75a" };

function paintMeteorIcon(c: CanvasRenderingContext2D, n: number) {
  const w = 14, h = METEOR_ICON.length, k = Math.max(1, Math.floor(n / w));
  const x0 = Math.round((n - w * k) / 2), y0 = Math.round((n - h * k) / 2);
  METEOR_ICON.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    c.fillStyle = METEOR_COLORS[ch];
    c.fillRect(x0 + i * k, y0 + j * k, k, k);
  }));
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
  // Damage: soot, the dark through a hole, charred rafters, embers, and
  // fallen stone and slate (dark, mid, lit).
  soot: 0x2e2925, hole: 0x15110e, rafter: 0x6a4728, rafterDark: 0x3e2a18, ember: 0xc8542a, emberHot: 0xf0a040,
  stone: [0x5f5a51, 0x8f897d, 0xb7b0a2], slate: [0x3c4048, 0x5d636c, 0x7c838e],
};

/** Opaque little-endian RGBA for 0xRRGGBB, at `alpha`. */
const rgba = (c: number, alpha = 255) => ((alpha << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** The keep's damage stage at `hp` of `max` hit points: 0 whole, then 1 to
 * 4 below 80%, 60%, 40% and 20%. */
export function keepStage(hp: number, max: number) {
  const f = max > 0 ? hp / max : 1;
  return f >= 0.8 ? 0 : f >= 0.6 ? 1 : f >= 0.4 ? 2 : f >= 0.2 ? 3 : 4;
}

/** The keep, from above, as `KEEP × KEEP` RGBA pixels: a square curtain of
 * crenellated wall with a round turret on each corner and a gate to the
 * south, a flagstone courtyard, and the great tower in the middle under a
 * four-sided slate roof. The banner is drawn live (drawFlag). At damage
 * `stage` 1 to 4 it is cracked, holed, breached and ruined in turn; damage
 * only repaints pixels, never clears one, so it always covers the ground. */
export function keepPixels(stage = 0): Uint32Array {
  const out = wholeKeep(), p = pixels(out);
  for (let s = 1; s <= stage; s++) DAMAGE[s - 1](p);
  return out;
}

function wholeKeep(): Uint32Array {
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

// ── The keep's damage and rubble ──────────────────────────────────────────

/** A pixel buffer being painted: `get` reads 0xRRGGBB (-1 where empty). */
type Pix = { out: Uint32Array; set: Put; get: (x: number, y: number) => number };

function pixels(out: Uint32Array): Pix {
  const n = KEEP;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n;
  return {
    out,
    set: (x, y, c) => {
      if (inside(x, y)) out[y * n + x] = rgba(c);
    },
    get: (x, y) => {
      if (!inside(x, y) || !out[y * n + x]) return -1;
      const v = out[y * n + x];
      return ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
    },
  };
}

type Pt = readonly [number, number];

const paintAll = (p: Pix, pts: readonly Pt[], c: number) => pts.forEach(([x, y]) => p.set(x, y, c));

/** Darkens the drawn pixels at `pts` by `f`: soot and scorching. */
function scorch(p: Pix, pts: readonly Pt[], f = 0.62) {
  for (const [x, y] of pts) {
    const c = p.get(x, y);
    if (c >= 0 && c !== K.outline) p.set(x, y, shade(c, f));
  }
}

/** Every pixel of the box from (x0, y0) to (x1, y1), inclusive. */
function box(x0: number, y0: number, x1: number, y1: number): Pt[] {
  const out: Pt[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

/** A fallen chunk of stone or slate: centre, radius and its tones (dark,
 * mid, lit). */
type Chunk = readonly [number, number, number, readonly number[]];

/** Fallen chunks heaped together, later ones over earlier: each lit from
 * the upper left with a dark crease where it meets the next, and one black
 * outline round the whole pile. */
function pile(p: Pix, chunks: readonly Chunk[]) {
  const n = KEEP, id = new Int16Array(n * n).fill(-1);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < n && y < n ? id[y * n + x] : -1);
  chunks.forEach(([cx, cy, r], k) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(n - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(n - 1, Math.ceil(cx + r)); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) id[y * n + x] = k;
  });
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const k = id[y * n + x];
      if (k < 0) {
        let edge = false;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) edge ||= at(x + ox, y + oy) >= 0;
        if (edge) p.set(x, y, K.outline);
        continue;
      }
      const [cx, cy, r, tones] = chunks[k];
      const crease = [at(x + 1, y), at(x, y + 1)].some((o) => o >= 0 && o !== k);
      const lean = x + 0.5 - cx + (y + 0.5 - cy);
      p.set(x, y, crease ? shade(tones[0], 0.7) : lean < -r * 0.4 ? tones[2] : lean > r * 0.4 ? tones[0] : tones[1]);
    }
}

/** One fallen chunk on its own. */
const chunk = (p: Pix, cx: number, cy: number, r: number, tones: readonly number[]) => pile(p, [[cx, cy, r, tones]]);

/** A charred beam from (x, y), `len` pixels along (dx, dy), outlined. */
function beam(p: Pix, x: number, y: number, len: number, [dx, dy]: Pt) {
  const along: Pt[] = [];
  for (let i = 0; i < len; i++) along.push([x + dx * i, y + dy * i]);
  for (const [bx, by] of along)
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) p.set(bx + ox, by + oy, K.outline);
  along.forEach(([bx, by], i) => p.set(bx, by, i % 3 === 1 ? K.rafter : K.rafterDark));
}

/** A breach through the curtain wall over the box (x0, y0)–(x1, y1): the
 * broken ends capped in outline, the gap full of fallen stone. */
function breach(p: Pix, [x0, y0, x1, y1]: readonly number[], fall: readonly (readonly number[])[]) {
  paintAll(p, box(x0, y0, x1, y1), K.courtShade);
  const vertical = x1 - x0 < y1 - y0;
  if (vertical) paintAll(p, [...box(x0, y0 - 1, x1, y0 - 1), ...box(x0, y1 + 1, x1, y1 + 1)], K.outline);
  else paintAll(p, [...box(x0 - 1, y0, x0 - 1, y1), ...box(x1 + 1, y0, x1 + 1, y1)], K.outline);
  pile(p, fall.map(([cx, cy, r]) => [cx, cy, r, K.stone] as const));
}

/** Pixels within `r` of the turret centred at (cx, cy): its cap. */
function capOf(cx: number, cy: number, r = 2): Pt[] {
  return box(cx - 3, cy - 3, cx + 3, cy + 3).filter(([x, y]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r * r);
}

const n1 = KEEP - 1;

/** What each damage stage adds to the one before. */
const DAMAGE: ((p: Pix) => void)[] = [
  // Below 80%: cracks across the curtain wall and the roof, merlons knocked
  // off, soot by the walls.
  (p) => {
    paintAll(p, [[10, 1], [10, 2], [11, 3], [2, 13], [3, 14], [3, 15], [21, 9], [20, 10], [20, 11], [9, 12], [10, 13], [16, 20], [17, 21]], K.outline);
    paintAll(p, [[14, 2], [15, 2], [2, 9], [21, 16]], K.soot);
    scorch(p, [[6, 15], [6, 16], [5, 16], [17, 6], [16, 5], [17, 5], [12, 18], [13, 18]], 0.7);
  },
  // Below 60%: slates gone from the roof, the north-east turret's cap
  // broken open, more cracks.
  (p) => {
    scorch(p, box(12, 8, 15, 11));
    scorch(p, box(8, 13, 11, 15));
    paintAll(p, [[13, 9], [14, 9], [13, 10], [14, 10], [9, 14], [10, 14], [10, 15]], K.hole);
    paintAll(p, [[14, 10], [10, 14]], K.rafter);
    paintAll(p, [[20, 4], [21, 4], [20, 5]], K.hole);
    p.set(21, 4, K.ember);
    paintAll(p, [[1, 6], [2, 6], [3, 7], [n1 - 1, 18], [n1 - 2, 18], [7, 9], [8, 10]], K.outline);
  },
  // Below 40%: the east wall breached, a hole burning through the roof,
  // the south-west turret's cap fallen in.
  (p) => {
    breach(p, [19, 11, 22, 14], [[20.6, 11.8, 1.7], [21.6, 14.2, 1.6], [19.4, 14.6, 1.3]]);
    scorch(p, box(11, 11, 15, 15));
    paintAll(p, box(12, 12, 14, 14), K.hole);
    paintAll(p, [[12, 14], [13, 13], [14, 12]], K.rafter);
    p.set(13, 14, K.ember);
    p.set(12, 13, K.emberHot);
    paintAll(p, capOf(4, 20), K.hole);
    chunk(p, 4.2, 20.4, 1, K.slate);
    p.set(3, 19, K.ember);
  },
  // Below 20%: the north wall breached too, half the roof caved in over
  // smouldering rafters, the gate smashed, every cap broken, stone
  // everywhere.
  (p) => {
    breach(p, [14, 1, 17, 4], [[14.8, 2.6, 1.6], [17.2, 3.6, 1.7], [15.6, 5.8, 1.4]]);
    for (const [x, y] of box(8, 8, 15, 15)) {
      if (x + y < 22) continue;
      if (x + y === 22) p.set(x, y, K.outline);
      else if ((x - y + 30) % 3 === 0) p.set(x, y, (x + y) % 2 ? K.rafter : K.rafterDark);
      else p.set(x, y, hash(x, y, 13) % 5 === 0 ? K.ember : K.hole);
    }
    p.set(14, 14, K.emberHot);
    scorch(p, box(7, 7, 16, 16).filter(([x, y]) => x + y < 22 && hash(x, y, 17) % 3 === 0));
    paintAll(p, box(10, 20, 13, 21), K.hole);
    paintAll(p, [[11, 20], [12, 21]], K.door);
    paintAll(p, [...capOf(4, 4, 1.6), ...capOf(n1 - 4, n1 - 4, 1.6)], K.hole);
    paintAll(p, [[20, 5], [21, 4]], K.ember);
    chunk(p, 6.6, 9.4, 1.5, K.stone);
    chunk(p, 17.2, 16.6, 1.6, K.stone);
    chunk(p, 8.6, 17.6, 1.4, K.slate);
  },
];

/** The fallen keep as `KEEP × KEEP` RGBA pixels: scorched flagstones,
 * stumps of the curtain wall and turrets, and a heap of stone, slate and
 * charred beams where the great tower stood, a few embers still in it. */
export function keepRubblePixels(): Uint32Array {
  const n = KEEP, whole = pixels(wholeKeep()), out = new Uint32Array(n * n), p = pixels(out);
  const ring = (x: number, y: number) => Math.min(x - 1, y - 1, n - 2 - x, n - 2 - y);
  for (let y = 1; y < n - 1; y++)
    for (let x = 1; x < n - 1; x++) {
      if (ring(x, y) === 0 && hash(x, y, 23) % 3 === 0) continue;
      const r = hash(x, y, 29) % 8;
      p.set(x, y, r === 0 ? K.soot : r < 3 ? K.courtDark : r < 7 ? K.court : K.courtLit);
    }
  // Stumps: runs of the curtain wall and arcs of each turret's rim still
  // standing, their broken ends capped in outline.
  const wall = (x: number, y: number) => x > 0 && y > 0 && x < n - 1 && y < n - 1 && ring(x, y) <= 3;
  const turrets: Pt[] = [[4, 4], [n - 4, 4], [4, n - 4], [n - 4, n - 4]];
  const rim = (x: number, y: number) => turrets.some(([cx, cy]) => { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); return d > 2 && d <= 3.9; });
  const stands = (x: number, y: number) => {
    if (rim(x, y)) {
      const [cx, cy] = turrets.reduce((a, t) => (Math.hypot(x - t[0], y - t[1]) < Math.hypot(x - a[0], y - a[1]) ? t : a));
      const sector = Math.floor(((Math.atan2(y + 0.5 - cy, x + 0.5 - cx) + Math.PI) / (2 * Math.PI)) * 6);
      return hash(cx, cy, sector, 31) % 3 !== 0;
    }
    if (!wall(x, y)) return false;
    const along = ring(x, y) === y - 1 || ring(x, y) === n - 2 - y ? x : y;
    const side = y - 1 === ring(x, y) ? 0 : n - 2 - y === ring(x, y) ? 1 : x - 1 === ring(x, y) ? 2 : 3;
    return hash(side, Math.floor(along / 4), 37) % 5 < 3;
  };
  const part = (x: number, y: number) => wall(x, y) || rim(x, y);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!part(x, y) || !stands(x, y)) continue;
      const end = ORTHO4.some(([dx, dy]) => part(x + dx, y + dy) && !stands(x + dx, y + dy));
      p.set(x, y, end ? K.outline : whole.get(x, y));
    }
  // Fallen stone along the walls, then the heap over the great tower.
  const fallen: Chunk[] = [];
  for (let k = 0; k < 8; k++) {
    const t = hash01(k, 41), side = k % 4, d = 5.8 + hash01(k, 43) * 1.2;
    const a = 6 + t * (n - 12);
    const [cx, cy] = side === 0 ? [a, d] : side === 1 ? [a, n - d] : side === 2 ? [d, a] : [n - d, a];
    fallen.push([cx, cy, 1.4 + hash01(k, 47) * 0.5, K.stone]);
  }
  beam(p, 7, 8, 6, [1, 1]);
  const heap: Chunk[] = Array.from({ length: 16 }, (_, k) => {
    const ang = hash01(k, 53) * Math.PI * 2, rr = Math.sqrt(hash01(k, 59)) * 4.4;
    return [n / 2 + Math.cos(ang) * rr, n / 2 + Math.sin(ang) * rr, 1.8 + hash01(k, 61) * (1.6 - rr * 0.2), k % 4 === 0 ? K.slate : K.stone] as const;
  });
  pile(p, [...fallen, ...heap.sort((a, b) => b[2] - a[2])]);
  beam(p, 14, 9, 5, [0, 1]);
  // Embers on the heap.
  for (const [x, y] of [[10, 11], [13, 12], [11, 14], [14, 10], [12, 9], [9, 13]] as Pt[])
    if (p.get(x, y) !== K.outline && hash(x, y, 67) % 3 !== 0) p.set(x, y, (x + y) % 2 ? K.ember : K.emberHot);
  return out;
}

const ORTHO4: readonly Pt[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const keepSprites: (HTMLCanvasElement | undefined)[] = [];
let keepFlashSprite: HTMLCanvasElement | null = null;
let rubbleSprite: HTMLCanvasElement | null = null;

/** Pale damage overlay with exactly the keep sprite's silhouette. */
export function paintKeepFlash(c: CanvasRenderingContext2D, { x, y, w, h }: ArtBox, alpha: number) {
  keepFlashSprite ??= spriteCanvas(keepPixels().map(v => v ? rgba(0xfff4dc) : 0), KEEP, KEEP);
  c.save();
  c.imageSmoothingEnabled = false;
  c.globalAlpha = alpha;
  c.drawImage(keepFlashSprite, x, y, w, h);
  c.restore();
}

/** The keep's pixels at damage `stage` drawn up to fill its box,
 * smoothing off. */
function paintKeep(c: CanvasRenderingContext2D, { x, y, w, h }: ArtBox, stage: number) {
  if (typeof document === "undefined") return;
  const sprite = (keepSprites[stage] ??= spriteCanvas(keepPixels(stage), KEEP, KEEP));
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(sprite, x, y, w, h);
  c.restore();
}

/** The fallen keep's rubble over its cells (`box`, canvas pixels). */
export function paintKeepRubble(c: CanvasRenderingContext2D, { x, y, w, h }: ArtBox) {
  if (typeof document === "undefined") return;
  rubbleSprite ??= spriteCanvas(keepRubblePixels(), KEEP, KEEP);
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(rubbleSprite, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
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

/** The war banner's palette icon: the keep's banner, still, cropped round
 * its cloth. */
function paintBannerIcon(c: CanvasRenderingContext2D, n: number) {
  const x0 = POLE - 3, y0 = POLE - 6, w = 18, h = 14;
  const sprite = spriteCanvas(flagPixels(0.3, false), FLAG_W, FLAG_H);
  const s = Math.floor((n * 0.95) / w);
  c.drawImage(sprite, x0, y0, w, h, (n - w * s) / 2, (n - h * s) / 2, w * s, h * s);
}

/** The war banner where the player planted it: the keep's banner on a
 * pole, over a faint gold ring marking the ground its troops hold. */
export function drawWarBanner(c: CanvasRenderingContext2D, px: number, at: { x: number; y: number }, reach: number, pose: { t: number; reduceMotion: boolean }) {
  const x = at.x * px, y = at.y * px;
  c.save();
  c.strokeStyle = "rgba(242,210,122,0.35)";
  c.lineWidth = Math.max(1, px * 0.1);
  c.setLineDash([px * 0.5, px * 0.4]);
  if (!pose.reduceMotion) c.lineDashOffset = -pose.t * px * 0.6;
  c.beginPath();
  c.arc(x, y, reach * px, 0, Math.PI * 2);
  c.stroke();
  c.restore();
  drawFlag(c, px, { x, y, t: pose.t, reduceMotion: pose.reduceMotion });
}
