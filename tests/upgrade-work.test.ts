import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaults, decode } from "../src/save.ts";
import { startResearch, settleResearch, cancelResearch, researchLeft, researchSeconds } from "../src/research-jobs.ts";
import { startForge, settleForge, cancelForge, addForgeSmith, forgeLeft, forgeSeconds } from "../src/forge-jobs.ts";
import { startTraining, addSmith, cancelTraining, rankCost, rankPrice, trainingStep, busySmiths } from "../src/progression.ts";
import { PATHS, unlearnPath } from "../src/knowledge-paths.ts";
import { SKILLS, skillCost } from "../src/skill-trees.ts";
import { UPGRADES, purchasePrice, upgradePrice } from "../src/defend/catalog.ts";
import { enchantedGift, MAX_SHELVES } from "../src/library/sim.ts";
import { trainingSeconds } from "../src/training-jobs.ts";
import { forgeSeconds } from "../src/forge-jobs.ts";
import { planProgression, sampledRates, type Budget } from "../tools/plan-upgrade-progression.ts";

test("research reserves Knowledge, shares a single project, and only applies the finished rank", () => {
  const s = defaults(); s.knowledge = 100;
  assert.equal(startResearch(s, { kind: "skill", id: "masonry" }, 1000, 0), false);
  assert.ok(startResearch(s, { kind: "skill", id: "masonry" }, 1000, 1));
  assert.equal(s.knowledge, 99);
  assert.equal(s.skills.masonry, 0);
  assert.equal(startResearch(s, { kind: "skill", id: "drillSergeant" }, 1000, 2), false);
  assert.equal(researchLeft(s, 2), researchSeconds(0) * 1000 / 2);
  assert.equal(settleResearch(s, 1000 + researchSeconds(0) * 1000 - 1, 1), false);
  assert.equal(s.skills.masonry, 0);
  assert.ok(settleResearch(s, 1000 + researchSeconds(0) * 1000, 1));
  assert.equal(s.skills.masonry, 1);
  assert.equal(s.knowledge, 99, "completion charges nothing more");
  assert.equal(settleResearch(s, 1e10, 5), false, "one rank, no spill into the next");
});

test("temporary dev unlocks do not discard paid research", () => {
  const s = defaults(); s.knowledge = 100;
  startResearch(s, { kind: "skill", id: "masonry" }, 1000, 1);
  s.settings.devStewardship = true;
  assert.ok(settleResearch(s, 301000, 1));
  assert.equal(s.skills.masonry, 1);
  assert.equal(s.knowledge, 99);
});

test("research responds to staffing changes, pauses without banking work, and survives time away", () => {
  const s = defaults(); s.knowledge = 50;
  startResearch(s, { kind: "skill", id: "drillSergeant" }, 1000, 1);
  settleResearch(s, 101000, 1);
  assert.equal(s.researchJob!.left, 200000);
  settleResearch(s, 201000, 0);
  assert.equal(s.researchJob!.left, 200000);
  assert.equal(researchLeft(s, 0), Infinity);
  const back = decode(JSON.stringify(s));
  assert.deepEqual(back.researchJob, s.researchJob);
  assert.equal(back.researchClock, 201000);
  assert.ok(settleResearch(back, 301000, 2));
  assert.equal(back.skills.drillSergeant, 1);
  const clock = back.researchClock;
  settleResearch(back, clock - 100, 1);
  assert.equal(back.researchClock, clock, "a rolled-back clock cannot credit time twice");
});

test("paid cancellations refund exactly the reserved bill, regardless of dev mode changes", () => {
  const s = defaults(); s.skills.coffee = 3; s.knowledge = skillCost("coffee", 3);
  startResearch(s, { kind: "skill", id: "coffee" }, 10, 1);
  s.settings.devMode = true;
  assert.ok(cancelResearch(s));
  assert.equal(s.knowledge, skillCost("coffee", 3));
  s.knowledge = 0;
  startResearch(s, { kind: "skill", id: "coffee" }, 20, 1);
  s.settings.devMode = false;
  cancelResearch(s);
  assert.equal(s.knowledge, 0, "a free project creates no refund");
});

test("all path ranks and crowns require work; a prepaid path retains its correct unlearning refund", () => {
  const s = defaults(); s.knowledge = 1000000; s.defend.owned.wizardTower = 2;
  let now = 1000;
  const p = PATHS.find(p => p.id === "storm")!;
  for (let rank = 0; rank < p.ranks.length; rank++) {
    assert.ok(startResearch(s, { kind: "path", id: "storm" }, now, 2));
    assert.equal(s.paths.wizardTower?.rank ?? 0, rank);
    now += researchSeconds(rank) * 1000 / 2;
    assert.ok(settleResearch(s, now, 2));
    assert.equal(s.paths.wizardTower!.rank, rank + 1);
  }
  assert.equal(startResearch(s, { kind: "path", id: "rime" }, now, 2), false, "the completed choice seals its alternatives");
  assert.ok(startResearch(s, { kind: "evolution", id: "storm" }, now, 2));
  assert.equal(s.defend.owned.darkKeep, 0);
  now += researchSeconds(3, true) * 1000 / 2;
  assert.ok(settleResearch(s, now, 2));
  assert.equal(s.defend.owned.darkKeep, 2);
  const bill = p.ranks.reduce((n, r) => n + r.cost, 0) + p.evolves!.cost;
  assert.equal(s.knowledge, 1000000 - bill);
  assert.equal(unlearnPath(s, "wizardTower"), bill);
  assert.equal(s.knowledge, 1000000);
  assert.equal(s.defend.owned.wizardTower, 2);
});

test("instant research bypasses workers and timers but still checks and pays the quadratic price", () => {
  const s = defaults(); s.settings.instantResearch = true; s.skills.coffee = 1;
  s.knowledge = skillCost("coffee", 1) - 1;
  assert.equal(startResearch(s, { kind: "skill", id: "coffee" }, 1, 0), false);
  s.knowledge++;
  assert.ok(startResearch(s, { kind: "skill", id: "coffee" }, 1, 0));
  assert.equal(s.skills.coffee, 2); assert.equal(s.knowledge, 0); assert.equal(s.researchJob, null);
  s.settings.devMode = true;
  assert.ok(startResearch(s, { kind: "path", id: "storm" }, 2, 0));
  assert.equal(s.paths.wizardTower!.spent, 0);
});

test("Forge and Training share named smiths; Forge levels apply after work, not when paid", () => {
  const s = defaults(); s.smithy = { copper: 100, silver: 100, gold: 100 };
  assert.ok(startForge(s, { kind: "upgrade", id: "soldierArms" }, "Ada", 1000));
  assert.equal(s.defend.levels.soldierArms, 0); assert.equal(s.smithy.copper, 98);
  assert.equal(startTraining(s, "keepHp", "Ada"), false, "already working at the Forge");
  assert.ok(startTraining(s, "keepHp", "Bram"));
  assert.equal(addForgeSmith(s, "Bram"), false);
  assert.ok(addForgeSmith(s, "Cara"));
  assert.equal(addSmith(s, "keepHp", "Cara"), false);
  assert.deepEqual([...busySmiths(s)].sort(), ["Ada", "Bram", "Cara"]);
  assert.equal(forgeLeft(s), forgeSeconds(0) * 1000 / 2);
  const loaded = decode(JSON.stringify(s));
  assert.deepEqual(loaded.forgeJob, s.forgeJob);
  assert.ok(settleForge(loaded, 1000 + forgeSeconds(0) * 1000 / 2, new Set(["Ada", "Bram", "Cara"])));
  assert.equal(loaded.defend.levels.soldierArms, 1);
  assert.equal(loaded.smithy.copper, 97, "both reserved prices paid once");
  assert.deepEqual([...busySmiths(loaded)], ["Bram"]);
});

test("Forge loss of smiths pauses work; mixed-metal cancellation and free projects refund correctly", () => {
  const s = defaults(); s.smithy = { copper: 100, silver: 100, gold: 100 };
  startForge(s, { kind: "upgrade", id: "darkKeepCompact" }, "Ada", 10);
  settleForge(s, 10000, new Set());
  assert.equal(forgeLeft(s), Infinity);
  s.settings.devMode = true;
  cancelForge(s);
  assert.deepEqual(s.smithy, { copper: 100, silver: 100, gold: 100 });
  startForge(s, { kind: "speed", id: "speed3" }, "Ada", 10001);
  s.settings.devMode = false;
  cancelForge(s);
  assert.deepEqual(s.smithy, { copper: 100, silver: 100, gold: 100 });
  s.settings.instantResearch = true;
  assert.ok(startForge(s, { kind: "speed", id: "speed3" }, "", 10002));
  assert.equal(s.defend.speed3, true); assert.equal(s.forgeJob, null);
});

test("higher Training ranks require their entire quadratic bill and refund it after reload", () => {
  const s = defaults(); s.training.troopHp = 25;
  const bill = rankCost(25);
  s.smithy.gold = bill - 1;
  assert.equal(trainingStep(s, "troopHp").affordable, false);
  assert.equal(startTraining(s, "troopHp", "Ada"), false);
  s.smithy.gold++;
  assert.ok(startTraining(s, "troopHp", "Ada"));
  assert.equal(s.smithy.gold, 0);
  const loaded = decode(JSON.stringify(s)); loaded.settings.devMode = true;
  cancelTraining(loaded, "troopHp");
  assert.equal(loaded.smithy.gold, bill);
  loaded.smithy.gold = 0;
  startTraining(loaded, "troopHp", "Ada");
  loaded.settings.devMode = false;
  cancelTraining(loaded, "troopHp");
  assert.equal(loaded.smithy.gold, 0);
});

test("quadratic prices grow steadily, repeat copies avoid exponential overflow, and books follow base income", () => {
  for (let r = 1; r < 49; r++) assert.equal(rankCost(r + 1) - 2 * rankCost(r) + rankCost(r - 1), 10);
  for (const skill of Object.values(SKILLS)) for (let r = 1; r < skill.max; r++) assert.ok(skillCost(skill.id, r) > skillCost(skill.id, r - 1));
  for (const u of UPGRADES) for (let r = 1; r < u.maxLevel; r++) assert.ok((u.price ?? upgradePrice)(r).copper! > (u.price ?? upgradePrice)(r - 1).copper!);
  assert.ok(Number.isSafeInteger(purchasePrice("archerTower", 10000).copper));
  assert.equal(enchantedGift(1100), 1100 / 60);
  assert.equal(enchantedGift(12), 1);
});

test("funded production growth places focused final targets around two years", () => {
  const { samples } = JSON.parse(readFileSync(new URL("../docs/upgrade-production.json", import.meta.url), "utf8"));
  const late = samples.filter((s: any) => s.profile.id === "late");
  const boost = late.reduce((n: number, s: any) => n + s.library.perHour / s.library.nominalPerHour, 0) / late.length;
  const plan = planProgression(sampledRates(samples), MAX_SHELVES, boost);
  assert.ok(plan.stages.every((s, i, stages) => s.hours > (stages[i - 1]?.hours ?? 0)));
  assert.ok(plan.stages[2].rates.gold > plan.stages[0].rates.gold);
  const bill = (): Budget => ({ copper: 0, silver: 0, gold: 0, knowledge: 0 });
  const training = bill(); let work = 0;
  for (let r = 0; r < 50; r++) { training[rankPrice(r)] += rankCost(r); work += trainingSeconds(r); }
  const rowDays = plan.focused(training, work / 3600 / 6 / 1.45) / 24;
  const conduit = UPGRADES.find(u => u.id === "chainCount")!, forge = bill(); work = 0;
  for (let r = 0; r < conduit.maxLevel; r++) {
    for (const [metal, amount] of Object.entries((conduit.price ?? upgradePrice)(r))) forge[metal as keyof Budget] += amount!;
    work += forgeSeconds(r);
  }
  const storm = PATHS.find(p => p.id === "storm")!;
  forge.knowledge = storm.ranks.reduce((n, r) => n + r.cost, 0) + storm.evolves!.cost;
  const conduitDays = plan.focused(forge, work / 3600 / 6 / 1.45 + (researchSeconds(3, true) + [0, 1, 2].reduce((n, r) => n + researchSeconds(r), 0)) / 3600 / 2) / 24;
  for (const days of [rowDays, conduitDays, plan.enchantedHours / 24]) assert.ok(days >= 650 && days <= 850, `focused finish ${days} days`);
});

test("malformed or already-completed projects cannot restore work or duplicate grants", () => {
  const s = defaults(); s.knowledge = 100;
  startResearch(s, { kind: "skill", id: "masonry" }, 1000, 1);
  const raw = JSON.parse(JSON.stringify(s));
  raw.researchJob.id = "nope";
  assert.equal(decode(JSON.stringify(raw)).researchJob, null);
  raw.researchJob = { ...s.researchJob, left: Infinity };
  assert.equal(decode(JSON.stringify(raw)).researchJob, null);
  raw.researchJob = s.researchJob; raw.skills.masonry = 1;
  assert.equal(decode(JSON.stringify(raw)).researchJob, null);
});
