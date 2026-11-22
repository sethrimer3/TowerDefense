// The Sigil tower (src/defend/sigils.ts), the Wizard tower's fourth branch:
// it charges, draws a magic circle where a ground enemy stood, and bursts
// over everything inside, the burst stacking fire (I), then blue ice-fire (III).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile, placeStructure } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy, type Levels } from "../src/defend/sim.ts";
import { NO_BONUSES, UPGRADES, type Bonuses, type EnemyKind } from "../src/defend/catalog.ts";
import { center } from "../src/defend/pathing.ts";
import { chilled } from "../src/defend/wizard.ts";
import { stepIceFire, stepSigils, sigilDamage } from "../src/defend/sigils.ts";
import { SIGIL } from "../src/knowledge-paths.ts";
import { buildingTree, mergePartners, nextSteps, recipe, ATTUNED } from "../src/specializations.ts";
import { averageDps } from "../src/defend/average-dps.ts";

const LEVELS = Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Levels;
const DT = 1 / 30;

function battle(rank = 0) {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, tx + dx, ty + dy) ?? assert.fail("tile");
  l = placeStructure(l, "sigilTower", tx, ty - 3) ?? assert.fail("sigilTower");
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  const paths: Bonuses["paths"] = rank ? { sigilTower: { path: "sigils", rank } } : undefined;
  const sim = new DefendSim(generateCity(fit, 4), { ...LEVELS }, 1, paths ? { ...NO_BONUSES, paths } : NO_BONUSES);
  const b = sim.map.buildings.find((o) => o.kind === "sigilTower")!;
  return { sim, b, at: center(b.rect) };
}

function enemy(sim: DefendSim, x: number, y: number, kind: EnemyKind = "orc"): Enemy {
  const e: Enemy = { id: sim.newId(), kind, x, y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as unknown as { indexEnemies(): void }).indexEnemies();
  return e;
}

/** Steps just the Sigil tower, its circles and the burns for `seconds`. */
function run(sim: DefendSim, seconds: number, each?: () => void) {
  for (let t = 0; t < seconds; t += DT) {
    sim.sigilTowers.step(sim, DT);
    stepSigils(sim, DT);
    stepIceFire(sim, DT);
    for (const e of sim.enemies) if (e.burn !== undefined && (e.burn -= DT) <= 0) delete e.burn;
    each?.();
  }
}

test("it charges, then draws its circle where a ground enemy stood, and bursts over fliers inside it too", () => {
  const { sim, at } = battle();
  const orc = enemy(sim, at.x, at.y - 3);
  const hornet = enemy(sim, at.x + 0.5, at.y - 3, "lanternHornet");
  run(sim, SIGIL.charge[0] - 0.1);
  assert.equal(sim.sigils.length, 0, "still charging");
  assert.ok(sim.sigilTowers.charged(sim.map.buildings.find((o) => o.kind === "sigilTower")!.id) > 0.9);
  for (let t = 0; t < 0.2 && !sim.sigils.length; t += DT) run(sim, DT / 2);
  assert.equal(sim.sigils.length, 1);
  const s = sim.sigils[0];
  assert.deepEqual([s.x, s.y], [orc.x, orc.y], "on the ground enemy, not the flier");
  // The circle stays where it was drawn, whoever walks off.
  orc.x += 0.2;
  run(sim, SIGIL.draw - 0.2);
  assert.equal(orc.hp, orc.maxHp, "nothing until the circle closes");
  run(sim, 0.25);
  const hit = sigilDamage(sim, 0);
  assert.equal(orc.maxHp - orc.hp, hit);
  assert.ok(hornet.hp < hornet.maxHp, "the burst catches the flier");
  assert.ok(sim.effects.some((fx) => fx.kind === "boom" && !fx.blue));
  assert.equal(orc.burn, undefined, "a plain burst sets nothing alight");
});

test("it never aims at fliers alone", () => {
  const { sim, at } = battle();
  enemy(sim, at.x, at.y - 3, "lanternHornet");
  run(sim, SIGIL.charge[0] + 1);
  assert.equal(sim.sigils.length, 0);
});

test("Kindled sigil sets them burning; Ice-fire burns blue, slows, and ice can't put it out", () => {
  const fire = battle(1);
  const a = enemy(fire.sim, fire.at.x, fire.at.y - 3);
  run(fire.sim, SIGIL.charge[1] + SIGIL.draw + 0.1);
  assert.ok(a.burn && a.burn > 0, "lit");
  assert.equal(a.iceFire, undefined);

  const ice = battle(3);
  const b = enemy(ice.sim, ice.at.x, ice.at.y - 3);
  run(ice.sim, SIGIL.charge[3] + SIGIL.draw + 0.1);
  assert.ok(b.iceFire && b.iceFire > 0, "alight with ice-fire");
  assert.equal(b.burn, undefined, "blue in place of orange");
  assert.ok(ice.sim.effects.some((fx) => fx.kind === "boom" && fx.blue));
  assert.equal(chilled(b), SIGIL.ice.slow);
  const before = b.hp;
  stepIceFire(ice.sim, 1);
  assert.ok(Math.abs(before - b.hp - sigilDamage(ice.sim, 3) * SIGIL.ice.share) < 1e-6, "burns its share a second");
  stepIceFire(ice.sim, SIGIL.ice.seconds);
  assert.equal(b.iceFire, undefined);
  assert.equal(chilled(b), 1);
});

test("Greater circle widens and quickens it", () => {
  assert.ok(SIGIL.radius[2] > SIGIL.radius[1] && SIGIL.charge[2] < SIGIL.charge[1]);
  const { sim, at } = battle(2);
  const far = enemy(sim, at.x, at.y - 3);
  const edge = enemy(sim, at.x + SIGIL.radius[2] - 0.1, at.y - 3);
  run(sim, SIGIL.charge[2] + SIGIL.draw + 0.1);
  assert.ok(far.hp < far.maxHp && edge.hp < edge.maxHp);
});

test("the Sigil tower is the Wizard tower's fourth branch, outside the Dark wizard keep's merge", () => {
  const wizard = ATTUNED.find((a) => a.kind === "wizardTower")!;
  assert.deepEqual(wizard.branches.map((b) => b.via?.kind), ["pyreTower", "frostTower", "stormTower", "sigilTower"]);
  assert.deepEqual(recipe(wizard).map((b) => b.path), ["pyromancy", "rime", "storm"]);
  assert.ok(nextSteps("wizardTower").some((s) => s.type === "become" && s.to === "sigilTower"));
  assert.deepEqual(nextSteps("sigilTower").map((s) => s.type === "path" && s.path), ["sigils"]);
  assert.deepEqual(nextSteps("sigilTower", { path: "sigils", rank: 3 }), [], "no merge from it");
  assert.ok(!buildingTree("sigilTower", { path: "sigils", rank: 3 }).some((n) => n.id === "k:darkKeep"));
  assert.ok(buildingTree("stormTower", { path: "storm", rank: 3 }).some((n) => n.id === "k:darkKeep"));
  assert.ok(averageDps("sigilTower", { levels: LEVELS, bonuses: NO_BONUSES, path: "sigils", rank: 3 }) > averageDps("sigilTower", { levels: LEVELS, bonuses: NO_BONUSES }));
  const d = { kept: [], layout: { structures: [] } } as unknown as Parameters<typeof mergePartners>[0];
  assert.deepEqual(mergePartners(d, "sigilTower", { path: "sigils", rank: 3 }), []);
  assert.equal(mergePartners(d, "stormTower", { path: "storm", rank: 3 }).length, 2, "the keep still takes the other two");
});
