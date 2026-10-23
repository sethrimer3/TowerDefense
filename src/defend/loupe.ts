/** The magnifying glass: a box above the finger showing the Defend board
 * zoomed in round the point a drag would place or aim at, so a finger (or a
 * coarse mouse) can place finely. It only copies the board canvas's last
 * drawn pixels, so whatever the board draws for the drag (footprints, reach
 * rings, crosshairs, flags) shows magnified without drawing anything twice.
 * Any gesture can use it: `BoardPointers` points it at held drags and at
 * `BoardAim` gestures (through their optional `focus`). Presentation only. */

/** The box's side, in CSS pixels, before it is fitted to small screens. */
const SIZE = 132;
/** How many times larger the glass shows the board than the board shows itself. */
export const LOUPE_ZOOM = 3;
/** The gap (CSS pixels) kept between the box and the point it magnifies. */
const GAP = 18;
/** The gap kept from the window's edges. */
const EDGE = 6;

type Point = { x: number; y: number };

export class Loupe {
  private box: HTMLCanvasElement | null = null;
  /** The finger and the magnified point, in client pixels, while it shows. */
  private at: { pointer: Point; focus: Point } | null = null;

  /** Shows the glass for a finger at `pointer` magnifying the client point `focus`. */
  show(pointer: Point, focus: Point) {
    this.at = { pointer, focus };
  }

  hide() {
    this.at = null;
    if (this.box) this.box.hidden = true;
  }

  get showing(): boolean {
    return !!this.at;
  }

  /** Copies `board`'s pixels round the focus into the box and places it.
   * Called once a frame after the board is drawn. */
  draw(board: HTMLCanvasElement) {
    const at = this.at;
    if (!at || !board.width) return this.box && (this.box.hidden = true);
    const size = Math.round(Math.min(SIZE, window.innerWidth * 0.36, window.innerHeight * 0.3));
    const box = this.box ??= makeBox();
    const dpr = window.devicePixelRatio || 1, px = Math.round(size * dpr);
    if (box.width !== px) box.width = box.height = px;
    box.style.width = box.style.height = `${size}px`;
    const { left, top } = place(at.pointer, at.focus, size);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.hidden = false;

    const r = board.getBoundingClientRect();
    const sx = board.width / r.width, sy = board.height / r.height;
    const span = size / LOUPE_ZOOM;
    const ctx = box.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#14100b";
    ctx.fillRect(0, 0, px, px);
    // Only the part of the source on the canvas is copied, to the matching
    // part of the box, so the edges of the board stay sharp and in place.
    const x0 = (at.focus.x - span / 2 - r.left) * sx, y0 = (at.focus.y - span / 2 - r.top) * sy;
    const w = span * sx, h = span * sy, k = px / w;
    const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0);
    const cx1 = Math.min(board.width, x0 + w), cy1 = Math.min(board.height, y0 + h);
    if (cx1 > cx0 && cy1 > cy0)
      ctx.drawImage(board, cx0, cy0, cx1 - cx0, cy1 - cy0, (cx0 - x0) * k, (cy0 - y0) * (px / h), (cx1 - cx0) * k, (cy1 - cy0) * (px / h));
    crosshair(ctx, px / 2, Math.max(1, Math.round(dpr)));
  }
}

/** Where the box goes: above the higher of the finger and the focus, or
 * beside them when there is no room above, always inside the window. */
export function place(pointer: Point, focus: Point, size: number, view = { w: window.innerWidth, h: window.innerHeight }) {
  const clampX = (x: number) => Math.max(EDGE, Math.min(view.w - size - EDGE, x));
  const clampY = (y: number) => Math.max(EDGE, Math.min(view.h - size - EDGE, y));
  const above = Math.min(pointer.y, focus.y) - GAP - size;
  if (above >= EDGE) return { left: clampX(pointer.x - size / 2), top: above };
  // No room above: to the side away from the nearer edge, level with the focus.
  const right = Math.max(pointer.x, focus.x) + GAP, left = Math.min(pointer.x, focus.x) - GAP - size;
  const x = pointer.x < view.w / 2 ? (right + size <= view.w - EDGE ? right : left) : (left >= EDGE ? left : right);
  return { left: clampX(x), top: clampY(focus.y - size / 2) };
}

function makeBox() {
  const box = document.createElement("canvas");
  box.className = "defend-loupe";
  box.setAttribute("aria-hidden", "true");
  document.body.appendChild(box);
  return box;
}

/** A small black-outlined white cross with a gap at its middle, marking the exact point. */
function crosshair(ctx: CanvasRenderingContext2D, c: number, u: number) {
  const arm = 7 * u, gap = 3 * u;
  // The black bars run a pixel past the white ones each way, outlining them.
  const bars = (t: number, pad: number, color: string) => {
    ctx.fillStyle = color;
    const s = Math.round(c - t / 2), a = arm + 2 * pad, near = Math.round(c + gap - pad), far = Math.round(c - gap - arm - pad);
    ctx.fillRect(far, s, a, t);
    ctx.fillRect(near, s, a, t);
    ctx.fillRect(s, far, t, a);
    ctx.fillRect(s, near, t, a);
  };
  bars(3 * u, u, "#000");
  bars(u, 0, "#fff");
}
