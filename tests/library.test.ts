// The Library: shelves stacking up the nave, built from outlines with
// planks the librarians wheel in; books wheeled in, shuffled, read and
// indexed; fires, firefighting and rebuilding; Knowledge; and the save.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BAYS, EXITS, FLOOR, HALL, LibrarySim, MAX_LIBRARIANS, MAX_SHELVES, MAX_UNITS, PLANKS, SHELF_ORDER, SHELF_TOP, SLOTS, W, WINDOW,
  accidentChance, decodeLibrarySave, fireDrill, knowledgeRate, librarianPrice, shelfPrice, slotPlace, unitTop,
} from "../src/library/sim.ts";
import { DAY_MS, daylight } from "../src/library/render.ts";
import { decode } from "../src/save.ts";

const run = (sim: LibrarySim, seconds: number, each?: () => void) => {
  for (let t = 0; t < seconds * 10; t++) {
    sim.step(0.1);
    each?.();
  }
};
/** Books the library holds, less those wheeled in, plus those wheeled out or burnt: constant. */
const ledger = (sim: LibrarySim) => sim.books - sim.booksIn + sim.booksOut + sim.booksBurnt;

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

test("a bought shelf is an outline until librarians wheel in planks and build it; then books arrive by cart", () => {
  const sim = new LibrarySim(5);
  for (let i = 0; i < 8; i++) sim.buildShelf();
  for (let i = 0; i < 4; i++) sim.hire();
  assert.equal(sim.shelves, 8);
  assert.equal(sim.built, 0, "bought shelves start as outlines");
  assert.equal(sim.books, 0);
  let barrow = false, pushedOut = false, plank = false, wentOut = false;
  run(sim, 400, () => {
    if (sim.barrow.here) barrow = true;
    for (const l of sim.librarians) {
      if (l.hand === "plank") plank = true;
      if (l.pushing && l.x < 0) pushedOut = true;
      if (l.away) wentOut = true;
    }
    for (let b = 0; b < BAYS; b++) assert.ok(sim.ladders[b] <= sim.bayComplete(b), "ladders only as tall as built shelves");
  });
  assert.ok(barrow && plank, "planks came by barrow and were carried to the shelves");
  assert.ok(wentOut && pushedOut, "librarians went out down the hallways with a cart");
  assert.equal(sim.built, 8, "every outline was built");
  assert.ok(sim.booksIn > 0 && sim.books > 0, "a cart of new books came in and was shelved");
  assert.equal(ledger(sim), 0, "every book accounted for");
  sim.slots.forEach((c, s) => {
    if (c) assert.ok(sim.isBuilt(slotPlace(s).bay, slotPlace(s).unit), "books only on built shelves");
  });
});

test("librarians shuffle, read and index books, carrying each one, losing none", () => {
  const sim = new LibrarySim(7);
  sim.furnish(40);
  for (let i = 0; i < 9; i++) sim.hire();
  const before = new Uint8Array(sim.slots);
  let wrote = false, climbed = false, read = false;
  for (let k = 0; k < 150; k++) {
    run(sim, 1);
    assert.equal(ledger(sim), before.reduce((n, c) => n + (c ? 1 : 0), 0), "no book made or lost");
    for (const l of sim.librarians) {
      assert.ok(l.x >= -HALL && l.x <= W + HALL && l.y <= FLOOR && l.y > SHELF_TOP, `librarian ${l.id} in the nave or a hallway at ${l.x},${l.y}`);
      if (l.action === "write") wrote = true;
      if (l.action === "read" && l.carrying) read = true;
      if (l.y < FLOOR - 10) climbed = true;
    }
  }
  assert.notDeepEqual(sim.slots, before, "books moved");
  assert.ok(wrote, "an indexer wrote at a table");
  assert.ok(read, "someone read a book they took down");
  assert.ok(climbed, "someone climbed a ladder");
});

test("an empty nave: librarians walk in from the hallway and wander", () => {
  const sim = new LibrarySim(3);
  sim.hire();
  sim.hire();
  assert.equal(sim.librarians[0].x, EXITS[0], "a new librarian comes in down the hallway");
  run(sim, 30);
  assert.equal(sim.books, 0);
  assert.ok(sim.librarians.every((l) => l.y === FLOOR && l.x > 0));
});

test("a fire burns the shelves, kills those caught in it, and the survivors flee or fight it", () => {
  const sim = new LibrarySim(5);
  sim.furnish(40);
  for (let i = 0; i < 8; i++) sim.hire();
  run(sim, 20);
  assert.ok(sim.ignite(0));
  assert.ok(sim.fire.active);
  let fled = false, fought = false, threw = false;
  run(sim, 600, () => {
    for (const l of sim.librarians) {
      if (l.mode === "flee" && (l.x < 0 || l.x > W)) fled = true;
      if (l.mode === "fight" && l.hand === "bucket") fought = true;
      if (l.action === "throw") threw = true;
    }
  });
  assert.ok(!sim.fire.active, "the fire burnt out");
  assert.ok(fled, "librarians fled down the hallways");
  assert.ok(fought && threw, "some fetched buckets and threw them");
  assert.ok(sim.built < 40, "shelves burnt");
  assert.ok(sim.booksBurnt > 0, "books burnt");
  assert.ok(sim.lost, "what the fire cost is told");
  assert.equal(sim.lost.librarians, sim.deaths);
  assert.equal(sim.librarians.length, 8 - sim.deaths, "the dead are gone until hired again");
  assert.equal(librarianPrice(sim.hired), librarianPrice(8 - sim.deaths), "and cost as much as hiring new");
  for (let b = 0; b < BAYS; b++) {
    const h = sim.bayHeight(b);
    for (let u = h; u < MAX_UNITS; u++) assert.equal(sim.units[b * MAX_UNITS + u], -1, "nothing stands on a burnt-out shelf");
  }
  // Survivors are rebuilt for free; the burnt-out must be bought again.
  const standing = sim.shelves;
  run(sim, 900);
  assert.equal(sim.shelves, standing, "no burnt shelf comes back by itself");
  assert.equal(sim.built, standing, "every damaged shelf was rebuilt");
  assert.ok(sim.buildShelf(), "burnt shelves can be bought again");
});

test("Fire Training puts fires out sooner, saving more", () => {
  const burn = (rank: number) => {
    const sim = new LibrarySim(5);
    sim.furnish(40);
    for (let i = 0; i < 8; i++) sim.hire();
    run(sim, 30);
    sim.fireTraining = rank;
    sim.ignite(0);
    let t = 0;
    while (sim.fire.active && t < 6000) {
      sim.step(0.1);
      t++;
    }
    return { seconds: t / 10, built: sim.built };
  };
  const none = burn(0), trained = burn(5);
  assert.ok(trained.seconds < none.seconds, `out in ${trained.seconds}s, not ${none.seconds}s`);
  assert.ok(trained.built > none.built, `${trained.built} shelves stand, not ${none.built}`);
  const d0 = fireDrill(0), d5 = fireDrill(5);
  assert.ok(d5.fight > d0.fight && d5.speed > d0.speed && d5.water > d0.water && d5.douse > d0.douse);
});

test("accidents: 1% a minute, 10% less for each rank of Fireproof Wood", () => {
  assert.equal(accidentChance(0), 0.01);
  assert.ok(Math.abs(accidentChance(1) - 0.009) < 1e-12);
  assert.ok(Math.abs(accidentChance(2) - 0.0081) < 1e-12);
  // Over many simulated hours, fires come at about that rate.
  const sim = new LibrarySim(9);
  sim.furnish(4);
  let fires = 0;
  for (let m = 0; m < 3000; m++) {
    run(sim, 60);
    if (sim.fire.active) {
      fires++;
      // Put it out at once, for the count.
      sim.fire.heat.fill(0);
      sim.fire.drops = [];
      run(sim, 1);
    }
    while (sim.tables.some((p) => p < 3)) sim.tables.fill(3);
  }
  assert.ok(fires > 15 && fires < 50, `${fires} fires in 3000 minutes`);
});

test("Knowledge: shelves built × librarians an hour", () => {
  assert.equal(knowledgeRate(10, 3), 30);
  const sim = new LibrarySim(2);
  sim.furnish(6);
  sim.buildShelf();
  sim.hire();
  sim.hire();
  assert.equal(sim.rate, 12, "outlines earn nothing until built");
});

test("a library saves and loads; an old save keeps its shelves; a malformed one is dropped", () => {
  const sim = new LibrarySim(11);
  sim.furnish(25);
  sim.buildShelf();
  for (let i = 0; i < 4; i++) sim.hire();
  run(sim, 40);
  const books = sim.books;
  const saved = JSON.parse(JSON.stringify(sim.save(1234)));
  const back = decodeLibrarySave(saved);
  assert.ok(back);
  assert.equal(back.savedAt, 1234);
  const loaded = new LibrarySim(back.seed, back);
  assert.equal(loaded.shelves, sim.shelves);
  assert.equal(loaded.built, sim.built);
  assert.equal(loaded.librarians.length, 4);
  assert.ok(loaded.books >= books - 2 * 4, "books in hand and in the cart are shelved on saving, where there's room");
  assert.deepEqual(loaded.ladders, sim.ladders);
  assert.equal(decodeLibrarySave({ ...saved, units: [1] }), null);
  assert.equal(decodeLibrarySave({ ...saved, ladders: [1] }), null);
  assert.equal(decodeLibrarySave({ ...saved, hired: MAX_LIBRARIANS + 1 }), null);
  const { units: _, ...old } = saved;
  const legacy = decodeLibrarySave({ ...old, shelves: 12 });
  assert.ok(legacy);
  assert.equal(new LibrarySim(legacy.seed, legacy).built, 12, "a save from before building keeps its shelves, built");
  assert.equal(decodeLibrarySave({ ...old, shelves: MAX_SHELVES + 1 }), null);
  assert.equal(decode(JSON.stringify({ version: 1, library: saved })).library?.units.filter((p) => p >= 0).length, sim.shelves);
  assert.equal(decode(JSON.stringify({ version: 1, library: { seed: 1 } })).library, null);
  assert.equal(decode(JSON.stringify({ version: 1, valor: 7 })).knowledge, 7, "Valor carries over as Knowledge");
  assert.equal(SLOTS, BAYS * MAX_UNITS * 2 * 7);
  assert.equal(PLANKS, 4);
});

test("day and night come round, and prices climb", () => {
  assert.equal(daylight(DAY_MS / 4), 1);
  assert.equal(daylight((3 * DAY_MS) / 4), 0);
  for (let n = 0; n < 20; n++) {
    assert.ok(shelfPrice(n + 1) > shelfPrice(n));
    assert.ok(librarianPrice(n + 1) > librarianPrice(n));
  }
});
