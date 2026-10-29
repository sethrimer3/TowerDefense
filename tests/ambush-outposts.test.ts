import test from "node:test";
import assert from "node:assert/strict";
import { AmbushSim } from "../src/campaign/ambush-sim.ts";
import { ambushField } from "../src/campaign/ambush-field.ts";
import { defaults } from "../src/save.ts";
import { CellType } from "../src/defend/citygen.ts";
import { rectCells } from "../src/defend/grid.ts";
import { center, rectDist } from "../src/defend/pathing.ts";
import { build } from "./ambush-helpers.ts";
import { AMBUSH_WAVES } from "../src/campaign/ambush-waves.ts";
import { FENCE_SHARE, STONE_SHARE } from "../src/campaign/outposts.ts";
import { STONE_RANK, ambushBonuses } from "../src/ambush-upgrades.ts";
test("All thirty native levels have two fenced towns and a separate keep castle, gated where the road meets them", () => {
  for (let i = 0; i < 30; i++) {
    const f = ambushField(i);
    assert.equal(f.outposts.length, 2);
    assert.ok(f.outposts.every((p) => p.houses.length > 0));
    for (const p of f.outposts) {
      assert.ok(rectCells(p.rect).every((c) => c >= 0 && c < f.map.type.length));
      assert.ok(rectDist(f.castle, center(p.rect).x, center(p.rect).y) > 8);
      assert.ok(p.gates.length >= 1, `level ${i}: an outpost without a gate`);
      for (const id of p.gates) {
        const g = f.map.buildings[id];
        assert.ok(g.kind === "gate" && g.woodGate && g.cells.some((c) => f.road.has(c)));
        assert.ok(g.cells.every((c) => f.map.owner[c] === id && f.map.type[c] === CellType.WALL && f.map.wall[c] === 1));
      }
      // The fence's rails join round the ring: a corner stone turns with two.
      const corner = p.walls.map((id) => f.map.buildings[id]).find((b) => b.rect.x === p.rect.x && b.rect.y === p.rect.y)!;
      assert.equal(corner.rails!.length, 2);
      assert.deepEqual(corner.rails!.map((r) => [r.x1, r.y1]), [
        [p.rect.x + 0.5, p.rect.y + 0.5],
        [p.rect.x + 0.5, p.rect.y + 0.5],
      ]);
    }
    assert.ok(f.castleGates.length >= 1, `level ${i}: the keep's wall has no gate`);
    assert.ok(f.castleGates.every((id) => !f.map.buildings[id].woodGate && f.map.buildings[id].cells.some((c) => f.road.has(c))));
    // Only gates cross: every road cell left in an outpost's fence is a gate's.
    for (const b of f.map.buildings) if (b.fence) assert.ok(b.cells.every((c) => f.map.owner[c] === b.id));
  }
  const s = new AmbushSim(0, defaults()),
    fence = s.map.buildings.find((b) => b.fence)!,
    stone = s.map.buildings.find((b) => b.kind === "wall" && !b.fence && !b.hidden)!;
  assert.equal(s.engine.maxHp[fence.id], s.engine.maxHp[stone.id] * FENCE_SHARE * AMBUSH_WAVES.outpostHp);
  for (const id of s.field.outposts[0].gates) assert.equal(s.engine.maxHp[id], s.engine.maxHp[fence.id]);
  for (const id of s.field.castleGates) assert.equal(s.engine.maxHp[id], s.engine.maxHp[stone.id]);
  // Your own people walk through the gates; the enemy only while one stands open.
  for (const id of [...s.field.outposts[0].gates, ...s.field.castleGates])
    for (const c of s.map.buildings[id].cells) assert.ok(s.engine.ownSolid[c] === 0 && s.engine.foeSolid[c] === 1);
});
test("Palisades III rebuilds the outposts' fences and gates in stone", () => {
  const game = defaults();
  game.campaigns.ambush.ranks = { palisades: STONE_RANK };
  const s = new AmbushSim(0, game),
    plain = new AmbushSim(0, defaults());
  assert.ok(s.field.stone && !s.map.buildings.some((b) => b.fence || b.woodGate));
  const post = s.field.outposts[0],
    wall = post.walls[0],
    castle = s.map.buildings.find((b) => b.kind === "wall" && !b.hidden && !post.walls.includes(b.id) && !s.field.outposts[1].walls.includes(b.id))!;
  assert.equal(s.engine.maxHp[wall], (s.engine.maxHp[castle.id] / ambushBonuses(game.campaigns.ambush.ranks).keep) * STONE_SHARE * 1.45 * AMBUSH_WAVES.outpostHp);
  for (const id of post.gates) assert.equal(s.engine.maxHp[id], s.engine.maxHp[wall]);
  assert.ok(s.engine.maxHp[wall] > plain.engine.maxHp[plain.field.outposts[0].walls[0]] * 10);
  // The same gates in the same places, only stone.
  assert.deepEqual(
    post.gates.map((id) => s.map.buildings[id].rect),
    plain.field.outposts[0].gates.map((id) => plain.map.buildings[id].rect),
  );
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
test("Native ground attacks batter the road's gate, not the fence beside it, raze the objective and resume down the track", () => {
  for (const stone of [false, true]) {
    const game = defaults();
    if (stone) game.campaigns.ambush.ranks = { palisades: STONE_RANK };
    const s = new AmbushSim(0, game),
      post = s.outposts.posts[0],
      gate = s.map.buildings[s.field.outposts[0].gates.find((id) => s.map.buildings[id].gate!.side === "n")!];
    assert.ok(gate);
    const e = s.engine.spawnAuxiliary("orc", gate.rect.x + 2, gate.rect.y - 3)!;
    for (let n = 0; n < 3000 && s.engine.hp[gate.id] > 0; n++) s.engine.step(1 / 30);
    assert.ok(s.engine.hp[gate.id] <= 0, "The gate falls.");
    assert.equal(s.engine.solid[gate.cells[0]], 0);
    assert.ok(
      s.field.outposts[0].walls.every((id) => s.engine.hp[id] === s.engine.maxHp[id]),
      "Every stretch of fence or wall stands whole.",
    );
    e.x = center(post.rect).x;
    e.y = center(post.rect).y;
    s.outposts.update();
    for (const id of post.houses) s.engine.damageBuilding(id, s.engine.hp[id] * 2);
    s.outposts.update();
    assert.ok(post.fallen);
    for (let n = 0; n < 900; n++) s.engine.step(1 / 30);
    assert.ok(rectDist(post.rect, e.x, e.y) > 1);
  }
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
