import test from "node:test";
import assert from "node:assert/strict";
import { AmbushSim } from "../src/campaign/ambush-sim.ts";
import { ambushField } from "../src/campaign/battlefield.ts";
import { defaults } from "../src/save.ts";
import { CellType } from "../src/defend/citygen.ts";
import { rectCells } from "../src/defend/grid.ts";
import { center, rectDist } from "../src/defend/pathing.ts";
import { build } from "./ambush-helpers.ts";
import { AMBUSH_WAVES } from "../src/campaign/ambush-waves.ts";
test("All thirty native levels have two fenced towns and a separate keep castle", () => {
  for (let i = 0; i < 30; i++) {
    const f = ambushField(i);
    assert.equal(f.outposts.length, 2);
    assert.ok(f.outposts.every((p) => p.houses.length > 0));
    for (const p of f.outposts) {
      assert.ok(rectCells(p.rect).every((c) => c >= 0 && c < f.map.type.length));
      assert.ok(rectDist(f.castle, center(p.rect).x, center(p.rect).y) > 8);
    }
    const crossings = f.map.buildings.filter((b) => b.fence && f.road.has(b.cells[0]));
    assert.ok(crossings.length >= 4);
    assert.ok(crossings.every((b) => f.map.owner[b.cells[0]] === b.id && f.map.type[b.cells[0]] === CellType.WALL));
  }
  const s = new AmbushSim(0, defaults()),
    fence = s.map.buildings.find((b) => b.fence)!,
    stone = s.map.buildings.find((b) => b.kind === "wall" && !b.fence)!;
  assert.equal(s.engine.maxHp[fence.id], s.engine.maxHp[stone.id] * 0.1 * AMBUSH_WAVES.outpostHp);
});
test("Outpost health waits for a breach, counts standing houses and never resurrects a fallen star", () => {
  const s = new AmbushSim(0, defaults()),
    post = s.outposts.posts[0],
    id = post.houses[0];
  s.engine.damageBuilding(id, s.engine.hp[id] * 2);
  s.outposts.update();
  assert.equal(post.health, 1);
  const p = center(post.rect);
  s.engine.spawnAuxiliary("orc", p.x, p.y);
  s.outposts.update();
  assert.ok(post.breached);
  assert.equal(post.health, (post.initial - 1) / post.initial);
  assert.equal(s.stars, 3);
  for (const id of post.houses) s.engine.damageBuilding(id, s.engine.hp[id] * 2);
  s.outposts.update();
  assert.ok(post.fallen);
  assert.equal(s.stars, 2);
});
test("Covering every house holds full health until the first ground body enters", () => {
  const s = new AmbushSim(0, defaults()),
    post = s.outposts.posts[0];
  for (const id of post.houses) s.engine.configureLot(id, "house", s.map.buildings[id].rect, false);
  assert.equal(post.health, 1);
  const p = center(post.rect);
  s.engine.spawnAuxiliary("bat", p.x, p.y);
  s.outposts.update();
  assert.equal(post.health, 1, "Fliers ignore outpost breaches.");
  s.engine.spawnAuxiliary("orc", p.x, p.y);
  s.outposts.update();
  assert.equal(post.health, 0);
  assert.ok(post.fallen);
});
test("Native ground attacks break a road fence, raze the objective and resume down the track", () => {
  const s = new AmbushSim(0, defaults()),
    post = s.outposts.posts[0],
    fence = s.map.buildings.find((b) => b.fence && s.field.road.has(b.cells[0]) && b.rect.y === post.rect.y)!;
  assert.ok(fence);
  const e = s.engine.spawnAuxiliary("orc", fence.rect.x + 0.5, fence.rect.y - 1)!;
  const crossings = s.map.buildings.filter((b) => b.fence && s.field.road.has(b.cells[0]) && b.rect.y === post.rect.y);
  for (let n = 0; n < 600 && !crossings.some((b) => s.engine.hp[b.id] <= 0); n++) s.engine.step(1 / 30);
  const broken = crossings.find((b) => s.engine.hp[b.id] <= 0);
  assert.ok(broken);
  assert.equal(s.engine.solid[broken.cells[0]], 0);
  e.x = center(post.rect).x;
  e.y = center(post.rect).y;
  s.outposts.update();
  for (const id of post.houses) s.engine.damageBuilding(id, s.engine.hp[id] * 2);
  s.outposts.update();
  assert.ok(post.fallen);
  for (let n = 0; n < 900; n++) s.engine.step(1 / 30);
  assert.ok(rectDist(post.rect, e.x, e.y) > 1);
});
test("Fliers take a straight route to the keep and a keep loss defeats even intact outposts", () => {
  const s = new AmbushSim(0, defaults()),
    p = s.field.path[0],
    start = { x: 0.5, y: p.y },
    e = s.engine.spawnAuxiliary("bat", start.x, start.y)!,
    goal = center(s.engine.keep.rect),
    dx = goal.x - start.x,
    dy = goal.y - start.y;
  for (let n = 0; n < 90; n++) s.engine.step(1 / 30);
  assert.ok(Math.abs((e.x - start.x) * dy - (e.y - start.y) * dx) < 1e-5);
  assert.ok(s.outposts.posts.every((p) => !p.breached));
  build(s, "archerTower");
  s.start();
  s.engine.damageBuilding(s.engine.keepId, s.engine.keepHp() * 2);
  s.step(1 / 30);
  assert.equal(s.phase, "lost");
  assert.equal(s.stars, 0);
  assert.ok(s.outposts.posts.every((p) => !p.fallen));
});
test("Replanning around a placed building is deterministic and preserves house damage", () => {
  const s = new AmbushSim(0, defaults()),
    post = s.outposts.posts[0];
  s.gold = 10000;
  const hit = post.houses[0];
  s.engine.damageBuilding(hit, s.engine.hp[hit] / 2);
  const before = s.engine.hp[hit] / s.engine.maxHp[hit];
  let spot: { qx: number; qy: number } | undefined;
  for (let qy = 1; qy < 50 && !spot; qy++)
    for (let qx = 1; qx < 35; qx++) {
      const c = s.grid.check("archerTower", qx, qy, s.buildings);
      if (
        c.fits &&
        c.rect.x > post.rect.x &&
        c.rect.y > post.rect.y &&
        c.rect.x + c.rect.w < post.rect.x + post.rect.w &&
        c.rect.y + c.rect.h < post.rect.y + post.rect.h
      ) {
        spot = { qx, qy };
        break;
      }
    }
  assert.ok(spot);
  assert.ok(s.placeAt("archerTower", spot.qx, spot.qy));
  assert.equal(post.initial, s.field.outposts[0].houses.length);
  if (!s.map.buildings[hit].hidden) assert.ok(s.engine.hp[hit] / s.engine.maxHp[hit] <= before + 0.00001);
  const layout = JSON.stringify(post.houses.map((id) => s.map.buildings[id].rect));
  assert.equal(post.replan(s.buildings), false);
  assert.equal(JSON.stringify(post.houses.map((id) => s.map.buildings[id].rect)), layout);
});
