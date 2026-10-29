/** Golden motes drifting round an upgrade tree, after Tower Delve's skill
 * trees: a small forced fluid (advected, forced, its divergence projected
 * out, no viscosity) swirls gently round every upgrade (hard round the one
 * picked) and runs as a current along every branch from an upgrade to the
 * next, and the motes ride it. Each mote is a square of gold pixels, one,
 * two or three pixels across, the bigger ones a touch heavier: a mote's
 * velocity eases toward the fluid's at a rate that falls with its size
 * (`SIZES`), so the big ones swing wide round the turns the small ones
 * follow closely. A purchase's `burst` pushes them outward for a moment.
 *
 * The motes live in the tree's own space: they fill `MoteScene.area`, the
 * space the player can pan round (a little beyond the tree), and are drawn
 * through `MoteScene.view`, the tree's pan and zoom, so they pan and zoom
 * with it.
 *
 * Presentation only: positions are a fraction of the area, its randomness
 * from `stream("effects")`, and nothing is drawn under Reduce Motion. The
 * page hands it the nodes' centres and branches in the tree's own pixels
 * each frame (`TreeMotes.draw`); `UpgradeGraph` and the Study's spell trees
 * each keep one. */
import { stream } from "../random.ts";

const fx = stream("effects");

type Size = { w: number; h: number };
/** A box in the tree's own pixels. */
export type MoteArea = { x: number; y: number; w: number; h: number };
/** An upgrade's centre, in the tree's own pixels. */
export type MoteNode = { id: string; x: number; y: number };
/** What one frame shows: the upgrades, the branches (each from an upgrade
 * to the one it opens), the one picked, the area the motes fill and the
 * view onto it (a point of the tree at (x, y) shows at CSS pixel
 * `view.x + x * view.s`), the size of a mote pixel on screen in CSS pixels,
 * and whether motion is reduced. */
export type MoteScene = {
  nodes: readonly MoteNode[];
  edges: readonly (readonly [string, string])[];
  picked: string | null;
  area: MoteArea;
  view: { x: number; y: number; s: number };
  pixel: number;
  reduced: boolean;
};

/** The three mote sizes, in pixels across: how many of every hundred motes
 * have each, how fast (per second) each eases toward the fluid's velocity,
 * the slight inertia growing with size, and its colours. */
export const SIZES = [
  { side: 1, share: 55, follow: 11, body: "#ffe7a3", light: "#ffe7a3" },
  { side: 2, share: 30, follow: 8.5, body: "#f2c95a", light: "#fff3c4" },
  { side: 3, share: 15, follow: 6.5, body: "#d9a43a", light: "#fff1b8" },
] as const;

type Mote = { x: number; y: number; vx: number; vy: number; size: 0 | 1 | 2; alpha: number; phase: number };
type Pulse = { x: number; y: number; age: number };

/** Cells across the fluid's square grid. */
const N = 40;
/** How long a burst pushes, in seconds. */
const BURST_LIFE = 1.2;

/** The value of the `n` x `n` grid `field` at (x, y), blended between the
 * four cells round it, (x, y) held inside the grid. */
export function sampleField(field: Float32Array, n: number, x: number, y: number) {
  x = Math.max(0, Math.min(n - 1.001, x));
  y = Math.max(0, Math.min(n - 1.001, y));
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  return (field[iy * n + ix] * (1 - fx) + field[iy * n + ix + 1] * fx) * (1 - fy)
    + (field[(iy + 1) * n + ix] * (1 - fx) + field[(iy + 1) * n + ix + 1] * fx) * fy;
}

/** A mote's size, drawn by the shares. */
function pickSize(r: number): 0 | 1 | 2 {
  return r * 100 < SIZES[0].share ? 0 : r * 100 < SIZES[0].share + SIZES[1].share ? 1 : 2;
}

export class TreeMotes {
  private u = new Float32Array(N * N);
  private v = new Float32Array(N * N);
  private pressure = new Float32Array(N * N);
  private motes: Mote[] = [];
  private pulses: Pulse[] = [];
  private last = 0;
  private elapsed = 0;
  private seeded = 0;
  private area: MoteArea = { x: 0, y: 0, w: 1, h: 1 };

  /** How many motes there are (tests). */
  get count() { return this.motes.length; }

  /** A purchase's outward push from (x, y), in the tree's own pixels. */
  burst(x: number, y: number) {
    const a = this.area;
    this.pulses.push({ x: (x - a.x) / a.w, y: (y - a.y) / a.h, age: 0 });
  }

  draw(canvas: HTMLCanvasElement, time: number, scene: MoteScene) {
    const ctx = canvas.getContext("2d"), w = canvas.clientWidth, h = canvas.clientHeight;
    if (!ctx || !w || !h) return;
    const dpr = Math.min((typeof devicePixelRatio === "number" && devicePixelRatio) || 1, 2), width = Math.round(w * dpr), height = Math.round(h * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (scene.reduced) {
      this.pulses = [];
      this.last = 0;
      return;
    }
    const area = (this.area = { ...scene.area, w: Math.max(1, scene.area.w), h: Math.max(1, scene.area.h) }), size = { w: area.w, h: area.h };
    this.seed(size);
    const dt = this.frameTime(time);
    this.advance(dt, scene, size);
    // One mote pixel is a whole number of device pixels, on one grid.
    const unit = Math.max(1, Math.round(scene.pixel * dpr));
    const { x: vx, y: vy, s } = scene.view;
    for (const m of this.motes) {
      this.move(m, dt, size);
      const x = (vx + (area.x + m.x * area.w) * s) * dpr, y = (vy + (area.y + m.y * area.h) * s) * dpr;
      if (x < -3 * unit || y < -3 * unit || x > width || y > height) continue;
      paint(ctx, m, unit, x, y, time);
    }
    ctx.globalAlpha = 1;
  }

  /** As many motes as the area calls for, kept as it grows and shrinks. */
  private seed({ w, h }: Size) {
    const area = w * h;
    if (Math.abs(area - this.seeded) < this.seeded * 0.2) return;
    this.seeded = area;
    const want = Math.min(600, Math.max(90, Math.round(area / 1100)));
    while (this.motes.length > want) this.motes.pop();
    while (this.motes.length < want)
      this.motes.push({ x: fx(), y: fx(), vx: 0, vy: 0, size: pickSize(fx()), alpha: 0.35 + fx() * 0.45, phase: fx() * Math.PI * 2 });
  }

  /** Seconds since the last frame, or 0 after a pause. */
  private frameTime(time: number) {
    const dt = this.last && time - this.last < 150 ? Math.min((time - this.last) / 1000, 1 / 30) : 0;
    this.last = time;
    return dt;
  }

  /** Steps the fluid (at most 30 times a second) and ages the bursts. */
  private advance(dt: number, scene: MoteScene, size: Size) {
    this.elapsed += dt;
    if (this.elapsed >= 1 / 30) {
      this.step(Math.min(this.elapsed, 1 / 15), scene, size);
      this.elapsed = 0;
    }
    for (const p of this.pulses) p.age += dt;
    this.pulses = this.pulses.filter((p) => p.age < BURST_LIFE);
  }

  /** Eases a mote's velocity toward the fluid's (and the bursts') at its
   * size's rate, then carries it, wrapping at the edges. */
  private move(m: Mote, dt: number, size: Size) {
    let tx = sampleField(this.u, N, m.x * (N - 1), m.y * (N - 1)), ty = sampleField(this.v, N, m.x * (N - 1), m.y * (N - 1));
    for (const p of this.pulses) {
      const [bx, by] = burst(m, p, size);
      tx += bx;
      ty += by;
    }
    const k = 1 - Math.exp(-SIZES[m.size].follow * dt);
    m.vx += (tx - m.vx) * k;
    m.vy += (ty - m.vy) * k;
    m.x = (m.x + m.vx * dt + 1) % 1;
    m.y = (m.y + m.vy * dt + 1) % 1;
  }

  private step(dt: number, scene: MoteScene, { w, h }: Size) {
    const nextU = new Float32Array(N * N), nextV = new Float32Array(N * N), { x: ax, y: ay } = this.area;
    const at = new Map(scene.nodes.map((n) => [n.id, n]));
    const edges = scene.edges.flatMap(([a, b]) => {
      const from = at.get(a), to = at.get(b);
      return from && to ? [{ from, to }] : [];
    });
    // The forcing relaxes the field toward the tree as it is now.
    const blend = 1 - Math.exp(-dt * 2);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const [fx, fy] = forceAt(ax + (x / (N - 1)) * w, ay + (y / (N - 1)) * h, scene, edges);
        const bx = x - this.u[i] * dt * (N - 1), by = y - this.v[i] * dt * (N - 1);
        nextU[i] = sampleField(this.u, N, bx, by) * (1 - blend) + (fx / w) * blend;
        nextV[i] = sampleField(this.v, N, bx, by) * (1 - blend) + (fy / h) * blend;
      }
    this.project(nextU, nextV, w, h);
    this.u = nextU;
    this.v = nextV;
  }

  /** Takes the divergence out of the field, minding the canvas's aspect. */
  private project(u: Float32Array, v: Float32Array, w: number, h: number) {
    const hx = w / (N - 1), hy = h / (N - 1), p = this.pressure, div = new Float32Array(N * N);
    p.fill(0);
    eachInterior((i) => { div[i] = ((u[i + 1] - u[i - 1]) * w) / (2 * hx) + ((v[i + N] - v[i - N]) * h) / (2 * hy); });
    const a = 1 / (hx * hx), b = 1 / (hy * hy);
    for (let k = 0; k < 32; k++) eachInterior((i) => { p[i] = ((p[i - 1] + p[i + 1]) * a + (p[i - N] + p[i + N]) * b - div[i]) / (2 * (a + b)); });
    eachInterior((i) => {
      u[i] -= (p[i + 1] - p[i - 1]) / (2 * hx * w);
      v[i] -= (p[i + N] - p[i - N]) / (2 * hy * h);
    });
  }
}

/** Every cell of the grid but its border, row by row. */
function eachInterior(fn: (i: number) => void) {
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) fn(y * N + x);
}

/** The force at (px, py), the tree's own pixels: a swirl round every
 * upgrade, and a current along every branch. */
function forceAt(px: number, py: number, scene: MoteScene, edges: { from: MoteNode; to: MoteNode }[]): [number, number] {
  let fx = 0, fy = 0;
  for (const n of scene.nodes) {
    const dx = px - n.x, dy = py - n.y;
    // Screen y points down: positive turns clockwise.
    const strength = n.id === scene.picked ? 0.85 : -0.12;
    const falloff = Math.exp(-(dx * dx + dy * dy) / (2 * 65 * 65));
    fx += -dy * strength * falloff;
    fy += dx * strength * falloff;
  }
  for (const { from, to } of edges) {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
    if (!len) continue;
    const t = Math.max(0, Math.min(1, ((px - from.x) * dx + (py - from.y) * dy) / (len * len)));
    const d = Math.hypot(px - from.x - t * dx, py - from.y - t * dy);
    const strength = 12 * Math.exp(-(d * d) / (2 * 22 * 22));
    fx += (dx / len) * strength;
    fy += (dy / len) * strength;
  }
  return [fx, fy];
}

/** A burst's outward push on a mote, in canvas fractions a second. */
function burst(m: { x: number; y: number }, p: Pulse, { w, h }: Size): [number, number] {
  const dx = (m.x - p.x) * w, dy = (m.y - p.y) * h, r = Math.hypot(dx, dy);
  const force = 170 * Math.exp(-p.age * 3.5) * Math.exp(-(r * r) / 22000);
  return r > 1 ? [((dx / r) * force) / w, ((dy / r) * force) / h] : [0, 0];
}

/** A mote at device pixel (px, py) as gold pixels on the grid `unit` device
 * pixels a pixel, fading near the area's edges it wraps across and glinting
 * now and then; the bigger ones lit at their top left. */
function paint(ctx: CanvasRenderingContext2D, m: Mote, unit: number, px: number, py: number, time: number) {
  const edge = Math.min(1, m.x * 30, (1 - m.x) * 30, m.y * 30, (1 - m.y) * 30);
  const glint = 0.8 + 0.2 * Math.sin(time / 380 + m.phase);
  ctx.globalAlpha = m.alpha * edge * glint;
  const s = SIZES[m.size], side = s.side * unit;
  const x = Math.floor(px / unit) * unit, y = Math.floor(py / unit) * unit;
  ctx.fillStyle = s.body;
  ctx.fillRect(x, y, side, side);
  if (s.side > 1) {
    ctx.fillStyle = s.light;
    ctx.fillRect(x, y, unit, unit);
  }
}
