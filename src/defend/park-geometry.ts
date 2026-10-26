/** Where the parks' ponds and trees are: the geometry the pixel art, the
 * grass, the ripples and the ducks all line up with. */
import { cellInBounds, cellIndex, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";

/** A pond's passes, as disc scales: the black outline, the muddy bank, the
 * reed-dark shallows and the open water. */
export const POND = { outline: 0.86, bank: 0.8, shallows: 0.7, open: 0.6 };
/** The open water's colour. */
export const POND_WATER = "#2b5d71";

/** Water cell (cx, cy)'s disc at `scale` (see POND), in cells. */
export function pondDisc(cx: number, cy: number, scale: number) {
  return {
    x: cx + 0.5 + (hash01(cx, cy, 66) - 0.5) * 0.3,
    y: cy + 0.5 + (hash01(cx, cy, 67) - 0.5) * 0.3,
    r: scale * (0.9 + hash01(cx, cy, 68) * 0.25),
  };
}

/** How much the ponds' shores round off where the cells' discs meet (cells):
 * the smooth union fills the notches between them, so a pond reads as one
 * body of water rather than circles pressed together. */
export const POND_BLEND = 0.55;
/** How far (cells) the shore wanders in and out along its length. */
const POND_WOBBLE = 0.13;

/** How far point (x, y) lies inside the shore of the pond made of `discs`
 * (each water cell's `pondDisc` at scale 1), in cells: positive inside the
 * black outline, negative outside it. A smooth union of the discs, so
 * neighbours melt into one rounded shape. */
export function pondField(discs: readonly { x: number; y: number; r: number }[], x: number, y: number) {
  let f = -Infinity;
  for (const d of discs) {
    const e = POND.outline * d.r - Math.sqrt((x - d.x) * (x - d.x) + (y - d.y) * (y - d.y));
    if (f === -Infinity) { f = e; continue; }
    // Polynomial smooth maximum: the plain maximum away from any seam.
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (e - f)) / POND_BLEND));
    f = f + (e - f) * h + POND_BLEND * h * (1 - h);
  }
  // A slow wobble along the shore, so a long pond isn't a smooth pill.
  return f + POND_WOBBLE * Math.sin(x * 1.7 + Math.sin(y * 0.9) * 1.3) * Math.cos(y * 1.5 - x * 0.6);
}

/** The union of the water cells' discs at `scale`, as one path, at `px` a cell. */
export function pondPath(c: CanvasRenderingContext2D, px: number, cells: readonly (readonly [number, number])[], scale: number) {
  c.beginPath();
  for (const [cx, cy] of cells) {
    const d = pondDisc(cx, cy, scale);
    c.moveTo((d.x + d.r) * px, d.y * px);
    c.arc(d.x * px, d.y * px, d.r * px, 0, Math.PI * 2);
  }
}

/** Whether park cell (cx, cy) has a tree. */
export const hasTree = (map: CityMap, cx: number, cy: number) =>
  cellInBounds(cx, cy) && map.type[cellIndex(cx, cy)] === CellType.PARK && hash01(cx, cy, 21) <= 0.42;

/** The canopy of the tree on cell (cx, cy): centre and radius, in cells. */
export function treeCanopy(cx: number, cy: number) {
  return { x: cx + 0.3 + hash01(cx, cy, 24) * 0.4, y: cy + 0.3 + hash01(cx, cy, 25) * 0.4, r: 0.3 + hash01(cx, cy, 23) * 0.18 };
}

