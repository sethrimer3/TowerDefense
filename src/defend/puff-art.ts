/** Fire and smoke are assembled from small replaceable body sprites. The
 * same outside ring as buildings is drawn before their overlapping bodies,
 * so joined puffs have no interior black seams. */
import { ART } from "./art-scale.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels, hexColor, type ArtPiece } from "./sprite-source.ts";
import { drawSprite, pixels, sprite, withMask } from "./damage-art.ts";
const COLORS = ["#7a1c10", "#c8452a", "#f08a34", "#f6c75a", "#fff4c8", "#2a2420", "#3e3530", "#584c44", "#76685c"];
const nameOf = (r: number, color: string) => ART_NAMES.effect("puff", `${r}-${color.slice(1)}`);
export function puffPixels(r: number, color: string) {
  const n = r * 2 + 1,
    data = new Uint32Array(n * n),
    p = pixels(data, n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (!r || !((x === 0 || x === n - 1) && (y === 0 || y === n - 1))) p.set(x, y, hexColor(color));
  return sourcePixels(nameOf(r, color), n, n, () => data);
}
function draw(c: CanvasRenderingContext2D, px: number, x: number, y: number, r: number, color: string) {
  const n = r * 2 + 1,
    cv = sprite(`puff:${r}:${color}`, n, n, () => puffPixels(r, color));
  drawSprite(c, cv, ((x - r) * px) / ART, ((y - r) * px) / ART, (n * px) / ART, (n * px) / ART);
}
export const drawPuffBody = (c: CanvasRenderingContext2D, px: number, x: number, y: number, r: number, color: string) =>
  withMask("body", () => draw(c, px, x, y, r, color));
export const drawPuffOutline = (
  c: CanvasRenderingContext2D,
  px: number,
  x: number,
  y: number,
  r: number,
  color: string,
) => withMask("rim", () => draw(c, px, x, y, r, color));
export function puffPieces(): ArtPiece[] {
  return Array.from({ length: 13 }, (_, r) =>
    COLORS.map((color) => ({
      name: nameOf(r, color),
      w: r * 2 + 1,
      h: r * 2 + 1,
      about: `${color} puff, radius ${r}`,
      pixels: () => puffPixels(r, color),
    })),
  ).flat();
}
