import { test } from "node:test";
import assert from "node:assert/strict";
import { BOMB_RADIUS } from "../src/defend/catalog.ts";
import { RALLY_REACH } from "../src/defend/war-banner.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { dropGhost, legalLayouts, refusal } from "../src/defend/drag-rules.ts";
import { EditSession, type DragAt } from "../src/defend/edit-session.ts";
import { CELLS_W, SUB, tileKey } from "../src/defend/grid.ts";
import { defaultLayout, fitLayout, placeCityTile, placeStructure, removeCityTile, removeStructure, type Layout } from "../src/defend/layout.ts";

// The drag-rules test's city: the keep with a tile either side, a two-tile
// spur above it, and a barracks left of the keep.
function city(): Layout {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [x, y] of [[tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty - 2]]) l = placeCityTile(l, x, y)!;
  return placeStructure(l, "barracks", tx - 1, ty)!;
}
const L = city();
const { tx: KX, ty: KY } = L.keep;
const fit = fitLayout(L);
assert.ok(fit.ok);
const MAP = generateCity(fit, 7);
const BARRACKS = L.structures[0];

/** The middle of tile (tx, ty), on the board or over the palette. */
const on = (tx: number, ty: number, overPalette = false): DragAt => ({ cellX: (tx + 0.5) * SUB, cellY: (ty + 0.5) * SUB, overBoard: true, overPalette });
const OFF: DragAt = { cellX: -3, cellY: -3, overBoard: false, overPalette: false };
/** A cell of the building `pick` chooses. */
function cellOf(pick: (b: (typeof MAP.buildings)[number]) => boolean) {
  const i = MAP.owner.findIndex((o) => o >= 0 && pick(MAP.buildings[o]));
  return { cx: i % CELLS_W, cy: Math.floor(i / CELLS_W) };
}
const liftAt = (cx: number, cy: number) => EditSession.lift(MAP, L, cx, cy)?.drag ?? null;
const liftTile = (tx: number, ty: number) => liftAt(tx * SUB + 3, ty * SUB + 3);

test("a press lifts the keep, a structure, or a city tile the city can spare", () => {
  const keep = cellOf((b) => b.kind === "keep");
  assert.deepEqual(liftAt(keep.cx, keep.cy), { from: "keep" });
  const barracks = cellOf((b) => b.structureUid === BARRACKS.uid);
  assert.deepEqual(liftAt(barracks.cx, barracks.cy), { from: "structure", uid: BARRACKS.uid, kind: "barracks" });
  assert.deepEqual(liftTile(KX, KY - 2), { from: "cityTile", tile: { tx: KX, ty: KY - 2 } });
  assert.equal(liftTile(KX, KY - 1), null, "the spur's lower tile holds the upper one on");
  assert.equal(liftTile(0, 1), null, "open ground moves the view");
});

test("the board shows nothing until the pointer moves, then the targets and the ghost", () => {
  const edit = new EditSession({ from: "palette", item: "archerTower" }, L);
  assert.deepEqual([...edit.legal.keys()], [...legalLayouts(edit.drag, L).keys()]);
  assert.equal(edit.overlay(), null);
  const [key, next] = [...edit.legal][0];
  const [tx, ty] = key.split(",").map(Number);
  edit.hover(on(tx, ty));
  assert.deepEqual(edit.overlay(), { legal: new Set(edit.legal.keys()), hover: key, ghost: dropGhost(edit.drag, next, key) });
  edit.hover(on(0, 0));
  assert.deepEqual(edit.overlay(), { legal: new Set(edit.legal.keys()), hover: tileKey(0, 0), ghost: null }, "a refused tile shows no ghost");
  edit.hover(OFF);
  assert.deepEqual(edit.overlay(), { legal: new Set(edit.legal.keys()), hover: null, ghost: null });
});

test("a bomb shows its reach over the board and goes off where it is released", () => {
  const bomb = new EditSession({ from: "bomb" }, L);
  assert.equal(bomb.legal.size, 0);
  bomb.hover(on(2, 3));
  assert.deepEqual(bomb.overlay(), { legal: new Set(), hover: null, ghost: null, bomb: { x: 2.5 * SUB, y: 3.5 * SUB, r: BOMB_RADIUS } });
  bomb.hover(OFF);
  assert.equal(bomb.overlay(), null);
  assert.deepEqual(bomb.release(on(2, 3)), { kind: "bomb", at: { x: 2.5 * SUB, y: 3.5 * SUB } });
  assert.deepEqual(new EditSession({ from: "bomb" }, L).release(OFF), { kind: "bomb", at: null });
});

test("the war banner shows its rally ground and is planted, moved or tapped down", () => {
  const fresh = new EditSession({ from: "banner" }, L);
  assert.equal(fresh.legal.size, 0);
  fresh.hover(on(2, 3));
  assert.deepEqual(fresh.overlay(), { legal: new Set(), hover: null, ghost: null, banner: { x: 2.5 * SUB, y: 3.5 * SUB, r: RALLY_REACH } });
  assert.deepEqual(fresh.release(on(2, 3)), { kind: "banner", at: { x: 2.5 * SUB, y: 3.5 * SUB }, tap: false }, "from the palette it is planted, even where pressed");
  assert.deepEqual(new EditSession({ from: "banner" }, L).release(OFF), { kind: "banner", at: null, tap: false });
  const tapped = new EditSession({ from: "banner", placed: true }, L);
  tapped.hover(on(2, 3));
  assert.deepEqual(tapped.release({ ...on(2, 3), cellX: on(2, 3).cellX + 0.3 }), { kind: "banner", at: null, tap: true }, "a planted one let go where it stands was tapped");
  const moved = new EditSession({ from: "banner", placed: true }, L);
  moved.hover(on(2, 3));
  assert.deepEqual(moved.release(on(4, 5)), { kind: "banner", at: { x: 4.5 * SUB, y: 5.5 * SUB }, tap: false }, "carried elsewhere it moves");
});

test("releasing a city element takes the tile, goes back to the palette, or says why not", () => {
  const tower = new EditSession({ from: "palette", item: "archerTower" }, L);
  const [key, next] = [...tower.legal][0];
  const [tx, ty] = key.split(",").map(Number);
  assert.deepEqual(tower.release(on(tx, ty)), { kind: "build", layout: next, message: null });
  assert.deepEqual(tower.release(on(0, 0)), { kind: "build", layout: L, message: refusal(tower.drag, L, tileKey(0, 0)) });
  assert.deepEqual(tower.release(OFF), { kind: "build", layout: L, message: null }, "a palette item just goes back");

  const barracks = new EditSession({ from: "structure", uid: BARRACKS.uid, kind: "barracks" }, L);
  assert.deepEqual(barracks.release(OFF), { kind: "build", layout: removeStructure(L, BARRACKS.uid), message: null });
  const tile = new EditSession({ from: "cityTile", tile: { tx: KX, ty: KY - 2 } }, L);
  assert.deepEqual(tile.release(on(KX, KY, true)), { kind: "build", layout: removeCityTile(L, KX, KY - 2)!.layout, message: null }, "over the palette counts as off the board");
  const keep = new EditSession({ from: "keep" }, L);
  assert.deepEqual(keep.release(on(KX, KY)), { kind: "build", layout: L, message: null }, "back where it was");
  assert.deepEqual(keep.release(OFF), { kind: "build", layout: L, message: "The keep can be moved, but never removed." });
});
