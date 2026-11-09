import test from "node:test";
import assert from "node:assert/strict";
import { areaForWave } from "../src/defend/areas.ts";
import { rollWeather } from "../src/defend/weather.ts";
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { cellIndex, CELLS_W, CELLS_H } from "../src/defend/grid.ts";
import { CAVE_CEILING, CAVE_OPENING, crystalCavesPlan, openingDustAt, openingEdge, CRYSTAL_CAVES, dustAt, hasCrystalCaves, SHAFT_UP, shaftLight, sporeAt } from "../src/defend/crystal-caves.ts";
import { skyAtTime } from "../src/daylight.ts";
import { cavePixels, columnField, glowPixels, openingLight, sunAt, sunlitFloor } from "../src/defend/crystal-caves-art.ts";

function city() {
  const fit = fitLayout(defaultLayout());
  assert.ok(fit.ok);
  return generateCity(fit, 1);
}

test("zone 3 is the Crystal Caves: underground, never raining", () => {
  const area = areaForWave(41);
  assert.equal(area.id, "drowned");
  assert.equal(area.name, "Crystal Caves");
  assert.equal(area.climate, "underground");
  assert.ok(hasCrystalCaves("drowned") && !hasCrystalCaves("moss") && !hasCrystalCaves("crystal"));
  for (let k = 0; k < 20; k++) assert.equal(rollWeather(() => k / 20, area).rain, false);
});

test("the caves plan rocks, ponds, crystals, mushrooms and light shafts on open ground", () => {
  const map = city(), plan = crystalCavesPlan(map);
  assert.equal(crystalCavesPlan(map), plan);
  assert.ok(plan.rocks.length >= 20, `${plan.rocks.length} rocks`);
  assert.ok(plan.ponds.length >= 2 && plan.ponds.length <= CRYSTAL_CAVES.ponds);
  assert.ok(plan.crystals.length >= 8 && plan.mushrooms.length >= 8);
  assert.ok(plan.crystals.some((c) => c.blue) && plan.crystals.some((c) => !c.blue), "purple and pale blue");
  assert.ok(plan.shafts.length >= 2 && plan.shafts.length <= CRYSTAL_CAVES.shafts);
  for (const f of [...plan.rocks, ...plan.ponds, ...plan.crystals, ...plan.mushrooms, ...plan.shafts])
    assert.equal(map.type[cellIndex(Math.floor(f.x), Math.floor(f.y))], CellType.OUT);
  for (const a of plan.shafts) for (const b of plan.shafts) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= CRYSTAL_CAVES.shaftApart);
});

test("spores rise off the mushrooms and dust drifts in the shafts", () => {
  const plan = crystalCavesPlan(city()), m = plan.mushrooms[0], s = plan.shafts[0];
  for (let k = 0; k < CRYSTAL_CAVES.spores; k++) {
    const a = sporeAt(m, k, 1), b = sporeAt(m, k, 2.5);
    assert.ok(a.show >= 0 && a.show <= 1);
    assert.ok(Math.hypot(a.x - m.x, a.y - m.y) < m.r + 4);
    assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
  }
  let lit = 0;
  for (let k = 0; k < CRYSTAL_CAVES.dust; k++) {
    const d = dustAt(s, k, 10);
    assert.ok(d.show >= 0 && d.show <= 1);
    if (d.show > 0.1) lit++;
  }
  assert.ok(lit > CRYSTAL_CAVES.dust / 4, "most dust shows in the beam");
  assert.equal(columnField(0.5, 0), columnField(0.5, -0), "symmetric");
  assert.ok(columnField(0.1, 0) > columnField(0.1, 0.8) && columnField(0.95, 0) < columnField(0.3, 0));
});

test("the floor covers every open cell and nothing else; sunlight brightens it; glow is sparse", () => {
  const plan = crystalCavesPlan(city()), px = cavePixels(plan), glow = glowPixels(plan), W = CELLS_W * 8;
  for (let i = 0; i < plan.open.length; i++) {
    const cx = i % CELLS_W, cy = Math.floor(i / CELLS_W), p = px[(cy * 8 + 3) * W + cx * 8 + 3];
    if (plan.open[i]) assert.equal(p >>> 24, 255);
    else assert.equal(p, 0);
  }
  const s = plan.shafts[0], mid = Math.floor(s.y * 8) * W + Math.floor(s.x * 8);
  assert.equal(sunAt(s, Math.floor(s.x * 8), Math.floor(s.y * 8)), 1);
  const lum = (v: number) => (v & 0xff) + ((v >> 8) & 0xff) + ((v >> 16) & 0xff);
  const lit = sunlitFloor(px);
  assert.ok(lum(lit[mid]) > 120 && lum(lit[mid]) > lum(px[mid]) * 2, "the sunlit floor is bright");
  const glowing = glow.reduce((n, v) => n + (v >>> 24 ? 1 : 0), 0);
  assert.ok(glowing > 500 && glowing < glow.length * 0.05, `${glowing} glowing pixels`);
});

test("the holes' light follows the sun across the day", () => {
  const still = shaftLight();
  assert.deepEqual(still.up, SHAFT_UP);
  assert.deepEqual(still.shift, { x: 0, y: 0 });
  const at = (p: number) => shaftLight(skyAtTime(p * 5 * 60 * 1000).sun);
  const noon = at(0.05), afternoon = at(0.33), sunset = at(0.42);
  // Low sun: a long, slanting beam and a patch slid far from under its hole.
  assert.ok(sunset.length > noon.length + 8, `${noon.length} → ${sunset.length}`);
  assert.ok(Math.hypot(sunset.shift.x, sunset.shift.y) > 4 * Math.hypot(noon.shift.x, noon.shift.y));
  assert.ok(Math.abs(noon.up.x) < 0.2 && noon.up.y < -0.97, "noon falls straight");
  assert.ok(sunset.up.x > 0.5, "the evening sun leans the beams one way");
  assert.ok(afternoon.shift.x < 0 && sunset.shift.x < afternoon.shift.x, "the patch slides as the sun sinks");
  // The beam points back up from the patch toward the hole.
  const back = -(sunset.shift.x * sunset.up.x + sunset.shift.y * sunset.up.y) / CAVE_CEILING;
  assert.ok(back > 0);
  // Dust follows the moved beam.
  const plan = crystalCavesPlan(city()), s = plan.shafts[0];
  let near = 0;
  for (let k = 0; k < CRYSTAL_CAVES.dust; k++) {
    const d = dustAt(s, k, 10, sunset), fx = s.x + sunset.shift.x, fy = s.y + sunset.shift.y;
    const along = (d.x - fx) * sunset.up.x + (d.y - fy) * sunset.up.y;
    if (along >= -1 && along <= sunset.length) near++;
  }
  assert.equal(near, CRYSTAL_CAVES.dust);
});

test("a great ragged opening lets the sky in over the top third", () => {
  const edges = Array.from({ length: CELLS_W * 4 }, (_, i) => openingEdge(i / 4));
  const lo = Math.min(...edges), hi = Math.max(...edges), mean = edges.reduce((a, b) => a + b) / edges.length;
  assert.ok(lo > CELLS_H * 0.2 && hi < CELLS_H * 0.5, `${lo}..${hi}`);
  assert.ok(Math.abs(mean - CELLS_H / 3) < 6, `about a third down: ${mean}`);
  assert.ok(hi - lo > 8, "its edge wanders in bays and spurs");
  // Lit above the edge (and above the board), dark below it.
  assert.equal(openingLight(100, -40), 1);
  assert.equal(openingLight(100, Math.floor(openingEdge(100.5 / 8) * 8) - 20), 1);
  assert.equal(openingLight(100, Math.floor(openingEdge(100.5 / 8) * 8) + 20), 0);
  // No ceiling holes under the open sky.
  for (const s of crystalCavesPlan(city()).shafts) assert.ok(s.y - s.r > openingEdge(s.x), `shaft at ${s.x},${s.y}`);
  for (let k = 0; k < CAVE_OPENING.dust; k++) {
    const d = openingDustAt(k, 7);
    assert.ok(d.x >= 0 && d.x < CELLS_W && d.y < CELLS_H * 0.5);
  }
});
