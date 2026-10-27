import test from "node:test";
import assert from "node:assert/strict";
import { AMBUSH_LEVELS, trackFor, squareAt, laneCount, decodeAmbush, totalStars, levelUnlocked, recordStars } from "../src/campaign/levels.ts";
import { CELLS_W, CELLS_H, cellIndex } from "../src/defend/grid.ts";
import { dist } from "../src/exact.ts";
import { ambushField } from "../src/campaign/battlefield.ts";
import { CellType } from "../src/defend/citygen.ts";
test("Thirty seeded levels wind their lanes from the board's edges to the keep, more lanes later on", () => {
  assert.equal(AMBUSH_LEVELS.length, 30);
  assert.equal(new Set(AMBUSH_LEVELS.map((l) => l.seed)).size, 30);
  const shapes = new Set<string>();
  for (const [i, level] of AMBUSH_LEVELS.entries()) {
    const track = trackFor(level);
    assert.deepEqual(track, trackFor(level));
    assert.equal(track.lanes.length, laneCount(level));
    assert.equal(laneCount(level), i >= 21 ? 3 : i >= 9 ? 2 : 1);
    assert.deepEqual(track.points, track.lanes[0]);
    for (const lane of track.lanes) {
      const entry = lane[0];
      assert.ok(entry.x === 0 || entry.x === CELLS_W - 1 || entry.y === 0, "Every lane comes in from an edge");
      assert.deepEqual(lane.at(-1), track.keep);
      for (const p of lane) assert.ok(p.x >= 0 && p.x < CELLS_W && p.y >= 0 && p.y < CELLS_H);
      // Lanes only ever run across or down the board, so none crosses itself.
      for (let k = 1; k < lane.length; k++) assert.ok(lane[k].y >= lane[k - 1].y);
      const length = lane.slice(1).reduce((n, b, k) => n + dist(b.x - lane[k].x, b.y - lane[k].y), 0);
      assert.ok(length > 80 && length < 420, `${level.id}: ${length}`);
      shapes.add(lane.map((p) => p.x + ":" + p.y).join(","));
    }
    const squares = track.outposts.map((o) => squareAt(o, 16)),
      castle = squareAt(track.keep, 20),
      apart = (a: typeof castle, b: typeof castle) => a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h;
    assert.equal(squares.length, 2);
    assert.ok(apart(squares[0], squares[1]) && squares.every((q) => apart(q, castle)));
  }
  assert.ok(shapes.size >= 60, "Every lane is its own shape");
  const rivers = AMBUSH_LEVELS.filter((l) => trackFor(l).river);
  assert.ok(rivers.length >= 8);
  assert.ok(AMBUSH_LEVELS.filter((l) => l.area === "drowned").every((l) => trackFor(l).river));
});
test("Rivers are bridged where a lane crosses them, and every entry's road reaches the keep", () => {
  for (let index = 0; index < 30; index++) {
    const field = ambushField(index);
    for (const c of field.road) assert.notEqual(field.map.type[c], CellType.WATER);
    if (field.track.river) {
      assert.ok(
        field.map.bridges?.some((b) => b === 2),
        field.level.id + " has a bridge over its river",
      );
      for (let c = 0; c < field.map.type.length; c++) if (field.map.bridges?.[c]) assert.ok(field.road.has(c));
    } else assert.equal(field.map.bridges, undefined);
    const keep = new Set(field.map.buildings[0].cells);
    for (const lane of field.lanes) {
      const start = cellIndex(Math.min(CELLS_W - 1, lane[0].x), lane[0].y),
        seen = new Set([start]),
        queue = [start];
      let reached = false;
      while (queue.length && !reached) {
        const c = queue.pop()!,
          x = c % CELLS_W;
        for (const n of [x > 0 ? c - 1 : -1, x < CELLS_W - 1 ? c + 1 : -1, c - CELLS_W, c + CELLS_W]) {
          if (n < 0 || n >= field.map.type.length || seen.has(n)) continue;
          if (keep.has(n)) reached = true;
          if (field.road.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      assert.ok(reached, field.level.id + " lane from " + lane[0].x + "," + lane[0].y);
    }
  }
});
test("Best stars preserve improvements, unlock the next level and migrate old clears without pad layouts", () => {
  const p = decodeAmbush({ cleared: 2, layouts: [[{ pad: 0, kind: "archerTower" }]] });
  assert.equal(totalStars(p), 2);
  assert.ok(levelUnlocked(p, 2));
  assert.equal(levelUnlocked(p, 3), false);
  assert.equal("layouts" in p, false);
  assert.equal(recordStars(p, AMBUSH_LEVELS[0], 3), 2);
  assert.equal(recordStars(p, AMBUSH_LEVELS[0], 1), 0);
  assert.equal(totalStars(p), 4);
  recordStars(p, AMBUSH_LEVELS[2], 1);
  assert.ok(levelUnlocked(p, 3));
  assert.equal(levelUnlocked(p, 4), false);
  assert.deepEqual(decodeAmbush(p), p);
  assert.deepEqual(decodeAmbush({ stars: { "moss-1": 3, "moss-2": 4, "desert-1": NaN, bogus: 3 } }), { stars: { "moss-1": 3 } });
  for (const raw of [null, [], {}, false]) assert.equal(totalStars(decodeAmbush(raw)), 0);
});
test("Native maps use the seeded track, reach the board edge and preserve keep ownership", () => {
  for (let index = 0; index < 30; index += 3) {
    const field = ambushField(index),
      again = ambushField(index),
      entry = field.path[0],
      cell = Math.floor(entry.y) * CELLS_W + entry.x;
    assert.deepEqual(field.path, trackFor(AMBUSH_LEVELS[index]).points);
    assert.equal(field.map.type[cell], CellType.ROAD);
    assert.ok(field.road.has(cell));
    assert.ok(field.map.buildings[0].cells.every((c) => field.map.owner[c] === 0));
    assert.deepEqual(field.map.type, again.map.type);
    assert.ok(!Object.hasOwn(field, "pads"));
  }
});
