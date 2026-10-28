/** Entry marker: presentation pixels only; the battle never reads animation time. */
import type { LevelPoint } from "./levels.ts";
const ARROW = [
  "      ##     ",
  "      #o#    ",
  "      #oo#   ",
  "#######ooo#  ",
  "#++++++++oo# ",
  "#######ooo#  ",
  "      #oo#   ",
  "      #o#    ",
  "      ##     ",
];
export function drawEntryArrow(c: CanvasRenderingContext2D, entry: LevelPoint, next: LevelPoint, px: number, now: number, reduceMotion: boolean) {
  const angle = Math.atan2(next.y - entry.y, next.x - entry.x);
  c.save();
  // Just inside the board, whichever edge the lane comes in from, on the
  // road's middle line (the lane runs along it).
  c.translate((entry.x + 2 * Math.cos(angle)) * px, (entry.y + 2 * Math.sin(angle)) * px);
  c.rotate(angle);
  c.globalAlpha = reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(now / 300);
  // A quarter of a cell an art pixel's worth, so it fits on the road.
  const s = px * 0.14;
  for (let y = 0; y < ARROW.length; y++)
    for (let x = 0; x < ARROW[y].length; x++) {
      const p = ARROW[y][x];
      if (p === " ") continue;
      c.fillStyle = p === "#" ? "#100e0a" : p === "+" ? "#fff0b0" : "#f0cf86";
      // Centred on its point: the shaft's row, half its length either way.
      c.fillRect((x - 6) * s, (y - 4) * s, s * 1.04, s * 1.04);
    }
  c.restore();
}
