/** Birds startled out of the forest's trees: a few roost in about half the
 * trees (by each tree's id), and when something disturbs the tree (a blast
 * or shot nearby, fire, someone passing under it, or the tree coming down)
 * they burst out of the crown, climbing and flapping away from the
 * disturbance, their shadows sliding over the ground below, until they are
 * off the board or out of sight. The tree's birds come back to it a while
 * later (`BIRDS.roost` seconds of battle time).
 *
 * Presentation only, on battle time, from `defendRandom("effects")`;
 * none under Reduce Motion. Drawn over the trees (`ForestArt.drawTrees`). */
import { CELLS_H, CELLS_W, defendRandom, hash, hash01 } from "./grid.ts";
import type { ForestTree } from "./forest.ts";
import { artPen } from "./pixel-fx.ts";

/** Art pixels a cell, as `park-art.ts`'s `ART`. */
const ART = 8;
/** How many trees have birds, how long they stay away (s), how fast they
 * fly (cells a second), how high they climb (cells), how long one can
 * fly at most (s), and how many may be in the air at once. */
export const BIRDS = { share: 0.55, roost: 40, speed: [3, 5.5] as const, climb: 2.6, life: 9, max: 160 };

/** One bird: where it is over the ground and how high (cells), its
 * velocity, its wingbeat's phase and rate, how long it has flown, and its
 * look. */
type Bird = { x: number; y: number; z: number; vx: number; vy: number; turn: number; flap: number; rate: number; age: number; life: number; big: boolean; tone: number };

/** Dark backs and pale bellies, a few kinds of bird. */
const TONES = [
  ["#1b1612", "#5a4a3a"],
  ["#22201e", "#6a6460"],
  ["#2a1d14", "#8a6a48"],
];

/** Wings up and wings down, as art-pixel offsets from the body. */
const WINGS_UP = [[-3, -2], [-2, -2], [-1, -1], [1, -1], [2, -2], [3, -2]] as const;
const WINGS_DOWN = [[-3, 1], [-2, 0], [-1, -1], [1, -1], [2, 0], [3, 1]] as const;
const WINGS_BIG_UP = [[-4, -3], [-3, -2], [-2, -2], [-1, -1], [1, -1], [2, -2], [3, -2], [4, -3]] as const;
const WINGS_BIG_DOWN = [[-4, 1], [-3, 1], [-2, 0], [-1, -1], [1, -1], [2, 0], [3, 1], [4, 1]] as const;

const fx = defendRandom("effects");

/** How many birds roost in tree `t` (none in about half the trees). */
export const roosting = (t: ForestTree) => (hash01(t.id, 701, 13) < BIRDS.share ? 1 + (hash(t.id, 702, 13) % (2 + t.size)) : 0);

export class Birds {
  private birds: Bird[] = [];
  /** When (battle seconds) each tree's birds last flew, by tree id. */
  private flown = new Map<number, number>();

  /** Clears the sky for a new run. */
  reset() {
    this.birds = [];
    this.flown.clear();
  }

  /** How many are in the air (tests). */
  get count() {
    return this.birds.length;
  }

  /** Startles tree `t`'s birds, if any are roosting, away from (fromX,
   * fromY) at battle time `now`. */
  flush(t: ForestTree, fromX: number, fromY: number, now: number) {
    const n = roosting(t);
    if (!n) return;
    const last = this.flown.get(t.id);
    if (last !== undefined && now - last < BIRDS.roost) return;
    this.flown.set(t.id, now);
    let ax = t.x - fromX, ay = t.y - fromY;
    const d = Math.sqrt(ax * ax + ay * ay);
    if (d < 0.05) {
      const a = fx() * Math.PI * 2;
      ax = Math.cos(a), ay = Math.sin(a);
    } else ax /= d, ay /= d;
    const tone = hash(t.id, 703) % TONES.length;
    for (let k = 0; k < n && this.birds.length < BIRDS.max; k++) {
      // Fanned out about the way away, each its own speed.
      const a = Math.atan2(ay, ax) + (fx() - 0.5) * 1.6, sp = BIRDS.speed[0] + fx() * (BIRDS.speed[1] - BIRDS.speed[0]);
      this.birds.push({
        x: t.x + (fx() - 0.5) * t.r, y: t.y + (fx() - 0.5) * t.r, z: 0.2 + fx() * 0.3,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, turn: (fx() - 0.5) * 0.6,
        flap: fx() * 6.28, rate: 14 + fx() * 6, age: 0, life: BIRDS.life * (0.7 + fx() * 0.3), big: t.size >= 2 && k === 0, tone,
      });
    }
  }

  /** Flies them on by `dt` battle seconds. */
  update(dt: number) {
    if (!dt || !this.birds.length) return;
    this.birds = this.birds.filter((b) => {
      b.age += dt;
      // Climbing hard at first, then levelling off, curving a little.
      b.z += (BIRDS.climb - b.z) * Math.min(1, dt * 1.6);
      const c = Math.cos(b.turn * dt), s = Math.sin(b.turn * dt);
      const vx = b.vx * c - b.vy * s;
      b.vy = b.vx * s + b.vy * c;
      b.vx = vx;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // Gliding now and then between beats.
      b.flap += dt * (Math.sin(b.age * 2 + b.rate) > 0.6 ? 2 : b.rate);
      return b.age < b.life && b.x > -3 && b.y > -3 - b.z && b.x < CELLS_W + 3 && b.y < CELLS_H + 3;
    });
  }

  /** Each bird's shadow on the ground and the bird over it. */
  draw(c: CanvasRenderingContext2D, px: number) {
    if (!this.birds.length) return;
    const dot = artPen(c, px), base = c.globalAlpha;
    for (const b of this.birds) {
      const fade = Math.min(1, (b.life - b.age) / 1, b.age / 0.15);
      const up = Math.sin(b.flap) > 0;
      const wings = b.big ? (up ? WINGS_BIG_UP : WINGS_BIG_DOWN) : up ? WINGS_UP : WINGS_DOWN;
      // The shadow, cast from the upper left onto the ground under it.
      const sx = Math.round((b.x + b.z * 0.45) * ART), sy = Math.round((b.y + b.z * 0.35) * ART);
      c.globalAlpha = base * fade * 0.22;
      c.fillStyle = "#000";
      dot(sx, sy);
      for (const [dx, dy] of wings) dot(sx + dx, sy + Math.max(-1, dy));
      // The bird, lifted by its height.
      const x = Math.round(b.x * ART), y = Math.round((b.y - b.z) * ART), [back, belly] = TONES[b.tone];
      c.globalAlpha = base * fade;
      c.fillStyle = back;
      for (const [dx, dy] of wings) dot(x + dx, y + dy);
      dot(x, y - 1);
      c.fillStyle = belly;
      dot(x, y);
    }
    c.globalAlpha = base;
  }
}
