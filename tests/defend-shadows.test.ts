// The city's pixel-art dressing outside the parks' live life: the shadows
// cast over the height map (src/defend/shadow-art.ts), the dirt streets and
// their uneven grass edges (ground-art.ts), and the trees fading over
// whoever is under them (park-trees.ts). Presentation only, so these check
// the shapes the art is drawn from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile, type Layout } from "../src/defend/layout.ts";
import { CellType, generateCity, type CityMap } from "../src/defend/citygen.ts";
import { CELLS_H, CELLS_W, cellIndex } from "../src/defend/grid.ts";
import { ART, parkArt } from "../src/defend/park-art.ts";
import { HEIGHT, heights, shadowMask } from "../src/defend/shadow-art.ts";
import { groundArt } from "../src/defend/ground-art.ts";
import { ParkTrees, UNDER_ALPHA } from "../src/defend/park-trees.ts";

const W = CELLS_W * ART, H = CELLS_H * ART;
const RING: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [0, -2]];

function city(seed: number): CityMap {
  let l: Layout = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of RING) l = placeCityTile(l, tx + dx, ty + dy) ?? l;
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return generateCity(fit, seed);
}

/** A city with parks beside its streets. */
function parkCity() {
  for (let seed = 1; seed < 40; seed++) {
    const map = city(seed);
    if (map.type.filter((t) => t === CellType.PARK).length > 20) return map;
  }
  assert.fail("no seed made parks");
}

test("a tall block's shadow runs down and right, shorter where it falls on something raised", () => {
  const h = new Float32Array(W * H);
  // A wall column six high at x = 20, ground to its right on rows 10–19 and
  // a roof three high on rows 30–39.
  for (let y = 0; y < 50; y++) h[y * W + 20] = 6;
  for (let y = 30; y < 50; y++) for (let x = 22; x < 40; x++) h[y * W + x] = 3;
  const m = shadowMask(h);
  const run = (y: number) => {
    let n = 0;
    while (m[y * W + 21 + n]) n++;
    return n;
  };
  assert.equal(m[15 * W + 19], 0, "nothing falls to the upper left");
  assert.equal(m[15 * W + 20], 0, "the wall does not shade its own top");
  assert.ok(run(15) >= 5, `ground shadow ${run(15)}`);
  // On the roof the shadow reaches only as far as the wall stands above it.
  let roof = 0;
  while (m[40 * W + 22 + roof]) roof++;
  assert.ok(roof >= 1 && roof < run(15) - 1, `roof shadow ${roof} vs ground ${run(15)}`);
});

test("houses, walls and trees cast shadows on the city; fallen buildings cast none", () => {
  const map = parkCity();
  const all = heights(map, () => true);
  // A house clear of the wall (whose face can hang over a house's top).
  const house = map.buildings.find((b) => b.kind === "house" && !map.wall[cellIndex(b.rect.x, b.rect.y - 1)] && !map.wall[cellIndex(b.rect.x + b.rect.w - 1, b.rect.y - 1)])!;
  const r = house.rect;
  // The ridge stands above the eaves.
  const along = r.w >= r.h;
  const eave = all[(r.y * ART + 1) * W + r.x * ART + 3];
  const mid = along ? all[Math.floor((r.y + r.h / 2) * ART) * W + r.x * ART + 3] : all[(r.y * ART + 3) * W + Math.floor((r.x + r.w / 2) * ART)];
  assert.equal(along ? eave : all[(r.y * ART + 3) * W + r.x * ART + 1], HEIGHT.eave);
  assert.ok(mid > HEIGHT.eave, "the ridge rises above the eaves");
  const m = shadowMask(all);
  // Just past the house's lower-right corner lies in its shadow.
  const cx = (r.x + r.w) * ART - 1, cy = (r.y + r.h) * ART - 1;
  assert.ok(m[cy * W + cx], "shadow beyond the lower-right corner");
  assert.ok(map.buildings.some((b) => b.kind === "wall") && all.some((v) => v === HEIGHT.wall));
  assert.ok(all.some((v) => v > HEIGHT.tree.rim && v <= HEIGHT.tree.rim + HEIGHT.tree.crown), "tree canopies stand up");
  const fallen = heights(map, (b) => b.id !== house.id);
  assert.equal(fallen[(r.y * ART + 3) * W + r.x * ART + 3], 0, "a fallen house is flat");
});

test("streets are dirt, with grass growing unevenly over their park edges", () => {
  const map = parkCity();
  const art = groundArt(map);
  // Some park pixels beside the streets are worn bare, and only those.
  let bare = 0;
  for (let i = 0; i < art.bare.length; i++) {
    if (!art.bare[i]) continue;
    bare++;
    const x = i % W, y = (i - x) / W;
    assert.equal(map.type[cellIndex(Math.floor(x / ART), Math.floor(y / ART))], CellType.PARK);
  }
  assert.ok(bare > 0, "some park edges are worn bare");
  // Turf lies on streets only, and some street pixels are grassed over.
  let turf = 0;
  for (let i = 0; i < art.turf.length; i++) {
    if (!art.turf[i]) continue;
    turf++;
    const x = i % W, y = (i - x) / W;
    assert.equal(map.type[cellIndex(Math.floor(x / ART), Math.floor(y / ART))], CellType.ROAD);
  }
  assert.ok(turf > 0, "grass grows out over the streets");
  // Grass and dirt meet at one wavering line: a park's bare dirt never
  // touches a street's turf across the cells' boundary, where it would
  // draw a ruled line of dirt inside the green.
  const type = (x: number, y: number) => map.type[cellIndex(Math.floor(x / ART), Math.floor(y / ART))];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!art.bare[y * W + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || type(nx, ny) !== CellType.ROAD) continue;
        assert.equal(art.turf[ny * W + nx], 0, `bare park pixel ${x},${y} against turf at ${nx},${ny}`);
      }
    }
  assert.deepEqual(groundArt(map), art, "baked once per city");
});

test("a tree fades to half while anyone is under it, and fills back in", () => {
  const map = parkCity();
  const trees = new ParkTrees();
  trees.sync(map);
  const t = parkArt(map).trees[0];
  assert.ok(t, "the city has trees");
  assert.ok(t.w > 2 && t.h > 2 && t.x >= 0 && t.y >= 0);
  trees.update([{ x: t.cx, y: t.cy, size: 0.3 }], 0.1, false);
  assert.ok(trees.alpha[0] < 1 && trees.alpha[0] > UNDER_ALPHA, "fades gradually");
  for (let k = 0; k < 10; k++) trees.update([{ x: t.cx, y: t.cy, size: 0.3 }], 0.1, false);
  assert.equal(trees.alpha[0], UNDER_ALPHA);
  trees.update([{ x: t.cx + 3, y: t.cy, size: 0.3 }], 1, false);
  assert.equal(trees.alpha[0], 1);
  trees.update([{ x: t.cx, y: t.cy, size: 0.3 }], 0, true);
  assert.equal(trees.alpha[0], UNDER_ALPHA, "at once under reduced motion");
});
