import test from "node:test";
import assert from "node:assert/strict";
import { GHOST, GHOST_PIXELS, Ghosts } from "../src/defend/ghosts.ts";

const soldier = (id: number, hp = 10) => ({ id, x: 4, y: 5, hp, kind: "sword" as const });
const civilian = (id: number, hp = 10) => ({ id, x: 2, y: 3, hp });

test("a defender who dies raises one ghost where it fell", () => {
  const g = new Ghosts();
  const s = soldier(1), c = civilian(2), home = civilian(3);
  const sim = { soldiers: [s], civilians: [c, home] };
  g.watch(sim, 0);
  assert.equal(g.ghosts.length, 0);
  s.hp = 0; c.hp = -2;
  // The sim drops the dead, and a civilian gone home alive.
  sim.soldiers = []; sim.civilians = [];
  g.watch(sim, 0.1);
  assert.deepEqual(g.ghosts.map(x => [x.kind, x.x, x.y]), [["sword", 4, 5], ["civilian", 2, 3]]);
  g.watch(sim, 0.2);
  assert.equal(g.ghosts.length, 2, "each dies once");
  g.watch(sim, 0.1 + GHOST.life + 0.01);
  assert.equal(g.ghosts.length, 0, "ghosts fade away");
});

test("a new battle clears the ghosts, and a crowd of deaths stays capped", () => {
  const g = new Ghosts();
  const many = Array.from({ length: GHOST.max + 20 }, (_, i) => soldier(i));
  const sim = { soldiers: many, civilians: [] };
  g.watch(sim, 0);
  for (const s of many) s.hp = 0;
  sim.soldiers = [];
  g.watch(sim, 0.1);
  assert.equal(g.ghosts.length, GHOST.max);
  g.watch({ soldiers: [], civilians: [] }, 0.2);
  assert.equal(g.ghosts.length, 0);
});

test("a ghost rises, sways and fades, and holds still under reduced motion", () => {
  const ghost = { kind: "archer" as const, x: 0, y: 0, born: 0, seed: 1 };
  const early = Ghosts.pose(ghost, 0.3, false), late = Ghosts.pose(ghost, GHOST.life * 0.9, false);
  assert.ok(late.dy < early.dy && early.dy < 0, "it rises");
  assert.ok(late.alpha < early.alpha, "it fades");
  const still = Ghosts.pose(ghost, 1, true);
  assert.equal(still.dy, 0);
  assert.equal(still.dx, 0);
  for (const rows of GHOST_PIXELS) for (const row of rows) assert.equal(row.length, rows[0].length);
});
