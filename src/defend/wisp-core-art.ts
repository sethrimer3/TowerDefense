/** Shared elemental arrow bodies on the native art lattice. */
import { ART } from "./art-scale.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels, hexColor, type ArtPiece } from "./sprite-source.ts";
import { pixels, sprite, drawSprite } from "./damage-art.ts";
import { WISP_FIRE, WISP_LIGHTNING } from "../knowledge-paths.ts";
import type { WispArrow } from "./wisp-arrow.ts";
const PALETTES = {
  plain: ["#123954", "#65c4ef", "#efffff"],
  fire: ["#7a1c10", "#f08a34", "#fff4c8"],
  lightning: ["#36115e", "#a24aff", "#f8d9ff"],
};
type Kind = keyof typeof PALETTES;
const BOX = 17,
  MID = 8;
export const wispArrowScale = (w: Pick<WispArrow, "fire" | "lightning">) =>
  w.lightning ? WISP_LIGHTNING.scale : w.fire ? WISP_FIRE.scale : 1;
export function wispCorePixels(kind: Kind, dir: number) {
  const colors = PALETTES[kind],
    data = new Uint32Array(BOX * BOX),
    p = pixels(data, BOX, BOX);
  const angle = (dir / 16) * Math.PI * 2,
    ux = Math.cos(angle),
    uy = Math.sin(angle),
    vx = -uy,
    vy = ux;
  const line = (ax: number, ay: number, bx: number, by: number, color: string, width = 1) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let i = 0; i <= n; i++)
      for (let y = 0; y < width; y++)
        for (let x = 0; x < width; x++)
          p.set(
            Math.round(MID + ax + ((bx - ax) * i) / n) + x,
            Math.round(MID + ay + ((by - ay) * i) / n) + y,
            hexColor(color),
          );
  };
  line(-ux * 4, -uy * 4, ux * 4, uy * 4, colors[0], 3);
  line(-ux * 4, -uy * 4, ux * 5, uy * 5, colors[1]);
  line(ux * 5, uy * 5, ux - vx * 3, uy - vy * 3, colors[1]);
  line(ux * 5, uy * 5, ux + vx * 3, uy + vy * 3, colors[1]);
  line(-ux * 2, -uy * 2, ux * 4, uy * 4, colors[2]);
  return sourcePixels(ART_NAMES.projectile(`wisp-${kind}`, dir), BOX, BOX, () => data);
}
export function drawWispCore(c: CanvasRenderingContext2D, px: number, w: WispArrow, colors: readonly string[]) {
  const kind: Kind = w.lightning ? "lightning" : w.fire ? "fire" : "plain";
  const dir = ((Math.round((w.angle / Math.PI / 2) * 16) % 16) + 16) % 16;
  const cv = sprite(`wisp-core:${kind}:${dir}`, BOX, BOX, () => wispCorePixels(kind, dir));
  const u = (px / ART) * wispArrowScale(w);
  drawSprite(c, cv, w.x * px - MID * u, w.y * px - MID * u, BOX * u, BOX * u);
}
export function wispCorePieces(): ArtPiece[] {
  return (Object.keys(PALETTES) as Kind[]).flatMap((kind) =>
    Array.from({ length: 16 }, (_, dir) => ({
      name: ART_NAMES.projectile(`wisp-${kind}`, dir),
      w: BOX,
      h: BOX,
      about: `${kind} wisp arrow, heading ${dir}`,
      pixels: () => wispCorePixels(kind, dir),
    })),
  );
}
