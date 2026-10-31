import type { Sun } from "../daylight.ts";
import { witheredTreeSprite } from "./blight-art.ts";
import type { BlightTrail, WitherStage } from "./blight-trail.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels, type ArtPiece } from "./sprite-source.ts";
import { outlinePixels, spriteCanvas, drawSprite } from "./damage-art.ts";
import { onPixelArt, pixelKey } from "./pixel-sprites.ts";
/** The forest outside the walls (`forest.ts`) as pixel art at `ART` pixels a
 * cell, inside crisp black outlines like the parks' trees:
 *
 * - **Ground:** the parks' grass over all the open ground (`turfAt` marks
 *   it, where `forest-grass.ts` grows its blades), dirt pads, mossy rocks,
 *   every standing tree's shadow (cast from the upper left), the craters
 *   with stumps that felled trees leave and the dirt blasts and burning
 *   ground bare, all baked into one board-sized canvas, repainted only
 *   where something changes. It lies under the units and the battle's
 *   lighting.
 * - **Trees:** oaks of leaf clumps, star-shaped pines in whorls, and small
 *   bushes with red berries, each variant baked in five lean
 *   frames; on the wall clock each tree leans with its own sway and gusts
 *   rolling across the board, stronger under cloud and rain. They stand
 *   over the units, fading while anyone is under them, composed into one
 *   board-sized canvas at most every `REDRAW_MS`, then darkened with the
 *   city below them.
 * - **Debris:** a tree blown up bursts into leaves, clumps and splinters
 *   flung from the blast, falling and fading on battle time.
 *
 * Presentation only; its randomness comes from `defendRandom("effects")`. */
import { CELL_COUNT, CELLS_H, CELLS_W, cellIndex, defendRandom, hash, hash01, type Rect } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import type { Footprint } from "./shadow-art.ts";
import type { DefendSim } from "./sim.ts";
import { BURN, ForestDamage, MOUNTAIN, VARIANTS, canopyRadius, forestPlan, type Boulder, type Felled, type ForestPlan, type ForestTree, type Lake, type TreeKind, type TreeSize } from "./forest.ts";
import { ART } from "./park-art.ts";
import { BANK, FOAM, GLINT, LILY, REED, SAND, WATER, bayer } from "./water-palette.ts";
import { Birds, roosting } from "./forest-birds.ts";
import { paintRiver, riverBed, riverCanvas, riverShape, type RiverShape } from "./river-art.ts";
import { GRASS } from "./ground-art.ts";
import { FLAME, SMOKE, artPen } from "./pixel-fx.ts";
import { ENEMIES } from "./catalog.ts";
import { isMelee } from "./melee-facing.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;
/** The most a canopy leans, in art pixels, either way. */
export const LEAN = 2;
/** A tree's opacity while someone is under it. */
export const UNDER_ALPHA = 0.4;
/** How fast a tree fades, in opacity a second. */
const FADE = 3;
/** The wind's time is held this long, so a tree's lean is the same in
 * every band composed meanwhile. */
const REDRAW_MS = 60;
/** The bands of rows the trees' canvas is composed in, one a frame. */
const BANDS = 4;
/** The most debris pieces in the air at once. */
const MAX_DEBRIS = 1600;
const OUTLINE = 0x0b0907;

const fx = defendRandom("effects");

/** Opaque little-endian RGBA for 0xRRGGBB. */
const rgba = (c: number, a = 255) => ((a << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** Leaf shades, darkest first, a few per kind for variety. */
const LEAVES: Record<TreeKind, number[][]> = {
  oak: [
    [0x1f3619, 0x2d5122, 0x44702f, 0x6a9d4c],
    [0x223a1a, 0x335a26, 0x4f7f33, 0x7aab55],
    [0x26361a, 0x3a5124, 0x587534, 0x8aa257],
  ],
  pine: [
    [0x13261d, 0x1c3a2a, 0x29523a, 0x3f6f4c],
    [0x15281f, 0x203f2e, 0x2f5b40, 0x4a7d55],
  ],
  bush: [
    [0x223a1a, 0x335a26, 0x4c7a35, 0x74a653],
    [0x283b1b, 0x3d5a27, 0x5a7d38, 0x86ad5b],
  ],
};
const BARK = [0x3e2a1c, 0x5e4129];
/** Berries: red, and a pale glint on a few. */
const BERRY = [0xc8303a, 0xf2a49a];
/** The parks' grass: its two patch greens and its dark and light tufts. */
const hexValue = (s: string) => parseInt(s.slice(1), 16);
const TURF = { patch: GRASS.patch.map(hexValue), dark: hexValue(GRASS.dark), light: hexValue(GRASS.light) };
const DIRT = [0x463a2e, 0x55483a, 0x62523f, 0x6a5944];
const TURNED = [0x46372a, 0x5a4634, 0x6c5640, 0x7e664c];
const PEBBLE = [0x8a7a62, 0x3a3026];
const STONE = [0x3c3f3d, 0x575a55, 0x777a72, 0x979a90];
const MOSS = [0x4f6a32, 0x6f8f44];
const STUMP = [0x5e4129, 0x7a5232, 0xb08a5a];
/** Scorched earth where a tree burnt down, darkest first. */
const CHAR = [0x241d18, 0x2f2620, 0x3b3028, 0x4a3c30];
/** A pile of ash, darkest first: charcoal, then grey to pale ash. */
const ASH = [0x2a2522, 0x55504a, 0x7d7770, 0xa8a29a, 0xcfcac2];
const ASH_HEX = ASH.map((c) => `#${c.toString(16).padStart(6, "0")}`);
/** A small mountain's stone, darkest to lightest. */
const CRAG = [0x24262a, 0x34373a, 0x4a4d4c, 0x63665f, 0x81847a, 0xa2a497];

/** A sprite: its pixels, its size and where the canopy's middle sits in it. */
export type Sprite = { px: Uint32Array; w: number; h: number; ox: number; oy: number; runs?: Int16Array };

const outlinedSceneryCache = new WeakMap<Sprite, Sprite>();
function outlinedScenery(s: Sprite): Sprite {
  let drawn=outlinedSceneryCache.get(s);
  if(!drawn){const art=outlinePixels(s.px,s.w,s.h);drawn={px:art.data,w:art.w,h:art.h,ox:s.ox+1,oy:s.oy+1};outlinedSceneryCache.set(s,drawn);}
  return drawn;
}

/** A sprite's rows as runs of solid pixels: row, first and past-last
 * column, three numbers a run. */
function runsOf(s: Sprite) {
  if (s.runs) return s.runs;
  const out: number[] = [];
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      if (!s.px[y * s.w + x]) continue;
      let e = x;
      while (e < s.w && s.px[y * s.w + e]) e++;
      out.push(y, x, e);
      x = e;
    }
  return (s.runs = Int16Array.from(out));
}

/** Shade band (0 darkest to 3 lightest) for a light value, the boundaries
 * dithered on a checker. */
const band = (v: number, x: number, y: number) => {
  const d = v + (((x + y) & 1) * 0.12 - 0.06);
  return d > 0.5 ? 3 : d > 0.1 ? 2 : d > -0.32 ? 1 : 0;
};

/** The canopy of kind `kind`, size `size`, variant `v`, unleant: shade
 * band per pixel (-1 empty, 0..3, or 4 + berry index) over a square
 * `2 × half + 1` wide, its middle at (half, half). Bigger trees have more
 * whorls and clumps rather than bigger ones. */
function canopy(kind: TreeKind, v: number, size: TreeSize) {
  const R = canopyRadius(kind, v, size) * ART, half = Math.ceil(R * 1.2) + 1, n = 2 * half + 1;
  const grid = new Int8Array(n * n).fill(-1);
  const h = (k: number) => hash01(v, kind.length, size, k);
  if (kind === "pine") {
    const spikes = 8 + size * 4 + (hash(v, size, 431) % 4), ph = h(432);
    // Each whorl's rim as a share of the canopy's, outermost first.
    const tiers = [1, ...[[0.6, 0.28], [0.68, 0.42, 0.2], [0.74, 0.52, 0.32, 0.15], [0.78, 0.6, 0.43, 0.27, 0.12]][size]];
    const tri = (u: number) => 1 - 2 * Math.abs(u - Math.floor(u) - 0.5);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - half, dy = y + 0.5 - half, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx) / (Math.PI * 2);
        const rim = R * (0.72 + 0.28 * tri(a * spikes + ph));
        if (d >= rim) continue;
        // Whorls of branches, each tier's rim spiked between the tier below's spikes.
        let tier = 0, next = -Infinity;
        for (let k = 1; k < tiers.length; k++) {
          const r = R * tiers[k] * (0.75 + 0.25 * tri(a * spikes + ph + (k & 1) * 0.5));
          if (d < r) tier = k;
          else { next = r; break; }
        }
        const light = (-0.6 * dx - 0.8 * dy) / R;
        let val = light * 0.75 + (tier * 0.56) / (tiers.length - 1) - 0.22;
        // A dark line just outside each upper tier's rim, on the shaded side,
        // but not round the topmost tier, which would ring the middle in a
        // hard little square.
        if (tier < tiers.length - 2 && d < next + 1.2 && 0.6 * dx + 0.8 * dy > -0.2 * R) val -= 0.6;
        grid[y * n + x] = band(val, x, y);
      }
    return { R, half, n, grid };
  }
  const bush = kind === "bush";
  const clumps = [{ x: 0, y: -0.05 * R, r: (bush ? 0.55 : 0.6) * R, lift: 0.25 * R }];
  // A ring of clumps round the crown, and for big trees an outer ring of
  // smaller ones and an inner ring raised between them.
  const k = (bush ? 3 : 5) + size * 2 + (hash(v, size, 433) % 3);
  const ring = (count: number, reach: number, r: number, lift: number, seed: number) => {
    for (let i = 0; i < count; i++) {
      const a = ((i + h(seed + i) * 0.5) / count) * Math.PI * 2, dist = R * (reach + h(seed + 20 + i) * 0.14);
      clumps.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, r: R * (r + h(seed + 40 + i) * 0.12), lift: R * lift });
    }
  };
  if (size >= 2) {
    clumps[0].r = 0.42 * R;
    ring(k + 4, 0.66, 0.26, 0, 600);
    ring(k - 2, 0.36, 0.3, 0.1, 700);
  } else ring(k, 0.42, size ? 0.34 : 0.38, 0, 434);

  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const px = x + 0.5 - half, py = y + 0.5 - half;
      let best = -Infinity, c = clumps[0];
      for (const q of clumps) {
        const dx = px - q.x, dy = py - q.y, d2 = dx * dx + dy * dy;
        if (d2 >= q.r * q.r) continue;
        const ht = Math.sqrt(q.r * q.r - d2) + q.lift;
        if (ht > best) best = ht, c = q;
      }
      if (best === -Infinity) continue;
      const nx = (px - c.x) / c.r, ny = (py - c.y) / c.r;
      let val = 0.5 * (-0.6 * nx - 0.8 * ny) + 0.5 * ((-0.6 * px - 0.8 * py) / R);
      // Each clump's shaded rim reads against the clump below it; the crown's
      // middle clump blends in, or its rim boxes the middle in a square.
      const edge = c !== clumps[0] && Math.sqrt((px - c.x) ** 2 + (py - c.y) ** 2) > c.r - 1.1 - size * 0.45;
      if (edge && 0.6 * nx + 0.8 * ny > 0.25) val -= 0.55;
      // Leaf speckle, and on big crowns dark gaps between the leaves.
      const sp = hash(x, y, v, 435) % 13;
      if (sp === 0) val += 0.4;
      else if (size >= 2 && sp === 1 && val < 0.4) val -= 0.5;
      grid[y * n + x] = band(val, x, y);
    }
  // A bush's red berries, a pixel each, kept off its rim and apart, one in
  // a few catching the light.
  if (bush)
    for (let y = 1; y < n - 1; y++)
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        if (grid[i] < 1 || grid[i - 1] < 0 || grid[i + 1] < 0 || grid[i - n] < 0 || grid[i + n] < 0) continue;
        if (grid[i - 1] >= 4 || grid[i - n] >= 4 || grid[i - n - 1] >= 4 || grid[i - n + 1] >= 4 || hash(x, y, v, 436) % 3) continue;
        grid[i] = 4 + (hash(x, y, v, 437) % 4 === 0 ? 1 : 0);
      }
  return { R, half, n, grid };
}

/** Baked tree sprites by size, kind, variant and lean. */
const sprites: Sprite[] = [];
const KIND_INDEX: Record<TreeKind, number> = { oak: 0, pine: 1, bush: 2 };

/** Tree `kind`, variant `v`, leaning `lean` art pixels (its crown furthest,
 * its skirt not at all), seen from straight above, so only its canopy in
 * its outline; `size` 0 to 3, from ordinary to huge. */
export function treeSprite(kind: TreeKind, v: number, lean: number, size: TreeSize = 0): Sprite {
  const key = ((size * 3 + KIND_INDEX[kind]) * VARIANTS + v) * (2 * LEAN + 1) + lean + LEAN;
  let s = sprites[key];
  if (s) return s;
  const { R, half, n, grid } = canopy(kind, v, size);
  const pad = LEAN + 2, w = n + pad * 2, h = n + 2, ox = half + pad, oy = half + 1;
  const fill = new Int8Array(w * h).fill(-1);
  const colour = new Uint32Array(w * h);
  const shift = (y: number) => Math.round(lean * Math.max(0, Math.min(1, (R * 0.6 - (y - half)) / (R * 1.6))));
  const palettes = LEAVES[kind], pal = palettes[v % palettes.length];
  for (let y = 0; y < n; y++) {
    const dx = shift(y);
    for (let x = 0; x < n; x++) {
      const b = grid[y * n + x];
      if (b < 0) continue;
      const i = (y + 1) * w + x + pad + dx;
      fill[i] = 1;
      colour[i] = rgba(b >= 4 ? BERRY[b - 4] : pal[b]);
    }
  }
  const px = sourcePixels(ART_NAMES.scenery(`tree-${kind}-${size}-${v}-${lean}`),w,h,()=>colour);
  s = { px, w, h, ox, oy };
  sprites[key] = s;
  return s;
}

/** A rock `size` cells across: a lumpy boulder lit from the upper left,
 * moss on its crown, outlined. */
export function rockSprite(size: number, seed: number): Sprite {
  const key = `${size}:${seed}`;
  let s = rocks.get(key);
  if (!s) rocks.set(key, (s = rock(size, seed)));
  return s;
}
const rocks = new Map<string, Sprite>();

function rock(size: number, seed: number): Sprite {
  const R = Math.max(1.6, size * ART * 0.5), half = Math.ceil(R * 1.25) + 1, w = 2 * half + 2, h = 2 * half + 2;
  const inside = new Uint8Array(w * h), px = new Uint32Array(w * h);
  const ph = hash01(seed, 461) * 6.28, lumps = 3 + (seed % 3), squash = 0.75 + hash01(seed, 462) * 0.2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - half, dy = (y + 0.5 - half) / squash, d = Math.sqrt(dx * dx + dy * dy);
      const rim = R * (1 + 0.16 * Math.sin(Math.atan2(dy, dx) * lumps + ph));
      if (d >= rim) continue;
      inside[y * w + x] = 1;
      const light = (-0.6 * dx - 0.8 * dy) / R;
      const b = band(light * 0.9, x, y);
      const mossy = seed % 3 !== 0 && light > 0.35 && hash(x, y, seed, 463) % 3 !== 0;
      px[y * w + x] = rgba(mossy ? MOSS[b > 2 ? 1 : 0] : STONE[b]);
    }
  // A boulder's crack, a crooked line of dark pixels across its face.
  if (R >= 4) {
    let x = half + Math.round((hash01(seed, 464) - 0.5) * R), y = half - Math.round(R * 0.5);
    for (let k = 0; k < R * 1.1; k++, y++) {
      x += (hash(seed, k, 465) % 3) - 1;
      const i = y * w + x;
      if (x <= 0 || x >= w - 1 || !inside[i] || !inside[i - 1] || !inside[i + 1] || !inside[i + w]) continue;
      px[i] = rgba(STONE[0]);
      if (inside[i + 1]) px[i + 1] = rgba(STONE[3]);
    }
  }
  const own = sourcePixels(ART_NAMES.scenery(`rock-${w}x${h}-${seed % 64}`),w,h,()=>px);
  return { px: own, w, h, ox: half, oy: half };
}

/** Which floor pixels a tree's shadow has darkened already. */
const shaded = new Uint8Array(W * H);
/** Which floor pixels are grass (shadowed or not), where the live blades
 * may grow. */
const turf = new Uint8Array(W * H);
/** The grass each open pixel is painted with before anything over it. */
const lawn = new Uint32Array(W * H);
/** Whether art pixel (X, Y) of the forest floor last painted is grass, and
 * whether a tree's shadow lies on it. */
export const turfAt = (X: number, Y: number) => X >= 0 && Y >= 0 && X < W && Y < H && turf[Y * W + X] === 1;
export const shadedAt = (X: number, Y: number) => X >= 0 && Y >= 0 && X < W && Y < H && shaded[Y * W + X] === 1;
/** A box of art pixels, `x1`/`y1` exclusive. */
export type Box = { x0: number; y0: number; x1: number; y1: number };
const WHOLE: Box = { x0: 0, y0: 0, x1: W, y1: H };
/** The box being painted: every pixel written lies in it. */
let clip: Box = WHOLE;
const inClip = (X: number, Y: number) => X >= clip.x0 && Y >= clip.y0 && X < clip.x1 && Y < clip.y1;
/** Whether something `reach` cells round (x, y) may touch the clip. */
const nearClip = (x: number, y: number, reach: number) =>
  (x + reach) * ART >= clip.x0 && (x - reach) * ART < clip.x1 && (y + reach) * ART >= clip.y0 && (y - reach) * ART < clip.y1;

/** An Ambush river through the forest: its shores, and the cells its art
 * may cover (`riverCanvas`, the bridges left to the city layer). */
export type ForestRiver = { shape: RiverShape; cells: Uint8Array };

/** `map`'s river for the forest floor, if it has one. */
export function forestRiver(map: CityMap): ForestRiver | null {
  const bed = riverBed(map);
  return bed ? { shape: riverShape(bed), cells: riverCanvas(map, false) } : null;
}

/** The forest's ground, `W × H` art pixels: grass, dirt pads, the dirt
 * blasts bared, craters with stumps, rocks and the standing trees'
 * shadows. */
export function floorPixels(plan: ForestPlan, damage: ForestDamage | null, river: ForestRiver | null = null): Uint32Array {
  const out = new Uint32Array(W * H);
  paintFloor(out, plan, damage, WHOLE, river);
  return out;
}

/** Paints the forest's ground into `out` afresh within `box` only; a river
 * as the city layer paints it, so its banks lie on the forest's grass. Pixels
 * marked in `covered` (a scenario's buildings, raised after the plan) are left
 * clear, so the city layer's building shows through. */
export function paintFloor(out: Uint32Array, plan: ForestPlan, damage: ForestDamage | null, box: Box, river: ForestRiver | null = null, covered?: Uint8Array, blight?: BlightTrail, sun?: Sun) {
  clip = { x0: Math.max(0, box.x0), y0: Math.max(0, box.y0), x1: Math.min(W, box.x1), y1: Math.min(H, box.y1) };
  for (let Y = clip.y0; Y < clip.y1; Y++) out.fill(0, Y * W + clip.x0, Y * W + clip.x1);
  lawnIn(out, plan.open);
  for (const p of plan.pads) if (nearClip(p.x, p.y, p.r * 1.3 + 0.2)) blob(out, p.x, p.y, p.r, p.seed, DIRT, false);
  for (const c of damage?.clearings ?? []) if (nearClip(c.x, c.y, c.r * 1.3 + 0.2)) blob(out, c.x, c.y, c.r, c.seed, c.burnt ? CHAR : DIRT, false, plan.open);
  for (const l of plan.lakes) lake(out, l);
  for (const c of damage?.craters ?? []) {
    if (!nearClip(c.x, c.y, c.r * 1.3 + 0.5)) continue;
    blob(out, c.x, c.y, c.r, c.seed, TURNED, true);
  }
  if (river) paintRiver(out, river.shape, river.cells, clip);
  for (const st of damage?.stumps ?? []) {
    if (!nearClip(st.x, st.y, 1.5)) continue;
    chips(out, st);
    const sp = stumpSprite(st.size, st.seed, st.cut), x0 = Math.round(st.x * ART) - sp.ox, y0 = Math.round(st.y * ART) - sp.oy;
    stamp(out, sp, x0 + 1, y0 + 1, true);
    stamp(out, sp, x0, y0, false);
  }
  for (const r of plan.rocks) {
    if (!nearClip(r.x, r.y, r.size + 0.5)) continue;
    const s = rockSprite(r.size, r.seed), x0 = Math.round(r.x * ART) - s.ox, y0 = Math.round(r.y * ART) - s.oy;
    // Its shadow, a pixel down and right.
    stamp(out, s, x0 + 1, y0 + 1, true);
    stamp(out, s, x0, y0, false);
  }
  for (const b of plan.boulders) boulder(out, b);
  if (covered)
    for (let Y = clip.y0; Y < clip.y1; Y++)
      for (let X = clip.x0, i = Y * W + X; X < clip.x1; X++, i++) if (covered[i]) out[i] = 0;
  // What is still grass, before the trees' shadows fall on it.
  for (let Y = clip.y0; Y < clip.y1; Y++)
    for (let X = clip.x0, i = Y * W + X; X < clip.x1; X++, i++) turf[i] = out[i] !== 0 && out[i] === lawn[i] ? 1 : 0;
  for (let Y = clip.y0; Y < clip.y1; Y++) shaded.fill(0, Y * W + clip.x0, Y * W + clip.x1);
  for (const t of plan.trees) {
    if (sun?.strength === 0 || (damage && !damage.upright(t)) || !nearClip(t.x, t.y, t.r * 2 + 1)) continue;
    const source = treeSprite(t.kind, t.variant, 0, t.size);
    const s = outlinedScenery(witheredTreeSprite(source, blight?.treeStage(t.x, t.y, t.r) ?? 0, t.r, t.variant)), R = t.r * ART, runs = runsOf(s);
    const x0 = Math.round(t.x * ART) - s.ox + Math.round(R * (sun?.x ?? .7) * .5) + 1, y0 = Math.round(t.y * ART) - s.oy + Math.round(R * (sun?.y ?? 1) * .5) + 1;
    for (let k = 0; k < runs.length; k += 3) {
      const Y = y0 + runs[k];
      if (Y < clip.y0 || Y >= clip.y1) continue;
      for (let X = Math.max(clip.x0, x0 + runs[k + 1]), e = Math.min(clip.x1, x0 + runs[k + 2]); X < e; X++) {
        const i = Y * W + X;
        if (shaded[i]) continue;
        shaded[i] = 1;
        out[i] = darken(out[i], sun ? Math.min(1, sun.strength / .27) : 1);
      }
    }
  }
  clip = WHOLE;
}

/** The parks' grass over every open cell in the clip: each cell its 2 × 2
 * patch's green, with a few dark and light tufts. */
function lawnIn(out: Uint32Array, open: Uint8Array) {
  for (let cy = Math.floor(clip.y0 / ART); cy * ART < clip.y1; cy++)
    for (let cx = Math.floor(clip.x0 / ART); cx * ART < clip.x1; cx++) {
      if (!open[cellIndex(cx, cy)]) continue;
      const patch = rgba(TURF.patch[hash01(Math.floor(cx / 2), Math.floor(cy / 2), 50) < 0.5 ? 0 : 1]);
      const put = (X: number, Y: number, c: number) => {
        if (inClip(X, Y)) out[Y * W + X] = lawn[Y * W + X] = c;
      };
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) put(cx * ART + x, cy * ART + y, patch);
      for (let k = 0; k < 5; k++) {
        const hx = cx * ART + Math.floor(hash01(cx, cy, 51, k) * (ART - 1)), hy = cy * ART + Math.floor(hash01(cx, cy, 52, k) * (ART - 2));
        const c = rgba(k % 2 ? TURF.dark : TURF.light);
        put(hx, hy, c);
        put(hx, hy + 1, c);
      }
    }
}

/** A pixel in shadow: a solid one darkened, a clear one made a dim shade. */
function darken(p: number, strength = 1) {
  if (!(p >>> 24)) return rgba(0x060a05, Math.round(92 * strength));
  const k = 1 - .4 * strength;
  const r = (p & 0xff) * k, g = ((p >> 8) & 0xff) * k, b = ((p >> 16) & 0xff) * k;
  return ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
}

/** Copies a sprite's pixels in, or (`shadow`) shades where they would go. */
function stamp(out: Uint32Array, source: Sprite, x0: number, y0: number, shadow: boolean) {
  const s=outlinedScenery(source); x0--;y0--;
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const p = s.px[y * s.w + x], X = x0 + x, Y = y0 + y;
      if (!p || !inClip(X, Y)) continue;
      out[Y * W + X] = shadow ? darken(out[Y * W + X]) : p;
    }
}

/** A patch of earth `r` cells across at (x, y): a ragged disc of `tones`,
 * dithered out into the ground at its edge, with pebbles; a crater's (`thrown`)
 * rim heaped lighter with clods. With `open`, only on the cells it marks. */
function blob(out: Uint32Array, x: number, y: number, r: number, seed: number, tones: number[], thrown: boolean, open?: Uint8Array) {
  const R = r * ART, cx = x * ART, cy = y * ART, ph = hash01(seed, 471) * 6.28, ph2 = hash01(seed, 472) * 6.28;
  const x0 = Math.max(clip.x0, Math.floor(cx - R * 1.3)), x1 = Math.min(clip.x1 - 1, Math.ceil(cx + R * 1.3));
  const y0 = Math.max(clip.y0, Math.floor(cy - R * 1.3)), y1 = Math.min(clip.y1 - 1, Math.ceil(cy + R * 1.3));
  const outer = R * 1.02 * R * 1.02;
  for (let Y = y0; Y <= y1; Y++)
    for (let X = x0; X <= x1; X++) {
      const dx = X + 0.5 - cx, dy = Y + 0.5 - cy, d2 = dx * dx + dy * dy;
      if (d2 >= outer) continue;
      const d = Math.sqrt(d2);
      // Only the ragged edge needs its angle: deep inside, the rim is far.
      const rim = d < R * 0.62 - 2 ? R : R * (0.82 + 0.12 * Math.sin(Math.atan2(dy, dx) * 3 + ph) + 0.08 * Math.sin(Math.atan2(dy, dx) * 7 + ph2));
      if (d >= rim || (open && !open[cellIndex(Math.floor(X / ART), Math.floor(Y / ART))])) continue;
      const odd = (X + Y) & 1;
      // The outermost pixel, every other one, lets the ground through.
      if (d > rim - 1 && odd) continue;
      const hsh = hash(X, Y, seed, 473);
      let tone = (hsh % 7 < 3 ? 1 : hsh % 7 < 5 ? 2 : 0) + (!thrown && d > rim - 2 && odd ? -1 : 0);
      if (thrown && d > rim * 0.7) tone += 1;
      if (thrown && d < rim * 0.4) tone -= 1;
      let c = tones[Math.max(0, Math.min(tones.length - 1, tone))];
      if (hsh % 29 === 0) c = PEBBLE[0];
      else if (hsh % 29 === 1) c = PEBBLE[1];
      out[Y * W + X] = rgba(c);
    }
}

/** Stumps by size, seed and cut. */
const stumps = new Map<string, Sprite>();

/** A stump seen from above where an attack struck a tree of `size` apart:
 * its bark ring and root flares in an outline, and its top either sawn
 * clean (`cut`: pale growth rings round a dark pith, lit from the upper
 * left) or splintered (a dark broken heart, pale shards of wood sticking up
 * and out past the bark). */
export function stumpSprite(size: TreeSize, seed: number, cut: boolean): Sprite {
  const key = `${size}:${seed % 8}:${cut}`;
  let s = stumps.get(key);
  if (s) return s;
  const r = [1.3, 2.2, 2.9, 3.6][size], half = Math.ceil(r) + 3, w = 2 * half + 1;
  const grid = new Int8Array(w * w).fill(-1), v = seed % 8;
  // Root flares: three or four short arms out of the bark.
  const roots = 3 + (v & 1);
  for (let k = 0; k < roots; k++) {
    const a = ((k + hash01(v, k, 520) * 0.5) / roots) * Math.PI * 2, len = r + 1 + (size ? 1 : 0);
    for (let d = r - 0.5; d < len; d += 0.5) {
      const x = Math.round(half + Math.cos(a) * d), y = Math.round(half + Math.sin(a) * d);
      grid[y * w + x] = 1;
    }
  }
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const dx = x - half, dy = y - half, d = Math.sqrt(dx * dx + dy * dy);
      if (d > r + 0.4) continue;
      // Bark round the rim, the top inside it.
      if (d > r - 0.8) { grid[y * w + x] = dx + dy < 0 ? 1 : 0; continue; }
      if (cut) {
        const ring = Math.round(d * 1.3) & 1;
        grid[y * w + x] = d < 0.7 ? 5 : dx + dy < -1 ? 4 : ring ? 3 : 4;
      } else grid[y * w + x] = d < r * 0.5 ? (hash(x, y, v, 521) % 3 ? 2 : 0) : hash(x, y, v, 522) % 3 ? 3 : 2;
    }
  if (!cut) {
    // Shards of wood standing up round the break, a few leaning out.
    const shards = 3 + size * 2;
    for (let k = 0; k < shards; k++) {
      const a = (k / shards) * Math.PI * 2 + hash01(v, k, 523), d = r - 0.6 + hash01(v, k, 524) * 1.6;
      const x = Math.round(half + Math.cos(a) * d), y = Math.round(half + Math.sin(a) * d);
      grid[y * w + x] = 4;
      if (k % 2 === 0) grid[(y + 1) * w + x] = 3;
    }
  }
  const colours = [STUMP[0], 0x6e4a2c, 0x3a2618, STUMP[1], STUMP[2], 0x4a3020];
  const px = new Uint32Array(w * w);
  for (let i = 0; i < w * w; i++) {
    if (grid[i] >= 0) { px[i] = rgba(colours[grid[i]]); continue; }

  }
  s = { px:sourcePixels(ART_NAMES.scenery(`stump-${size}-${seed%8}-${cut ? "cut" : "broken"}`),w,w,()=>px), w, h: w, ox: half, oy: half };
  stumps.set(key, s);
  return s;
}

/** Chips of pale wood and bark strewn round a stump on the ground. */
function chips(out: Uint32Array, st: { x: number; y: number; size: TreeSize; seed: number }) {
  const n = 4 + st.size * 4, cx = st.x * ART, cy = st.y * ART;
  for (let k = 0; k < n; k++) {
    const a = hash01(st.seed, k, 525) * Math.PI * 2, d = 3 + st.size + hash01(st.seed, k, 526) * (4 + st.size * 3);
    const X = Math.round(cx + Math.cos(a) * d), Y = Math.round(cy + Math.sin(a) * d);
    if (inClip(X, Y)) out[Y * W + X] = rgba(k % 3 ? STUMP[2] : STUMP[0]);
  }
}

/** How far (art pixels) inside lake `l` each point is, wobbled along the
 * shore, and the lake's bounds in art pixels. */
export function lakeDepth(l: Lake) {
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const d of l.discs) bx0 = Math.min(bx0, d.x - d.r), by0 = Math.min(by0, d.y - d.r), bx1 = Math.max(bx1, d.x + d.r), by1 = Math.max(by1, d.y + d.r);
  const discs = l.discs.map((d) => ({ x: d.x * ART, y: d.y * ART, r: d.r * ART }));
  const depth = (X: number, Y: number) => {
    let e = -Infinity;
    for (const d of discs) e = Math.max(e, d.r - Math.sqrt((X + 0.5 - d.x) ** 2 + (Y + 0.5 - d.y) ** 2));
    return e + 0.9 * Math.sin(X * 0.37 + l.seed) * Math.cos(Y * 0.29 + l.seed * 0.5);
  };
  const box = { x0: Math.floor((bx0 - 0.4) * ART), y0: Math.floor((by0 - 0.4) * ART), x1: Math.ceil((bx1 + 0.4) * ART), y1: Math.ceil((by1 + 0.4) * ART) };
  return { depth, box };
}

/** A lake: its muddy bank and outline, then water shading smoothly from a
 * teal shallow over a sandy bottom to the deep, the bank's shadow on the
 * water from the upper left and a pale lip of light along the far shore,
 * slow ripple lines across the open water, lily pads and reeds. The
 * twinkling glints are drawn live (`ForestArt.drawWater`). */
function lake(out: Uint32Array, l: Lake) {
  const { depth, box } = lakeDepth(l);
  const x0 = Math.max(clip.x0, box.x0), x1 = Math.min(clip.x1, box.x1), y0 = Math.max(clip.y0, box.y0), y1 = Math.min(clip.y1, box.y1);
  if (x0 >= x1 || y0 >= y1) return;
  const wet = (X: number, Y: number) => depth(X, Y) >= 1.5;
  for (let Y = y0; Y < y1; Y++)
    for (let X = x0; X < x1; X++) {
      const e = depth(X, Y);
      if (e < -2) continue;
      const odd = (X + Y) & 1, hsh = hash(X, Y, l.seed, 481);
      let c: number;
      if (e < -1) { if (odd) continue; c = BANK[0]; }
      else if (e < 0.5) c = BANK[hsh % 3 ? 1 : 2];
      else if (e < 1.5) c = OUTLINE;
      else {
        // Depth, 0 at the shore to the last tone in the middle, dithered.
        const t = Math.min(WATER.length - 1, Math.max(0, (e - 1.5) / 3.2) + 0) + bayer(X, Y) - 0.5;
        let k = Math.max(0, Math.min(WATER.length - 1, Math.round(t)));
        // Sand and pebbles showing through the shallows.
        if (k === 0 && hsh % 9 === 0) { out[Y * W + X] = rgba(SAND); continue; }
        // The bank's shadow from the upper left; the light it catches opposite.
        if (!wet(X - 3, Y - 3)) k = Math.min(WATER.length - 1, k + 2);
        else if (!wet(X + 2, Y + 2) && e < 4) { out[Y * W + X] = rgba(odd ? FOAM : WATER[0]); continue; }
        // Ripple lines, wavering slowly across the open water.
        const wave = Math.sin(X * 0.45 + Math.sin(Y * 0.21 + l.seed) * 2.2 + Y * 0.9);
        if (e > 5 && wave > 0.86 && (X & 1)) k = Math.max(0, k - 1);
        c = WATER[k];
      }
      out[Y * W + X] = rgba(c);
    }
  // Lily pads out on the water, notched discs, one in a few in flower.
  for (let k = 0; k < 9; k++) {
    const X = Math.round(box.x0 + hash01(l.seed, k, 482) * (box.x1 - box.x0)), Y = Math.round(box.y0 + hash01(l.seed, k, 483) * (box.y1 - box.y0));
    if (depth(X, Y) < 5) continue;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > 9 || !inClip(X + dx, Y + dy) || (dx > 0 && dy === 0)) continue;
        out[(Y + dy) * W + X + dx] = rgba(d2 > 6 ? LILY[0] : dx + dy < 0 ? LILY[2] : LILY[1]);
      }
    if (k % 3 === 0 && inClip(X - 1, Y - 1)) {
      out[(Y - 1) * W + X - 1] = rgba(0xf2c4d6);
      if (inClip(X, Y - 1)) out[(Y - 1) * W + X] = rgba(0xe8a6c0);
    }
  }
  // Reeds in clumps where the shore is shallow: dark tufts with pale tips.
  for (let k = 0; k < 18; k++) {
    const X = Math.round(box.x0 + hash01(l.seed, k, 484) * (box.x1 - box.x0)), Y = Math.round(box.y0 + hash01(l.seed, k, 485) * (box.y1 - box.y0)), e = depth(X, Y);
    if (e < 1.5 || e > 4.5) continue;
    for (let j = 0; j < 7; j++) {
      const rx = X + (hash(l.seed, k, j, 486) % 5) - 2, ry = Y + (hash(l.seed, k, j, 487) % 5) - 2;
      if (!inClip(rx, ry) || !inClip(rx, ry - 1)) continue;
      out[ry * W + rx] = rgba(REED[0]);
      out[(ry - 1) * W + rx] = rgba(j % 3 ? REED[1] : REED[2]);
    }
  }
}

/** Where each lake's light glints: short streaks on open water, each with
 * its own twinkle, in art pixels. */
export function waterGlints(plan: ForestPlan) {
  const out: { x: number; y: number; len: number; phase: number; rate: number }[] = [];
  for (const l of plan.lakes) {
    const { depth, box } = lakeDepth(l), n = Math.round(((box.x1 - box.x0) * (box.y1 - box.y0)) / 260);
    for (let k = 0; k < n; k++) {
      const x = Math.round(box.x0 + hash01(l.seed, k, 488) * (box.x1 - box.x0)), y = Math.round(box.y0 + hash01(l.seed, k, 489) * (box.y1 - box.y0));
      if (depth(x, y) < 6) continue;
      out.push({ x, y, len: 1 + (hash(l.seed, k, 490) % 3), phase: hash01(l.seed, k, 491) * 6.28, rate: 0.6 + hash01(l.seed, k, 492) * 1.2 });
    }
  }
  return out;
}

/** A small mountain: a heap of cells raised into a rocky hill seen from
 * above, its ridges lit from the upper left, scree at its ragged foot, moss
 * on its gentler slopes, a long shadow to the lower right. */
export function mountainSource(b: Boulder) {
  const rock = new Set(b.cells);
  let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity;
  for (const c of b.cells) {
    const x = c % CELLS_W, y = Math.floor(c / CELLS_W);
    cx0 = Math.min(cx0, x), cy0 = Math.min(cy0, y), cx1 = Math.max(cx1, x), cy1 = Math.max(cy1, y);
  }
  const X0 = (cx0 - 1) * ART, Y0 = (cy0 - 1) * ART, w = (cx1 - cx0 + 3) * ART, h = (cy1 - cy0 + 3) * ART;
  const seed = b.seed % 1000;
  // Its outline: the heap's cells blended smoothly between their middles,
  // so its corners round off, ragged by noise.
  const isRock = (cx: number, cy: number) => (rock.has(cellIndex(cx, cy)) && cx >= 0 && cx < CELLS_W ? 1 : 0);
  const inside = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = (X0 + x + 0.5) / ART - 0.5, fy = (Y0 + y + 0.5) / ART - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
      const top = isRock(ix, iy) * (1 - u) + isRock(ix + 1, iy) * u, bottom = isRock(ix, iy + 1) * (1 - u) + isRock(ix + 1, iy + 1) * u;
      const density = top * (1 - v) + bottom * v;
      const noise = 0.12 * Math.sin((X0 + x) * 0.55 + seed) * Math.cos((Y0 + y) * 0.47 + seed * 0.3) + ((hash(X0 + x, Y0 + y, 509) % 3) - 1) * 0.03;
      if (density + noise > 0.42) inside[y * w + x] = 1;
    }
  const d = chamfer(inside, w, h);
  // Height: rising with the distance in, ridged by noise.
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!inside[i]) continue;
    const x = X0 + (i % w), y = Y0 + Math.floor(i / w);
    H[i] = d[i] * 1.3 + 2.4 * Math.sin(x * 0.31 + y * 0.17 + seed) + 1.6 * Math.sin(y * 0.43 - x * 0.12 + seed * 2);
  }
  const source = new Uint32Array(w*h);
  const put = (x:number,y:number,c:number)=>{ source[y*w+x]=c; };
  const at = (x: number, y: number) => H[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!inside[i]) {

        continue;
      }
      const gx = at(x + 1, y) - at(x - 1, y), gy = at(x, y + 1) - at(x, y - 1);
      // Faces turned to the upper left catch the light.
      const lit = (0.6 * gx + 0.8 * gy) * 0.4 + 0.05, steep = Math.abs(gx) + Math.abs(gy);
      let k = lit + bayer(X0 + x, Y0 + y) * 0.5 - 0.25;
      let c = k > 0.75 ? CRAG[5] : k > 0.35 ? CRAG[4] : k > 0.02 ? CRAG[3] : k > -0.35 ? CRAG[2] : k > -0.8 ? CRAG[1] : CRAG[0];
      const hsh = hash(X0 + x, Y0 + y, b.seed, 510);
      // Moss on the gentler slopes, scree at the foot.
      if (steep < 1.2 && d[i] > 3 && hsh % 5 < 3) c = MOSS[k > 0 ? 1 : 0];
      else if (d[i] < 3 && hsh % 7 === 0) c = PEBBLE[hsh & 1];
      put(x, y, rgba(c));
    }
  // Crags heaped on its slopes, the biggest toward its heart.
  const crags = b.cells
    .map((c, k) => {
      const x = (c % CELLS_W) + 0.5 + (hash01(b.seed, k, 511) - 0.5) * 0.5, y = Math.floor(c / CELLS_W) + 0.5 + (hash01(b.seed, k, 512) - 0.5) * 0.5;
      return { x, y, deep: d[Math.round(y * ART - Y0) * w + Math.round(x * ART - X0)] ?? 0, seed: hash(b.seed, k, 513) };
    })
    .filter((g) => g.deep > 5 && hash01(g.seed, 514) < 0.55)
    .sort((a, c) => a.y - c.y);
  const name=ART_NAMES.scenery(`mountain-${w}x${h}-${b.seed%16}`);
  return {px:sourcePixels(name,w,h,()=>source),w,h,ox:0,oy:0,x:X0,y:Y0,name,crags};
}
function mountain(out:Uint32Array,b:Boulder) {
  const s=mountainSource(b);
  if(s.x+s.w+4<clip.x0 || s.x>=clip.x1 || s.y+s.h+4<clip.y0 || s.y>=clip.y1)return;
  for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){
    if(!s.px[y*s.w+x])continue;
    for(const k of [2,4]){
      const sx=x+k,sy=y+k,X=s.x+sx,Y=s.y+sy;
      if((sx<s.w&&sy<s.h&&s.px[sy*s.w+sx])||!inClip(X,Y)||(k===4&&(X+Y)&1))continue;
      out[Y*W+X]=darken(out[Y*W+X]);
    }
  }
  stamp(out,s,s.x,s.y,false);
  for(const g of s.crags){
    const sp=rockSprite(Math.round((.9+Math.min(1.2,g.deep/14)+hash01(g.seed,515)*.3)*4)/4,g.seed%64);
    stamp(out,sp,Math.round(g.x*ART)-sp.ox+2,Math.round(g.y*ART)-sp.oy+2,true);
    stamp(out,sp,Math.round(g.x*ART)-sp.ox,Math.round(g.y*ART)-sp.oy,false);
  }
}

/** Distance (art pixels, 1 straight and 1.4 diagonal) from each inside
 * pixel to the nearest outside one; 0 outside. */
function chamfer(inside: Uint8Array, w: number, h: number) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = inside[i] ? 1e9 : 0;
  const pass = (x: number, y: number, dx: number, dy: number, cost: number) => {
    const nx = x + dx, ny = y + dy;
    return nx < 0 || ny < 0 || nx >= w || ny >= h ? cost : d[ny * w + nx] + cost;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], pass(x, y, -1, 0, 1), pass(x, y, 0, -1, 1), pass(x, y, -1, -1, 1.4), pass(x, y, 1, -1, 1.4));
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], pass(x, y, 1, 0, 1), pass(x, y, 0, 1, 1), pass(x, y, 1, 1, 1.4), pass(x, y, -1, 1, 1.4));
    }
  return d;
}

/** A boulder or cluster: one great stone over a 2 × 2 block, else a stone
 * a cell, each heaving up a shade on the ground, piled back to front; a
 * heap of `MOUNTAIN` cells or more is a small mountain. */
function boulder(out: Uint32Array, b: Boulder) {
  if (b.cells.length >= MOUNTAIN) return mountain(out, b);
  const cells = b.cells.map((c) => ({ x: (c % CELLS_W) + 0.5, y: Math.floor(c / CELLS_W) + 0.5 }));
  let stones: { x: number; y: number; size: number; seed: number }[];
  if (cells.length === 4 && cells.every((c) => Math.abs(c.x - cells[0].x) <= 1 && Math.abs(c.y - cells[0].y) <= 1)) {
    const x = cells.reduce((s, c) => s + c.x, 0) / 4, y = cells.reduce((s, c) => s + c.y, 0) / 4;
    stones = [{ x, y, size: 2.15, seed: b.seed }];
  } else
    stones = cells.map((c, i) => ({
      x: c.x + (hash01(b.seed, i, 495) - 0.5) * 0.2, y: c.y + (hash01(b.seed, i, 496) - 0.5) * 0.2,
      size: (cells.length > 1 ? 1.15 : 1.3) + hash01(b.seed, i, 497) * 0.3, seed: hash(b.seed, i, 498),
    }));
  if (!stones.some((s) => nearClip(s.x, s.y, s.size + 0.5))) return;
  stones.sort((a, c) => a.y - c.y);
  for (const s of stones) {
    const sp = rockSprite(s.size, s.seed);
    stamp(out, sp, Math.round(s.x * ART) - sp.ox + 2, Math.round(s.y * ART) - sp.oy + 2, true);
  }
  for (const s of stones) {
    const sp = rockSprite(s.size, s.seed);
    stamp(out, sp, Math.round(s.x * ART) - sp.ox, Math.round(s.y * ART) - sp.oy, false);
  }
}

/** A piece flying off a felled or burning tree: a leaf, a splinter, an
 * ember, a puff of smoke or a flake of ash. */
type Debris = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; colour: string; size: number; kind: "leaf" | "chip" | "ember" | "smoke" | "ash"; spin: number };

/** What the trees stand over: anyone's position and size, in cells, and
 * whether they walk (`foot`), to push the ash about. */
export type Beneath = { x: number; y: number; size: number; foot?: boolean };

/** A pile of ash: its grains' places in art pixels from its middle, pushed
 * about by those walking through, and their shades. */
export type AshPile = { x: number; y: number; r: number; gx: Float32Array; gy: Float32Array; shade: Uint8Array };

/** A pile of ash for `a`, heaped toward its middle: grains spread by its
 * own hashes, charcoal in among the grey, the palest on top. */
export function ashPile(a: { x: number; y: number; r: number; size: number; seed: number }): AshPile {
  const n = 22 + a.size * 16, R = 2.5 + a.size * 2;
  const gx = new Float32Array(n), gy = new Float32Array(n), shade = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const ang = hash01(a.seed, k, 530) * Math.PI * 2, d = R * Math.sqrt(hash01(a.seed, k, 531)) * (0.5 + 0.5 * hash01(a.seed, k, 532));
    gx[k] = Math.cos(ang) * d;
    gy[k] = Math.sin(ang) * d * 0.8;
    const h = hash(a.seed, k, 533) % 9;
    shade[k] = h === 0 ? 0 : d < R * 0.35 ? (h < 5 ? 4 : 3) : h < 4 ? 1 : h < 7 ? 2 : 3;
  }
  return { x: a.x, y: a.y, r: (R + 3) / ART, gx, gy, shade };
}

/** Soldiers whose sword or blade saws a tree clean through. */
const BLADES = new Set(["sword", "hero", "assassin", "valkyrie", "reinforcement"]);
/** Each frame, how many melee units at most are checked for strokes under
 * the frail trees. */
const STROKES = 4000;

/** A number for each sprite mask, so a building changing its sprite on the same lot is seen. */
const maskIds = new WeakMap<Uint8Array, number>();
let masks = 0;
const maskId = (m: Uint8Array) => maskIds.get(m) ?? (maskIds.set(m, ++masks), masks);

/** Draws the forest outside the walls, kept by the renderer. */
export class ForestArt {
  private map: CityMap | null = null;
  private artKey = "";
  private plan: ForestPlan | null = null;
  private river: ForestRiver | null = null;
  private sim: DefendSim | null | undefined = undefined;
  damage: ForestDamage | null = null;
  private seen = new WeakSet<object>();
  private debris: Debris[] = [];
  /** Birds startled out of the trees, and the trees that have any. */
  private birds = new Birds();
  private roosts: ForestTree[] = [];
  /** The ash piles burnt trees left, their grains pushed about. */
  piles: AshPile[] = [];
  private lastTime = -1;
  private alpha = new Float32Array(0);
  /** The ground's pixels and canvas, and the boxes of it to paint again
   * (none when it is up to date). */
  private floor: { px: Uint32Array; img: ImageData; cv: HTMLCanvasElement } | null = null;
  private floorStale: Box[] = [WHOLE];
  /** The trees' pixels, composed afresh at most every `REDRAW_MS`. */
  private crowns: { px: Uint32Array; img: ImageData; cv: HTMLCanvasElement } | null = null;
  /** The next band of rows to compose, and whether all are due, or a fade
   * needs them in still air. */
  private band = 0;
  private dirty = true;
  private blightVersion = -1;
  private shadowBlightVersion = -1;
  private witherStages = new Uint8Array(0);
  /** Invalidates overlays when damage or a thinning crown changes the floor. */
  floorVersion = 0;
  private sun: Sun | undefined;
  private sunKey = "";
  setSun(sun?: Sun) {
    const key = sun ? `${Math.round(sun.x * 8)}:${Math.round(sun.y * 8)}:${Math.round(sun.strength / .27 * 4)}` : "";
    if (key === this.sunKey) return;
    this.sunKey = key; this.sun = sun ? { x: Math.round(sun.x * 8) / 8, y: Math.round(sun.y * 8) / 8, strength: Math.round(sun.strength / .27 * 4) / 4 * .27 } : undefined;
    this.floorStale = [WHOLE];
  }
  private fading = false;
  /** Bucketed beneath-the-trees lists, reused each frame. */
  private head = new Int32Array(CELL_COUNT);
  private next = new Int32Array(0);
  /** Shots and fireballs in flight last frame: where each was, and the
   * frame it was last seen. */
  private flying = new Map<object, { x: number; y: number; fire: number; frame: number }>();
  private frame = 0;
  /** Each melee unit's cooldown last frame, under the frail trees only: a
   * jump up is a stroke. */
  private cooldowns = new Map<object, number>();
  /** 1 on each cell a frail tree stands over, by the damage's version. */
  private frail = new Uint8Array(CELL_COUNT);
  private frailVersion = -1;

  /** Plans the forest for `map`, and gives each new run a forest whole again. */
  sync(map: CityMap, sim: DefendSim | null) {
    const key = pixelKey();
    if (key !== this.artKey) {
      this.artKey = key;
      this.floorStale = [WHOLE];
      this.dirty = true;
    }
    if (map !== this.map) {
      this.map = map;
      this.plan = forestPlan(map);
      this.river = forestRiver(map);
      this.roosts = this.plan.trees.filter((t) => roosting(t) > 0);
      this.glints = null;
      this.alpha = new Float32Array(this.plan.trees.length).fill(1);
      this.covered = undefined;
      this.coverKey = "";
      this.sim = undefined;
    }
    if (sim !== this.sim) {
      this.sim = sim;
      this.damage = new ForestDamage(this.plan!);
      this.debris = [];
      this.birds.reset();
      this.piles = [];
      this.flying.clear();
      this.cooldowns.clear();
      this.frailVersion = -1;
      this.lastTime = -1;
      this.blightVersion = this.shadowBlightVersion = -1;
      this.witherStages = new Uint8Array(this.plan!.trees.length);
      this.dirty = true;
      this.floorStale = [WHOLE];
    }
  }

  /** The floor's art pixels a scenario's buildings stand on, left clear,
   * and what they were made from. */
  private covered: Uint8Array | undefined;
  private coverKey = "";

  /** Leaves the floor clear under a scenario's buildings, placed on lots the
   * plan took for open ground: under each sprite's own solid pixels
   * (`mask`, art pixels from `x0`, `y0`), so it stands on the forest floor
   * with no lot round it, or the whole `rect` without one (rubble). */
  cover(parts: readonly { rect: Rect; mask?: Footprint | null }[]) {
    const key = parts.map((p) => [p.rect.x, p.rect.y, p.rect.w, p.rect.h, p.mask ? p.mask.x0 + ":" + p.mask.y0 + ":" + maskId(p.mask.mask) : "-"].join(",")).join(";");
    if (key === this.coverKey) return;
    this.coverKey = key;
    const next = parts.length ? new Uint8Array(W * H) : undefined;
    for (const { rect: r, mask: f } of parts) {
      if (f)
        for (let y = 0; y < f.h; y++)
          for (let x = 0; x < f.w; x++) {
            const X = f.x0 + x, Y = f.y0 + y;
            if (f.mask[y * f.w + x] && X >= 0 && Y >= 0 && X < W && Y < H) next![Y * W + X] = 1;
          }
      else for (let Y = r.y * ART; Y < (r.y + r.h) * ART; Y++) next!.fill(1, Y * W + r.x * ART, Y * W + (r.x + r.w) * ART);
    }
    this.covered = next;
    this.floorStale = [WHOLE];
  }

  /** A scenario foundation clears trees through the existing forest art state. */
  clearBuilding(rect: Rect) {
    if (!this.damage) return;
    const x = rect.x + rect.w / 2,
      y = rect.y + rect.h / 2,
      r = Math.sqrt(rect.w * rect.w + rect.h * rect.h) / 2 + 0.5;
    this.damage.blast(x, y, r, 0);
    this.bare(x, y, r);
    this.dirty = true;
    this.floorStale = [WHOLE];
  }

  /** Brings down the trees the battle's attacks reach (struck apart, blown
   * up or set alight), burns the burning down to ash, moves the debris on
   * battle time, pushes the ash about and fades the trees over anyone under
   * them. */
  update(sim: DefendSim | null, beneath: readonly Beneath[], dt: number, reduceMotion: boolean) {
    this.bucket(beneath);
    if (sim && this.damage) {
      const damage = this.damage, now = sim.time;
      const step = this.lastTime < 0 ? 0 : Math.max(0, Math.min(0.25, now - this.lastTime));
      this.lastTime = now;
      const felled: Felled[] = [], lit: ForestTree[] = [];
      // Fire first, so a fireball's own blast leaves the trees it lit burning.
      this.landed(sim, now, felled, lit, reduceMotion);
      for (const b of sim.blazes)
        if (this.first(b)) {
          lit.push(...damage.ignite(b.x, b.y, b.r, now));
          this.bare(b.x, b.y, b.r, true);
        }
      for (const f of sim.flames) if (this.first(f)) lit.push(...damage.igniteAlong(f.x, f.y, f.x + f.dx * f.range, f.y + f.dy * f.range, 0.5, now));
      for (const e of sim.effects)
        if (e.kind === "boom" && this.first(e)) {
          if (!reduceMotion) this.spook(e.x, e.y, e.r + 2, now);
          felled.push(...damage.blast(e.x, e.y, e.r, 1 + Math.min(1.5, e.r * 0.4)));
          this.bare(e.x, e.y, e.r);
        }
      for (const s of sim.swings) {
        if (!this.first(s)) continue;
        if (s.kind === "spin") felled.push(...damage.blast(s.x, s.y, s.r, 0.7)), this.bare(s.x, s.y, s.r);
        else if (s.kind === "dash") felled.push(...damage.cut(s.x, s.y, s.x1, s.y1, 0.35));
      }
      for (const s of sim.stabs) if (this.first(s)) felled.push(...damage.cut(s.x0, s.y0, s.x1, s.y1, 0.3));
      for (const b of sim.bolts)
        if (this.first(b)) for (let k = 0; k + 1 < b.pts.length; k += 2) felled.push(...damage.hit(b.pts[k], b.pts[k + 1]));
      this.strokes(sim, felled);
      felled.push(...damage.burnOut(now));
      if (lit.length) this.dirty = true;
      for (const f of felled) {
        this.dirty = true;
        // Its crater, stump or ash, and the shadow it no longer casts.
        const t = f.tree, reach = t.r * 2 + 1.5;
        this.stale({ x0: Math.floor((t.x - reach) * ART), y0: Math.floor((t.y - reach) * ART), x1: Math.ceil((t.x + reach) * ART), y1: Math.ceil((t.y + reach) * ART) });
        if (f.fate === "burnt") this.piles.push(ashPile(damage.ash[damage.ash.length - 1]));
        if (!reduceMotion) this.burst(f), this.birds.flush(f.tree, f.fromX, f.fromY, now);
      }
      if (!reduceMotion) {
        // Fire sends the birds up whichever way.
        for (const t of lit) this.birds.flush(t, t.x, t.y, now);
        this.birds.update(step);
      }
      if (!reduceMotion) this.smoulder(step);
      this.drift(step);
      this.trample(beneath);
    }
    this.fade(beneath, dt, reduceMotion, sim && !reduceMotion ? this.lastTime : -1);
  }

  /** Startles the birds out of the standing trees within `reach` cells of
   * (x, y) (past their canopy's edge), away from it. */
  private spook(x: number, y: number, reach: number, now: number) {
    const damage = this.damage;
    for (const t of this.roosts) {
      const r = t.r + reach, dx = t.x - x, dy = t.y - y;
      if (dx * dx + dy * dy < r * r && damage?.standing(t)) this.birds.flush(t, x, y, now);
    }
  }

  /** Arrows, bullets and bolts that landed since last frame strike apart the
   * frail tree they came down under (a fire arrow sets it alight instead),
   * and fireballs that landed set alight the trees round where they burst. */
  private landed(sim: DefendSim, now: number, felled: Felled[], lit: ForestTree[], reduceMotion: boolean) {
    const damage = this.damage!, frame = ++this.frame;
    const track = (o: object, x: number, y: number, fire: number) => {
      const was = this.flying.get(o);
      if (was) was.x = x, was.y = y, was.fire = fire, was.frame = frame;
      else this.flying.set(o, { x, y, fire, frame });
    };
    for (const a of sim.arrows) track(a, a.x, a.y, a.burn ? 0.3 : 0);
    for (const b of sim.ballistaBolts) track(b, b.x, b.y, 0);
    for (const f of sim.fireballs) track(f, f.x1, f.y1, f.r);
    for (const [o, at] of this.flying) {
      if (at.frame === frame) continue;
      this.flying.delete(o);
      if (!reduceMotion) this.spook(at.x, at.y, 0.6, now);
      if (at.fire) lit.push(...damage.ignite(at.x, at.y, at.fire, now));
      else felled.push(...damage.hit(at.x, at.y));
    }
  }

  /** A melee stroke (a unit's cooldown jumping back up) under a frail tree
   * strikes it apart: sawn clean by a blade, else splintered. */
  private strokes(sim: DefendSim, felled: Felled[]) {
    const damage = this.damage!;
    if (this.frailVersion !== damage.version) {
      this.frailVersion = damage.version;
      for (let k = 0; k < CELL_COUNT; k++) this.frail[k] = damage.frailOver(k % CELLS_W, Math.floor(k / CELLS_W)) ? 1 : 0;
    }
    const was = this.cooldowns, now = new Map<object, number>();
    const look = (u: { x: number; y: number; cd: number }, cut: boolean) => {
      const cx = Math.floor(u.x), cy = Math.floor(u.y);
      if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H || !this.frail[cellIndex(cx, cy)] || now.size >= STROKES) return;
      const before = was.get(u);
      now.set(u, u.cd);
      if (before !== undefined && u.cd > before + 0.05) felled.push(...damage.hit(u.x, u.y, u.x, u.y, cut));
    };
    for (const s of sim.soldiers) if (isMelee(s)) look(s, BLADES.has(s.kind));
    for (const e of sim.enemies) if (!ENEMIES[e.kind].flying) look(e, false);
    this.cooldowns = now;
  }

  /** Clears the grass `r` cells round (x, y) to dirt, scorched if `burnt`. */
  private bare(x: number, y: number, r: number, burnt = false) {
    if (!this.damage?.clear(x, y, r, burnt)) return;
    const reach = r * 1.3 + 0.5;
    this.stale({ x0: Math.floor((x - reach) * ART), y0: Math.floor((y - reach) * ART), x1: Math.ceil((x + reach) * ART), y1: Math.ceil((y + reach) * ART) });
  }

  /** Marks `box` of the ground to paint again: merged into a box it
   * overlaps, else kept apart, so blasts all over the board don't repaint
   * all of it. */
  private stale(box: Box): void {
    const list = this.floorStale;
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (b.x0 > box.x1 || box.x0 > b.x1 || b.y0 > box.y1 || box.y0 > b.y1) continue;
      list.splice(k, 1);
      return this.stale({ x0: Math.min(b.x0, box.x0), y0: Math.min(b.y0, box.y0), x1: Math.max(b.x1, box.x1), y1: Math.max(b.y1, box.y1) });
    }
    list.push(box);
  }

  /** True the first time `o` is seen. */
  private first(o: object) {
    if (this.seen.has(o)) return false;
    this.seen.add(o);
    return true;
  }

  /** A felled tree's pieces, flung from the cause: leaves, clumps and
   * splinters, or for a burnt one its last embers and a puff of ash. */
  private burst({ tree: t, fromX, fromY, force, fate }: Felled) {
    const pal = LEAVES[t.kind][t.variant % LEAVES[t.kind].length];
    const n = Math.round((fate === "burnt" ? 10 : 14) + Math.min(t.r, 1.6) * 30);
    const d = Math.sqrt((t.x - fromX) ** 2 + (t.y - fromY) ** 2) || 1, ax = (t.x - fromX) / d, ay = (t.y - fromY) / d;
    for (let i = 0; i < n && this.debris.length < MAX_DEBRIS; i++) {
      const a = fx() * Math.PI * 2, sp = (0.6 + fx() * 1.8) * force;
      if (fate === "burnt") {
        const ember = i % 3 === 0;
        this.debris.push({
          x: t.x + Math.cos(a) * t.r * 0.7 * fx(), y: t.y + Math.sin(a) * t.r * 0.7 * fx(), z: 0.4 + fx() * 0.6,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: ember ? 0.6 + fx() : 0.2 + fx() * 0.4,
          age: 0, life: ember ? 1 + fx() : 1.5 + fx() * 1.5,
          colour: ember ? FLAME[2 + Math.floor(fx() * 3)] : hex(ASH[1 + Math.floor(fx() * 4)]), size: 1, kind: ember ? "ember" : "ash", spin: fx() * 6.28,
        });
        continue;
      }
      const leaf = i % 7 !== 0;
      this.debris.push({
        x: t.x + Math.cos(a) * t.r * 0.6 * fx(), y: t.y + Math.sin(a) * t.r * 0.6 * fx(), z: 0.3 + fx() * 0.4,
        vx: Math.cos(a) * sp * 0.6 + ax * sp, vy: Math.sin(a) * sp * 0.6 + ay * sp, vz: 1 + fx() * 2.2 * force,
        age: 0, life: leaf ? 2.5 + fx() * 2.5 : 1.6 + fx() * 1.6,
        colour: hex(leaf ? pal[1 + Math.floor(fx() * 3)] : BARK[Math.floor(fx() * 2)]),
        size: leaf ? (i % 7 === 1 ? 2 : 1) : 2, kind: leaf ? "leaf" : "chip", spin: fx() * 6.28,
      });
    }
  }

  /** Burning trees throw up embers and smoke as they burn. */
  private smoulder(dt: number) {
    if (!dt) return;
    for (const b of this.damage?.burning ?? []) {
      const t = b.tree, rate = (2 + t.r * 5) * dt;
      for (let k = 0; k < 3 && fx() < rate && this.debris.length < MAX_DEBRIS; k++) {
        const a = fx() * Math.PI * 2, d = t.r * 0.7 * Math.sqrt(fx()), smoke = fx() < 0.45;
        this.debris.push({
          x: t.x + Math.cos(a) * d, y: t.y + Math.sin(a) * d, z: 0.5,
          vx: (fx() - 0.5) * 0.3 + 0.15, vy: (fx() - 0.5) * 0.2, vz: smoke ? 0.5 + fx() * 0.3 : 0.9 + fx() * 0.8,
          age: 0, life: smoke ? 1.6 + fx() : 0.6 + fx() * 0.6,
          colour: smoke ? SMOKE[1 + Math.floor(fx() * 3)] : FLAME[2 + Math.floor(fx() * 3)], size: smoke ? 2 : 1, kind: smoke ? "smoke" : "ember", spin: fx() * 6.28,
        });
      }
    }
  }

  /** Debris flies, falls (leaves flutter down slowly) and settles, fading;
   * embers and smoke rise and drift downwind. */
  private drift(dt: number) {
    if (!dt || !this.debris.length) return;
    for (const p of this.debris) {
      p.age += dt;
      if (p.kind === "ember" || p.kind === "smoke") {
        p.z += p.vz * dt;
        p.x += p.vx * dt + Math.sin(p.spin + p.age * 3) * 0.1 * dt;
        p.y += p.vy * dt;
        continue;
      }
      const light = p.kind === "leaf" || p.kind === "ash";
      const drag = Math.max(0, 1 - (light ? 2.2 : 1.2) * dt);
      p.vx *= drag;
      p.vy *= drag;
      if (p.z > 0) {
        p.vz -= (light ? 2.2 : 7) * dt;
        if (light) p.vz = Math.max(p.vz, -0.45);
        p.z = Math.max(0, p.z + p.vz * dt);
        p.spin += dt * 7;
        p.x += p.vx * dt + (light ? Math.sin(p.spin) * 0.25 * dt : 0);
        p.y += p.vy * dt;
      } else {
        p.vx = p.vy = 0;
      }
    }
    this.debris = this.debris.filter((p) => p.age < p.life);
  }

  /** Those walking through a pile of ash push its grains out of their way. */
  private trample(beneath: readonly Beneath[]) {
    if (!this.piles.length || !beneath.length) return;
    const head = this.head;
    for (const pile of this.piles) {
      const x0 = Math.max(0, Math.floor(pile.x - pile.r - 1)), x1 = Math.min(CELLS_W - 1, Math.floor(pile.x + pile.r + 1));
      const y0 = Math.max(0, Math.floor(pile.y - pile.r - 1)), y1 = Math.min(CELLS_H - 1, Math.floor(pile.y + pile.r + 1));
      for (let cy = y0; cy <= y1; cy++)
        for (let cx = x0; cx <= x1; cx++)
          for (let i = head[cellIndex(cx, cy)]; i >= 0; i = this.next[i]) {
            const u = beneath[i];
            if (u.foot === false) continue;
            const ux = (u.x - pile.x) * ART, uy = (u.y - pile.y) * ART, reach = u.size * ART * 0.5 + 1;
            for (let k = 0; k < pile.gx.length; k++) {
              const dx = pile.gx[k] - ux, dy = pile.gy[k] - uy, d2 = dx * dx + dy * dy;
              if (d2 >= reach * reach) continue;
              const d = Math.sqrt(d2) || 0.01;
              pile.gx[k] = ux + (dx / d) * reach;
              pile.gy[k] = uy + (dy / d) * reach;
            }
          }
    }
  }

  /** Everyone under the trees, bucketed by cell. */
  private bucket(beneath: readonly Beneath[]) {
    const head = this.head;
    head.fill(-1);
    if (this.next.length < beneath.length) this.next = new Int32Array(beneath.length * 2);
    beneath.forEach((u, i) => {
      const cx = Math.floor(u.x), cy = Math.floor(u.y);
      if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H) return;
      const k = cellIndex(cx, cy);
      this.next[i] = head[k];
      head[k] = i;
    });
  }

  /** Each tree eases toward `UNDER_ALPHA` while anyone stands under it. */
  private fade(beneath: readonly Beneath[], dt: number, reduceMotion: boolean, now = -1) {
    const plan = this.plan;
    if (!plan) return;
    const head = this.head;
    const step = reduceMotion ? 1 : Math.min(1, dt * FADE);
    for (const t of plan.trees) {
      let covered = false;
      if (beneath.length) {
        const x0 = Math.max(0, Math.floor(t.x - t.r - 2)), x1 = Math.min(CELLS_W - 1, Math.floor(t.x + t.r + 2));
        const y0 = Math.max(0, Math.floor(t.y - t.r - 2)), y1 = Math.min(CELLS_H - 1, Math.floor(t.y + t.r + 2));
        for (let cy = y0; cy <= y1 && !covered; cy++)
          for (let cx = x0; cx <= x1 && !covered; cx++)
            for (let i = head[cellIndex(cx, cy)]; i >= 0; i = this.next[i]) {
              const u = beneath[i], r = t.r + u.size / 2, dx = u.x - t.x, dy = u.y - t.y;
              if (dx * dx + dy * dy < r * r) {
                covered = true;
                // Someone passing under a tree startles its birds.
                if (now >= 0 && this.damage?.standing(t)) this.birds.flush(t, u.x, u.y, now);
                break;
              }
            }
      }
      const goal = covered ? UNDER_ALPHA : 1, a = this.alpha[t.id];
      if (a === goal) continue;
      this.alpha[t.id] = a < goal ? Math.min(goal, a + step) : Math.max(goal, a - step);
      this.fading = true;
    }
  }

  /** The forest's ground, then the ash piles on it, at `alpha` (its area's
   * share of a crossfade). */
  drawFloor(c: CanvasRenderingContext2D, px: number, alpha: number) {
    if (!this.plan || alpha <= 0 || typeof document === "undefined") return;
    const blight = this.sim?.blight;
    if (blight && blight.version !== this.shadowBlightVersion) {
      this.shadowBlightVersion = blight.version;
      for (const t of this.plan.trees) {
        const stage = blight.treeStage(t.x, t.y, t.r);
        if (stage === this.witherStages[t.id]) continue;
        this.witherStages[t.id] = stage;
        const reach = t.r * 2 + 2;
        this.floorStale.push({ x0: Math.floor((t.x - reach) * ART), y0: Math.floor((t.y - reach) * ART), x1: Math.ceil((t.x + reach) * ART), y1: Math.ceil((t.y + reach) * ART) });
      }
    }
    this.floor ??= surface();
    const boxes = this.floorStale;
    this.floorStale = [];
    if (boxes.length) this.floorVersion++;
    for (const box of boxes) {
      paintFloor(this.floor.px, this.plan, this.damage, box, this.river, this.covered, blight, this.sun);
      const x0 = Math.max(0, box.x0), y0 = Math.max(0, box.y0);
      this.floor.cv.getContext("2d")!.putImageData(this.floor.img, 0, 0, x0, y0, Math.min(W, box.x1) - x0, Math.min(H, box.y1) - y0);
    }
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha = alpha;
    c.drawImage(this.floor.cv, 0, 0, CELLS_W * px, CELLS_H * px);
    if (this.piles.length) {
      const dot = artPen(c, px);
      for (const p of this.piles) {
        const ox = p.x * ART, oy = p.y * ART;
        for (let k = 0; k < p.gx.length; k++) {
          // Pale ash heaped up in lumps, charcoal and grey grains about it.
          const sh = p.shade[k], lump = sh >= 3 ? 2 : 1;
          c.fillStyle = ASH_HEX[sh];
          dot(Math.round(ox + p.gx[k]), Math.round(oy + p.gy[k]), lump, lump);
        }
      }
    }
    c.restore();
  }

  /** The forest's plan, once synced (the grass plans its blades on it). */
  get forestPlan() {
    return this.plan;
  }

  /** The lakes' glints twinkling on the wall clock (`now`, ms), at
   * `alpha`; held still under Reduce Motion. */
  drawWater(c: CanvasRenderingContext2D, px: number, now: number, alpha: number, still: boolean) {
    if (!this.plan || alpha <= 0 || !this.plan.lakes.length) return;
    this.glints ??= waterGlints(this.plan);
    const dot = artPen(c, px), t = still ? 0 : now / 1000;
    c.save();
    c.fillStyle = hex(GLINT);
    for (const g of this.glints) {
      const v = Math.sin(t * g.rate + g.phase);
      if (v < 0.55) continue;
      c.globalAlpha = alpha * Math.min(1, (v - 0.55) * 4);
      // A glint drifts a pixel or two with the swell as it shines.
      dot(g.x + Math.round(Math.sin(t * 0.5 + g.phase) * 1.5), g.y, v > 0.9 ? g.len + 1 : g.len, 1);
    }
    c.restore();
  }
  private glints: ReturnType<typeof waterGlints> | null = null;

  /** The standing trees over everyone, leaning in the wind (`wind`: 0 for
   * still air, about 1 calm, 2 in rain), then the flying debris. `shade`
   * darkens them with the city below, drawn in board pixels. */
  drawTrees(c: CanvasRenderingContext2D, px: number, o: { now: number; alpha: number; wind: number; still?: boolean; shade?: (o: CanvasRenderingContext2D) => void }) {
    const plan = this.plan;
    if (!plan || o.alpha <= 0 || typeof document === "undefined") return;
    this.crowns ??= surface();
    // Swaying, one band of rows is composed afresh a frame, round and round;
    // a felled tree, or a fade in still air, has them all composed at once.
    const t = Math.floor(o.now / REDRAW_MS) * REDRAW_MS / 1000;
    const blight = this.sim?.blight;
    const changed = (blight?.version ?? -1) !== this.blightVersion;
    this.blightVersion = blight?.version ?? -1;
    const all = this.dirty || (!o.wind && (this.fading || changed));
    const bands = all ? Array.from({ length: BANDS }, (_, k) => k) : o.wind ? [this.band] : [];
    this.dirty = this.fading = false;
    this.band = (this.band + 1) % BANDS;
    const cc = this.crowns.cv.getContext("2d")!;
    for (const k of bands) {
      const y0 = Math.floor((k * H) / BANDS), y1 = Math.floor(((k + 1) * H) / BANDS);
      composeCrowns(this.crowns.px, plan, this.damage, this.alpha, t, o.wind, y0, y1, blight);
      cc.putImageData(this.crowns.img, 0, 0, 0, y0, W, y1 - y0);
      if (o.shade) {
        cc.save();
        cc.beginPath();
        cc.rect(0, y0, W, y1 - y0);
        cc.clip();
        cc.setTransform(ART / px, 0, 0, ART / px, 0, 0);
        cc.globalCompositeOperation = "source-atop";
        o.shade(cc);
        cc.restore();
      }
    }
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha = o.alpha;
    c.drawImage(this.crowns.cv, 0, 0, CELLS_W * px, CELLS_H * px);
    this.drawBurning(c, px, o.still ? 0 : o.now);
    this.drawDebris(c, px);
    this.birds.draw(c, px);
    c.restore();
  }

  /** Trees on fire: the crown charring black as it burns, flames licking
   * up from it, rising then dying down, over a warm glow. */
  private drawBurning(c: CanvasRenderingContext2D, px: number, now: number) {
    const burning = this.damage?.burning;
    if (!burning?.length) return;
    const dot = artPen(c, px), base = c.globalAlpha, time = Math.max(0, this.lastTime);
    for (const b of burning) {
      const t = b.tree, p = Math.max(0, Math.min(1, (time - b.since) / BURN));
      const sprite = charSprite(t.kind, t.variant, t.size, Math.min(4, 1 + Math.floor(p * 4)), this.sim?.blight.treeStage(t.x, t.y, t.r) ?? 0);
      const x = Math.round(t.x * ART), y = Math.round(t.y * ART), s = treeSprite(t.kind, t.variant, 0, t.size);
      drawSprite(c,sprite, ((x - s.ox) * px) / ART, ((y - s.oy) * px) / ART, (s.w * px) / ART, (s.h * px) / ART);
      // Flames grow over the first second, roar, then die down at the end.
      const heat = Math.min(1, p * 4) * (p > 0.75 ? (1 - p) * 4 : 1);
      if (heat <= 0) continue;
      const R = t.r * ART;
      const gx = (x * px) / ART, gy = (y * px) / ART, gr = (R * 1.6 * px) / ART, glow = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
      glow.addColorStop(0, "rgba(240,138,52,0.35)");
      glow.addColorStop(1, "rgba(240,138,52,0)");
      c.globalAlpha = base * heat;
      c.globalCompositeOperation = "lighter";
      c.fillStyle = glow;
      c.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = base;
      const tongues = 2 + t.size * 3;
      for (let k = 0; k < tongues; k++) {
        const a = hash01(t.id, k, 540) * Math.PI * 2, d = R * 0.65 * Math.sqrt(hash01(t.id, k, 541));
        const fx0 = Math.round(x + Math.cos(a) * d), fy0 = Math.round(y + Math.sin(a) * d);
        const flick = 0.65 + 0.35 * Math.sin(now * 0.011 + k * 2.3 + t.id) * Math.sin(now * 0.017 + k);
        const h = Math.max(2, Math.round((3 + t.size * 2) * heat * flick)), w = t.size >= 2 ? 3 : 2;
        // A dark rim, then the tongue hottest at its tip.
        c.fillStyle = "#2a0c06";
        dot(fx0 - 1, fy0 - h - 1, w + 2, h + 2);
        for (let row = 0; row < h; row++) {
          const f = row / h;
          c.fillStyle = FLAME[f < 0.3 ? 1 : f < 0.6 ? 2 : f < 0.85 ? 3 : 4];
          const narrow = row >= h - 1 && w > 1 ? 1 : 0;
          dot(fx0 + narrow, fy0 - row - 1, w - narrow * (w > 2 ? 2 : 1), 1);
        }
      }
    }
    c.globalAlpha = base;
  }

  /** Leaves and splinters, each lifted by its height above the ground. */
  private drawDebris(c: CanvasRenderingContext2D, px: number) {
    if (!this.debris.length) return;
    const dot = artPen(c, px), base = c.globalAlpha;
    for (const p of this.debris) {
      c.globalAlpha = base * Math.min(1, (p.life - p.age) / 0.8);
      const ax = Math.round(p.x * ART), ay = Math.round((p.y - p.z) * ART);
      if (p.kind === "chip") {
        c.fillStyle = "#0b0907";
        dot(ax - 1, ay - 1, 4, 3);
      }
      c.fillStyle = p.colour;
      // A leaf turning over shows edge on, now and then; smoke swells.
      const flat = p.kind !== "leaf" || Math.sin(p.spin) > -0.5;
      const size = p.kind === "smoke" ? p.size + Math.floor((p.age / p.life) * 2) : flat ? p.size : 1;
      dot(ax, ay, size, p.kind === "smoke" ? size : 1);
    }
    c.globalAlpha = base;
  }

  /** How many trees are standing, and how many debris pieces fly (tests). */
  get counts() {
    const trees = this.plan?.trees ?? [];
    return { trees: trees.length, standing: trees.filter((t) => this.damage?.standing(t) ?? true).length, debris: this.debris.length };
  }
}

/** Charred crowns by kind, size, variant and char level. */
const charred = new Map<string, HTMLCanvasElement>();

/** Tree `kind`, variant `v` of `size` burning, unleant, at char `level` 1
 * to 4: its leaves scorched toward black, more embers glowing in them the
 * further it has burnt, its outline kept. */
export function charPixels(kind: TreeKind, v: number, size: TreeSize, level: number, stage: WitherStage = 0): Uint32Array {
  const s = witheredTreeSprite(treeSprite(kind, v, 0, size), stage, canopyRadius(kind, v, size), v);
  const out = new Uint32Array(s.px.length), k = level / 4;
  const ember = [rgba(0xd8602a), rgba(0xf6b048)];
  for (let i = 0; i < s.px.length; i++) {
    const p = s.px[i];
    if (!p || p === rgba(OUTLINE)) { out[i] = p; continue; }
    const r = p & 0xff, g = (p >> 8) & 0xff, b = (p >> 16) & 0xff, lum = (r + g + b) / 3;
    const h = hash(i, v, size, 542);
    if (level >= 2 && h % (16 - level * 2) === 0) { out[i] = ember[h & 1]; continue; }
    // Toward a char brown-black, lighter where the leaves were lit.
    const tr = 0x1a + lum * 0.25, tg = 0x14 + lum * 0.18, tb = 0x10 + lum * 0.12;
    out[i] = ((255 << 24) | (Math.round(b + (tb - b) * k) << 16) | (Math.round(g + (tg - g) * k) << 8) | Math.round(r + (tr - r) * k)) >>> 0;
  }
  return stage ? out : sourcePixels(ART_NAMES.scenery(`tree-${kind}-${size}-${v}-char-${level}`),s.w,s.h,()=>out);
}

function charSprite(kind: TreeKind, v: number, size: TreeSize, level: number, stage: WitherStage = 0) {
  const key = `${kind}:${v}:${size}:${level}:${stage}`;
  let cv = charred.get(key);
  if (cv) return cv;
  const s = treeSprite(kind, v, 0, size);
  cv=spriteCanvas(charPixels(kind,v,size,level,stage),s.w,s.h);
  charred.set(key, cv);
  return cv;
}

/** A board-sized canvas at one pixel an art pixel, with pixels to write. */
function surface() {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const img = cv.getContext("2d")!.createImageData(W, H);
  return { cv, img, px: new Uint32Array(img.data.buffer) };
}

/** Writes every standing tree, back to front, leaning at `time`, into
 * `out` between art rows `y0` and `y1`: whole where nobody is under it,
 * blended at its fade otherwise. */
export function composeCrowns(out: Uint32Array, plan: ForestPlan, damage: ForestDamage | null, alpha: Float32Array, time: number, wind: number, y0 = 0, y1 = H, blight?: BlightTrail) {
  out.fill(0, y0 * W, y1 * W);
  for (const t of plan.trees) {
    const ty = Math.round(t.y * ART), reach = t.r * ART * 1.3 + 8;
    if (ty + reach < y0 || ty - reach >= y1 || (damage && !damage.standing(t))) continue;
    const stage = blight?.treeStage(t.x, t.y, t.r) ?? 0;
    const source = treeSprite(t.kind, t.variant, stage === 3 ? 0 : leanOf(t, time, wind), t.size);
    const s = outlinedScenery(witheredTreeSprite(source, stage, t.r, t.variant)), runs = runsOf(s), px = s.px;
    const sx = Math.round(t.x * ART) - s.ox, sy = ty - s.oy, a = alpha[t.id] ?? 1;
    for (let k = 0; k < runs.length; k += 3) {
      const Y = sy + runs[k];
      if (Y < y0 || Y >= y1) continue;
      const row = runs[k] * s.w, xa = Math.max(runs[k + 1], -sx), xb = Math.min(runs[k + 2], W - sx), at = Y * W + sx;
      if (a >= 1) for (let x = xa; x < xb; x++) out[at + x] = px[row + x];
      else for (let x = xa; x < xb; x++) out[at + x] = blend(px[row + x], out[at + x], a);
    }
  }
}

/** Opaque pixel `p` at opacity `a` over `under` (either opaque or clear). */
function blend(p: number, under: number, a: number) {
  const ua = (under >>> 24) / 255, oa = a + ua * (1 - a), k = a / oa;
  const ch = (sh: number) => Math.round(((p >>> sh) & 0xff) * k + ((under >>> sh) & 0xff) * (1 - k));
  return ((Math.round(oa * 255) << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}

/** How far tree `t` leans at `time` seconds in `wind`: its own sway plus a
 * gust rolling east across the board, in whole art pixels. */
export function leanOf(t: ForestTree, time: number, wind: number) {
  if (!wind) return 0;
  const sway = 0.55 * Math.sin(time * 1.7 + t.phase) + 0.6 * Math.max(0, Math.sin(time * 0.6 - t.x * 0.19 - t.y * 0.06));
  const k = (t.kind === "bush" ? 0.55 : t.kind === "pine" ? 0.8 : 1) * (1 - t.size * 0.12);
  return Math.max(-LEAN, Math.min(LEAN, Math.round(sway * wind * k * 1.3)));
}

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export function forestPieces(): ArtPiece[] {
  const pieces: ArtPiece[]=[];
  for(const kind of ["oak","pine","bush"] as TreeKind[])for(let size=0;size<4;size++)for(let v=0;v<VARIANTS;v++){
    for(let lean=-LEAN;lean<=LEAN;lean++){
      const s=treeSprite(kind,v,lean,size as TreeSize);
      pieces.push({name:ART_NAMES.scenery(`tree-${kind}-${size}-${v}-${lean}`),w:s.w,h:s.h,about:`${kind}, size ${size}, variant ${v}, lean ${lean}`,pixels:()=>treeSprite(kind,v,lean,size as TreeSize).px});
    }
    for(let level=1;level<=4;level++){
      const s=treeSprite(kind,v,0,size as TreeSize);
      pieces.push({name:ART_NAMES.scenery(`tree-${kind}-${size}-${v}-char-${level}`),w:s.w,h:s.h,about:`Charred ${kind}, size ${size}, variant ${v}, stage ${level}`,pixels:()=>charPixels(kind,v,size as TreeSize,level)});
    }
  }
  const seen=new Set<string>();
  for(let size=.25;size<=3;size+=.125)for(let seed=0;seed<64;seed++){
    const s=rockSprite(size,seed),name=ART_NAMES.scenery(`rock-${s.w}x${s.h}-${seed}`);
    if(seen.has(name))continue;seen.add(name);
    pieces.push({name,w:s.w,h:s.h,about:`Rock ${s.w} × ${s.h}, variant ${seed}`,pixels:()=>rockSprite(size,seed).px});
  }
  for(let size=0;size<4;size++)for(let seed=0;seed<8;seed++)for(const cut of [false,true]){
    const s=stumpSprite(size as TreeSize,seed,cut);
    pieces.push({name:ART_NAMES.scenery(`stump-${size}-${seed}-${cut ? "cut" : "broken"}`),w:s.w,h:s.h,about:`Stump, size ${size}, variant ${seed}`,pixels:()=>stumpSprite(size as TreeSize,seed,cut).px});
  }
  for(let width=3;width<=9;width++)for(let height=3;height<=9;height++)for(let seed=0;seed<16;seed++){
    const cells:number[]=[];
    for(let y=10;y<10+height;y++)for(let x=10;x<10+width;x++)cells.push(cellIndex(x,y));
    const b={cells,seed},p=mountainSource(b);
    pieces.push({name:p.name,w:p.w,h:p.h,about:`Mountain base ${width} × ${height}, variant ${seed}; crags separate`,pixels:()=>mountainSource(b).px});
  }
  return pieces;
}
onPixelArt(()=>{sprites.length=0;rocks.clear();stumps.clear();charred.clear();});
