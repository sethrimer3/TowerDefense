import { test } from "node:test";
import assert from "node:assert/strict";
import { STRUCTURES } from "../src/defend/catalog.ts";
import { tileKey } from "../src/defend/grid.ts";
import { cityTileSet, defaultLayout, placeCityTile, placeStructure, type Layout } from "../src/defend/layout.ts";
import { dragIcon, dropGhost, legalLayouts, liftsCityTile, refusal, type Drag } from "../src/defend/drag-rules.ts";

// A small city: the keep with a tile either side, and a two-tile spur above
// it whose lower tile holds the upper one on. A barracks stands left of the keep.
function city(): Layout {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [x, y] of [[tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty - 2]]) l = placeCityTile(l, x, y)!;
  return placeStructure(l, "barracks", tx - 1, ty)!;
}
const L = city();
const { tx: KX, ty: KY } = L.keep;

test("dragIcon names what a drag carries", () => {
  assert.equal(dragIcon({ from: "palette", item: "watchTower" }), "watchTower");
  assert.equal(dragIcon({ from: "structure", uid: 1, kind: "barracks" }), "barracks");
  assert.equal(dragIcon({ from: "cityTile", tile: { tx: 1, ty: 1 } }), "cityTile");
  assert.equal(dragIcon({ from: "keep" }), "keep");
  assert.equal(dragIcon({ from: "bomb" }), "bomb");
});

test("legalLayouts lists the layouts a drop makes, tile by tile", () => {
  assert.equal(legalLayouts({ from: "bomb" }, L).size, 0);
  const tiles = cityTileSet(L);
  const fresh = legalLayouts({ from: "palette", item: "cityTile" }, L);
  assert.ok(fresh.size > 0);
  for (const [key, next] of fresh) {
    const [x, y] = key.split(",").map(Number);
    assert.ok(!tiles.has(key) && y !== 0, key);
    assert.ok(next.cityTiles.includes(key));
  }
  // City tiles may stand anywhere, apart from the city too.
  assert.ok(fresh.has(tileKey(0, KY - 4)), "a tile apart from the city");
  // A tile carried with its barracks takes it along.
  const carried = legalLayouts({ from: "cityTile", tile: { tx: KX - 1, ty: KY } }, L).get(tileKey(KX - 3, KY - 3));
  assert.ok(carried, "the barracks' tile lands apart from the city");
  assert.deepEqual(carried!.structures.map((s) => [s.kind, s.tx, s.ty]), [["barracks", KX - 3, KY - 3]]);
  // Dropping the keep or a city tile back where it was changes nothing.
  assert.equal(legalLayouts({ from: "keep" }, L).get(tileKey(KX, KY)), L);
  assert.equal(legalLayouts({ from: "cityTile", tile: { tx: KX, ty: KY - 2 } }, L).get(tileKey(KX, KY - 2)), L);
});

test("dropGhost outlines a city tile, or the fitted structure", () => {
  const tile: Drag = { from: "palette", item: "cityTile" };
  const [key, next] = [...legalLayouts(tile, L)][0];
  const [x, y] = key.split(",").map(Number);
  assert.deepEqual(dropGhost(tile, next, key), { rect: { x: x * 7, y: y * 7, w: 7, h: 7 }, kind: "cityTile" });
  const tower: Drag = { from: "palette", item: "archerTower" };
  const [tkey, tnext] = [...legalLayouts(tower, L)][0];
  assert.equal(dropGhost(tower, tnext, tkey)?.kind, "archerTower");
});

test("refusal explains why a tile turns a drop away", () => {
  const far = tileKey(0, KY - 4);
  assert.match(refusal({ from: "keep" }, L, tileKey(KX, 0)), /top row/);
  assert.equal(refusal({ from: "palette", item: "cityTile" }, L, tileKey(KX, KY)), "That tile is already part of the city.");
  assert.match(refusal({ from: "palette", item: "cityTile" }, L, tileKey(KX, 0)), /top row/);
  assert.equal(refusal({ from: "cityTile", tile: { tx: KX + 1, ty: KY } }, L, tileKey(KX, KY)), "That tile is already part of the city.");
  assert.equal(refusal({ from: "keep" }, L, far), "What stands on the keep's tile doesn't fit there.");
  assert.equal(refusal({ from: "palette", item: "barracks" }, L, far), `The ${STRUCTURES.barracks.name.toLowerCase()} must go inside the city limits.`);
  assert.equal(refusal({ from: "structure", uid: 1, kind: "barracks" }, L, far), `The ${STRUCTURES.barracks.name.toLowerCase()} must go inside the city limits.`);
  assert.equal(refusal({ from: "palette", item: "archerTower" }, L, far), "There isn't room for that there.");
  assert.equal(refusal({ from: "palette", item: "barracks" }, L, tileKey(KX, KY - 1)), "There isn't room for that there.");
});

test("any city tile but the keep's lifts, with what stands on it", () => {
  assert.equal(liftsCityTile(L, { tx: KX + 1, ty: KY }), true);
  assert.equal(liftsCityTile(L, { tx: KX, ty: KY - 2 }), true);
  assert.equal(liftsCityTile(L, { tx: KX - 1, ty: KY }), true, "holds the barracks, which goes along");
  assert.equal(liftsCityTile(L, { tx: KX, ty: KY - 1 }), true, "holds the spur on, which may split off");
  assert.equal(liftsCityTile(L, { tx: KX, ty: KY }), false, "the keep's own tile");
  assert.equal(liftsCityTile(L, { tx: 0, ty: KY - 4 }), false, "not a city tile");
});
