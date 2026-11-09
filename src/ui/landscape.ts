/** The landscape layout: on a screen wider than it is tall (a desktop
 * window, a phone turned sideways) the simulation views (the Defend, Ambush
 * and Siege boards, the Mine and the Library) fill the whole window inside
 * their frame, north up as always, and the tabs, controls and palette float
 * over them. Pages without a simulation keep a tab column on the left.
 * `:root.landscape` marks the layout for CSS; pages read `landscape()`. */

/** Wider than tall, by at least this much, switches the layout. Square and
 * tall windows (a narrow desktop window too) keep the portrait layout. */
const QUERY = "(min-aspect-ratio: 11/10)";

/** Whether the landscape layout is on. */
export function landscape(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("landscape");
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

/** How far (CSS pixels) a campaign board's view may pan past its edges in
 * landscape: the taller of the controls floating over its top and bottom. */
export function floatingEdge(page: HTMLElement): number {
  const head = page.querySelector<HTMLElement>(".campaign-head")?.offsetHeight ?? 0;
  const side = page.querySelector<HTMLElement>(".campaign-stage.side-open .defend-side")?.offsetHeight ?? 0;
  return Math.max(head, side) + 12;
}
