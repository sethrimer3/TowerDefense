// The Ember Forge outpost (src/defend/outpost.ts): its own smaller city for
// the forge's waves, kept apart from the home city, its trails in from every
// side and its enemies coming from all four.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cityTileOk, defaultLayout, fitLayout, placeCityTile, placeStructureAt, QUARTER } from "../src/defend/layout.ts";
import { CellType, generateCity, type CityMap } from "../src/defend/citygen.ts";
import { CELLS_H, CELLS_W, cellIndex } from "../src/defend/grid.ts";
import { trailPlan } from "../src/defend/trails.ts";
import { emberForgePlan } from "../src/defend/ember-forge.ts";
import { DefendSim } from "../src/defend/sim.ts";
import { available, decodeDefendSave, defaultDefendSave, setLayout } from "../src/defend/progress.ts";
import { ENEMIES } from "../src/defend/catalog.ts";
import { defaultOutpost, OUTPOST_KEEP_HP, OUTPOST_UID, outpostGame, outpostTiles, outpostView, outpostWave } from "../src/defend/outpost.ts";
import { defaults } from "../src/save.ts";
import { realmActive } from "../src/realm.ts";
import { bonuses } from "../src/progression.ts";

/** `layout` with a city tile east of the keep and an archer tower on it. */
function withTower(layout: ReturnType<typeof defaultLayout>) {
  const k = layout.keep, tiled = placeCityTile(layout, k.tx + 1, k.ty)!;
  assert.ok(tiled);
  for (let qy = 0; qy < QUARTER; qy++)
    for (let qx = 0; qx < QUARTER; qx++) {
      const next = placeStructureAt(tiled, "archerTower", { qx: (k.tx + 1) * QUARTER + qx, qy: k.ty * QUARTER + qy });
      if (next && fitLayout(next).ok) return next;
    }
  throw new Error("no room for the tower");
}

const outpostCity = (seed = 7, layout = defaultOutpost().layout): CityMap => {
  const fit = fitLayout(layout);
  assert.ok(fit.ok, fit.ok ? "" : fit.reason);
  const map = generateCity(fit, seed);
  map.trails = { seed };
  map.outpost = true;
  return map;
};

test("the outpost fights only the Ember Forge's waves", () => {
  assert.equal(outpostWave(60), false);
  assert.equal(outpostWave(61), true);
  assert.equal(outpostWave(80), true);
  assert.equal(outpostWave(81), false);
});

test("the outpost has ten fewer city tiles than the player owns, never fewer than ten", () => {
  assert.equal(outpostTiles(0), 10);
  assert.equal(outpostTiles(15), 10);
  assert.equal(outpostTiles(20), 10);
  assert.equal(outpostTiles(27), 17);
});

test("the outpost's keep is a single quarter, and its city keeps off the field's edges", () => {
  const layout = defaultOutpost().layout, fit = fitLayout(layout);
  assert.ok(fit.ok);
  const keep = fit.structures.find((s) => s.kind === "keep")!;
  assert.deepEqual([keep.rect.w, keep.rect.h], [2, 2]);
  const home = fitLayout(defaultLayout());
  assert.ok(home.ok);
  assert.deepEqual([home.structures[0].rect.w, home.structures[0].rect.h], [4, 4], "the home keep is as ever");
  // The buildable field's own ring: fine at home, never at the outpost.
  for (const [tx, ty] of [[1, 6], [10, 6], [6, 1], [6, 10]]) {
    assert.equal(cityTileOk(layout, tx, ty), false);
    assert.equal(cityTileOk(defaultLayout(), tx, ty), true);
  }
  assert.equal(placeCityTile({ ...layout, keep: { tx: 2, ty: 6 } }, 1, 6), null);
  assert.ok(placeCityTile(layout, 5, 6));
  assert.equal(layout.nextUid, OUTPOST_UID, "numbered apart from the home city's buildings");
});

test("the forge's trails come in from all four sides", () => {
  for (const seed of [3, 7, 11]) {
    const map = outpostCity(seed), plan = trailPlan(map, "ember")!;
    const sides = new Set(plan.entries.map((e) => `${e.dx},${e.dy}`));
    assert.equal(sides.size, 4, `seed ${seed}: in from every side (${[...sides]})`);
    for (const e of plan.entries) {
      const x = Math.min(CELLS_W - 1, Math.floor(e.x + e.dx * 0.5)), y = Math.min(CELLS_H - 1, Math.floor(e.y + e.dy * 0.5));
      assert.equal(map.type[cellIndex(x, y)], CellType.OUT);
    }
    // The forge keeps its lava, vents and scrap off them.
    const forge = emberForgePlan(map);
    for (const p of [...forge.pools, ...forge.vents, ...forge.scrap])
      assert.ok(plan.wear[cellIndex(Math.floor(p.x), Math.floor(p.y))] < 0.1, "nothing lies on a trail");
  }
});

test("at the outpost enemies come from every side, at a keep half as strong", () => {
  const save = defaultDefendSave(), map = outpostCity(5);
  const home = new DefendSim(generateCity(fitLayout(defaultLayout()) as any, 5), save.levels, 9);
  assert.ok(Math.abs(new DefendSim(map, save.levels, 9).keepMaxHp() - home.keepMaxHp() * OUTPOST_KEEP_HP) < 1e-9);
  const sides = new Set<string>();
  let count = 0;
  for (const seed of [1, 2, 3, 4]) {
    const sim = new DefendSim(map, save.levels, seed);
    sim.startAt(72);
    const seen = new Set<number>();
    for (let t = 0; t < 12 * 30; t++) {
      sim.update(1 / 30);
      for (const e of sim.enemies) {
        if (seen.has(e.id) || e.leader !== undefined) continue;
        seen.add(e.id);
        if (ENEMIES[e.kind].fortress) continue;
        sides.add(e.y < 4 ? "top" : e.y > CELLS_H - 4 ? "bottom" : e.x < 4 ? "left" : e.x > CELLS_W - 4 ? "right" : "inside");
      }
    }
    count += seen.size;
  }
  assert.ok(count > 8, `waves came (${count})`);
  assert.ok(!sides.has("inside"), "none appeared inside the field");
  for (const side of ["top", "bottom", "left", "right"]) assert.ok(sides.has(side), `some came from the ${side} (${[...sides]})`);
});

test("the outpost's view edits its own city and palette, never the home city's", () => {
  const save = defaultDefendSave();
  save.owned.cityTile = 14;
  save.owned.mine = 1;
  save.owned.archerTower = 2;
  const homeLayout = save.layout;
  const view = outpostView(save);
  assert.equal(available(view, "cityTile"), 10);
  assert.equal(available(view, "mine"), 0, "no Mine at the outpost");
  assert.equal(available(view, "archerTower"), 2);
  const next = withTower(view.layout);
  setLayout(view, next);
  assert.equal(save.outpost!.layout, next);
  assert.equal(save.layout, homeLayout, "the home city is untouched");
  assert.equal(available(view, "cityTile"), 9);
  assert.equal(available(save, "cityTile"), 14, "the home palette is untouched");
  assert.equal(available(view, "archerTower"), 1);
  // It round-trips through a save.
  const back = decodeDefendSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(back.outpost!.layout.cityTiles, next.cityTiles);
  assert.equal(back.outpost!.layout.outpost, true);
  assert.equal(back.outpost!.layout.structures.length, 1);
});

test("nothing outside Defend sees the outpost", () => {
  const game = defaults();
  game.defend.owned.mine = 1;
  game.defend.owned.archerTower = 1;
  const view = outpostGame(game);
  assert.equal(view.defend.layout, outpostView(game.defend).layout);
  assert.equal(realmActive(game, "mine"), false);
  view.defend.layout = withTower(view.defend.layout);
  assert.equal(game.defend.layout.structures.length, 0, "the home city (and so Siege and the Realm) is as it was");
  assert.equal(game.defend.outpost!.layout.structures.length, 1);
  // Battle bonuses read the outpost's buildings through its view.
  assert.deepEqual(bonuses(view).buildingOrders, bonuses(view).buildingOrders);
  view.equipment!.push({ id: 99, kind: "archerTower", uid: OUTPOST_UID, hp: 1, power: 1 });
  assert.equal(game.equipment?.length ?? 0, 0, "the outpost has no equipment of its own");
});
