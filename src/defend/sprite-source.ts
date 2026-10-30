/** Outline-free source art shared by procedural painters, PNG replacements
 * and the artist's export. No canvas, game state or random streams. */
import { artOverride } from "./art-overrides.ts";
import { rgba } from "./damage-art.ts";
export type ArtPiece = {
  name: string;
  w: number;
  h: number;
  about: string;
  allowEmpty?: boolean;
  joined?: boolean;
  pixels: () => Uint32Array;
};
export function sourcePixels(name: string, w: number, h: number, make: () => Uint32Array) {
  return artOverride(name, w, h) ?? make();
}
export const hexColor = (color: string) =>
  parseInt(color.length === 4 ? [...color.slice(1)].map((c) => c + c).join("") : color.slice(1), 16);
export function rowPixels(rows: readonly string[], palette: Readonly<Record<string, string | number>>, flash = false) {
  const w = Math.max(...rows.map((r) => r.length)),
    h = rows.length,
    data = new Uint32Array(w * h);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (color !== undefined)
        data[y * w + x] = rgba(flash ? 0xffffff : typeof color === "number" ? color : hexColor(color));
    }),
  );
  return { data, w, h };
}
/** CSS palette colors used by older pixel painters, in the same source format. */
export function colorPixels(colors: readonly (string | null)[]): Uint32Array {
  return Uint32Array.from(colors, (color) =>
    color
      ? color.startsWith("rgba")
        ? (() => {
            const [r, g, b, a] = color.slice(5, -1).split(",").map(Number);
            return rgba((r << 16) | (g << 8) | b, Math.round(a * 255));
          })()
        : rgba(hexColor(color))
      : 0,
  );
}
/** Older design grids are sampled onto the canonical eight-pixel lattice
 * once at source creation, never stretched differently at render time. */
export function resamplePixels(data: Uint32Array, w: number, h: number, ratio: number) {
  const W = Math.max(1, Math.round(w * ratio)),
    H = Math.max(1, Math.round(h * ratio)),
    out = new Uint32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      out[y * W + x] =
        data[Math.min(h - 1, Math.floor(((y + 0.5) * h) / H)) * w + Math.min(w - 1, Math.floor(((x + 0.5) * w) / W))];
  return { data: out, w: W, h: H };
}
