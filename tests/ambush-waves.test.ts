import test from "node:test";
import assert from "node:assert/strict";
import { AMBUSH_LEVELS } from "../src/campaign/levels.ts";
import { ambushWave, waveHasFliers, AMBUSH_WAVES } from "../src/campaign/ambush-waves.ts";
import { AREA_ENEMIES } from "../src/defend/area-enemies.ts";
import { ENEMIES } from "../src/defend/catalog.ts";
test("Twenty seeded waves per level stay in their zone and flag exactly the flier waves", () => {
  assert.equal(AMBUSH_WAVES.count, 20);
  for (const l of AMBUSH_LEVELS) {
    let previous = 0;
    for (let n = 1; n <= 20; n++) {
      const w = ambushWave(l, n);
      assert.ok(w.budget >= previous);
      previous = w.budget;
      assert.deepEqual(w, ambushWave(l, n));
      assert.ok(w.kinds.every((k) => AREA_ENEMIES[l.area].includes(k) && !ENEMIES[k].hatched));
      assert.ok(w.kinds.reduce((sum, k) => sum + ENEMIES[k].cost, 0) <= w.budget);
      assert.equal(
        w.fliers,
        w.kinds.some((k) => !!ENEMIES[k].flying),
      );
    }
  }
  assert.equal(waveHasFliers(["roach", "orc"]), false);
  assert.equal(waveHasFliers(["roach", "bat"]), true);
});
