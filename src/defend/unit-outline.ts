/** Merged unit outlines: the battle's units (civilians, troops, enemies)
 * keep their black outlines on a layer of their own under all of their
 * bodies, so units that touch or overlap read as one shape with one outline
 * round its perimeter, never one unit's outline cut across another.
 *
 * Every unit sprite is a baked canvas or PNG with a one-pixel near-black
 * ring round it. The units are drawn into `layer`, whose `drawImage` is
 * swapped for one that draws `bare(image)`, the sprite with that ring taken
 * off, and puts its silhouette, its solid pixels in black, at the same
 * place on `outline`. A sprite alone looks as before; where sprites overlap,
 * every silhouette is under every body. The black rims the battle art draws
 * by hand (the guilds' troops, the simple squares) go straight onto the
 * outline layer (`battle-art.ts`'s `rimOf`). Both layers are then copied
 * onto the board, two whole-canvas copies a frame however many units there
 * are; each sprite's bare and silhouette copies are made once.
 *
 * Presentation only: the Settings page's Merged unit outlines. */
import { OUTLINE } from "./pixel-fx.ts";

type Ctx = CanvasRenderingContext2D;
type Sprite = HTMLCanvasElement | HTMLImageElement;

/** Edge pixels this dark (every channel at most) are a sprite's outline. */
const DARK = 48;
/** Sprites drawn fainter than this (auras, fading ghosts) get no
 * silhouette: an outline would read heavier than they are. */
const SOLID = 0.7;

type Copies = { bare: HTMLCanvasElement; shape: HTMLCanvasElement };
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
  private layer = canvas();
  private outline = canvas();

  constructor() {
    const c = this.layer.c, o = this.outline.c, patch = c as unknown as Record<string, unknown>;
    // The outline layer follows every change of the units' transform, so
    // silhouettes land where their sprites do.
    for (const name of ["save", "restore", "setTransform", "resetTransform", "transform", "translate", "scale", "rotate"] as const) {
      const own = (c[name] as (...a: unknown[]) => void).bind(c), other = (o[name] as (...a: unknown[]) => void).bind(o);
      patch[name] = function (...a: unknown[]) {
        own(...a);
        other(...a);
      };
    }
    const draw = drawer(c), under = drawer(o);
    patch.drawImage = function (img: CanvasImageSource, a: number, b: number, w?: number, h?: number, dx?: number, dy?: number, dw?: number, dh?: number) {
      const made = isSprite(img) ? copiesOf(img) : null;
      const n = arguments.length;
      if (made && c.globalAlpha >= SOLID) under(made.shape, a, b, w, h, dx, dy, dw, dh, n);
      draw(made?.bare ?? img, a, b, w, h, dx, dy, dw, dh, n);
    };
  }

  /** The layer to draw the units into and the one under it for their
   * outlines, both cleared, sized to `c`'s canvas and under its transform. */
  begin(c: Ctx): { units: Ctx; rims: Ctx } {
    const { width, height } = c.canvas, m = c.getTransform();
    for (const { cv, c: l } of [this.layer, this.outline]) {
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

  /** The outlines, then the units over them, onto `c`. */
  end(c: Ctx) {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.drawImage(this.outline.cv, 0, 0);
    c.drawImage(this.layer.cv, 0, 0);
    c.restore();
  }
}
