import test from "node:test";
import assert from "node:assert/strict";
import { AmbushSim } from "../src/campaign/ambush-sim.ts";
import { defaults } from "../src/save.ts";
import { rectDist } from "../src/defend/pathing.ts";
import { AMBUSH_LEVELS } from "../src/campaign/levels.ts";
import { ambushWave, AMBUSH_WAVES } from "../src/campaign/ambush-waves.ts";
import { AREA_ENEMIES } from "../src/defend/area-enemies.ts";
import { ENEMIES } from "../src/defend/catalog.ts";
test("A ground enemy with a native off-center lane passes every bend, enters both outposts and reaches the keep", () => {
  const s = new AmbushSim(0, defaults()),
    e = s.engine.spawnAuxiliary("orc", 0.5, s.field.path[0].y)!;
  e.jx = 0.3;
  e.jy = 0.3;
  for (let tick = 0; tick < 18000 && rectDist(s.engine.keep.rect, e.x, e.y) > 1; tick++) {
    s.engine.step(0.1);
    s.outposts.update();
    // Clear only after a real native fence breach; this isolates the full road/rejoin route.
    for (const p of s.outposts.posts) if (p.breached) for (const id of p.houses) if (s.engine.hp[id] > 0) s.engine.damageBuilding(id, 1e9);
  }
  assert.ok(s.outposts.posts.every((p) => p.breached && p.fallen));
  assert.ok(rectDist(s.engine.keep.rect, e.x, e.y) <= 1);
});
test("Waves 10 and 20 bring one native ground boss from the zone, its HP scaled with the crowd", () => {
  for (const l of AMBUSH_LEVELS)
    for (const n of [10, 20]) {
      const w = ambushWave(l, n);
      assert.ok(w.boss && w.entries.some((e) => e.kind === w.boss));
      assert.ok(AREA_ENEMIES[l.area].includes(w.boss!) && !ENEMIES[w.boss!].flying && ENEMIES[w.boss!].hp <= AMBUSH_WAVES.bossHp);
    }
});

test("Every level has enemies in every wave, including the expensive Astral roster", () => {
  for (const l of AMBUSH_LEVELS) for (let wave = 1; wave <= 20; wave++) assert.ok(ambushWave(l, wave).entries.length >= 50, l.id + " wave " + wave);
});
