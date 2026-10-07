import { test } from "node:test";
import assert from "node:assert/strict";
import { canAffordMetals, spendMetals, metalPriceText } from "../src/metals.ts";
import { hirePrice, upgradePrice } from "../src/mine/sim.ts";
import { labPrice, librarianPrice, shelfPrice } from "../src/library/sim.ts";
import { BOMB_PRICE } from "../src/defend/catalog.ts";
import { defaults } from "../src/save.ts";

test("mixed metal payments check every metal before spending, and dev purchases spend nothing", () => {
  const wallet = { copper: 20, silver: 2, gold: 0 }, price = { copper: 10, silver: 2, gold: 1 };
  assert.equal(canAffordMetals(wallet, price), false);
  assert.equal(spendMetals(wallet, price), false);
  assert.deepEqual(wallet, { copper: 20, silver: 2, gold: 0 });
  assert.equal(spendMetals(wallet, price, true), true);
  assert.deepEqual(wallet, { copper: 20, silver: 2, gold: 0 });
  wallet.gold = 1;
  assert.equal(spendMetals(wallet, price), true);
  assert.deepEqual(wallet, { copper: 10, silver: 0, gold: 0 });
  assert.equal(metalPriceText(price), "10 Copper · 2 Silver · 1 Gold");
});

test("starting Copper can fund a new miner, a shelf and the first professor without deep ore", () => {
  const wallet = defaults().smithy;
  for (const price of [hirePrice(1), shelfPrice(0), librarianPrice(0)]) {
    assert.deepEqual(Object.keys(price), ["copper"]);
    assert.equal(spendMetals(wallet, price), true);
  }
  assert.equal(wallet.copper, 5);
  assert.deepEqual(BOMB_PRICE, { copper: 1 });
});

test("larger crews, buildings, collections and labs add Silver and then Gold", () => {
  assert.deepEqual(hirePrice(5), { copper: 6, silver: 1 });
  assert.deepEqual(hirePrice(15), { copper: 16, silver: 3, gold: 1 });
  assert.deepEqual(upgradePrice("warehouse", 1), { copper: 6 });
  assert.deepEqual(upgradePrice("warehouse", 2), { copper: 12, silver: 1 });
  assert.deepEqual(upgradePrice("warehouse", 3), { copper: 18, silver: 2, gold: 1 });
  assert.deepEqual(librarianPrice(4), { copper: 6, silver: 1 });
  assert.deepEqual(librarianPrice(12), { copper: 14, silver: 3, gold: 1 });
  assert.deepEqual(shelfPrice(20), { copper: 21, silver: 1 });
  assert.deepEqual(shelfPrice(60), { copper: 61, silver: 3, gold: 1 });
  assert.deepEqual(labPrice(1), { copper: 10 });
  assert.deepEqual(labPrice(2), { copper: 20, silver: 3 });
  assert.deepEqual(labPrice(3), { copper: 30, silver: 6, gold: 1 });
});
