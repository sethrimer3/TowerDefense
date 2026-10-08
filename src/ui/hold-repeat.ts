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
  const selector = attrs.map((a) => `button[${a}]`).join(",");
  let timer = 0, gap = 0, repeats = 0, key = "", x = 0, y = 0, left = 0, top = 0, pointer = -1;
  let released: { key: string; pointer: number } | null = null;
  const find = () => root.querySelector<HTMLButtonElement>(key);
  const stop = () => {
    clearTimeout(timer);
    timer = 0;
    const previous = pointer;
    if (previous >= 0 && repeats > 0) released = { key, pointer: previous };
    pointer = -1;
    if (previous >= 0 && root.hasPointerCapture(previous)) root.releasePointerCapture(previous);
  };
  const cancel = () => {
    stop();
    released = null;
  };
  const available = (b: HTMLButtonElement | null): b is HTMLButtonElement =>
    !!b && !b.disabled && b.isConnected && !b.closest("[inert]") && b.getClientRects().length > 0 && !document.hidden;
  const tick = () => {
    timer = 0;
    if (pointer < 0) return;
    const b = find();
    if (!available(b)) return stop();
    // Touch implicitly captures the pressed button. Capture its stable root
    // before a purchase replaces that button, so release still reaches us.
    if (!root.hasPointerCapture(pointer)) root.setPointerCapture(pointer);
    repeats++;
    b.click();
    if (pointer < 0 || !available(find())) return stop();
    gap = Math.max(HOLD.fastest, gap * HOLD.shrink);
    timer = window.setTimeout(tick, gap);
  };
  document.addEventListener("pointerdown", () => { released = null; }, true);
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.isPrimary || pointer >= 0) return;
    const b = (e.target as Element).closest<HTMLButtonElement>(selector);
    if (!available(b)) return;
    const attr = attrs.find((a) => b.hasAttribute(a))!, value = b.getAttribute(attr);
    stop();
    key = value ? `[${attr}="${CSS.escape(value)}"]` : `[${attr}]`;
    repeats = 0;
    gap = HOLD.first / HOLD.shrink;
    x = e.clientX;
    y = e.clientY;
    ({ left, top } = b.getBoundingClientRect());
    pointer = e.pointerId;
    timer = window.setTimeout(tick, HOLD.delay);
  });
  document.addEventListener("pointermove", (e) => {
    if (e.pointerId === pointer && Math.abs(e.clientX - x) + Math.abs(e.clientY - y) > SLOP) stop();
  });
  document.addEventListener("pointerup", (e) => {
    if (e.pointerId !== pointer) return;
    stop();
  });
  document.addEventListener("pointercancel", (e) => { if (e.pointerId === pointer) cancel(); });
  root.addEventListener("lostpointercapture", (e) => { if (e.target === root && e.pointerId === pointer) cancel(); });
  document.addEventListener("wheel", stop, { passive: true });
  document.addEventListener("scroll", () => {
    if (pointer < 0) return;
    const box = find()?.getBoundingClientRect();
    if (!box || Math.abs(box.left - left) + Math.abs(box.top - top) > 1) stop();
  }, true);
  document.addEventListener("visibilitychange", cancel);
  window.addEventListener("blur", cancel);
  window.addEventListener("pagehide", cancel);
  // The release after a hold that repeated must not buy one more.
  root.addEventListener("click", (e) => {
    const target = e.target as Element;
    const releaseClick = released && e.isTrusted && e.detail > 0
      && (e as PointerEvent).pointerId === released.pointer
      && (target === root || target.closest(released.key));
    if (releaseClick) {
      released = null;
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
  // A long press on a phone must not open the context menu.
  root.addEventListener("contextmenu", (e) => {
    if (pointer >= 0 || (e.target as Element).closest?.(selector)) e.preventDefault();
  });
  return cancel;
}
