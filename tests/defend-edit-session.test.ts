import { test } from "node:test";
import assert from "node:assert/strict";
import { BOMB_RADIUS } from "../src/defend/catalog.ts";
import { RALLY_REACH } from "../src/defend/war-banner.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { dropGhost, legalLayouts, refusal, structureLayout, type Drag } from "../src/defend/drag-rules.ts";
import { FULL } from "./test-size.ts";
import { EditSession, type DragAt } from "../src/defend/edit-session.ts";
import { CELLS_W, SUB, tileKey } from "../src/defend/grid.ts";
import { QUARTERS_H, QUARTERS_W, defaultLayout, fitLayout, placeCityTile, placeStructure, quarterSize, removeCityTile, structureSpots, removeStructure, type Layout, type PlacedKind } from "../src/defend/layout.ts";

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

test("a press lifts the keep, a structure, or a city tile with what stands on it", () => {
  const keep = cellOf((b) => b.kind === "keep");
  assert.deepEqual(liftAt(keep.cx, keep.cy), { from: "keep" });
  const barracks = cellOf((b) => b.structureUid === BARRACKS.uid);
  assert.deepEqual(liftAt(barracks.cx, barracks.cy), { from: "structure", uid: BARRACKS.uid, kind: "barracks" });
  assert.deepEqual(liftTile(KX, KY - 2), { from: "cityTile", tile: { tx: KX, ty: KY - 2 } });
  assert.deepEqual(liftTile(KX, KY - 1), { from: "cityTile", tile: { tx: KX, ty: KY - 1 } }, "a tile may split the city in districts");
  // The barracks' own tile, pressed away from the barracks, lifts with it.
  const yard = Array.from({ length: SUB * SUB }, (_, i) => ({ cx: (KX - 1) * SUB + (i % SUB), cy: KY * SUB + Math.floor(i / SUB) }))
    .find(({ cx, cy }) => { const o = MAP.owner[cy * CELLS_W + cx]; return o < 0 || !MAP.buildings[o].structureUid; })!;
  assert.deepEqual(liftAt(yard.cx, yard.cy), { from: "cityTile", tile: { tx: KX - 1, ty: KY } });
  assert.equal(liftTile(0, 1), null, "open ground moves the view");
});

test("only a press on a city tile waits for a hold to lift", () => {
  const byTile = (cx: number, cy: number) => EditSession.lift(MAP, L, cx, cy)?.byTile;
  const keep = cellOf((b) => b.kind === "keep");
  assert.equal(byTile(keep.cx, keep.cy), undefined, "the keep lifts at once");
  const barracks = cellOf((b) => b.structureUid === BARRACKS.uid);
  assert.equal(byTile(barracks.cx, barracks.cy), undefined, "so does a structure");
  assert.deepEqual(byTile(KX * SUB + 3, (KY - 2) * SUB + 3), { tx: KX, ty: KY - 2 }, "a city tile waits");
  const ground = Array.from({ length: SUB * SUB }, (_, i) => ({ cx: KX * SUB + (i % SUB), cy: KY * SUB + Math.floor(i / SUB) }))
    .find(({ cx, cy }) => MAP.owner[cy * CELLS_W + cx] < 0)!;
  assert.deepEqual(byTile(ground.cx, ground.cy), { tx: KX, ty: KY }, "and so does the keep's tile, pressed away from the keep");
});

test("the board shows nothing until the pointer moves, then the targets and the ghost", () => {
  const tile = new EditSession({ from: "palette", item: "cityTile" }, L);
  assert.deepEqual([...tile.legal.keys()], [...legalLayouts(tile.drag, L).keys()]);
  assert.equal(tile.overlay(), null);
  const [key, next] = [...tile.legal][0];
  const [tx, ty] = key.split(",").map(Number);
  tile.hover(on(tx, ty));
  assert.deepEqual(tile.overlay(), { legal: new Set(tile.legal.keys()), hover: key, ghost: dropGhost(tile.drag, next, key) });
  tile.hover(on(KX, KY));
  assert.deepEqual(tile.overlay(), { legal: new Set(tile.legal.keys()), hover: tileKey(KX, KY), ghost: null }, "a refused tile shows no ghost");
  tile.hover(OFF);
  assert.deepEqual(tile.overlay(), { legal: new Set(tile.legal.keys()), hover: null, ghost: null });
  // A structure shows the quarters it would take under the pointer.
  const tower = new EditSession({ from: "palette", item: "archerTower" }, L);
  assert.equal(tower.overlay(), null);
  tower.hover({ cellX: KX * SUB + 1, cellY: (KY - 2) * SUB + 1, overBoard: true, overPalette: false });
  const rect = { x: KX * SUB, y: (KY - 2) * SUB, w: 2, h: 2 };
  const { open, ...shown } = tower.overlay()!;
  assert.ok(open instanceof Uint8Array, "the quarters it can't cover are shaded");
  assert.deepEqual(shown, { legal: new Set(), hover: null, ghost: { rect, kind: "archerTower" }, quarters: { rect, fits: true, clear: true } });
  tower.hover({ cellX: 1, cellY: 1, overBoard: true, overPalette: false });
  assert.deepEqual(tower.overlay(), { legal: new Set(), hover: null, ghost: null, quarters: { rect: { x: 0, y: 0, w: 2, h: 2 }, fits: false, clear: true }, open }, "red where it won't go");
  tower.hover(OFF);
  assert.deepEqual(tower.overlay(), { legal: new Set(), hover: null, ghost: null, quarters: null, open });
});

test("a carried structure shades every quarter no spot it can take covers", () => {
  const drags: Drag[] = [
    { from: "palette", item: "archerTower" },
    { from: "palette", item: "watchTower" },
    { from: "palette", item: "monsterBait" },
    { from: "structure", uid: BARRACKS.uid, kind: BARRACKS.kind },
  ];
  for (const drag of drags) {
    const s = new EditSession(drag, L);
    s.hover(on(KX, KY));
    const open = s.overlay()!.open!;
    // Every top left quarter tried the slow way, each fitted whole.
    const kind = drag.from === "structure" ? drag.kind : (drag.item as PlacedKind);
    const { qw, qh } = quarterSize(kind, false);
    const want = new Uint8Array(QUARTERS_W * QUARTERS_H);
    for (let qy = 0; qy < QUARTERS_H; qy++)
      for (let qx = 0; qx < QUARTERS_W; qx++)
        if (structureLayout(drag, L, `${qx},${qy}`))
          for (let y = qy; y < qy + qh; y++) for (let x = qx; x < qx + qw; x++) want[y * QUARTERS_W + x] = 1;
    assert.deepEqual([...open], [...want], JSON.stringify(drag));
    assert.ok(open.includes(1) && open.includes(0));
  }
});

test("a structure's spots are exactly those a whole fit passes", () => {
  // A crowded city: tiles round the keep, a district apart, watch towers on
  // every tile and monster bait squeezed in beside them.
  let l = L;
  for (const [x, y] of [[KX - 1, KY - 1], [KX + 1, KY - 1], [KX - 1, KY + 1], [KX, KY + 1], [KX + 1, KY + 1], [1, 2], [1, 3]]) l = placeCityTile(l, x, y) ?? l;
  for (let y = 1; y < 13; y++) for (let x = 0; x < 9; x++) l = placeStructure(l, "watchTower", x, y) ?? l;
  for (let y = KY - 2; y <= KY + 1; y++) for (let x = KX - 1; x <= KX + 1; x++) l = placeStructure(l, "monsterBait", x, y) ?? l;
  const moved = l.structures.filter((s, i) => i % (FULL ? 3 : 9) === 0);
  const drags: Drag[] = [
    ...(["archerTower", "watchTower", "monsterBait", "barracks"] as PlacedKind[]).map((item): Drag => ({ from: "palette", item })),
    ...moved.map((s): Drag => ({ from: "structure", uid: s.uid, kind: s.kind })),
  ];
  for (const layout of [L, l])
    for (const drag of drags) {
      const kind = drag.from === "structure" ? drag.kind : (drag.item as PlacedKind);
      if (drag.from === "structure" && !layout.structures.some((s) => s.uid === drag.uid)) continue;
      const want: string[] = [];
      for (let qy = 0; qy < QUARTERS_H; qy++) for (let qx = 0; qx < QUARTERS_W; qx++) if (structureLayout(drag, layout, `${qx},${qy}`)) want.push(`${qx},${qy}`);
      const got = structureSpots(layout, kind, drag.from === "structure" ? drag.uid : undefined).map((q) => `${q.qx},${q.qy}`);
      assert.deepEqual(got, want, JSON.stringify(drag));
    }
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
  const spot = { cellX: KX * SUB + 1, cellY: (KY - 2) * SUB + 1, overBoard: true, overPalette: false };
  const key = `${KX * 4},${(KY - 2) * 4}`;
  assert.deepEqual(tower.release(spot), { kind: "build", layout: tower.layoutAt(key)!, message: null }, "set down on the quarter it was let go over");
  assert.deepEqual(tower.layoutAt(key)!.structures.at(-1)!.qx, KX * 4);
  assert.deepEqual(tower.release(on(0, 0)), { kind: "build", layout: L, message: refusal(tower.drag, L, "1,1") });
  assert.deepEqual(tower.release(OFF), { kind: "build", layout: L, message: null }, "a palette item just goes back");

  const barracks = new EditSession({ from: "structure", uid: BARRACKS.uid, kind: "barracks" }, L);
  assert.deepEqual(barracks.release(OFF), { kind: "build", layout: removeStructure(L, BARRACKS.uid), message: null });
  const tile = new EditSession({ from: "cityTile", tile: { tx: KX, ty: KY - 2 } }, L);
  assert.deepEqual(tile.release(on(KX, KY, true)), { kind: "build", layout: removeCityTile(L, KX, KY - 2)!.layout, message: null }, "over the palette counts as off the board");
  const keep = new EditSession({ from: "keep" }, L);
  assert.deepEqual(keep.release(on(KX, KY)), { kind: "build", layout: L, message: null }, "back where it was");
  assert.deepEqual(keep.release(OFF), { kind: "build", layout: L, message: "The keep can be moved, but never removed." });
});
