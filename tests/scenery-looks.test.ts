import { test } from "node:test";
import assert from "node:assert/strict";
import { setSceneryOutlines, setStillAir, stirWind, windAt, windInCell } from "../src/defend/scenery-looks.ts";
import { outlinedSprite, treeSprite } from "../src/defend/forest-art.ts";
import { CELLS_W, SUB } from "../src/defend/grid.ts";

const INK = 0xff07090b; // 0x0b0907 as little-endian RGBA

test("scenery outlines can be turned off, keeping the sprite's placement", () => {
  const inked = outlinedSprite(treeSprite("oak", 0, 0, 1));
  assert.ok(inked.px.includes(INK));
  setSceneryOutlines(false);
  try {
    const bare = outlinedSprite(treeSprite("oak", 0, 0, 1));
    assert.equal(bare.px.includes(INK), false);
    assert.deepEqual([bare.w, bare.h, bare.ox, bare.oy], [inked.w, inked.h, inked.ox, inked.oy]);
    assert.ok(bare.px.some((p) => p !== 0));
  } finally {
    setSceneryOutlines(true);
  }
});

test("still air: the wind reaches only cells near enemies, rising and settling", () => {
  assert.equal(windAt(10, 10), 1);
  setStillAir(true);
  try {
    assert.equal(windAt(10, 10), 0);
    const enemy = { x: 2 * SUB + 4, y: 2 * SUB + 4 };
    for (let k = 0; k < 60; k++) stirWind([enemy], 1 / 30);
    assert.ok(windAt(enemy.x, enemy.y) > 0.9);
    assert.equal(windAt(10 * SUB, 10 * SUB), 0);
    assert.ok(windInCell(Math.floor(enemy.y) * CELLS_W + Math.floor(enemy.x)) > 0.9);
    // Past the board's edge, the wind fades out over a tile.
    assert.ok(windAt(-SUB * 2, enemy.y) === 0);
    for (let k = 0; k < 10; k++) stirWind([], 1 / 30);
    const settling = windAt(enemy.x, enemy.y);
    assert.ok(settling > 0 && settling < 0.9);
    for (let k = 0; k < 600; k++) stirWind([], 1 / 30);
    assert.equal(windAt(enemy.x, enemy.y), 0);
  } finally {
    setStillAir(false);
  }
});
