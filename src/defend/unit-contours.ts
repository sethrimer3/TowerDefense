/** Vector unions of opaque body pixels. Stroke once per ink, then remove all
 * bodies: overlapping/touching shapes have no interior contour. No frame reads,
 * per-unit canvases, image filters, or pairwise overlap tests. */
import { UNIT_CONTOUR_ART_PIXELS, PORTAL_CONTOUR_WIDTH, PORTAL_UNIT_INK } from "./art-scale.ts";
import { paintPortal } from "./portal-noise.ts";

type Ctx = CanvasRenderingContext2D;
type Stroke = { path: Path2D; width: number; cap: CanvasLineCap; join: CanvasLineJoin; miter: number; radius?: number; filled?: boolean };
type Bounds = { x0: number; y0: number; x1: number; y1: number };
type Channel = { pixels: Path2D[]; pixelBounds: Bounds | null; radius: number; shaped: boolean; mergePixels: boolean; bounds: Bounds | null; faded: boolean; rectangles: Path2D; expanded: Path2D; path: Path2D; strokes: Map<string, Stroke>; canvas: HTMLCanvasElement; c: Ctx };
export class UnitContours {
  private channels = new Map<string, Channel>();
  private ink: string | undefined;
  private matrix = new DOMMatrix();
  private pen = new Path2D();
  private rectOnly = true;
  private penRects: number[] = [];
  private radius = 0;
  private pixelMode = false;
  private inner: HTMLCanvasElement | null = null;
  private innerChannel: Channel | null = null;
  private portal: HTMLCanvasElement | null = null;
  /** Wall-clock seconds the portal dimension has scrolled to. */
  seconds = 0;
  /** How far the contour reaches out from the bodies, in screen pixels. */
  get width() { return this.radius; }
  private scale = 1;

  begin(c: Ctx, width: number) {
    this.matrix = c.getTransform(); this.scale = Math.hypot(this.matrix.a, this.matrix.b);
    this.innerChannel = null; this.pixelMode = false; this.radius = width * this.scale; this.ink = undefined; this.pen = new Path2D(); this.penRects.length = 0; this.rectOnly = true;
    for (const [ink, channel] of this.channels) {
      channel.pixels = [new Path2D(), new Path2D(), new Path2D()]; channel.pixelBounds = null; channel.radius = this.radiusOf(ink); channel.shaped = false; channel.path = new Path2D(); channel.rectangles = new Path2D(); channel.expanded = new Path2D(); channel.strokes.clear(); channel.faded = false; channel.mergePixels = false; channel.bounds = null;
      if (channel.canvas.width !== c.canvas.width || channel.canvas.height !== c.canvas.height) {
        channel.canvas.width = c.canvas.width; channel.canvas.height = c.canvas.height;
      }
      channel.c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    }
  }
  select(ink?: string) { this.ink = ink; this.pixelMode = false; }
  private radiusOf(ink: string) { return ink === PORTAL_UNIT_INK ? this.radius * PORTAL_CONTOUR_WIDTH : this.radius; }
  transform(c: Ctx) { this.matrix = c.getTransform(); }
  private channel() {
    if (!this.ink) return;
    let channel = this.channels.get(this.ink);
    if (!channel) {
      const canvas = document.createElement('canvas'), c = canvas.getContext('2d')!;
      this.channels.set(this.ink, (channel = { pixels: [new Path2D(), new Path2D(), new Path2D()], pixelBounds: null, radius: this.radiusOf(this.ink), shaped: false, mergePixels: false, bounds: null, faded: false, rectangles: new Path2D(), expanded: new Path2D(), path: new Path2D(), strokes: new Map(), canvas, c }));
    }
    return channel;
  }
  mergePixelGaps(active = true) { this.pixelMode = active; const channel = this.channel(); if (channel && active) channel.mergePixels = true; }
  private pixelRadius(channel: Channel, w: number, h: number) {
    if (!this.pixelMode || this.ink !== PORTAL_UNIT_INK) return channel.radius;
    const artPixel = this.radius / UNIT_CONTOUR_ART_PIXELS;
    // 1/2/3+ art-pixel bodies get 0.5/0.75/1 art-pixel rims. Keep one
    // faction union, with fractional coverage at every camera scale.
    return Math.min(channel.radius, (Math.min(w, h) + artPixel) / 4);
  }
  faded() { const channel = this.channel(); if (channel) channel.faded = true; }
  rect(x: number, y: number, w: number, h: number) {
    if (!w || !h) return;
    const channel = this.channel(); if (!channel) return;
    const m = this.matrix;
    if (m.b === 0 && m.c === 0) {
      const x0 = x * m.a + m.e, y0 = y * m.d + m.f, x1 = (x + w) * m.a + m.e, y1 = (y + h) * m.d + m.f;
      const left = Math.min(x0, x1), top = Math.min(y0, y1), width = Math.abs(x1 - x0), height = Math.abs(y1 - y0);
      // Pixel crowds need only a batched union of expanded rectangles, avoiding
      // the stroker's extra geometry for thousands of tiny square bodies.
      const r = this.pixelRadius(channel, width, height);
      channel.expanded.rect(left - r, top - r, width + 2 * r, height + 2 * r);
      if (this.pixelMode) {
        // Feather the dilation in three nested bands. The center sample in
        // closePixelBodies makes narrow bridges darken as the gap shrinks.
        for (let i = 0; i < 3; i++) {
          const pad = r * (1 - i * .25);
          channel.pixels[i].rect(left - pad, top - pad, width + 2 * pad, height + 2 * pad);
        }
        const b = channel.pixelBounds;
        if (b) { b.x0 = Math.min(b.x0, left); b.y0 = Math.min(b.y0, top); b.x1 = Math.max(b.x1, left + width); b.y1 = Math.max(b.y1, top + height); }
        else channel.pixelBounds = { x0: left, y0: top, x1: left + width, y1: top + height };
      }
      const box = channel.bounds;
      if (box) { box.x0 = Math.min(box.x0, left); box.y0 = Math.min(box.y0, top); box.x1 = Math.max(box.x1, left + width); box.y1 = Math.max(box.y1, top + height); }
      else channel.bounds = { x0: left, y0: top, x1: left + width, y1: top + height };
      if (channel.faded) channel.rectangles.rect(left, top, width, height);
    } else { const path = new Path2D(); path.rect(x, y, w, h); this.bodyPath(channel, path, m, w, h); }
  }
  /** Artist replacements and rotated pixel bodies use the same widths. */
  private bodyPath(channel: Channel, path: Path2D, matrix: DOMMatrix, w: number, h: number) {
    if (this.pixelMode) {
      const scale = Math.hypot(this.matrix.a, this.matrix.b), radius = this.pixelRadius(channel, Math.abs(w) * scale, Math.abs(h) * scale), key = `body:${radius}`;
      let stroke = channel.strokes.get(key);
      if (!stroke) channel.strokes.set(key, (stroke = { path: new Path2D(), width: 0, cap: 'butt', join: 'miter', miter: 10, radius, filled: true }));
      stroke.path.addPath(path, matrix);
    } else channel.path.addPath(path, matrix);
    channel.shaped = true;
  }
  image(path: Path2D, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number) {
    const channel = this.channel(); if (!channel || !sw || !sh) return;
    this.bodyPath(channel, path, this.matrix.translate(x, y).scale(w / sw, h / sh).translate(-sx, -sy), w, h);
  }
  path(name: string, args: unknown[]) {
    if (name === 'beginPath') { this.pen = new Path2D(); this.penRects.length = 0; this.rectOnly = true; }
    else {
      (this.pen as unknown as Record<string, (...args: unknown[]) => void>)[name](...args);
      if (name === 'rect' && this.rectOnly) this.penRects.push(...args as number[]);
      else this.rectOnly = false;
    }
  }
  fill(path?: Path2D) {
    if (!path && this.rectOnly && this.penRects.length) {
      for (let i = 0; i < this.penRects.length; i += 4) this.rect(this.penRects[i], this.penRects[i + 1], this.penRects[i + 2], this.penRects[i + 3]);
    } else { const channel = this.channel(); if (channel) { channel.path.addPath(path ?? this.pen, this.matrix); channel.shaped = true; } }
  }
  stroke(c: Ctx, path?: Path2D) {
    const channel = this.channel(); if (!channel) return;
    const width = c.lineWidth * Math.hypot(this.matrix.a, this.matrix.b);
    const key = `${width}:${c.lineCap}:${c.lineJoin}:${c.miterLimit}`;
    let stroke = channel.strokes.get(key);
    if (!stroke) channel.strokes.set(key, (stroke = { path: new Path2D(), width, cap: c.lineCap, join: c.lineJoin, miter: c.miterLimit }));
    stroke.path.addPath(path ?? this.pen, this.matrix); channel.shaped = true;
  }
  /** Rebuilt only with the existing combat cache. Subtract the union of every
   * unit body, including opposing/neutral units, to suppress all overlap seams. */
  finish(bodies: HTMLCanvasElement) {
    for (const [ink, channel] of this.channels) {
      const { c, canvas, path, strokes } = channel;
      if (canvas.width !== bodies.width || canvas.height !== bodies.height) { canvas.width = bodies.width; canvas.height = bodies.height; }
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
      c.globalCompositeOperation = 'source-over'; c.strokeStyle = ink; c.fillStyle = ink;
      c.fill(channel.expanded);
      c.lineWidth = 2 * channel.radius; c.lineJoin = 'miter'; c.lineCap = 'butt'; c.miterLimit = 10;
      c.stroke(path);
      for (const stroke of strokes.values()) {
        c.lineWidth = stroke.width + 2 * (stroke.radius ?? channel.radius); c.lineCap = stroke.cap; c.lineJoin = stroke.join; c.miterLimit = stroke.miter;
        c.stroke(stroke.path);
      }
      c.globalCompositeOperation = 'destination-out';
      // Geometry is opaque even when a cloak fades: its own interior and
      // overlaps must not reveal the strokes between sprite pixel rows.
      for (const body of this.channels.values()) {
        if (!body.faded) continue; // Opaque bodies are already removed by the shared body canvas.
        c.fill(body.path); c.fill(body.rectangles);
        for (const stroke of body.strokes.values()) {
          if (stroke.filled) { c.fill(stroke.path); continue; }
          c.lineWidth = stroke.width; c.lineCap = stroke.cap; c.lineJoin = stroke.join; c.miterLimit = stroke.miter;
          c.stroke(stroke.path);
        }
      }
      c.drawImage(bodies, 0, 0);
      c.globalCompositeOperation = 'source-over';
    }
    // Keep actual bodies out of the rings before inserting soft joins. The
    // portal mixes those joins into its opaque fire, rather than punching
    // translucent holes through both body and rim to expose scenery.
    for (const channel of this.channels.values()) {
      if (channel.mergePixels && channel.pixelBounds && channel.radius > 0) this.closePixelBodies(channel, bodies);
    }
  }
  /** A soft morphological closing of pixel bodies only. Intersect the
   * feathered expanded union at its center and four corners, then insert its
   * black interior behind the real bodies. Narrow cracks become solid; wider
   * necks retain some fire until they close. No filters or scene readbacks. */
  private closePixelBodies(channel: Channel, bodies: HTMLCanvasElement) {
    const { pixelBounds: b, pixels } = channel, r = channel.radius;
    this.portal ??= document.createElement('canvas');
    const canvas = this.portal;
    if (canvas.width !== bodies.width || canvas.height !== bodies.height) { canvas.width = bodies.width; canvas.height = bodies.height; }
    const source = canvas.getContext('2d')!;
    source.setTransform(1, 0, 0, 1, 0, 0); source.clearRect(0, 0, canvas.width, canvas.height);
    source.globalCompositeOperation = "source-over"; source.fillStyle = "#000";
    source.globalAlpha = .35; source.fill(pixels[0]);
    source.globalAlpha = .65; source.fill(pixels[1]);
    source.globalAlpha = 1; source.fill(pixels[2]);
    this.inner ??= document.createElement("canvas");
    if (this.inner.width !== canvas.width || this.inner.height !== canvas.height) { this.inner.width = canvas.width; this.inner.height = canvas.height; }
    const c = this.inner.getContext("2d")!;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
    const x = Math.max(0, Math.floor(b!.x0 - r * 2 - 2)), y = Math.max(0, Math.floor(b!.y0 - r * 2 - 2));
    const w = Math.min(canvas.width, Math.ceil(b!.x1 + r * 2 + 2)) - x, h = Math.min(canvas.height, Math.ceil(b!.y1 + r * 2 + 2)) - y;
    if (w <= 0 || h <= 0) return;
    this.innerChannel = channel;
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.globalCompositeOperation = "source-over"; c.drawImage(canvas, 0, 0);
    c.globalCompositeOperation = "destination-in";
    c.drawImage(canvas, -r, -r); c.drawImage(canvas, r, -r); c.drawImage(canvas, -r, r); c.drawImage(canvas, r, r);
    c.restore(); c.globalCompositeOperation = "source-over";
    const body = bodies.getContext("2d")!;
    body.save(); body.setTransform(1, 0, 0, 1, 0, 0); body.globalAlpha = 1; body.globalCompositeOperation = "destination-over";
    // Bypass UnitOutline's sprite interception: this transient mask is not a
    // source sprite and must never be copied/read back or cached as one.
    CanvasRenderingContext2D.prototype.drawImage.call(body, this.inner, x, y, w, h, x, y, w, h); body.restore();
  }

  /** Every channel onto `c`; the portal's shows the burning dimension
   * through it unless `plain` (a mask for the torchlight's shine). */
  draw(c: Ctx, plain = false) {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    for (const [ink, channel] of this.channels) {
      if (ink === PORTAL_UNIT_INK) this.drawPortal(c, channel, plain);
      else c.drawImage(channel.canvas, 0, 0);
    }
    c.restore();
  }
  /** The dimension painted only over the contour's box, then cut to it. */
  private drawPortal(c: Ctx, channel: Channel, plain = false) {
    const { canvas } = channel;
    let box = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    if (!channel.shaped) {
      const b = channel.bounds, pad = channel.radius * 2 + 2;
      if (!b) return;
      const x0 = Math.max(0, Math.floor(b.x0 - pad)), y0 = Math.max(0, Math.floor(b.y0 - pad));
      box = { x: x0, y: y0, w: Math.min(canvas.width, Math.ceil(b.x1 + pad)) - x0, h: Math.min(canvas.height, Math.ceil(b.y1 + pad)) - y0 };
      if (box.w <= 0 || box.h <= 0) return;
    }
    this.portal ??= document.createElement('canvas');
    const scratch = this.portal;
    if (scratch.width !== canvas.width || scratch.height !== canvas.height) { scratch.width = canvas.width; scratch.height = canvas.height; }
    const s = scratch.getContext('2d')!;
    s.setTransform(1, 0, 0, 1, 0, 0);
    const join = this.innerChannel === channel ? this.inner : null;
    if (plain) {
      s.clearRect(box.x, box.y, box.w, box.h);
      s.drawImage(canvas, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
      // Torch shine belongs to the outer fire, never the black necks.
      if (join) { s.globalCompositeOperation = 'destination-out'; s.drawImage(join, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h); }
    } else {
      paintPortal(s, box, this.seconds, globalThis.devicePixelRatio || 1);
      if (join) { s.globalCompositeOperation = 'source-atop'; s.drawImage(join, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h); }
      s.globalCompositeOperation = 'destination-in';
      s.drawImage(canvas, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
    }
    s.globalCompositeOperation = 'source-over';
    c.drawImage(scratch, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
  }
}

/** Cached body geometry from the same small sprite readback used to remove
 * baked rims. Cropping is intersected before scaling, so cape crops stay bounded. */
export function bodyPath(data: Uint8ClampedArray, w: number, h: number, sx = 0, sy = 0, sw = w, sh = h) {
  const path = new Path2D();
  for (let y = Math.max(0, Math.floor(sy)); y < Math.min(h, Math.ceil(sy + sh)); y++) {
    let x = Math.max(0, Math.floor(sx));
    const end = Math.min(w, Math.ceil(sx + sw));
    while (x < end) {
      if (data[(y * w + x) * 4 + 3] < 128) { x++; continue; }
      const start = x++;
      while (x < end && data[(y * w + x) * 4 + 3] >= 128) x++;
      const left = Math.max(start, sx), top = Math.max(y, sy);
      path.rect(left, top, Math.min(x, sx + sw) - left, Math.min(y + 1, sy + sh) - top);
    }
  }
  return path;
}
