// Ore glinting near the Mine's lit workings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AIR, CELLS, COPPER, GOLD, STONE, W, idx } from "../src/mine/world.ts";
import { FRAMES, SPARKLE, sparkleFrame, sparkleSites } from "../src/mine/ore-sparkle.ts";

/** A slab of stone under a surface at row 10, one lit air cell at (100, 100),
 * and ore everywhere along row 100 and down column 100. */
function slab() {
  const cells = new Uint8Array(CELLS).fill(STONE), warm = new Float32Array(CELLS), surface = new Array(W).fill(10);
  for (let x = 0; x < W; x++) cells[idx(x, 100)] = COPPER;
  for (let y = 101; y < 200; y++) cells[idx(100, y)] = GOLD;
  cells[idx(100, 100)] = AIR;
  warm[idx(100, 100)] = 1;
  return { cells, warm, surface };
}

test("only ore within reach of a lit passage glints, nearer brighter", () => {
  const { cells, warm, surface } = slab();
  const sites = sparkleSites(cells, warm, surface, 7);
  assert.ok(sites.cells.length > 0, "some ore glints");
  for (let n = 0; n < sites.cells.length; n++) {
    const i = sites.cells[n], x = i % W, y = (i / W) | 0;
    assert.ok(cells[i] === COPPER || cells[i] === GOLD);
    assert.ok(Math.max(Math.abs(x - 100), Math.abs(y - 100)) * 2 <= SPARKLE.reach, `(${x}, ${y}) in reach`);
    assert.ok(sites.near[n] > 0 && sites.near[n] <= 1);
  }
  const at = (x: number) => [...sites.cells].indexOf(idx(x, 100));
  const close = [...sites.cells].findIndex((i) => Math.abs((i % W) - 100) <= 2);
  const far = [...sites.cells].findIndex((i) => Math.abs((i % W) - 100) >= 12 && ((i / W) | 0) === 100);
  if (close >= 0 && far >= 0) assert.ok(sites.near[close] > sites.near[far]);
  assert.equal(at(140), -1, "ore 40 cells off never glints");
});

test("unlit or surface passages make no ore glint", () => {
  const { cells, warm, surface } = slab();
  warm[idx(100, 100)] = SPARKLE.lit / 2;
  assert.equal(sparkleSites(cells, warm, surface, 7).cells.length, 0, "a hat lamp alone");
  warm[idx(100, 100)] = 1;
  surface.fill(150);
  assert.equal(sparkleSites(cells, warm, surface, 7).cells.length, 0, "above the ground line");
});

test("each glint is a short run of frames between long rests", () => {
  let shown = 0, total = 0;
  for (let t = 0; t < 60_000; t += 10) {
    const f = sparkleFrame(5, 9, 3, t);
    assert.ok(f >= -1 && f < FRAMES.length);
    if (f >= 0) shown++;
    total++;
  }
  const share = shown / total;
  assert.ok(share > 0.05 && share < 0.25, `glints gently (${share.toFixed(3)})`);
});
