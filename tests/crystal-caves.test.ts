import test from "node:test";
import assert from "node:assert/strict";
import { areaForWave } from "../src/defend/areas.ts";
import { rollWeather } from "../src/defend/weather.ts";
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { cellIndex } from "../src/defend/grid.ts";
import { crystalCavesPlan, CRYSTAL_CAVES, dustAt, hasCrystalCaves, sporeAt } from "../src/defend/crystal-caves.ts";
import { cavePixels, columnField, glowPixels, sunAt } from "../src/defend/crystal-caves-art.ts";

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
  const plan = crystalCavesPlan(city()), px = cavePixels(plan), glow = glowPixels(plan), W = 72 * 8;
  for (let i = 0; i < plan.open.length; i++) {
    const cx = i % 72, cy = Math.floor(i / 72), p = px[(cy * 8 + 3) * W + cx * 8 + 3];
    if (plan.open[i]) assert.equal(p >>> 24, 255);
    else assert.equal(p, 0);
  }
  const s = plan.shafts[0], mid = Math.floor(s.y * 8) * W + Math.floor(s.x * 8);
  assert.equal(sunAt(s, Math.floor(s.x * 8), Math.floor(s.y * 8)), 1);
  const lum = (v: number) => (v & 0xff) + ((v >> 8) & 0xff) + ((v >> 16) & 0xff);
  assert.ok(lum(px[mid]) > 120, "the sun patch is bright");
  const glowing = glow.reduce((n, v) => n + (v >>> 24 ? 1 : 0), 0);
  assert.ok(glowing > 500 && glowing < glow.length * 0.05, `${glowing} glowing pixels`);
});
