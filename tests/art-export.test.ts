import { test } from "node:test";
import assert from "node:assert/strict";
import { artPieces } from "../src/defend/art-export.ts";
import { ART_NAMES, artOverride, setArtOverride } from "../src/defend/art-overrides.ts";
import { bare, outlinePixels, rgba, OUTLINE } from "../src/defend/damage-art.ts";
import { keepPixels } from "../src/defend/structure-art.ts";
import { structurePixels } from "../src/defend/tower-art.ts";
import { bumpPixelArt, setPixelArt } from "../src/defend/pixel-sprites.ts";

const INK = rgba(OUTLINE),
  RED = rgba(0xc03030),
  DARK = rgba(0x101010);
const pieces = artPieces();
// Seth explicitly keeps dark materials (including the all-black Darklings).
// Detect the actual painters' outline inks, not arbitrary dark body colors.
const inks = new Set(
  [0x0b0907, 0x140c0a, 0x120e0a, 0x120c0a, 0x07050a, 0x07060a, 0x201b2b, 0x120e12, 0x0b1628].map((c) => rgba(c)),
);

test("legacy bare helper keeps interior detail; live sources do not need it", () => {
  const px = new Uint32Array(16).fill(DARK);
  for (const i of [5, 6, 9]) px[i] = RED;
  const out = bare(px, 4, 4);
  for (let i = 0; i < 16; i++) assert.equal(out[i], [5, 6, 9, 10].includes(i) ? px[i] : 0);
});

test("a single art pixel gets a one-art-pixel outside ring with an unchanged body", () => {
  const px = new Uint32Array([RED]),
    out = outlinePixels(px, 1, 1);
  assert.deepEqual([out.w, out.h, out.pad, out.scale], [3, 3, 1, 1]);
  assert.deepEqual([...out.data], [INK, INK, INK, INK, RED, INK, INK, INK, INK]);
  assert.deepEqual([...px], [RED]);
  assert.equal(outlinePixels(new Uint32Array([DARK]), 1, 1).data[4], DARK, "dark materials survive");
});

test("outline ink/width, transparent holes, corners and half-pixel widths", () => {
  const blue = 0x1234aa;
  const wide = outlinePixels(new Uint32Array([RED]), 1, 1, blue, 2);
  assert.deepEqual([wide.w, wide.h], [5, 5]);
  assert.equal(wide.data.filter((v) => v === rgba(blue)).length, 24);
  assert.equal(wide.data[12], RED);
  const half = outlinePixels(new Uint32Array([RED]), 1, 1, OUTLINE, 0.5);
  assert.deepEqual([half.w, half.h, half.pad, half.scale], [4, 4, 1, 2]);
  assert.equal(half.data.filter((v) => v === RED).length, 4);
  const faint = outlinePixels(new Uint32Array([rgba(0, 80)]), 1, 1);
  assert.equal(faint.data.filter((v) => v === INK).length, 0, "shadows never grow a ring");
  const hole = outlinePixels(new Uint32Array([RED, RED, RED, RED, 0, RED, RED, RED, RED]), 3, 3);
  assert.equal(hole.data[2 * hole.w + 2], INK, "a hole has its own silhouette edge");
  assert.throws(() => outlinePixels(new Uint32Array(1), 2, 2));
  assert.throws(() => outlinePixels(new Uint32Array(1), 1, 1, OUTLINE, 0.25));
});

test("every source is uniquely named, correctly sized, drawn, and free of baked outline strokes", () => {
  const names = new Set<string>();
  assert.ok(pieces.length > 1000);
  for (const p of pieces) {
    assert.ok(!names.has(p.name), p.name);
    names.add(p.name);
    const px = p.pixels();
    assert.equal(px.length, p.w * p.h, p.name);
    assert.ok(p.allowEmpty || px.some((v) => v >>> 24 >= 128), `${p.name} draws something`);
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < p.w && y < p.h && px[y * p.w + x] >>> 24 >= 128;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const v = px[y * p.w + x];
        if (p.joined || !inks.has(v)) continue;
        assert.ok(
          solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1),
          `${p.name}: baked ink at (${x},${y})`,
        );
      }
  }
  for (const prefix of [
    "structures/",
    "keep/",
    "houses/",
    "gates/",
    "walls/",
    "units/",
    "enemies/",
    "scenery/",
    "projectiles/",
    "effects/",
    "banners/",
  ])
    assert.ok(
      pieces.some((p) => p.name.startsWith(prefix)),
      prefix,
    );
});

test("every exported source can be replaced by its named PNG pixels", () => {
  for (const p of pieces) {
    const own = new Uint32Array(p.w * p.h).fill(RED);
    setArtOverride(p.name, { data: own, w: p.w, h: p.h });
    bumpPixelArt();
    try {
      assert.deepEqual(p.pixels(), own, p.name);
    } finally {
      setArtOverride(p.name, null);
      bumpPixelArt();
    }
  }
});

test("PNG source pixels stay bare; damage and settings apply equally to both sources", () => {
  const name = ART_NAMES.structure("archerTower", 2, 2),
    own = new Uint32Array(256).fill(RED);
  setArtOverride(name, { data: own, w: 16, h: 16 });
  try {
    assert.deepEqual(structurePixels("archerTower", 2, 2), own);
    assert.notDeepEqual(structurePixels("archerTower", 2, 2, 3, 7), own);
    setPixelArt(false);
    assert.notDeepEqual(structurePixels("archerTower", 2, 2), own);
    setPixelArt(true);
    setArtOverride(name, { data: new Uint32Array(4), w: 2, h: 2 });
    assert.equal(artOverride(name, 16, 16), null);
    setArtOverride(ART_NAMES.keep, { data: new Uint32Array(576).fill(RED), w: 24, h: 24 });
    assert.equal(keepPixels()[100], RED);
  } finally {
    setArtOverride(name, null);
    setArtOverride(ART_NAMES.keep, null);
    setPixelArt(true);
  }
});
