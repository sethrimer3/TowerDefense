// The Library's night lanterns: carried in lit from a hallway at dusk, up a
// ladder onto the top of 2 to 4 bays, half their candles guttering out 1 to
// 60 seconds before dawn, and carried back out at daybreak.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BAYS, EXITS, LANTERN_DAWN, LANTERN_DUSK, LibrarySim, decodeLibrarySave, lanternClock, unitTop } from "../src/library/sim.ts";
import { DAY_MS } from "../src/daylight.ts";

/** A library under a day clock starting at `p` of the day, run `seconds`,
 * the clock running with the simulation. */
function night(sim: LibrarySim, from: number, seconds: number, each?: () => void) {
  for (let t = 0; t < seconds * 10; t++) {
    sim.toDawn = lanternClock(from * DAY_MS + t * 100);
    sim.step(0.1);
    each?.();
  }
}

test("the lantern clock runs only from dusk until the sky lightens", () => {
  assert.equal(lanternClock(0), null);
  assert.equal(lanternClock((LANTERN_DUSK - 0.01) * DAY_MS), null);
  assert.ok(Math.abs(lanternClock(LANTERN_DUSK * DAY_MS)! - (LANTERN_DAWN - LANTERN_DUSK) * DAY_MS / 1000) < 1e-6);
  assert.equal(lanternClock(LANTERN_DAWN * DAY_MS), null);
});

test("at dusk shelvers carry 2 to 4 lit lanterns in, up the ladders onto the tops of different bays", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const sim = new LibrarySim(seed);
    sim.furnish(40);
    for (let i = 0; i < 4; i++) sim.hire("shelver");
    let seenCarried = false, darkInHand = false, offScreenLit = false;
    night(sim, LANTERN_DUSK, 90, () => {
      for (const n of sim.lanterns) {
        const at = sim.lanternAt(n);
        if (n.state === "carried" && at) {
          seenCarried = true;
          if (!n.lit && sim.toDawn! > 60) darkInHand = true;
          if (at.x < 0 || at.x >= 192) offScreenLit ||= n.lit;
        }
      }
    });
    const up = sim.lanterns.filter((n) => n.state === "up");
    assert.ok(sim.lanterns.length >= 2 && sim.lanterns.length <= 4, `seed ${seed}: ${sim.lanterns.length} lanterns`);
    assert.equal(up.length, sim.lanterns.length, `seed ${seed}: all placed`);
    assert.equal(new Set(up.map((n) => n.bay)).size, up.length, "each on its own bay");
    for (const n of up) {
      assert.equal(n.unit, sim.bayComplete(n.bay) - 1, "on top of the bay");
      assert.equal(sim.lanternAt(n)!.y, unitTop(n.unit));
    }
    assert.ok(seenCarried && offScreenLit, "carried in from the hallway, lit");
    assert.ok(!darkInHand, "lit all the way in");
    assert.ok(sim.librarians.every((l) => !l.lantern));
  }
});

test("about half the candles go out, each 1 to 60 seconds before dawn; the rest come down lit at daybreak", () => {
  let out = 0, all = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const sim = new LibrarySim(seed);
    sim.furnish(40);
    for (let i = 0; i < 4; i++) sim.hire("shelver");
    const outAt = new Map<object, number>(), wentOut = new Map<object, number>();
    let litLeaving = false;
    // From dusk, through the night and on into the day.
    night(sim, LANTERN_DUSK, 220, () => {
      for (const n of sim.lanterns) {
        if (!outAt.has(n)) outAt.set(n, n.outAt);
        if (!n.lit && !wentOut.has(n)) wentOut.set(n, sim.toDawn ?? 0);
        if (n.state === "carried" && n.lit && sim.toDawn === null) {
          const at = sim.lanternAt(n);
          if (at && (at.x < EXITS[0] + 4 || at.x > EXITS[1] - 4)) litLeaving = true;
        }
      }
    });
    for (const [n, at] of outAt) {
      all++;
      if (at > 0) {
        out++;
        assert.ok(at >= 1 && at <= 60);
        assert.ok(wentOut.has(n), "goes out");
        assert.ok(Math.abs(wentOut.get(n)! - at) < 0.2, `out at ${wentOut.get(n)} s before dawn, meant ${at}`);
      } else assert.ok(!wentOut.has(n), "stays lit");
    }
    assert.equal(sim.lanterns.length, 0, `seed ${seed}: all taken down by day`);
    if ([...outAt.values()].some((v) => v === 0)) assert.ok(litLeaving, "carried off still lit");
  }
  assert.ok(out / all > 0.3 && out / all < 0.7, `${out} of ${all} went out`);
});

test("no shelves or no shelvers, no lanterns go up; placed lanterns survive a save", () => {
  const bare = new LibrarySim(3);
  bare.hire("shelver");
  night(bare, LANTERN_DUSK, 30);
  assert.equal(bare.lanterns.length, 0);

  const sim = new LibrarySim(8);
  sim.furnish(40);
  sim.hire("professor");
  for (let i = 0; i < 3; i++) sim.hire("shelver");
  night(sim, LANTERN_DUSK, 90);
  const saved = decodeLibrarySave(JSON.parse(JSON.stringify(sim.save(0))))!;
  assert.equal(saved.lanterns?.length, sim.lanterns.length);
  const back = new LibrarySim(saved.seed, saved);
  assert.deepEqual(back.lanterns.map((n) => [n.bay, n.unit, n.state, n.lit]), sim.lanterns.map((n) => [n.bay, n.unit, n.state, n.lit]));
  assert.equal(decodeLibrarySave({ ...sim.save(0), lanterns: [{ bay: BAYS, unit: 0, up: true, lit: true, outAt: 0 }] })!.lanterns, undefined);
});
