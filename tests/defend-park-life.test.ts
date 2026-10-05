// The parks' live dressing (src/defend/park-grass.ts, pond-water.ts): where
// grass blades and drips are planned. Presentation only, so these check the
// plans stay where the painted city says they should, the same every time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile, type Layout } from "../src/defend/layout.ts";
import { CellType, generateCity, type CityMap } from "../src/defend/citygen.ts";
import { CELLS_W } from "../src/defend/grid.ts";
import { ParkGrass } from "../src/defend/park-grass.ts";
import { groundArt, turfAt } from "../src/defend/ground-art.ts";
import { PondWater } from "../src/defend/pond-water.ts";
import { ART, openAt, parkArt } from "../src/defend/park-art.ts";
import { random } from "../src/random.ts";

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

test("every park cell's grass is planned once, on park cells and the turf beside them only", () => {
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
  const ground = groundArt(map);
  let street = 0;
  plans.forEach((p, i) => {
    if (!p?.length) return;
    const cx = i % CELLS_W, cy = Math.floor(i / CELLS_W);
    if (map.type[i] === CellType.PARK) return;
    assert.equal(map.type[i], CellType.ROAD, `blades on cell ${cx},${cy}`);
    street++;
    // A street's blades root on its turf.
    for (const b of p as { i: number; j: number }[]) assert.ok(turfAt(ground, cx * ART + b.i, cy * ART + b.j), `blade off the turf in cell ${cx},${cy}`);
  });
  assert.ok(street > 0, "grass grows on the turf over the streets too");
});

test("the pixel-art ponds' open water lies on water cells", () => {
  const map = parkCity();
  const art = parkArt(map);
  assert.ok(art.open.some((v) => v === 1));
  for (let i = 0; i < art.open.length; i++) {
    if (!art.open[i]) continue;
    const x = i % art.width, y = Math.floor(i / art.width);
    const cell = Math.floor(y / ART) * CELLS_W + Math.floor(x / ART);
    // Open water spills a little past its cells' edges, never far.
    const near = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => map.type[cell + dy * CELLS_W + dx] === CellType.WATER));
    assert.ok(near, `open water at ${x},${y}`);
  }
});

type DuckView = { x: number; y: number; state: string };
const ducksOf = (water: PondWater) => (water.ducks as unknown as { ducks: DuckView[] }).ducks;

test("ducks stay on open water, swim off from walkers and sleep at night", () => {
  const map = parkCity();
  const water = new PondWater();
  water.sync(map);
  const art = parkArt(map);
  (water.ducks as unknown as { rand: () => number }).rand = random(5);
  assert.ok(water.ducks.count >= 2, "a couple of ducks at least");
  const rings: number[] = [];
  const day = { night: 0, walkers: [] as { x: number; y: number }[], reduceMotion: false };
  const states = new Set<string>();
  for (let k = 0; k < 30 * 120; k++) {
    water.ducks.update(1 / 30, day, () => rings.push(k));
    for (const d of ducksOf(water)) {
      assert.ok(openAt(art, Math.floor(d.x * ART), Math.floor(d.y * ART)), `duck on the bank at ${d.x},${d.y}`);
      states.add(d.state);
    }
  }
  for (const s of ["paddle", "dabble", "preen", "drift", "follow"]) assert.ok(states.has(s), `never ${s}`);
  assert.ok(rings.length > 0 && rings.length < 30 * 120 / 10, `rings now and then (${rings.length})`);
  // Someone on the bank right by the first duck: it swims away.
  const first = ducksOf(water)[0];
  const walker = { x: first.x + 0.4, y: first.y };
  const before = Math.hypot(first.x - walker.x, first.y - walker.y);
  for (let k = 0; k < 30 * 3; k++) water.ducks.update(1 / 30, { ...day, walkers: [walker] }, () => {});
  assert.ok(Math.hypot(first.x - walker.x, first.y - walker.y) > before, "fled");
  for (let k = 0; k < 30; k++) water.ducks.update(1 / 30, { ...day, night: 1 }, () => {});
  assert.ok(ducksOf(water).every((d) => d.state === "sleep"));
});

test("without a DOM, drawing is a no-op", () => {
  const map = parkCity();
  const water = new PondWater(), grass = new ParkGrass();
  water.sync(map);
  grass.sync(map);
  const c = {} as CanvasRenderingContext2D;
  water.draw({ c, px: 8, now: 0, rain: true, night: 0, walkers: [], reduceMotion: false, layer: {} as HTMLCanvasElement, layerScale: 1 });
  grass.draw({ c, px: 8, now: 0, dt: 0.016, wind: "rain", walkers: [{ x: 10, y: 10, size: 0.4 }], reduceMotion: false });
});
