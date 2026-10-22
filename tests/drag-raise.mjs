// A held item rides some cells above the pointer while the Carry dragged
// items above the finger setting is on (`board-pointers.ts`'s `raise`), so a
// drag meant to drop at a board point lets go that far below it.

/** How far (in cells) the page `name` (`__dp` or `stressPage`) carries items above the pointer now. */
export const raiseOf = (page, name = '__dp') => page.evaluate(name => window[name].pointers.raise, name);

/** The client point to let go at for a held item to land on cell point (x, y). */
export const dropAt = (page, x, y) => page.evaluate(([x, y]) => window.__dp.renderer.toClient(x, y + window.__dp.pointers.raise), [x, y]);
