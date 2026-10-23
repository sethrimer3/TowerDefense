import { nextSteps, upgradeBuilding } from "../src/specializations.ts";
// The tile collection (src/tiles.ts): stacks, types and filters, the shop,
// where each kind's upgrades live, and higher tiers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { BOMB_PRICE, PALETTE_ITEMS, purchasePrice } from "../src/defend/catalog.ts";
import { placeCityTile, placeStructure } from "../src/defend/layout.ts";
import { CONSUMABLES, TILE_FILTERS, TILE_IDS, TILE_TYPE, buyTile, canBuyTile, higherTier, marksText, shopOffer, tileCopies, tileGroups, tileMarks, tileStack, tileStacks, tileTopic, tileTree, tileCopyAt, universal } from "../src/tiles.ts";
import { buildingSheet } from "../src/ui/specialty.ts";
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
  assert.deepEqual(tileCopies(s, barracks).map((c) => [c.key, c.placed]), [["barracks#0", true], ["barracks#1", false], ["barracks#2", false]]);
  assert.equal(tileCopies(s, barracks, 2).length, 2);
  const all = tileStacks(s, "all").map((t) => t.id);
  assert.ok(all.includes("barracks") && all.includes("cityTile") && all.includes("warBanner"));
  assert.ok(!all.includes("bomb"), "no bombs owned, no stack");
  assert.ok(!all.includes("wizardTower"));
  assert.deepEqual(tileStacks(s, "units").map((t) => t.type), tileStacks(s, "units").map(() => "units"));
  assert.deepEqual(tileStacks(s, "consumables").map((t) => t.id), ["warBanner", "necromancy", "meteor", "frostNova", "reinforcements"]);
  s.defend.bombs = 4;
  assert.deepEqual(tileStacks(s, "consumables").map((t) => [t.id, t.count]), [["bomb", 4], ["warBanner", 1], ["necromancy", 1], ["meteor", 1], ["frostNova", 1], ["reinforcements", 1]]);
  assert.ok(tileStack(s, "warBanner").lasting);
});

test("the shop sells only the basic buildings and the city's pieces, in metal, including bombs", () => {
  const s = defaults();
  s.smithy = { copper: 4, silver: 0, gold: 0 };
  const shop = tileStacks(s, "all", true).map((t) => t.id);
  assert.deepEqual(shop.filter((id) => TILE_TYPE[id] === "units" || TILE_TYPE[id] === "towers"), ["meleeGuild", "rangedGuild", "watchTower"]);
  assert.ok(shop.includes("bomb") && shop.includes("cityTile") && shop.includes("monsterBait"));
  assert.ok(!shop.includes("warBanner"), "the banner isn't sold");
  for (const id of ["archerTower", "cannonTower", "wizardTower", "barracks", "archerBarracks", "mageGuild", "sniperLodge", "musketHall", "darkKeep", "valkyriePalace"] as const)
    assert.match((shopOffer(s, id) as { reason: string }).reason, /upgrade/, id);
  assert.match((shopOffer(s, "darkKeep") as { reason: string }).reason, /Watch tower/, "named by the basic building it grows from");
  assert.deepEqual(shopOffer(s, "bomb"), { price: BOMB_PRICE });
  assert.deepEqual(shopOffer(s, "watchTower"), { price: purchasePrice("watchTower", s.defend.owned.watchTower) });
  const owned = s.defend.owned.watchTower;
  assert.ok(buyTile(s, "watchTower"));
  assert.equal(s.defend.owned.watchTower, owned + 1);
  assert.ok(!canBuyTile(s, "watchTower"));
  assert.equal(buyTile(s, "archerTower"), false, "not sold");
  s.smithy.copper = BOMB_PRICE.copper!;
  assert.ok(buyTile(s, "bomb"));
  assert.equal(buyTile(s, "warBanner"), false);
  s.settings.devMode = true;
  assert.ok(buyTile(s, "bomb") && buyTile(s, "meleeGuild"), "unlimited money buys for nothing");
});

test("an upgraded building's tier: what it grew from, and the ultimate its line merges into", () => {
  const s = defaults(); s.settings.devMode = true;
  assert.deepEqual(higherTier("wizardTower"), { into: "darkKeep" });
  assert.deepEqual(higherTier("phalanx"), { into: "valkyriePalace" });
  assert.deepEqual(higherTier("darkKeep"), { from: "wizardTower" });
  assert.deepEqual(higherTier("archerTower"), {}, "its ultimate is still to come");
  let l = placeCityTile(s.defend.layout, s.defend.layout.keep.tx, s.defend.layout.keep.ty - 1) ?? assert.fail("tile");
  s.defend.layout = placeStructure(l, "watchTower", l.keep.tx, l.keep.ty - 1) ?? assert.fail("tower");
  const uid = s.defend.layout.structures[0].uid;
  assert.ok(upgradeBuilding(s, { uid }, nextSteps("watchTower").find((st) => st.type === "become" && st.to === "wizardTower")!).ok);
  assert.deepEqual([s.defend.owned.watchTower, s.defend.owned.wizardTower], [0, 1]);
  assert.equal(tileStack(s, "wizardTower").placed, 1);
});

test("each kind's upgrades are in the Smithy or the Study it links to", () => {
  for (const id of TILE_IDS) {
    const { topic } = tileTopic(id);
    assert.ok(topicHas(topic, "smithy") || topicHas(topic, "study"), `${id}'s topic ${topic.id} has nothing to upgrade`);
  }
  assert.equal(tileTopic("bomb").topic.id, "battle");
  assert.equal(tileTopic("warBanner").topic.id, "warBanner");
});

test("each copy carries its own Knowledge upgrades; copies alike stack, and shared kinds always do", () => {
  const s = defaults(), d = s.defend;
  // City pieces, walls and skills are alike in every copy; buildings with a tree are not.
  for (const id of ["cityTile", "wallBlock", "cityGate", "wallBallista", "bomb", "warBanner"] as const) assert.ok(universal(id), id);
  for (const id of ["watchTower", "meleeGuild", "rangedGuild", "archerTower", "darkKeep", "wallSpikes"] as const) assert.ok(!universal(id), id);
  d.owned.archerTower = 4;
  let l = placeCityTile(d.layout, d.layout.keep.tx, d.layout.keep.ty - 1) ?? assert.fail("tile");
  l = placeStructure(l, "archerTower", d.layout.keep.tx, d.layout.keep.ty - 1) ?? assert.fail("tower");
  l.structures[l.structures.length - 1].path = "fireArrows";
  l.structures[l.structures.length - 1].rank = 2;
  d.layout = l;
  d.kept = [{ kind: "archerTower", path: "fireArrows", rank: 2 }];
  const stack = tileStack(s, "archerTower");
  const copies = tileCopies(s, stack);
  assert.deepEqual(copies.map((c) => [c.key, c.placed, c.wear?.rank ?? 0]), [
    ["archerTower~fireArrows~2#0", true, 2], ["archerTower~fireArrows~2#1", false, 2], ["archerTower#0", false, 0], ["archerTower#1", false, 0],
  ]);
  const groups = tileGroups(s, stack);
  assert.deepEqual(groups.map((g) => [g.key, g.count, g.placed]), [["archerTower", 2, 0], ["archerTower~fireArrows~2", 2, 1]]);
  // An Archer tower became one from a Watch tower: one diamond, then its two ranks.
  assert.deepEqual(groups[1].marks.map((m) => m.type), ["became", "rank", "rank"]);
  assert.equal(marksText("archerTower", groups[1].marks), "Watch tower → Archer tower → Fire arrows II");
  assert.equal(marksText("archerTower", groups[0].marks), "Watch tower → Archer tower");
  assert.deepEqual(tileMarks(s, "watchTower"), []);
  // An ultimate shows the attuned building merged into it.
  assert.deepEqual(tileMarks(s, "darkKeep").map((m) => m.type), ["became", "became"]);
  // The walls carry their one shared tree.
  assert.deepEqual(tileMarks(s, "wallBlock"), []);
  d.wallRanks = { stonework: 2, townWalls: 1 };
  assert.equal(marksText("wallBlock", tileMarks(s, "wallBlock")), "Stonework II → Town walls I");
  // A universal kind's copies are all plain: one stack.
  d.owned.cityTile = 3;
  assert.deepEqual(new Set(tileCopies(s, tileStack(s, "cityTile")).map((c) => c.group)), new Set(["cityTile"]));
});

test("a held tile opens its own copy's tree: where it stands, else its palette copy; shared trees for the wall's pieces", () => {
  const s = defaults(), d = s.defend;
  d.owned.barracks = 3;
  const l = placeCityTile(d.layout, d.layout.keep.tx, d.layout.keep.ty - 1) ?? assert.fail("tile");
  d.layout = placeStructure(l, "barracks", d.layout.keep.tx, d.layout.keep.ty - 1) ?? assert.fail("barracks");
  d.kept = [{ kind: "barracks", path: "crusaders", rank: 2 }];
  const uid = d.layout.structures.find((o) => o.kind === "barracks")!.uid;
  assert.deepEqual(tileTree(s, "barracks", "barracks#0"), { uid });
  assert.deepEqual(tileTree(s, "barracks", "barracks~crusaders~2#0"), { copy: "barracks", wear: { path: "crusaders", rank: 2 } });
  assert.deepEqual(tileTree(s, "barracks", "barracks~crusaders~2"), { copy: "barracks", wear: { path: "crusaders", rank: 2 } }, "a stack's group");
  assert.deepEqual(tileTree(s, "barracks", "barracks#1"), { copy: "barracks" });
  assert.deepEqual(tileCopyAt(s, tileStack(s, "barracks"), "barracks~crusaders~2")?.wear, { path: "crusaders", rank: 2 });
  assert.deepEqual(tileTree(s, "wallBlock"), { side: "walls" });
  assert.deepEqual(tileTree(s, "cityGate"), { side: "gate" });
  assert.deepEqual(tileTree(s, "wallBallista"), { side: "ballistas" });
  assert.equal(tileTree(s, "cityTile"), null);
  assert.equal(tileTree(s, "bomb"), null);
});

test("an opened tile shows its basic stats, then each upgrade it carries as an ability in its path's colour", () => {
  const s = defaults();
  const plain = buildingSheet(s, "wizardTower");
  assert.equal(plain.stats.length, 5);
  assert.match(plain.stats[0], /fire damage\/s/);
  assert.deepEqual(plain.abilities, []);
  const storm = buildingSheet(s, "stormTower", { path: "storm", rank: 2 });
  assert.match(storm.stats.join(" "), /5 targets/);
  assert.deepEqual(storm.abilities.map((a) => a.hue), ["storm", "storm"]);
  assert.match(storm.abilities[0].text, /leap through 3 enemies/);
  // What a path adds isn't repeated among the numbers.
  const fire = buildingSheet(s, "archerTower", { path: "fireArrows", rank: 3 });
  assert.equal(fire.stats.length, buildingSheet(s, "archerTower").stats.length);
  assert.equal(fire.abilities.length, 3);
  // Shared trees list every rank bought.
  s.defend.wallRanks = { stonework: 2, trapped: 1 };
  const walls = buildingSheet(s, "wallBlock");
  assert.equal(walls.stats.length, 1);
  assert.equal(walls.abilities.length, 3);
  for (const id of TILE_IDS) if (!CONSUMABLES.includes(id as never) && id !== "cityTile") assert.ok(buildingSheet(s, id as never).stats.length, id);
});
