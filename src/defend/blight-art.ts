/** Procedural dead grass and bare, branching crowns on the native art grid. */
import { ART } from "./art-scale.ts";
import { CELLS_W, CELLS_H, hash } from "./grid.ts";
import { rgba } from "./damage-art.ts";
import { BLIGHT_TRAIL, BLIGHT_W, type BlightTrail, type WitherStage } from "./blight-trail.ts";
import type { Sprite } from "./forest-art.ts";

const DEAD = [0x342c25, 0x514335, 0x716047, 0x96815a];
const DEAD32 = DEAD.map(c => rgba(c));
const SHADE32 = DEAD.map(c => rgba(((Math.round((c >> 16) * .6) << 16) | (Math.round(((c >> 8) & 255) * .6) << 8) | Math.round((c & 255) * .6))));

/** Keep the source's light and dark detail, replacing greens and flowers
 * with dry earth/ochre. Works on outline-free sources and grass palettes. */
export function witherColor(p: number) {
  if (!p) return 0;
  const light = ((p & 255) * .3 + ((p >>> 8) & 255) * .6 + ((p >>> 16) & 255) * .1) / 255;
  return rgba((Math.round(35 + light * 140) << 16) | (Math.round(29 + light * 115) << 8) | Math.round(23 + light * 76), p >>> 24);
}

const crowns = new WeakMap<Sprite, Map<number, Sprite>>();
/** Stages: ochre foliage, thinning foliage, then a standing leafless tree.
 * Cached per native source and stage, with the same box and anchor. */
export function witheredTreeSprite(source: Sprite, stage: WitherStage, radius: number, seed: number): Sprite {
  if (!stage) return source;
  let variants = crowns.get(source);
  if (!variants) crowns.set(source, variants = new Map());
  const cached = variants.get(stage);
  if (cached) return cached;
  const { w, h, ox, oy } = source, px = new Uint32Array(w * h);
  if (stage < 3) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    // Broad ragged gaps, rather than transparent pixel noise.
    if (stage === 1 || hash(Math.floor(x / 3), Math.floor(y / 3), seed, 701) % 5 < 2) px[i] = witherColor(source.px[i]);
  }
  if (stage >= 2) {
    const put = (x: number, y: number, width: number, c: number) => {
      for (let yy = y; yy < y + width; yy++) for (let xx = x; xx < x + width; xx++)
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) px[yy * w + xx] = DEAD32[c];
    };
    const line = (x: number, y: number, X: number, Y: number, width: number) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(X - x, Y - y) * 2));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, xx = Math.round(x + (X - x) * t), yy = Math.round(y + (Y - y) * t);
        put(xx, yy, width, 1); if (width > 1) put(xx, yy, 1, 3);
      }
    };
    const R = radius * ART, arms = R < 6 ? 3 : 5 + seed % 3;
    for (let k = 0; k < arms; k++) {
      const a = k / arms * Math.PI * 2 + (hash(seed, k, 702) % 70) / 100;
      const length = R * (.65 + (hash(seed, k, 703) % 28) / 100);
      const x = ox + Math.cos(a) * length, y = oy + Math.sin(a) * length;
      const bendX = ox + Math.cos(a + .18) * length * .48, bendY = oy + Math.sin(a + .18) * length * .48;
      line(ox, oy, bendX, bendY, R > 10 ? 2 : 1);
      line(bendX, bendY, x, y, 1);
      for (const side of R < 6 ? [] : [-1, 1]) line(bendX, bendY, bendX + Math.cos(a + side * .65) * length * .45, bendY + Math.sin(a + side * .65) * length * .45, 1);
    }
    const trunk = R < 6 ? 1 : 3;
    put(ox - Math.floor(trunk / 2), oy - Math.floor(trunk / 2), trunk, 1); put(ox, oy, 1, 2);
  }
  const sprite = { px, w, h, ox, oy };
  variants.set(stage, sprite);
  return sprite;
}

/** One reusable, native-resolution layer per grass surface; only occupied
 * trail samples are rasterized. Water, stone and buildings never qualify. */
export class BlightGround {
  private trail: BlightTrail | null = null;
  private version = -1;
  private terrain = -1;
  private time = -Infinity;
  private surface: { canvas: HTMLCanvasElement; img: ImageData; pixels: Uint32Array } | null = null;

  draw(c: CanvasRenderingContext2D, px: number, trail: BlightTrail | null, time: number, eligible: (x: number, y: number) => boolean, shaded?: (x: number, y: number) => boolean, terrain = 0) {
    if (!trail?.touched.length) return;
    const fresh = this.trail !== trail;
    if (fresh || terrain !== this.terrain || trail.version !== this.version && time - this.time >= .1) {
      const W = CELLS_W * ART, H = CELLS_H * ART;
      if (!this.surface) {
        const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
        const img = c.createImageData(W, H);
        this.surface = { canvas, img, pixels: new Uint32Array(img.data.buffer) };
      }
      const { pixels, canvas, img } = this.surface;
      pixels.fill(0);
      for (const i of trail.touched) {
        const dose = trail.exposure[i];
        if (dose < BLIGHT_TRAIL.grass) continue;
        const ox = i % BLIGHT_W * (ART / 2), oy = Math.floor(i / BLIGHT_W) * (ART / 2);
        for (let y = oy; y < oy + ART / 2; y++) for (let x = ox; x < ox + ART / 2; x++) {
          if (!eligible(x, y)) continue;
          const noise = hash(x, y, 704);
          if (dose < .8 && noise % 8 > dose * 10) continue;
          const pal = shaded?.(x, y) ? SHADE32 : DEAD32;
          pixels[y * W + x] = pal[noise % 13 === 0 ? 3 : noise % 5 === 0 ? 0 : 1 + (hash(x >> 2, y >> 2, 705) & 1)];
        }
      }
      canvas.getContext("2d")!.putImageData(img, 0, 0);
      this.trail = trail; this.version = trail.version; this.time = time; this.terrain = terrain;
    }
    if (!this.surface) return;
    c.save(); c.imageSmoothingEnabled = false;
    c.drawImage(this.surface.canvas, 0, 0, CELLS_W * px, CELLS_H * px);
    c.restore();
  }
}
