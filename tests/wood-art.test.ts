import test from "node:test";
import assert from "node:assert/strict";
import { drawWood, woodSeed, WOOD_PALETTE } from "../src/ui/wood-art.ts";
import { woodSelectors } from "../src/ui/wood-painter.ts";

test("a board of any size is the same for the same seed, in palette shades", () => {
  for (const [w, h] of [[1, 1], [7, 3], [40, 20], [55, 450], [600, 30]]) {
    const a = drawWood(w, h, woodSeed(`${w}x${h}`));
    const b = drawWood(w, h, woodSeed(`${w}x${h}`));
    assert.equal(a.length, w * h);
    assert.deepEqual(a, b);
    assert.ok(a.every((s) => s < WOOD_PALETTE.length));
  }
});

test("a tall board does not repeat itself down its length", () => {
  const w = 55, h = 450, px = drawWood(w, h, woodSeed("tall"));
  const block = (y: number) => px.subarray(y * w, (y + 24) * w).join(",");
  const blocks = new Set<string>();
  for (let y = 0; y + 24 <= h; y += 24) blocks.add(block(y));
  assert.equal(blocks.size, Math.floor(h / 24));
});

test("only rules that use var(--wood) are painted, without pseudo-elements", () => {
  const got = woodSelectors([
    { selectorText: ":root", cssText: ":root { --wood: url(a.svg); }" },
    { selectorText: "nav button, .panel::before, .x:after", cssText: "nav button { background: var(--wood), #000; }" },
    { selectorText: ".card", cssText: ".card { background: var(--stone); }" },
  ]);
  assert.deepEqual(got, ["nav button"]);
});
