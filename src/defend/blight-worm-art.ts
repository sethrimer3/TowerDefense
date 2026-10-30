/** Underground worms leave only soft translucent shadows, never a body or
 * a contour. No battle state or random draws in this presentation layer. */
import { CELLS_H, CELLS_W } from "./grid.ts";
import type { Enemy } from "./sim.ts";
import type { Brush } from "./battle-art.ts";

export const wormBodyVisible = (e: Enemy) => e.kind !== "blightWorm" ||
  !e.burrow && e.x >= 0 && e.y >= 0 && e.x < CELLS_W && e.y < CELLS_H;

export function drawWormShadow({ c, px }: Brush, e: Enemy) {
  if (e.kind !== "blightWorm" || !e.burrow || e.x < 0 || e.y < 0 || e.x >= CELLS_W || e.y >= CELLS_H) return;
  const x = e.x * px, y = e.y * px, side = px * 5 / 8;
  c.save();
  for (const [scale, alpha] of [[1.45, .06], [1.2, .1], [1, .22]]) {
    c.fillStyle = `rgba(12,8,17,${alpha})`;
    c.fillRect(x - side * scale / 2, y - side * scale / 2, side * scale, side * scale);
  }
  if (e.leader === undefined) {
    const k = px / 8;
    c.fillStyle = "rgba(142,112,73,.5)";
    c.fillRect(x - side / 2 - k, y - k, k, k);
    c.fillRect(x + side / 2, y + k, k, k);
  }
  c.restore();
}
