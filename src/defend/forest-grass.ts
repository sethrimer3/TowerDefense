/** The parks' wind-blown grass (`park-grass.ts`) over the forest floor
 * outside Mossbound Ruins' walls: clumps of pixel blades planned per open
 * cell, kept off the lakes, boulders, rocks and pads, and under a tree's
 * crown left out while it stands (it hides them), swaying with the wind, parting round
 * anyone walking through and darkened in the trees' shadows. A blade grows
 * only while its root's floor pixel is still grass (`turfAt` in
 * `forest-art.ts`), so the dirt blasts, burning ground and craters bare
 * takes its blades with it. Written into one board-sized pixel buffer at
 * most 30 times a second and drawn scaled up; the blades no one stirs are
 * swayed from sines of their own phases baked once (`Swaying`), so tens of
 * thousands cost no trigonometry a frame. Presentation only. */
import { CELLS_H, CELLS_W, cellIndex, hash01 } from "./grid.ts";
import type { ForestDamage, ForestPlan } from "./forest.ts";
import { lakeDepth, shadedAt, turfAt } from "./forest-art.ts";
import { ART } from "./park-art.ts";
import { CURVE, PALETTE32, SHADOW, WIND, paintBlade, type Blade, type GrassFrame, type Walker } from "./park-grass.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;
/** The most walkers a cell's blades part round; crowds press no harder. */
const CROWD = 3;

/** A blade, and the tree whose crown hides it while it stands (-1 none). */
export type ForestBlade = Blade & { under: number };

/** Open cell (cx, cy)'s blades, as the parks' are planned: clumps of two to
 * four fanning out from one root; `keep` says whether a root may grow
 * there (-1 for no) and under which tree. */
function planCell(cx: number, cy: number, keep: (x: number, y: number) => number): ForestBlade[] {
  const r = (k: number) => hash01(cx, cy, 600 + k);
  const out: ForestBlade[] = [];
  const clumps = 2 + Math.floor(r(0) * 3);
  for (let k = 1; k <= clumps; k++) {
    const i = 1 + Math.floor(r(k) * 6), j = 3 + Math.floor(r(k + 20) * 5);
    const tall = 2 + Math.floor(r(k + 40) * 3), color = Math.floor(r(k + 60) * 4), phase = r(k + 80) * Math.PI * 2;
    const n = 2 + Math.floor(r(k + 100) * 3);
    for (let q = 0; q < n; q++) {
      const side = q - (n - 1) / 2, bi = i + Math.round(side);
      const under = bi < 0 || bi >= ART ? -2 : keep(cx + (bi + 0.5) / ART, cy + (j + 0.5) / ART);
      if (under < -1) continue;
      out.push({
        under,
        i: bi, j, h: Math.max(2, tall - Math.abs(Math.round(side * 2))), color: Math.max(0, color - (q % 2)), phase: phase + q * 0.35, splay: side * 0.9,
        flower: 0,
      });
    }
  }
  return out.sort((a, b) => a.j - b.j);
}

/** The blades of `plan`'s open ground, by cell (null where none grow). */
export function forestBlades(plan: ForestPlan): (ForestBlade[] | null)[] {
  const out: (ForestBlade[] | null)[] = new Array(CELLS_W * CELLS_H).fill(null);
  // What no blade grows on, by the cells it may reach.
  const near: { x: number; y: number; r: number }[][] = Array.from({ length: CELLS_W * CELLS_H }, () => []);
  const add = (x: number, y: number, r: number) => {
    for (let cy = Math.max(0, Math.floor(y - r)); cy <= Math.min(CELLS_H - 1, Math.floor(y + r)); cy++)
      for (let cx = Math.max(0, Math.floor(x - r)); cx <= Math.min(CELLS_W - 1, Math.floor(x + r)); cx++) near[cellIndex(cx, cy)].push({ x, y, r });
  };
  const crowns: { x: number; y: number; r: number; id: number }[][] = Array.from({ length: CELLS_W * CELLS_H }, () => []);
  for (const t of plan.trees) {
    const r = t.r * 0.85;
    for (let cy = Math.max(0, Math.floor(t.y - r)); cy <= Math.min(CELLS_H - 1, Math.floor(t.y + r)); cy++)
      for (let cx = Math.max(0, Math.floor(t.x - r)); cx <= Math.min(CELLS_W - 1, Math.floor(t.x + r)); cx++) crowns[cellIndex(cx, cy)].push({ x: t.x, y: t.y, r, id: t.id });
  }
  for (const r of plan.rocks) add(r.x, r.y, r.size * 0.7);
  for (const p of plan.pads) add(p.x, p.y, p.r);
  for (const b of plan.boulders) for (const c of b.cells) add((c % CELLS_W) + 0.5, Math.floor(c / CELLS_W) + 0.5, 0.9);
  const lakes = plan.lakes.map((l) => lakeDepth(l));
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      const k = cellIndex(cx, cy);
      if (!plan.open[k]) continue;
      const list = planCell(cx, cy, (x, y) => {
        if (near[k].some((d) => (x - d.x) ** 2 + (y - d.y) ** 2 < d.r * d.r)) return -2;
        const X = Math.floor(x * ART), Y = Math.floor(y * ART);
        if (lakes.some(({ depth, box }) => X >= box.x0 && Y >= box.y0 && X < box.x1 && Y < box.y1 && depth(X, Y) > -2.5)) return -2;
        // Under the last drawn (the front) crown over it.
        let under = -1;
        for (const c of crowns[k]) if ((x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r) under = Math.max(under, c.id);
        return under;
      });
      if (list.length) out[k] = list;
    }
  return out;
}

export type ForestGrassFrame = GrassFrame & { alpha: number; damage: ForestDamage | null };

/** Every blade's root (art pixels) and the sines and cosines of the parts of
 * `paintBlade`'s sway and gust angles that don't change with time, so
 * sin(a + t) = sin a cos t + cos a sin t takes only products a frame. */
type Swaying = { gx: Int16Array; gy: Int16Array; s1: Float32Array; c1: Float32Array; s2: Float32Array; c2: Float32Array; s3: Float32Array; c3: Float32Array; s4: Float32Array; c4: Float32Array };

function swaying(plans: readonly (Blade[] | null)[]): Swaying {
  const n = plans.reduce((k, b) => k + (b?.length ?? 0), 0);
  const o: Swaying = { gx: new Int16Array(n), gy: new Int16Array(n), s1: new Float32Array(n), c1: new Float32Array(n), s2: new Float32Array(n), c2: new Float32Array(n), s3: new Float32Array(n), c3: new Float32Array(n), s4: new Float32Array(n), c4: new Float32Array(n) };
  let k = 0;
  plans.forEach((list, i) => {
    const cx = i % CELLS_W, cy = (i - cx) / CELLS_W;
    for (const b of list ?? []) {
      const gx = cx * ART + b.i, gy = cy * ART + b.j, a1 = b.phase + gx * 0.06, a2 = b.phase * 2, a3 = gx * 0.021 + gy * 0.009;
      o.gx[k] = gx, o.gy[k] = gy;
      o.s1[k] = Math.sin(a1), o.c1[k] = Math.cos(a1), o.s2[k] = Math.sin(a2), o.c2[k] = Math.cos(a2), o.s3[k] = Math.sin(a3), o.c3[k] = Math.cos(a3), o.s4[k] = Math.sin(b.phase), o.c4[k] = Math.cos(b.phase);
      k++;
    }
  });
  return o;
}

/** Draws the forest's grass, kept by the renderer. */
export class ForestGrass {
  private plan: ForestPlan | null = null;
  private plans: (ForestBlade[] | null)[] = [];
  private sway: Swaying | null = null;
  /** Up to `CROWD` walkers (indices) by each cell their blades bend in,
   * refilled each paint. */
  private slots = new Int32Array(CELLS_W * CELLS_H * CROWD);
  private filled = new Uint8Array(CELLS_W * CELLS_H);
  private stir = new Map<number, number>();
  private buffer: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; px: Uint32Array } | null = null;
  private builtAt = -Infinity;

  /** Plans the blades for `plan` (once a forest). */
  sync(plan: ForestPlan) {
    if (plan === this.plan) return;
    this.plan = plan;
    this.plans = forestBlades(plan);
    this.sway = swaying(this.plans);
    this.stir.clear();
    this.builtAt = -Infinity;
  }

  /** How many blades the forest holds (tests, tuning). */
  get bladeCount() {
    return this.plans.reduce((n, b) => n + (b?.length ?? 0), 0);
  }

  draw(f: ForestGrassFrame) {
    if (!this.plan || f.alpha <= 0 || typeof document === "undefined") return;
    this.settle(f);
    if (!this.buffer) {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(W, H);
      this.buffer = { canvas, ctx, img, px: new Uint32Array(img.data.buffer) };
    }
    const buf = this.buffer;
    if (f.reduceMotion ? f.now - this.builtAt >= 500 : f.now - this.builtAt >= 1000 / 30) {
      this.builtAt = f.now;
      this.paint(buf.px, f);
      buf.ctx.putImageData(buf.img, 0, 0);
    }
    const c = f.c;
    c.save();
    c.globalAlpha *= f.alpha;
    c.imageSmoothingEnabled = false;
    c.drawImage(buf.canvas, 0, 0, CELLS_W * f.px, CELLS_H * f.px);
    c.restore();
  }

  /** Walking through grass stirs it; it settles over a second or two. */
  private settle(f: GrassFrame) {
    for (const [k, e] of this.stir) {
      const next = e * Math.exp(-f.dt * 1.8);
      if (next < 0.01) this.stir.delete(k);
      else this.stir.set(k, next);
    }
    if (f.reduceMotion) return;
    for (const w of f.walkers) {
      const cx = Math.floor(w.x), cy = Math.floor(w.y);
      if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H) continue;
      const i = cellIndex(cx, cy);
      if (this.plans[i]) this.stir.set(i, Math.min(1, (this.stir.get(i) ?? 0) + f.dt * 4));
    }
  }

  /** Each walker in its own cell's and the eight round's lists, `CROWD` a
   * cell at most. */
  private bucket(walkers: readonly Walker[]) {
    const filled = this.filled, slots = this.slots;
    filled.fill(0);
    for (let n = 0; n < walkers.length; n++) {
      const wx = Math.floor(walkers[n].x), wy = Math.floor(walkers[n].y);
      for (let y = Math.max(0, wy - 1); y <= Math.min(CELLS_H - 1, wy + 1); y++)
        for (let x = Math.max(0, wx - 1); x <= Math.min(CELLS_W - 1, wx + 1); x++) {
          const i = cellIndex(x, y);
          if (filled[i] < CROWD) slots[i * CROWD + filled[i]++] = n;
        }
    }
    return filled;
  }

  private paint(px: Uint32Array, f: ForestGrassFrame) {
    px.fill(0);
    const put = (color: number, x: number, y: number, h: number) => {
      if (x < 0 || x >= W) return;
      for (let yy = Math.max(0, y), end = Math.min(H, y + h); yy < end; yy++) px[yy * W + x] = PALETTE32[color];
    };
    const near = this.bucket(f.walkers), slots = this.slots, all = f.walkers;
    const group: Walker[] = [];
    const t = f.now / 1000, wind = WIND[f.wind], sw = this.sway!, trees = this.plan!.trees;
    const S1 = Math.sin(t * 2.1), C1 = Math.cos(t * 2.1), S2 = Math.sin(t * 3.7), C2 = Math.cos(t * 3.7), S3 = Math.sin(-t * 1.6), C3 = Math.cos(-t * 1.6), S4 = Math.sin(t * 12), C4 = Math.cos(t * 12);
    let k = 0;
    for (let i = 0; i < this.plans.length; i++) {
      const list = this.plans[i];
      if (!list) continue;
      const stir = this.stir.get(i) ?? 0, crowd = near[i];
      group.length = crowd;
      for (let q = 0; q < crowd; q++) group[q] = all[slots[i * CROWD + q]];
      const walkers = crowd ? group : undefined;
      for (const b of list) {
        const gx = sw.gx[k], gy = sw.gy[k], j = k++;
        if ((b.under >= 0 && (!f.damage || f.damage.upright(trees[b.under]))) || !turfAt(gx, gy)) continue;
        const shade = shadedAt(gx, gy) ? SHADOW : 0;
        // Held still: the parks' own way.
        if (f.reduceMotion) {
          paintBlade(put, b, gx, gy, t, wind, stir, walkers, true, shade);
          continue;
        }
        // As `paintBlade`: steady lean, a slow sway, gusts sweeping across
        // in bands, the wobble after someone passes...
        const sway = (sw.s1[j] * C1 + sw.c1[j] * S1) * 0.5 + (sw.s2[j] * C2 + sw.c2[j] * S2) * 0.2;
        const band = sw.s3[j] * C3 + sw.c3[j] * S3, gust = band > 0 ? band * band * band * 1.6 : 0;
        let lean = b.splay + wind * (0.35 + sway * 0.45 + gust) + (stir ? stir * (sw.s4[j] * C4 + sw.c4[j] * S4) * 1.6 : 0);
        // ...and parted and pressed down round whoever walks through.
        let press = 0;
        if (walkers)
          for (const w of walkers) {
            const dx = gx - w.x * ART, dy = gy - w.y * ART, reach = w.size * ART + 3;
            const p = 1 - Math.sqrt(dx * dx + dy * dy * 2.25) / reach;
            if (p <= 0) continue;
            if (p > press) press = p;
            lean += p * 3 * (dx >= 0 ? 1 : -1);
          }
        const curve = CURVE[b.h], h = press ? Math.max(1, Math.round(b.h * (1 - press * 0.5))) : b.h;
        // Runs of pixels sharing a column, dark at the root, light at the tip.
        let lastX = gx, start = 0;
        for (let q = 1; q <= h; q++) {
          const bx = q === h ? -1 : gx + Math.round(lean * curve[q]);
          if (q !== h && bx === lastX) continue;
          if (lastX >= 0 && lastX < W) {
            const colour = PALETTE32[shade + (start === 0 ? b.color % 2 : q >= h - 1 ? b.color + 2 : b.color + 1)];
            for (let y = Math.max(0, gy - q + 1), end = Math.min(H, gy - start + 1); y < end; y++) px[y * W + lastX] = colour;
          }
          start = q;
          lastX = bx;
        }
      }
    }
  }
}
