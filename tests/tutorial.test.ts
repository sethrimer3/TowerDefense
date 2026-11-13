// The first-time tutorial's pure parts (src/ui/tutorial.ts): its lessons'
// words, decoding the read lessons, what an older save has outgrown, and
// where the card sits beside the lit target.
import test from "node:test";
import assert from "node:assert/strict";
import { decodeTutorial, LESSON_IDS, LESSONS, placeCard } from "../src/ui/tutorial.ts";
import { decode, defaults } from "../src/save.ts";
import { placeCityTile, placeStructure } from "../src/defend/layout.ts";

test("every lesson has short steps with unique keys", () => {
  for (const id of LESSON_IDS) {
    const steps = LESSONS[id];
    assert.ok(steps.length > 0, id);
    assert.equal(new Set(steps.map((s) => s.key)).size, steps.length, id);
    for (const s of steps) assert.ok(s.title && s.text.length <= 110, `${id}.${s.key} is short`);
  }
});

test("decodeTutorial keeps known lessons once", () => {
  assert.deepEqual(decodeTutorial(["build", "nope", 3, "build", "mineTab"]), ["build", "mineTab"]);
  assert.deepEqual(decodeTutorial("build"), []);
});

test("a new game has read nothing; a stored list round-trips", () => {
  assert.deepEqual(defaults().tutorial, []);
  const s = defaults();
  s.tutorial = ["build", "battle"];
  assert.deepEqual(decode(JSON.stringify(s)).tutorial, ["build", "battle"]);
});

test("a save from before the tutorial skips what its player has outgrown", () => {
  const fresh: any = defaults();
  delete fresh.tutorial;
  assert.deepEqual(decode(JSON.stringify(fresh)).tutorial, []);
  const veteran: any = defaults();
  delete veteran.tutorial;
  veteran.defend.bestWave = 4;
  const k = veteran.defend.layout.keep;
  veteran.defend.layout = placeStructure(placeCityTile(veteran.defend.layout, k.tx, k.ty - 1), "mine", k.tx, k.ty - 1);
  assert.deepEqual(decode(JSON.stringify(veteran)).tutorial, ["build", "battle", "minePlaced", "mineTab"]);
});

test("the card goes below, above, beside or centred, inside the view", () => {
  const view = { w: 390, h: 844 }, card = { w: 300, h: 120 };
  assert.equal(placeCard({ x: 20, y: 20, w: 60, h: 40 }, card, view).side, "below");
  assert.equal(placeCard({ x: 20, y: 760, w: 60, h: 40 }, card, view).side, "above");
  assert.equal(placeCard({ x: 0, y: 0, w: 60, h: 844 }, { w: 200, h: 120 }, view).side, "right");
  assert.equal(placeCard({ x: 330, y: 0, w: 60, h: 844 }, { w: 200, h: 120 }, view).side, "left");
  assert.equal(placeCard({ x: 0, y: 0, w: 390, h: 844 }, card, view).side, "center");
  assert.equal(placeCard(null, card, view).side, "center");
  for (const hole of [{ x: 370, y: 10, w: 20, h: 20 }, { x: 0, y: 800, w: 10, h: 40 }]) {
    const at = placeCard(hole, card, view);
    assert.ok(at.x >= 10 && at.x + card.w <= view.w - 10 && at.y >= 10 && at.y + card.h <= view.h - 10, JSON.stringify(at));
  }
});
