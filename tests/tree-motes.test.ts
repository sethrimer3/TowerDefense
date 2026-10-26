import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZES, TreeMotes, type MoteScene } from "../src/ui/tree-motes.ts";

/** A canvas standing in for the browser's, counting what is drawn. */
function fakeCanvas(w = 400, h = 300) {
  const ctx = { fills: [] as [number, number, number, number][], globalAlpha: 1, fillStyle: "", setTransform() {}, clearRect() { ctx.fills.length = 0; }, fillRect(x: number, y: number, a: number, b: number) { ctx.fills.push([x, y, a, b]); } };
  return { canvas: { clientWidth: w, clientHeight: h, width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, ctx };
}
const scene = (over: Partial<MoteScene> = {}): MoteScene => ({
  nodes: [{ id: "a", x: 60, y: 150 }, { id: "b", x: 340, y: 150 }], edges: [["a", "b"]], picked: null, pixel: 2, reduced: false, ...over,
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
  motes.burst(200, 150, canvas);
  for (let t = 16; t < 200; t += 16) motes.draw(canvas, t, quiet);
  assert.ok(m.vx > 0.01, `pushed away to the right: ${m.vx}`);
});
