// How the Mine's crew moves while it works and waits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HABITS, habitAt, habitPose, hammerAt, shovelAt, temperament } from "../src/mine/acts.ts";

test("each miner has a temperament of two habits, kept for life", () => {
  const names = ["Ada Flint", "Bram Cole", "Cora Vane", "Dov Marl", "Esme Pike", "Finn Tarr"];
  for (const n of names) {
    const [a, b] = temperament(n);
    assert.notEqual(a, b);
    assert.ok(HABITS.includes(a) && HABITS.includes(b));
    assert.deepEqual(temperament(n), [a, b]);
  }
  assert.ok(new Set(names.map((n) => temperament(n).join())).size > 1, "temperaments differ");
});

test("a waiting miner passes the time in spells, mostly its own habits", () => {
  const name = "Ada Flint", [a, b] = temperament(name), seen = new Map<string, number>();
  let last = habitAt(name, 0);
  for (let t = 0; t < 600_000; t += 250) {
    const h = habitAt(name, t);
    assert.ok(h.t >= 0 && h.t < 1);
    if (h.spell === last.spell) assert.equal(h.habit, last.habit, "a spell keeps one habit");
    if (h.spell !== last.spell) seen.set(h.habit, (seen.get(h.habit) ?? 0) + 1);
    last = h;
  }
  const spells = [...seen.values()].reduce((x, y) => x + y, 0);
  assert.ok(spells > 100, `spells pass (${spells})`);
  assert.ok(((seen.get(a) ?? 0) + (seen.get(b) ?? 0)) / spells > 0.4, "its temperament shows");
  assert.ok(seen.size >= 5, "and other habits now and then");
});

test("habits pose the figure: looking about turns it, sitting sits, stretching reaches", () => {
  assert.equal(habitPose("look", 0.1, 1, 0).facing, 1);
  assert.equal(habitPose("look", 0.3, 1, 0).facing, -1);
  assert.equal(habitPose("sit", 0.5, 1, 0).pose, "sit");
  assert.equal(habitPose("stretch", 0.4, 1, 0).pose, "reach");
  assert.equal(habitPose("sift", 0.5, -1, 0).pose, "crouch");
  assert.equal(habitPose("stand", 0.5, -1, 0).facing, -1);
});

test("a forge hand scoops, carries and throws, a throw each cycle", () => {
  const stages = new Set<string>();
  let throws = 0, prev = shovelAt(3, 0);
  for (let t = 0; t < 16_000; t += 50) {
    const s = shovelAt(3, t);
    stages.add(s.stage);
    if (s.stage === "throw" && prev.stage !== "throw") throws++;
    prev = s;
  }
  assert.deepEqual([...stages].sort(), ["carry", "scoop", "throw"]);
  assert.ok(throws >= 9 && throws <= 11, `about one throw in 1.6 s (${throws})`);
});

test("a smith's bar cools stroke by stroke, then is quenched", () => {
  let heat = 2, quenched = 0, strokes = 0, prev = hammerAt(1, 0);
  for (let t = 0; t < 30_000; t += 25) {
    const h = hammerAt(1, t);
    if (h.stage === "quench" && prev.stage !== "quench") {
      quenched++;
      heat = 2;
    } else if (h.stage !== "quench") {
      assert.ok(h.heat <= heat + 1e-9, "the bar only cools until quenched");
      heat = h.heat;
    }
    if (h.stage === "strike" && prev.stage !== "strike") strokes++;
    prev = h;
  }
  assert.ok(quenched >= 3, `bars quenched (${quenched})`);
  assert.ok(strokes > 30, `strokes struck (${strokes})`);
});
