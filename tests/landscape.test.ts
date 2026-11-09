import { test } from "node:test";
import assert from "node:assert/strict";
import { clientDelta, clientToLocal, localSize, localToClient, turned, TURN_CLASS } from "../src/ui/landscape.ts";

/** A root whose class list says whether the landscape layout is on. */
function root(on: boolean) {
  const classes = new Set(on ? ["landscape"] : []);
  (globalThis as { document?: unknown }).document = { documentElement: { classList: { contains: (c: string) => classes.has(c) } } };
}

/** A canvas laid out `w` × `h` (tall), its box on screen at (`left`, `top`):
 * turned, the box is `h` wide and `w` tall. */
function canvas(w: number, h: number, left: number, top: number, turn = true) {
  const classes = new Set(turn ? [TURN_CLASS] : []);
  const on = () => (globalThis as { document: { documentElement: { classList: { contains(c: string): boolean } } } }).document.documentElement.classList.contains("landscape");
  return {
    clientWidth: w,
    clientHeight: h,
    classList: { contains: (c: string) => classes.has(c) },
    getBoundingClientRect: () => (turn && on() ? { left, top, width: h, height: w } : { left, top, width: w, height: h }),
  } as unknown as HTMLElement;
}

test("a board canvas turns only in landscape", () => {
  root(false);
  assert.equal(turned(canvas(90, 130, 0, 0)), false);
  root(true);
  assert.equal(turned(canvas(90, 130, 0, 0)), true);
  assert.equal(turned(canvas(90, 130, 0, 0, false)), false);
});

test("portrait maps client points straight through", () => {
  root(false);
  const c = canvas(90, 130, 10, 20);
  assert.deepEqual(clientToLocal(c, 15, 25), { x: 5, y: 5, w: 90, h: 130 });
  assert.deepEqual(localToClient(c, 5, 5), { x: 15, y: 25 });
  assert.deepEqual(clientDelta(c, 3, 4), { x: 3, y: 4 });
  assert.deepEqual(localSize(c), { w: 90, h: 130 });
});

test("turned counter-clockwise: the canvas's bottom shows on the right, its top on the left", () => {
  root(true);
  // Laid out 90 wide by 130 tall; on screen a 130 × 90 box at (10, 20).
  const c = canvas(90, 130, 10, 20);
  const bottomMiddle = localToClient(c, 45, 130), topMiddle = localToClient(c, 45, 0);
  assert.deepEqual(bottomMiddle, { x: 140, y: 65 });
  assert.deepEqual(topMiddle, { x: 10, y: 65 });
  // The canvas's right edge shows along the top of the box.
  assert.deepEqual(localToClient(c, 90, 65), { x: 75, y: 20 });
  assert.deepEqual(localSize(c), { w: 90, h: 130 });
});

test("turned mapping round-trips, and movements turn with it", () => {
  root(true);
  const c = canvas(90, 130, 10, 20);
  for (const [x, y] of [[0, 0], [90, 130], [12.5, 77], [45, 65]]) {
    const p = localToClient(c, x, y), back = clientToLocal(c, p.x, p.y);
    assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.y - y) < 1e-9, `${x},${y}`);
    const moved = clientToLocal(c, p.x + 7, p.y - 3), d = clientDelta(c, 7, -3);
    assert.ok(Math.abs(moved.x - back.x - d.x) < 1e-9 && Math.abs(moved.y - back.y - d.y) < 1e-9);
  }
});
