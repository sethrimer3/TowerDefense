/** The landscape layout: on a screen wider than it is tall (a desktop
 * window, a phone turned sideways) the tabs stand in a column on the left
 * and the battle boards are shown turned a quarter turn, the city on the
 * right and the enemies coming in from the left. Only the picture turns:
 * the simulations, their coordinates and their replays are untouched.
 *
 * `:root.landscape` marks the layout for CSS; a board canvas carrying
 * `TURN_CLASS` is drawn as usual (tall, north up) and CSS turns it
 * counter-clockwise inside its box. The helpers here map client (screen)
 * points to the canvas's own unturned CSS pixels and back. */

export const TURN_CLASS = "board-turn";

/** Wider than tall, by at least this much, turns the layout. Square-ish
 * windows keep the portrait layout, which already fits them. */
const QUERY = "(min-aspect-ratio: 11/10)";

/** Whether the landscape layout is on. */
export function landscape(): boolean {
  return document.documentElement.classList.contains("landscape");
}

/** Whether `el` is shown turned a quarter turn. */
export function turned(el: Element): boolean {
  return el.classList.contains(TURN_CLASS) && landscape();
}

/** Keeps `:root.landscape` in step with the window's shape. Registered
 * before any page's resize handler, so those see the new layout. */
export function watchLandscape() {
  const root = document.documentElement;
  const query = typeof matchMedia === "function" ? matchMedia(QUERY) : null;
  const apply = () => root.classList.toggle("landscape", !!query?.matches);
  apply();
  window.addEventListener("resize", apply);
  query?.addEventListener?.("change", apply);
}

/** A client point → `el`'s own CSS pixels, as laid out before any turn
 * (0..clientWidth across, 0..clientHeight down). */
export function clientToLocal(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  if (!turned(el)) return { x: clientX - r.left, y: clientY - r.top, w: r.width || 1, h: r.height || 1 };
  const w = el.clientWidth || 1, h = el.clientHeight || 1;
  // Turned counter-clockwise about its middle: the element's +y (down) shows
  // as screen +x (right), its +x (right) as screen up.
  const X = clientX - (r.left + r.width / 2), Y = clientY - (r.top + r.height / 2);
  return { x: w / 2 - Y, y: h / 2 + X, w, h };
}

/** `el`'s own CSS pixels → a client point (the inverse of `clientToLocal`). */
export function localToClient(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  if (!turned(el)) return { x: r.left + x, y: r.top + y };
  const w = el.clientWidth || 1, h = el.clientHeight || 1;
  return { x: r.left + r.width / 2 + (y - h / 2), y: r.top + r.height / 2 - (x - w / 2) };
}

/** A client-pixel movement → the same movement in `el`'s own pixels. */
export function clientDelta(el: HTMLElement, dx: number, dy: number) {
  return turned(el) ? { x: -dy, y: dx } : { x: dx, y: dy };
}

/** `el`'s laid-out size in CSS pixels, before any turn. */
export function localSize(el: HTMLElement) {
  if (turned(el)) return { w: el.clientWidth || 1, h: el.clientHeight || 1 };
  const r = el.getBoundingClientRect();
  return { w: r.width || 1, h: r.height || 1 };
}
