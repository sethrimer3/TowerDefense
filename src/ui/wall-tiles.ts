/**
 * Each area's wall caps as a CSS background: `--wall-<area>` on the root
 * holds a data URL of `wallTilePixels`, and `areaStyle` points a zone's
 * `--area-wall` at it, so the Wave button and every row of the wave picker
 * wear their zone's stones without repeating the image in their markup.
 */
import { AREAS } from "../defend/areas.ts";
import { WALL_TILE, wallTilePixels } from "../defend/area-wall-art.ts";
import { onPixelArt } from "../defend/pixel-sprites.ts";
import { spriteCanvas } from "../defend/damage-art.ts";

let installed = false;

function paint() {
  const root = document.documentElement.style;
  for (const area of AREAS) {
    const url = spriteCanvas(wallTilePixels(area.id), WALL_TILE, WALL_TILE, undefined, false).toDataURL();
    root.setProperty(`--wall-${area.id}`, `url("${url}")`);
  }
}

/** Sets the variables once, and again whenever an artist's sprites arrive. */
export function installWallTiles() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  paint();
  onPixelArt(paint);
}
