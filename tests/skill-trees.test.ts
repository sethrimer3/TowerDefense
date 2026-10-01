import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { TREES, mapNodes, treeHeight } from "../src/skill-trees.ts";
import { UPGRADES, cost, type UpgradeId } from "../src/config.ts";
test("fresh progression gates Delve, currencies, Courage root, and Legacy", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  g.save.delve.courage = 100;
  g.switchMode("delve");
  assert.equal(g.mode, "tower");
  assert.equal(g.buy("auto"), false);
  assert.equal(g.buy("delve"), false);
  for (const id of ["handOrdering", "combatStance", "largerHand", "cardHeal", "focus", "delve"] as const) assert.ok(g.buy(id));
  assert.equal(g.save.delve.courage, 100);
  g.switchMode("delve");
  assert.equal(g.mode, "delve");
  assert.equal(g.buy("hp"), false);
  assert.ok(g.buy("auto"));
  assert.equal(g.save.delve.courage, 97);
  assert.ok(g.buy("hp"));
  assert.equal(g.buy("quality"), false);
  const restored = new Game(decode(JSON.stringify(g.save)));
  assert.equal(restored.save.upgrades.auto, 1);
  restored.switchMode("delve");
  assert.equal(restored.mode, "delve");
  assert.equal(TREES[1].nodes[0].id, "auto");
  assert.ok(TREES[0].nodes.every(n => UPGRADES.find(u => u.id === n.id)!.currency === "inspiration"));
  assert.deepEqual(TREES.map(tree => tree.id), ["inspiration", "courage", "wayfinding", "legacy", "wisdom", "renown"]);
  assert.ok(TREES.slice(3).every(tree => tree.nodes.length >= 3));
});
test("Greater Heal, then Recovery, Shroud and Find Potion, come after the Archives, whose research they open", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  for (const id of ["handOrdering", "combatStance", "largerHand", "cardHeal", "focus"] as const) assert.ok(g.buy(id));
  assert.equal(g.buy("greaterHeal"), false, "the Archives come first");
  assert.ok(g.buy("archives"));
  assert.equal(g.buy("recovery"), false, "Greater Heal comes first");
  let before = g.save.tower.inspiration;
  assert.ok(g.buy("greaterHeal"));
  assert.equal(before - g.save.tower.inspiration, 3);
  before = g.save.tower.inspiration;
  assert.ok(g.buy("recovery"));
  assert.equal(before - g.save.tower.inspiration, 10);
  assert.equal(g.buy("recovery"), false, "one rank");
  before = g.save.tower.inspiration;
  assert.ok(g.buy("findPotion"));
  assert.equal(before - g.save.tower.inspiration, 10);
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual([at("greaterHeal").x, at("greaterHeal").y, at("greaterHeal").requires], [62, 124, ["archives"]]);
  assert.deepEqual([at("recovery").x, at("recovery").y, at("recovery").requires], [50, 142, ["greaterHeal"]]);
  assert.deepEqual([at("shroud").x, at("shroud").y, at("shroud").requires], [82, 142, ["greaterHeal"]], "Shroud sits beside Recovery");
  assert.deepEqual([at("findPotion").x, at("findPotion").y, at("findPotion").requires], [50, 160, ["recovery"]], "Find Potion sits below Recovery");
});
test("the hand's skills run one after another to Focus, Gear after it, and Larger Hand and Buildout cost 1", () => {
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(["combatStance", "largerHand", "cardHeal", "focus", "cardGear"].map((id) => at(id).requires),
    [["handOrdering"], ["combatStance"], ["largerHand"], ["cardHeal"], ["focus"]]);
  assert.deepEqual(["handOrdering", "combatStance", "largerHand"].map((id) => cost(id as UpgradeId, 0)), [1, 1, 1]);
  const g = new Game(defaults());
  g.save.tower.inspiration = 100;
  assert.ok(g.buy("handOrdering") && g.buy("combatStance"));
  assert.equal(g.buy("cardHeal"), false, "Heal waits for Larger Hand");
  assert.ok(g.buy("largerHand") && g.buy("cardHeal"));
  assert.equal(g.buy("cardGear"), false, "Gear waits for Focus");
  assert.ok(g.buy("focus") && g.buy("cardGear"));
});
test("each skill in a tree of unlocks is bought once", () => {
  const unlockTrees = TREES.filter((t) => t.unlocks);
  assert.deepEqual(unlockTrees.map((t) => t.id), ["inspiration"]);
  for (const tree of unlockTrees)
    for (const n of tree.nodes) assert.equal(UPGRADES.find((u) => u.id === n.id)!.max, 1, n.id);
});

test("a tree taller than its view places its nodes on a taller map", () => {
  const inspiration = TREES[0];
  assert.equal(treeHeight(inspiration), 190);
  assert.ok(inspiration.nodes.every((n) => n.y > 0 && n.y < treeHeight(inspiration)), "every node on the map");
  assert.equal(mapNodes(inspiration).find((n) => n.id === "recovery")!.y, (142 * 100) / 190);
  assert.ok(TREES.slice(1).every((t) => treeHeight(t) === 100 && mapNodes(t).every((n, i) => n.y === t.nodes[i].y)), "other trees fit one view");
});
test("older saves retain earned access without unlocking fresh saves", () => {
  const old: any = defaults();
  delete old.upgrades.delve;
  delete old.upgrades.legacy;
  assert.equal(decode(JSON.stringify(old)).upgrades.delve, 0);
  old.upgrades.quality = 2;
  const saved = decode(JSON.stringify(old));
  assert.equal(saved.upgrades.delve, 1);
  assert.equal(saved.upgrades.legacy, 1);
  assert.equal(saved.upgrades.quality, 2);
});
