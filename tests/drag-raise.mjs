// A held item rides `RAISE` cells above the pointer (`board-pointers.ts`),
// so a drag meant to drop at a board point lets go that far below it.
export const RAISE = 8;

/** The client point to let go at for a held item to land on cell point (x, y). */
export const dropAt = (page, x, y) => page.evaluate(([x, y]) => window.__dp.renderer.toClient(x, y), [x, y + RAISE]);
