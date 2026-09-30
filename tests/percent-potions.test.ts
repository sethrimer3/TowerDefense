import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { ENTRANCE_Y } from "../src/outside.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import { withPotions } from "../src/board.ts";
import { resolveStep, POTION_HEAL, type StepEffect } from "../src/step-effects.ts";
import { potionPercent, trainingPoints, trainingStep } from "../src/loadout.ts";
import { xpForLevel } from "../src/config.ts";
import type { Player, Tile } from "../src/entities.ts";

const redPotions = (tiles: Iterable<Tile>) => [...tiles].filter((t) => t.kind === "potion" && t.color === "red").length;
const boardTiles = (b: { tile(x: number, y: number): Tile }, w: number, y0: number, y1: number) => {
  const out: Tile[] = [];
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) out.push(b.tile(x, y));
  return out;
};

test("a percent potion restores its HP and a share of max HP, which Potion HP leaves alone", () => {
  const p: Player = { x: 0, y: 0, hp: 1, maxHp: 1000, attack: 1, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
  const heal = (t: Tile, potionHeal: number, percentPotion: number) =>
    (resolveStep(p, t, { potionHeal, percentPotion }) as StepEffect).healed;
  assert.equal(heal({ kind: "potion", color: "red" }, 100, 100), POTION_HEAL + 10, "35 and 1% of 1000");
  assert.equal(heal({ kind: "potion", color: "red" }, 200, 150), POTION_HEAL + 15, "Potion HP doubles only the regular potion");
  assert.equal(heal({ kind: "potion", color: "blue" }, 200, 150), 70);
  assert.equal(heal({ kind: "potion", color: "red" }, 100, 125), POTION_HEAL + 13, "12.5 rounds up");
});

test("Recovery opens percent potions at 1%, and Potion % training adds 0.25% a rank", () => {
  const s = defaults();
  s.xp = xpForLevel(2);
  assert.equal(potionPercent(s), 0);
  const g = new Game(s);
  assert.equal(g.train("potion"), false, "the row waits on Recovery");
  s.upgrades.recovery = 1;
  assert.equal(potionPercent(s), 100);
  assert.deepEqual((({ now, next, worth, unit }) => ({ now, next, worth, unit }))(trainingStep(s, "potion")), { now: 1, next: 1.25, worth: 0.25, unit: "%" });
  const left = trainingPoints(s).left;
  assert.ok(g.train("potion"));
  assert.equal(trainingPoints(s).left, left - 1, "one point a rank");
  assert.equal(potionPercent(s), 125);
  assert.equal(g.stepRules.percentPotion, 125);
});

test("a board shows percent potions only for a run that has them", () => {
  const red: Tile = { kind: "potion", color: "red" };
  assert.deepEqual(withPotions(red, false), { kind: "potion", color: "blue" });
  assert.equal(withPotions(red, true), red);
  let found = 0;
  for (let seed = 1; seed <= 12 && !found; seed++) for (let room = 0; room < 6; room++) {
    const shown = new RoomWorld(seed, room, {}, true), hidden = new RoomWorld(seed, room, {}, false);
    const reds = redPotions(boardTiles(shown, 17, 0, 17));
    found += reds;
    assert.equal(redPotions(boardTiles(hidden, 17, 0, 17)), 0);
    const potions = (b: RoomWorld) => boardTiles(b, 17, 0, 17).filter((t) => t.kind === "potion").length;
    assert.equal(potions(hidden), potions(shown), "the same potions, only regular");
  }
  assert.ok(found > 0, "the Tower's floors hold percent potions");
});

test("about half the Delve's guard potions are percent potions, shown only with them", () => {
  const run = (percentPotions: boolean) => ({ seed: 7, changes: {}, floor: 0, milestone: 0, percentPotions });
  const shown = boardTiles(new World(run(true)), 30, 0, 200), hidden = boardTiles(new World(run(false)), 30, 0, 200);
  const plain = shown.filter((t) => t.kind === "potion" && t.amount === undefined);
  const reds = redPotions(plain);
  assert.ok(plain.length >= 10 && reds > plain.length * 0.25 && reds < plain.length * 0.75, `${reds} of ${plain.length}`);
  assert.equal(redPotions(hidden), 0);
  assert.equal(hidden.filter((t) => t.kind === "potion").length, shown.filter((t) => t.kind === "potion").length);
});

test("a run takes Recovery with it when it goes inside, and keeps it", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 3 });
  g.save.upgrades.recovery = 1;
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 20 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
  assert.equal(g.run.percentPotions, true);
  const without = new Game(defaults());
  without.newRun({ seed: 3 });
  assert.equal(without.run.percentPotions, false);
});
