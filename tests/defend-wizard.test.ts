// The wizard tower (src/defend/wizard.ts): flame and ice in turn, the
// flame's cone, and the ice front's one hit and chill.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile, placeStructure } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy, type Levels } from "../src/defend/sim.ts";
import { CHILL_SPEED, ENEMIES, FLAME_SECONDS, ICE_RANGE, UPGRADES, flameDps, flameRange } from "../src/defend/catalog.ts";
import { center } from "../src/defend/pathing.ts";
import { chilled, stepFlames, stepFrosts, Wizards } from "../src/defend/wizard.ts";

const LEVELS = Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Levels;

/** A city with one wizard tower just outside its north wall. */
function wizardSim() {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, tx + dx, ty + dy) ?? assert.fail("tile");
  l = placeStructure(l, "wizardTower", tx, ty - 3) ?? assert.fail("wizard tower");
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...LEVELS }, 1);
  const tower = sim.map.buildings.find((b) => b.kind === "wizardTower")!;
  return { sim, tower, at: center(tower.rect) };
}

/** A sturdy orc standing at (x, y), never moving on its own. */
function orc(sim: DefendSim, x: number, y: number): Enemy {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  index(sim);
  return e;
}

/** The sim's enemy index is rebuilt each step; tests placing enemies by hand rebuild it. */
const index = (sim: DefendSim) => (sim as unknown as { indexEnemies(): void }).indexEnemies();

test("a wizard tower alternates fire and ice, resting after each", () => {
  const { sim, tower, at } = wizardSim();
  const wizards = new Wizards();
  orc(sim, at.x, at.y - 3);
  wizards.step(sim, 1 / 30);
  assert.equal(sim.flames.length, 1, "fire first");
  assert.equal(sim.flames[0].tower, tower.id);
  for (let t = 0; t < FLAME_SECONDS + 0.1; t += 1 / 30) {
    wizards.step(sim, 1 / 30);
    stepFlames(sim, wizards, 1 / 30);
  }
  assert.equal(sim.flames.length, 0, "the burst burns out");
  wizards.step(sim, 1 / 30);
  assert.equal(sim.frosts.length, 0, "it rests first");
  for (let t = 0; t < 2 && !sim.frosts.length; t += 1 / 30) wizards.step(sim, 1 / 30);
  assert.equal(sim.frosts.length, 1, "then ice");
  assert.equal(sim.flames.length, 0);
});

test("the flame burns what is in its cone and spares what is not", () => {
  const { sim, at } = wizardSim();
  const wizards = new Wizards();
  const ahead = orc(sim, at.x, at.y - 0.4 - 2.5), aside = orc(sim, at.x + 3, at.y - 0.4), far = orc(sim, at.x, at.y - flameRange(0) - 2);
  wizards.step(sim, 1 / 30);
  for (let k = 0; k < 30; k++) stepFlames(sim, wizards, 1 / 30);
  assert.ok(ahead.maxHp - ahead.hp > flameDps(0) * 0.5, "burned");
  assert.equal(aside.hp, aside.maxHp, "outside the cone");
  assert.equal(far.hp, far.maxHp, "out of reach");
});

test("the ice front hits each enemy once and chills it, which slows it", () => {
  const { sim, at } = wizardSim();
  const e = orc(sim, at.x, at.y - 3);
  sim.frosts.push({ x: at.x, y: at.y, angle: -Math.PI / 2, half: 0.6, r: 0.6, range: ICE_RANGE, t: 0, seed: 1, hit: [] });
  for (let k = 0; k < 60; k++) stepFrosts(sim, 1 / 30);
  const once = e.maxHp - e.hp;
  assert.ok(once > 0);
  for (let k = 0; k < 60; k++) stepFrosts(sim, 1 / 30);
  assert.equal(e.maxHp - e.hp, once, "one hit per wave");
  assert.ok(e.chill! > 0);
  assert.equal(chilled(e), CHILL_SPEED);
  // The chill wears off in the sim's own tick.
  for (let k = 0; k < 30 * 10; k++) sim.step(1 / 30);
  assert.equal(e.chill, undefined);
  assert.equal(chilled(e), 1);
  assert.ok(ENEMIES.orc.speed > 0);
});

test("battles with wizard towers replay exactly from their seed", () => {
  const run = () => {
    const { sim } = wizardSim();
    for (let k = 0; k < 30 * 90; k++) sim.update(1 / 30);
    return JSON.stringify([sim.wave, sim.enemies, sim.flames, sim.frosts, sim.slain]);
  };
  assert.equal(run(), run());
});
