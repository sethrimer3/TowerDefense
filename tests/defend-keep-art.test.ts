import { test } from "node:test";
import assert from "node:assert/strict";
import { FLAG_W, FLAG_H, flagPixels, keepPixels } from "../src/defend/structure-art.ts";
import { ART } from "../src/defend/park-art.ts";

test("the keep's pixel art fills its three cells and mirrors left to right", () => {
  const n = 3 * ART, px = keepPixels();
  assert.equal(px.length, n * n);
  // The turrets and walls are symmetric; the courtyard speckle, tower shading
  // and gate seam are not, so compare which pixels are drawn at all.
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) assert.equal(px[y * n + x] !== 0, px[y * n + (n - 1 - x)] !== 0, `pixel ${x},${y}`);
});

test("the banner waves over time and holds still under reduced motion", () => {
  const a = flagPixels(0.1, false), b = flagPixels(0.4, false);
  assert.equal(a.length, FLAG_W * FLAG_H);
  assert.notDeepEqual(a, b);
  assert.deepEqual(flagPixels(0.1, true), flagPixels(3.7, true));
});
