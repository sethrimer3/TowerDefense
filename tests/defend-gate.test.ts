import { test } from "node:test";
import assert from "node:assert/strict";
import { GATE, PALETTE_ITEMS, inCategory } from "../src/defend/catalog.ts";
import { CellType, generateCity } from "../src/defend/citygen.ts";
import { legalLayouts, nearestEdge, refusal } from "../src/defend/drag-rules.ts";
import { EditSession, type DragAt } from "../src/defend/edit-session.ts";
import { SUB, cellIndex } from "../src/defend/grid.ts";
import { defaultLayout, fitLayout, gateKey, gateRect, placeCityTile, placeGate, removeCityTile, type GateSpot, type Layout } from "../src/defend/layout.ts";
import { findPath } from "../src/defend/pathing.ts";
import { decodeDefendSave, defaultDefendSave } from "../src/defend/progress.ts";
import { DefendSim } from "../src/defend/sim.ts";

// The keep with a tile above it; the gate goes in the wall north of that.
function city(): Layout {
  const l = defaultLayout();
  return placeCityTile(l, l.keep.tx, l.keep.ty - 1)!;
}
const L = city();
const { tx: KX, ty: KY } = L.keep;
const NORTH: GateSpot = { tx: KX, ty: KY - 1, side: "n" };
const GATED = placeGate(L, NORTH)!;
const map = (l: Layout) => {
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return generateCity(fit, 11);
};

test("a gate goes only in the wall along a city tile's edge", () => {
  assert.ok(GATED);
  assert.deepEqual(GATED.gates, [NORTH]);
  assert.equal(placeGate(GATED, NORTH), null, "one gate to an edge");
  assert.equal(placeGate(L, { tx: KX, ty: KY - 1, side: "s" }), null, "between two city tiles there is no wall");
  assert.equal(placeGate(L, { tx: KX + 2, ty: KY, side: "n" }), null, "not on open ground");
  assert.equal(refusal({ from: "palette", item: "cityGate" }, L, gateKey({ tx: KX + 2, ty: KY, side: "n" })), "A city gate goes in the city wall, on the edge of a city tile.");
  const legal = legalLayouts({ from: "palette", item: "cityGate" }, L);
  // Two tiles stacked: three sides each, less the edge they share.
  assert.equal(legal.size, 6);
  assert.ok(legal.has(gateKey(NORTH)));
});

test("a gate's rect is three cells of the wall's depth in the middle of the edge", () => {
  const r = gateRect(NORTH);
  assert.deepEqual(r, { x: KX * SUB + 2, y: (KY - 1) * SUB - GATE.deep, w: GATE.long, h: GATE.deep });
  const fit = fitLayout(GATED);
  assert.ok(fit.ok);
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) assert.equal(fit.wall[cellIndex(x, y)], 1, "it stands in the wall");
});

test("the city builds a gatehouse there with a street up to it", () => {
  const m = map(GATED);
  const gates = m.buildings.filter((b) => b.kind === "gate");
  assert.equal(gates.length, 1);
  assert.deepEqual(gates[0].gate, NORTH);
  assert.deepEqual(gates[0].rect, gateRect(NORTH));
  const r = gateRect(NORTH);
  for (let x = r.x; x < r.x + r.w; x++) {
    assert.equal(m.buildings[m.owner[cellIndex(x, r.y)]].kind, "gate", "no wall stone left in it");
    assert.equal(m.type[cellIndex(x, r.y + r.h)], CellType.ROAD, "the street runs up to it");
  }
  // Without the gate the same city is all wall there.
  const plain = map(L);
  assert.equal(plain.buildings.filter((b) => b.kind === "gate").length, 0);
});

test("the gate lets the city's people through and bars the enemy", () => {
  const sim = new DefendSim(map(GATED), defaultDefendSave().levels, 3);
  const r = gateRect(NORTH);
  const inside = { x: r.x + 1.5, y: r.y + r.h + 1.5 }, outside = { x: r.x + 1.5, y: r.y - 1.5 };
  assert.ok(findPath(sim.ownSolid, inside, outside, { maxCost: 40 }), "troops walk out through it");
  assert.equal(findPath(sim.solid, inside, outside, { maxCost: 40 }), null, "it is shut to everyone else");
  // Without a gate the two masks are one.
  const plain = new DefendSim(map(L), defaultDefendSave().levels, 3);
  assert.equal(plain.ownSolid, plain.solid);
});

test("a new city tile across the gate takes it out of the wall; removing its tile does too", () => {
  const grown = placeCityTile(GATED, KX, KY - 2)!;
  assert.deepEqual(grown.gates, []);
  const east = placeGate(GATED, { tx: KX, ty: KY - 1, side: "e" })!;
  assert.equal(east.gates.length, 2);
  const cut = removeCityTile(placeCityTile(east, KX, KY - 2)!, KX, KY - 2)!;
  assert.deepEqual(cut.layout.gates, [{ tx: KX, ty: KY - 1, side: "e" }]);
});

/** A point in cells on the board. */
const at = (x: number, y: number): DragAt => ({ cellX: x, cellY: y, overBoard: true, overPalette: false });

test("a carried gate snaps to the nearest wall edge and is set there", () => {
  const r = gateRect(NORTH);
  assert.equal(nearestEdge(L, r.x + 1.5, r.y + 0.5), gateKey(NORTH), "from outside, over the wall");
  assert.equal(nearestEdge(L, r.x + 1.5, r.y + r.h + 0.5), gateKey(NORTH), "from inside the tile");
  const edit = new EditSession({ from: "palette", item: "cityGate" }, L);
  edit.hover(at(r.x + 3.5, r.y + 2));
  assert.equal(edit.tile, gateKey(NORTH));
  const o = edit.overlay()!;
  assert.equal(o.gates?.fits, true);
  assert.deepEqual(o.ghost, { rect: r, kind: "cityGate" });
  const drop = edit.release(at(r.x + 1.5, r.y + 1));
  assert.equal(drop.kind, "build");
  if (drop.kind === "build") assert.deepEqual(drop.layout.gates, [NORTH]);
});

test("a set gate lifts, moves and goes back to the palette", () => {
  const m = map(GATED);
  const r = gateRect(NORTH);
  const lift = EditSession.lift(m, GATED, r.x, r.y);
  assert.deepEqual(lift?.drag, { from: "gate", gate: NORTH });
  const west = gateRect({ tx: KX, ty: KY, side: "w" });
  const moved = lift!.release(at(west.x + 1, west.y + 1.5));
  assert.equal(moved.kind, "build");
  if (moved.kind === "build") assert.deepEqual(moved.layout.gates, [{ tx: KX, ty: KY, side: "w" }]);
  const back = EditSession.lift(m, GATED, r.x, r.y)!.release({ cellX: -3, cellY: -3, overBoard: false, overPalette: false });
  assert.equal(back.kind, "build");
  if (back.kind === "build") assert.deepEqual(back.layout.gates, []);
});

test("saves keep their gates, and older saves have none", () => {
  const save = { ...defaultDefendSave(), layout: GATED, owned: { ...defaultDefendSave().owned, cityGate: 1 } };
  const back = decodeDefendSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(back.layout.gates, [NORTH]);
  const old = JSON.parse(JSON.stringify(save));
  delete old.layout.gates;
  assert.ok(decodeDefendSave(old).layout.cityTiles.length, "a save from before gates still loads");
  assert.deepEqual(decodeDefendSave(old).layout.gates, []);
  const unowned = JSON.parse(JSON.stringify({ ...save, owned: { ...save.owned, cityGate: 0 } }));
  assert.deepEqual(decodeDefendSave(unowned).layout.cityTiles, [], "a gate nobody bought drops the layout");
  const bad = JSON.parse(JSON.stringify(save));
  bad.layout.gates = [{ tx: KX, ty: KY - 1, side: "s" }];
  assert.deepEqual(decodeDefendSave(bad).layout.cityTiles, [], "a gate out of the wall drops the layout");
});

test("the palette's categories split everything between towers, units and the city", () => {
  const of = (c: "towers" | "units" | "city") => PALETTE_ITEMS.filter((i) => inCategory(i, c));
  assert.deepEqual(of("towers"), ["archerTower", "cannonTower", "watchTower", "wizardTower"]);
  assert.deepEqual(of("units"), ["barracks", "archerBarracks", "mageGuild", "valkyriePalace", "darkKeep"]);
  assert.deepEqual(of("city"), ["cityTile", "monsterBait", "cityGate"]);
  assert.deepEqual(PALETTE_ITEMS.filter((i) => inCategory(i, "all")), PALETTE_ITEMS);
});
