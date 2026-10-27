import test from "node:test";
import assert from "node:assert/strict";
import { AMBUSH_LEVELS, laneCount } from "../src/campaign/levels.ts";
import { ambushWave, waveHasFliers, crowdSize, waveHp, AMBUSH_WAVES } from "../src/campaign/ambush-waves.ts";
import { AREA_ENEMIES } from "../src/defend/area-enemies.ts";
import { ENEMIES } from "../src/defend/catalog.ts";
test("Crowds run from 50 to 500 enemies, growing with every wave and every level", () => {
  assert.equal(AMBUSH_WAVES.count, 20);
  assert.equal(crowdSize(AMBUSH_LEVELS[0], 1), 50);
  assert.equal(crowdSize(AMBUSH_LEVELS[29], 20), 500);
  for (let i = 0; i < 30; i++)
    for (let n = 1; n <= 20; n++) {
      const size = crowdSize(AMBUSH_LEVELS[i], n);
      assert.ok(size >= 50 && size <= 500);
      if (n > 1) assert.ok(size >= crowdSize(AMBUSH_LEVELS[i], n - 1));
      if (i > 0) assert.ok(size >= crowdSize(AMBUSH_LEVELS[i - 1], n));
    }
});
test("Each level's waves hold a little more HP than the level before's, and each wave more than the last", () => {
  for (let i = 0; i < 30; i++)
    for (let n = 1; n <= 20; n++) {
      if (n > 1) assert.ok(waveHp(AMBUSH_LEVELS[i], n) > waveHp(AMBUSH_LEVELS[i], n - 1));
      if (i > 0) {
        const ratio = waveHp(AMBUSH_LEVELS[i], n) / waveHp(AMBUSH_LEVELS[i - 1], n);
        assert.ok(Math.abs(ratio - AMBUSH_WAVES.levelGrowth) < 0.01, `level ${i} wave ${n}: ${ratio}`);
      }
    }
});
test("Twenty seeded waves per level stay in their zone, share the lanes and flag exactly the flier waves", () => {
  for (const l of AMBUSH_LEVELS) {
    const lanes = laneCount(l);
    for (let n = 1; n <= 20; n++) {
      const w = ambushWave(l, n, lanes);
      assert.deepEqual(w, ambushWave(l, n, lanes));
      assert.ok(w.entries.every((e) => AREA_ENEMIES[l.area].includes(e.kind) && !ENEMIES[e.kind].hatched && e.lane >= 0 && e.lane < lanes));
      for (let lane = 0; lane < lanes; lane++) assert.ok(w.entries.some((e) => e.lane === lane));
      const native = w.entries.reduce((sum, e) => sum + ENEMIES[e.kind].hp / (ENEMIES[e.kind].damageScale?.physical ?? 1), 0);
      assert.ok(Math.abs(native * w.scale - w.hp) < 1e-6 * w.hp);
      assert.ok(w.bounty > 0 && w.gap > 0);
      const fliers = w.entries.filter((e) => !!ENEMIES[e.kind].flying).length;
      assert.equal(w.fliers, fliers > 0);
      if (n < AMBUSH_WAVES.fliersFrom) assert.equal(fliers, 0);
      assert.ok(fliers <= Math.floor(w.entries.length * AMBUSH_WAVES.flierShare));
    }
  }
  assert.equal(waveHasFliers(["roach", "orc"]), false);
  assert.equal(waveHasFliers(["roach", "bat"]), true);
});
