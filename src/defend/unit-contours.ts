/** Vector unions of opaque body pixels. Stroke once per ink, then remove all
 * bodies: overlapping/touching shapes have no interior contour. No frame reads,
 * per-unit canvases, image filters, or pairwise overlap tests. */
type Ctx = CanvasRenderingContext2D;
type Stroke = { path: Path2D; width: number; cap: CanvasLineCap; join: CanvasLineJoin; miter: number };
type Channel = { mergePixels: boolean; bounds: { x0: number; y0: number; x1: number; y1: number } | null; faded: boolean; rectangles: Path2D; expanded: Path2D; path: Path2D; strokes: Map<string, Stroke>; canvas: HTMLCanvasElement; c: Ctx };
export class UnitContours {
  private channels = new Map<string, Channel>();
  private ink: string | undefined;
  private matrix = new DOMMatrix();
  private pen = new Path2D();
  private rectOnly = true;
  private penRects: number[] = [];
  private radius = 0;
  private inner: HTMLCanvasElement | null = null;
  /** How far the contour reaches out from the bodies, in screen pixels. */
  get width() { return this.radius; }
  private scale = 1;

  begin(c: Ctx, width: number) {
    this.matrix = c.getTransform(); this.scale = Math.hypot(this.matrix.a, this.matrix.b);
    this.radius = width * this.scale; this.ink = undefined; this.pen = new Path2D(); this.penRects.length = 0; this.rectOnly = true;
    for (const channel of this.channels.values()) {
      channel.path = new Path2D(); channel.rectangles = new Path2D(); channel.expanded = new Path2D(); channel.strokes.clear(); channel.faded = false; channel.mergePixels = false; channel.bounds = null;
      if (channel.canvas.width !== c.canvas.width || channel.canvas.height !== c.canvas.height) {
        channel.canvas.width = c.canvas.width; channel.canvas.height = c.canvas.height;
      }
      channel.c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    }
  }
  select(ink?: string) { this.ink = ink; }
  transform(c: Ctx) { this.matrix = c.getTransform(); }
  private channel() {
    if (!this.ink) return;
    let channel = this.channels.get(this.ink);
    if (!channel) {
      const canvas = document.createElement('canvas'), c = canvas.getContext('2d')!;
      this.channels.set(this.ink, (channel = { mergePixels: false, bounds: null, faded: false, rectangles: new Path2D(), expanded: new Path2D(), path: new Path2D(), strokes: new Map(), canvas, c }));
    }
    return channel;
  }
  mergePixelGaps() { const channel = this.channel(); if (channel) channel.mergePixels = true; }
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
      channel.expanded.rect(left - this.radius, top - this.radius, width + 2 * this.radius, height + 2 * this.radius);
      const box = channel.bounds;
      if (box) { box.x0 = Math.min(box.x0, left); box.y0 = Math.min(box.y0, top); box.x1 = Math.max(box.x1, left + width); box.y1 = Math.max(box.y1, top + height); }
      else channel.bounds = { x0: left, y0: top, x1: left + width, y1: top + height };
      if (channel.faded) channel.rectangles.rect(left, top, width, height);
    } else { const path = new Path2D(); path.rect(x, y, w, h); channel.path.addPath(path, m); }
  }
  image(path: Path2D, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number) {
    const channel = this.channel(); if (!channel || !sw || !sh) return;
    channel.path.addPath(path, this.matrix.translate(x, y).scale(w / sw, h / sh).translate(-sx, -sy));
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
    } else this.channel()?.path.addPath(path ?? this.pen, this.matrix);
  }
  stroke(c: Ctx, path?: Path2D) {
    const channel = this.channel(); if (!channel) return;
    const width = c.lineWidth * Math.hypot(this.matrix.a, this.matrix.b);
    const key = `${width}:${c.lineCap}:${c.lineJoin}:${c.miterLimit}`;
    let stroke = channel.strokes.get(key);
    if (!stroke) channel.strokes.set(key, (stroke = { path: new Path2D(), width, cap: c.lineCap, join: c.lineJoin, miter: c.miterLimit }));
    stroke.path.addPath(path ?? this.pen, this.matrix);
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
      if (channel.mergePixels && channel.bounds && this.radius > 0) this.closePixelRims(channel);
      c.lineWidth = 2 * this.radius; c.lineJoin = 'miter'; c.lineCap = 'butt'; c.miterLimit = 10;
      c.stroke(path);
      for (const stroke of strokes.values()) {
        c.lineWidth = stroke.width + 2 * this.radius; c.lineCap = stroke.cap; c.lineJoin = stroke.join; c.miterLimit = stroke.miter;
        c.stroke(stroke.path);
      }
      c.globalCompositeOperation = 'destination-out';
      // Geometry is opaque even when a cloak fades: its own interior and
      // overlaps must not reveal the strokes between sprite pixel rows.
      for (const body of this.channels.values()) {
        if (!body.faded) continue; // Opaque bodies are already removed by the shared body canvas.
        c.fill(body.path); c.fill(body.rectangles);
        for (const stroke of body.strokes.values()) {
          c.lineWidth = stroke.width; c.lineCap = stroke.cap; c.lineJoin = stroke.join; c.miterLimit = stroke.miter;
          c.stroke(stroke.path);
        }
      }
      c.drawImage(bodies, 0, 0);
      c.globalCompositeOperation = 'source-over';
    }
  }
  /** Close sub-contour gaps before taking the perimeter. Four shifted
   * intersections erode the union of expanded axis-aligned pixel bodies.
   * One reusable scratch canvas, clipped to the crowd; no blur/readbacks. */
  private closePixelRims(channel: Channel) {
    const { canvas, bounds: b } = channel, r = this.radius;
    this.inner ??= document.createElement("canvas");
    if (this.inner.width !== canvas.width || this.inner.height !== canvas.height) { this.inner.width = canvas.width; this.inner.height = canvas.height; }
    const c = this.inner.getContext("2d")!;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
    c.save(); c.beginPath(); c.rect(b!.x0 - r * 2, b!.y0 - r * 2, b!.x1 - b!.x0 + r * 4, b!.y1 - b!.y0 + r * 4); c.clip();
    c.globalCompositeOperation = "source-over"; c.drawImage(canvas, -r, -r);
    c.globalCompositeOperation = "destination-in";
    c.drawImage(canvas, r, -r); c.drawImage(canvas, -r, r); c.drawImage(canvas, r, r);
    c.restore(); c.globalCompositeOperation = "source-over";
    channel.c.globalCompositeOperation = "destination-out"; channel.c.drawImage(this.inner, 0, 0); channel.c.globalCompositeOperation = "source-over";
  }

  draw(c: Ctx) {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    for (const channel of this.channels.values()) c.drawImage(channel.canvas, 0, 0);
    c.restore();
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
