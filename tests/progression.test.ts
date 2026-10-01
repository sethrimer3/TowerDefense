// Training, the skill trees and a defense's rewards (src/progression.ts),
// and how they reach the battle (DefendSim's bonuses).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";
import {
  TRAINING, bonuses, buySkill, cancelTraining, levelForXp, multiplier, payKills, payWave, settleTraining, skillPurchase,
  startTraining, trainingPoints, trainingSlots, xpForLevel,
} from "../src/progression.ts";
import { SKILLS, TREES, skillCost, type SkillId } from "../src/skill-trees.ts";
import { trainingSeconds } from "../src/training-jobs.ts";
import { NO_BONUSES } from "../src/defend/catalog.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim } from "../src/defend/sim.ts";
import { UPGRADES } from "../src/defend/catalog.ts";

test("a new save fights with no bonuses", () => {
  assert.deepEqual(bonuses(defaults()), NO_BONUSES);
});

test("levels come from lifetime experience, one training point each", () => {
  assert.equal(levelForXp(0), 0);
  assert.equal(levelForXp(xpForLevel(1) - 1), 0);
  assert.equal(levelForXp(xpForLevel(1)), 1);
  assert.equal(levelForXp(xpForLevel(7)), 7);
  const s = defaults();
  s.xp = xpForLevel(3);
  assert.deepEqual(trainingPoints(s), { earned: 3, spent: 0, left: 3 });
});

test("a rank of Training takes time, spends its point at once and counts when done", () => {
  const s = defaults();
  s.xp = xpForLevel(2);
  assert.ok(startTraining(s, "troopDamage", 1000));
  assert.equal(trainingPoints(s).left, 1);
  assert.equal(s.trainingJobs[0].completesAt, 1000 + trainingSeconds(0) * 1000);
  assert.equal(startTraining(s, "troopDamage", 1000), false, "one job per row");
  assert.equal(settleTraining(s, 1000 + trainingSeconds(0) * 1000 - 1), 0);
  assert.equal(bonuses(s).troopDamage, 1, "not before it completes");
  assert.equal(settleTraining(s, 1000 + trainingSeconds(0) * 1000), 1);
  assert.equal(s.training.troopDamage, 1);
  assert.equal(bonuses(s).troopDamage, 1.04);
  // Cancelling gives the point back.
  assert.ok(startTraining(s, "wallHp", 0));
  assert.equal(trainingPoints(s).left, 0);
  assert.ok(cancelTraining(s, "wallHp"));
  assert.equal(trainingPoints(s).left, 1);
});

test("Training slots fill up, and Tactician adds one", () => {
  const s = defaults();
  s.xp = xpForLevel(10);
  assert.ok(startTraining(s, "troopHp", 0));
  assert.ok(startTraining(s, "troopDamage", 0));
  assert.equal(startTraining(s, "drill", 0), false);
  s.skills.tactician = 1;
  assert.equal(trainingSlots(s), 3);
  assert.ok(startTraining(s, "drill", 0));
});

test("times shorten: a percent on drill, reload or rebuild divides", () => {
  const s = defaults();
  s.training.drill = 10;
  s.skills.drillSergeant = 2;
  assert.equal(multiplier(s, "drill"), 1 / 1.5);
});

test("skills need Valor and their requirements, and each rank costs more", () => {
  const s = defaults();
  assert.equal(buySkill(s, "drillSergeant"), false, "no Valor");
  s.valor = 100;
  assert.equal(buySkill(s, "veterans"), false, "needs Drill sergeant");
  assert.ok(buySkill(s, "drillSergeant"));
  assert.equal(s.valor, 100 - skillCost("drillSergeant", 0));
  assert.ok(buySkill(s, "veterans"));
  assert.ok(buySkill(s, "veterans"));
  assert.equal(bonuses(s).troopHp, 1.2);
  for (let i = 0; i < 5; i++) buySkill(s, "drillSergeant");
  assert.equal(s.skills.drillSergeant, SKILLS.drillSergeant.max);
  assert.equal(skillPurchase(s, "drillSergeant").maxed, true);
});

test("every tree node is a skill, each listed once, its requirements in the same tree", () => {
  const ids = TREES.flatMap((t) => t.nodes.map((n) => n.id));
  assert.deepEqual([...ids].sort(), (Object.keys(SKILLS) as SkillId[]).sort());
  for (const t of TREES) for (const n of t.nodes) for (const r of n.requires) assert.ok(t.nodes.some((m) => m.id === r), `${n.id} needs ${r}`);
});

test("kills pay Gold and experience; waves pay Gold, iron, steel on boss waves, and Valor past the best", () => {
  const s = defaults();
  payKills(s, { roach: 3, orc: 1 });
  assert.equal(s.gold, 3 * 2 + 5);
  assert.equal(s.xp, 3 * 1 + 3);
  s.defend.bestWave = 4;
  const held = payWave(s, 4);
  assert.deepEqual({ iron: held.ironBar, steel: held.steelBar, valor: held.valor }, { iron: 1, steel: 0, valor: 0 });
  const boss = payWave(s, 10);
  assert.deepEqual({ iron: boss.ironBar, steel: boss.steelBar, valor: boss.valor }, { iron: 1, steel: 1, valor: 3 });
  s.skills.plunder = 2;
  s.skills.ironworks = 1;
  const rich = payWave(s, 5);
  assert.equal(rich.gold, (10 + 25) * 1.2);
  assert.equal(rich.ironBar, 2);
});

test("bonuses reach the battle: troops, walls and the keep", () => {
  const fit = fitLayout(defaultLayout());
  assert.ok(fit.ok);
  const map = generateCity(fit, 3);
  const levels = Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as never;
  const plain = new DefendSim(map, levels, 1);
  const s = defaults();
  s.training.keepHp = 4;
  s.training.wallHp = 2;
  const strong = new DefendSim(map, levels, 1, bonuses(s));
  assert.equal(strong.keepMaxHp(), plain.keepMaxHp() * 1.2);
  const wall = map.buildings.find((b) => b.kind === "wall")!;
  assert.ok(Math.abs(strong.maxHp[wall.id] - plain.maxHp[wall.id] * 1.1) < 1e-3);
});

test("saves keep what is well formed and default the rest", () => {
  const s = defaults();
  s.gold = 12.5;
  s.valor = 3;
  s.skills.masonry = 2;
  s.training.gold = 4;
  s.trainingJobs = [{ id: "keepHp", startedAt: 1, completesAt: 2 }];
  const back = decode(JSON.stringify(s));
  assert.deepEqual(back, s);
  const bad = decode(JSON.stringify({ ...s, gold: "lots", skills: { masonry: 99 }, training: { gold: -2 }, trainingJobs: [{ id: "nope" }, { id: "keepHp", startedAt: 1, completesAt: 2 }, { id: "keepHp", startedAt: 1, completesAt: 2 }] }));
  assert.equal(bad.gold, 0);
  assert.equal(bad.skills.masonry, SKILLS.masonry.max);
  assert.equal(bad.training.gold, 0);
  assert.equal(bad.trainingJobs.length, 1);
  const fresh = decode("not json");
  assert.deepEqual({ ...fresh, defend: null }, { ...defaults(), defend: null }, "unreadable JSON starts afresh");
  assert.equal(decode(JSON.stringify({ version: 99, gold: 5 })).gold, 0, "a newer save starts afresh");
  assert.ok(TRAINING.every((t) => back.training[t.id] !== undefined));
});
