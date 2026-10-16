import { test } from "node:test";
import assert from "node:assert/strict";
import { STRUCTURES } from "../src/defend/catalog.ts";
import { SUB, tileKey } from "../src/defend/grid.ts";
import { cityTileSet, defaultLayout, placeCityTile, placeStructure, type Layout } from "../src/defend/layout.ts";
import { dragIcon, dropGhost, legalLayouts, liftsCityTile, refusal, structureKey, structureLayout, type Drag } from "../src/defend/drag-rules.ts";

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
  assert.deepEqual(dropGhost(tile, next, key), { rect: { x: x * SUB, y: y * SUB, w: SUB, h: SUB }, kind: "cityTile" });
  // A structure is keyed by its top left quarter, and outlined on its quarters.
  const tower: Drag = { from: "palette", item: "archerTower" };
  const tkey = `${KX * 4},${(KY - 2) * 4}`;
  const tnext = structureLayout(tower, L, tkey)!;
  assert.ok(tnext);
  assert.deepEqual(dropGhost(tower, tnext, tkey), { rect: { x: KX * SUB, y: (KY - 2) * SUB, w: 2, h: 2 }, kind: "archerTower" });
});

test("refusal explains why a tile turns a drop away", () => {
  const far = tileKey(0, KY - 4);
  assert.match(refusal({ from: "keep" }, L, tileKey(KX, 0)), /top row/);
  assert.equal(refusal({ from: "palette", item: "cityTile" }, L, tileKey(KX, KY)), "That tile is already part of the city.");
  assert.match(refusal({ from: "palette", item: "cityTile" }, L, tileKey(KX, 0)), /top row/);
  assert.equal(refusal({ from: "cityTile", tile: { tx: KX + 1, ty: KY } }, L, tileKey(KX, KY)), "That tile is already part of the city.");
  assert.equal(refusal({ from: "keep" }, L, far), "What stands on the keep's tile doesn't fit there.");
  // A structure is refused a spot (keyed by its top left quarter) for the fit's own reason.
  const farQ = `0,${(KY - 4) * 4}`;
  assert.equal(refusal({ from: "palette", item: "barracks" }, L, farQ), `${STRUCTURES.barracks.name} must be inside the city limits.`);
  assert.equal(refusal({ from: "structure", uid: 1, kind: "barracks" }, L, farQ), `${STRUCTURES.barracks.name} must be inside the city limits.`);
  assert.match(refusal({ from: "palette", item: "archerTower" }, L, "0,0"), /top row/);
  const b = L.structures[0];
  assert.equal(refusal({ from: "palette", item: "watchTower" }, L, `${b.qx},${b.qy}`), "There's something standing there already.");
  assert.equal(refusal({ from: "palette", item: "watchTower" }, L, `${b.qx + 2},${b.qy}`), "Buildings need a clear square between them.");
  assert.equal(refusal({ from: "palette", item: "barracks" }, L, `${KX * 4 + 3},${(KY - 2) * 4}`), "The barracks must fit inside one tile.");
});

test("a carried structure is centred on the pointer, on whole quarters", () => {
  const tower: Drag = { from: "palette", item: "watchTower" };
  assert.equal(structureKey(tower, L, 10.9, 20.2), "5,10", "a one-quarter tower takes the quarter under the pointer");
  const guild: Drag = { from: "palette", item: "meleeGuild" };
  assert.equal(structureKey(guild, L, 10, 20), "4,9", "a 2 × 2 guild is centred on it");
  assert.equal(structureKey(guild, L, 0, 0), "0,0", "and kept on the board");
});

test("any city tile but the keep's lifts, with what stands on it", () => {
  assert.equal(liftsCityTile(L, { tx: KX + 1, ty: KY }), true);
  assert.equal(liftsCityTile(L, { tx: KX, ty: KY - 2 }), true);
  assert.equal(liftsCityTile(L, { tx: KX - 1, ty: KY }), true, "holds the barracks, which goes along");
  assert.equal(liftsCityTile(L, { tx: KX, ty: KY - 1 }), true, "holds the spur on, which may split off");
  assert.equal(liftsCityTile(L, { tx: KX, ty: KY }), false, "the keep's own tile");
  assert.equal(liftsCityTile(L, { tx: 0, ty: KY - 4 }), false, "not a city tile");
});
