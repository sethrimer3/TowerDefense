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
 * - lifting: a press on a city tile (`pend`) moves the view like any other
 *   until it has stayed put for `LIFT_MS`; only then does the tile lift and
 *   the drag start. Moving first pans, letting go first taps.
 * What a press picks up and what a drop does are the page's and its
 * `EditSession`'s decisions; this only turns pointers into cells.
 * While the host's `magnify` is on, a `Loupe` above the finger shows the
 * board zoomed in round the point a drag or aim would land on. */
import { consumable, dragIcon } from "./drag-rules.ts";
import type { DragAt, Drop, EditSession } from "./edit-session.ts";
import { CELLS_W, SUB, TILES_H, type TilePos } from "./grid.ts";
import { QC } from "./layout.ts";
import { Loupe } from "./loupe.ts";
import type { DefendRenderer } from "./render.ts";
import { paintIcon } from "./structure-art.ts";

export type PointerHost = {
  renderer(): DefendRenderer | null;
  /** A battle-only aiming handle; an additional pointer cancels it and pinches. */
  aim?(e: PointerEvent): BoardAim | null;
  /** Starts a drag (through `begin`) for whatever a board press lands on,
   * returning false when the press should move the view instead. */
  pickUp(e: PointerEvent): boolean;
  /** A drag was released, doing `drop`. */
  drop(drop: Drop): void;
  /** A press on the board that let go without moving the view: a tap. */
  tap?(e: PointerEvent): void;
  /** A drag held still for `HOLD_MS`; true when the page took it, ending the drag. */
  hold?(edit: EditSession): boolean;
  /** Whether a held item rides `RAISE` cells above the pointer. */
  raise?(): boolean;
  /** Whether the magnifying glass shows above drags and aims. */
  magnify?(): boolean;
};
/** A battle aiming gesture. `focus` is the board point (in cells) it aims
 * at for the pointer `e`, which the magnifying glass centres on; without
 * it, the glass centres on the pointer. */
export type BoardAim = {
  move(e: PointerEvent): void;
  end(e: PointerEvent, commit: boolean, moved: boolean): void;
  focus?(e: PointerEvent): { x: number; y: number } | null;
};

/** How far (CSS pixels) a pointer may move and still tap. */
const TAP_SLOP = 8;
/** How long (ms) a press must stay put to be a hold. */
export const HOLD_MS = 450;
/** How long (ms) a press on a city tile must stay put to lift it. */
export const LIFT_MS = 500;
/** How far (in cells) above the pointer a held item rides, while the
 * setting is on, so the finger doesn't hide where it goes: four quarter
 * tiles of the board's grid. */
export const RAISE = 4 * QC;

type Point = { x: number; y: number };

export class BoardPointers {
  /** Board pointers moving the view, at their last client points. */
  private touches = new Map<number, Point>();
  private aiming: { id: number; x: number; y: number; last: PointerEvent; moved: boolean; gesture: BoardAim } | null = null;
  /** The drag in progress, if any, and the icon following its pointer. */
  private held: { edit: EditSession; ghost: HTMLCanvasElement } | null = null;
  /** A lone press that may yet be a tap, where it went down. */
  private tapping: { id: number; x: number; y: number } | null = null;
  /** A drag that may yet be a hold: its pointer, where it went down, and the timer. */
  private holding: { id: number; x: number; y: number; timer: number } | null = null;
  /** A city tile pressed and not yet held long enough to lift: its session,
   * its tile, the pointer, where and when it went down, its latest event and
   * the timer. */
  private lifting: { edit: EditSession; tile: TilePos; id: number; x: number; y: number; since: number; e: PointerEvent; timer: number } | null = null;

  /** The magnifying glass; any gesture may point it with `magnify`. */
  readonly loupe = new Loupe();
  /** Where the glass looks now: the pointer (client pixels) and the board
   * point (cells) it magnifies. */
  private looking: { pointer: { x: number; y: number }; cell: { x: number; y: number } } | null = null;

  constructor(private host: PointerHost) {
    window.addEventListener("pointermove", (e) => this.move(e));
    window.addEventListener("pointerup", (e) => this.up(e));
    window.addEventListener("pointercancel", (e) => this.cancel(e));
  }

  /** How far (in cells) above the pointer a held item rides now. */
  get raise(): number {
    return this.host.raise?.() ? RAISE : 0;
  }

  /** Points the magnifying glass, while the setting is on, at board point
   * `cell` (in cells) for a pointer at client point `pointer`; null hides
   * it. Drags and aims call it themselves; other gestures may too. */
  magnify(pointer: { x: number; y: number } | null, cell?: { x: number; y: number } | null) {
    this.looking = pointer && cell && this.host.magnify?.() ? { pointer, cell } : null;
    if (!this.looking) this.loupe.hide();
  }

  /** Draws the magnifying glass from the board just drawn; once a frame. */
  drawLoupe(renderer: DefendRenderer) {
    const l = this.looking;
    if (!l || !this.host.magnify?.()) return this.loupe.hide();
    this.loupe.show(l.pointer, renderer.toClient(l.cell.x, l.cell.y));
    this.loupe.draw(renderer.canvas);
  }

  /** The drag in progress, if any. */
  get session(): EditSession | null {
    return this.held?.edit ?? null;
  }

  /** The city tile being held to lift, and how far the hold has come (0–1). */
  liftProgress(now = performance.now()): { tile: TilePos; t: number } | null {
    const l = this.lifting;
    return l && { tile: l.tile, t: Math.max(0, Math.min(1, (now - l.since) / LIFT_MS)) };
  }

  /** A press on the board. */
  down(e: PointerEvent) {
    if (e.button !== 0) return;
    if (this.aiming) {
      const a = this.aiming;
      this.aiming = null;
      this.magnify(null);
      a.gesture.end(a.last, false, a.moved);
      this.touches.set(a.id, { x: a.last.clientX, y: a.last.clientY });
      return this.join(e);
    }
    if (this.touches.size || this.held) return this.join(e);
    const aim = this.host.aim?.(e);
    if (aim) {
      e.preventDefault();
      this.aiming = { id: e.pointerId, x: e.clientX, y: e.clientY, last: e, moved: false, gesture: aim };
      return;
    }
    if (this.host.pickUp(e)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.tapping = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }

  /** A second pointer turns whatever was happening into a pinch. */
  private join(e: PointerEvent) {
    this.tapping = null;
    this.unhold();
    this.unlift();
    if (this.held && !consumable(dragIcon(this.held.edit.drag))) this.end();
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  /** A press under `e` that lifts city tile `tile` in the session `edit`
   * once held still for `LIFT_MS`; until then it moves the view (the host's
   * `pickUp` returns false after calling this). */
  pend(edit: EditSession, tile: TilePos, e: PointerEvent) {
    this.unlift();
    const timer = window.setTimeout(() => {
      const l = this.lifting;
      if (l?.edit !== edit) return;
      this.lifting = null;
      this.touches.delete(l.id);
      this.tapping = null;
      this.begin(edit, l.e, false);
    }, LIFT_MS);
    this.lifting = { edit, tile, id: e.pointerId, x: e.clientX, y: e.clientY, since: performance.now(), e, timer };
  }

  /** Starts dragging under `e` in the session `edit`; `holds` says whether
   * keeping still then is a hold (a tile lifted by holding is not). */
  begin(edit: EditSession, e: PointerEvent, holds = true) {
    e.preventDefault();
    this.held = { edit, ghost: ghostIcon(edit) };
    this.unhold();
    if (this.host.hold && holds) {
      const timer = window.setTimeout(() => {
        this.holding = null;
        if (this.held?.edit === edit && this.host.hold?.(edit)) this.end();
      }, HOLD_MS);
      this.holding = { id: e.pointerId, x: e.clientX, y: e.clientY, timer };
    }
    this.move(e);
  }

  private move(e: PointerEvent) {
    const a = this.aiming;
    if (a?.id === e.pointerId) {
      a.last = e;
      a.moved ||= Math.hypot(e.clientX - a.x, e.clientY - a.y) > TAP_SLOP;
      if (a.moved) {
        a.gesture.move(e);
        this.lookAim(a.gesture, e);
      }
      return;
    }
    const h = this.held;
    const t = this.tapping;
    if (t?.id === e.pointerId && Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP) this.tapping = null;
    const o = this.holding;
    if (o?.id === e.pointerId && Math.hypot(e.clientX - o.x, e.clientY - o.y) > TAP_SLOP) this.unhold();
    const l = this.lifting;
    if (l?.id === e.pointerId) {
      // Held still, the view stays put; moved away, the press pans instead.
      if (Math.hypot(e.clientX - l.x, e.clientY - l.y) <= TAP_SLOP) return void (l.e = e);
      this.unlift();
    }
    if (!h && this.touches.has(e.pointerId)) return this.view(e);
    const at = h && this.at(e);
    if (at) h.edit.hover(at);
  }

  /** Points the glass at what `aim` aims at for `e`. */
  private lookAim(aim: BoardAim, e: PointerEvent) {
    const renderer = this.host.renderer();
    if (!renderer) return;
    const c = eventCell(renderer, e);
    this.magnify({ x: e.clientX, y: e.clientY }, aim.focus ? aim.focus(e) : { x: c.fx, y: c.fy });
  }

  /** Where `e` is for the drag, moving its ghost there; null without a board. */
  private at(e: PointerEvent): DragAt | null {
    const renderer = this.host.renderer();
    if (!this.held || !renderer) return null;
    const c = eventCell(renderer, e);
    // The item rides `raise` cells above the pointer, kept on the board so
    // its top rows stay in reach; the pointer still says whether it is over
    // the board or the palette.
    const raise = this.raise;
    const fy = c.inside ? Math.max(0, c.fy - raise) : c.fy - raise;
    const ghost = renderer.toClient(c.fx, fy);
    this.held.ghost.style.left = `${e.clientX}px`;
    this.held.ghost.style.top = `${e.clientY + ghost.y - renderer.toClient(c.fx, c.fy).y}px`;
    this.magnify({ x: e.clientX, y: e.clientY }, c.inside ? { x: c.fx, y: fy } : null);
    return {
      cellX: c.fx,
      cellY: fy,
      overBoard: c.inside,
      overPalette: !!(document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.("#defend-palette"),
    };
  }

  private up(e: PointerEvent) {
    if (this.aiming?.id === e.pointerId) {
      const a = this.aiming;
      this.aiming = null;
      this.magnify(null);
      a.gesture.end(e, true, a.moved);
      return;
    }
    this.touches.delete(e.pointerId);
    if (this.lifting?.id === e.pointerId) this.unlift();
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
    this.unlift();
    this.end();
  }

  /** A hold no longer coming. */
  private unhold() {
    if (this.holding) window.clearTimeout(this.holding.timer);
    this.holding = null;
  }

  /** A city tile no longer lifting. */
  private unlift() {
    if (this.lifting) window.clearTimeout(this.lifting.timer);
    this.lifting = null;
  }

  /** Drops the drag in progress without placing it. */
  end() {
    if (this.aiming) {
      const a = this.aiming;
      this.aiming = null;
      a.gesture.end(a.last, false, a.moved);
    }
    this.unhold();
    this.unlift();
    this.magnify(null);
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
