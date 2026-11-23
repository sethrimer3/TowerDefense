/** The golden "+24m" that rises out of a tab button when idle time is paid:
 * gold pixel figures ringed in black only edge to edge (no corner pixels),
 * the outline drawn as four orthogonal text shadows one font pixel wide
 * (`.idle-pop` in `theme.css`). It rises up out of the bottom tab row, and
 * floats right out of the landscape layout's tab column. */
import { landscape } from "./landscape.ts";

/** How long a pop shows, and its staggering when several rise together. */
export const POP_MS = 1900;
const STAGGER_MS = 260;

/** Rises `text` out of `from`; the `order`-th of a set rises a little later. */
export function popIdle(from: Element, text: string, reduced: boolean, order = 0) {
  if (typeof document === "undefined") return;
  const box = from.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return;
  const pop = document.createElement("b");
  const sideways = landscape();
  pop.className = `idle-pop${sideways ? " sideways" : ""}`;
  pop.textContent = text;
  pop.setAttribute("aria-hidden", "true");
  pop.style.left = `${sideways ? box.right - 6 : box.left + box.width / 2}px`;
  pop.style.top = `${sideways ? box.top + box.height / 2 : box.top + 6}px`;
  document.body.append(pop);
  const [dx, dy] = sideways ? [46, 0] : [0, -46];
  const start = sideways ? "translate(0, -50%)" : "translate(-50%, -100%)";
  const at = (f: number, scale: number) => `${start} translate(${dx * f}px, ${dy * f}px) scale(${scale})`;
  const frames = reduced
    ? [{ transform: at(0.6, 1), opacity: 0 }, { transform: at(0.6, 1), opacity: 1, offset: 0.15 }, { transform: at(0.6, 1), opacity: 1, offset: 0.8 }, { transform: at(0.6, 1), opacity: 0 }]
    : [
      { transform: at(0, 0.4), opacity: 0 },
      { transform: at(0.45, 1.25), opacity: 1, offset: 0.14 },
      { transform: at(0.6, 1), opacity: 1, offset: 0.26 },
      { transform: at(0.85, 1), opacity: 1, offset: 0.78 },
      { transform: at(1, 1), opacity: 0 },
    ];
  const animation = pop.animate(frames, { duration: POP_MS, delay: order * STAGGER_MS, easing: "cubic-bezier(.22,.61,.36,1)", fill: "both" });
  animation.onfinish = () => pop.remove();
  animation.oncancel = () => pop.remove();
}
