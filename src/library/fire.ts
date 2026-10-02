/** Fire in the Library: a grid of heat over the nave, two pixels a cell.
 * When a table's candle tips over, everything wooden in the nave becomes
 * fuel (shelves and their books, ladders, tables, carts). A burning cell
 * eats its fuel and heats its neighbours, most of all the cells above it;
 * hot air rises and cools, so flames climb the shelves faster than they
 * creep along them. Water thrown from buckets flies as droplets: each one
 * that lands cools and wets the cells around it, and may douse a flame
 * outright. Wet wood will not catch. What is left of each object's fuel
 * when the fire is out is how much of it survived.
 *
 * Nothing here draws from `Math.random`: the library passes its own stream. */
import { FLOOR, H, W } from "./geometry.ts";

export const CELL = 2;
export const FW = W / CELL;
export const FH = H / CELL;
const N = FW * FH;

/** Heat at which wood catches, flames' most heat, and how fast they grow. */
const IGNITE = 0.5, MAXH = 1.6, GEN = 0.8;
/** Fuel a burning cell eats a second (a full cell holds 1). */
const BURN = 0.055;
/** What a flame gives its neighbours a second, per unit of its heat. */
const UP = 0.42, UP_SIDE = 0.12, SIDE = 0.1, DOWN = 0.03;
/** Air carries its heat upward, and cools; unburnt wood cools slower. */
const RISE = 0.9, AIR_COOL = 0.75, WOOD_COOL = 0.3;
const GRAVITY = 160;

/** Something that burns: a rectangle of pixels, its fuel per cell, and the
 * heat it catches at. Later objects stand in front of earlier ones. */
export type Burnable = { x0: number; y0: number; x1: number; y1: number; fuel: number };
/** A droplet of thrown water: it flies in front of the shelves until it
 * meets a flame's heat or comes down where it was aimed (`t` seconds on). */
export type Drop = { x: number; y: number; vx: number; vy: number; w: number; t: number };

export const cellAt = (x: number, y: number) => {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  return cx < 0 || cx >= FW || cy < 0 || cy >= FH ? -1 : cy * FW + cx;
};

export class Fire {
  readonly heat = new Float32Array(N);
  readonly fuel = new Float32Array(N);
  readonly fuel0 = new Float32Array(N);
  readonly owner = new Int16Array(N).fill(-1);
  readonly wet = new Float32Array(N);
  /** How burnt each cell's wood is (0 to 1); kept until it is rebuilt. */
  readonly char = new Float32Array(N);
  /** Soot on the stone where hot air rose; it fades as it is cleaned. */
  readonly soot = new Float32Array(N);
  drops: Drop[] = [];
  /** Cells burning after the last step. */
  burning = 0;
  /** Whether a fire is going (from ignition until the heat has gone). */
  active = false;
  /** Whether any soot is left on the stone. */
  sooty = false;
  /** Bumped each step, so the picture knows to repaint. */
  version = 0;
  private next = new Float32Array(N);
  private objects = 0;

  /** Turns the nave's wooden things into fuel, ready to burn. */
  load(objects: Burnable[]) {
    this.fuel.fill(0);
    this.fuel0.fill(0);
    this.owner.fill(-1);
    this.heat.fill(0);
    objects.forEach((o, id) => {
      for (let y = Math.max(0, o.y0); y < Math.min(H, o.y1); y += CELL)
        for (let x = Math.max(0, o.x0); x < Math.min(W, o.x1); x += CELL) {
          const i = cellAt(x, y);
          if (i < 0) continue;
          this.owner[i] = id;
          this.fuel[i] = this.fuel0[i] = o.fuel;
        }
    });
    this.objects = objects.length;
  }

  ignite(x: number, y: number) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = cellAt(x + dx * CELL, y + dy * CELL);
        if (i >= 0) this.heat[i] = MAXH;
      }
    this.active = true;
  }

  /** What survives of each object: its fuel left over its fuel at first. */
  integrity() {
    const left = new Float64Array(this.objects), full = new Float64Array(this.objects);
    for (let i = 0; i < N; i++) {
      const o = this.owner[i];
      if (o < 0) continue;
      left[o] += this.fuel[i];
      full[o] += this.fuel0[i];
    }
    return Array.from(left, (l, o) => (full[o] > 0 ? l / full[o] : 1));
  }
  /** Fuel left in the cell under pixel (x, y), over what it had (1 if none). */
  left(x: number, y: number) {
    const i = cellAt(x, y);
    return i < 0 || this.fuel0[i] <= 0 ? 1 : this.fuel[i] / this.fuel0[i];
  }
  burningAt(i: number) {
    return i >= 0 && this.fuel[i] > 0 && this.heat[i] >= IGNITE && this.wet[i] < 0.3;
  }
  /** The hottest heat around pixel (x, y) over `h` pixels up from it. */
  heatAt(x: number, y: number, h = 1) {
    let m = 0;
    for (let k = 0; k < h; k += CELL) {
      const i = cellAt(x, y - k);
      if (i >= 0 && this.heat[i] > m) m = this.heat[i];
    }
    return m;
  }

  /** Throws `n` droplets of water `w` each from (x, y) to land on (tx, ty)
   * after `t` seconds, scattered by `jitter`. */
  splash(x: number, y: number, tx: number, ty: number, n: number, w: number, rng: () => number, t = 0.7) {
    for (let k = 0; k < n; k++) {
      const ax = tx + (rng() - 0.5) * 8, ay = ty + (rng() - 0.5) * 8, tt = t * (0.85 + rng() * 0.3);
      this.drops.push({ x, y, vx: (ax - x) / tt, vy: (ay - y) / tt - 0.5 * GRAVITY * tt, w, t: tt });
    }
  }

  /** Advances `dt` seconds (the library steps it a tenth at a time).
   * `douse` is the chance a droplet puts out a flame it lands on. */
  step(dt: number, rng: () => number, douse: number) {
    const heat = this.heat, fuel = this.fuel, wet = this.wet, next = this.next;
    // Soot fades over a few minutes whether or not anything burns.
    if (this.sooty) {
      let any = false;
      for (let i = 0; i < N; i++) if (this.soot[i] > 0) {
        this.soot[i] = Math.max(0, this.soot[i] - dt * 0.004);
        any = true;
      }
      this.sooty = any;
    }
    if (!this.active) return;
    this.version++;
    this.flyDrops(dt, rng, douse);
    next.set(heat);
    let burning = 0, hottest = 0;
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const i = y * FW + x, h = heat[i];
        if (wet[i] > 0) {
          next[i] -= wet[i] * 2.4 * dt;
          wet[i] = Math.max(0, wet[i] - 0.03 * dt);
        }
        if (h < 0.005) continue;
        if (h > hottest) hottest = h;
        if (fuel[i] > 0 && h >= IGNITE && wet[i] < 0.3) {
          burning++;
          fuel[i] = Math.max(0, fuel[i] - BURN * dt * (0.6 + rng() * 0.8));
          this.char[i] = Math.max(this.char[i], 1 - fuel[i] / this.fuel0[i]);
          next[i] = Math.min(MAXH, next[i] + GEN * dt);
          const g = h * dt * (0.5 + rng());
          if (y > 0) {
            next[i - FW] += g * UP;
            if (x > 0) next[i - FW - 1] += g * UP_SIDE;
            if (x < FW - 1) next[i - FW + 1] += g * UP_SIDE;
          }
          if (x > 0) next[i - 1] += g * SIDE;
          if (x < FW - 1) next[i + 1] += g * SIDE;
          if (y < FH - 1) next[i + FW] += g * DOWN;
        } else if (fuel[i] > 0) {
          next[i] -= h * WOOD_COOL * dt;
        } else {
          // Hot air: it rises, cools, and blackens the stone it passes.
          const moved = h * RISE * dt;
          next[i] -= moved + h * AIR_COOL * dt;
          if (y > 0) next[i - FW] += moved * 0.8;
          if (h > 0.5) {
            this.soot[i] = Math.min(1, this.soot[i] + (h - 0.5) * dt * 0.25);
            this.sooty = true;
          }
        }
      }
    for (let i = 0; i < N; i++) heat[i] = next[i] < 0 ? 0 : next[i] > MAXH ? MAXH : next[i];
    this.burning = burning;
    if (burning === 0 && hottest < 0.3 && !this.drops.length) {
      this.active = false;
      heat.fill(0);
      wet.fill(0);
    }
  }

  private flyDrops(dt: number, rng: () => number, douse: number) {
    this.drops = this.drops.filter((d) => {
      d.vy += GRAVITY * dt;
      d.t -= dt;
      const steps = Math.max(1, Math.ceil((Math.abs(d.vx) + Math.abs(d.vy)) * dt / CELL));
      for (let s = 0; s < steps; s++) {
        d.x += (d.vx * dt) / steps;
        d.y += (d.vy * dt) / steps;
        if (d.x < 0 || d.x >= W || d.y >= FLOOR) return false;
        const i = cellAt(d.x, d.y);
        if (i < 0) continue;
        if (this.heat[i] > 0.35 || (d.t <= 0 && this.fuel[i] > 0)) {
          this.soak(i, d.w, rng, douse);
          return false;
        }
      }
      return true;
    });
  }
  private soak(i: number, w: number, rng: () => number, douse: number) {
    const cx = i % FW, cy = (i / FW) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= FW || y < 0 || y >= FH) continue;
        const j = y * FW + x, share = dx || dy ? 0.5 : 1;
        this.wet[j] = Math.min(1, this.wet[j] + w * share);
        this.heat[j] = Math.max(0, this.heat[j] - w * share * 2.5);
        if (this.fuel[j] > 0 && this.heat[j] >= IGNITE && rng() < douse * share) this.heat[j] = 0;
      }
  }
}
