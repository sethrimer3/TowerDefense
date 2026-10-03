import { test } from "node:test";
import assert from "node:assert/strict";
import { damageStage, wallDamagePixels, wallRubblePixels } from "../src/defend/damage-art.ts";
import { structurePixels, structureRubblePixels, type PlacedKind } from "../src/defend/tower-art.ts";
import { houseDamagePixels, houseRubblePixels } from "../src/defend/roof-art.ts";
import { ART } from "../src/defend/park-art.ts";

const OUTLINE = 0xff07090b; // 0x0b0907 as little-endian RGBA

test("damage stages fall at 75%, 50% and 25% of hit points", () => {
  assert.deepEqual([100, 75, 74, 50, 49, 25, 24, 1].map((hp) => damageStage(hp, 100)), [0, 0, 1, 1, 2, 2, 3, 3]);
});

const SPRITES: [string, number, number, (stage: number) => Uint32Array, () => Uint32Array][] = [
  ...(([["barracks", 3, 4], ["barracks", 4, 3], ["archerBarracks", 3, 3], ["archerTower", 2, 2], ["cannonTower", 2, 2], ["watchTower", 2, 2], ["wizardTower", 2, 2], ["mageGuild", 3, 3], ["valkyriePalace", 5, 5], ["valkyriePalace", 3, 5], ["valkyriePalace", 5, 3], ["darkKeep", 12, 12], ["darkKeep", 5, 5]] as [PlacedKind, number, number][]).map(
    ([k, w, h]) => [`${k} ${w}×${h}`, w, h, (s: number) => structurePixels(k, w, h, s, 41), () => structureRubblePixels(k, w, h, 41)] as const,
  )),
  ["house 4×2", 4, 2, (s) => houseDamagePixels(4, 2, 1, 9, s), () => houseRubblePixels(4, 2, 1, 9)],
  ["house 2×3", 2, 3, (s) => houseDamagePixels(2, 3, 3, 17, s), () => houseRubblePixels(2, 3, 3, 17)],
];

for (const [name, w, h, at, rubble] of SPRITES)
  test(`${name}: each damage stage changes it without uncovering anything, and it falls to outlined rubble`, () => {
    const whole = at(0);
    assert.equal(whole.length, w * ART * h * ART);
    assert.ok(whole.some((v) => v === OUTLINE), "outlined");
    let last = whole;
    for (let s = 1; s <= 3; s++) {
      const px = at(s);
      assert.notDeepEqual(px, last, `stage ${s}`);
      for (let i = 0; i < whole.length; i++) assert.equal(!!px[i], !!whole[i], `stage ${s} pixel ${i}`);
      last = px;
    }
    assert.deepEqual(at(2), at(2));
    const r = rubble();
    assert.equal(r.length, whole.length);
    assert.ok(r.some((v) => v === OUTLINE));
    assert.ok(r.filter((v) => v).length > whole.length * 0.25);
    assert.notDeepEqual(r, at(3));
  });

test("wall stones crack over the stages and fall to rubble", () => {
  const drawn = (px: Uint32Array) => px.filter((v) => v).length;
  assert.equal(drawn(wallDamagePixels(0, 3, ART)), 0);
  assert.ok(drawn(wallDamagePixels(1, 3, ART)) > 0);
  assert.ok(drawn(wallDamagePixels(3, 3, ART)) > drawn(wallDamagePixels(1, 3, ART)));
  assert.ok(drawn(wallRubblePixels(3, ART)) > 8);
});
