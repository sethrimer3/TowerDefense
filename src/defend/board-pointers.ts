/** Pointer gestures on the DEFEND board, as a small state machine:
 * - idle: nothing is held.
 * - viewing: board pointers move the camera, one panning, two pinch-zooming.
 * - a lone press that lets go without moving the view is a tap.
 * - dragging: a palette item, placed structure, keep, city tile, bomb or
 *   the war banner follows the pointer under a ghost icon until it is released (dropped
 *   where it is) or cancelled.
 * A pointer landing on the board while a gesture is under way joins the view
 * gesture. It ends a building drag, but a bomb or banner stays held, and while a drag
 * lasts every pointer steers it and the first one lifted drops it.
 * A drag whose pointer stays put for `HOLD_MS` is a hold: the page may take
 * it (opening what was pressed) and the drag ends without a drop.
 * What a press picks up and what a drop does are the page's and its
 * `EditSession`'s decisions; this only turns pointers into cells. */
import { consumable, dragIcon } from "./drag-rules.ts";
import type { DragAt, Drop, EditSession } from "./edit-session.ts";
import { CELLS_W, SUB, TILES_H } from "./grid.ts";
import type { DefendRenderer } from "./render.ts";
import { paintIcon } from "./structure-art.ts";

export type PointerHost = {
  renderer(): DefendRenderer | null;
  /** Starts a drag (through `begin`) for whatever a board press lands on,
   * returning false when the press should move the view instead. */
  pickUp(e: PointerEvent): boolean;
  /** A drag was released, doing `drop`. */
  drop(drop: Drop): void;
  /** A press on the board that let go without moving the view: a tap. */
  tap?(e: PointerEvent): void;
  /** A drag held still for `HOLD_MS`; true when the page took it, ending the drag. */
  hold?(edit: EditSession): boolean;
};

/** How far (CSS pixels) a pointer may move and still tap. */
const TAP_SLOP = 8;
/** How long (ms) a press must stay put to be a hold. */
export const HOLD_MS = 450;

type Point = { x: number; y: number };

export class BoardPointers {
  /** Board pointers moving the view, at their last client points. */
  private touches = new Map<number, Point>();
  /** The drag in progress, if any, and the icon following its pointer. */
  private held: { edit: EditSession; ghost: HTMLCanvasElement } | null = null;
  /** A lone press that may yet be a tap, where it went down. */
  private tapping: { id: number; x: number; y: number } | null = null;
  /** A drag that may yet be a hold: its pointer, where it went down, and the timer. */
  private holding: { id: number; x: number; y: number; timer: number } | null = null;

  constructor(private host: PointerHost) {
    window.addEventListener("pointermove", (e) => this.move(e));
    window.addEventListener("pointerup", (e) => this.up(e));
    window.addEventListener("pointercancel", (e) => this.cancel(e));
  }

  /** The drag in progress, if any. */
  get session(): EditSession | null {
    return this.held?.edit ?? null;
  }

  /** A press on the board. */
  down(e: PointerEvent) {
    if (e.button !== 0) return;
    if (this.touches.size || this.held) return this.join(e);
    if (this.host.pickUp(e)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.tapping = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }

  /** A second pointer turns whatever was happening into a pinch. */
  private join(e: PointerEvent) {
    this.tapping = null;
    this.unhold();
    if (this.held && !consumable(dragIcon(this.held.edit.drag))) this.end();
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  /** Starts dragging under `e` in the session `edit`. */
  begin(edit: EditSession, e: PointerEvent) {
    e.preventDefault();
    this.held = { edit, ghost: ghostIcon(edit) };
    this.unhold();
    if (this.host.hold) {
      const timer = window.setTimeout(() => {
        this.holding = null;
        if (this.held?.edit === edit && this.host.hold?.(edit)) this.end();
      }, HOLD_MS);
      this.holding = { id: e.pointerId, x: e.clientX, y: e.clientY, timer };
    }
    this.move(e);
  }

  private move(e: PointerEvent) {
    const h = this.held;
    const t = this.tapping;
    if (t?.id === e.pointerId && Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP) this.tapping = null;
    const o = this.holding;
    if (o?.id === e.pointerId && Math.hypot(e.clientX - o.x, e.clientY - o.y) > TAP_SLOP) this.unhold();
    if (!h && this.touches.has(e.pointerId)) return this.view(e);
    const at = h && this.at(e);
    if (at) h.edit.hover(at);
  }

  /** Where `e` is for the drag, moving its ghost there; null without a board. */
  private at(e: PointerEvent): DragAt | null {
    const renderer = this.host.renderer();
    if (!this.held || !renderer) return null;
    const c = eventCell(renderer, e);
    this.held.ghost.style.left = `${e.clientX}px`;
    this.held.ghost.style.top = `${e.clientY}px`;
    return {
      cellX: c.fx,
      cellY: c.fy,
      overBoard: c.inside,
      overPalette: !!(document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.("#defend-palette"),
    };
  }

  private up(e: PointerEvent) {
    this.touches.delete(e.pointerId);
    if (this.tapping?.id === e.pointerId) {
      this.tapping = null;
      if (!this.held) this.host.tap?.(e);
    }
    const h = this.held;
    if (!h) return;
    const at = this.at(e);
    if (at) this.host.drop(h.edit.release(at));
    this.end();
  }

  private cancel(e: PointerEvent) {
    this.touches.delete(e.pointerId);
    this.tapping = null;
    this.end();
  }

  /** A hold no longer coming. */
  private unhold() {
    if (this.holding) window.clearTimeout(this.holding.timer);
    this.holding = null;
  }

  /** Drops the drag in progress without placing it. */
  end() {
    this.unhold();
    this.held?.ghost.remove();
    this.held = null;
  }

  /** Board pointers: one drags the view, two pinch-zoom it. */
  private view(e: PointerEvent) {
    const renderer = this.host.renderer()!;
    const before = [...this.touches.values()].map((p) => ({ ...p }));
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...this.touches.values()];
    if (after.length >= 2) {
      const [a, b] = before,
        [c, d] = after;
      renderer.panBy((c.x + d.x - a.x - b.x) / 2, (c.y + d.y - a.y - b.y) / 2);
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      if (d0 > 0) renderer.zoomAt((c.x + d.x) / 2, (c.y + d.y) / 2, Math.hypot(c.x - d.x, c.y - d.y) / d0);
    } else {
      const prev = before[0];
      renderer.panBy(e.clientX - prev.x, e.clientY - prev.y);
    }
  }
}

/** The board cell under a pointer, clamped to the board, with its exact
 * position in cells and whether it is really on the board. */
export function eventCell(renderer: DefendRenderer, e: PointerEvent) {
  const { fx, fy } = renderer.toCell(e.clientX, e.clientY);
  const H = TILES_H * SUB;
  const r = renderer.canvas.getBoundingClientRect();
  const onCanvas = e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
  return {
    cx: Math.max(0, Math.min(CELLS_W - 1, Math.floor(fx))),
    cy: Math.max(0, Math.min(H - 1, Math.floor(fy))),
    fx,
    fy,
    inside: onCanvas && fx >= 0 && fy >= 0 && fx < CELLS_W && fy < H,
  };
}

/** The icon that follows the pointer while `drag` is held. */
function ghostIcon(edit: EditSession) {
  const drag = edit.drag;
  const g = document.createElement("canvas");
  g.width = g.height = 48;
  // A wall section is small: its icon rides above the pointer, clear of
  // the quarter tile it would take.
  g.className = dragIcon(drag) === "wallBlock" ? "defend-drag-ghost small" : "defend-drag-ghost";
  g.dataset.icon = dragIcon(drag);
  if (edit.carriedPath) g.dataset.pixelLook = edit.carriedPath;
  paintIcon(g, dragIcon(drag));
  document.body.appendChild(g);
  return g;
}
