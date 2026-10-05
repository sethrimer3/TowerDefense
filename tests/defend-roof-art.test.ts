import { test } from "node:test";
import assert from "node:assert/strict";
import { chimneyFlue, roofPixels } from "../src/defend/roof-art.ts";
import { ART } from "../src/defend/park-art.ts";

const OUTLINE = 0xff07090b; // 0x0b0907 as little-endian RGBA

test("a roof fills its cells inside a black outline, with a black ridge", () => {
  for (const [cw, ch] of [[1, 1], [2, 1], [1, 3], [3, 2]]) {
    const W = cw * ART, H = ch * ART, px = roofPixels(cw, ch, 2, 7);
    assert.equal(px.length, W * H);
    for (let x = 1; x <= W - 3; x++) assert.equal(px[W + x], OUTLINE, `top edge ${cw}x${ch} at ${x}`), assert.equal(px[(H - 3) * W + x], OUTLINE);
    for (let y = 1; y <= H - 3; y++) assert.equal(px[y * W + 1], OUTLINE), assert.equal(px[y * W + W - 3], OUTLINE);
    // The one-pixel gap round the lot stays clear.
    for (let x = 0; x < W; x++) assert.equal(px[x], 0);
  }
});

test("each house keeps its own roof: the same seed paints the same pixels, others differ", () => {
  assert.deepEqual(roofPixels(3, 2, 1, 99), roofPixels(3, 2, 1, 99));
  let differ = 0;
  for (let s = 0; s < 20; s++) if (roofPixels(3, 2, 1, s).some((v, i) => v !== roofPixels(3, 2, 1, s + 100)[i])) differ++;
  assert.equal(differ, 20);
});

test("a chimney's smoke rises from its flue: chimneyFlue names the stack's dark flue pixel", () => {
  const FLUE = 0xff1c222a; // 0x2a221c as little-endian RGBA
  let found = 0;
  for (const [cw, ch] of [[2, 1], [1, 2], [3, 2], [2, 3], [1, 1]])
    for (let s = 0; s < 60; s++) {
      const at = chimneyFlue(cw, ch, s), px = roofPixels(cw, ch, 0, s), W = cw * ART;
      if (!at) {
        assert.ok(!px.includes(FLUE), `no flue drawn without a chimney ${cw}x${ch} seed ${s}`);
        continue;
      }
      found++;
      assert.equal(px[at.y * W + at.x], FLUE, `flue at ${cw}x${ch} seed ${s}`);
    }
  assert.ok(found > 10);
});
