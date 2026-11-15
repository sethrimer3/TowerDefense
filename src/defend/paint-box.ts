/** The screen box a scratch canvas's paint may cover since it was last
 * cleared, so a frame can clear and copy that box only, never the whole
 * screen. It watches the context's own drawing calls: images and rectangles
 * by their corners, paths by every point added (arcs and ellipses by their
 * square), strokes padded by their widest join. Anything it cannot bound,
 * such as text, pixel writes, a shadow, a filter or a `Path2D`, marks the
 * whole canvas. Every bound is generous: a larger box costs time, never
 * pixels. */
type Ctx = CanvasRenderingContext2D;
export type Box = { x: number; y: number; w: number; h: number };

/** Each watched context's box, for calls that bypass its watched methods. */
const watched = new WeakMap<Ctx, PaintBox>();

/** Records paint drawn on `c` around its watched methods (such as through
 * `CanvasRenderingContext2D.prototype`): the user-space box from (`x0`, `y0`)
 * to (`x1`, `y1`), widened by `pad` user units. No-op on an unwatched `c`. */
export function painted(c: Ctx, x0: number, y0: number, x1: number, y1: number, pad = 0) {
  watched.get(c)?.user(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), pad);
}

/** `box` (or everything) split into the rectangles of the marked cells of a
 * `cols` x `rows` grid of `cell`-pixel squares: runs along each row, merged
 * down while they repeat. The rectangles never overlap. */
export function cellPieces(on: Uint8Array, cols: number, rows: number, cell: number, box: Box): Box[] {
  const out: Box[] = [];
  let open = new Map<string, Box>(), runs = new Map<string, Box>();
  const r0 = Math.max(0, Math.floor(box.y / cell)), r1 = Math.min(rows - 1, Math.floor((box.y + box.h - 1) / cell));
  const c0 = Math.max(0, Math.floor(box.x / cell)), c1 = Math.min(cols - 1, Math.floor((box.x + box.w - 1) / cell));
  for (let r = r0; r <= r1 + 1; r++) {
    runs.clear();
    if (r <= r1) {
      const y = Math.max(box.y, r * cell), y1 = Math.min(box.y + box.h, (r + 1) * cell);
      for (let c = c0; c <= c1; c++) {
        if (!on[r * cols + c]) continue;
        let e = c; while (e < c1 && on[r * cols + e + 1]) e++;
        const x = Math.max(box.x, c * cell), x1 = Math.min(box.x + box.w, (e + 1) * cell), key = `${x}:${x1}`;
        const prior = open.get(key);
        if (prior) { prior.h = y1 - prior.y; runs.set(key, prior); }
        else runs.set(key, { x, y, w: x1 - x, h: y1 - y });
        c = e;
      }
    }
    for (const [key, b] of open) if (runs.get(key) !== b) out.push(b);
    const t = open; open = runs; runs = t;
  }
  return out;
}

/** Cells of a `PaintBox`'s grid, in screen pixels. */
const CELL = 32;

export class PaintBox {
  private cells = new Uint8Array(0); private cols = 0; private rows = 0; private any = false;
  private x0 = Infinity; private y0 = Infinity; private x1 = -Infinity; private y1 = -Infinity;
  private px0 = Infinity; private py0 = Infinity; private px1 = -Infinity; private py1 = -Infinity;
  private all = false;
  private m: DOMMatrix | null = null;

  constructor(private readonly c: Ctx) {
    watched.set(c, this);
    const patch = c as unknown as Record<string, (...a: unknown[]) => unknown>;
    const wrap = (name: string, before: (...a: any[]) => void) => {
      const own = patch[name].bind(c);
      patch[name] = (...a: unknown[]) => { before(...a); return own(...a); };
    };
    for (const name of ["save", "restore", "setTransform", "resetTransform", "transform", "translate", "scale", "rotate"])
      wrap(name, () => { this.m = null; });
    wrap("beginPath", () => { this.px0 = this.py0 = Infinity; this.px1 = this.py1 = -Infinity; });
    wrap("moveTo", (x: number, y: number) => this.pen(x, y));
    wrap("lineTo", (x: number, y: number) => this.pen(x, y));
    wrap("rect", (x: number, y: number, w: number, h: number) => this.penBox(x, y, x + w, y + h));
    wrap("roundRect", (x: number, y: number, w: number, h: number) => this.penBox(x, y, x + w, y + h));
    wrap("arc", (x: number, y: number, r: number) => this.penBox(x - r, y - r, x + r, y + r));
    wrap("ellipse", (x: number, y: number, rx: number, ry: number) => { const r = Math.max(rx, ry); this.penBox(x - r, y - r, x + r, y + r); });
    wrap("arcTo", (x1: number, y1: number, x2: number, y2: number) => { this.pen(x1, y1); this.pen(x2, y2); });
    wrap("quadraticCurveTo", (...a: number[]) => { for (let i = 0; i < 4; i += 2) this.pen(a[i], a[i + 1]); });
    wrap("bezierCurveTo", (...a: number[]) => { for (let i = 0; i < 6; i += 2) this.pen(a[i], a[i + 1]); });
    wrap("fillRect", (x: number, y: number, w: number, h: number) => { if (this.plain()) this.rect(x, y, x + w, y + h, 0); });
    wrap("strokeRect", (x: number, y: number, w: number, h: number) => { if (this.plain()) this.rect(x, y, x + w, y + h, this.reach()); });
    wrap("fill", (path?: unknown) => { if (this.plain() && !(path instanceof Path2D)) this.addPen(0); else this.all = true; });
    wrap("stroke", (path?: unknown) => { if (this.plain() && !(path instanceof Path2D)) this.addPen(this.reach()); else this.all = true; });
    for (const name of ["fillText", "strokeText", "putImageData", "drawFocusIfNeeded"]) if (patch[name]) wrap(name, () => { this.all = true; });
    const owner = this;
    const draw = patch.drawImage.bind(c);
    patch.drawImage = function drawImage(img: CanvasImageSource, a: number, b: number, w?: number, h?: number, dx?: number, dy?: number, dw?: number, dh?: number) {
      const n = arguments.length;
      if (owner.plain()) {
        if (n > 5) owner.rect(dx!, dy!, dx! + dw!, dy! + dh!, 0);
        else if (n > 3) owner.rect(a, b, a + w!, b + h!, 0);
        else {
          const s = img as { naturalWidth?: number; width?: unknown; height?: unknown; naturalHeight?: number };
          const iw = s.naturalWidth ?? s.width, ih = s.naturalHeight ?? s.height;
          if (typeof iw === "number" && typeof ih === "number") owner.rect(a, b, a + iw, b + ih, 0);
          else owner.all = true;
        }
      }
      return (draw as (...v: unknown[]) => unknown)(...Array.prototype.slice.call(arguments));
    } as unknown as (...a: unknown[]) => unknown;
  }

  /** Paint that stays inside its geometry: no shadow or filter. */
  private plain() {
    const c = this.c;
    if ((c.filter && c.filter !== "none") || c.shadowBlur > 0 || c.shadowOffsetX || c.shadowOffsetY) {
      this.all = true;
      return false;
    }
    return true;
  }
  private matrix() { return this.m ??= this.c.getTransform(); }
  /** Half a stroke's widest reach past its path, in user units. */
  private reach() {
    const c = this.c;
    return c.lineWidth / 2 * Math.max(c.lineCap === "square" ? Math.SQRT2 : 1, c.lineJoin === "miter" ? c.miterLimit : 1) + 1;
  }
  private pen(x: number, y: number) {
    const m = this.matrix(), sx = m.a * x + m.c * y + m.e, sy = m.b * x + m.d * y + m.f;
    if (sx < this.px0) this.px0 = sx; if (sx > this.px1) this.px1 = sx;
    if (sy < this.py0) this.py0 = sy; if (sy > this.py1) this.py1 = sy;
    if (Number.isNaN(sx) || Number.isNaN(sy)) this.all = true;
  }
  private penBox(x0: number, y0: number, x1: number, y1: number) {
    this.pen(x0, y0); this.pen(x1, y0); this.pen(x0, y1); this.pen(x1, y1);
  }
  private addPen(pad: number) {
    if (this.px1 < this.px0) return;
    const m = this.matrix(), s = (Math.abs(m.a) + Math.abs(m.b) + Math.abs(m.c) + Math.abs(m.d)) * pad;
    this.screen(this.px0 - s, this.py0 - s, this.px1 + s, this.py1 + s);
  }
  /** Adds a user-space box under the current transform. */
  user(x0: number, y0: number, x1: number, y1: number, pad: number) { if (this.plain()) this.rect(x0, y0, x1, y1, pad); }
  private rect(x0: number, y0: number, x1: number, y1: number, pad: number) {
    const m = this.matrix(), s = (Math.abs(m.a) + Math.abs(m.b) + Math.abs(m.c) + Math.abs(m.d)) * pad;
    const ax = m.a * x0, bx = m.a * x1, cy = m.c * y0, dy = m.c * y1;
    const ex = m.b * x0, fx = m.b * x1, gy = m.d * y0, hy = m.d * y1;
    this.screen(
      Math.min(ax, bx) + Math.min(cy, dy) + m.e - s, Math.min(ex, fx) + Math.min(gy, hy) + m.f - s,
      Math.max(ax, bx) + Math.max(cy, dy) + m.e + s, Math.max(ex, fx) + Math.max(gy, hy) + m.f + s);
  }
  /** Adds a screen-space box that was painted outside the watched calls. */
  screen(x0: number, y0: number, x1: number, y1: number) {
    if (!(x0 <= x1 && y0 <= y1)) { if (Number.isNaN(x0 + y0 + x1 + y1)) this.all = true; return; }
    if (x0 < this.x0) this.x0 = x0; if (y0 < this.y0) this.y0 = y0;
    if (x1 > this.x1) this.x1 = x1; if (y1 > this.y1) this.y1 = y1;
    const { width, height } = this.c.canvas, cols = Math.ceil(width / CELL), rows = Math.ceil(height / CELL);
    if (cols !== this.cols || rows !== this.rows) { this.cols = cols; this.rows = rows; this.cells = new Uint8Array(cols * rows); this.any = false; }
    const a = Math.max(0, Math.floor((Math.floor(x0) - 2) / CELL)), b = Math.min(cols - 1, Math.floor((Math.ceil(x1) + 2) / CELL));
    const t = Math.max(0, Math.floor((Math.floor(y0) - 2) / CELL)), u = Math.min(rows - 1, Math.floor((Math.ceil(y1) + 2) / CELL));
    for (let r = t; r <= u; r++) this.cells.fill(1, r * cols + a, r * cols + b + 1);
    if (a <= b && t <= u) this.any = true;
  }
  add(box: Box | null) { if (box) this.screen(box.x, box.y, box.x + box.w, box.y + box.h); }
  /** Marks the whole canvas, such as after a resize. */
  everything() { this.all = true; }

  /** The box in whole pixels, padded for anti-aliasing and clipped to the
   * canvas; null when nothing has been painted. */
  held(): Box | null {
    const { width, height } = this.c.canvas;
    if (this.all) return width && height ? { x: 0, y: 0, w: width, h: height } : null;
    if (this.x1 < this.x0) return null;
    const x = Math.max(0, Math.floor(this.x0) - 2), y = Math.max(0, Math.floor(this.y0) - 2);
    const w = Math.min(width, Math.ceil(this.x1) + 2) - x, h = Math.min(height, Math.ceil(this.y1) + 2) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
  }
  /** `held` split into the rectangles of the cells painted, which never
   * overlap: what to clear or copy when the paint is scattered. */
  pieces(): Box[] {
    const b = this.held();
    if (!b) return [];
    const { width, height } = this.c.canvas;
    if (this.all || this.cols !== Math.ceil(width / CELL) || this.rows !== Math.ceil(height / CELL)) return [b];
    return cellPieces(this.cells, this.cols, this.rows, CELL, b);
  }
  /** Clears what was painted (the context's transform is kept) and starts over. */
  clear() {
    const pieces = this.pieces();
    if (pieces.length) { const c = this.c; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); for (const b of pieces) c.clearRect(b.x, b.y, b.w, b.h); c.restore(); }
    this.reset();
  }
  /** Starts over. The open path's points stay: they are already on screen,
   * and a later fill of that path is still bounded by them. */
  reset() {
    this.x0 = this.y0 = Infinity; this.x1 = this.y1 = -Infinity;
    this.all = false; this.m = null;
    if (this.any) { this.cells.fill(0); this.any = false; }
  }
}
