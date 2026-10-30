/** Live cloth is sampled onto a fixed source box at eight art pixels/cell.
 * PNG animation frames replace that box without changing the cloth's anchor. */
import { ART } from "./art-scale.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels } from "./sprite-source.ts";
import { rgba } from "./damage-art.ts";
export const CAPE_BOX = 32,
  CAPE_ORIGIN = 16,
  CAPE_FRAMES = 8;
export const capeName = (look: string, frame: number, struck: boolean) =>
  ART_NAMES.unit(`cape-${look}-${frame}-${struck ? "struck" : "plain"}`);
export function capeSource(
  look: string,
  frame: number,
  struck: boolean,
  p: { tone: Uint8Array; w: number; h: number },
  colors: readonly (readonly number[])[],
  x0: number,
  y0: number,
  per: number,
) {
  const data = new Uint32Array(CAPE_BOX * CAPE_BOX);
  for (let y = 0; y < CAPE_BOX; y++)
    for (let x = 0; x < CAPE_BOX; x++) {
      const sx = Math.floor(((x - CAPE_ORIGIN + 0.5) * per) / ART - x0),
        sy = Math.floor(((y - CAPE_ORIGIN + 0.5) * per) / ART - y0);
      if (sx < 0 || sy < 0 || sx >= p.w || sy >= p.h) continue;
      const tone = p.tone[sy * p.w + sx];
      if (!tone) continue;
      const [r, g, b] = colors[tone];
      data[y * CAPE_BOX + x] = rgba((r << 16) | (g << 8) | b);
    }
  return sourcePixels(capeName(look, frame, struck), CAPE_BOX, CAPE_BOX, () => data);
}
