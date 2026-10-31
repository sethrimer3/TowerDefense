/** Cosmetic, fixed-size particle fields. Never consumes the battle RNG. */
import { hash01 } from "./grid.ts";

export const TRON = { small: 18, medium: 40, hz: 30, tail: 16, margin: .035 } as const;
type Point = { x: number; y: number };
export type TronParticle = Point & { direction: number; generation: number; trail: Point[] };
export type TronField = { seed: number; tick: number; particles: TronParticle[] };
const DIRECTIONS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

export function createTronField(seed: number, count: number): TronField {
  return { seed, tick: 0, particles: Array.from({ length: count }, (_, n) => {
    const x = .08 + hash01(seed, n, 1) * .84, y = .08 + hash01(seed, n, 2) * .84;
    return { x, y, direction: Math.floor(hash01(seed, n, 3) * 4), generation: 0, trail: [{ x, y }] };
  }) };
}

/** Every step is exactly horizontal or vertical. A wall replaces one slot. */
export function stepTronField(field: TronField) {
  const m = TRON.margin, span = 1 - 2 * m;
  field.tick++;
  field.particles.forEach((p, n) => {
    const turn = hash01(field.seed + n * 101, field.tick, 4);
    if (turn < .035) p.direction = (p.direction + (turn < .0175 ? 1 : 3)) % 4;
    const speed = (.28 + hash01(field.seed, n, 5) * .23) / TRON.hz;
    const d = DIRECTIONS[p.direction], x = p.x + d.x * speed, y = p.y + d.y * speed;
    if (x < m || x > 1 - m || y < m || y > 1 - m) {
      p.generation++;
      const edge = Math.floor(hash01(field.seed + n * 101, p.generation, 6) * 4);
      const along = m + hash01(field.seed + n * 101, p.generation, 7) * span;
      p.x = edge === 0 ? m : edge === 2 ? 1 - m : along;
      p.y = edge === 1 ? m : edge === 3 ? 1 - m : along;
      p.direction = edge;
      p.trail.length = 0;
    } else { p.x = x; p.y = y; }
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > TRON.tail) p.trail.shift();
  });
}
