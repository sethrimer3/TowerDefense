// The Library: shelves stacking up the nave, built from outlines with
// planks the shelvers wheel in; books wheeled in, read once by professors
// and wheeled out from the return shelf; researchers in the lab; fires,
// firefighting and rebuilding; Knowledge; and the save.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BAYS, EXITS, FLOOR, H, HALL, LAB_FLOOR, LAB_MAX_LEVEL, LibrarySim, labPrice, RETURN_BOOKS, ROLES, STAIR_X, librarianName, roleFor, MAX_LIBRARIANS, MAX_SHELVES, MAX_UNITS, PLANKS, SHELF_ORDER, SHELF_TOP, SLOTS, W, WINDOW,
  BUTT_FULL, accidentChance, decodeLibrarySave, enchantChance, slotPixel, homeBay, fireDrill, knowledgeRate, librarianPrice, shelfPrice, slotPlace, unitTop,
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
  for (let i = 0; i < 4; i++) sim.hire("shelver");
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

test("professors read each book once and put it on the return shelf; shelvers wheel the read ones out for fresh", () => {
  const sim = new LibrarySim(7);
  sim.furnish(40);
  for (let i = 0; i < 6; i++) sim.hire("professor");
  for (let i = 0; i < 3; i++) sim.hire("shelver");
  const start = sim.books;
  let studied = false, climbed = false, returned = 0, readNotAtTable = false;
  for (let k = 0; k < 600; k++) {
    run(sim, 1);
    assert.equal(ledger(sim), start, "no book made or lost");
    assert.ok(sim.returns.length <= RETURN_BOOKS);
    for (const l of sim.librarians) {
      assert.ok(l.x >= -HALL && l.x <= W + HALL && l.y <= FLOOR && l.y > SHELF_TOP, `librarian ${l.id} in the nave or a hallway at ${l.x},${l.y}`);
      if (l.action === "study") {
        studied = true;
        assert.equal(l.role, "professor", "only professors read");
      }
      if (l.action === "read") readNotAtTable = true;
      if (l.y < FLOOR - 10) climbed = true;
      if (l.spent) assert.equal(l.role === "professor" || l.role === "shelver", true);
    }
    returned = Math.max(returned, sim.returns.length);
  }
  assert.ok(studied && readNotAtTable, "professors read at the tables, and standing with the seats taken");
  assert.ok(climbed, "someone climbed a ladder");
  assert.ok(sim.read > 30, `${sim.read} books read`);
  assert.ok(returned > 0, "read books went onto the return shelf");
  assert.ok(sim.booksOut > 0 && sim.booksIn > 0, "the read books were wheeled out and fresh ones wheeled in");
  // Read books never go back on the shelves: every one read left the library or waits to.
  const loose = sim.librarians.filter((l) => l.spent && l.carrying).length + sim.librarians.filter((l) => l.reading).length;
  assert.ok(sim.read <= sim.booksOut + sim.returns.length + sim.bookCart.books.length + loose, "no book is read twice");
});

test("researchers go down the ladder to the alchemy lab and work it; the lab is safe from fire", () => {
  const sim = new LibrarySim(19);
  sim.furnish(20);
  sim.hire("professor");
  sim.upgradeLab();
  sim.hire("researcher");
  sim.hire("researcher");
  const seen = new Set<string>();
  let climbing = false;
  run(sim, 600, () => {
    for (const l of sim.librarians) {
      if (l.role !== "researcher") continue;
      if (l.y > FLOOR && l.y < LAB_FLOOR) {
        climbing = true;
        assert.equal(l.x, STAIR_X, "down the ladder");
      }
      if (l.y === LAB_FLOOR) seen.add(l.action);
    }
  });
  assert.ok(climbing, "the researchers climbed down");
  assert.ok(sim.librarians.filter((l) => l.role === "researcher").every((l) => l.y === LAB_FLOOR), "both in the lab");
  for (const a of ["stoke", "stir", "distill", "study", "chant"]) assert.ok(seen.has(a), `a researcher did ${a} (${[...seen]})`);
  assert.equal(sim.rate, sim.built * 1, "researchers earn no Knowledge themselves");
  // A fire upstairs: nobody in the lab notices, or is hurt.
  sim.ignite(0);
  run(sim, 400);
  assert.equal(sim.librarians.filter((l) => l.role === "researcher").length, 2);
  assert.ok(sim.librarians.filter((l) => l.role === "researcher").every((l) => l.y === LAB_FLOOR && l.mode === "work"));
  // Put back to the stacks, a researcher climbs up again.
  const r = sim.librarians.find((l) => l.role === "researcher")!;
  assert.ok(sim.setRole(r, "shelver"));
  assert.equal(sim.setRole(r, "shelver"), false, "already a shelver");
  run(sim, 60);
  assert.equal(r.y, FLOOR, "back up in the nave");
  assert.ok(r.y <= H);
});

test("roles: new hires read, shelve, research, then fill shelving and reading; each has a name and a hat", () => {
  assert.equal(roleFor({ shelver: 0, professor: 0, researcher: 0 }), "professor");
  assert.equal(roleFor({ shelver: 0, professor: 1, researcher: 0 }), "shelver");
  assert.equal(roleFor({ shelver: 1, professor: 1, researcher: 0 }), "researcher");
  assert.equal(roleFor({ shelver: 1, professor: 1, researcher: 1 }), "professor");
  assert.equal(roleFor({ shelver: 1, professor: 2, researcher: 1 }), "shelver");
  const sim = new LibrarySim(23);
  for (let i = 0; i < MAX_LIBRARIANS; i++) sim.hire();
  const r = sim.roles;
  assert.equal(r.researcher, 1);
  assert.ok(Math.abs(r.shelver - r.professor) <= 1);
  assert.equal(new Set(sim.librarians.map((l) => l.name)).size, MAX_LIBRARIANS, "no two share a name");
  for (const l of sim.librarians) assert.equal(l.hat === "mortarboard", l.role === "professor");
  assert.equal(librarianName(3, 23), librarianName(3, 23), "a name is fixed by the seed and hire");
  // A lone professor shelves too: the outline gets built.
  const lone = new LibrarySim(29);
  lone.buildShelf();
  lone.hire();
  run(lone, 300);
  assert.equal(lone.built, 1, "with no shelvers, the professors build");
  assert.ok(ROLES.length === 3);
});

test("shelvers sort the stacks by colour; librarians talk, gaze up at the window and take tea when tired", () => {
  const sim = new LibrarySim(13);
  sim.furnish(40, 0.4);
  for (let i = 0; i < 9; i++) sim.hire();
  const misplaced = () => {
    let n = 0;
    sim.slots.forEach((c, s) => (n += c && slotPlace(s).bay !== homeBay(c) ? 1 : 0));
    return n;
  };
  const before = misplaced(), seen = new Set<string>();
  run(sim, 900, () => {
    for (const l of sim.librarians) {
      seen.add(l.action);
      if (l.hand === "cup") seen.add("cup");
      const now = l.steps[0];
      if (now?.kind === "work" && now.action === "chat") assert.ok(l.with, "talking with someone");
    }
  });
  assert.ok(sim.sorted > 20 && misplaced() < before, `books sorted into their colours' bays (${before} misplaced, now ${misplaced()})`);
  for (const a of ["chat", "gaze", "drink", "cup"]) assert.ok(seen.has(a), `someone did ${a}`);
  assert.ok(sim.librarians.every((l) => l.energy >= 0 && l.energy <= 1));
});

test("by night half the librarians go home and come back by day; the tired doze at the tables", () => {
  const sim = new LibrarySim(17);
  sim.furnish(20);
  for (let i = 0; i < 8; i++) sim.hire();
  run(sim, 20);
  sim.night = 1;
  let dozed = false;
  run(sim, 600, () => {
    for (const l of sim.librarians) if (l.action === "doze") dozed = true;
  });
  const home = sim.librarians.filter((l) => l.home && l.away).length;
  assert.ok(home >= 2 && home <= 4, `${home} went home`);
  assert.ok(dozed, "someone dozed at a table");
  sim.night = 0;
  run(sim, 60);
  assert.equal(sim.librarians.filter((l) => l.home).length, 0, "all back by day");
});

test("after a fire the dead are mourned and swept up, and the water butts refilled", () => {
  const sim = new LibrarySim(5);
  sim.furnish(40);
  for (let i = 0; i < 10; i++) sim.hire();
  run(sim, 20);
  sim.fireTraining = 2;
  sim.ignite(0);
  let low = BUTT_FULL;
  run(sim, 400, () => (low = Math.min(low, ...sim.butts)));
  assert.ok(!sim.fire.active);
  assert.ok(low < BUTT_FULL, "the buckets came from the butts");
  // A death to mourn, if the fire took nobody.
  if (!sim.remains.length) sim.remains.push({ x: 90, at: sim.time, mourners: [] });
  let mourned = false;
  run(sim, 400, () => {
    for (const l of sim.librarians) if (l.action === "mourn") mourned = true;
  });
  assert.ok(mourned, "the dead were mourned");
  assert.equal(sim.remains.length, 0, "and their ashes swept up");
  assert.deepEqual(sim.butts, [BUTT_FULL, BUTT_FULL], "the butts were filled again");
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
  let fled = false, fought = false, threw = false, ash = false;
  run(sim, 600, () => {
    if (sim.fire.ash.some((v) => v > 0)) ash = true;
    for (const l of sim.librarians) {
      if (l.mode === "flee" && (l.x < 0 || l.x > W)) fled = true;
      if (l.mode === "fight" && l.hand === "bucket") fought = true;
      if (l.action === "throw") threw = true;
    }
  });
  assert.ok(!sim.fire.active, "the fire burnt out");
  assert.ok(fled, "librarians fled down the hallways");
  assert.ok(fought && threw, "some fetched buckets and threw them");
  assert.equal(sim.shelves, 40, "all purchased shelves are retained for repair");
  assert.ok(sim.booksBurnt > 0, "books burnt");
  assert.ok(sim.lost, "what the fire cost is told");
  assert.equal(sim.lost.librarians, sim.deaths);
  assert.equal(sim.librarians.length, 8 - sim.deaths, "the dead are gone until hired again");
  assert.equal(librarianPrice(sim.hired), librarianPrice(8 - sim.deaths), "and cost as much as hiring new");
  for (let b = 0; b < BAYS; b++) {
    const h = sim.bayHeight(b);
    for (let u = h; u < MAX_UNITS; u++) assert.equal(sim.units[b * MAX_UNITS + u], -1, "nothing stands on a burnt-out shelf");
  }
  // Damaged shelves are repaired in place for free.
  const standing = sim.shelves;
  sim.fireproof = Infinity;
  run(sim, 6000);
  assert.equal(sim.shelves, standing, "no burnt shelf comes back by itself");
  assert.equal(sim.built, standing, "every damaged shelf was rebuilt");
  assert.ok(sim.buildShelf(), "new shelves can still be bought");
  assert.ok(ash, "burnt wood fell as ash");
  assert.ok(!sim.fire.ash.some((v) => v > 0) && !sim.fire.smoke.some((v) => v > 0), "no ash or smoke outlasts the fire");
});

test("after a fire, rebuilding starts at once rather than waiting on every charred book carried out", () => {
  const sim = new LibrarySim(7);
  for (let i = 0; i < 16; i++) sim.hire(i < 13 ? "shelver" : "professor");
  for (let i = 0; i < 110; i++) sim.buildShelf();
  // Built up, until the first fire (this seed's burns most of the stacks).
  for (let t = 0; t < 72000 && !sim.fire.active; t++) sim.step(0.1);
  for (let t = 0; t < 6000 && sim.fire.active; t++) sim.step(0.1);
  assert.ok(!sim.fire.active);
  sim.fireproof = Infinity;
  const built = sim.built, charred = () => sim.burntSlots.reduce((n, c) => n + (c ? 1 : 0), 0) + sim.burntLoose.length;
  assert.ok(charred() > 50, `plenty of charred books to carry out (${charred()})`);
  run(sim, 300);
  assert.ok(sim.built > built, `shelves rebuilt while the charred books go out (${built} -> ${sim.built})`);
  run(sim, 7200);
  assert.equal(charred(), 0, "and every charred book is carried out in the end");
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
    sim.fire.char.fill(0);
  }
  assert.ok(fires > 15 && fires < 50, `${fires} fires in 3000 minutes`);
});

test("Knowledge: shelves built × professors an hour", () => {
  assert.equal(knowledgeRate(10, 3), 30);
  const sim = new LibrarySim(2);
  sim.furnish(6);
  sim.buildShelf();
  sim.hire("professor");
  sim.hire("professor");
  sim.hire("shelver");
  sim.hire("researcher");
  assert.equal(sim.rate, 12, "outlines earn nothing until built; only professors earn");
  sim.setRole(sim.librarians[2], "professor");
  assert.equal(sim.rate, 18);
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
  assert.deepEqual(loaded.librarians.map((l) => [l.name, l.role]), sim.librarians.map((l) => [l.name, l.role]), "names and roles kept");
  assert.ok(loaded.librarians.filter((l) => l.role === "researcher").every((l) => l.y === LAB_FLOOR), "researchers load in the lab");
  assert.deepEqual(loaded.returns, sim.returns.concat(sim.librarians.filter((l) => l.spent && l.carrying).map((l) => l.carrying)).slice(0, RETURN_BOOKS));
  const { crew: _c, returns: _r, ...before } = saved;
  const roleless = decodeLibrarySave(before);
  assert.ok(roleless && !roleless.crew, "a save from before roles loads");
  assert.deepEqual(new LibrarySim(roleless.seed, roleless).librarians.map((l) => l.role), ["professor", "shelver", "researcher", "professor"], "and its librarians are given roles");
  assert.equal(decodeLibrarySave({ ...saved, crew: [{ name: "X", role: "jester" }] })?.crew, undefined, "a malformed crew is dropped");
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


test("the lab has room for a researcher a level; expanding it opens annexes and their errands, and the level is saved", () => {
  const sim = new LibrarySim(31);
  sim.furnish(10);
  assert.equal(sim.labLevel, 1);
  assert.equal(sim.researcherCap, 1);
  for (let i = 0; i < 6; i++) sim.hire();
  assert.equal(sim.count("researcher"), 1, "one researcher in a level 1 lab");
  const other = sim.librarians.find((l) => l.role !== "researcher")!;
  assert.equal(sim.setRole(other, "researcher"), false, "no room for a second");
  assert.equal(roleFor({ shelver: 1, professor: 1, researcher: 0 }, 0), "professor", "no room, no researcher");
  assert.equal(labPrice(1), 1500);
  assert.ok(labPrice(2) > labPrice(1));
  for (let level = 2; level <= LAB_MAX_LEVEL; level++) assert.ok(sim.upgradeLab());
  assert.equal(sim.upgradeLab(), false, "no further than the top");
  assert.equal(sim.researcherCap, LAB_MAX_LEVEL);
  for (const l of sim.librarians) if (sim.count("researcher") < sim.researcherCap) sim.setRole(l, "researcher");
  assert.equal(sim.count("researcher"), LAB_MAX_LEVEL);
  const seen = new Set<string>();
  let west = false, east = false;
  run(sim, 1500, () => {
    for (const l of sim.librarians) {
      if (l.role !== "researcher" || l.y !== LAB_FLOOR) continue;
      seen.add(l.action);
      if (l.x < 0) west = true;
      if (l.x > W) east = true;
    }
  });
  assert.ok(west && east, "researchers work in both annexes");
  for (const a of ["tend", "recite", "cast", "wind", "scry", "feed"]) assert.ok(seen.has(a), `a researcher did ${a} (${[...seen]})`);
  assert.ok(sim.lab.casts > 0, "gold was cast");
  const saved = decodeLibrarySave(JSON.parse(JSON.stringify(sim.save(1000))))!;
  assert.equal(saved.lab, LAB_MAX_LEVEL);
  const back = new LibrarySim(saved.seed, saved);
  assert.equal(back.labLevel, LAB_MAX_LEVEL);
  assert.equal(back.count("researcher"), LAB_MAX_LEVEL);
  // A save from before lab levels gets room for the researchers it had.
  const old = { ...saved, lab: undefined, crew: saved.crew!.map((c, n) => ({ ...c, role: n < 3 ? "researcher" as const : c.role })) };
  const older = new LibrarySim(old.seed, decodeLibrarySave(JSON.parse(JSON.stringify(old)))!);
  assert.equal(older.labLevel, older.count("researcher"));
  assert.ok(older.labLevel >= 3);
});

test("enchanted ink: shelved books take on runes, keep them on the move, and give Knowledge when read", () => {
  const none = new LibrarySim(3);
  none.furnish(20);
  run(none, 600);
  assert.equal(none.enchanted.reduce((a, b) => a + b, 0), 0, "no runes without Enchanted ink");
  assert.equal(enchantChance(1), 1 / 10000);

  const sim = new LibrarySim(3);
  sim.furnish(20);
  for (let i = 0; i < 4; i++) sim.hire();
  sim.enchant = 10000; // a certainty, for the test
  const only = () => {
    for (let s = 0; s < SLOTS; s++) if (sim.enchanted[s]) assert.ok(sim.slots[s], "only a shelved book carries runes");
  };
  run(sim, 61, only);
  const shelved = sim.slots.reduce((n, c) => n + (c ? 1 : 0), 0);
  assert.ok(shelved > 0 && sim.enchanted.reduce((a, b) => a + b, 0) >= shelved - 4, "nearly every shelved book took on runes");
  sim.enchant = 0;
  let gift = 0;
  run(sim, 400, () => { only(); gift += sim.takeBonus(); });
  assert.ok(gift >= 25 && sim.runesRead === gift, "reading an enchanted book gave Knowledge");
  const save = decodeLibrarySave(JSON.parse(JSON.stringify(sim.save(0))))!;
  assert.ok(save.enchanted);
  const again = new LibrarySim(3, save);
  const runes = again.enchanted.reduce((a, b) => a + b, 0);
  assert.ok(runes > 0, "runes survive a save");
  for (let s = 0; s < SLOTS; s++) if (again.enchanted[s]) assert.ok(again.slots[s]);
  assert.equal(again.runesRead, sim.runesRead);
});

test("charred books fall with the shelf burnt away under them rather than hang in the air", () => {
  const sim = new LibrarySim(5);
  sim.furnish(40);
  for (let i = 0; i < 6; i++) sim.hire();
  run(sim, 20);
  sim.ignite(0);
  run(sim, 600, () => {
    for (let s = 0; s < SLOTS; s++) {
      if (!sim.burntSlots[s] || sim.fire.active) continue;
      const p = slotPixel(s);
      assert.ok(sim.fire.left(p.x, p.y + 1) >= 0.3, "a charred book stays only on a shelf that still stands");
    }
  });
  assert.ok(sim.booksBurnt > 0);
});
