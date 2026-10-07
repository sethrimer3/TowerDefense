/** Press and hold a button to press it again and again, slowly at first and
 * then faster and faster. The page may redraw between presses, replacing the
 * button, so it is found again each time by `selector`'s data attribute. */

/** Wait before the first repeat, the first gap, each gap's shrink, and the shortest. */
export const HOLD = { delay: 450, first: 260, shrink: 0.86, fastest: 35 };
/** A pointer moved this far (CSS pixels) is scrolling, not holding. */
const SLOP = 12;

/** Repeating presses for buttons inside `root` carrying one of `attrs`
 * (`data-buy`, ...). Returns a function that stops any hold. */
export function holdToRepeat(root: HTMLElement, attrs: string[]) {
  let timer = 0, gap = 0, repeats = 0, key = "", x = 0, y = 0, pointer = -1;
  const find = () => root.querySelector<HTMLButtonElement>(key);
  const stop = () => {
    clearTimeout(timer);
    timer = 0;
    pointer = -1;
  };
  const tick = () => {
    const b = find();
    if (!b || b.disabled) return stop();
    repeats++;
    b.click();
    gap = Math.max(HOLD.fastest, gap * HOLD.shrink);
    timer = window.setTimeout(tick, gap);
  };
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const b = (e.target as Element).closest<HTMLButtonElement>(attrs.map((a) => `[${a}]`).join(","));
    if (!b || b.disabled) return;
    const attr = attrs.find((a) => b.hasAttribute(a))!, value = b.getAttribute(attr);
    stop();
    key = value ? `[${attr}="${CSS.escape(value)}"]` : `[${attr}]`;
    repeats = 0;
    gap = HOLD.first / HOLD.shrink;
    x = e.clientX;
    y = e.clientY;
    pointer = e.pointerId;
    timer = window.setTimeout(tick, HOLD.delay);
  });
  document.addEventListener("pointermove", (e) => {
    if (e.pointerId === pointer && Math.abs(e.clientX - x) + Math.abs(e.clientY - y) > SLOP) stop();
  });
  for (const ev of ["pointerup", "pointercancel"]) document.addEventListener(ev, (e) => {
    if ((e as PointerEvent).pointerId === pointer) stop();
  });
  window.addEventListener("blur", stop);
  // The release after a hold that repeated must not buy one more.
  root.addEventListener("click", (e) => {
    if (repeats > 0 && e.isTrusted) {
      repeats = 0;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  // A long press on a phone must not open the context menu.
  root.addEventListener("contextmenu", (e) => {
    if ((e.target as Element).closest?.(attrs.map((a) => `[${a}]`).join(","))) e.preventDefault();
  });
  return stop;
}
