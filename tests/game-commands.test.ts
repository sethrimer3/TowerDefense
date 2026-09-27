import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/generation.ts";
import { chooseStep } from "../src/automation.ts";

/** A Tower floor of open tiles with `size` columns and rows, the player in
 * the corner and (when it fits) the stairs opposite. */
function arena(size = 5) {
  const g = new Game(defaults());
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  if (size > 1) w.cells.set(`${size - 1},${size - 1}`, { kind: "stairs" });
  g.run.player.x = 0;
  g.run.player.y = 0;
  return g;
}

test("an Automove turn takes the step automation chooses and names it", () => {
  const g = arena();
  const step = chooseStep(g);
  assert.ok(step);
  g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [step.dx, step.dy]);
  assert.equal(g.message, step.label);
});

test("an Automove turn with nothing to do waits and says so", () => {
  const g = arena(1);
  g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [0, 0]);
  assert.match(g.message, /^Waiting/);
});

test("a manual step drops the queued route and Automove", () => {
  const g = arena();
  g.walkTo(4, 4);
  g.toggleAuto();
  assert.ok(g.route.length === 0 && g.auto, "turning Automove on drops the route");
  g.walkTo(4, 4);
  assert.ok(g.route.length && !g.auto, "walking turns Automove off");
  g.toggleAuto();
  assert.ok(g.stepManually(1, 0));
  assert.deepEqual([g.run.player.x, g.run.player.y, g.route.length, g.auto], [1, 0, 0, false]);
  g.toggleAuto();
  assert.equal(g.message, "Wayfinder is searching for a route.");
  g.toggleAuto();
  assert.equal(g.message, "Manual climbing");
});

test("after a retire the next run starts fresh in the forest; after a death it is already there", () => {
  const g = arena();
  const retired = g.run.seed;
  g.finish("Ascent retired");
  assert.ok(g.summary && !g.summary.dead);
  g.nextRun();
  assert.equal(g.summary, null);
  assert.ok(g.run.outside && g.run.seed !== retired && g.save.tower.run === g.run);
  assert.equal(g.message, "Follow the forest path to the entrance.");

  const afterDeath = g.run;
  g.summary = { height: 3, kills: 1, reason: "Fallen", dead: true, record: false };
  g.nextRun();
  assert.equal(g.summary, null);
  assert.equal(g.run, afterDeath, "the run a death started is kept");
});

test("erasing everything leaves a fresh save with a new run outside the Tower", () => {
  const g = arena();
  g.setDevMode(true);
  g.switchMode("delve");
  g.finish("Delve run ended");
  g.eraseAll();
  assert.equal(g.mode, "tower");
  assert.equal(g.summary, null);
  assert.ok(g.run.outside && g.save.tower.run === g.run);
  // Everything but the new run and the Defend city's random seed.
  const fresh = defaults();
  fresh.tower.run = g.run;
  fresh.defend.seed = g.save.defend.seed;
  assert.deepEqual(g.save, fresh);
});
