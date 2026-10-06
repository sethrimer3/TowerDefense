import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTE_ITEMS, UPGRADES } from "../src/defend/catalog.ts";
import { TRAINING_IDS } from "../src/progression.ts";
import { SKILL_IDS, TREES } from "../src/skill-trees.ts";
import { SUBJECTS, topicItems } from "../src/upgrade-subjects.ts";

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
