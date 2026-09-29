import { test } from "node:test";
import assert from "node:assert/strict";
import { loadout, trainingPoints, trainingStep, upgradeText, provisionText } from "../src/loadout.ts";
import { defaults } from "../src/save.ts";
import { GOLD_SHOP, UPGRADES, levelForXp, xpForLevel } from "../src/config.ts";
import type { CraftedEquipment } from "../src/equipment.ts";
import { Game } from "../src/state.ts";

test("a new character starts at 12 ATK, 5 DEF, 100 HP, no keys and one undo", () => {
  assert.deepEqual(loadout(defaults()), {
    attack: 12, defense: 5, maxHp: 100, keys: { yellow: 0, blue: 0, red: 0 }, undoCapacity: 1,
  });
});

test("each rank of an upgrade adds its grant", () => {
  const s = defaults();
  Object.assign(s.upgrades, {
    hp: 2, inspirationHp: 3, attack: 2, inspirationAttack: 3, defense: 2, inspirationDefense: 3, quality: 1,
    yellow: 1, blue: 2, red: 3, undos: 2, inspirationUndos: 1,
  });
  assert.deepEqual(loadout(s), {
    attack: 12 + 2 * 2 + 3 + 2,
    defense: 5 + 2 + 3 + 1,
    maxHp: 100 + 2 * 20 + 3 * 15,
    keys: { yellow: 1, blue: 2, red: 3 },
    undoCapacity: 1 + 2 + 1,
  });
});

test("each level earns three training points and nothing else", () => {
  const s = defaults();
  s.xp = xpForLevel(15);
  assert.equal(levelForXp(s.xp), 15);
  assert.equal(levelForXp(s.xp - 1), 14);
  assert.deepEqual(trainingPoints(s), { earned: 45, spent: 0, left: 45 });
  assert.deepEqual(loadout(s), loadout(defaults()));
});

test("training ranks add 10 HP for a point, 1 DEF for three and 1 ATK for five", () => {
  const s = defaults();
  s.xp = xpForLevel(5);
  Object.assign(s.training, { hp: 3, defense: 2, attack: 1 });
  const l = loadout(s);
  assert.deepEqual([l.attack, l.defense, l.maxHp], [12 + 1, 5 + 2, 100 + 30]);
  assert.deepEqual(trainingPoints(s), { earned: 15, spent: 3 + 6 + 5, left: 1 });
  assert.deepEqual(
    [trainingStep(s, "hp"), trainingStep(s, "defense")].map(({ now, next, affordable }) => [now, next, affordable]),
    [[130, 140, true], [7, 8, false]],
  );
});

test("training spends points and reaches a run still outside", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  assert.equal(g.train("hp"), false);
  g.save.xp = xpForLevel(1);
  assert.equal(g.train("attack"), false);
  assert.equal(g.train("hp"), true);
  assert.deepEqual([g.run.player.maxHp, g.run.player.hp, trainingPoints(g.save).left], [110, 110, 2]);
});

test("gear adds flat bonuses, then its percentages of the total, rounded; provisions come last", () => {
  const s = defaults();
  const ring: CraftedEquipment = {
    id: "r", slot: "ring", name: "Ring", metal: "iron",
    flatAttack: 3, flatDefense: 0, flatMaxHp: 10, percentAttack: 0.1, percentDefense: 0.25, percentMaxHp: 0.05,
    baseRecipe: [], enhancements: [], createdAt: 0,
  };
  s.equipmentInventory.push(ring);
  s.equipped.ring = "r";
  Object.assign(s.provisions, { edge: 1, guard: 2, heal: 1 });
  const l = loadout(s);
  assert.equal(l.attack, Math.round((12 + 3) * 1.1) + 3);
  assert.equal(l.defense, Math.round(5 * 1.25) + 6);
  assert.equal(l.maxHp, Math.round(110 * 1.05) + 20);
});

test("descriptions are written from the grants", () => {
  const text = Object.fromEntries(UPGRADES.map((u) => [u.id, upgradeText(u.id)]));
  assert.deepEqual(
    { hp: text.hp, attack: text.attack, defense: text.defense, yellow: text.yellow, blue: text.blue, red: text.red,
      quality: text.quality, undos: text.undos, inspirationHp: text.inspirationHp, inspirationAttack: text.inspirationAttack,
      inspirationDefense: text.inspirationDefense, inspirationUndos: text.inspirationUndos, revive: text.revive },
    {
      hp: "+20 starting maximum HP",
      attack: "+2 starting attack",
      defense: "+1 starting defense",
      yellow: "+1 starting amber key",
      blue: "+1 starting azure key",
      red: "+1 starting crimson key",
      quality: "+2 weapon attack and +1 armor defense",
      undos: "Store one additional undo (up to 9)",
      inspirationHp: "+15 starting maximum HP",
      inspirationAttack: "+1 starting attack",
      inspirationDefense: "+1 starting defense",
      inspirationUndos: "Store one additional undo (up to 9)",
      revive: "Undo a fatal move before moving in the new run",
    },
  );
  assert.deepEqual(GOLD_SHOP.map((g) => provisionText(g.id)), [
    "+20 max HP next run", "+3 attack next run", "+3 defense next run",
  ]);
});

const ring = (flatAttack: number, flatMaxHp: number): CraftedEquipment => ({
  id: "r", slot: "ring", name: "Ring", metal: "iron",
  flatAttack, flatDefense: 0, flatMaxHp, percentAttack: 0, percentDefense: 0, percentMaxHp: 0,
  baseRecipe: [], enhancements: [], createdAt: 0,
});

test("changing gear mid-run keeps the ATK gathered and the provisions the run started with", () => {
  const g = new Game(defaults()), s = g.save;
  s.provisions.edge = 1;
  g.newRun();
  assert.equal(g.run.player.attack, 15);
  g.run.player.attack += 2; // an attack shard picked up
  s.equipmentInventory.push(ring(3, 10));
  assert.ok(g.equipItem("r"));
  assert.equal(g.run.player.attack, 20);
  assert.equal(g.run.player.maxHp, 110);
  assert.deepEqual(g.run.loadout, { attack: 18, defense: 5, maxHp: 110 });
  g.unequipSlot("ring");
  assert.equal(g.run.player.attack, 17);
  assert.deepEqual(g.run.loadout, { attack: 15, defense: 5, maxHp: 100 });
  assert.equal(g.run.player.hp, 100);
});

test("a gear change reaches a run still outside, which starts at its new full HP", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.equipmentInventory.push(ring(3, 10));
  g.equipItem("r");
  assert.deepEqual([g.run.player.attack, g.run.player.maxHp, g.run.player.hp], [15, 110, 110]);
});
