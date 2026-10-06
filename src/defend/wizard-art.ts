import { enemySize } from "./catalog.ts";
/** The wizard tower's attacks as they are drawn, as pixel art at `ART`
 * pixels a cell inside the city's black outline. The sim says where each
 * burns or spreads (`sim.flames`, `sim.frosts`); everything here is
 * presentation, with its randomness from the effects stream or the wave's
 * own seed.
 *
 * - **Fire:** puffs poured from the tower along the flame's aim, white hot
 *   at the nozzle, turning yellow, orange and red, then smoke, each a
 *   cut-cornered square of art pixels with a hotter lick, all inside one
 *   black outline. The flame lights the ground through the battle's
 *   lighting (`flameLights`).
 * - **Ice:** as each wave's front (a dithered band of frost) passes,
 *   clusters of crystal shards sprout from dithered rime in a natural,
 *   ragged fan, stand glittering, then shatter into glints. Each cluster is
 *   baked per size step: every shard's facets shaded against one key light
 *   from the upper left (as the roofs and trees are) into the ice palette,
 *   all the clusters sharing one dark outline; nearby fire warms the lit
 *   facets. */
import { ENEMIES } from "./catalog.ts";
import { defendRandom } from "./grid.ts";
import type { DefendSim } from "./sim.ts";
import type { Flame, Frost } from "./wizard.ts";
import { random } from "../random.ts";
import { hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { artPen, bake, blit, FLAME, OUTLINE, puff, SMOKE } from "./pixel-fx.ts";
import type { CarriedLight } from "./lighting.ts";
import type { ReliefLight } from "./ground-relief.ts";

type Fire = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; ember: boolean };
type Shard = { ox: number; oy: number; ux: number; uy: number; len: number; w: number; phase: number };
type Cluster = { x: number; y: number; born: number; life: number; shards: Shard[] };
type Glint = { x: number; y: number; vx: number; vy: number; age: number; life: number };

/** The key light the shards are shaded against: from the upper left and
 * above, as a unit vector (x right, y down, z up). */
const KEY = norm3(-0.5, -0.62, 0.6);
/** Halfway between the key light and the viewer (straight above), for the
 * specular glint. */
const HALF = norm3(KEY[0], KEY[1], KEY[2] + 1);
/** Ice, from its outline's deepest blue to white. */
const OUTLINE_ICE = "#0b1628";
const ICE = ["#0b1628", "#24508c", "#4b8fd0", "#8fd0f6", "#d4f2ff", "#ffffff"];
/** Ice warmed by a fire nearby. */
const WARM_ICE = ["#0b1628", "#4a4a86", "#9a7fa8", "#f0b88a", "#ffe2bc", "#ffffff"];
const FIRE_RATE = 150;
const FIRE_SPEED = 9;

export class WizardArt {
  private fire: Fire[] = [];
  private clusters: Cluster[] = [];
  private glints: Glint[] = [];
  /** How far each wave's front had come when shards were last sown. */
  private sown = new Map<number, number>();
  private rand = defendRandom("effects");
  private due = 0;

  /** Advances the fire and ice by `dt` seconds of the battle. */
  update(sim: DefendSim, dt: number, now: number) {
    this.pour(sim.flames, dt);
    for (const p of this.fire) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Fire slows and billows as it spreads.
      const drag = Math.exp(-dt * (p.ember ? 0.5 : 0.8));
      p.vx *= drag;
      p.vy *= drag;
      if (!p.ember) p.vy -= dt * 0.6;
    }
    this.fire = this.fire.filter((p) => p.age < p.life);
    this.sow(sim.frosts, now);
    const t = now / 1000;
    for (const c of this.clusters) if (t - c.born >= c.life) this.shatter(c);
    this.clusters = this.clusters.filter((c) => t - c.born < c.life);
    for (const g of this.glints) {
      g.age += dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }
    this.glints = this.glints.filter((g) => g.age < g.life);
    if (this.fire.length > 900) this.fire.splice(0, this.fire.length - 900);
  }

  /** Whether anything is still burning or glittering. */
  get busy() {
    return this.fire.length + this.clusters.length + this.glints.length > 0;
  }

  // ── Fire ──────────────────────────────────────────────────────────────
  private pour(flames: readonly Flame[], dt: number) {
    this.due += dt * FIRE_RATE;
    const n = Math.floor(this.due);
    this.due -= n;
    for (const f of flames)
      for (let k = 0; k < n; k++) {
        const spread = (this.rand() + this.rand() + this.rand() - 1.5) * 0.36;
        const aim = Math.atan2(f.dy, f.dx), a = aim + spread, speed = FIRE_SPEED * (0.75 + this.rand() * 0.45);
        const ember = this.rand() < 0.08;
        // Spread over the frame, so the jet is continuous, not one puff a frame.
        const head = this.rand() * dt;
        this.fire.push({
          x: f.x + f.dx * 0.35 + Math.cos(a) * speed * head, y: f.y + f.dy * 0.35 + Math.sin(a) * speed * head,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, age: head,
          life: (f.range / FIRE_SPEED) * (1.15 + this.rand() * 0.45) * (ember ? 1.4 : 1),
          size: 0.2 + this.rand() * 0.16, ember,
        });
      }
  }

  /** The flame as pixel art: smoke behind, then one black outline round
   * the whole jet, then each puff from coolest to hottest so the white-hot
   * core shows through, and embers as single bright pixels. */
  drawFire(c: CanvasRenderingContext2D, px: number) {
    if (!this.fire.length) return;
    const dot = artPen(c, px);
    c.save();
    // Smoke, lit from the upper left, thinning as it drifts.
    for (const p of this.fire) {
      const k = p.age / p.life;
      if (k < 0.62 || p.ember) continue;
      const r = Math.max(1, Math.round((p.size + k * 0.5) * ART * 0.5)), ax = Math.round(p.x * ART), ay = Math.round(p.y * ART);
      c.globalAlpha = (1 - k) < 0.2 ? 0.35 : 0.6;
      c.fillStyle = SMOKE[1];
      puff(dot, ax, ay, r);
      c.fillStyle = SMOKE[3];
      dot(ax - r + 1, ay - r + 1, Math.max(1, r - 1), 1);
    }
    c.globalAlpha = 1;
    const live = this.fire.filter((p) => !p.ember && p.age / p.life < 0.85);
    live.sort((p, q) => q.age / q.life - p.age / p.life);
    c.fillStyle = OUTLINE;
    for (const p of live) puff(dot, Math.round(p.x * ART), Math.round(p.y * ART), fireRadius(p) + 1);
    for (const p of live) {
      const k = p.age / p.life, tone = k < 0.08 ? 4 : k < 0.22 ? 3 : k < 0.4 ? 2 : k < 0.62 ? 1 : 0;
      const x = Math.round(p.x * ART), y = Math.round(p.y * ART), r = fireRadius(p);
      c.fillStyle = FLAME[tone];
      puff(dot, x, y, r);
      // A hotter lick at its upper left, so the jet flickers inside.
      if (r > 0 && tone < 4) {
        c.fillStyle = FLAME[tone + 1];
        dot(x - r + 1, y - r + 1, r, 1);
        dot(x - r + 1, y - r + 1, 1, r);
      }
    }
    for (const p of this.fire) {
      if (!p.ember) continue;
      const k = p.age / p.life;
      c.fillStyle = k < 0.4 ? FLAME[4] : k < 0.75 ? FLAME[3] : FLAME[2];
      dot(Math.round(p.x * ART), Math.round(p.y * ART));
    }
    c.restore();
  }

  // ── Ice ───────────────────────────────────────────────────────────────
  /** Sows crystal clusters in the band each front crossed since last time. */
  private sow(frosts: readonly Frost[], now: number) {
    const live = new Set<number>();
    for (const w of frosts) {
      live.add(w.seed);
      const from = this.sown.get(w.seed) ?? 0.5;
      if (w.r <= from) continue;
      this.sown.set(w.seed, w.r);
      const rnd = random((w.seed ^ Math.floor(from * 1000)) >>> 0);
      // Clusters scatter over the band, thinner toward the fan's edges.
      const angle = Math.atan2(w.dy, w.dx), half = Math.atan(w.spread);
      const area = (w.r - from) * (from + w.r) * half;
      const count = Math.round(area * 1.25 + rnd());
      for (let k = 0; k < count; k++) {
        const side = (rnd() * 2 - 1) * (rnd() < 0.7 ? 0.8 : 1);
        const a = angle + side * half;
        const r = from + rnd() * (w.r - from);
        if (rnd() < Math.abs(side) * 0.45) continue;
        this.clusters.push(cluster(rnd, w.x + Math.cos(a) * r, w.y + Math.sin(a) * r, a, 1 - Math.abs(side) * 0.5, now / 1000 + rnd() * 0.06));
      }
    }
    for (const seed of this.sown.keys()) if (!live.has(seed)) this.sown.delete(seed);
    if (this.clusters.length > 700) this.clusters.splice(0, this.clusters.length - 700);
  }

  private shatter(c: Cluster) {
    for (const s of c.shards)
      for (let k = 0; k < 2; k++) {
        const a = this.rand() * Math.PI * 2, v = 0.4 + this.rand() * 1.2;
        this.glints.push({ x: c.x + s.ox + s.ux * s.len * 0.5, y: c.y + s.oy + s.uy * s.len * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, age: 0, life: 0.3 + this.rand() * 0.35 });
      }
    if (this.glints.length > 600) this.glints.splice(0, this.glints.length - 600);
  }

  /** Frost on the ground where the shards stand, the shards, the waves'
   * cold fronts and the glints of shattered ice, all as pixel art. `fires`
   * are flame lights whose glow warms the shards near them. */
  drawIce(c: CanvasRenderingContext2D, px: number, frosts: readonly Frost[], now: number, fires: readonly ReliefLight[]) {
    const t = now / 1000;
    const dot = artPen(c, px);
    c.save();
    c.imageSmoothingEnabled = false;
    // Dithered rime on the ground under each cluster, fading as it melts.
    for (const cl of this.clusters) {
      const age = t - cl.born, fade = Math.max(0, 1 - age / cl.life);
      if (age < 0) continue;
      c.globalAlpha = fade * Math.min(1, age / 0.2);
      const art = clusterArt(cl);
      blit(c, px, art.rime, Math.round(cl.x * ART) - RIME_W, Math.round(cl.y * ART) - RIME_H);
    }
    c.globalAlpha = 1;
    // Shards, back to front so nearer ones overlap farther ones.
    const order = [...this.clusters].sort((a, b) => a.y - b.y);
    // One outline round them all, then the ice, so neighbouring clusters
    // merge into one field of crystals.
    for (const cl of order) drawCluster(c, px, dot, cl, t, fires, true);
    for (const cl of order) drawCluster(c, px, dot, cl, t, fires, false);
    // The cold front: a dithered band of frost racing outward, brightest at
    // its leading edge.
    for (const w of frosts) {
      if (w.r >= w.range) continue;
      const angle = Math.atan2(w.dy, w.dx), half = Math.atan(w.spread);
      const cx = w.x * ART, cy = w.y * ART, rr = w.r * ART;
      const steps = Math.ceil(2 * half * (rr + 1));
      for (let o = 0; o < 4; o++) {
        c.fillStyle = ICE[o === 0 ? 5 : o === 1 ? 4 : 3];
        c.globalAlpha = o === 0 ? 0.9 : o === 1 ? 0.75 : 0.45;
        let lx = NaN, ly = NaN;
        for (let i = 0; i <= steps; i++) {
          const a = angle - half + (2 * half * i) / steps;
          const x = Math.round(cx + Math.cos(a) * (rr - o)), y = Math.round(cy + Math.sin(a) * (rr - o));
          if ((x === lx && y === ly) || (o >= 2 && (x + y + o) & 1)) continue;
          [lx, ly] = [x, y];
          dot(x, y);
        }
      }
    }
    c.globalAlpha = 1;
    // Glints of shattered ice: a little star while young, then a speck.
    c.fillStyle = ICE[5];
    for (const gl of this.glints) {
      const k = gl.age / gl.life, x = Math.round(gl.x * ART), y = Math.round(gl.y * ART);
      dot(x, y);
      if (k < 0.45) {
        c.fillStyle = ICE[4];
        dot(x - 1, y);
        dot(x + 1, y);
        dot(x, y - 1);
        dot(x, y + 1);
        c.fillStyle = ICE[5];
      }
    }
    c.restore();
  }

  /** Frost over chilled enemies: dithered rime across them, a pale rim on
   * top and a glint that twinkles. */
  drawChill(c: CanvasRenderingContext2D, px: number, sim: DefendSim, now: number) {
    const dot = artPen(c, px);
    c.save();
    for (const e of sim.enemies) {
      if (!e.chill) continue;
      const n = Math.max(2, Math.round(enemySize(e) * ART)), x0 = Math.round(e.x * ART - n / 2), y0 = Math.round(e.y * ART - n / 2);
      c.fillStyle = ICE[3];
      c.globalAlpha = 0.55;
      for (let y = 1; y < n; y++) for (let x = (y + e.id) & 1; x < n; x += 2) dot(x0 + x, y0 + y);
      c.globalAlpha = 0.9;
      c.fillStyle = ICE[4];
      dot(x0 + 1, y0, n - 2, 1);
      if (Math.sin(now / 160 + e.id) > 0.3) {
        c.fillStyle = ICE[5];
        dot(x0 + n - 2, y0 + 1);
      }
      // Frozen solid (Rime's deep freeze): a block of ice around it, outlined.
      if (e.freeze) {
        c.globalAlpha = 0.5;
        c.fillStyle = ICE[2];
        dot(x0 - 1, y0 - 1, n + 2, n + 2);
        c.globalAlpha = 1;
        c.fillStyle = ICE[4];
        dot(x0 - 1, y0 - 1, n + 2, 1);
        dot(x0 - 1, y0 - 1, 1, n + 2);
        c.fillStyle = OUTLINE_ICE;
        dot(x0 - 2, y0 - 2, n + 4, 1);
        dot(x0 - 2, y0 + n + 1, n + 4, 1);
        dot(x0 - 2, y0 - 1, 1, n + 2);
        dot(x0 + n + 1, y0 - 1, 1, n + 2);
      }
    }
    c.restore();
  }

  /** Cool light from the ice for the ground relief: at each young cluster
   * and along each front. */
  iceLights(frosts: readonly Frost[], now: number): ReliefLight[] {
    const out: ReliefLight[] = [];
    for (const w of frosts) {
      if (w.r >= w.range) continue;
      const angle = Math.atan2(w.dy, w.dx), half = Math.atan(w.spread);
      for (const s of [-0.6, 0, 0.6]) {
        const a = angle + s * half;
        out.push({ x: w.x + Math.cos(a) * w.r, y: w.y + Math.sin(a) * w.r, r: 2.2, k: 0.55, color: "#a8dcff" });
      }
    }
    const t = now / 1000;
    for (const cl of this.clusters) {
      const age = t - cl.born;
      if (age > 0.5 || out.length > 40) continue;
      out.push({ x: cl.x, y: cl.y, r: 1.3, k: 0.35 * (1 - age / 0.5), color: "#cdeeff" });
    }
    return out;
  }
}

/** Points along each burning flame that light the ground: carried lights
 * for the darkness (with their reach and brightness) and relief lights. */
export function flameLights(sim: DefendSim): { carried: CarriedLight[]; relief: ReliefLight[] } {
  const carried: CarriedLight[] = [], relief: ReliefLight[] = [];
  for (const f of sim.flames) {
    const grow = Math.min(1, f.t / 0.25), fade = Math.min(1, (f.dur - f.t) / 0.3);
    const reach = f.range * grow;
    [[0.25, 2.6, 1.1], [0.6, 3.4, 1.05], [0.95, 3, 0.8]].forEach(([at, r, k], i) => {
      const x = f.x + f.dx * reach * at, y = f.y + f.dy * reach * at;
      carried.push({ x, y, id: f.tower * 10 + i, r, k: k * fade });
      relief.push({ x, y, r: r * 1.15, k: k * fade, color: "#ffb36b" });
    });
  }
  return { carried, relief };
}

/** A cluster of two to five shards bursting from one spot, pointing
 * roughly outward along the wave (`a`), bigger toward the fan's middle. */
function cluster(rnd: () => number, x: number, y: number, a: number, big: number, born: number): Cluster {
  const n = 2 + Math.floor(rnd() * 4), shards: Shard[] = [];
  for (let k = 0; k < n; k++) {
    // Shards fan out from the root, most leaning the way the wave travels;
    // seen from above, a shard tilted up toward the viewer looks shorter.
    const dir = a + (rnd() * 2 - 1) * 1.1 + (k === 0 ? 0 : (rnd() - 0.5) * 1.4);
    const tilt = 0.45 + rnd() * 0.55;
    shards.push({
      ox: (rnd() - 0.5) * 0.18, oy: (rnd() - 0.5) * 0.14,
      ux: Math.cos(dir), uy: Math.sin(dir) - 0.35 * tilt,
      len: (0.5 + rnd() * 0.6) * (0.6 + big * 0.5) * tilt, w: 0.13 + rnd() * 0.11, phase: rnd() * 6.28,
    });
  }
  // Each shard's direction kept unit length after the upward lean.
  for (const s of shards) {
    const l = Math.sqrt(s.ux * s.ux + s.uy * s.uy);
    s.ux /= l;
    s.uy /= l;
  }
  shards.sort((p, q) => p.oy + p.uy * p.len - (q.oy + q.uy * q.len));
  return { x, y, born, life: 1.1 + rnd() * 0.6, shards };
}

/** How big a cluster's shards stand: growing in, then shrinking away as it
 * shatters, in `SCALES` steps. */
const SCALES = 5;
/** Half the rime patch's size, in art pixels. */
const RIME_W = 5, RIME_H = 4;
/** Half a cluster sprite's size, in art pixels. */
const CLUSTER_R = 12;

type ClusterArt = { rime: HTMLCanvasElement; shards: ({ outline: HTMLCanvasElement; fill: HTMLCanvasElement } | undefined)[] };
const clusterArts = new WeakMap<Cluster, ClusterArt>();

function clusterArt(cl: Cluster) {
  let art = clusterArts.get(cl);
  if (!art) clusterArts.set(cl, (art = { rime: rimeSprite(cl), shards: [] }));
  return art;
}

function drawCluster(c: CanvasRenderingContext2D, px: number, dot: ReturnType<typeof artPen>, cl: Cluster, t: number, fires: readonly ReliefLight[], outline: boolean) {
  const age = t - cl.born;
  if (age < 0) return;
  const grow = Math.min(1, age / 0.14), end = Math.min(1, (cl.life - age) / 0.25);
  const scale = (1 - (1 - grow) * (1 - grow)) * Math.max(0, end);
  const step = Math.round(scale * SCALES);
  if (step <= 0) return;
  // The warmest fire nearby warms the shards' lit facets.
  let heat = 0;
  for (const f of fires) heat = Math.max(heat, f.k * Math.max(0, 1 - Math.hypot(f.x - cl.x, f.y - cl.y) / (f.r * 1.4)));
  const warm = heat > 0.3 ? 1 : 0;
  const art = clusterArt(cl);
  const img = (art.shards[step * 2 + warm] ??= bakeCluster(cl, step / SCALES, warm === 1));
  const ax = Math.round(cl.x * ART) - CLUSTER_R, ay = Math.round(cl.y * ART) - CLUSTER_R;
  blit(c, px, outline ? img.outline : img.fill, ax, ay);
  // Glints twinkling at the shards' lit tips.
  if (outline || step < SCALES) return;
  c.fillStyle = ICE[5];
  for (const s of cl.shards) {
    if (Math.sin(t * 5 + s.phase) < 0.93 || s.len < 0.6) continue;
    const x = Math.round((cl.x + s.ox + s.ux * s.len * 0.75) * ART), y = Math.round((cl.y + s.oy + s.uy * s.len * 0.75) * ART);
    dot(x - 1, y, 3, 1);
    dot(x, y - 1, 1, 3);
  }
}

/** A cluster's shards at `scale`, rasterized: each shard two long facets
 * either side of its spine and a bevel at its tip, each shaded by its own
 * normal against the key light into the ice palette, darker where it sinks
 * into the frost, all inside one black outline. `warm` turns the lit
 * facets toward the fire's glow. */
function bakeCluster(cl: Cluster, scale: number, warm: boolean) {
  const N = CLUSTER_R * 2 + 1;
  const grid = new Int8Array(N * N).fill(-1);
  for (const s of cl.shards) {
    const len = s.len * scale * ART, w = Math.max(0.9, s.w * Math.min(1, scale * 1.4) * ART * 0.7);
    const ox = s.ox * ART, oy = s.oy * ART, nx = -s.uy, ny = s.ux;
    const left = norm3(nx * 0.75, ny * 0.75, 0.66), right = norm3(-nx * 0.75, -ny * 0.75, 0.66);
    const bevelL = norm3(nx * 0.45 + s.ux * 0.55, ny * 0.45 + s.uy * 0.55, 0.7), bevelR = norm3(-nx * 0.45 + s.ux * 0.55, -ny * 0.45 + s.uy * 0.55, 0.7);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - CLUSTER_R - 0.5 - ox, dy = y + 0.5 - CLUSTER_R - 0.5 - oy;
        const along = (dx * s.ux + dy * s.uy) / len, side = (dx * nx + dy * ny) / w;
        if (along < -0.05 || along > 1) continue;
        const hw = along < 0.74 ? 1 : (1 - along) / 0.26;
        if (Math.abs(side) > hw + 0.15) continue;
        const n = along >= 0.74 ? (side >= 0 ? bevelL : bevelR) : side >= 0 ? left : right;
        const lit = Math.max(0, dot3(n, KEY)) + Math.pow(Math.max(0, dot3(n, HALF)), 28) * 0.8;
        let tone = lit < 0.3 ? 1 : lit < 0.55 ? 2 : lit < 0.8 ? 3 : 4;
        if (Math.abs(side) < 0.3 && along > 0.2 && along < 0.85 && tone >= 2) tone = Math.min(5, tone + 1);
        if (along < 0.25) tone = Math.max(1, tone - 1);
        grid[y * N + x] = tone;
      }
  }
  const { cv: line, c } = bake(N, N);
  c.fillStyle = OUTLINE_ICE;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (grid[y * N + x] >= 0) continue;
      const near = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < N && yy < N && grid[yy * N + xx] >= 0;
      if (near(x - 1, y) || near(x + 1, y) || near(x, y - 1) || near(x, y + 1)) c.fillRect(x, y, 1, 1);
    }
  const palette = warm ? WARM_ICE : ICE;
  const { cv: fill, c: f } = bake(N, N);
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] < 0) continue;
    f.fillStyle = palette[grid[i]];
    f.fillRect(i % N, Math.floor(i / N), 1, 1);
  }
  return { outline: line, fill };
}

/** Rime on the ground: pale specks dithered over a patch, thicker at its
 * heart. */
function rimeSprite(cl: Cluster) {
  const { cv, c } = bake(RIME_W * 2 + 1, RIME_H * 2 + 1);
  const seed = Math.round(cl.x * 131 + cl.y * 977);
  for (let y = -RIME_H; y <= RIME_H; y++)
    for (let x = -RIME_W; x <= RIME_W; x++) {
      const d = Math.sqrt((x / RIME_W) ** 2 + (y / RIME_H) ** 2);
      if (d > 1 || (x + y) & 1 || hash01(seed, x, y) > 1.1 - d) continue;
      c.fillStyle = d < 0.5 ? "rgba(214,240,255,0.7)" : "rgba(170,214,246,0.5)";
      c.fillRect(x + RIME_W, y + RIME_H, 1, 1);
    }
  return cv;
}

/** A flame puff's size as it spreads, in art pixels. */
const fireRadius = (p: Fire) => Math.max(0, Math.round((p.size + (p.age / p.life) * 0.6) * ART * 0.36));

function norm3(x: number, y: number, z: number) {
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
}
const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
