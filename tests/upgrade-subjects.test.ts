import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTE_ITEMS, UPGRADES } from "../src/defend/catalog.ts";
import { TRAINING_IDS } from "../src/progression.ts";
import { SKILL_IDS, TREES } from "../src/skill-trees.ts";
import { SUBJECTS, topicItems } from "../src/upgrade-subjects.ts";
import { defaults } from "../src/save.ts";
import { bannerTree } from "../src/ui/banner-tree.ts";
import { bombTree } from "../src/ui/bomb-tree.ts";
import { decode } from "../src/save.ts";
import { studyCircle } from "../src/magic-circle/progression.ts";
import { buySkill, skillPurchase } from "../src/progression.ts";

const topics = SUBJECTS.flatMap((s) => s.topics);

/** Every id listed by `pick` across all topics, with how often. */
function counts(pick: (t: (typeof topics)[number]) => readonly string[] | undefined) {
  const n = new Map<string, number>();
  for (const t of topics) for (const id of pick(t) ?? []) n.set(id, (n.get(id) ?? 0) + 1);
  return n;
}
const once = (all: readonly string[], n: Map<string, number>, what: string) => {
  for (const id of all) assert.equal(n.get(id), 1, `${what} ${id} is listed ${n.get(id) ?? 0} times`);
  for (const id of n.keys()) assert.ok(all.includes(id), `${what} ${id} doesn't exist`);
};

test("every upgrade in the game sits in exactly one topic", () => {
  once(UPGRADES.map((u) => u.id), counts((t) => t.upgrades), "Armory upgrade");
  once(TRAINING_IDS, counts((t) => t.training), "Smithy row");
  once(SKILL_IDS, counts((t) => t.skills), "skill");
  once(PALETTE_ITEMS, counts(topicItems), "palette item");
});

test("topic ids are unique within their subject, and subjects are unique", () => {
  assert.equal(new Set(SUBJECTS.map((s) => s.id)).size, SUBJECTS.length);
  for (const s of SUBJECTS) assert.equal(new Set(s.topics.map((t) => t.id)).size, s.topics.length, s.id);
});

test("a skill's requirements are shown in the same subject", () => {
  const subjectOf = new Map(SUBJECTS.flatMap((s) => s.topics.flatMap((t) => (t.skills ?? []).map((id) => [id, s.id] as const))));
  for (const node of TREES.flatMap((t) => t.nodes))
    for (const r of node.requires) assert.equal(subjectOf.get(r), subjectOf.get(node.id), `${node.id} needs ${r}`);
});

test("War banner and Bombs have standalone Knowledge trees under Spells", () => {
  const realm = SUBJECTS.find(s => s.id === "realm")!, spells = SUBJECTS.find(s => s.id === "spells")!;
  assert.equal(realm.topics.some(t => t.id === "warBanner"), false);
  assert.ok(spells.topics.some(t => t.id === "warBanner" && t.icon === "banner"));
  assert.equal(realm.topics.some(t => t.name === "Battle"), false);
  assert.equal(realm.topics.some(t => t.id === "battle"), false);
  const bombs = spells.topics.find(t => t.id === "battle")!;
  assert.equal(bombs.name, "Bombs");
  assert.deepEqual(bombs.skills, ["gunpowder"]);
  assert.deepEqual(bombs.upgrades, ["bombSafe"]);
  assert.deepEqual(bombs.training, ["bombDamage"]);
  assert.ok(realm.topics.find(t => t.id === "troops")!.extras?.includes("speed3"));
  const save = defaults(); save.knowledge = 100000;
  assert.equal(skillPurchase(save, "warBanner").available, true, "no unrelated tower prerequisite");
  let graph = bannerTree(save);
  assert.equal(graph.length, 8);
  assert.deepEqual(graph.filter(n => !n.parent).map(n => n.id), ["warBanner"]);
  assert.equal(graph.find(n => n.id === "warBanner")!.state, "next");
  assert.equal(graph.find(n => n.id === "bannerDefense")!.state, "locked");
  assert.ok(buySkill(save, "warBanner"));
  for (let i = 0; i < 3; i++) assert.ok(buySkill(save, "bannerCooldown"));
  assert.ok(buySkill(save, "bannerDefense")); assert.ok(buySkill(save, "bannerReach"));
  graph = bannerTree(save);
  assert.deepEqual(graph.filter(n => n.parent === "bannerReach").map(n => n.id), ["bannerDamage", "bannerMarch", "bannerLife"]);
  for (const id of ["bannerDamage", "bannerMarch", "bannerLife"]) assert.equal(graph.find(n => n.id === id)!.state, "next");
  assert.equal(graph.find(n => n.id === "bannerRegen")!.parent, "bannerLife");
  assert.equal(graph.find(n => n.id === "bannerRegen")!.state, "locked");
  save.settings.devCommand = true;
  assert.ok(bannerTree(save).every(n => n.state === "owned"), "developer research matches the displayed ranks");
});

test("Bomb Knowledge nodes preserve Gunpowder ranks, gate them in order and leave tower research independent", () => {
  const save = defaults(); save.knowledge = 100000;
  assert.equal(skillPurchase(save, "gunpowder").available, true);
  assert.deepEqual(bombTree(save).map(n => [n.id, n.parent, n.state]), [
    ["bomb", undefined, "owned"], ["gunpowder:0", "bomb", "next"],
    ["gunpowder:1", "gunpowder:0", "locked"], ["gunpowder:2", "gunpowder:1", "locked"],
  ]);
  assert.ok(buySkill(save, "gunpowder"));
  const restored = decode(JSON.stringify(save));
  assert.deepEqual(bombTree(restored).map(n => n.state), ["owned", "owned", "next", "locked"]);
  assert.ok(buySkill(restored, "gunpowder")); assert.ok(buySkill(restored, "gunpowder"));
  assert.ok(bombTree(restored).every(n => n.state === "owned"));
  assert.equal(buySkill(restored, "gunpowder"), false);
  save.skills.fletchers = 1; save.skills.gunpowder = 0;
  assert.equal(skillPurchase(save, "ballistics").available, true, "towers do not need bomb research");
  save.settings.devCommand = true;
  assert.ok(bombTree(save).every(n => n.state === "owned"));
  const topic = SUBJECTS.flatMap(s => s.topics).find(t => t.id === "battle")!;
  assert.equal(studyCircle(restored, topic).motif, "triangles");
});
