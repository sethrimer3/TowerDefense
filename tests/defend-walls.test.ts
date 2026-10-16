// Walls placed on their own (layout.ts's `walls`, on a grid of quarter
// tiles) and their shared upgrade tree (src/wall-upgrades.ts): placing,
// moving and taking them up, the city they make, saves, and the tree's
// effects in battle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import {
  QUARTER,
  cloneLayout,
  defaultLayout,
  fitLayout,
  moveCityTile,
  placeCityTile,
  placeWall,
  quarterAt,
  wallKey,
  wallPieceRect,
  wallTile,
  type Layout,
  type WallSpot,
} from "../src/defend/layout.ts";
import { CELLS_W, SUB, rectCells } from "../src/defend/grid.ts";
import { legalLayouts } from "../src/defend/drag-rules.ts";
import { EditSession } from "../src/defend/edit-session.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { bonuses } from "../src/progression.ts";
import { NO_BONUSES, purchasePrice } from "../src/defend/catalog.ts";
import { STONEWORK, THORNWORK, WALL_PATHS, respecWalls, upgradeWalls, wallAllocated, withInnerWalls } from "../src/wall-upgrades.ts";
import { wallCardHtml, wallGraph, wallStep } from "../src/ui/specialty.ts";
import { available } from "../src/defend/progress.ts";

/** A quarter tile on tile (tx, ty): quarter (ax, ay) of it. */
const q = (tx: number, ty: number, ax = 0, ay = 0): WallSpot => ({ qx: tx * QUARTER + ax, qy: ty * QUARTER + ay });
/** The default city's keep. */
const keepOf = (l: Layout) => l.keep;

test("a wall section is a quarter of a tile on the finer grid, two cells square", () => {
  const rects = [0, 1, 2, 3].map((ax) => wallPieceRect(q(2, 3, ax, 0)));
  assert.deepEqual(rects.map((r) => r.x - 2 * SUB), [0, 2, 4, 6], "four to a tile, each its own quarter");
  for (const r of rects) assert.deepEqual([r.w, r.h], [2, 2]);
  // Together they wall the tile's whole width, without overlapping.
  const cols = rects.flatMap((r) => [r.x, r.x + 1]);
  assert.equal(new Set(cols).size, SUB);
  assert.equal(cols.length, SUB);
  assert.deepEqual(quarterAt(2 * SUB + 7.9, 3 * SUB), q(2, 3, 3, 0));
  assert.deepEqual(wallTile(q(4, 5, 3, 3)), { tx: 4, ty: 5 });
});

test("walls go anywhere outside the city off the spawn row; inside only with Town walls", () => {
  const l = defaultLayout(), k = keepOf(l);
  const out = placeWall(l, q(k.tx - 2, k.ty, 1, 1));
  assert.ok(out, "outside the city");
  assert.deepEqual(out.walls, [q(k.tx - 2, k.ty, 1, 1)]);
  assert.equal(placeWall(out, q(k.tx - 2, k.ty, 1, 1)), null, "not twice on one spot");
  assert.ok(placeWall(out, q(k.tx - 2, k.ty, 2, 1)), "beside another, sharing a column");
  assert.equal(placeWall(l, q(3, 0, 1, 1)), null, "never on the spawn row");
  assert.equal(placeWall(l, q(k.tx, k.ty, 0, 0)), null, "not inside the city without Town walls");
  // The city wall's own ring already stands just outside the keep's tile.
  assert.equal(placeWall(l, { qx: k.tx * QUARTER - 1, qy: k.ty * QUARTER + 1 }), null, "not where every cell is wall already");
  const inner = placeWall({ ...cloneLayout(l), innerWalls: true }, q(k.tx, k.ty, 0, 0));
  assert.ok(inner, "inside with Town walls, where the city still fits round it");
  assert.equal(placeWall({ ...cloneLayout(l), innerWalls: true }, q(k.tx, k.ty, 1, 1)), null, "but never over the keep");
});

test("placed walls make wall stones in the city, marked as placed, and old layouts are untouched", () => {
  const l = defaultLayout(), k = keepOf(l);
  assert.equal(fitLayout(l).ok && "pieces" in fitLayout(l), false, "no walls, no pieces");
  const w = q(k.tx - 2, k.ty + 1, 2, 0);
  const next = placeWall(l, w)!;
  const fit = fitLayout(next);
  assert.ok(fit.ok && fit.pieces);
  const map = generateCity(fit, 5);
  for (const i of rectCells(wallPieceRect(w))) {
    assert.equal(map.wall[i], 1);
    const b = map.buildings[map.owner[i]];
    assert.equal(b.kind, "wall");
    assert.equal(b.piece, true);
  }
  assert.equal(map.buildings.filter((b) => b.piece).length, 4);
  // An inner wall is taken out of the city.
  const inner = placeWall({ ...cloneLayout(l), innerWalls: true }, q(k.tx, k.ty, 3, 3))!;
  const f2 = fitLayout(inner);
  assert.ok(f2.ok);
  for (const i of rectCells(wallPieceRect(q(k.tx, k.ty, 3, 3)))) assert.deepEqual([f2.city[i], f2.wall[i]], [0, 1]);
});

test("dragging a wall from the palette offers every open quarter, and placed ones lift, move and come back", () => {
  const l = defaultLayout(), k = keepOf(l);
  const legal = legalLayouts({ from: "palette", item: "wallBlock" }, l);
  assert.ok(legal.size > 1000, "most of the board's quarters");
  assert.ok(!legal.has(wallKey(q(k.tx, k.ty))), "not inside the city");
  assert.ok(!legal.has(wallKey(q(0, 0))), "nor on the spawn row");
  const w = q(k.tx - 2, k.ty, 1, 2);
  const placed = legal.get(wallKey(w))!;
  assert.deepEqual(placed, placeWall(l, w), "the same layout placing it directly makes");
  // A press on it lifts it.
  const map = generateCity(fitLayout(placed) as never, 3);
  const r = wallPieceRect(w);
  const s = EditSession.lift(map, placed, r.x + 1, r.y + 1)!;
  assert.deepEqual(s.drag, { from: "wallBlock", wall: w });
  // Carried a little way, it goes there; off the board it's taken up.
  const to = q(k.tx - 2, k.ty, 3, 2);
  s.hover({ cellX: r.x + 1, cellY: r.y + 1, overBoard: true, overPalette: false });
  const moved = s.release({ cellX: ((to.qx + 0.5) * SUB) / QUARTER, cellY: ((to.qy + 0.5) * SUB) / QUARTER, overBoard: true, overPalette: false });
  assert.equal(moved.kind, "build");
  assert.deepEqual(moved.kind === "build" && moved.layout.walls, [to]);
  const s2 = EditSession.lift(map, placed, r.x, r.y)!;
  s2.hover({ cellX: r.x, cellY: r.y, overBoard: true, overPalette: false });
  const gone = s2.release({ cellX: 0, cellY: 0, overBoard: false, overPalette: true });
  assert.equal(gone.kind === "build" && gone.layout.walls, undefined);
  // The overlay shows the finer grid.
  const p = new EditSession({ from: "palette", item: "wallBlock" }, l);
  p.hover({ cellX: r.x + 0.5, cellY: r.y + 0.5, overBoard: true, overPalette: false });
  const o = p.overlay()!;
  assert.ok(o.walls && o.walls.fits && o.walls.legal.size === legal.size);
  assert.deepEqual(o.ghost?.rect, r);
});

test("a city tile takes its inner walls along; one placed over walls drops them without Town walls", () => {
  const base = { ...defaultLayout(), innerWalls: true as const }, k = keepOf(base);
  let l = placeCityTile(base, k.tx + 1, k.ty)!;
  l = placeWall(l, q(k.tx + 1, k.ty, 2, 2))!;
  assert.ok(l);
  const moved = moveCityTile(l, { tx: k.tx + 1, ty: k.ty }, { tx: k.tx + 3, ty: k.ty - 2 })!;
  assert.deepEqual(moved.walls, [q(k.tx + 3, k.ty - 2, 2, 2)]);
  // Without Town walls, a tile laid over a wall takes it up.
  const plain = placeWall(defaultLayout(), q(k.tx + 1, k.ty, 2, 2))!;
  const over = placeCityTile(plain, k.tx + 1, k.ty)!;
  assert.equal(over.walls, undefined);
  assert.equal(withInnerWalls(l, undefined).walls, undefined, "losing Town walls takes up the inner ones");
});

test("wall sections are bought cheaply, counted, and saved", () => {
  const s = defaults();
  assert.equal(s.defend.owned.wallBlock, 8);
  assert.deepEqual(purchasePrice("wallBlock", 8), { copper: 1 });
  assert.ok((purchasePrice("wallBlock", 30).copper ?? 0) < 15, "the price climbs slowly");
  const k = keepOf(s.defend.layout);
  s.defend.layout = placeWall(placeWall(s.defend.layout, q(k.tx - 2, k.ty))!, q(k.tx - 2, k.ty, 1))!;
  assert.equal(available(s.defend, "wallBlock"), 6);
  s.defend.wallRanks = { stonework: 2, townWalls: 1 };
  const back = decode(JSON.stringify(s));
  assert.deepEqual(back.defend.layout.walls, s.defend.layout.walls);
  assert.deepEqual(back.defend.wallRanks, { stonework: 2, townWalls: 1 });
  assert.equal(back.defend.layout.innerWalls, true, "Town walls let the layout keep inner walls");
  // A save with more walls than it owns is dropped; one before walls has none.
  const over = JSON.parse(JSON.stringify(s));
  over.defend.layout.walls = Array.from({ length: 9 }, (_, i) => ({ qx: QUARTER + i, qy: (k.ty - 2) * QUARTER }));
  assert.equal(decode(JSON.stringify(over)).defend.layout.walls, undefined);
  const old = JSON.parse(JSON.stringify(defaults()));
  delete old.defend.owned.wallBlock;
  assert.equal(decode(JSON.stringify(old)).defend.owned.wallBlock, 8);
});

test("the walls' branches climb side by side, and a respec gives back the Knowledge and takes up inner walls", () => {
  const s = defaults();
  s.knowledge = 1e6;
  for (const p of WALL_PATHS) assert.ok(upgradeWalls(s, p.id).ok, p.id);
  assert.deepEqual(s.defend.wallRanks, { stonework: 1, thornwork: 1, townWalls: 1 });
  assert.equal(s.defend.layout.innerWalls, true, "Inner walls opens the city to them");
  assert.equal(bonuses(s).walls?.thornwork, 1);
  const k = keepOf(s.defend.layout);
  s.defend.layout = placeWall(s.defend.layout, q(k.tx, k.ty, 3, 3))!;
  assert.ok(s.defend.layout);
  // The tree as Defend shows it.
  assert.equal(wallStep(s.defend.wallRanks, "q:stonework:2"), "stonework");
  assert.equal(wallStep(s.defend.wallRanks, "q:stonework:3"), undefined);
  assert.equal(wallGraph(s.defend.wallRanks).length, 1 + WALL_PATHS.reduce((n, p) => n + p.ranks.length, 0));
  assert.match(wallCardHtml(s, s.defend.wallRanks, "q:townWalls:2"), /data-ug-buy="q:townWalls:2"/);
  assert.match(wallCardHtml(s, s.defend.wallRanks, "k:wallBlock"), /HP a stone/);
  s.smithy.copper = 0;
  const before = s.knowledge, all = wallAllocated(s.defend.wallRanks);
  assert.ok(respecWalls(s).ok);
  assert.equal(s.knowledge, before + all);
  assert.equal(s.defend.wallRanks, undefined);
  assert.equal(s.defend.layout.innerWalls, undefined);
  assert.equal(s.defend.layout.walls, undefined, "the inner wall went back to the palette");
});

/** A battle in the default city with a row of walls left of the keep. */
function battle(walls?: typeof NO_BONUSES.walls) {
  let l = defaultLayout();
  const k = keepOf(l);
  for (let ax = 0; ax < QUARTER; ax++) l = placeWall(l, q(k.tx - 2, k.ty, ax, 1))!;
  const map = generateCity(fitLayout(l) as never, 3);
  return new DefendSim(map, { ...defaults().defend.levels }, 1, { ...NO_BONUSES, ...(walls ? { walls } : {}) });
}
const enemyAt = (sim: DefendSim, x: number, y: number): Enemy => {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e); (sim as any).indexEnemies(); return e;
};

test("Stonework hardens and mends placed walls, not the city's", () => {
  const plain = battle(), stone = battle({ stonework: 3 });
  const piece = plain.pieces[0], ring = plain.map.buildings.find((b) => b.kind === "wall" && !b.piece)!;
  assert.equal(plain.pieces.length, stone.pieces.length);
  assert.ok(Math.abs(stone.maxHp[piece.id] - plain.maxHp[piece.id] * STONEWORK.hp[3]) < 1e-3);
  assert.equal(stone.maxHp[ring.id], plain.maxHp[ring.id]);
  stone.hp[piece.id] = stone.maxHp[piece.id] / 2;
  stone.update(1);
  assert.ok(stone.hp[piece.id] > stone.maxHp[piece.id] / 2, "it mends");
});

test("Thornwork cuts enemies touching a placed wall, and slows them at III", () => {
  const sim = battle({ thornwork: 3 });
  const b = sim.pieces[0], i = b.cells[0];
  const x = (i % CELLS_W) + 0.5, y = Math.floor(i / CELLS_W) + 0.5;
  const e = enemyAt(sim, x - 0.8, y);
  const far = enemyAt(sim, x - 6, y);
  (sim as any).stepAttacks(0.01);
  assert.equal(e.hp, 1e6 - THORNWORK.damage[3]);
  assert.ok((e.chill ?? 0) > 0);
  assert.equal(far.hp, 1e6);
});

test("Posterns let the city's own people through placed walls; enemies are still stopped", () => {
  const shut = battle({ townWalls: 1 }), open = battle({ townWalls: 2 });
  const c = open.pieces[0].cells[0];
  assert.equal(shut.ownSolid[c], 1);
  assert.equal(open.ownSolid[c], 0);
  assert.equal(open.solid[c], 1);
});
