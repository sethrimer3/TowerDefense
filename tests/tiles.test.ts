import { evolveOne } from "../src/specializations.ts";
// The tile collection (src/tiles.ts): stacks, types and filters, the shop,
// where each kind's upgrades live, and higher tiers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { BOMB_PRICE, PALETTE_ITEMS, purchasePrice } from "../src/defend/catalog.ts";
import { placeCityTile, placeStructure } from "../src/defend/layout.ts";
import { evolve, learnPath } from "../src/knowledge-paths.ts";
import { CONSUMABLES, TILE_FILTERS, TILE_IDS, TILE_TYPE, buyTile, canBuyTile, higherTier, shopOffer, tileCopies, tileStack, tileStacks, tileTopic } from "../src/tiles.ts";
import { topicHas } from "../src/ui/ledger.ts";

test("every palette item and consumable is a tile of one type, filed in one topic", () => {
  assert.deepEqual([...TILE_IDS].sort(), [...PALETTE_ITEMS, ...CONSUMABLES].sort());
  for (const id of TILE_IDS) {
    assert.ok(TILE_FILTERS.some((f) => f.id === TILE_TYPE[id]), id);
    assert.ok(tileTopic(id).topic, id);
  }
  // The kinds are laid out a type at a time.
  const types = TILE_IDS.map((id) => TILE_TYPE[id]);
  assert.deepEqual(types, [...types].sort((a, b) => ["city", "units", "towers", "consumables"].indexOf(a) - ["city", "units", "towers", "consumables"].indexOf(b)));
});

test("identical tiles stack, counted with those standing in the city; filters show one type", () => {
  const s = defaults(), d = s.defend;
  d.owned.barracks = 3;
  let l = placeCityTile(d.layout, d.layout.keep.tx, d.layout.keep.ty - 1) ?? assert.fail("tile");
  d.layout = placeStructure(l, "barracks", d.layout.keep.tx, d.layout.keep.ty - 1) ?? assert.fail("barracks");
  const barracks = tileStack(s, "barracks");
  assert.deepEqual([barracks.count, barracks.placed, barracks.ready], [3, 1, 2]);
  assert.deepEqual(tileCopies(barracks).map((c) => [c.key, c.placed]), [["barracks#0", true], ["barracks#1", false], ["barracks#2", false]]);
  assert.equal(tileCopies(barracks, 2).length, 2);
  const all = tileStacks(s, "all").map((t) => t.id);
  assert.ok(all.includes("barracks") && all.includes("cityTile") && all.includes("warBanner"));
  assert.ok(!all.includes("bomb"), "no bombs owned, no stack");
  assert.ok(!all.includes("wizardTower"));
  assert.deepEqual(tileStacks(s, "units").map((t) => t.type), tileStacks(s, "units").map(() => "units"));
  assert.deepEqual(tileStacks(s, "consumables").map((t) => t.id), ["warBanner"]);
  s.defend.bombs = 4;
  assert.deepEqual(tileStacks(s, "consumables").map((t) => [t.id, t.count]), [["bomb", 4], ["warBanner", 1]]);
  assert.ok(tileStack(s, "warBanner").lasting);
});

test("the shop sells every kind for sale, in metal, including bombs, and refuses what can't be paid", () => {
  const s = defaults();
  s.smithy = { copper: 3, silver: 0, gold: 0 };
  const shop = tileStacks(s, "all", true).map((t) => t.id);
  assert.ok(shop.includes("wizardTower") && shop.includes("bomb"), "unowned kinds are sold");
  assert.ok(!shop.includes("warBanner"), "the banner isn't sold");
  assert.ok(!shop.includes("darkKeep") && !shop.includes("valkyriePalace"), "crowns' buildings aren't sold");
  assert.deepEqual(shopOffer(s, "bomb"), { price: BOMB_PRICE });
  assert.deepEqual(shopOffer(s, "archerTower"), { price: purchasePrice("archerTower", s.defend.owned.archerTower) });
  assert.ok(canBuyTile(s, "archerTower"));
  const owned = s.defend.owned.archerTower;
  assert.ok(buyTile(s, "archerTower"));
  assert.equal(s.defend.owned.archerTower, owned + 1);
  assert.equal(s.smithy.copper, 0);
  assert.ok(!canBuyTile(s, "archerTower"));
  assert.equal(buyTile(s, "archerTower"), false);
  s.smithy.copper = BOMB_PRICE.copper!;
  assert.ok(buyTile(s, "bomb"));
  assert.deepEqual([s.smithy.copper, s.defend.bombs], [0, 1]);
  assert.equal(buyTile(s, "bomb"), false);
  assert.equal(buyTile(s, "warBanner"), false);
  s.settings.devMode = true;
  assert.ok(buyTile(s, "bomb") && buyTile(s, "cannonTower"), "unlimited money buys for nothing");
  assert.equal(s.smithy.copper, 0);
});

test("base kinds remain for sale after evolution; evolved kinds are made, not bought", () => {
  const s = defaults(); s.settings.devMode = true; s.defend.owned.wizardTower = 1;
  assert.equal(higherTier("wizardTower").into?.evolves?.item, "darkKeep");
  for (let i = 0; i < 3; i++) learnPath(s, "storm");
  assert.ok(evolve(s, "storm"));
  assert.ok(evolveOne(s, "storm"));
  assert.ok("price" in shopOffer(s, "wizardTower"));
  assert.ok("reason" in shopOffer(s, "darkKeep"));
  assert.ok(buyTile(s, "wizardTower"));
  assert.deepEqual([s.defend.owned.wizardTower, s.defend.owned.darkKeep], [1, 1]);
});

test("each kind's upgrades are in the Smithy or the Study it links to", () => {
  for (const id of TILE_IDS) {
    const { topic } = tileTopic(id);
    assert.ok(topicHas(topic, "smithy") || topicHas(topic, "study"), `${id}'s topic ${topic.id} has nothing to upgrade`);
  }
  assert.equal(tileTopic("bomb").topic.id, "battle");
  assert.equal(tileTopic("warBanner").topic.id, "warBanner");
});
