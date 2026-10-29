import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZES, TreeMotes, type MoteScene } from "../src/ui/tree-motes.ts";
import { clampAxis, coverView, panArea, ZOOM_OUT } from "../src/ui/upgrade-graph.ts";

/** A canvas standing in for the browser's, counting what is drawn. */
function fakeCanvas(w = 400, h = 300) {
  const ctx = { fills: [] as [number, number, number, number][], globalAlpha: 1, fillStyle: "", setTransform() {}, clearRect() { ctx.fills.length = 0; }, fillRect(x: number, y: number, a: number, b: number) { ctx.fills.push([x, y, a, b]); } };
  return { canvas: { clientWidth: w, clientHeight: h, width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, ctx };
}
const scene = (over: Partial<MoteScene> = {}): MoteScene => ({
  nodes: [{ id: "a", x: 60, y: 150 }, { id: "b", x: 340, y: 150 }], edges: [["a", "b"]], picked: null,
  area: { x: 0, y: 0, w: 400, h: 300 }, view: { x: 0, y: 0, s: 1 }, pixel: 2, reduced: false, ...over,
});
type Mote = { x: number; y: number; vx: number; vy: number; size: 0 | 1 | 2 };
const motesOf = (m: TreeMotes) => (m as unknown as { motes: Mote[] }).motes;

test("motes come in three sizes, the bigger a touch heavier", () => {
  assert.deepEqual(SIZES.map((s) => s.side), [1, 2, 3]);
  assert.equal(SIZES.reduce((a, s) => a + s.share, 0), 100);
  for (let i = 1; i < SIZES.length; i++) {
    assert.ok(SIZES[i].follow < SIZES[i - 1].follow, "a bigger mote follows the fluid more slowly");
    assert.ok(SIZES[i].follow > SIZES[i - 1].follow * 0.6, "but only slightly");
  }
  const { canvas, ctx } = fakeCanvas();
  const motes = new TreeMotes();
  motes.draw(canvas, 1000, scene());
  const sizes = new Set(motesOf(motes).map((m) => m.size));
  assert.deepEqual([...sizes].sort(), [0, 1, 2]);
  // Squares on the mote pixel grid (2 CSS pixels, at a pixel ratio of 1): 2, 4 and 6 across.
  const sides = new Set(ctx.fills.map(([, , w]) => w));
  for (const side of sides) assert.ok([2, 4, 6].includes(side), `side ${side}`);
  for (const [x, y] of ctx.fills) assert.ok(x % 2 === 0 && y % 2 === 0, "snapped to the grid");
});

test("a branch's current carries motes from an upgrade toward the next", () => {
  const { canvas } = fakeCanvas();
  const motes = new TreeMotes();
  for (let t = 0; t < 4000; t += 16) motes.draw(canvas, t, scene());
  const near = motesOf(motes).filter((m) => Math.abs(m.y * 300 - 150) < 15 && m.x * 400 > 100 && m.x * 400 < 300);
  assert.ok(near.length > 3, `motes near the branch: ${near.length}`);
  const along = near.reduce((a, m) => a + m.vx, 0) / near.length;
  assert.ok(along > 0, `drifting from a to b: ${along}`);
});

test("small motes catch the current sooner than big ones", () => {
  const { canvas } = fakeCanvas();
  const motes = new TreeMotes();
  for (let t = 0; t < 3000; t += 16) motes.draw(canvas, t, scene());
  // Every mote still, on the branch, then a few frames of current.
  for (const m of motesOf(motes)) Object.assign(m, { x: 0.5, y: 0.5, vx: 0, vy: 0 });
  for (let t = 3000; t < 3100; t += 16) motes.draw(canvas, t, scene());
  const speed = (size: number) => {
    const of = motesOf(motes).filter((m) => m.size === size);
    return of.reduce((a, m) => a + Math.hypot(m.vx, m.vy), 0) / of.length;
  };
  assert.ok(speed(0) > speed(1) && speed(1) > speed(2), `${speed(0)} > ${speed(1)} > ${speed(2)}`);
});

test("Reduce Motion draws nothing and stills the motes", () => {
  const { canvas, ctx } = fakeCanvas();
  const motes = new TreeMotes();
  motes.draw(canvas, 0, scene({ reduced: true }));
  assert.equal(ctx.fills.length, 0);
  assert.equal(motes.count, 0);
});

test("a purchase bursts the motes outward from its upgrade", () => {
  const { canvas } = fakeCanvas();
  const motes = new TreeMotes();
  const quiet = scene({ edges: [], nodes: [] });
  motes.draw(canvas, 0, quiet);
  for (const m of motesOf(motes)) Object.assign(m, { vx: 0, vy: 0 });
  const m = motesOf(motes)[0];
  Object.assign(m, { x: 0.55, y: 0.5 });
  motes.burst(200, 150);
  for (let t = 16; t < 200; t += 16) motes.draw(canvas, t, quiet);
  assert.ok(m.vx > 0.01, `pushed away to the right: ${m.vx}`);
});

test("the motes live in the tree's space: they pan and zoom with its view", () => {
  const { canvas, ctx } = fakeCanvas();
  const motes = new TreeMotes();
  // A frame drawn, then the same moment again through a view panned 40 pixels right.
  motes.draw(canvas, 0, scene({ reduced: false }));
  const before = ctx.fills.map(([x, y]) => [x, y]);
  const moved = new TreeMotes();
  Object.assign(moved, { motes: motesOf(motes).map((m) => ({ ...m })) });
  moved.draw(canvas, 0, scene({ view: { x: 40, y: 0, s: 1 } }));
  const after = ctx.fills.map(([x, y]) => [x, y]);
  const shifted = before.filter(([x]) => x + 40 < 400).length;
  assert.ok(after.length >= shifted - 2, "the motes still on screen");
  for (let i = 0; i < 10; i++) assert.ok(after.some(([x, y]) => x === before[i][0] + 40 && y === before[i][1]) || before[i][0] + 40 >= 400);
  // The area they fill is the tree's own, wherever the view looks: a wide area seeds more motes.
  const wide = new TreeMotes();
  wide.draw(canvas, 0, scene({ area: { x: -200, y: -100, w: 1600, h: 900 } }));
  assert.ok(wide.count > motes.count, `${wide.count} > ${motes.count}`);
});

test("the view pans round the tree and a fifth of its size beyond, no further", () => {
  const a = panArea(0, 0, 1000, 500);
  assert.deepEqual(a, { x: -200, y: -100, w: 1400, h: 700 });
  // A small tree keeps a little room round it.
  assert.deepEqual(panArea(0, 0, 100, 100), { x: -60, y: -60, w: 220, h: 220 });
  // At zoom 1 in a 400-wide view: the area's left edge (-200) can't come in past the view's.
  assert.equal(clampAxis(1000, a.x, a.w, 400, 1), 200);
  assert.equal(clampAxis(-5000, a.x, a.w, 400, 1), 400 - 1200);
  assert.equal(clampAxis(0, a.x, a.w, 400, 1), 0);
  // Zoomed out so the area fits, it sits centred.
  assert.equal(clampAxis(123, a.x, a.w, 400, 0.2), 400 / 2 - (a.x + a.w / 2) * 0.2);
});

test("the motes' area covers the view even at the furthest zoom out", () => {
  assert.equal(ZOOM_OUT, 1.25);
  const a = { x: -200, y: -100, w: 1400, h: 700 };
  // A tall phone view at zoom 0.25 shows 400 by 3200 tree pixels: only the height grows, about the middle.
  assert.deepEqual(coverView(a, 100, 800, 0.25), { x: -200, y: -1350, w: 1400, h: 3200 });
  // Already covering: unchanged.
  assert.deepEqual(coverView(a, 100, 100, 1), a);
});
