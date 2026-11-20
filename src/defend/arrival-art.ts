/** Draws an edit's arrival (`arrival.ts`) on the board: what the edit
 * replaced dissolving away in an ordered dither, the bare earth of a new
 * park that its grass and water grow out over from the middle, and each
 * new building falling out of the sky and landing in a puff of dust. The
 * renderer leaves the falling buildings out of the city layer until the
 * last has landed (`omit`), and hands the trees, ducks and fences their
 * falls (`tree`, `duck`, `fences`). */
import { CELLS_W, hash, hash01 } from "./grid.ts";
import { CellType, type Building, type CityMap } from "./citygen.ts";
import { ART } from "./art-scale.ts";
import { changeBoxes } from "./map-change.ts";
import { paintStanding } from "./city-layer.ts";
import { parkArt } from "./park-art.ts";
import { drawSprite } from "./damage-art.ts";
import { drawParkFences, parkFences, type FenceFall } from "./fences.ts";
import type { AreaId } from "./areas.ts";
import type { CellBox } from "./lighting.ts";
import { ARRIVAL, dropAt, duckFall, grassReach, postFall, railFall, treeFall, type ArrivalPlan, type Drop, type Fall, type NewPark } from "./arrival.ts";

type Looks = Readonly<Record<number, string>> | undefined;
/** Cells round a building its sprite may reach past its lot (outline, padding, a wall's face). */
const MARGIN = 2;
/** Steps the dissolve takes, and its 4 × 4 ordered-dither thresholds. */
const STEPS = 8;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Bare earth, and the first green at the edge of the growing grass. */
const EARTH = ["#5b4631", "#4f3d2b", "#66503a"], SPROUT = "#7d9b3e";
const DUST = "214,198,164";

const rgba = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16);
};
const EARTH32 = EARTH.map(rgba), SPROUT32 = rgba(SPROUT);

/** One box of what the edit replaced, painted as it stood, and how far it
 * has dissolved. */
type Vanish = { box: CellBox; canvas: HTMLCanvasElement; step: number };
type Faller = Building & { arrive: { delay: number; dur: number; height: number }; sprite?: HTMLCanvasElement | null };
type Cover = { park: NewPark; x0: number; y0: number; w: number; h: number; canvas: HTMLCanvasElement | null; reach: number };

export class ArrivalArt {
  /** Buildings still left out of the city layer, by id. */
  readonly omit: Set<number>;
  private readonly vanish: Vanish[] = [];
  private readonly fallers: Faller[];
  private readonly covers: Cover[];
  /** The layer's pixels a cell when this began (sprites are painted at it). */
  private readonly P: number;

  constructor(
    readonly plan: ArrivalPlan,
    readonly start: number,
    private readonly to: CityMap,
    private readonly area: AreaId,
    private readonly looks: Looks,
    from: CityMap, looksFrom: Looks, oldLayer: HTMLCanvasElement, P: number,
  ) {
    this.P = P;
    const byId = new Map(to.buildings.map((b) => [b.id, b]));
    this.fallers = plan.arriving.flatMap((a) => {
      const b = byId.get(a.id);
      return b ? [{ ...b, arrive: a }] : [];
    });
    this.omit = new Set(this.fallers.map((b) => b.id));
    this.covers = plan.parks.map((park) => {
      let x0 = CELLS_W, y0 = Infinity, x1 = 0, y1 = 0;
      for (const c of park.cells) {
        const x = c % CELLS_W, y = Math.floor(c / CELLS_W);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
      }
      return { park, x0, y0, w: x1 - x0, h: y1 - y0, canvas: null, reach: -1 };
    });
    this.paintVanish(from, looksFrom, oldLayer);
  }

  /** Seconds since the edit landed. */
  t(now: number) {
    return (now - this.start) / 1000;
  }

  /** Whether every building has landed, and whether everything is done. */
  landed(now: number) {
    return this.t(now) >= this.plan.landed;
  }
  done(now: number) {
    return this.t(now) >= this.plan.end;
  }

  tree(now: number) {
    const t = this.t(now);
    return (cx: number, cy: number) => treeFall(this.plan, t, cx, cy);
  }
  duck(now: number) {
    const t = this.t(now);
    return (x: number, y: number, i: number) => duckFall(this.plan, t, x, y, i);
  }
  fences(now: number): FenceFall | undefined {
    if (!this.plan.parks.length) return undefined;
    const t = this.t(now);
    return { post: (x, y) => postFall(this.plan, t, x, y), rail: (x1, y1, x2, y2) => railFall(this.plan, t, x1, y1, x2, y2) };
  }

  /** What the edit replaced, painted as it stood into boxes round the
   * changed cells: the old park ground (copied from the old city layer),
   * the buildings that go, the old parks' trees and fences. */
  private paintVanish(from: CityMap, looks: Looks, oldLayer: HTMLCanvasElement) {
    if (typeof document === "undefined") return;
    const { changed, vanishing } = this.plan, P = this.P;
    const going = new Set(vanishing);
    const gone = from.buildings.filter((b) => going.has(b.id));
    const trees = parkArt(from).trees.filter((t) => changed[Math.floor(t.cy) * CELLS_W + Math.floor(t.cx)]);
    const fences = parkFences(from).filter((s) => changed[Math.floor((s.y1 + s.y2) / 2) * CELLS_W + Math.floor((s.x1 + s.x2) / 2)]);
    for (const box of changeBoxes(changed, MARGIN)) {
      const w = box.x1 - box.x0, h = box.y1 - box.y0;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(w * P);
      canvas.height = Math.ceil(h * P);
      const c = canvas.getContext("2d")!;
      c.imageSmoothingEnabled = false;
      c.translate(-box.x0 * P, -box.y0 * P);
      let any = false;
      for (let y = box.y0; y < box.y1; y++)
        for (let x = box.x0; x < box.x1; x++) {
          const i = y * CELLS_W + x;
          if (!changed[i] || (from.type[i] !== CellType.PARK && from.type[i] !== CellType.WATER)) continue;
          c.drawImage(oldLayer, x * P, y * P, P, P, x * P, y * P, P, P);
          any = true;
        }
      for (const b of gone) {
        const r = b.rect;
        if (r.x + r.w <= box.x0 || r.x >= box.x1 || r.y + r.h <= box.y0 || r.y >= box.y1) continue;
        paintStanding(c, P, from, b, this.area, looks);
        any = true;
      }
      const fenced = fences.filter((s) => s.x1 >= box.x0 && s.x1 <= box.x1 && s.y1 >= box.y0 && s.y1 <= box.y1);
      if (fenced.length) drawParkFences(c, P, fenced), (any = true);
      const k = P / ART;
      for (const t of trees) {
        if (t.cx < box.x0 || t.cx >= box.x1 || t.cy < box.y0 || t.cy >= box.y1) continue;
        drawSprite(c, t.canvas, t.x * k, t.y * k, t.w * k, t.h * k);
        any = true;
      }
      if (any) this.vanish.push({ box, canvas, step: 0 });
    }
  }

  /** The replaced pieces, dissolving: more of their art pixels gone at
   * each step, in a 4 × 4 ordered dither, until none is left. */
  drawVanish(c: CanvasRenderingContext2D, px: number, now: number) {
    if (!this.vanish.length) return;
    const u = this.t(now) / ARRIVAL.vanish;
    if (u >= 1) {
      this.vanish.length = 0;
      return;
    }
    const step = Math.floor(u * STEPS);
    c.save();
    c.imageSmoothingEnabled = false;
    for (const v of this.vanish) {
      if (v.step < step) dissolve(v, step, this.P), (v.step = step);
      const { box } = v;
      c.drawImage(v.canvas, box.x0 * px, box.y0 * px, (v.canvas.width / this.P) * px, (v.canvas.height / this.P) * px);
    }
    c.restore();
  }

  /** Bare earth over each new park where its grass hasn't yet grown, with a
   * fringe of first green round the growing edge; under it, the park's
   * grass, ponds and their life are already drawn. */
  drawCover(c: CanvasRenderingContext2D, px: number, now: number) {
    const t = this.t(now);
    c.save();
    c.imageSmoothingEnabled = false;
    for (const cover of this.covers) {
      const reach = grassReach(cover.park, t);
      if (reach === Infinity) continue;
      if (reach !== cover.reach) paintCover(cover, reach), (cover.reach = reach);
      if (cover.canvas) c.drawImage(cover.canvas, cover.x0 * px, cover.y0 * px, cover.w * px, cover.h * px);
    }
    c.restore();
  }

  /** The buildings in the air, and the dust of those just landed. Those
   * landed while others still fall are drawn here too (`resting`), until
   * the city layer takes them back. */
  drawFalling(c: CanvasRenderingContext2D, px: number, now: number, resting: boolean) {
    const t = this.t(now);
    c.save();
    c.imageSmoothingEnabled = false;
    for (const b of [...this.fallers].sort((a, z) => a.rect.y + a.rect.h - z.rect.y - z.rect.h)) {
      const a = b.arrive, since = t - a.delay;
      const f = dropAt(since, a.dur, a.height);
      if (f === false) continue;
      if (f || resting) this.drawFaller(c, px, b, f);
      const after = since - a.dur;
      if (after >= 0 && after < ARRIVAL.dust) drawDust(c, px, b, after / ARRIVAL.dust);
    }
    c.restore();
  }

  private drawFaller(c: CanvasRenderingContext2D, px: number, b: Faller, f: Drop | null) {
    if (b.sprite === undefined) b.sprite = this.paintSprite(b);
    if (!b.sprite) return;
    const r = b.rect, mx = (r.x + r.w / 2) * px, my = (r.y + r.h / 2) * px;
    c.save();
    if (f) {
      c.globalAlpha = f.alpha;
      c.translate(mx, my + f.dy * px);
      c.scale(f.scale, f.scale);
      c.translate(-mx, -my);
    }
    c.drawImage(b.sprite, (r.x - MARGIN) * px, (r.y - MARGIN) * px, (r.w + 2 * MARGIN) * px, (r.h + 2 * MARGIN) * px);
    c.restore();
  }

  /** Building `b` standing whole, at the layer's resolution, `MARGIN` cells
   * of room round its lot. */
  private paintSprite(b: Building): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    const P = this.P, r = b.rect;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((r.w + 2 * MARGIN) * P);
    canvas.height = Math.ceil((r.h + 2 * MARGIN) * P);
    const c = canvas.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    c.translate(-(r.x - MARGIN) * P, -(r.y - MARGIN) * P);
    paintStanding(c, P, this.to, b, this.area, this.looks);
    return canvas;
  }
}

/** Clears the art pixels of `v` whose dither threshold `step` has passed. */
function dissolve(v: Vanish, step: number, P: number) {
  const { box } = v, w = (box.x1 - box.x0) * ART, h = (box.y1 - box.y0) * ART;
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const m = mask.getContext("2d")!, img = m.createImageData(w, h), px = new Uint32Array(img.data.buffer);
  const cut = (step / STEPS) * 16;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // Each cell's dither is shifted a little, so the pattern doesn't read as a grid.
      const gx = box.x0 * ART + x, gy = box.y0 * ART + y, o = hash(gx >> 3, gy >> 3, 406) & 15;
      if (BAYER[((gy + (o >> 2)) & 3) * 4 + ((gx + o) & 3)] < cut) px[y * w + x] = 0xff000000;
    }
  m.putImageData(img, 0, 0);
  const c = v.canvas.getContext("2d")!;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.imageSmoothingEnabled = false;
  c.globalCompositeOperation = "destination-out";
  c.drawImage(mask, 0, 0, w, h, 0, 0, (w / ART) * P, (h / ART) * P);
  c.restore();
}

/** Paints `cover`: bare earth on the park's art pixels farther than
 * `reach` cells from its middle (the edge ragged), first green just inside it. */
function paintCover(cover: Cover, reach: number) {
  if (typeof document === "undefined") return;
  const { park, x0, y0 } = cover, W = cover.w * ART, H = cover.h * ART;
  if (!cover.canvas) {
    cover.canvas = document.createElement("canvas");
    cover.canvas.width = W;
    cover.canvas.height = H;
  }
  const c = cover.canvas.getContext("2d")!, img = c.createImageData(W, H), px = new Uint32Array(img.data.buffer);
  for (const cell of park.cells) {
    const cx = cell % CELLS_W, cy = Math.floor(cell / CELLS_W);
    for (let j = 0; j < ART; j++)
      for (let i = 0; i < ART; i++) {
        const gx = cx * ART + i, gy = cy * ART + j;
        const d = Math.hypot((gx + 0.5) / ART - park.cx, (gy + 0.5) / ART - park.cy) + hash01(gx, gy, 405) * 0.45;
        if (d <= reach) continue;
        px[(gy - y0 * ART) * W + gx - x0 * ART] = reach > 0 && d < reach + 0.2 ? SPROUT32 : EARTH32[hash(gx, gy, 407) % 3];
      }
  }
  c.putImageData(img, 0, 0);
}

/** Dust puffing out from round the foot of a building that has just landed,
 * `u` (0–1) through its life, on the art-pixel grid. */
function drawDust(c: CanvasRenderingContext2D, px: number, b: Building, u: number) {
  const r = b.rect, n = 6 + 2 * (r.w + r.h), a = px / ART;
  const spread = 1 - (1 - u) ** 3;
  for (let k = 0; k < n; k++) {
    // A spot round the lot's edge, and the way out from its middle.
    const s = (k + hash01(b.id, k, 408)) / n * 2 * (r.w + r.h);
    const [ex, ey] = s < r.w ? [r.x + s, r.y + r.h] : s < r.w + r.h ? [r.x + r.w, r.y + r.h - (s - r.w)] : s < 2 * r.w + r.h ? [r.x + r.w - (s - r.w - r.h), r.y] : [r.x, r.y + (s - 2 * r.w - r.h)];
    const mx = r.x + r.w / 2, my = r.y + r.h / 2, d = Math.hypot(ex - mx, ey - my) || 1;
    const out = (0.2 + 0.5 * hash01(b.id, k, 409)) * spread;
    const x = ex + ((ex - mx) / d) * out, y = ey + ((ey - my) / d) * out - 0.15 * spread;
    const size = (1 + (hash(b.id, k, 410) % 2)) * a;
    c.fillStyle = `rgba(${DUST},${(0.7 * (1 - u)).toFixed(3)})`;
    c.fillRect(Math.round(x * px / a) * a, Math.round(y * px / a) * a, size, size);
  }
}

export type { Fall };
