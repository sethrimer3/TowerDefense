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
  c.save();
  c.translate((entry.x + 4) * px, entry.y * px);
  c.rotate(Math.atan2(next.y - entry.y, next.x - entry.x));
  c.globalAlpha = reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(now / 300);
  const s = px * 0.55;
  for (let y = 0; y < ARROW.length; y++)
    for (let x = 0; x < ARROW[y].length; x++) {
      const p = ARROW[y][x];
      if (p === " ") continue;
      c.fillStyle = p === "#" ? "#100e0a" : p === "+" ? "#fff0b0" : "#f0cf86";
      c.fillRect((x - 5) * s, (y - 4) * s, s, s);
    }
  c.restore();
}
