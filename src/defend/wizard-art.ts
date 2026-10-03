import { enemySize } from "./catalog.ts";
/** The wizard tower's attacks as they are drawn: the flamethrower's fire
 * and the ice wave's shards. The sim says where each burns or spreads
 * (`sim.flames`, `sim.frosts`); everything here is presentation, with its
 * randomness from the effects stream or the wave's own seed.
 *
 * - **Fire:** particles poured from the tower along the flame's aim, white
 *   hot at the nozzle, turning yellow, orange and red, then smoke. The
 *   flame lights the ground through the battle's lighting (`flameLights`).
 * - **Ice:** as each wave's front passes, clusters of crystal shards sprout
 *   from the ground in a natural, ragged fan, stand glittering, then
 *   shatter into glints. Every shard is shaded as a faceted solid against
 *   one key light from the upper left (as the roofs and trees are), with a
 *   Blinn specular glint and a lit rim, so they all catch the light the
 *   same way; nearby fire adds a warm reflection on the facets facing it. */
import { ENEMIES } from "./catalog.ts";
import { defendRandom } from "./grid.ts";
import type { DefendSim } from "./sim.ts";
import type { Flame, Frost } from "./wizard.ts";
import { random } from "../random.ts";
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
const FIRE_RATE = 150;
const FIRE_SPEED = 9;

export class WizardArt {
  private fire: Fire[] = [];
  private clusters: Cluster[] = [];
  private glints: Glint[] = [];
  /** How far each wave's front had come when shards were last sown. */
  private sown = new Map<number, number>();
  private rand = defendRandom("effects");
  private sprites: HTMLCanvasElement[] | null = null;
  private rime: HTMLCanvasElement | null = null;
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

  /** Smoke under the fire, then the fire itself, blended as light. */
  drawFire(c: CanvasRenderingContext2D, px: number) {
    if (!this.fire.length) return;
    const sprites = (this.sprites ??= fireSprites());
    c.save();
    for (const p of this.fire) {
      const k = p.age / p.life;
      if (k < 0.62 || p.ember) continue;
      const r = (p.size + k * 0.9) * px;
      c.globalAlpha = 0.28 * (1 - k);
      c.drawImage(sprites[4], p.x * px - r, p.y * px - r, r * 2, r * 2);
    }
    c.globalCompositeOperation = "lighter";
    for (const p of this.fire) {
      const k = p.age / p.life;
      if (p.ember) {
        c.globalAlpha = 1 - k;
        c.fillStyle = "#ffd27a";
        const s = Math.max(1, px * 0.08);
        c.fillRect(p.x * px - s / 2, p.y * px - s / 2, s, s);
        continue;
      }
      if (k >= 0.88) continue;
      const r = (p.size + k * 0.8) * px;
      c.globalAlpha = Math.min(1, (1 - k / 0.88) * 0.8);
      c.drawImage(sprites[Math.min(3, Math.floor(k * 5))], p.x * px - r, p.y * px - r, r * 2, r * 2);
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

  /** Frost on the ground where the shards stand, the shards, and the
   * waves' cold fronts. `fires` are flame lights the shards reflect. */
  drawIce(c: CanvasRenderingContext2D, px: number, frosts: readonly Frost[], now: number, fires: readonly ReliefLight[]) {
    const t = now / 1000;
    c.save();
    // Soft rime on the ground under each cluster, fading as it melts.
    const rime = (this.rime ??= rimeSprite());
    for (const cl of this.clusters) {
      const age = t - cl.born, fade = Math.max(0, 1 - age / cl.life);
      c.globalAlpha = fade * Math.min(1, age / 0.2);
      c.drawImage(rime, (cl.x - 0.6) * px, (cl.y - 0.45) * px, 1.2 * px, 0.9 * px);
    }
    c.globalAlpha = 1;
    // Shards, back to front so nearer ones overlap farther ones.
    const order = [...this.clusters].sort((a, b) => a.y - b.y);
    for (const cl of order) drawCluster(c, px, cl, t, fires);
    c.globalCompositeOperation = "lighter";
    // The cold front: a pale band racing outward.
    for (const w of frosts) {
      if (w.r >= w.range) continue;
      const g = c.createRadialGradient(w.x * px, w.y * px, Math.max(0, w.r - 0.7) * px, w.x * px, w.y * px, (w.r + 0.25) * px);
      g.addColorStop(0, "rgba(120,190,255,0)");
      g.addColorStop(0.75, "rgba(170,225,255,0.32)");
      g.addColorStop(1, "rgba(230,248,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(w.x * px, w.y * px);
      const angle = Math.atan2(w.dy, w.dx), half = Math.atan(w.spread);
      c.arc(w.x * px, w.y * px, (w.r + 0.25) * px, angle - half, angle + half);
      c.closePath();
      c.fill();
    }
    for (const gl of this.glints) {
      c.globalAlpha = 1 - gl.age / gl.life;
      c.fillStyle = "#eaf8ff";
      const s = Math.max(1, px * 0.07);
      c.fillRect(gl.x * px - s / 2, gl.y * px - s / 2, s, s);
    }
    c.restore();
  }

  /** A frosty sheen over chilled enemies. */
  drawChill(c: CanvasRenderingContext2D, px: number, sim: DefendSim, now: number) {
    c.save();
    for (const e of sim.enemies) {
      if (!e.chill) continue;
      const s = enemySize(e) * px, x = e.x * px - s / 2, y = e.y * px - s / 2;
      c.fillStyle = "rgba(170,220,255,0.45)";
      c.fillRect(x, y, s, s);
      c.fillStyle = "rgba(240,252,255,0.9)";
      const d = Math.max(1, px * 0.07), tw = Math.sin(now / 160 + e.id) > 0.3;
      c.fillRect(x + s * 0.15, y + s * 0.15, d, d);
      if (tw) c.fillRect(x + s * 0.7, y + s * 0.6, d, d);
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

/** Grows in, stands, then shrinks away as it shatters. */
function drawCluster(c: CanvasRenderingContext2D, px: number, cl: Cluster, t: number, fires: readonly ReliefLight[]) {
  const age = t - cl.born;
  if (age < 0) return;
  const grow = Math.min(1, age / 0.14), end = Math.min(1, (cl.life - age) / 0.25);
  const scale = (1 - (1 - grow) * (1 - grow)) * Math.max(0, end);
  if (scale <= 0.02) return;
  // The warmest fire nearby, for a reflection on the facets facing it.
  let fire: ReliefLight | null = null, heat = 0;
  for (const f of fires) {
    const d = Math.hypot(f.x - cl.x, f.y - cl.y), v = f.k * Math.max(0, 1 - d / (f.r * 1.4));
    if (v > heat) [heat, fire] = [v, f];
  }
  for (const s of cl.shards) drawShard(c, px, cl.x + s.ox, cl.y + s.oy, s, scale, t, fire, heat);
}

/** One shard: two long facets either side of its spine and a short bevel
 * at the tip, each shaded by its own normal against the key light. */
function drawShard(c: CanvasRenderingContext2D, px: number, x: number, y: number, s: Shard, scale: number, t: number, fire: ReliefLight | null, heat: number) {
  const len = s.len * scale, w = s.w * Math.min(1, scale * 1.4);
  const nx = -s.uy, ny = s.ux;
  const P = (along: number, side: number) => [(x + s.ux * len * along + nx * w * side) * px, (y + s.uy * len * along + ny * w * side) * px] as const;
  const base = P(0, 0), tip = P(1, 0), l0 = P(0.02, 0.55), r0 = P(0.02, -0.55), l1 = P(0.74, 0.5), r1 = P(0.74, -0.5), spine = P(0.8, 0);
  // Facet normals: the long sides lean out from the spine and up toward
  // the viewer; the bevel at the tip faces along the shard and up.
  const left = norm3(nx * 0.75, ny * 0.75, 0.66), right = norm3(-nx * 0.75, -ny * 0.75, 0.66), bevelL = norm3(nx * 0.45 + s.ux * 0.55, ny * 0.45 + s.uy * 0.55, 0.7), bevelR = norm3(-nx * 0.45 + s.ux * 0.55, -ny * 0.45 + s.uy * 0.55, 0.7);
  const facets: [readonly (readonly [number, number])[], number[]][] = [
    [[base, l0, l1, spine], left],
    [[base, r0, r1, spine], right],
    [[l1, tip, spine], bevelL],
    [[r1, tip, spine], bevelR],
  ];
  // Fire's direction, low over the ground.
  const fd = fire ? norm3(fire.x - x, fire.y - y, 0.35) : null;
  c.lineJoin = "round";
  for (const [pts, n] of facets) {
    const diffuse = Math.max(0, dot(n, KEY));
    const spec = Math.pow(Math.max(0, dot(n, HALF)), 28);
    let r = 34 + diffuse * 150 + spec * 120, g = 84 + diffuse * 140 + spec * 80, b = 140 + diffuse * 110 + spec * 40;
    if (fd) {
      const warm = Math.max(0, dot(n, fd)) * heat;
      r += warm * 150;
      g += warm * 70;
      b -= warm * 30;
    }
    c.fillStyle = `rgba(${clamp255(r)},${clamp255(g)},${clamp255(b)},0.92)`;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]);
    c.closePath();
    c.fill();
  }
  // The base sinks into the frost, deeper blue and in shadow.
  const lb = P(0.28, 0.55), rb = P(0.28, -0.55);
  c.fillStyle = "rgba(8,26,58,0.35)";
  c.beginPath();
  c.moveTo(l0[0], l0[1]);
  c.lineTo(lb[0], lb[1]);
  c.lineTo(rb[0], rb[1]);
  c.lineTo(r0[0], r0[1]);
  c.closePath();
  c.fill();
  const line = Math.max(0.7, px * 0.035);
  c.lineWidth = line;
  // A dark outline on the side turned from the light, a bright rim on the
  // lit side, and the spine as a crisp ridge.
  const litLeft = dot(left, KEY) >= dot(right, KEY);
  const [litA, litB, darkA, darkB] = litLeft ? [l0, l1, r0, r1] : [r0, r1, l0, l1];
  c.strokeStyle = "rgba(10,26,52,0.9)";
  c.beginPath();
  c.moveTo(darkA[0], darkA[1]);
  c.lineTo(darkB[0], darkB[1]);
  c.lineTo(tip[0], tip[1]);
  c.stroke();
  c.strokeStyle = "rgba(236,250,255,0.7)";
  c.beginPath();
  c.moveTo(litA[0], litA[1]);
  c.lineTo(litB[0], litB[1]);
  c.lineTo(tip[0], tip[1]);
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.beginPath();
  c.moveTo(base[0], base[1]);
  c.lineTo(spine[0], spine[1]);
  c.stroke();
  // The glint: where the lit bevel catches the key light, twinkling.
  const tw = 0.6 + 0.4 * Math.sin(t * 5 + s.phase);
  const glint = Math.pow(Math.max(0, dot(litLeft ? bevelL : bevelR, HALF)), 10) * tw;
  if (glint > 0.25 && len * px > 3) {
    const at = litLeft ? P(0.78, 0.22) : P(0.78, -0.22), g = Math.max(1, px * 0.12 * glint);
    c.fillStyle = `rgba(255,255,255,${Math.min(1, glint).toFixed(2)})`;
    c.fillRect(at[0] - g, at[1] - line / 2, g * 2, line);
    c.fillRect(at[0] - line / 2, at[1] - g, line, g * 2);
  }
}

/** A soft patch of frost: pale blue at the heart, feathered to nothing. */
function rimeSprite() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(214,238,255,0.32)");
  g.addColorStop(0.55, "rgba(190,224,250,0.16)");
  g.addColorStop(1, "rgba(180,220,250,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  // A few frozen specks.
  c.fillStyle = "rgba(240,250,255,0.5)";
  for (const [x, y] of [[9, 14], [20, 10], [24, 19], [13, 22], [16, 16]]) c.fillRect(x, y, 1, 1);
  return cv;
}

function fireSprites() {
  const tints: [number, number, number][] = [[255, 250, 220], [255, 214, 120], [255, 150, 60], [220, 70, 30]];
  const make = (stops: [number, string][]) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    const c = cv.getContext("2d")!;
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    for (const [o, col] of stops) g.addColorStop(o, col);
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
    return cv;
  };
  const fire = tints.map(([r, g, b]) => make([[0, `rgba(${r},${g},${b},0.95)`], [0.45, `rgba(${r},${Math.round(g * 0.7)},${Math.round(b * 0.5)},0.45)`], [1, `rgba(${r},${Math.round(g * 0.5)},0,0)`]]));
  const smoke = make([[0, "rgba(40,36,34,0.8)"], [1, "rgba(40,36,34,0)"]]);
  return [...fire, smoke];
}

function norm3(x: number, y: number, z: number) {
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
}
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
