/** The city tile's palette art: a corner of the city in the board's own
 * pixel art at `ART` pixels a cell, six cells square: two packed-dirt
 * streets crossing, darker along the kerbs and flecked with pebbles,
 * shingled roofs from `roof-art.ts` in their black outlines, and a little
 * park with a tree, everything casting its shadow down and to the right. */
import { hash, hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { roofPixels } from "./roof-art.ts";
import { OUTLINE, rgba, shade } from "./damage-art.ts";

/** Cells across the icon. */
export const TILE_ICON_CELLS = 6;
const N = TILE_ICON_CELLS * ART;

const DIRT = [0x463a2e, 0x55483a, 0x62523f, 0x6a5944, 0x786650];
const PEBBLE = [0x74664f, 0x857660, 0x918268];
const GRASS = [0x3d5e30, 0x446834, 0x56803f, 0x2f4b26];
const LEAF = { dark: 0x223b1c, mid: 0x2f5224, light: 0x45702f, top: 0x679c4e };
const FLOWER = [0xe8d57a, 0xe6e1d6, 0xc96a5a];

/** Houses: cell x, y, width, height and roof variant. */
const HOUSES: [number, number, number, number, number][] = [
  [0, 0, 2, 3, 0],
  [3, 0, 3, 2, 2],
  [3, 2, 3, 1, 5],
  [0, 4, 2, 2, 3],
  [3, 4, 1, 2, 1],
];
/** The park's cells, and its tree's centre and radius in art pixels. */
const PARK = { x: 4, y: 4, w: 2, h: 2 };
const TREE = { x: 5 * ART, y: 5 * ART - 1, r: 6.2 };
/** The streets: the column and the row they run along. */
const STREET = { col: 2, row: 3 };

/** The city tile icon as `N × N` RGBA pixels. */
export function cityTilePixels(): Uint32Array {
  const out = new Uint32Array(N * N);
  const tall = new Uint8Array(N * N);
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < N && y < N) out[y * N + x] = rgba(c);
  };
  // Ground: dirt everywhere, the park's grass over it.
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const blotch = hash01(x >> 2, y >> 2, 41) * 0.6 + hash01(x, y, 42) * 0.4;
      set(x, y, DIRT[1 + Math.min(3, Math.floor(blotch * 4))]);
    }
  paintStreets(set);
  for (let y = PARK.y * ART; y < (PARK.y + PARK.h) * ART; y++)
    for (let x = PARK.x * ART; x < (PARK.x + PARK.w) * ART; x++) {
      const edge = x === PARK.x * ART || y === PARK.y * ART;
      const v = hash(x >> 1, y >> 1, 43) % 6;
      set(x, y, edge && hash(x, y, 44) % 3 ? DIRT[2] : v === 0 ? GRASS[2] : v === 5 ? GRASS[3] : GRASS[(x >> 3) % 2]);
    }
  for (let k = 0; k < 3; k++) set(PARK.x * ART + 2 + k * 4, PARK.y * ART + 3 + ((k * 5) % 9), FLOWER[k]);
  // Roofs, each in its lot.
  for (const [cx, cy, cw, ch, v] of HOUSES) {
    const roof = roofPixels(cw, ch, v, hash(cx, cy, cw, ch, 31));
    const w = cw * ART;
    for (let y = 0; y < ch * ART; y++)
      for (let x = 0; x < w; x++) {
        const p = roof[y * w + x];
        if (!p) continue;
        const i = (cy * ART + y) * N + cx * ART + x;
        out[i] = p;
        tall[i] = 1;
      }
  }
  paintTree(out, tall);
  castShadows(out, tall);
  // A black frame, as the board's tiles meet the dark between them.
  for (let k = 0; k < N; k++) {
    set(k, 0, OUTLINE);
    set(k, N - 1, OUTLINE);
    set(0, k, OUTLINE);
    set(N - 1, k, OUTLINE);
  }
  return out;
}

/** The two streets: worn lighter down the middle, darker at the kerbs,
 * with pebbles. */
function paintStreets(set: (x: number, y: number, c: number) => void) {
  const along = (d: number) => (d === 0 || d === ART - 1 ? DIRT[0] : d === 1 || d === ART - 2 ? DIRT[1] : d >= 3 && d <= 4 ? DIRT[4] : DIRT[3]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - STREET.col * ART, dy = y - STREET.row * ART;
      const inCol = dx >= 0 && dx < ART, inRow = dy >= 0 && dy < ART;
      if (!inCol && !inRow) continue;
      // Where they cross, the lighter of the two wins.
      const a = inCol ? along(dx) : -1, b = inRow ? along(dy) : -1;
      set(x, y, inCol && inRow ? DIRT[Math.max(DIRT.indexOf(a), DIRT.indexOf(b))] : inCol ? a : b);
      if (hash(x, y, 45) % 23 === 0) set(x, y, PEBBLE[hash(x, y, 46) % 3]);
    }
}

/** A round canopy of leaves with a black outline, lit from the upper
 * left in four shades. */
function paintTree(out: Uint32Array, tall: Uint8Array) {
  const { x: ox, y: oy, r } = TREE;
  for (let y = Math.floor(oy - r - 2); y <= oy + r + 2; y++)
    for (let x = Math.floor(ox - r - 2); x <= ox + r + 2; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const dx = x + 0.5 - ox, dy = y + 0.5 - oy, d = Math.sqrt(dx * dx + dy * dy);
      const rim = r * (1 + 0.12 * Math.sin(Math.atan2(dy, dx) * 4 + 1));
      if (d > rim + 1) continue;
      const i = y * N + x;
      tall[i] = 1;
      if (d > rim) {
        out[i] = rgba(OUTLINE);
        continue;
      }
      const light = (-dx * 0.6 - dy * 0.8) / r + ((x + y) & 1) * 0.12 - 0.06;
      out[i] = rgba(light > 0.55 ? LEAF.top : light > 0.12 ? LEAF.light : light > -0.35 ? LEAF.mid : LEAF.dark);
    }
}

/** Shadows from the roofs and the tree, two pixels down and right. */
function castShadows(out: Uint32Array, tall: Uint8Array) {
  const ground = out.slice();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (tall[i]) continue;
      const under = (dx: number, dy: number) => x - dx >= 0 && y - dy >= 0 && tall[(y - dy) * N + x - dx] === 1;
      if (!under(1, 1) && !under(2, 2) && !under(1, 2) && !under(2, 1)) continue;
      const v = ground[i];
      out[i] = rgba(shade(((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff), 0.62));
    }
}
