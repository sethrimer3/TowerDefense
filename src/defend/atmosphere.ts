/** Bounded, deterministic ground weather. One sample per board cell, ten
 * steps a second; never draws from combat randomness or modifies path costs. */
import { CELL_COUNT, CELLS_W, CELLS_H, cellIndex, hash } from "./grid.ts";
import { ENEMIES } from "./catalog.ts";
import { areaForWave, type AreaId } from "./areas.ts";
import type { DefendSim } from "./sim.ts";

export type GroundWeather = "sand" | "mist" | null;
export type WindParticle = { x: number; y: number; turn: number };
export const CLEANUP_DEPTH = .12;
const STEP = .1;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const cell = (x: number, y: number) => cellIndex(clamp(Math.floor(x), 0, CELLS_W - 1), clamp(Math.floor(y), 0, CELLS_H - 1));
export const groundWeather = (area: AreaId): GroundWeather => area === "desert" ? "sand" : area === "fungal" ? "mist" : null;

/** Interpolate fixed compass directions over six seconds, with long holds.
 * No trigonometry in battle code, and no abrupt wind reversal at a boundary. */
export function windAt(time: number) {
  const headings = [[1,.25],[.4,1],[-.7,.6],[-1,-.2],[-.2,-1],[.8,-.6]];
  const epoch = Math.floor(time / 22), phase = time / 22 - epoch;
  const a = headings[hash(epoch, 713) % headings.length], b = headings[hash(epoch + 1, 713) % headings.length];
  const t = clamp((phase - .72) / .28, 0, 1), smooth = t * t * (3 - 2 * t);
  return { x: a[0] + (b[0] - a[0]) * smooth, y: a[1] + (b[1] - a[1]) * smooth };
}

/** Low frequency value noise gives dunes and mist broad, continuous patches. */
export function weatherNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), dx = x - ix, dy = y - iy;
  const sx = dx * dx * (3 - 2 * dx), sy = dy * dy * (3 - 2 * dy);
  const value = (x: number, y: number) => (hash(x, y, 819) % 1000) / 1000;
  const a = value(ix, iy) * (1 - sx) + value(ix + 1, iy) * sx;
  const b = value(ix, iy + 1) * (1 - sx) + value(ix + 1, iy + 1) * sx;
  return a * (1 - sy) + b * sy;
}

export class Atmosphere {
  readonly air = new Float32Array(CELL_COUNT);
  readonly sand = new Float32Array(CELL_COUNT);
  readonly vx = new Float32Array(CELL_COUNT);
  readonly vy = new Float32Array(CELL_COUNT);
  readonly passage = new Float32Array(CELL_COUNT);
  readonly cleanup = new Set<number>();
  readonly grains: WindParticle[] = [];
  readonly weeds: WindParticle[] = [];
  mode: GroundWeather = null;
  wind = { x: 1, y: .25 };
  version = 0;
  time = 0;
  private deltaAir = new Float32Array(CELL_COUNT);
  private deltaSand = new Float32Array(CELL_COUNT);
  private touched = new Uint8Array(CELL_COUNT);
  private source = new Float32Array(CELL_COUNT);
  private previous = new WeakMap<object, { x: number; y: number }>();
  private accumulator = 0;
  private sandSeeded = false;
  private wakes = 0;

  step(sim: DefendSim, dt: number) {
    const next = groundWeather(areaForWave(sim.wave).id);
    if (next !== this.mode) {
      this.mode = next;
      this.air.fill(0);
      this.source.fill(0);
      this.grains.length = this.weeds.length = 0;
      // Dunes belong to the desert: past it, the sand is gone with the wind.
      if (next !== "sand") { this.sand.fill(0); this.cleanup.clear(); this.sandSeeded = false; }
      this.syncWalls(sim);
      for (let i = 0; i < CELL_COUNT; i++) if (!sim.map.city[i] && !sim.map.wall[i] && !sim.solid[i]) {
        const noise = weatherNoise((i % CELLS_W) / 6, Math.floor(i / CELLS_W) / 6);
        this.source[i] = .35 + noise * .5;
        if (next) this.air[i] = this.source[i];
        if (next === "sand" && !this.sandSeeded) this.sand[i] = .04 + noise * .9;
      }
      if (next === "sand") {
        this.sandSeeded = true;
        for (let i = 0; i < 192; i++) this.grains.push(this.particle(sim, i));
        for (let i = 0; i < 10; i++) this.weeds.push(this.particle(sim, i + 300));
      }
      this.version++;
    }
    this.accumulator += dt;
    while (this.accumulator + 1e-8 >= STEP) {
      this.accumulator -= STEP;
      this.time += STEP;
      this.wind = windAt(this.time);
      if (!this.mode) return;
      this.syncWalls(sim);
      this.wakes = 0;
      this.stirUnits(sim);
      this.stirProjectiles(sim);
      this.transport(sim);
      if (this.mode === "sand") {
        this.moveParticles(sim, this.grains, 5);
        this.moveParticles(sim, this.weeds, 2);
      }
      this.version++;
    }
  }

  /** Read live HP, not mapVersion: a crack changes HP before solidity. */
  syncWalls(sim: DefendSim) {
    for (let i = 0; i < CELL_COUNT; i++) {
      let p = sim.solid[i] ? 0 : 1;
      if (!p && this.mode === "mist" && sim.map.wall[i]) {
        const id = sim.map.owner[i], ratio = id >= 0 ? sim.hp[id] / sim.maxHp[id] : 1;
        if (ratio < .75) p = .08 + .3 * (1 - ratio);
      }
      this.passage[i] = p;
      if (!p) this.air[i] = 0;
      if (sim.solid[i]) { this.sand[i] = 0; this.cleanup.delete(i); }
    }
  }

  private transport(sim: DefendSim) {
    const a = this.air, s = this.sand, da = this.deltaAir, ds = this.deltaSand;
    da.fill(0); ds.fill(0);
    const pair = (i: number, j: number, dx: number, dy: number) => {
      const gate = Math.min(this.passage[i], this.passage[j]);
      if (!gate) return;
      const wind = (this.wind.x * dx + this.wind.y * dy) * (this.mode === "sand" ? .09 : .025);
      const swirl = ((this.vx[i] + this.vx[j]) * dx + (this.vy[i] + this.vy[j]) * dy) * .025;
      const drift = wind + swirl;
      const flow = clamp((a[i] - a[j]) * .13 + (drift > 0 ? a[i] : a[j]) * drift, -a[j] * .22, a[i] * .22) * gate;
      da[i] -= flow; da[j] += flow;
      if (this.mode !== "sand") return;
      const saltation = wind * .28 + swirl * .35;
      const ground = clamp((s[i] - s[j]) * .018 + (saltation > 0 ? s[i] : s[j]) * saltation, -s[j] * .15, s[i] * .15);
      ds[i] -= ground; ds[j] += ground;
    };
    for (let y = 0; y < CELLS_H; y++) for (let x = 0; x < CELLS_W; x++) {
      const i = cellIndex(x, y);
      // The board wraps, so dunes march off one edge and back in at the
      // other rather than piling up against the downwind side.
      pair(i, x + 1 < CELLS_W ? i + 1 : i + 1 - CELLS_W, 1, 0);
      pair(i, y + 1 < CELLS_H ? i + CELLS_W : x, 0, 1);
    }
    for (let i = 0; i < CELL_COUNT; i++) {
      const feed = this.source[i] ? (this.source[i] - a[i]) * .065 : -a[i] * .001;
      a[i] = clamp(a[i] + da[i] + feed, 0, 1.2);
      if (this.mode === "sand") {
        s[i] = clamp(s[i] + ds[i] + (this.passage[i] ? a[i] * .0006 : 0), 0, 3);
        if (sim.map.city[i] && sim.map.owner[i] < 0 && s[i] >= CLEANUP_DEPTH) this.cleanup.add(i);
        else this.cleanup.delete(i);
      }
      this.vx[i] *= .84; this.vy[i] *= .84;
    }
  }

  /** Local vortices are capped and advected only across permeable faces. */
  disturb(x: number, y: number, r: number, dx: number, dy: number, blast = false) {
    if (!this.mode) return;
    for (let cy = Math.max(0, Math.floor(y - r)); cy <= Math.min(CELLS_H - 1, Math.floor(y + r)); cy++)
      for (let cx = Math.max(0, Math.floor(x - r)); cx <= Math.min(CELLS_W - 1, Math.floor(x + r)); cx++) {
        const i = cellIndex(cx, cy), ox = cx + .5 - x, oy = cy + .5 - y;
        const d = Math.sqrt(ox * ox + oy * oy);
        if (d > r || !this.passage[i]) continue;
        const k = 1 - d / Math.max(.01, r), scale = blast ? 2 : .7;
        this.vx[i] = clamp(this.vx[i] + k * (dx - oy * scale + (blast ? ox * 3 : 0)), -3, 3);
        this.vy[i] = clamp(this.vy[i] + k * (dy + ox * scale + (blast ? oy * 3 : 0)), -3, 3);
        if (blast) this.air[i] *= 1 - .65 * k;
      }
    this.version++;
  }

  wake(x0: number, y0: number, x1: number, y1: number) {
    if (++this.wakes > 192) return;
    const dx = x1 - x0, dy = y1 - y0, length = Math.sqrt(dx * dx + dy * dy);
    if (length < .01) return;
    const n = Math.min(8, Math.max(1, Math.ceil(length * 2)));
    for (let k = 1; k <= n; k++) this.disturb(x0 + dx * k / n, y0 + dy * k / n, 1.2, dx / length * .7, dy / length * .7);
  }

  private stirUnits(sim: DefendSim) {
    this.touched.fill(0);
    for (const list of [sim.enemies, sim.soldiers, sim.civilians]) for (const u of list) {
      if (u.hp <= 0 || ("kind" in u && ENEMIES[u.kind as keyof typeof ENEMIES]?.flying)) continue;
      const prev = this.previous.get(u), i = cell(u.x, u.y);
      if (prev) {
        const dx = u.x - prev.x, dy = u.y - prev.y;
        prev.x = u.x; prev.y = u.y;
        if (this.touched[i] || Math.abs(dx) + Math.abs(dy) < .015) continue;
        this.touched[i] = 1;
        this.disturb(u.x, u.y, 1, dx * 3, dy * 3);
        if (this.mode === "sand" && this.sand[i] > .01) {
          // A footprint pushes grains to an adjacent ridge; never through stone.
          const x = i % CELLS_W, y = Math.floor(i / CELLS_W);
          const nx = x + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0);
          const ny = y + (Math.abs(dx) < Math.abs(dy) ? Math.sign(dy) : 0);
          if (nx < 0 || nx >= CELLS_W || ny < 0 || ny >= CELLS_H) continue;
          const j = cellIndex(nx, ny);
          if (this.passage[i] === 1 && this.passage[j] === 1) {
            const amount = Math.min(this.sand[i] * .14, Math.max(0, 3 - this.sand[j]));
            this.sand[i] -= amount; this.sand[j] += amount;
          }
        }
      } else this.previous.set(u, { x: u.x, y: u.y });
    }
  }

  private stirProjectiles(sim: DefendSim) {
    for (const shots of [sim.arrows, sim.ballistaBolts, sim.shells, sim.fireballs, sim.siegeShots]) {
      const stride = Math.max(1, Math.ceil(shots.length / 32));
      for (let i = 0; i < shots.length; i += stride) {
        const shot = shots[i];
        if ("t" in shot && shot.t < 0) continue;
        const t = "t" in shot ? clamp(shot.t / shot.dur, 0, 1) : 0;
        const x = "x" in shot ? shot.x : shot.x0 + (shot.x1 - shot.x0) * t;
        const y = "y" in shot ? shot.y : shot.y0 + (shot.y1 - shot.y0) * t;
        const old = this.previous.get(shot);
        if (old) { this.wake(old.x, old.y, x, y); old.x = x; old.y = y; }
        else {
          this.previous.set(shot, { x, y });
          if ("x0" in shot) this.wake(shot.x0, shot.y0, x, y);
        }
      }
    }
  }

  private particle(sim: DefendSim, seed: number): WindParticle {
    let i = hash(seed, 921) % CELL_COUNT;
    for (let n = 0; n < CELL_COUNT && (!this.source[i] || sim.solid[i]); n++) i = (i + 1) % CELL_COUNT;
    return { x: i % CELLS_W + .3, y: Math.floor(i / CELLS_W) + .3, turn: (seed % 13) / 13 };
  }

  private moveParticles(sim: DefendSim, particles: WindParticle[], speed: number) {
    for (const p of particles) {
      const i = cell(p.x, p.y);
      const dx = (this.wind.x * speed + this.vx[i] * .3) * STEP;
      const dy = (this.wind.y * speed + this.vy[i] * .3) * STEP;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / .2));
      for (let n = 0; n < steps; n++) {
        const x = (p.x + dx / steps + CELLS_W) % CELLS_W, y = (p.y + dy / steps + CELLS_H) % CELLS_H;
        if (this.passage[cell(x, p.y)] === 1) p.x = x;
        if (this.passage[cell(p.x, y)] === 1) p.y = y;
      }
      p.turn += (Math.abs(dx) + Math.abs(dy)) * .8;
      if (sim.solid[cell(p.x, p.y)]) Object.assign(p, this.particle(sim, Math.floor(p.turn * 100)));
    }
  }

  clean(i: number, amount: number) {
    this.sand[i] = Math.max(0, this.sand[i] - amount);
    if (this.sand[i] < CLEANUP_DEPTH) this.cleanup.delete(i);
    this.version++;
  }
}
