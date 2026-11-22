/** An edit's arrival (`arrival.ts`): what falls in, what vanishes, and the
 * order a new park fills in. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile, placeStructure, type Layout } from "../src/defend/layout.ts";
import { generateCity, type CityMap } from "../src/defend/citygen.ts";
import { ARRIVAL, dropAt, duckFall, grassReach, planArrival, postFall, railFall, treeFall, type Drop } from "../src/defend/arrival.ts";
import { CELLS_W } from "../src/defend/grid.ts";

const city = (l: Layout, seed = 7): CityMap => {
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return generateCity(fit, seed);
};

test("a piece falls with gravity, faint and large up high, and is gone from the sky once landed", () => {
  assert.equal(dropAt(-0.01, 0.4, 3), false);
  assert.equal(dropAt(0.4, 0.4, 3), null);
  const a = dropAt(0.1, 0.4, 3) as Drop, b = dropAt(0.2, 0.4, 3) as Drop, c = dropAt(0.3, 0.4, 3) as Drop;
  assert.ok(a.dy < b.dy && b.dy < c.dy && c.dy < 0, "it comes down");
  assert.ok(b.dy - a.dy < c.dy - b.dy, "faster as it falls");
  assert.ok(a.alpha < c.alpha && a.scale > c.scale);
});

test("a placed building falls in whole, at once; nothing falls for no change", () => {
  const l = defaultLayout(), map = city(l);
  assert.equal(planArrival(map, city(l), undefined, undefined), null);
  const next = placeStructure(l, "watchTower", l.keep.tx + 1, l.keep.ty) ?? placeStructure(l, "watchTower", l.keep.tx, l.keep.ty);
  assert.ok(next);
  const after = city(next);
  const plan = planArrival(map, after, undefined, undefined);
  assert.ok(plan);
  const tower = after.buildings.find((b) => b.kind === "watchTower")!;
  const mine = plan.arriving.find((a) => a.id === tower.id);
  assert.ok(mine, "the tower falls in");
  for (const a of plan.arriving) assert.ok(a.delay >= 0 && a.dur > 0 && a.height > 0);
  assert.ok(plan.landed <= plan.end);
});

test("a new city tile's pieces fall apart, and its parks grow, then plants, posts and rails", () => {
  let found = false;
  for (let seed = 1; seed < 60 && !found; seed++) {
    const l = defaultLayout();
    const { tx, ty } = l.keep;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = placeCityTile(l, tx + dx, ty + dy);
      if (!next) continue;
      const plan = planArrival(city(l, seed), city(next, seed), undefined, undefined);
      if (!plan) continue;
      assert.ok(plan.vanishing.length > 0 || plan.arriving.length > 0);
      if (plan.arriving.length > 2) assert.ok(new Set(plan.arriving.map((a) => a.delay)).size > 1, "the pieces fall a little apart");
      const park = plan.parks.find((p) => p.cells.length >= 4);
      if (!park) continue;
      found = true;
      // Every new park cell is in its park and changed.
      for (const c of park.cells) assert.equal(plan.parks[plan.parkOf[c]], park), assert.equal(plan.changed[c], 1);
      // The grass grows out from the middle.
      assert.equal(grassReach(park, park.delay), 0);
      const mid = (park.delay + park.grown) / 2;
      assert.ok(grassReach(park, mid) > 0 && grassReach(park, mid) < park.reach + 0.5);
      assert.equal(grassReach(park, park.grown), Infinity);
      // Before it has grown, nothing on it has started falling; afterwards
      // the trees and ducks come, then the posts, then the rails.
      const c = park.cells[0], x = (c % CELLS_W) + 0.5, y = Math.floor(c / CELLS_W) + 0.5;
      const first = (fall: (t: number) => unknown) => {
        for (let t = 0; t < plan.end + 1; t += 0.01) if (fall(t) !== false) return t;
        return Infinity;
      };
      const tree = first((t) => treeFall(plan, t, x, y)), duck = first((t) => duckFall(plan, t, x, y, 0));
      const post = first((t) => postFall(plan, t, x, y)), rail = first((t) => railFall(plan, t, x, y, x + 0.01, y));
      assert.ok(park.delay < tree && tree > park.grown - 0.2, `tree at ${tree}, grown ${park.grown}`);
      assert.ok(duck > park.grown);
      assert.ok(post > tree && post > duck - ARRIVAL.plant.spread, `posts at ${post}`);
      assert.ok(rail > post, `rails at ${rail} after posts at ${post}`);
      assert.ok(rail < plan.end && treeFall(plan, plan.end, x, y) === null && railFall(plan, plan.end, x, y, x + 0.01, y) === null);
      // Off the new park, nothing waits to fall.
      assert.equal(treeFall(plan, 0, -5, -5), null);
    }
  }
  assert.ok(found, "some new city tile made a park");
});

test("a vanishing building's box takes it in whole", async () => {
  const { vanishBoxes } = await import("../src/defend/arrival-art.ts");
  const gone = [{ rect: { x: 10, y: 10, w: 4, h: 4 } }] as unknown as Parameters<typeof vanishBoxes>[1];
  // A box over just the building's right edge grows to the whole of it, with room round it.
  const [box] = vanishBoxes([{ x0: 13, y0: 9, x1: 17, y1: 12 }], gone);
  assert.deepEqual({ x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 }, { x0: 8, y0: 8, x1: 17, y1: 16 });
  // A box that doesn't reach it stays as it is.
  assert.deepEqual(vanishBoxes([{ x0: 30, y0: 30, x1: 32, y1: 32 }], gone), [{ x0: 30, y0: 30, x1: 32, y1: 32 }]);
});
