import { test } from "node:test";
import assert from "node:assert/strict";
import { FLAG_W, FLAG_H, flagPixels, keepPixels, keepRubblePixels, keepStage } from "../src/defend/structure-art.ts";
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

test("the keep's damage stages follow its hit points", () => {
  assert.deepEqual([100, 80, 79, 60, 59, 40, 39, 20, 19, 0].map((hp) => keepStage(hp, 100)), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test("each damage stage changes the keep and never uncovers what it stood over", () => {
  const n = 3 * ART, whole = keepPixels(0);
  let last = whole;
  for (let s = 1; s <= 4; s++) {
    const px = keepPixels(s);
    assert.equal(px.length, n * n);
    assert.notDeepEqual(px, last, `stage ${s}`);
    for (let i = 0; i < whole.length; i++) if (whole[i]) assert.ok(px[i], `stage ${s} pixel ${i}`);
    last = px;
  }
  assert.deepEqual(keepPixels(3), keepPixels(3));
});

test("the fallen keep is rubble: drawn, outlined, and nothing like the keep", () => {
  const n = 3 * ART, rubble = keepRubblePixels(), outline = keepPixels(0)[1 * n + 1];
  assert.equal(rubble.length, n * n);
  const drawn = rubble.filter((v) => v !== 0).length;
  assert.ok(drawn > n * n * 0.7, `${drawn} pixels drawn`);
  assert.ok(rubble.some((v) => v === outline));
  assert.notDeepEqual(rubble, keepPixels(4));
});
