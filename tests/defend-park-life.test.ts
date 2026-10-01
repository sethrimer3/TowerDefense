// The parks' live dressing (src/defend/park-grass.ts, pond-water.ts): where
// grass blades and drips are planned. Presentation only, so these check the
// plans stay where the painted city says they should, the same every time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile, type Layout } from "../src/defend/layout.ts";
import { CellType, generateCity, type CityMap } from "../src/defend/citygen.ts";
import { CELLS_W } from "../src/defend/grid.ts";
import { ParkGrass } from "../src/defend/park-grass.ts";
import { PondWater } from "../src/defend/pond-water.ts";

const RING: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [-2, 1], [2, 1], [-2, -1], [2, -1], [0, -2], [-1, -2], [1, -2]];

function wideCity(seed: number): CityMap {
  let l: Layout = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of RING) l = placeCityTile(l, tx + dx, ty + dy) ?? l;
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return generateCity(fit, seed);
}

/** A city with parks and ponds in it. */
function parkCity() {
  for (let seed = 1; seed < 40; seed++) {
    const map = wideCity(seed);
    if (map.type.some((t) => t === CellType.WATER)) return map;
  }
  assert.fail("no seed made a pond");
}

test("every park cell's grass is planned once, on park cells only", () => {
  const map = parkCity();
  const grass = new ParkGrass();
  grass.sync(map);
  const parks = map.type.filter((t) => t === CellType.PARK).length;
  assert.ok(parks > 0);
  assert.ok(grass.bladeCount > parks, `${grass.bladeCount} blades over ${parks} park cells`);
  const again = new ParkGrass();
  again.sync(map);
  assert.equal(again.bladeCount, grass.bladeCount, "the same city plans the same grass");
  const plans = (grass as unknown as { plans: (unknown[] | null)[] }).plans;
  plans.forEach((p, i) => {
    if (p?.length) assert.equal(map.type[i], CellType.PARK, `blades on cell ${i % CELLS_W},${Math.floor(i / CELLS_W)}`);
  });
});

test("ponds are found whole, and each gets at least one drip", () => {
  const map = parkCity();
  const water = new PondWater();
  water.sync(map);
  assert.ok(water.pondCount > 0);
  assert.ok(water.dripCount >= water.pondCount);
});

test("without a DOM, drawing is a no-op", () => {
  const map = parkCity();
  const water = new PondWater(), grass = new ParkGrass();
  water.sync(map);
  grass.sync(map);
  const c = {} as CanvasRenderingContext2D;
  water.draw({ c, px: 8, now: 0, rain: true, reduceMotion: false, layer: {} as HTMLCanvasElement, layerScale: 1 });
  grass.draw({ c, px: 8, now: 0, dt: 0.016, wind: "rain", walkers: [{ x: 10, y: 10, size: 0.4 }], reduceMotion: false });
});
