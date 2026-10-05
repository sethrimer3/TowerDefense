/** The streets as pixel art at `ART` pixels a cell, like the parks and
 * roofs: packed dirt in soft blotches of brown, darker along the kerbs and
 * worn lighter down the middle, flecked with grit and pebbles. Where a
 * street meets a park the grass grows out over it unevenly, a ragged edge
 * of turf, then a dithered band of worn grass, then the odd stray tuft;
 * and here and there the dirt bites back into the park's edge instead, so
 * the two blend instead of meeting at a ruled line. One wavering line
 * (`edge`) divides grass from dirt on both sides of the cells' boundary,
 * so the turf over a street and the bare patches in a park never meet
 * along the cell edge itself.
 *
 * Baked once per city (`groundArt`), transparent off the streets and the
 * bare patches, with `bare` marking the park pixels gone to dirt (the
 * live grass keeps off them) and `turf` the street pixels grassed over
 * (the live grass grows on them too). Presentation only. */
import { CELLS_H, CELLS_W, cellInBounds, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { ART } from "./park-art.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;

/** The park grass's two patch greens, its dark and light tufts. */
export const GRASS = { patch: ["#3d5e30", "#446834"], dark: "#2f4b26", light: "#56803f" };
/** The park grass patch colour of cell (cx, cy): patches are 2 × 2 cells. */
export const grassPatch = (cx: number, cy: number) => GRASS.patch[hash01(Math.floor(cx / 2), Math.floor(cy / 2), 50) < 0.5 ? 0 : 1];

/** Dirt, darkest first: pebble, kerb shade, the two blotch browns, worn. */
const DIRT = [0x463a2e, 0x55483a, 0x62523f, 0x6a5944, 0x786650];
/** Worn grass: half dirt, half turf, between the two. */
const WORN = [0x4f5434, 0x58603a];
const hex = (s: string) => parseInt(s.slice(1), 16);
const TURF = { patch: GRASS.patch.map(hex), dark: hex(GRASS.dark), light: hex(GRASS.light) };

export type GroundArt = {
  /** The street dirt, grass edges and bare patches, `W × H` art pixels. */
  canvas: HTMLCanvasElement | null;
  /** 1 on park art pixels worn to bare dirt. */
  bare: Uint8Array;
  /** 1 on street art pixels the park's grass grows over. */
  turf: Uint8Array;
};

const cache = new WeakMap<CityMap, GroundArt>();

/** `map`'s street art, baked on first use. */
export function groundArt(map: CityMap): GroundArt {
  let art = cache.get(map);
  if (!art) cache.set(map, (art = bake(map)));
  return art;
}

/** Whether art pixel (x, y) is park worn to bare dirt. */
export const bareAt = (art: GroundArt, x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && art.bare[y * W + x] === 1;
/** Whether art pixel (x, y) is street grassed over by a park beside it. */
export const turfAt = (art: GroundArt, x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && art.turf[y * W + x] === 1;

/** Opaque little-endian RGBA for 0xRRGGBB. */
const rgba = (c: number) => ((255 << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** Smooth value noise in [0, 1) at `scale` art pixels a lattice step. */
function noise(x: number, y: number, scale: number, salt: number) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash01(ix, iy, salt), b = hash01(ix + 1, iy, salt), c = hash01(ix, iy + 1, salt), d = hash01(ix + 1, iy + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const isGrass = (t: number) => t === CellType.PARK || t === CellType.WATER;

/** The nearest cell (of the eight round (cx, cy)) passing `want`, from art
 * pixel centre (x, y): its distance in art pixels, and which cell. */
function nearest(map: CityMap, cx: number, cy: number, x: number, y: number, want: (t: number) => boolean) {
  let best = Infinity, bx = 0, by = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if ((!dx && !dy) || !cellInBounds(nx, ny) || !want(map.type[cellIndex(nx, ny)])) continue;
      const ex = Math.max(nx * ART - x, 0, x - (nx + 1) * ART), ey = Math.max(ny * ART - y, 0, y - (ny + 1) * ART);
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d < best) (best = d), (bx = nx), (by = ny);
    }
  return { d: best, cx: bx, cy: by };
}

function bake(map: CityMap): GroundArt {
  const px = new Uint32Array(W * H), bare = new Uint8Array(W * H), turf = new Uint8Array(W * H);
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      const t = map.type[cellIndex(cx, cy)];
      if (t === CellType.ROAD) paintStreet(map, px, turf, cx, cy);
      else if (t === CellType.PARK) paintBare(map, px, bare, cx, cy);
    }
  let canvas: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext("2d")!;
    const img = c.createImageData(W, H);
    new Uint32Array(img.data.buffer).set(px);
    c.putImageData(img, 0, 0);
  }
  return { canvas, bare, turf };
}

/** Where grass gives way to dirt near art pixel (x, y), in art pixels from
 * the boundary between park and street cells: out over the street where
 * positive (a slow swell along the edge with a quicker ragged one on top),
 * into the park where the dirt bites back. Smooth, so the line it draws
 * runs on unbroken across the cells' boundary. */
const edge = (x: number, y: number) =>
  0.4 + noise(x, y, 7, 401) * 3.2 + noise(x, y, 2.5, 402) * 1.4 - Math.max(0, noise(x, y, 5, 430) - 0.5) * 11 - noise(x, y, 2, 431) * 0.8;

/** Worn grass is dithered over this many art pixels on the dirt side of
 * the edge. */
const WORN_BAND = 1.3;

/** One street cell's dirt, with the grass of any park beside it creeping in. */
function paintStreet(map: CityMap, px: Uint32Array, turf: Uint8Array, cx: number, cy: number) {
  for (let j = 0; j < ART; j++)
    for (let i = 0; i < ART; i++) {
      const x = cx * ART + i, y = cy * ART + j, mx = x + 0.5, my = y + 0.5;
      const park = nearest(map, cx, cy, mx, my, isGrass);
      const g = park.d - edge(x, y);
      const k = y * W + x;
      if (g < 0) {
        // Turf: the park's own patch green, flecked dark and light.
        const h = hash01(x, y, 410);
        px[k] = rgba(h < 0.12 ? TURF.dark : h > 0.92 ? TURF.light : grassPatch(park.cx, park.cy) === GRASS.patch[0] ? TURF.patch[0] : TURF.patch[1]);
        turf[k] = 1;
        continue;
      }
      if (g < WORN_BAND && ((x + y) & 1) === 0) {
        px[k] = rgba(WORN[hash(x, y, 411) & 1]);
        continue;
      }
      // A stray tuft or two further out, thinning with distance.
      if (park.d < 9 && hash01(x, y, 412) < 0.05 * (1 - park.d / 9)) {
        px[k] = rgba(TURF.light);
        if (j + 1 < ART) px[k + W] = rgba(TURF.dark);
        continue;
      }
      if (px[k]) continue; // The foot of a tuft above.
      px[k] = rgba(dirt(map, cx, cy, mx, my, x, y));
    }
}

/** The dirt colour at art pixel (x, y) of street cell (cx, cy). */
function dirt(map: CityMap, cx: number, cy: number, mx: number, my: number, x: number, y: number) {
  const h = hash01(x, y, 420);
  if (h < 0.025) return DIRT[0];
  // Blotches of two browns, their edges dithered.
  const blot = noise(x, y, 6, 421) + (((x + y) & 1) - 0.5) * 0.08;
  let shade = blot > 0.55 ? 3 : 2;
  // Darker against the kerbs (houses, walls, structures), worn lighter
  // down the middle of the way.
  const kerb = nearest(map, cx, cy, mx, my, (t) => t !== CellType.ROAD && !isGrass(t)).d;
  if (kerb < 1.2 || (kerb < 2.2 && h < 0.5)) shade = 1;
  else if (kerb > 9 && noise(x, y, 4, 422) > 0.62) shade = 4;
  if (h > 0.94) shade = Math.min(4, shade + 1);
  else if (h < 0.1) shade = Math.max(1, shade - 1);
  return DIRT[shade];
}

/** Bare patches where the dirt of a street beside park cell (cx, cy) bites
 * into its edge: wherever `edge` falls inside the park. */
function paintBare(map: CityMap, px: Uint32Array, bare: Uint8Array, cx: number, cy: number) {
  for (let j = 0; j < ART; j++)
    for (let i = 0; i < ART; i++) {
      const x = cx * ART + i, y = cy * ART + j;
      const road = nearest(map, cx, cy, x + 0.5, y + 0.5, (t) => t === CellType.ROAD).d;
      if (road > ART) continue;
      // How far past the edge, on its dirt side (negative: still grass).
      const g = -edge(x, y) - road;
      if (g < 0) continue;
      const k = y * W + x;
      bare[k] = 1;
      px[k] = rgba(g < WORN_BAND && ((x + y) & 1) === 0 ? WORN[hash(x, y, 432) & 1] : DIRT[hash01(x, y, 433) < 0.15 ? 1 : 2]);
    }
}
