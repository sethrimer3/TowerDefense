import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { chooseStep } from "../src/automation.ts";
import { CONSUMABLES } from "../src/crafting.ts";

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

test("inside a run the hand plays, and a turn steps along the first card's path", () => {
  const g = arena();
  assert.ok(g.auto, "the hand plays from the start of a run");
  g.autoTurn();
  assert.equal(g.activeCard, 0, "STAIRS, first in the base hand, moves the hero");
  assert.equal(g.cardPlan?.path.length, 7, "it commits to the rest of the shortest path");
  assert.equal(Math.abs(g.run.player.x) + Math.abs(g.run.player.y), 1);
  for (let i = 0; i < 7; i++) g.autoTurn();
  assert.equal(g.run.height, 1, "the path ends on the stairs");
});

test("a hand with no card that can act pauses, lights End Run, and plays on after the player acts", () => {
  const g = arena(3);
  (g.world as RoomWorld).cells.set("2,2", { kind: "floor" });
  const tonic = CONSUMABLES[0].id;
  g.save.consumables[tonic] = 2;
  g.autoTurn();
  assert.ok(g.handStuck && !g.auto && g.activeCard === null && !g.summary);
  assert.deepEqual([g.run.player.x, g.run.player.y], [0, 0]);
  assert.match(g.message, /^No card can move/);
  // Acting while nothing has changed leaves it paused.
  assert.ok(g.useConsumable(tonic));
  assert.ok(g.handStuck && !g.auto);
  // Once the floor has changed (here, a key appearing, as a skill might
  // make), the player's next action sets the hand playing again.
  (g.world as RoomWorld).cells.set("2,0", { kind: "key", color: "yellow" });
  assert.ok(g.useConsumable(tonic));
  assert.ok(!g.handStuck && g.auto);
  g.autoTurn();
  assert.equal(g.save.hand[g.activeCard!], "key");
  assert.deepEqual([g.run.player.x, g.run.player.y], [1, 0]);
});

test("undo pauses the hand and drops its path", () => {
  const g = arena();
  g.autoTurn();
  assert.ok(g.undo());
  assert.ok(!g.auto && g.cardPlan === null && g.activeCard === null);
  g.toggleAuto();
  assert.ok(g.auto);
  assert.equal(g.message, "The hand takes over.");
  g.toggleAuto();
  assert.equal(g.message, "Paused · the hand waits.");
});

test("inside a run only Dev mode lets the player move the hero", () => {
  const g = arena();
  assert.equal(g.stepManually(1, 0), false);
  g.walkTo(4, 4);
  assert.deepEqual([g.run.player.x, g.run.player.y, g.route.length], [0, 0, 0]);
  assert.equal(g.message, "The hand moves you inside a run.");
  g.save.settings.devMode = true;
  assert.ok(g.stepManually(1, 0));
});

test("an Automove turn in the forest takes the step automation chooses and names it", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 1 });
  assert.ok(!g.auto, "the player walks the forest");
  const step = chooseStep(g);
  assert.ok(step);
  const { x, y } = g.run.player;
  g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [x + step.dx, y + step.dy]);
  assert.equal(g.message, step.label);
});

test("a manual step drops the queued route and Automove", () => {
  const g = arena();
  g.save.settings.devMode = true;
  g.walkTo(4, 4);
  g.toggleAuto();
  assert.ok(g.route.length === 0 && g.auto, "turning Automove on drops the route");
  g.walkTo(4, 4);
  assert.ok(g.route.length && !g.auto, "walking turns Automove off");
  g.toggleAuto();
  assert.ok(g.stepManually(1, 0));
  assert.deepEqual([g.run.player.x, g.run.player.y, g.route.length, g.auto], [1, 0, 0, false]);
  g.run.outside = true;
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
