/** Smooth re-layouts for keyed elements (First, Last, Invert, Play): record
 * where every `[data-key]` element inside a container stood, let the page
 * redraw, then play each element from its old place to its new one. An
 * element new to the page grows in from where its `alias` stood (a tile's
 * copies spill out of their stack), or fades in; one that left flies into
 * its alias's new place (copies gather back into their stack), or fades
 * out where it stood. The leavers are the old elements themselves, laid in
 * `ghosts`, an absolutely placed layer over the container. */

export type FlipOptions = {
  /** Where an element without an old (or new) place comes from (or goes). */
  alias?: (key: string) => string | null;
  /** The layer the leavers are laid in, positioned over the container. */
  ghosts: HTMLElement;
  reduced: boolean;
  duration?: number;
};

const EASE = "cubic-bezier(0.22, 0.9, 0.3, 1)";

export function flip(container: HTMLElement, redraw: () => void, opts: FlipOptions) {
  if (opts.reduced) return redraw();
  const before = new Map<string, DOMRect>(), olds = new Map<string, HTMLElement>();
  for (const e of Array.from(container.querySelectorAll<HTMLElement>("[data-key]"))) {
    before.set(e.dataset.key!, e.getBoundingClientRect());
    olds.set(e.dataset.key!, e);
  }
  redraw();
  const ms = opts.duration ?? 420, alias = opts.alias ?? (() => null);
  const after = new Map<string, HTMLElement>();
  for (const e of Array.from(container.querySelectorAll<HTMLElement>("[data-key]"))) after.set(e.dataset.key!, e);
  for (const [key, e] of after) {
    const r1 = e.getBoundingClientRect(), from = before.get(key) ?? before.get(alias(key) ?? "");
    if (!r1.width || !r1.height) continue;
    if (!from && e.dataset.grow !== undefined) {
      // A panel opening unrolls downward.
      e.animate([{ clipPath: "inset(0 0 100% 0)", opacity: 0.4 }, { clipPath: "inset(0 0 0 0)", opacity: 1 }], { duration: ms, easing: EASE });
      continue;
    }
    if (!from) {
      e.animate([{ opacity: 0, transform: "scale(0.7)" }, { opacity: 1, transform: "none" }], { duration: ms * 0.8, easing: EASE, delay: ms * 0.15, fill: "backwards" });
      continue;
    }
    const dx = from.left - r1.left, dy = from.top - r1.top, sx = from.width / r1.width, sy = from.height / r1.height;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
    e.animate([{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transformOrigin: "0 0", transform: "none" }], { duration: ms, easing: EASE });
  }
  const layer = opts.ghosts.getBoundingClientRect();
  for (const [key, old] of olds) {
    if (after.has(key)) continue;
    const r0 = before.get(key)!;
    if (!r0.width || !r0.height) continue;
    old.style.cssText = `position:absolute;left:${r0.left - layer.left}px;top:${r0.top - layer.top}px;width:${r0.width}px;height:${r0.height}px;margin:0;pointer-events:none`;
    old.inert = true;
    opts.ghosts.append(old);
    const to = after.get(alias(key) ?? "")?.getBoundingClientRect();
    const end = to && to.width
      ? { transform: `translate(${to.left - r0.left}px, ${to.top - r0.top}px) scale(${to.width / r0.width}, ${to.height / r0.height})`, opacity: 0.2 }
      : { transform: "scale(0.6)", opacity: 0 };
    const a = old.animate([{ transformOrigin: "0 0", transform: "none", opacity: 1 }, { transformOrigin: "0 0", ...end }], { duration: ms * 0.85, easing: EASE, fill: "forwards" });
    a.onfinish = a.oncancel = () => old.remove();
  }
}
