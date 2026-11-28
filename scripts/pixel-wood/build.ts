// Draws theme.css's tiling pixel-art oak (--wood) from src/ui/wood-art.ts,
// wrapping on every side so it tiles without a seam: the board under
// pseudo-elements and until wood-painter.ts paints each panel its own. The
// pixels are square SVG paths with crisp edges, sharp at any zoom.
//
//   node --experimental-transform-types scripts/pixel-wood/build.ts
//
// writes assets/theme/wood-pixel.svg. The older noise-grained wood.svg stays
// as the fallback layer underneath it, and the Pixel-art wood setting off
// shows it alone.

import { writeFileSync } from "node:fs";
import { drawWood, WOOD_PALETTE as PALETTE } from "../../src/ui/wood-art.ts";

/** The tile, in art pixels. */
export const W = 192, H = 48;

/** The tile as an SVG: one crisp-edged path per shade, a rectangle per run. */
export function woodSvg(px = drawWood(W, H, 7, true)): string {
  const paths = PALETTE.map(() => [] as string[]);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const s = px[y * W + x];
      let end = x + 1;
      while (end < W && px[y * W + end] === s) end++;
      if (s !== 2) paths[s].push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  }
  const body = paths
    .map((d, s) => (d.length ? `<path fill="${PALETTE[s]}" d="${d.join("")}"/>` : ""))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges"><rect width="${W}" height="${H}" fill="${PALETTE[2]}"/>${body}</svg>\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("../../assets/theme/wood-pixel.svg", import.meta.url), woodSvg());
}
