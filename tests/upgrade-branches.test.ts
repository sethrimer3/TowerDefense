import { test } from "node:test";
import assert from "node:assert/strict";
import { buildingTree } from "../src/specializations.ts";
import { trailAim } from "../src/ui/upgrade-graph.ts";
import { BranchArt, rgb, type Tone } from "../src/ui/branch-art.ts";

const node = (tree: ReturnType<typeof buildingTree>, id: string) => tree.find((n) => n.id === id)!;

test("a closed-off path trails off on the side it stood, beside the one taken", () => {
  // The wizard tower's branches stand the Pyre, Frost and Storm towers, left to right.
  const left = node(buildingTree("pyreTower", { path: "pyromancy", rank: 1 }), "k:wizardTower");
  assert.deepEqual(left.took, { side: false, i: 0, n: 3 });
  for (const slot of left.closed!) assert.ok(trailAim(slot, left.took!, false)[0] > 0, "taking the left path, the others trail off to the right");
  const right = node(buildingTree("stormTower", { path: "storm", rank: 1 }), "k:wizardTower");
  for (const slot of right.closed!) assert.ok(trailAim(slot, right.took!, false)[0] < 0, "taking the right path, the others trail off to the left");
  const mid = node(buildingTree("frostTower", { path: "rime", rank: 1 }), "k:wizardTower");
  assert.deepEqual(mid.closed!.map((s) => Math.sign(trailAim(s, mid.took!, false)[0])), [-1, 1], "taking the middle, one each side");
  for (const t of [left, right, mid]) for (const slot of t.closed!) assert.ok(trailAim(slot, t.took!, false)[1] < 0, "paths trail off upward");
});

test("closed-off buildings trail off beside and below", () => {
  const tree = buildingTree("stormTower", { path: "storm", rank: 1 });
  const watch = node(tree, "k:watchTower");
  assert.ok(watch.took?.side, "the Watch tower became the wizard tower");
  const aims = watch.closed!.map((s) => [s, trailAim(s, watch.took!, true)] as const);
  for (const [s, [, dy]] of aims) if (s.side) assert.ok(dy > 0, "a building it could have become stood below");
  const ups = aims.filter(([s]) => !s.side).map(([, [dx]]) => dx);
  assert.ok(ups.every((dx) => dx !== 0), "its paths part round the wizard tower standing straight up");
});

test("branches are outlined in black, lit from the upper left, and scatter as they fade", () => {
  const tone: Tone = { light: rgb("#ffffff"), base: rgb("#808080"), shade: rgb("#202020") };
  const art = new BranchArt();
  art.resize(40, 20);
  art.draw([{ a: { x: 4, y: 10 }, c: { x: 20, y: 10 }, b: { x: 36, y: 10 }, tone, fade: 0.5 }]);
  const at = (x: number, y: number) => art.pix[y * 40 + x];
  assert.equal(at(8, 9), tone.light, "top row lit");
  assert.equal(at(8, 10), tone.base, "bottom row in its colour");
  assert.equal(at(8, 8), rgb("#000000"), "outlined above");
  assert.equal(at(8, 11), rgb("#000000"), "and below");
  const solid = [9, 10, 11, 12].filter((x) => art.pix[9 * 40 + x] && art.pix[10 * 40 + x]).length;
  const tail = [30, 31, 32, 33].filter((x) => at(x, 9) !== 0 || at(x, 10) !== 0).length;
  assert.equal(solid, 4);
  assert.ok(tail < 4, "the tail breaks up");
  assert.equal(at(34, 8), 0, "no outline round the scattered tail");
});
