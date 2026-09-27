import { test } from "node:test";
import assert from "node:assert/strict";
import { loadout, upgradeText, provisionText } from "../src/loadout.ts";
import { defaults } from "../src/save.ts";
import { GOLD_SHOP, UPGRADES } from "../src/config.ts";
import type { CraftedEquipment } from "../src/equipment.ts";

test("a new character starts at 12 ATK, 5 DEF, 120 HP, no keys and one undo", () => {
  assert.deepEqual(loadout(defaults()), {
    attack: 12, defense: 5, maxHp: 120, keys: { yellow: 0, blue: 0, red: 0 }, undoCapacity: 1,
  });
});

test("each rank of an upgrade adds its grant", () => {
  const s = defaults();
  Object.assign(s.upgrades, {
    hp: 2, shardHp: 3, attack: 2, shardAttack: 3, defense: 2, shardDefense: 3, quality: 1,
    yellow: 1, blue: 2, red: 3, undos: 2, shardUndos: 1,
  });
  assert.deepEqual(loadout(s), {
    attack: 12 + 2 * 2 + 3 + 2,
    defense: 5 + 2 + 3 + 1,
    maxHp: 120 + 2 * 20 + 3 * 15,
    keys: { yellow: 1, blue: 2, red: 3 },
    undoCapacity: 1 + 2 + 1,
  });
});

test("levels add HP every level, ATK every third and DEF every fifth", () => {
  const s = defaults();
  s.xp = 5 * ((2 * 15 + 1) ** 2 - 1); // level 15
  const l = loadout(s);
  assert.deepEqual([l.attack, l.defense, l.maxHp], [12 + 5, 5 + 3, 120 + 30]);
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
  assert.equal(l.maxHp, Math.round(130 * 1.05) + 20);
});

test("descriptions are written from the grants", () => {
  const text = Object.fromEntries(UPGRADES.map((u) => [u.id, upgradeText(u.id)]));
  assert.deepEqual(
    { hp: text.hp, attack: text.attack, defense: text.defense, yellow: text.yellow, blue: text.blue, red: text.red,
      quality: text.quality, undos: text.undos, shardHp: text.shardHp, shardAttack: text.shardAttack,
      shardDefense: text.shardDefense, shardUndos: text.shardUndos, revive: text.revive },
    {
      hp: "+20 starting maximum HP",
      attack: "+2 starting attack",
      defense: "+1 starting defense",
      yellow: "+1 starting amber key",
      blue: "+1 starting azure key",
      red: "+1 starting crimson key",
      quality: "+2 weapon attack and +1 armor defense",
      undos: "Store one additional undo (up to 5)",
      shardHp: "+15 starting maximum HP",
      shardAttack: "+1 starting attack",
      shardDefense: "+1 starting defense",
      shardUndos: "Store one additional undo (up to 5)",
      revive: "Undo a fatal move before moving in the new run",
    },
  );
  assert.deepEqual(GOLD_SHOP.map((g) => provisionText(g.id)), [
    "+20 max HP next run", "+3 attack next run", "+3 defense next run",
  ]);
});
