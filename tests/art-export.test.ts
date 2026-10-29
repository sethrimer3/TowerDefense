import { test } from "node:test";
import assert from "node:assert/strict";
import { artPieces } from "../src/defend/art-export.ts";
import { ART_NAMES, artOverride, setArtOverride } from "../src/defend/art-overrides.ts";
import { bare, rimmed, rgba, OUTLINE } from "../src/defend/damage-art.ts";
import { keepPixels } from "../src/defend/structure-art.ts";
import { structurePixels } from "../src/defend/tower-art.ts";
import { setPixelArt } from "../src/defend/pixel-sprites.ts";

const INK = rgba(OUTLINE), RED = rgba(0xc03030), DARK = rgba(0x101010);

test("bare takes the outer outline off and keeps inner lines", () => {
  // A 4 × 4 box: a dark ring round a red middle with one dark pixel in it.
  const px = new Uint32Array(16).fill(DARK);
  for (const i of [5, 6, 9]) px[i] = RED;
  const out = bare(px, 4, 4);
  for (let i = 0; i < 16; i++) assert.equal(out[i], [5, 6, 9, 10].includes(i) ? px[i] : 0, `pixel ${i}`);
  assert.equal(out[10], DARK, "the inner dark pixel stays");
});

test("rimmed gives an outline-free sprite back its one-art-pixel rim", () => {
  const px = new Uint32Array(16).fill(RED);
  const out = rimmed(px, 4, 4);
  for (let i = 0; i < 16; i++) assert.equal(out[i], [5, 6, 9, 10].includes(i) ? RED : INK, `pixel ${i}`);
});

test("every exported piece is named once, sized right and drawn", () => {
  const pieces = artPieces(), names = new Set<string>();
  assert.ok(pieces.length > 200);
  for (const p of pieces) {
    assert.ok(!names.has(p.name), p.name);
    names.add(p.name);
    const px = p.pixels();
    assert.equal(px.length, p.w * p.h, p.name);
    assert.ok(px.some((v) => v >>> 24 >= 128), `${p.name} draws something`);
  }
});

test("an artist's sprite stands in for the drawn one, damage still drawn over it", () => {
  const name = ART_NAMES.structure("archerTower", 2, 2), w = 16, h = 16;
  const own = new Uint32Array(w * h).fill(RED);
  setArtOverride(name, { data: own, w, h });
  try {
    assert.deepEqual(structurePixels("archerTower", 2, 2, 0, 0), rimmed(own, w, h), "drawn with its rim");
    assert.notDeepEqual(structurePixels("archerTower", 2, 2, 3, 7), rimmed(own, w, h), "damage is painted over it");
    setPixelArt(false);
    assert.notDeepEqual(structurePixels("archerTower", 2, 2, 0, 0), rimmed(own, w, h), "the Pixel Art setting turns it off");
    setPixelArt(true);
    setArtOverride(name, { data: new Uint32Array(4), w: 2, h: 2 });
    assert.equal(artOverride(name, w, h), null, "a sprite of the wrong size is ignored");
    setArtOverride(ART_NAMES.keep, { data: new Uint32Array(24 * 24).fill(RED), w: 24, h: 24 });
    assert.equal(keepPixels(0)[100], RED);
  } finally {
    setArtOverride(name, null);
    setArtOverride(ART_NAMES.keep, null);
    setPixelArt(true);
  }
});
