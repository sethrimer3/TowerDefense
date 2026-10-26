/** Bounded, deterministic ground weather. One sample per board cell, ten
 * steps a second; never draws from combat randomness or modifies path costs. */
import { CELL_COUNT, CELLS_W, CELLS_H, cellIndex, hash } from "./grid.ts";
import { ENEMIES } from "./catalog.ts";
import { areaForWave, type AreaId } from "./areas.ts";
import type { DefendSim } from "./sim.ts";

export type GroundWeather = "sand" | "mist" | null;
/** A tumbleweed: where it is, how far it has turned, its size (0 smallest
 * to `WEED_SIZES` - 1) and how long it has been pinned in a corner. */
export type WindParticle = { x: number; y: number; turn: number; size: number; stuck: number };
/** How many sizes of tumbleweed roll about. */
export const WEED_SIZES = 4;
export const CLEANUP_DEPTH = .12;
/** Sand banked against a building's side crushes it: every open city cell
 * beside one with more than `depth` of sand presses with the excess; past
 * `min` in all, the building takes `rate` of its HP a second for each unit
 * of pressure beyond it, checked once a second. Walls, gates, ballista
 * bastions and the keep stand firm. */
export const SAND_PRESS = { depth: .5, min: 2, rate: .01, every: 1 };
const FIRM = new Set(["wall", "gate", "wallBallista", "keep"]);
const STEP = .1;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const cell = (x: number, y: number) => cellIndex(clamp(Math.floor(x), 0, CELLS_W - 1), clamp(Math.floor(y), 0, CELLS_H - 1));
export const groundWeather = (area: AreaId): GroundWeather => area === "desert" ? "sand" : area === "fungal" ? "mist" : null;

/** The wind always blows the same way, down the board and to the left, so
 * the dunes, the drifts and every tumbleweed go with it. */
export const WIND = { x: -.72, y: .72 };
export function windAt(_time: number) { return { x: WIND.x, y: WIND.y }; }

/** Low frequency value noise gives dunes and mist broad, continuous patches. */
export function weatherNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), dx = x - ix, dy = y - iy;
  const sx = dx * dx * (3 - 2 * dx), sy = dy * dy * (3 - 2 * dy);
  const value = (x: number, y: number) => (hash(x, y, 819) % 1000) / 1000;
  const a = value(ix, iy) * (1 - sx) + value(ix + 1, iy) * sx;
  const b = value(ix, iy + 1) * (1 - sx) + value(ix + 1, iy + 1) * sx;
  return a * (1 - sy) + b * sy;
}

/** Cells across one repeat of the dune field, which tiles in both directions. */
export const DUNE_PERIOD = 96;
/** Cells a second the dunes creep downwind: a dune takes minutes to pass. */
export const DUNE_SPEED = .05;
const wrap = (v: number, n: number) => ((v % n) + n) % n;
/** Value noise whose lattice repeats every `px` by `py` lattice cells. */
export function periodicNoise(x: number, y: number, px: number, py: number, salt: number) {
  const ix = Math.floor(x), iy = Math.floor(y), dx = x - ix, dy = y - iy;
  const sx = dx * dx * (3 - 2 * dx), sy = dy * dy * (3 - 2 * dy);
  const value = (x: number, y: number) => (hash(wrap(x, px), wrap(y, py), salt) % 1000) / 1000;
  const a = value(ix, iy) * (1 - sx) + value(ix + 1, iy) * sx;
  const b = value(ix, iy + 1) * (1 - sx) + value(ix + 1, iy + 1) * sx;
  return a * (1 - sy) + b * sy;
}
/** Cells from one dune crest to the next, across the field's grain. */
export const DUNE_WAVE = 24;
/** Where along a dune's wave its crest stands: a long windward rise, then the
 * short slip face down to the next trough. */
export const DUNE_CREST = .78;
/** Cells the crests lean west per cell down, so each slip face looks down
 * and to the left, the way the wind blows (a whole number of waves a
 * period, so the field still tiles). */
const DUNE_LEAN = .5;
/** The field's two smooth inputs, sampled once a cell over one period: how
 * far each crest is bent (in waves) and how tall the dunes stand there. */
let duneTables: { bend: Float32Array; amp: Float32Array } | null = null;
function tables() {
  if (duneTables) return duneTables;
  const n = DUNE_PERIOD, bend = new Float32Array(n * n), amp = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    // Gentle enough that a crest never folds back on itself into a closed ring.
    bend[y * n + x] = periodicNoise(x / 24, y / 24, 4, 4, 821) * .65 + periodicNoise(x / 12, y / 12, 8, 8, 822) * .14;
    // Never 0: the dunes cover all the ground, lower in places, never bare.
    amp[y * n + x] = .45 + .55 * clamp((periodicNoise(x / 32, y / 32, 3, 3, 823) - .1) / .6, 0, 1);
  }
  return duneTables = { bend, amp };
}
/** A table's value at (x, y) cells, bilinear between cell samples, wrapping. */
function lerpTable(t: Float32Array, x: number, y: number) {
  const fx = wrap(x, DUNE_PERIOD), fy = wrap(y, DUNE_PERIOD);
  const ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
  const x1 = (ix + 1) % DUNE_PERIOD, r0 = iy * DUNE_PERIOD, r1 = ((iy + 1) % DUNE_PERIOD) * DUNE_PERIOD;
  const top = t[r0 + ix] + (t[r0 + x1] - t[r0 + ix]) * u;
  const bottom = t[r1 + ix] + (t[r1 + x1] - t[r1 + ix]) * u;
  return top + (bottom - top) * v;
}
/** The dune field at (x, y) cells, which repeats every `DUNE_PERIOD`: `phase`
 * counts waves, `wave` is how far along its dune's wave the point stands (0
 * in a trough rising to `DUNE_CREST` at the crest, then down the slip face),
 * `amp` how tall the dunes are there and `height` the sand's surface above
 * the floor's sheet, 0 in the troughs to 1. Transverse dunes: crests run
 * across the wind, bent into sinuous lines, each a long windward rise
 * swelling to a sharp brink and a steep slip face easing into the trough. */
export function duneAt(x: number, y: number) {
  const t = tables(), phase = (y - x * DUNE_LEAN) / DUNE_WAVE + lerpTable(t.bend, x, y);
  const wave = phase - Math.floor(phase), amp = lerpTable(t.amp, x, y);
  let rise: number;
  if (wave < DUNE_CREST) { const s = wave / DUNE_CREST; rise = s * s * (3 - 2 * s) * .8 + s * .2; }
  else { const u = 1 - (wave - DUNE_CREST) / (1 - DUNE_CREST); rise = u * Math.sqrt(u); }
  return { phase, wave, amp, height: amp * rise };
}
/** Sand a cell's centre holds: the floor's thin sheet and the dune over it. */
export function duneSand(x: number, y: number) { return .2 + duneAt(x, y).height; }

export class Atmosphere {
  readonly air = new Float32Array(CELL_COUNT);
  readonly sand = new Float32Array(CELL_COUNT);
  readonly vx = new Float32Array(CELL_COUNT);
  readonly vy = new Float32Array(CELL_COUNT);
  readonly passage = new Float32Array(CELL_COUNT);
  readonly cleanup = new Set<number>();
  readonly weeds: WindParticle[] = [];
  mode: GroundWeather = null;
  wind = { x: 1, y: .25 };
  /** How far, in cells, the dune field has crept downwind, kept within a period. */
  readonly drift = { x: 0, y: 0 };
  version = 0;
  time = 0;
  private deltaAir = new Float32Array(CELL_COUNT);
  private deltaSand = new Float32Array(CELL_COUNT);
  private touched = new Uint8Array(CELL_COUNT);
  private openGates = new Uint8Array(CELL_COUNT);
  private source = new Float32Array(CELL_COUNT);
  private previous = new WeakMap<object, { x: number; y: number }>();
  private accumulator = 0;
  private sandSeeded = false;
  private wakes = 0;
  private pressClock = 0;
  /** Each pressed building's pressure, last reckoned. */
  readonly pressure = new Map<number, number>();

  step(sim: DefendSim, dt: number) {
    const next = groundWeather(areaForWave(sim.wave).id);
    if (next !== this.mode) {
      this.mode = next;
      this.air.fill(0);
      this.source.fill(0);
      this.weeds.length = 0;
      // Dunes belong to the desert: past it, the sand is gone with the wind.
      if (next !== "sand") { this.sand.fill(0); this.cleanup.clear(); this.sandSeeded = false; }
      this.syncWalls(sim);
      for (let i = 0; i < CELL_COUNT; i++) if (!sim.map.city[i] && !sim.map.wall[i] && !sim.solid[i]) {
        const noise = weatherNoise((i % CELLS_W) / 6, Math.floor(i / CELLS_W) / 6);
        this.source[i] = .35 + noise * .5;
        if (next) this.air[i] = this.source[i];
        if (next === "sand" && !this.sandSeeded) this.sand[i] = this.duneAt(i);
      }
      if (next === "sand") {
        this.sandSeeded = true;
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
      if (this.mode === "sand") {
        this.drift.x = wrap(this.drift.x + this.wind.x * DUNE_SPEED * STEP, DUNE_PERIOD);
        this.drift.y = wrap(this.drift.y + this.wind.y * DUNE_SPEED * STEP, DUNE_PERIOD);
      }
      this.syncWalls(sim);
      this.wakes = 0;
      // Walkers stir the mist; on sand they only print trails in the dunes'
      // art, never moving the sand itself.
      if (this.mode === "mist") this.stirUnits(sim);
      this.stirProjectiles(sim);
      this.transport(sim);
      if (this.mode === "sand") {
        this.pressClock += STEP;
        if (this.pressClock + 1e-8 >= SAND_PRESS.every) { this.pressClock -= SAND_PRESS.every; this.press(sim); }
        this.rollWeeds(sim);
      }
      this.version++;
    }
  }

  /** Read live HP, not mapVersion: a crack changes HP before solidity. An
   * open gate lets the sand and mist through its gateway. */
  syncWalls(sim: DefendSim) {
    const open = this.openGates;
    open.fill(0);
    for (const id of sim.gateOpen.keys()) for (const c of sim.map.buildings[id].cells) open[c] = 1;
    for (let i = 0; i < CELL_COUNT; i++) {
      let p = sim.solid[i] && !open[i] ? 0 : 1;
      if (!p && this.mode === "mist" && sim.map.wall[i]) {
        const id = sim.map.owner[i], ratio = id >= 0 ? sim.hp[id] / sim.maxHp[id] : 1;
        if (ratio < .75) p = .08 + .3 * (1 - ratio);
      }
      this.passage[i] = p;
      if (!p) this.air[i] = 0;
      if (!p) { this.sand[i] = 0; this.cleanup.delete(i); }
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
      const saltation = wind * .06 + swirl * .35;
      // Sand pours down into any lower ground it can reach: a breach, an open gate.
      const ground = clamp((s[i] - s[j]) * .04 + (saltation > 0 ? s[i] : s[j]) * saltation, -s[j] * .15, s[i] * .15);
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
        // Outside the city the sand settles back into the creeping dunes.
        if (!sim.map.city[i] && this.passage[i]) s[i] += (this.duneAt(i) - s[i]) * .02;
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

  /** Sum the sand banked against each city building and crush those
   * pressed too hard. Only cells deep in sand are visited, so a city
   * without a breach costs one pass over the board a second. */
  press(sim: DefendSim) {
    const s = this.sand, owner = sim.map.owner, pressure = this.pressure;
    pressure.clear();
    for (let i = 0; i < CELL_COUNT; i++) {
      const excess = s[i] - SAND_PRESS.depth;
      if (excess <= 0 || !sim.map.city[i] || sim.solid[i]) continue;
      const x = i % CELLS_W;
      // One building pressed from a cell once, however many of its sides touch it.
      let a = -1, b = -1;
      for (const j of [x > 0 ? i - 1 : -1, x < CELLS_W - 1 ? i + 1 : -1, i - CELLS_W, i + CELLS_W]) {
        if (j < 0 || j >= CELL_COUNT || !sim.solid[j]) continue;
        const id = owner[j];
        if (id < 0 || id === a || id === b || sim.hp[id] <= 0) continue;
        if (FIRM.has(sim.map.buildings[id].kind) || id === sim.keepId) continue;
        if (a < 0) a = id; else b = id;
        pressure.set(id, (pressure.get(id) ?? 0) + excess);
      }
    }
    for (const [id, p] of pressure) if (p > SAND_PRESS.min)
      sim.damageBuilding(id, sim.maxHp[id] * SAND_PRESS.rate * (p - SAND_PRESS.min) * SAND_PRESS.every);
  }

  /** The drifted dune field's sand over cell `i`. */
  duneAt(i: number) { return duneSand(i % CELLS_W + .5 - this.drift.x, Math.floor(i / CELLS_W) + .5 - this.drift.y); }

  private particle(sim: DefendSim, seed: number): WindParticle {
    let i = hash(seed, 921) % CELL_COUNT;
    for (let n = 0; n < CELL_COUNT && (!this.source[i] || sim.solid[i]); n++) i = (i + 1) % CELL_COUNT;
    return { x: i % CELLS_W + .3, y: Math.floor(i / CELLS_W) + .3, turn: (seed % 13) / 13, size: hash(seed, 922) % WEED_SIZES, stuck: 0 };
  }

  /** The tumbleweeds roll downwind, the big ones slower, sliding along any
   * wall they meet and so round it; one pinned in a corner rolls along the
   * wall for a moment, and one still pinned comes back in from the upwind
   * edge, as the ones blown off the board do. */
  private rollWeeds(sim: DefendSim) {
    const open = (x: number, y: number) => this.passage[cell(x, y)] === 1;
    const wrapX = (x: number) => (x + CELLS_W) % CELLS_W, wrapY = (y: number) => (y + CELLS_H) % CELLS_H;
    for (const p of this.weeds) {
      const i = cell(p.x, p.y), speed = 2.2 - p.size * .35;
      let dx = (this.wind.x * speed + this.vx[i] * .3) * STEP, dy = (this.wind.y * speed + this.vy[i] * .3) * STEP;
      // Pinned: roll along the wall, across the wind, one way or the other.
      if (p.stuck > .3) { const side = hash(Math.floor(p.turn), 923) % 2 ? 1 : -1; [dx, dy] = [-this.wind.y * side * speed * STEP, this.wind.x * side * speed * STEP]; }
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / .2));
      let moved = 0;
      for (let n = 0; n < steps; n++) {
        const x = wrapX(p.x + dx / steps), y = wrapY(p.y + dy / steps);
        if (open(x, p.y)) { moved += Math.abs(dx / steps); p.x = x; }
        if (open(p.x, y)) { moved += Math.abs(dy / steps); p.y = y; }
      }
      p.turn += moved * .8;
      p.stuck = moved < (Math.abs(dx) + Math.abs(dy)) * .25 ? p.stuck + STEP : Math.max(0, p.stuck - STEP * .5);
      if (sim.solid[cell(p.x, p.y)] || p.stuck > 3) {
        // In again from the upwind edges, top or right, somewhere clear.
        const seed = Math.floor(p.turn * 100) + p.size, along = hash(seed, 924);
        const top = along % 2 === 0;
        p.x = top ? along % CELLS_W + .5 : CELLS_W - .5; p.y = top ? .5 : (along >> 1) % CELLS_H + .5;
        p.stuck = 0;
        if (!open(p.x, p.y)) Object.assign(p, this.particle(sim, seed), { size: p.size });
      }
    }
  }

  clean(i: number, amount: number) {
    this.sand[i] = Math.max(0, this.sand[i] - amount);
    if (this.sand[i] < CLEANUP_DEPTH) this.cleanup.delete(i);
    this.version++;
  }
}
