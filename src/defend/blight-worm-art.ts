/** Underground worms leave soft shadows and pixel dirt; the body and its
 * portal contour remain hidden. This presentation uses no simulation RNG. */
import { CELLS_H, CELLS_W, hash01 } from "./grid.ts";
import { ART } from "./art-scale.ts";
import { BLIGHT_WORM, isBlightWorm, wormTuning } from "./blight-worm-tuning.ts";
import type { Enemy } from "./sim.ts";
import type { Brush } from "./battle-art.ts";

export const wormBodyVisible = (e: Enemy) => !isBlightWorm(e.kind) ||
  !e.burrow && e.x >= 0 && e.y >= 0 && e.x < CELLS_W && e.y < CELLS_H;

export const WORM_BURROW_ART = {
  shadow: [[1.45, .04], [1.2, .07], [1, .16]] as const,
  headClods: 48, bodyClods: 4,
  dirt: ["#96744b", "#b99b70", "#765a3c", "#c4ac86"],
};

function direction(e: Enemy) {
  if (e.worm?.head) return { x: e.worm.head.dx, y: e.worm.head.dy };
  const w = e.worm;
  if (w) for (let n = w.trail.count - 1; n >= 0; n--) {
    const p = w.trail.points[(w.trail.start + n) % BLIGHT_WORM.trailCapacity];
    if (p.s >= w.s - .02) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > .001) return { x: dx / d, y: dy / d };
  }
  return { x: 0, y: 1 };
}

/** A dense fountain at each head, with a few small clods from each segment.
 * Hashed launch phases and a ballistic arc need no particles in battle state. */
function dirt({ c, px }: Brush, e: Enemy, seconds: number, reduceMotion: boolean) {
  const head = e.leader === undefined, count = head ? WORM_BURROW_ART.headClods : WORM_BURROW_ART.bodyClods;
  const scale = wormTuning(e.kind).spacing / BLIGHT_WORM.spacing;
  const h = direction(e), clock = reduceMotion ? 0 : seconds, opacity = c.globalAlpha;
  for (let i = 0; i < count; i++) {
    const seed = hash01(e.id, i, 31), spread = hash01(e.id, i, 47) * 2 - 1;
    const t = (clock * (head ? 1.25 : 1) + seed) % 1;
    const sideways = spread * t * (head ? 1.8 : .65) * scale, back = t * (head ? 1 : .4) * scale;
    const height = 4 * t * (1 - t) * (.5 + seed * .6) * (head ? 1 : .4) * scale;
    const x = e.x - h.y * sideways - h.x * back, y = e.y + h.x * sideways - h.y * back - height;
    const size = head && i % 7 === 0 ? 2 : 1;
    c.globalAlpha = opacity * (head ? .9 : .7) * (1 - t * .65);
    c.fillStyle = WORM_BURROW_ART.dirt[i % WORM_BURROW_ART.dirt.length];
    c.fillRect(Math.round(x * ART) / ART * px, Math.round(y * ART) / ART * px, size * px / ART, px / ART);
  }
}

export function drawWormShadow(b: Brush, e: Enemy, seconds = 0, effects = true, reduceMotion = false) {
  if (!isBlightWorm(e.kind) || !e.burrow || e.x < 0 || e.y < 0 || e.x >= CELLS_W || e.y >= CELLS_H) return;
  const { c, px } = b, x = e.x * px, y = e.y * px, side = px * wormTuning(e.kind).spacing;
  c.save();
  for (const [scale, alpha] of WORM_BURROW_ART.shadow) {
    c.fillStyle = `rgba(12,8,17,${alpha})`;
    c.fillRect(x - side * scale / 2, y - side * scale / 2, side * scale, side * scale);
  }
  if (effects) dirt(b, e, seconds, reduceMotion);
  c.restore();
}
