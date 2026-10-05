import { test } from "node:test";
import assert from "node:assert/strict";
import { BALLISTA, SPIKES } from "../src/defend/catalog.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { legalLayouts, refusal } from "../src/defend/drag-rules.ts";
import { EditSession, type DragAt } from "../src/defend/edit-session.ts";
import { SUB, cellIndex, cellX, cellY } from "../src/defend/grid.ts";
import {
  ballistaRect,
  cityTileSet,
  cornerKey,
  cornerOk,
  defaultLayout,
  fitLayout,
  gateKey,
  placeBallista,
  placeCityTile,
  placeGate,
  placeSpikes,
  spikesRect,
  type GateSpot,
  type Layout,
} from "../src/defend/layout.ts";
import { decodeDefendSave, defaultDefendSave } from "../src/defend/progress.ts";
import { DefendSim } from "../src/defend/sim.ts";

// The keep with a tile above it: a column two tiles tall.
const L = (() => {
  const l = defaultLayout();
  return placeCityTile(l, l.keep.tx, l.keep.ty - 1)!;
})();
const { tx: KX, ty: KY } = L.keep;
const NORTH: GateSpot = { tx: KX, ty: KY - 1, side: "n" };
const map = (l: Layout) => {
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return generateCity(fit, 11);
};
const at = (x: number, y: number): DragAt => ({ cellX: x, cellY: y, overBoard: true, overPalette: false });

test("a ballista goes only where the wall turns through a right angle", () => {
  const legal = legalLayouts({ from: "palette", item: "wallBallista" }, L);
  // A column of two tiles turns at its four outer corners; the corners
  // halfway down it are straight wall.
  assert.deepEqual([...legal.keys()].sort(), [`${KX},${KY - 1}`, `${KX + 1},${KY - 1}`, `${KX},${KY + 1}`, `${KX + 1},${KY + 1}`].sort());
  const tiles = cityTileSet(L);
  assert.equal(cornerOk(tiles, { vx: KX, vy: KY }), false, "a straight run of wall");
  assert.equal(refusal({ from: "palette", item: "wallBallista" }, L, `${KX},${KY}`), "A wall ballista goes on a corner of the city wall, where it turns at a right angle.");
  // An L of three tiles turns inward too.
  const ell = placeCityTile(L, KX + 1, KY)!;
  assert.equal(cornerOk(cityTileSet(ell), { vx: KX + 1, vy: KY }), true, "an inner corner");
  assert.deepEqual(ballistaRect(cityTileSet(ell), { vx: KX + 1, vy: KY }), { x: (KX + 1) * SUB, y: KY * SUB - 2, w: 2, h: 2 });
  assert.equal(placeBallista(placeBallista(L, { vx: KX, vy: KY - 1 })!, { vx: KX, vy: KY - 1 }), null, "one to a corner");
});

test("the bastion stands in the wall's stones at its corner, outside the city", () => {
  const v = { vx: KX + 1, vy: KY - 1 };
  const l = placeBallista(L, v)!;
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  const r = ballistaRect(cityTileSet(l), v);
  assert.deepEqual(r, { x: (KX + 1) * SUB, y: (KY - 1) * SUB - 2, w: 2, h: 2 });
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) assert.equal(fit.wall[cellIndex(x, y)], 1);
  const m = map(l);
  const b = m.buildings.filter((b) => b.kind === "wallBallista");
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].rect, r);
  assert.deepEqual(b[0].corner, { vx: v.vx, vy: v.vy, out: { x: 1, y: -1 } }, "it faces out of the city");
  assert.ok(b[0].cells.every((c) => m.owner[c] === b[0].id), "no wall stone left in it");
  // A new tile beside it straightens the wall there and takes it off.
  assert.deepEqual(placeCityTile(l, KX + 1, KY - 1)!.ballistas, []);
});

test("spikes line one tile's stretch of wall, not across a gate", () => {
  const spiked = placeSpikes(L, NORTH)!;
  assert.deepEqual(spiked.spikes, [NORTH]);
  assert.equal(placeSpikes(spiked, NORTH), null, "one row to an edge");
  assert.equal(placeGate(spiked, NORTH), null, "no gate through the spikes");
  assert.equal(placeSpikes(placeGate(L, NORTH)!, NORTH), null, "no spikes across a gate");
  assert.equal(placeSpikes(L, { tx: KX, ty: KY - 1, side: "s" }), null, "no wall between two city tiles");
  assert.equal(legalLayouts({ from: "palette", item: "wallSpikes" }, L).size, 6);
  const m = map(spiked);
  assert.equal(m.spikes?.length, 1);
  assert.deepEqual(m.spikes![0].cells, Array.from({ length: SUB }, (_, i) => cellIndex(KX * SUB + i, (KY - 1) * SUB - 2)), "the wall's outer row of stones");
  assert.equal(map(L).spikes, undefined, "a city without spikes has none");
  assert.deepEqual(spikesRect(NORTH), { x: KX * SUB, y: (KY - 1) * SUB - 2, w: SUB, h: 1 });
});

/** A battle with no wave coming while enemies are on the board. */
function battle(l: Layout) {
  const sim = new DefendSim(map(l), defaultDefendSave().levels, 5);
  sim.breakT = 1e9;
  return sim;
}

test("spikes cut the enemies on foot pressing against them", () => {
  const sim = battle(placeSpikes(L, NORTH)!);
  const cell = sim.map.spikes![0].cells[3];
  const orc = sim.spawnAuxiliary("orc", cellX(cell) + 0.5, cellY(cell) - 0.4)!;
  const bat = sim.spawnAuxiliary("bat", cellX(cell) + 0.5, cellY(cell) - 0.4)!;
  for (let i = 0; i < 30; i++) sim.step(1 / 30);
  assert.ok(orc.hp <= orc.maxHp - SPIKES.damage, `the orc is cut (${orc.hp})`);
  assert.equal(bat.hp, bat.maxHp, "a flier passes over");
  // The same orc against plain wall is unhurt.
  const plain = battle(L);
  const other = plain.spawnAuxiliary("orc", cellX(cell) + 0.5, cellY(cell) - 0.4)!;
  for (let i = 0; i < 30; i++) plain.step(1 / 30);
  assert.equal(other.hp, other.maxHp);
});

test("a ballista shoots the nearest enemy and its bolt pierces the file behind", () => {
  const v = { vx: KX + 1, vy: KY - 1 };
  const sim = battle(placeBallista(L, v)!);
  const b = sim.map.buildings.find((b) => b.kind === "wallBallista")!;
  const cx = b.rect.x + 1, cy = b.rect.y + 1;
  const file = [3, 4, 5, 6].map((d) => sim.spawnAuxiliary("ogre", cx + d, cy - d)!);
  for (let i = 0; i < 20; i++) sim.step(1 / 30);
  assert.ok(sim.ballistaAim.has(b.id), "it has turned and shot");
  const hurt = file.filter((e) => e.hp < e.maxHp);
  assert.ok(hurt.length >= 3, `the bolt went through ${hurt.length}`);
  assert.ok(hurt.every((e) => e.maxHp - e.hp <= BALLISTA.damage + 1e-9), "each struck once");
});

test("carried spikes and ballistas snap to their spots and lift again", () => {
  const edit = new EditSession({ from: "palette", item: "wallSpikes" }, L);
  edit.hover(at(KX * SUB + 3.5, (KY - 1) * SUB - 1));
  assert.equal(edit.tile, gateKey(NORTH));
  const drop = edit.release(at(KX * SUB + 3.5, (KY - 1) * SUB - 1));
  assert.ok(drop.kind === "build" && drop.layout.spikes.length === 1);
  const spiked = (drop as { layout: Layout }).layout;
  const lift = EditSession.lift(map(spiked), spiked, KX * SUB + 2, (KY - 1) * SUB - 2);
  assert.deepEqual(lift?.drag, { from: "spikes", spikes: NORTH });

  const v = { vx: KX, vy: KY + 1 };
  const carry = new EditSession({ from: "palette", item: "wallBallista" }, L);
  carry.hover(at(v.vx * SUB - 0.6, v.vy * SUB + 0.8));
  assert.equal(carry.tile, cornerKey(v));
  const set = carry.release(at(v.vx * SUB - 0.6, v.vy * SUB + 0.8));
  assert.ok(set.kind === "build");
  const placed = (set as { layout: Layout }).layout;
  assert.deepEqual(placed.ballistas, [v]);
  const r = ballistaRect(cityTileSet(placed), v);
  const again = EditSession.lift(map(placed), placed, r.x, r.y)!;
  assert.deepEqual(again.drag, { from: "ballista", corner: v });
  const back = again.release({ cellX: -3, cellY: -3, overBoard: false, overPalette: false });
  assert.ok(back.kind === "build" && back.layout.ballistas.length === 0, "off the board it goes back to the palette");
});

test("saves keep their spikes and ballistas, and older saves have none", () => {
  const l = placeBallista(placeSpikes(L, NORTH)!, { vx: KX, vy: KY - 1 })!;
  const save = { ...defaultDefendSave(), layout: l, owned: { ...defaultDefendSave().owned, wallSpikes: 1, wallBallista: 1 } };
  const back = decodeDefendSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(back.layout.spikes, [NORTH]);
  assert.deepEqual(back.layout.ballistas, [{ vx: KX, vy: KY - 1 }]);
  const old = JSON.parse(JSON.stringify(save));
  delete old.layout.spikes;
  delete old.layout.ballistas;
  assert.deepEqual(decodeDefendSave(old).layout.spikes, []);
  assert.deepEqual(decodeDefendSave(old).layout.ballistas, []);
  const unowned = JSON.parse(JSON.stringify({ ...save, owned: { ...save.owned, wallBallista: 0 } }));
  assert.deepEqual(decodeDefendSave(unowned).layout.cityTiles, [], "a ballista nobody bought drops the layout");
  const bad = JSON.parse(JSON.stringify(save));
  bad.layout.ballistas = [{ vx: KX, vy: KY }];
  assert.deepEqual(decodeDefendSave(bad).layout.cityTiles, [], "a ballista on straight wall drops the layout");
});
