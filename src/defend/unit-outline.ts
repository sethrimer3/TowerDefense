import { UnitContours, bodyPath } from "./unit-contours.ts";
/** Unit bodies share a screen layer, with independent ink channels. Legacy
 * mode keeps baked sprite rims beneath every body. Thin visibility mode uses
 * cached body paths and primitive geometry through UnitContours, removes old
 * colored rims and emits only the half-art-pixel outer union. Its buffers can
 * be drawn after the world wash without repainting or reading the scene. */
import { OUTLINE } from "./pixel-fx.ts";

type Ctx = CanvasRenderingContext2D;
export type UnitInks = { ink: (id: number) => string | undefined };
type Sprite = HTMLCanvasElement | HTMLImageElement;

/** Edge pixels this dark (every channel at most) are a sprite's outline. */
const DARK = 48;
/** Sprites drawn fainter than this (auras, fading ghosts) get no
 * silhouette: an outline would read heavier than they are. */
const SOLID = 0.7;

type Copies = { bare: HTMLCanvasElement; shape: HTMLCanvasElement; data?: Uint8ClampedArray; faded?: boolean; paths?: Map<string, Path2D> };
const copies = new WeakMap<object, Copies>();
const live = new WeakSet<object>();

/** Marks a sprite canvas that is repainted in place (the Hero's cape), so
 * its copies are made afresh each time it is drawn. */
export function liveSprite(cv: object) {
  live.add(cv);
}

const isSprite = (img: unknown): img is Sprite =>
  (typeof HTMLCanvasElement !== "undefined" && img instanceof HTMLCanvasElement) ||
  (typeof HTMLImageElement !== "undefined" && img instanceof HTMLImageElement);

/** `img`'s bare and silhouette copies, made once (each time, if live). */
function copiesOf(img: Sprite): Copies | null {
  let made = copies.get(img);
  if (made && !live.has(img)) return made;
  const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  if (!w || !h) return null;
  if (!made) copies.set(img, (made = { bare: document.createElement("canvas"), shape: document.createElement("canvas") }));
  const { bare, shape } = made;
  bare.width = shape.width = w;
  bare.height = shape.height = h;
  const c = bare.getContext("2d", { willReadFrequently: true })!;
  c.clearRect(0, 0, w, h);
  c.drawImage(img, 0, 0);
  const image = c.getImageData(0, 0, w, h);
  const solid = silhouette(image.data, w, h);
  stripOutline(image.data, w, h);
  made.data = image.data; made.paths?.clear();
  made.faded = false;
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] >= 128 && image.data[i] < 255) { made.faded = true; break; }
  c.putImageData(image, 0, 0);
  shape.getContext("2d")!.putImageData(new ImageData(solid, w, h), 0, 0);
  return made;
}

/** RGBA pixels of the solid (at least half opaque) pixels of `d`, `w` × `h`,
 * in the outline's colour. Pure, for the tests. */
export function silhouette(d: Uint8ClampedArray, w: number, h: number) {
  const out = new Uint8ClampedArray(w * h * 4), ink = Number.parseInt(OUTLINE.slice(1), 16);
  for (let i = 0; i < w * h * 4; i += 4) {
    if (d[i + 3] < 128) continue;
    out[i] = ink >> 16;
    out[i + 1] = (ink >> 8) & 255;
    out[i + 2] = ink & 255;
    out[i + 3] = 255;
  }
  return out;
}

/** Clears, in RGBA pixels `d` (`w` × `h`), each near-black opaque pixel
 * with a transparent pixel or the edge beside it. Pure, for the tests. */
export function stripOutline(d: Uint8ClampedArray, w: number, h: number) {
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] >= 128;
  const ring: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 128 || d[i] > DARK || d[i + 1] > DARK || d[i + 2] > DARK) continue;
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) ring.push(i);
    }
  for (const i of ring) d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
  return ring.length;
}

/** `drawImage` with however many of its arguments the call had (`n`). */
type Draw = (img: CanvasImageSource, a: number, b: number, w: number | undefined, h: number | undefined, dx: number | undefined, dy: number | undefined, dw: number | undefined, dh: number | undefined, n: number) => void;

/** `c`'s own `drawImage`, taken before it is swapped. */
function drawer(c: Ctx): Draw {
  const draw = c.drawImage.bind(c);
  return (img, a, b, w, h, dx, dy, dw, dh, n) => {
    if (n <= 3) draw(img, a, b);
    else if (n <= 5) draw(img, a, b, w!, h!);
    else draw(img, a, b, w!, h!, dx!, dy!, dw!, dh!);
  };
}

function canvas() {
  const cv = document.createElement("canvas");
  return { cv, c: cv.getContext("2d")! };
}

export class UnitOutline {
  private readonly contours = new UnitContours();
  private thin = false;
  private neutralMerged = true;
  private minimumAlpha = SOLID;
  private readonly discard = canvas();
  private layer = canvas();
  private outline = canvas();
  private colors = new Map<string, ReturnType<typeof canvas>>();
  private current = this.outline;
  private under = new Map<Ctx, Draw>([[this.outline.c, drawer(this.outline.c)]]);
  private currentInk: string | undefined;
  private merged = true;
  private solo: { target: Ctx; units: Ctx; rims: Ctx } | undefined;
  private tint = canvas();

  constructor() {
    this.discard.cv.width = this.discard.cv.height = 1;
    const c = this.layer.c, patch = c as unknown as Record<string, unknown>;
    // The outline layer follows every change of the units' transform, so
    // silhouettes land where their sprites do.
    for (const name of ["save", "restore", "setTransform", "resetTransform", "transform", "translate", "scale", "rotate"] as const) {
      const own = (c[name] as (...a: unknown[]) => void).bind(c);
      patch[name] = (...a: unknown[]) => {
        own(...a);
        if (this.thin) this.contours.transform(c);
        (this.outline.c[name] as (...v: unknown[]) => void).apply(this.outline.c, a);
        for (const layer of this.colors.values()) (layer.c[name] as (...v: unknown[]) => void).apply(layer.c, a);
      };
    }
    // Track vector geometry alongside normal draws, using the current camera
    // matrix. Legacy mode keeps its original path and raster behavior.
    const owner = this;
    for (const name of ["beginPath", "closePath", "moveTo", "lineTo", "rect", "roundRect", "arc", "arcTo", "ellipse", "bezierCurveTo", "quadraticCurveTo"] as const) {
      const own = (c[name] as (...a: unknown[]) => void).bind(c);
      patch[name] = (...args: unknown[]) => { own(...args); if (this.thin) this.contours.path(name, args); };
    }
    const fillRect = c.fillRect.bind(c), fill = c.fill.bind(c), stroke = c.stroke.bind(c);
    patch.fillRect = (x: number, y: number, w: number, h: number) => {
      fillRect(x, y, w, h);
      if (this.thin && this.capture(c.globalAlpha, c.fillStyle)) this.contours.rect(x, y, w, h);
    };
    patch.fill = (...args: unknown[]) => {
      (fill as (...args: unknown[]) => void)(...args);
      if (this.thin && this.capture(c.globalAlpha, c.fillStyle)) this.contours.fill(args[0] instanceof Path2D ? args[0] : undefined);
    };
    patch.stroke = (...args: unknown[]) => {
      (stroke as (...args: unknown[]) => void)(...args);
      if (this.thin && this.capture(c.globalAlpha, c.strokeStyle)) this.contours.stroke(c, args[0] instanceof Path2D ? args[0] : undefined);
    };
    const draw = drawer(c);
    patch.drawImage = function (img: CanvasImageSource, a: number, b: number, w?: number, h?: number, dx?: number, dy?: number, dw?: number, dh?: number) {
      const original = owner.thin && !owner.currentInk && !owner.neutralMerged;
      const made = !original && isSprite(img) ? copiesOf(img) : null;
      const n = arguments.length;
      if (made && c.globalAlpha >= (owner.thin ? owner.minimumAlpha : SOLID)) {
        if (owner.thin && owner.currentInk) {
          if (c.globalAlpha < 1 || made.faded) owner.contours.faded();
          const sx = n > 5 ? a : 0, sy = n > 5 ? b : 0;
          const sw = n > 5 ? w! : made.bare.width, sh = n > 5 ? h! : made.bare.height;
          const key = `${sx}:${sy}:${sw}:${sh}`;
          const paths = made.paths ??= new Map();
          let path = paths.get(key);
          if (!path) {
            path = bodyPath(made.data!, made.bare.width, made.bare.height, sx, sy, sw, sh);
            if (paths.size >= 16) paths.clear();
            paths.set(key, path);
          }
          owner.contours.image(path, sx, sy, sw, sh, n > 5 ? dx! : a, n > 5 ? dy! : b,
            n > 5 ? dw! : n > 3 ? w! : sw, n > 5 ? dh! : n > 3 ? h! : sh);
        } else owner.under.get(owner.current.c)!(made.shape, a, b, w, h, dx, dy, dw, dh, n);
      }
      draw(made?.bare ?? img, a, b, w, h, dx, dy, dw, dh, n);
    };
  }

  /** Keep faint glows out of the silhouette; preserve genuinely translucent
   * bodies without paying for opaque geometry erasure in ordinary pixel crowds. */
  private capture(alpha: number, style: string | CanvasGradient | CanvasPattern) {
    if (typeof style === "string") {
      if (style.length === 9 && style[0] === "#") alpha *= Number.parseInt(style.slice(7), 16) / 255;
      else if (style.startsWith("rgba(")) {
        const match = /,\s*([\d.]+)\s*\)$/.exec(style);
        if (match) alpha *= Number(match[1]);
      }
    }
    if (alpha < this.minimumAlpha) return false;
    if (alpha < 1) this.contours.faded();
    return true;
  }

  /** The layer to draw the units into and the one under it for their
   * outlines, both cleared, sized to `c`'s canvas and under its transform. */
  begin(c: Ctx, merged = true, contourWidth?: number): { units: Ctx; rims: Ctx } {
    this.thin = contourWidth !== undefined; this.neutralMerged = merged;
    if (this.thin) { merged = true; this.contours.begin(c, contourWidth!); }
    this.merged = merged;
    this.currentInk = undefined;
    this.current = this.outline;
    if (!merged) return this.individual(c);
    const { width, height } = c.canvas, m = c.getTransform();
    for (const { cv, c: l } of [this.layer, this.outline, ...this.colors.values()]) {
      if (cv.width !== width || cv.height !== height) {
        cv.width = width;
        cv.height = height;
      }
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.clearRect(0, 0, width, height);
      l.globalAlpha = 1;
      l.globalCompositeOperation = "source-over";
      l.setTransform(m);
      l.imageSmoothingEnabled = false;
    }
    return { units: this.layer.c, rims: this.outline.c };
  }

  /** Switch only the silhouette channel; all bodies retain their own colors. */
  ink(color?: string, minimumAlpha = SOLID): Ctx {
    this.currentInk = color; this.minimumAlpha = minimumAlpha;
    if (this.thin) {
      this.contours.select(color);
      this.current = this.outline;
      return color ? this.discard.c : this.neutralMerged ? this.outline.c : this.layer.c;
    }
    if (!this.merged) return this.solo!.rims;
    if (!color) this.current = this.outline;
    else {
      let layer = this.colors.get(color);
      if (!layer) {
        layer = canvas();
        layer.cv.width = this.layer.cv.width; layer.cv.height = this.layer.cv.height;
        layer.c.setTransform(this.layer.c.getTransform()); layer.c.imageSmoothingEnabled = false;
        this.colors.set(color, layer);
        this.under.set(layer.c, drawer(layer.c));
      }
      this.current = layer;
      layer.c.globalAlpha = this.layer.c.globalAlpha;
    }
    return this.current.c;
  }

  /** Individual outlines use small reusable sprite masks, never a frame copy per unit. */
  private individual(c: Ctx): { units: Ctx; rims: Ctx } {
    if (this.solo?.target === c) return this.solo;
    const owner = this, draw = drawer(c);
    const image = function (img: CanvasImageSource, a: number, b: number, w?: number, h?: number, dx?: number, dy?: number, dw?: number, dh?: number) {
      const made = owner.currentInk && isSprite(img) ? copiesOf(img) : null, n = arguments.length;
      if (made && c.globalAlpha >= SOLID) {
        const { cv, c: t } = owner.tint;
        if (cv.width !== made.shape.width || cv.height !== made.shape.height) { cv.width = made.shape.width; cv.height = made.shape.height; }
        t.clearRect(0, 0, cv.width, cv.height); t.globalCompositeOperation = 'source-over';
        t.drawImage(made.shape, 0, 0); t.globalCompositeOperation = 'source-in';
        t.fillStyle = owner.currentInk!; t.fillRect(0, 0, cv.width, cv.height); t.globalCompositeOperation = 'source-over';
        draw(cv, a, b, w, h, dx, dy, dw, dh, n);
      }
      draw(made?.bare ?? img, a, b, w, h, dx, dy, dw, dh, n);
    };
    const wrap = (rim: boolean) => {
      const methods = new Map<PropertyKey, unknown>();
      return new Proxy(c, {
        get(target, key) {
          if (!rim && key === 'drawImage') return image;
          const value = Reflect.get(target, key, target);
          if (typeof value !== 'function') return value;
          if (!methods.has(key)) methods.set(key, value.bind(target));
          return methods.get(key);
        },
        set(target, key, value) { return Reflect.set(target, key, rim && (key === 'fillStyle' || key === 'strokeStyle') ? owner.currentInk ?? value : value, target); },
      });
    };
    this.solo = { target: c, units: wrap(false), rims: wrap(true) };
    return this.solo;
  }

  mergePixelGaps() { if (this.thin) this.contours.mergePixelGaps(); }

  /** Visibility colors stay above the world color drain, using cached geometry. */
  drawContours(c: Ctx) { if (this.thin) this.contours.draw(c); }
  /** The contours again, lit by the torchlight's glow where it reaches. */
  shineContours(c: Ctx, lighting: { shineOutlines(c: CanvasRenderingContext2D, outline: (r: CanvasRenderingContext2D) => void, inner: { body: CanvasImageSource; by: number }): void }) {
    if (this.thin) lighting.shineOutlines(c, (r) => this.contours.draw(r), { body: this.layer.cv, by: this.contours.width / 2 });
  }

  /** The outlines, then the units over them, onto `c`. */
  end(c: Ctx, deferContours = false) {
    if (!this.merged) return;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.drawImage(this.outline.cv, 0, 0);
    for (const [ink, layer] of this.colors) {
      const t = layer.c; t.save(); t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalAlpha = 1; t.globalCompositeOperation = 'source-in'; t.fillStyle = ink;
      t.fillRect(0, 0, layer.cv.width, layer.cv.height); t.restore();
      c.drawImage(layer.cv, 0, 0);
    }
    if (this.thin) {
      this.contours.finish(this.layer.cv);
      if (!deferContours) this.contours.draw(c);
    }
    c.drawImage(this.layer.cv, 0, 0);
    c.restore();
  }
}
