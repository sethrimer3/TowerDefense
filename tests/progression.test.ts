// The Smithy's upgrades (Training in code), the skill trees and a defense's
// rewards (src/progression.ts),
// and how they reach the battle (DefendSim's bonuses).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";
import {
  STARTING_METAL, TRAINING, addSmith, bonuses, busySmiths, buySkill, cancelTraining, multiplier, payKills, payWave, rankPrice, removeSmith, settleTraining, skillPurchase,
  skillRank, skillTotal, startTraining, trainingLeft, trainingRank, trainingStep,
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

test("a Smithy upgrade costs a Smithy point (copper, then silver, then gold), is worked by a smith and counts when done", () => {
  assert.deepEqual([rankPrice(0), rankPrice(9), rankPrice(10), rankPrice(24), rankPrice(25)], ["copper", "copper", "silver", "silver", "gold"]);
  const s = defaults();
  s.smithy.copper = 0;
  s.trainingClock = 1000;
  assert.equal(startTraining(s, "troopDamage", "Ada Stone"), false, "no points");
  s.smithy.copper = 2;
  assert.ok(startTraining(s, "troopDamage", "Ada Stone"));
  assert.equal(s.smithy.copper, 1, "its point is spent at once");
  assert.equal(startTraining(s, "troopDamage", "Bram Hale"), false, "one rank per row at a time");
  assert.equal(startTraining(s, "wallHp", "Ada Stone"), false, "a smith works one upgrade at a time");
  assert.deepEqual([...busySmiths(s)], ["Ada Stone"]);
  const takes = trainingSeconds(0) * 1000;
  assert.equal(trainingLeft(s, "troopDamage"), takes);
  assert.equal(settleTraining(s, 1000 + takes - 1), 0);
  assert.equal(bonuses(s).troopDamage, 1, "not before it completes");
  assert.equal(settleTraining(s, 1000 + takes), 1);
  assert.equal(s.training.troopDamage, 1);
  assert.equal(bonuses(s).troopDamage, 1.04);
  assert.equal(busySmiths(s).size, 0, "the smith is free again");
});

test("more smiths on an upgrade share its time; the last one off cancels it and returns its point", () => {
  const s = defaults();
  s.trainingClock = 1;
  s.smithy.copper = 1;
  assert.ok(startTraining(s, "keepHp", "Ada Stone"));
  const takes = trainingSeconds(0) * 1000;
  assert.ok(addSmith(s, "keepHp", "Bram Hale"));
  assert.equal(addSmith(s, "keepHp", "Bram Hale"), false, "already on it");
  assert.equal(trainingLeft(s, "keepHp"), takes / 2);
  settleTraining(s, 1 + takes / 4);
  assert.equal(trainingLeft(s, "keepHp"), takes / 4);
  assert.ok(removeSmith(s, "keepHp"));
  assert.equal(trainingLeft(s, "keepHp"), takes / 2, "one smith left: slower again");
  assert.equal(removeSmith(s, "keepHp"), false, "the last smith only comes off by cancelling");
  assert.ok(cancelTraining(s, "keepHp"));
  assert.equal(s.smithy.copper, 1, "its point back");
  assert.equal(s.trainingJobs.length, 0);
});

test("an upgrade whose smiths have left the smithy waits for another; the Smiths' guild speeds them all", () => {
  const s = defaults();
  s.trainingClock = 1;
  s.smithy.copper = 2;
  startTraining(s, "drill", "Ada Stone");
  settleTraining(s, 1000, new Set(["Someone Else"]));
  assert.deepEqual(s.trainingJobs[0].smiths, [], "Ada is no longer a smith");
  assert.equal(trainingLeft(s, "drill"), Infinity);
  assert.equal(settleTraining(s, 10 ** 9, new Set()), 0, "no work without a smith");
  assert.ok(addSmith(s, "drill", "Someone Else"));
  s.skills.scholars = 2;
  assert.ok(Math.abs(trainingLeft(s, "drill") - trainingSeconds(0) * 1000 / 1.3) < 1e-6);
  s.skills.tactician = 1;
  assert.equal(skillTotal(s, "smiths"), 1, "Master smith makes room for one more");
});

test("times shorten: a percent on drill, reload or rebuild divides", () => {
  const s = defaults();
  s.training.drill = 10;
  s.skills.drillSergeant = 2;
  assert.equal(multiplier(s, "drill"), 1 / 1.5);
});

test("skills need Knowledge and their requirements, and each rank costs more", () => {
  const s = defaults();
  assert.equal(buySkill(s, "drillSergeant"), false, "no Knowledge");
  s.knowledge = 100;
  assert.equal(buySkill(s, "veterans"), false, "needs Drill sergeant");
  assert.ok(buySkill(s, "drillSergeant"));
  assert.equal(s.knowledge, 100 - skillCost("drillSergeant", 0));
  assert.ok(buySkill(s, "veterans"));
  assert.ok(buySkill(s, "veterans"));
  assert.equal(bonuses(s).troopHp, 1.2);
  for (let i = 0; i < 5; i++) buySkill(s, "drillSergeant");
  assert.equal(s.skills.drillSergeant, SKILLS.drillSergeant.max);
  assert.equal(skillPurchase(s, "drillSergeant").maxed, true);
});

test("dev options: unlimited money spends nothing, instant research needs no smith, all research counts every rank while on", () => {
  const s = defaults();
  s.smithy.copper = 0;
  s.settings.instantResearch = true;
  assert.equal(startTraining(s, "troopHp", ""), false, "instant research still costs its point");
  s.smithy.copper = 1;
  assert.ok(startTraining(s, "troopHp", ""), "no smith needed");
  assert.equal(s.training.troopHp, 1, "done at once");
  assert.equal(s.smithy.copper, 0);
  s.settings.devMode = true;
  assert.ok(startTraining(s, "troopHp", ""));
  assert.equal(s.smithy.copper, 0, "unlimited money spends no point");
  assert.ok(buySkill(s, "masonry"));
  assert.equal(s.knowledge, 0, "nor Knowledge");

  const d = defaults();
  d.skills.coffee = 2;
  d.settings.devMine = true;
  assert.equal(skillRank(d, "coffee"), SKILLS.coffee.max);
  assert.equal(skillRank(d, "fireproofWood"), 0, "only the Mine tree");
  assert.equal(skillPurchase(d, "coffee").maxed, true);
  d.settings.devSmithy = true;
  assert.equal(trainingRank(d, "gold"), TRAINING.find((t) => t.id === "gold")!.max);
  assert.equal(trainingStep(d, "gold").maxed, true);
  assert.ok(multiplier(d, "gold") > 1);
  d.settings.devCommand = true;
  assert.equal(skillPurchase(d, "warBanner").maxed, true, "the deepest node counts too");
  d.settings.devMine = d.settings.devSmithy = d.settings.devCommand = false;
  assert.equal(skillRank(d, "coffee"), 2, "the ranks bought count again once off");
  assert.equal(multiplier(d, "gold"), 1);
});

test("every tree node is a skill, each listed once, its requirements in the same tree", () => {
  const ids = TREES.flatMap((t) => t.nodes.map((n) => n.id));
  assert.deepEqual([...ids].sort(), (Object.keys(SKILLS) as SkillId[]).sort());
  for (const t of TREES) for (const n of t.nodes) for (const r of n.requires) assert.ok(t.nodes.some((m) => m.id === r), `${n.id} needs ${r}`);
});

test("kills pay Gold; waves pay Gold, copper only with Copperworks, and Knowledge and an upgrade point past the best", () => {
  const s = defaults();
  payKills(s, { roach: 3, orc: 1 });
  assert.equal(s.gold, 3 * 2 + 5);
  s.defend.bestWave = 4;
  const held = payWave(s, 4);
  assert.deepEqual({ copper: held.copper, knowledge: held.knowledge, upgrade: held.upgrade }, { copper: 0, knowledge: 0, upgrade: 0 });
  const boss = payWave(s, 10);
  assert.deepEqual({ copper: boss.copper, knowledge: boss.knowledge, upgrade: boss.upgrade }, { copper: 0, knowledge: 3, upgrade: 1 });
  assert.equal(s.upgradePoints, 1);
  assert.deepEqual(s.smithy, STARTING_METAL, "battle pays no metal");
  s.skills.plunder = 2;
  s.skills.ironworks = 1;
  const rich = payWave(s, 5);
  assert.equal(rich.gold, (10 + 25) * 1.2);
  assert.equal(rich.copper, 1);
  assert.equal(s.smithy.copper, STARTING_METAL.copper + 1, "Copperworks pays the mine's copper");
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
  s.knowledge = 3;
  s.skills.masonry = 2;
  s.training.gold = 4;
  s.smithy = { copper: 3, silver: 1, gold: 0 };
  s.upgradePoints = 7;
  s.trainingJobs = [{ id: "keepHp", left: 5000, smiths: ["Ada Stone", "Bram Hale"] }];
  s.trainingClock = 123;
  const back = decode(JSON.stringify(s));
  assert.deepEqual(back, s);
  const job = { id: "keepHp", left: 5, smiths: ["Ada Stone"] };
  const bad = decode(JSON.stringify({ ...s, gold: "lots", skills: { masonry: 99 }, training: { gold: -2 }, trainingJobs: [{ id: "nope" }, job, job, { id: "wallHp", left: 5, smiths: ["Ada Stone", 7] }] }));
  assert.equal(bad.gold, 0);
  assert.equal(bad.skills.masonry, SKILLS.masonry.max);
  assert.equal(bad.training.gold, 0);
  assert.deepEqual(bad.trainingJobs, [job, { id: "wallHp", left: 5, smiths: [] }], "one per row, each smith on one");
  // A save from before copper and silver, the Smithy and upgrade points:
  // its battle coins become the mine's metal.
  const old = decode(JSON.stringify({ version: 1, ironBar: 9, steelBar: 2, xp: 500, freeTraining: 1, training: { keepHp: 2 }, trainingJobs: [{ id: "keepHp", startedAt: 1, completesAt: 2 }], defend: { bestWave: 12 } }));
  assert.deepEqual(old.smithy, { copper: 9, silver: 2, gold: 0 });
  assert.equal(old.training.keepHp, 3, "a rank in training is counted done");
  assert.equal(old.trainingJobs.length, 0);
  assert.equal(old.upgradePoints, old.defend.bestWave, "an upgrade point for each wave of the best");
  // A save from when a point was a hundred bars: each is worth ten now, and
  // copper and silver coins join them.
  const v1 = decode(JSON.stringify({ version: 1, copper: 5, silver: 1, smithy: { copper: 2, silver: 1, gold: 1 } }));
  assert.deepEqual(v1.smithy, { copper: 25, silver: 11, gold: 10 });
  const fresh = decode("not json");
  assert.deepEqual({ ...fresh, defend: null }, { ...defaults(), defend: null }, "unreadable JSON starts afresh");
  assert.equal(decode(JSON.stringify({ version: 99, gold: 5 })).gold, 0, "a newer save starts afresh");
  assert.ok(TRAINING.every((t) => back.training[t.id] !== undefined));
});
