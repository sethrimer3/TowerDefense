import { test } from "node:test";
import assert from "node:assert/strict";
import { BALLISTA, CANNON_RANGE, archerRange } from "../src/defend/catalog.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { defeatHTML, short } from "../src/defend/defeat.ts";
import { EditSession, type DragAt } from "../src/defend/edit-session.ts";
import { SUB, TILES_H, TILES_W } from "../src/defend/grid.ts";
import { inspectable, reachOf, troopsOf } from "../src/defend/inspect.ts";
import {
  cityTileSet, defaultLayout, fitLayout, joinedOnly, placeCityTile, placeStructure, removeCityTile, tileGroups, type Layout,
} from "../src/defend/layout.ts";
import { decodeDefendSave, defaultDefendSave, withOutskirts } from "../src/defend/progress.ts";
import { DefendSim } from "../src/defend/sim.ts";
import { refusal } from "../src/defend/drag-rules.ts";
import { SKILLS, TREES } from "../src/skill-trees.ts";
import { SUBJECTS } from "../src/upgrade-subjects.ts";

function city(): Layout {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [x, y] of [[tx - 1, ty], [tx + 1, ty]]) l = placeCityTile(l, x, y)!;
  l = placeStructure(l, "barracks", tx - 1, ty)!;
  return placeStructure(l, "archerTower", tx + 1, ty)!;
}
const map = (l: Layout, seed = 5) => {
  const fit = fitLayout(l);
  assert.ok(fit.ok, fit.ok ? "" : fit.reason);
  return generateCity(fit, seed);
};

test("a lost run's stats count each wave without changing the battle", () => {
  const sim = new DefendSim(map(city()), defaultDefendSave().levels, 3);
  for (let t = 0; t < 90; t += 0.25) sim.update(0.25);
  const waves = sim.stats.waves.filter((w) => w.wave > 0);
  assert.ok(waves.length >= 1, "a wave began");
  assert.equal(waves[0].wave, 1);
  assert.ok(waves[0].difficulty > 0 && waves[0].spawned > 0);
  const total = sim.stats.totals();
  assert.ok(total.dealt > 0, "the city's towers and troops dealt damage");
  assert.equal(total.slain, Object.values(sim.slain).reduce((a, b) => a + b, 0), "every kill is counted once");
  const keep = sim.keep;
  sim.damageBuilding(keep.id, 1e9);
  assert.ok(sim.stats.current.keep > 0 && sim.stats.current.keep <= sim.keepMaxHp(), "the keep's damage is what it had left");
  assert.ok(sim.stats.current.fell >= 1);
});

test("the defeat summary shows the numbers and a chart a measure", () => {
  const sim = new DefendSim(map(city()), defaultDefendSave().levels, 3);
  for (let t = 0; t < 90; t += 0.25) sim.update(0.25);
  const html = defeatHTML({ wave: sim.wave, best: 4, record: 0, stats: sim.stats });
  assert.match(html, /The keep has fallen/);
  assert.match(html, /aria-label="Close and rebuild the city"/);
  assert.doesNotMatch(html, /Tap anywhere/);
  assert.match(html, /data-defeat-close>Close<\/button>/);
  for (const t of ["Damage dealt", "Damage taken", "Enemy difficulty"]) assert.ok(html.includes(`>${t} `), t);
  assert.ok(!html.includes("NaN"));
  assert.equal(short(950), "950");
  assert.equal(short(12_400), "12.4k");
  assert.equal(short(1_200_000), "1.2M");
});

test("a tap picks out towers with their reach and troop buildings with their troops", () => {
  const m = map(city());
  const sim = new DefendSim(m, defaultDefendSave().levels, 3);
  const tower = m.buildings.find((b) => b.kind === "archerTower")!;
  const barracks = m.buildings.find((b) => b.kind === "barracks")!;
  assert.ok(inspectable(tower) && inspectable(barracks));
  assert.ok(!inspectable(m.buildings.find((b) => b.kind === "keep")));
  assert.ok(!inspectable(m.buildings.find((b) => b.kind === "house")));
  assert.equal(reachOf(tower, sim)[0].r, archerRange(0));
  assert.deepEqual(reachOf(barracks, sim), []);
  assert.equal(reachOf({ ...tower, kind: "cannonTower" }, sim)[0].r, CANNON_RANGE);
  assert.equal(reachOf({ ...tower, kind: "wallBallista" }, sim)[0].r, BALLISTA.range);
  for (let t = 0; t < 20; t += 0.25) sim.update(0.25);
  const troops = troopsOf(barracks, sim);
  assert.ok(troops.length > 0 && troops.every((s) => s.home === barracks.id));
  assert.deepEqual(troopsOf(tower, sim), []);
});

test("a structure pressed and let go where it stands is tapped, not reshuffled", () => {
  const l = city(), m = map(l);
  const tower = m.buildings.find((b) => b.kind === "archerTower")!;
  const edit = EditSession.lift(m, l, tower.rect.x, tower.rect.y)!;
  const at: DragAt = { cellX: tower.rect.x + 0.5, cellY: tower.rect.y + 0.5, overBoard: true, overPalette: false };
  edit.hover(at);
  const drop = edit.release({ ...at, cellX: at.cellX + 0.2 });
  assert.equal(drop.kind, "build");
  assert.ok(drop.kind === "build" && drop.tap && drop.layout === l);
});

test("Outlying districts lets city tiles stand apart, but never on the top row", () => {
  const l = city(), { tx, ty } = l.keep;
  const far = { tx: 1, ty: 3 };
  assert.equal(placeCityTile(l, far.tx, far.ty), null, "without it, tiles must touch the city");
  assert.equal(refusal({ from: "palette", item: "cityTile" }, l, `${far.tx},${far.ty}`), "City tiles must touch the city along an edge.");
  const open = withOutskirts(l, true);
  assert.ok(open.outskirts);
  assert.equal(placeCityTile(open, 2, 0), null, "the spawn row stays closed");
  const apart = placeCityTile(open, far.tx, far.ty)!;
  assert.ok(apart, "a tile apart from the city");
  const built = placeStructure(apart, "cannonTower", far.tx, far.ty)!;
  assert.ok(built, "a structure on an outlying tile");
  assert.equal(tileGroups(built).get(`${far.tx},${far.ty}`), 1);
  // It is walled and streeted on its own, and a battle runs.
  const m = map(built);
  const sim = new DefendSim(m, defaultDefendSave().levels, 9);
  for (let t = 0; t < 30; t += 0.25) sim.update(0.25);
  assert.ok(sim.time > 29);
  // Removing a tile may leave the city in pieces too.
  const spur = placeCityTile(placeCityTile(open, tx, ty - 1)!, tx, ty - 2)!;
  assert.ok(removeCityTile(spur, tx, ty - 1), "the tile joining a spur can go");
  // A save keeps it.
  const save = defaultDefendSave();
  save.owned.cityTile = 10;
  save.owned.cannonTower = 2;
  save.owned.barracks = 2;
  save.owned.archerTower = 2;
  save.layout = built;
  const back = decodeDefendSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(back.layout.cityTiles, built.cityTiles);
  assert.equal(back.layout.outskirts, true);
});

test("unlearning Outlying districts takes up the tiles apart from the keep's", () => {
  const open = withOutskirts(city(), true);
  const built = placeStructure(placeCityTile(open, 1, 3)!, "cannonTower", 1, 3)!;
  const { returned } = joinedOnly(built);
  assert.deepEqual(returned, ["cannonTower"]);
  const closed = withOutskirts(built, false);
  assert.equal(closed.outskirts, undefined);
  assert.ok(!cityTileSet(closed).has("1,3"));
  assert.ok(!closed.structures.some((s) => s.kind === "cannonTower"));
  assert.ok(closed.structures.some((s) => s.kind === "archerTower"), "the keep's city stays as it was");
  assert.ok(fitLayout(closed).ok);
  assert.equal(withOutskirts(closed, false), closed);
  assert.ok(TILES_W > 2 && TILES_H > 4 && SUB > 0);
});

test("Outlying districts is a one-rank Study skill filed with the city's walls", () => {
  assert.equal(SKILLS.outskirts.max, 1);
  assert.ok(TREES.find((t) => t.id === "stewardship")!.nodes.some((n) => n.id === "outskirts"));
  assert.ok(SUBJECTS.find((s) => s.id === "city")!.topics.find((t) => t.id === "walls")!.skills!.includes("outskirts"));
});
