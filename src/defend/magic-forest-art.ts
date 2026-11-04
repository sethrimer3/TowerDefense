/** Draws the Magic Forest (`magic-forest.ts`) at `ART` pixels a cell:
 * the clover carpet with the trees' soft shadows (`drawFloor`, under the
 * units and the battle's darkness), the large wispy trees, swaying and fading
 * over anyone beneath them (`drawTrees`), and the lightning bugs drifting
 * round them, glowing brighter by night (`drawFireflies`). Presentation
 * only; still under Reduce Motion. */
import { ART } from "./art-scale.ts";
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import { fireflyAt, magicForestPlan, MAGIC_FOREST, type MagicForestPlan, type WispyTree } from "./magic-forest.ts";
import { artPen } from "./pixel-fx.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;
/** The trees' sway: frames baked and seconds a sway takes. */
const FRAMES = 8, SWAY = 7;
/** A tree's opacity, alone and over someone beneath it. */
const TREE_ALPHA = 0.95, UNDER_ALPHA = 0.45;

const rgba = (hex: number, a = 255) => ((a << 24) | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >> 16) & 0xff)) >>> 0;
const TURF = [0x1c361b, 0x203c1d, 0x244220, 0x1f391c];
/** Three clover greens, each dark, mid and lit. */
const CLOVERS = [
  [0x24502a, 0x356c34, 0x4c8a42],
  [0x234c30, 0x32683e, 0x48844e],
  [0x2a5426, 0x3d7232, 0x58923e],
];
/** A trefoil, about its middle: three lobes, the creases between dark. */
const TREFOIL: readonly (readonly [number, number, number])[] = [
  [-1, -2, 2], [0, -2, 1],
  [-1, -1, 1], [0, -1, 0],
  [-2, 0, 2], [-1, 0, 0], [0, 0, 0], [1, 0, 1],
  [-2, 1, 1], [-1, 1, 1], [0, 1, 2], [1, 1, 0],
];
/** A white clover blossom: petals round a pink heart. */
const BLOSSOM: readonly (readonly [number, number, number])[] = [
  [0, -1, 0xd8d4c8], [-1, 0, 0xd8d4c8], [0, 0, 0xd8a0b6], [1, 0, 0xd8d4c8], [0, 1, 0xb4b0a2],
];

/** The clover carpet over every open cell, with the trees' shadows, as RGBA. */
export function cloverPixels(plan: MagicForestPlan): Uint32Array {
  const out = new Uint32Array(W * H);
  const openAt = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && plan.open[Math.floor(y / ART) * CELLS_W + Math.floor(x / ART)] === 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (openAt(x, y)) out[y * W + x] = rgba(TURF[hash(x, y, 720) % 7 < 4 ? 2 : hash(x, y, 721) % TURF.length]);
  const put = (x: number, y: number, c: number) => {
    if (openAt(x, y)) out[y * W + x] = rgba(c);
  };
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      if (!plan.open[cy * CELLS_W + cx]) continue;
      for (let k = 0; k < MAGIC_FOREST.clovers; k++) {
        const x = cx * ART + (hash(cx, cy, k, 722) % ART), y = cy * ART + (hash(cx, cy, k, 723) % ART);
        const tones = CLOVERS[hash(cx, cy, k, 724) % CLOVERS.length], flip = hash(cx, cy, k, 725) & 1 ? -1 : 1;
        for (const [dx, dy, t] of TREFOIL) put(x + dx * flip, y + dy, tones[t]);
      }
      if (hash01(cx, cy, 726) < MAGIC_FOREST.blossoms) {
        const x = cx * ART + 2 + (hash(cx, cy, 727) % (ART - 4)), y = cy * ART + 2 + (hash(cx, cy, 728) % (ART - 4));
        for (const [dx, dy, c] of BLOSSOM) put(x + dx, y + dy, c);
      }
    }
  // The trees' shadows, cast from the upper left, dithered at their edge.
  for (const t of plan.trees) {
    const sx = (t.x + t.r * 0.2) * ART, sy = (t.y + t.r * 0.25) * ART, R = t.r * 0.75 * ART;
    for (let y = Math.max(0, Math.floor(sy - R)); y < Math.min(H, Math.ceil(sy + R)); y++)
      for (let x = Math.max(0, Math.floor(sx - R)); x < Math.min(W, Math.ceil(sx + R)); x++) {
        const d = Math.sqrt((x + 0.5 - sx) ** 2 + (y + 0.5 - sy) ** 2) / R;
        if (d >= 1 || !openAt(x, y) || (d > 0.75 && ((x + y) & 1))) continue;
        const v = out[y * W + x], k = 0.74;
        out[y * W + x] = (v & 0xff000000) | (Math.round(((v >> 16) & 0xff) * k) << 16) | (Math.round(((v >> 8) & 0xff) * k) << 8) | Math.round((v & 0xff) * k);
      }
  }
  return out;
}

/** Strand colours from the heart out: pale mint to silver to lilac. */
const STRANDS = [0xd8fff0, 0xb4ecd8, 0x9ad6d0, 0xa6bfe8, 0xc0a8ec];

/** A wispy tree seen from above, swayed to `frame`: a faint misty bed under
 * dozens of fine curling strands spiralling out of a pale knot, tipped with
 * glowing seeds. RGBA, `size` pixels square. */
export function wispyTreePixels(t: WispyTree, frame: number) {
  const R = t.r * ART, size = Math.ceil(2 * R + 4), mid = size / 2;
  const out = new Uint32Array(size * size);
  const blend = (x: number, y: number, c: number, a: number) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = y * size + x, old = out[i] >>> 24;
    if (a > old) out[i] = rgba(c, Math.min(255, Math.round(a)));
  };
  // A thin mist under the strands, in steps, dithered.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x + 0.5 - mid) ** 2 + (y + 0.5 - mid) ** 2) / (R * 0.95);
      if (d >= 1) continue;
      const a = d < 0.4 ? 60 : d < 0.7 ? 42 : (x + y) & 1 ? 0 : 28;
      if (a) blend(x, y, d < 0.5 ? 0x9ad8c8 : 0x9cb8d8, a);
    }
  const swing = Math.sin(((frame / FRAMES) + t.phase) * Math.PI * 2);
  const turn = hash(t.seed, 730) & 1 ? 1 : -1;
  /** One curling strand from (x, y) heading `a0`, `L` pixels long, bending
   * `bend` radians by its tip, fading from `alpha`, thick for its first `thick`. */
  const strand = (x: number, y: number, a0: number, L: number, bend: number, alpha: number, thick: number, from: number, seed: boolean) => {
    for (let s = 0; s < L; s += 0.5) {
      const f = s / L, a = a0 + bend * f * f;
      x += Math.cos(a) * 0.5;
      y += Math.sin(a) * 0.5;
      const k = Math.min(1, from + f * (1 - from));
      const c = STRANDS[Math.min(STRANDS.length - 1, Math.floor(k * STRANDS.length))];
      const o = alpha * (1 - 0.8 * f);
      blend(x, y, c, o);
      if (f < thick) blend(x + 1, y, c, o * 0.7);
    }
    if (seed) blend(x, y, 0xf6f2a8, 255);
  };
  // Long strands spiralling out of the heart, swaying.
  const n = Math.round(30 + t.r * 6);
  for (let i = 0; i < n; i++) {
    const u = (salt: number) => hash01(t.seed, i, salt);
    const a0 = (i / n) * Math.PI * 2 + (u(732) - 0.5) * 0.5;
    const sway = 0.16 * Math.sin(((frame / FRAMES) + u(736)) * Math.PI * 2) + 0.06 * swing;
    const bend = turn * (1.1 + u(734) * 0.9) * (u(735) < 0.12 ? -1 : 1) + sway;
    const r0 = u(738) * 0.12 * R;
    strand(mid + Math.cos(a0) * r0, mid + Math.sin(a0) * r0, a0, R * (0.6 + u(733) * 0.4), bend, 210, 0.35, 0, u(737) < 0.3);
  }
  // Short wisps drifting across the canopy, mostly the way it turns.
  const m = Math.round(40 + t.r * 9);
  for (let i = 0; i < m; i++) {
    const u = (salt: number) => hash01(t.seed, i, salt);
    const at = u(740) * Math.PI * 2, d = (0.2 + u(741) * 0.7) * R;
    const sway = 0.2 * Math.sin(((frame / FRAMES) + u(744)) * Math.PI * 2);
    const a0 = at + turn * (Math.PI / 2 - 0.5 + u(742) * 0.7);
    strand(mid + Math.cos(at) * d, mid + Math.sin(at) * d, a0, R * (0.12 + u(743) * 0.22), turn * (0.6 + u(745)) + sway, 150, 0, d / R, u(746) < 0.12);
  }
  // The pale knot the strands spring from.
  for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) blend(mid + dx, mid + dy, dx + dy < -1 ? 0xeefff6 : 0xbfe8dc, 230);
  return { pixels: out, size };
}

function canvasOf(pixels: Uint32Array, w: number, h: number) {
  const cv = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = cv.getContext("2d")!, img = ctx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(pixels);
  ctx.putImageData(img, 0, 0);
  return cv;
}

export class MagicForestArt {
  private map: CityMap | null = null;
  plan: MagicForestPlan | null = null;
  private floor: HTMLCanvasElement | null = null;
  private sprites = new Map<string, { cv: HTMLCanvasElement; size: number }>();
  private crowns: HTMLCanvasElement | null = null;
  private fade: number[] = [];
  private lastNow = 0;
  private glow: HTMLCanvasElement | null = null;

  /** Plans `map`'s forest (and repaints its carpet) when the map changes. */
  sync(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.plan = magicForestPlan(map);
    this.floor = null;
    this.sprites.clear();
    this.fade = this.plan.trees.map(() => TREE_ALPHA);
  }

  /** The clover carpet and the trees' shadows over the open ground. */
  drawFloor(c: CanvasRenderingContext2D, px: number, alpha: number) {
    if (!this.plan || alpha <= 0 || typeof document === "undefined") return;
    this.floor ??= canvasOf(cloverPixels(this.plan), W, H);
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= alpha;
    c.drawImage(this.floor, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
  }

  private sprite(t: WispyTree, frame: number) {
    const key = `${t.id}:${frame}`;
    let s = this.sprites.get(key);
    if (!s) {
      const { pixels, size } = wispyTreePixels(t, frame);
      this.sprites.set(key, (s = { cv: canvasOf(pixels, size, size), size }));
    }
    return s;
  }

  /** The trees over everyone, swaying, fading over anyone beneath them, and
   * darkened by `shade` (drawn in board pixels at `px` a cell) like the forest's. */
  drawTrees(c: CanvasRenderingContext2D, px: number, o: { now: number; alpha: number; still: boolean; under: readonly { x: number; y: number }[]; shade?: (o: CanvasRenderingContext2D) => void }) {
    const plan = this.plan;
    if (!plan || o.alpha <= 0 || typeof document === "undefined") return;
    const dt = this.lastNow ? Math.min(0.25, Math.max(0, (o.now - this.lastNow) / 1000)) : 1;
    this.lastNow = o.now;
    this.crowns ??= Object.assign(document.createElement("canvas"), { width: W, height: H });
    const cc = this.crowns.getContext("2d")!;
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.clearRect(0, 0, W, H);
    cc.imageSmoothingEnabled = false;
    for (const t of plan.trees) {
      const beneath = o.under.some((u) => (u.x - t.x) ** 2 + (u.y - t.y) ** 2 < (t.r * 0.85) ** 2);
      const want = beneath ? UNDER_ALPHA : TREE_ALPHA;
      this.fade[t.id] += (want - this.fade[t.id]) * (o.still ? 1 : Math.min(1, dt * 4));
      const frame = o.still ? 0 : Math.floor(((o.now / 1000 / SWAY + t.phase) % 1) * FRAMES) % FRAMES;
      const s = this.sprite(t, frame);
      cc.globalAlpha = this.fade[t.id];
      cc.drawImage(s.cv, Math.round(t.x * ART - s.size / 2), Math.round(t.y * ART - s.size / 2));
    }
    cc.globalAlpha = 1;
    if (o.shade) {
      cc.save();
      cc.setTransform(ART / px, 0, 0, ART / px, 0, 0);
      cc.globalCompositeOperation = "source-atop";
      o.shade(cc);
      cc.restore();
    }
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= o.alpha;
    c.drawImage(this.crowns, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
  }

  /** The lightning bugs: a soft glow (brighter by `night`, 0..1) round a
   * single bright art pixel, each drifting round its tree and blinking. */
  drawFireflies(c: CanvasRenderingContext2D, px: number, o: { now: number; alpha: number; still: boolean; night: number }) {
    const plan = this.plan;
    if (!plan || o.alpha <= 0 || typeof document === "undefined") return;
    this.glow ??= glowSprite();
    const t = o.still ? 0 : o.now / 1000, base = c.globalAlpha * o.alpha;
    const shine = 0.75 + 0.25 * Math.max(0, Math.min(1, o.night));
    c.save();
    c.imageSmoothingEnabled = true;
    c.globalCompositeOperation = "lighter";
    const g = px * (1.8 + 1.2 * o.night);
    for (const f of plan.flies) {
      const p = fireflyAt(f, plan.trees[f.tree], t), glow = o.still ? 0.75 : p.glow;
      c.globalAlpha = Math.min(1, base * glow * shine);
      c.drawImage(this.glow, p.x * px - g / 2, p.y * px - g / 2, g, g);
    }
    c.globalCompositeOperation = "source-over";
    c.imageSmoothingEnabled = false;
    const dot = artPen(c, px);
    for (const f of plan.flies) {
      const p = fireflyAt(f, plan.trees[f.tree], t), glow = o.still ? 0.75 : p.glow;
      c.globalAlpha = base * (0.45 + 0.55 * glow);
      c.fillStyle = glow > 0.6 ? "#fbffb8" : "#d6f06a";
      dot(Math.floor(p.x * ART), Math.floor(p.y * ART));
    }
    c.restore();
  }
}

/** A firefly's soft yellow-green halo, 32 pixels across. */
function glowSprite() {
  const cv = Object.assign(document.createElement("canvas"), { width: 32, height: 32 });
  const ctx = cv.getContext("2d")!, g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(232,255,140,0.9)");
  g.addColorStop(0.35, "rgba(190,240,90,0.35)");
  g.addColorStop(1, "rgba(150,220,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return cv;
}
