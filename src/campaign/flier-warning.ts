/** Black-outlined warning pixels; animation time never enters the battle.
 * It plays once, `WARNING_MS` from when the warning went up (`since`
 * milliseconds ago): the dots run in along the line, a ring spreads from
 * the keep and fades, the "!" swells and settles; then it holds still. */
import type { Point } from "./plans.ts";
export { waveHasFliers } from "./ambush-waves.ts";
export const WARNING_MS = 1400;
export function drawFlierWarning(c: CanvasRenderingContext2D, entry: Point, keep: Point, px: number, since: number, reduced: boolean) {
  const dx = keep.x - entry.x,
    dy = keep.y - entry.y,
    len = Math.sqrt(dx * dx + dy * dy),
    phase = reduced ? 1 : Math.max(0, Math.min(1, since / WARNING_MS)),
    offset = phase * 2;
  const pixel = (x: number, y: number, size: number, alpha = 1) => {
    c.globalAlpha = alpha;
    const s = Math.max(2, px * size),
      x0 = Math.round(x * px - s / 2),
      y0 = Math.round(y * px - s / 2);
    c.fillStyle = "#100b0b";
    c.fillRect(x0 - 1, y0 - 1, s + 2, s + 2);
    c.fillStyle = "#f04444";
    c.fillRect(x0, y0, s, s);
  };
  c.save();
  for (let d = offset; d < len; d += 2) pixel(entry.x + (dx * d) / len, entry.y + (dy * d) / len, 0.4, 0.9);
  const r = 4 + phase * 5;
  if (phase < 1) for (let a = 0; a < Math.PI * 2; a += Math.PI / 32) pixel(keep.x + Math.cos(a) * r, keep.y + Math.sin(a) * r, 0.28, 1 - phase);
  const x = entry.x + 2,
    y = entry.y - 3,
    scale = 1 + 0.15 * Math.sin(phase * Math.PI * 2);
  pixel(x, y, 1.1 * scale);
  pixel(x, y + 1.1, 1.1 * scale);
  pixel(x, y + 2.5, 0.6 * scale);
  c.restore();
}
