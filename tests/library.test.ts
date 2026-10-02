// The Library: shelves stacking up the nave, librarians shuffling books,
// indexers at the tables, the day and night, and the save.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BAYS, FLOOR, LibrarySim, MAX_LIBRARIANS, MAX_SHELVES, MAX_UNITS, SHELF_ORDER, SHELF_TOP, W, WINDOW, decodeLibrarySave, librarianPrice, shelfPrice, slotPlace, unitTop,
} from "../src/library/sim.ts";
import { DAY_MS, daylight } from "../src/library/render.ts";
import { decode } from "../src/save.ts";

const run = (sim: LibrarySim, seconds: number) => {
  for (let t = 0; t < seconds * 10; t++) sim.step(0.1);
};

test("shelves rise evenly from the middle, never floating, and stop short of the window", () => {
  const seen = new Set<string>(), heights = new Array(BAYS).fill(0);
  assert.equal(SHELF_ORDER.length, MAX_SHELVES);
  for (const { bay, unit } of SHELF_ORDER) {
    assert.equal(unit, heights[bay], `bay ${bay} grows one unit at a time`);
    heights[bay]++;
    seen.add(`${bay}:${unit}`);
    assert.ok(Math.max(...heights) - Math.min(...heights) <= 1, "bays stay level");
  }
  assert.equal(seen.size, MAX_SHELVES);
  assert.ok(unitTop(MAX_UNITS - 1) >= SHELF_TOP && SHELF_TOP > WINDOW.bottom, "the top shelf stays under the sill");
  assert.ok([4, 5].includes(SHELF_ORDER[0].bay), "the first shelf stands mid-nave");
});

test("librarians shuffle books, build ladders and index at the tables, losing none", () => {
  const sim = new LibrarySim(7);
  for (let i = 0; i < 40; i++) sim.buildShelf();
  for (let i = 0; i < 9; i++) sim.hire();
  const books = sim.books, before = new Uint8Array(sim.slots);
  let wrote = false, climbed = false;
  for (let k = 0; k < 120; k++) {
    run(sim, 1);
    assert.equal(sim.books, books, "no book made or lost");
    for (const l of sim.librarians) {
      assert.ok(l.x >= 0 && l.x <= W && l.y <= FLOOR && l.y > SHELF_TOP, `librarian ${l.id} in the nave at ${l.x},${l.y}`);
      if (l.action === "write") wrote = true;
      if (l.y < FLOOR - 10) climbed = true;
    }
  }
  assert.notDeepEqual(sim.slots, before, "books moved");
  assert.ok(wrote, "an indexer wrote at a table");
  assert.ok(climbed, "someone climbed a ladder");
  for (let b = 0; b < BAYS; b++) assert.ok(sim.ladders[b] <= sim.bayHeight(b), "ladders only as tall as their shelves");
  assert.ok(sim.ladders.some((h) => h > 1), "ladders went up");
  sim.slots.forEach((c, s) => {
    if (c) assert.ok(slotPlace(s).unit < sim.bayHeight(slotPlace(s).bay), "books only on built shelves");
  });
});

test("an empty nave: librarians wander and read without shelves", () => {
  const sim = new LibrarySim(3);
  sim.hire();
  sim.hire();
  run(sim, 30);
  assert.equal(sim.books, 0);
  assert.ok(sim.librarians.every((l) => l.y === FLOOR));
});

test("a library saves and loads; a malformed save is dropped", () => {
  const sim = new LibrarySim(11);
  for (let i = 0; i < 25; i++) sim.buildShelf();
  for (let i = 0; i < 4; i++) sim.hire();
  run(sim, 40);
  const books = sim.books;
  const saved = JSON.parse(JSON.stringify(sim.save()));
  const back = decodeLibrarySave(saved);
  assert.ok(back);
  const loaded = new LibrarySim(back.seed, back);
  assert.equal(loaded.shelves, 25);
  assert.equal(loaded.librarians.length, 4);
  assert.equal(loaded.books, books, "books in hand are shelved on saving");
  assert.deepEqual(loaded.ladders, sim.ladders);
  assert.equal(decodeLibrarySave({ ...saved, shelves: MAX_SHELVES + 1 }), null);
  assert.equal(decodeLibrarySave({ ...saved, ladders: [1] }), null);
  assert.equal(decodeLibrarySave({ ...saved, hired: MAX_LIBRARIANS + 1 }), null);
  assert.equal(decode(JSON.stringify({ version: 1, library: saved })).library?.shelves, 25);
  assert.equal(decode(JSON.stringify({ version: 1, library: { seed: 1 } })).library, null);
});

test("day and night come round, and prices climb", () => {
  assert.equal(daylight(DAY_MS / 4), 1);
  assert.equal(daylight((3 * DAY_MS) / 4), 0);
  for (let n = 0; n < 20; n++) {
    assert.ok(shelfPrice(n + 1) > shelfPrice(n));
    assert.ok(librarianPrice(n + 1) > librarianPrice(n));
  }
});
