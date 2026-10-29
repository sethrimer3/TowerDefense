import { test } from "node:test";
import assert from "node:assert/strict";
import { silhouette, stripOutline } from "../src/defend/unit-outline.ts";

/** RGBA pixels from rows: "." clear, "0" outline black, "d" a dark body
 * colour, "g" green. */
function sprite(rows: string[]) {
  const colors: Record<string, number[]> = { ".": [0, 0, 0, 0], "0": [20, 12, 10, 255], d: [60, 40, 30, 255], g: [80, 160, 60, 255] };
  const h = rows.length, w = rows[0].length, d = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => d.set(colors[ch], (y * w + x) * 4)));
  return { d, w, h };
}
const rowsOf = (d: Uint8ClampedArray, w: number, h: number) =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (d[(y * w + x) * 4 + 3] ? (d[(y * w + x) * 4 + 1] > 100 ? "g" : d[(y * w + x) * 4] > 48 ? "d" : "0") : ".")).join(""));

test("a sprite's outer black ring comes off, its inner black stays", () => {
  const { d, w, h } = sprite([
    ".0000.",
    "0gggg0",
    "0g00g0",
    "0gggg0",
    ".0000.",
  ]);
  assert.equal(stripOutline(d, w, h), 14);
  assert.deepEqual(rowsOf(d, w, h), [
    "......",
    ".gggg.",
    ".g00g.",
    ".gggg.",
    "......",
  ]);
});

test("dark but coloured edges and the image's border count", () => {
  const { d, w, h } = sprite(["0dg", "ggg"]);
  stripOutline(d, w, h);
  assert.deepEqual(rowsOf(d, w, h), [".dg", "ggg"]);
});

test("a sprite's silhouette is its solid pixels, ring and all, in the outline's colour", () => {
  const { d, w, h } = sprite(["..0.", ".0g0", "..0."]);
  d[3] = 100; // a faint pixel stays out
  const out = silhouette(d, w, h);
  const solid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (out[(y * w + x) * 4 + 3] ? "#" : ".")).join(""));
  assert.deepEqual(solid, ["..#.", ".###", "..#."]);
  assert.deepEqual([...out.slice(8, 12)], [0x14, 0x0c, 0x0a, 255]);
});


test("world art has eight pixels per cell and visibility rims are half an art pixel", async () => {
  const { ART, UNIT_CONTOUR_ART_PIXELS, DARK_UNIT_INK, PLAYER_UNIT_INK } = await import('../src/defend/art-scale.ts');
  const { ART: parkArt } = await import('../src/defend/park-art.ts');
  assert.equal(ART, 8); assert.equal(parkArt, ART);
  assert.equal(UNIT_CONTOUR_ART_PIXELS / ART, 1 / 16);
  assert.notEqual(DARK_UNIT_INK, PLAYER_UNIT_INK);
});
