import { test } from "node:test";
import assert from "node:assert/strict";
import { MODE_ICON_SIZE, modeIconPixels } from "../src/ui/mode-icons.ts";

const N = MODE_ICON_SIZE;

test("mode icons are opaque pixel art inside a black outline", () => {
  for (const mode of ["ambush", "siege"] as const) {
    const px = modeIconPixels(mode);
    assert.equal(px.length, N * N);
    const filled = px.filter(v => v !== 0);
    assert.ok(filled.length > N * N * 0.3, `${mode} fills enough of its square`);
    assert.ok(filled.every(v => v >>> 24 === 0xff), `${mode} is opaque`);
    // Every pixel against the empty background is outline black.
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const v = px[y * N + x];
        if (!v || v === 0xff0c0a0a) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < N && ny < N) assert.notEqual(px[ny * N + nx], 0, `${mode} ${x},${y} touches the background`);
        }
      }
  }
});

test("mode icons differ and are stable", () => {
  assert.notDeepEqual(modeIconPixels("ambush"), modeIconPixels("siege"));
  assert.deepEqual(modeIconPixels("siege"), modeIconPixels("siege"));
});
