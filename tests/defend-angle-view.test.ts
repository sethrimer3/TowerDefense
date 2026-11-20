// Angle view's south faces (`facePixels` in city-layer.ts): each column of a
// building's art hangs a face from its lowest pixel, a row left for the
// roof's outline, only in the columns kept, and nothing for empty art.
import test from "node:test";
import assert from "node:assert/strict";
import { angled, facePixels, setAngleView, wallFaces } from "../src/defend/city-layer.ts";

/** RGBA art `w` × `h` with the given opaque pixels. */
function art(w: number, h: number, solid: (x: number, y: number) => boolean) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) a.set([150, 90, 60, 255], (y * w + x) * 4);
  return a;
}
const opaque = (out: Uint32Array, w: number, x: number, y: number) => out[y * w + x] >>> 24 === 255;

test("a face hangs below each column's lowest pixel", () => {
  // A cross: the arms end higher than the middle.
  const w = 12, h = 24, src = art(w, h, (x, y) => (x >= 4 && x < 8 && y >= 2 && y < 10) || (y >= 4 && y < 6 && x >= 1 && x < 11));
  for (const style of ["house", "keep", "tower", "hall", "wall"] as const) {
    const out = facePixels(src, w, h, 5, style, 7)!;
    // The middle hangs from row 9: row 10 is the roof's outline, 11..14 the face.
    assert.ok(!opaque(out, w, 5, 10) && opaque(out, w, 5, 11) && opaque(out, w, 5, 14) && !opaque(out, w, 5, 15), style);
    // An arm hangs from row 5.
    assert.ok(!opaque(out, w, 2, 6) && opaque(out, w, 2, 7) && opaque(out, w, 2, 10) && !opaque(out, w, 2, 11), style);
    // Nothing over the art itself, or where there is no art above.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src[(y * w + x) * 4 + 3]) assert.ok(!opaque(out, w, x, y));
    for (let y = 0; y < h; y++) assert.ok(!opaque(out, w, 0, y) && !opaque(out, w, 11, y));
  }
});

test("only kept columns hang a face, and empty art has none", () => {
  const w = 10, h = 16, src = art(w, h, (_x, y) => y >= 2 && y < 6);
  const out = facePixels(src, w, h, 4, "wall", 1, (x) => x < 3)!;
  assert.ok(opaque(out, w, 1, 7) && !opaque(out, w, 5, 7));
  assert.equal(facePixels(art(w, h, () => false), w, h, 4, "hall", 1), null);
});

test("Angle view hangs the walls' faces too", () => {
  setAngleView(false);
  assert.equal(angled(), false);
  assert.equal(wallFaces(), false);
  setAngleView(true);
  assert.equal(wallFaces(), true);
  setAngleView(false);
});
