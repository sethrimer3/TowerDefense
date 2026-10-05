import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_AWAY_MS, HOUR_MS } from "../src/away.ts";
import { LibraryPage, type LibraryHost } from "../src/library/ui.ts";
import { MinePage, type MineHost } from "../src/mine/ui.ts";
import { LibrarySim, decodeLibrarySave, FLOOR, LAB_FLOOR, SLOTS, slotPixel, SHELF_ORDER, MAX_UNITS } from "../src/library/sim.ts";
import { MineSim, decodeMineSave } from "../src/mine/sim.ts";
import { Fire, cellAt, CELL, FW, decodeFireSave } from "../src/library/fire.ts";

function library() {
  let now = 100000, earned = 0;
  const host: LibraryHost = { gold: () => 0, free: () => false, spendGold() {}, effects: () => false,
    newSeed: () => 5, clock: () => now, earnKnowledge: (n) => earned += n,
    upgrades: () => ({ fireproof: 1000, fireTraining: 0, nightWatch: 0 }), showing: () => false };
  const page = new LibraryPage({} as HTMLElement, host);
  return { page, earned: () => earned, tick: () => { now += 16; page.advance(now); }, now: () => now };
}

test("Library queues the full capped absence without paying or replacing the library; only simulated time earns", () => {
  const l = library(), sim = new LibrarySim(5);
  sim.furnish(6); sim.hire("professor");
  const stamp = l.now() - MAX_AWAY_MS * 2;
  l.page.load(sim.save(stamp), l.now());
  assert.equal(l.earned(), 0);
  assert.equal(l.page.owedMs, MAX_AWAY_MS);
  assert.equal(l.page.sim.shelves, 6);
  assert.equal(l.page.sim.librarians.length, 1);
  const before = l.page.sim.time;
  l.tick();
  const simulated = l.page.sim.time - before;
  assert.ok(simulated > 0 && simulated < 3);
  assert.ok(Math.abs(l.earned() - 6 * simulated / 3600) < 1e-10);
  assert.equal(l.page.owedMs, MAX_AWAY_MS - simulated * 1000);
  const saved = decodeLibrarySave(JSON.parse(JSON.stringify(l.page.snapshot(l.now()))))!;
  const reloaded = library();
  reloaded.page.load(saved, l.now() + HOUR_MS);
  assert.equal(reloaded.earned(), 0);
  assert.equal(reloaded.page.owedMs, MAX_AWAY_MS);
  const small = library(); small.page.load(null, small.now()); small.page.addAway(10000);
  const kept = decodeLibrarySave(small.page.snapshot(small.now()))!;
  const back = library(); back.page.load(kept, small.now() + 1000);
  assert.equal(back.page.owedMs, 11000, "unused time plus new absence, once each");
});

test("Mine banks more than two hours, preserves the queue, and does not pay its historical pace", () => {
  let paid = 0, now = 100000;
  const host: MineHost = { gold: () => 0, free: () => false, spendGold() {}, earn: (p) => paid += p.copper + p.silver + p.gold,
    upgrades: () => ({ coffee: 0, waterproof: 0, smiths: 0 }), busySmiths: () => new Set(), effects: () => false,
    newSeed: () => 9, modal: {} as HTMLDialogElement, store() {} };
  const sim = new MineSim(9), saved = sim.save(now - 4 * HOUR_MS);
  saved.pace = { copper: 9999, silver: 9999, gold: 9999 };
  const page = new MinePage({} as HTMLElement, host);
  page.load(saved, now);
  assert.equal(paid, 0);
  assert.equal(page.owedMs, 4 * HOUR_MS);
  const before = page.sim.tick;
  now += 16; page.advance(now);
  assert.ok(page.sim.tick > before);
  assert.ok(page.owedMs < 4 * HOUR_MS);
  const kept = decodeMineSave(JSON.parse(JSON.stringify(page.snapshot(now))))!;
  const back = new MinePage({} as HTMLElement, host);
  back.load(kept, now + 1000);
  assert.ok(Math.abs(back.owedMs - page.owedMs - 1000) < 1e-6);
  const beforePay = paid;
  back.addAway(MAX_AWAY_MS * 2);
  assert.equal(paid, beforePay);
  assert.equal(back.owedMs, MAX_AWAY_MS);
});

test("cell fire consumes artwork pixels, produces buoyant smoke and falling ash, and water cools local fuel", () => {
  const f = new Fire(), rng = () => 0.5;
  f.load([{ x0: 40, y0: 200, x1: 44, y1: 204, fuel: 1 }]);
  f.ignite(40, 200);
  for (let n = 0; n < 250; n++) f.step(0.1, rng, 0);
  assert.ok(f.char[cellAt(40, 200)] > 0.9);
  assert.ok(f.missing(40, 200));
  assert.ok(f.smoke.some((d) => d > 0));
  assert.ok(f.ash.some((d) => d > 0));
  const g = new Fire();
  g.smoke[cellAt(80, 100)] = 255; g.ash[cellAt(80, 200)] = 1;
  const saved = g.save(); g.restore(saved, 0);
  g.step(0.1, rng, 0);
  assert.ok(g.smoke[cellAt(80, 100 - CELL)] > 0, "smoke rises one empty cell");
  assert.equal(g.ash[cellAt(80, 200 + CELL)], 1, "ash falls one empty cell");
  const wet = new Fire(); wet.load([{ x0: 40, y0: 200, x1: 44, y1: 204, fuel: 1 }]); wet.ignite(40, 200);
  wet.splash(41, 201, 41, 201, 8, 0.4, rng, 0.1); wet.step(0.1, rng, 1);
  assert.ok(wet.wet[cellAt(41, 201)] > 0);
  assert.ok(wet.heat[cellAt(41, 201)] < 0.5);
  assert.equal(decodeFireSave({ active: true, cells: [[FW * 1000, 0, 0, 0, 0, 0, 0, 0, 0, -1]], drops: [] }), null);
});

test("only librarians touching heat die; safe hallways and lab survive the same fire", () => {
  const sim = new LibrarySim(4);
  sim.hire("professor"); sim.hire("shelver"); sim.hire("researcher");
  const [caught, safe, below] = sim.librarians;
  caught.x = 48; caught.y = FLOOR; caught.scorched = 3.99;
  safe.x = -20; safe.y = FLOOR; below.y = LAB_FLOOR;
  sim.ignite(0); sim.fire.heat[cellAt(48, FLOOR - 1)] = 1.6;
  sim.step(0.1);
  assert.equal(sim.deaths, 1);
  assert.ok(!sim.librarians.includes(caught));
  assert.ok(sim.librarians.includes(safe) && sim.librarians.includes(below));
});

test("active fires, pixel damage, charred books and surviving books persist; shelvers remove debris and repair in place", () => {
  const sim = new LibrarySim(5); sim.furnish(10, 1); sim.hire("shelver"); sim.hire("professor");
  sim.fireproof = Infinity; sim.ignite(0);
  const slot = Array.from(sim.slots).findIndex((c) => c > 0), p = slotPixel(slot), i = cellAt(p.x, p.y);
  sim.fire.fuel[i] = 0; sim.fire.char[i] = 1;
  for (let n = 0; n < 5; n++) sim.step(0.1);
  assert.ok(sim.burntSlots[slot], "charred book remains until carried away");
  const saved = decodeLibrarySave(JSON.parse(JSON.stringify(sim.save(1000))))!;
  assert.ok(saved.fire?.active);
  const restored = new LibrarySim(saved.seed, saved);
  assert.ok(restored.fire.active);
  assert.equal(restored.fire.char[i], sim.fire.char[i]);
  assert.equal(restored.books, sim.books, "all surviving books kept on save");
  assert.equal(restored.burntSlots[slot], sim.burntSlots[slot]);
  restored.fire.heat.fill(0); restored.fire.drops = [];
  restored.fireproof = Infinity;
  restored.step(0.1);
  assert.equal(restored.shelves, 10, "damage retains shelf ownership");
  let carried = false;
  for (let n = 0; n < 60000; n++) {
    restored.step(0.1);
    carried ||= restored.librarians.some((l) => l.burntFrom >= 0 && l.carrying > 0);
    if (restored.built === 10 && !restored.burntSlots.some((c) => c > 0) && !restored.librarians.some((l) => l.burntFrom >= 0)) break;
  }
  assert.ok(carried, "a shelver physically carries the burnt book outside");
  assert.equal(restored.built, 10);
  assert.equal(restored.burntSlots[slot], 0);
  assert.equal(restored.damaged.size, 0);
});

test("Night Watch improves nighttime detection and bucket work without an arbitrary burn-down roll", () => {
  const sim = new LibrarySim(5); sim.night = 1; sim.fireTraining = 0;
  const before = (sim as any).drill(); sim.nightWatch = 9;
  const after = (sim as any).drill();
  assert.ok(after.speed > before.speed && after.water > before.water && after.douse > before.douse);
  sim.night = 0;
  assert.deepEqual((sim as any).drill(), before);
});
