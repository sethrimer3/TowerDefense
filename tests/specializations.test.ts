// Each building's own upgrades (src/specializations.ts): the shop sells the
// basic buildings, and each placed one is upgraded on its own with
// Knowledge, into another building or up one of its paths, rank by rank,
// to a crown's evolution. Its path and rank move with it, wait with it in
// the palette, survive saves and are snapshotted when a battle starts.
import { test } from "node:test";
import { openSight } from "./open-sight.ts";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { ATTUNED, allocated, buildingTree, foundNodes, hasTree, targetKind, respecBuilding, undoTo, undoRefund, undoUpgrade, nextSteps, placedBattlePaths, specialtyLabel, specialtyOf, spikeKey, stepName, upgradeBuilding, upgradedFrom, rootOf, type UpgradeStep } from "../src/specializations.ts";
import { learnPath, pathById, type PathId } from "../src/knowledge-paths.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, removeStructure, moveStructure, moveSpikes, placeCityTile, placeSpikes, removeSpikes, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { available, decodeDefendSave, keptGroups, plainAvailable, setLayout } from "../src/defend/progress.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Wizards } from "../src/defend/wizard.ts";
import { Barracks, stepArcher, stepSwordsman } from "../src/defend/troops.ts";
import { Towers, stepArrows } from "../src/defend/towers.ts";
import { stepMage, stepFireballs, stepBlazes } from "../src/defend/mages.ts";
import { baitBitten } from "../src/defend/bait.ts";
import { center } from "../src/defend/pathing.ts";
import { isWizardTower, BRAWLER, MUSKETEER, ROCKETEER, SLINGER, SNIPER, STARTING_OWNED, type PaletteItem } from "../src/defend/catalog.ts";
import { treeCardHtml, treeGraph } from "../src/ui/specialty.ts";
import { battleBonuses, wear as spare } from "./spare-paths.ts";

type S = ReturnType<typeof defaults>;
const INSIDE = new Set<PaletteItem>(["barracks", "mageGuild", "archerBarracks", "meleeGuild", "rangedGuild", "sniperLodge", "musketHall", "gunHall", "gunNest", "gatlingNest", "rocketBattery"]);

function fixture(kind: PaletteItem, count = 3) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned[kind] = count;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  for (let i = 0; i < count; i++) {
    const [dx, dy] = INSIDE.has(kind) ? [[0, -1], [-1, 0], [1, 0]][i] : [i - 1, -3];
    l = placeStructure(l, kind as never, l.keep.tx + dx, l.keep.ty + dy) ?? assert.fail("placement");
  }
  s.defend.layout = l;
  return s;
}
/** The uids of `kind` standing in `s`'s city, oldest first. */
const uids = (s: S, kind: PaletteItem) => s.defend.layout.structures.filter(st => st.kind === kind).map(st => st.uid);
/** Upgrades structure `uid` up `path` to `rank`, one rank at a time, first
 * attuning it to the branch's own building when the branch has one. */
function wear(s: S, uid: number, path: PathId, rank = 3) {
  const via = ATTUNED.flatMap((a) => a.branches).find((b) => b.path === path)?.via;
  if (via && s.defend.layout.structures.find(st => st.uid === uid)!.kind !== via.kind) assert.ok(upgradeBuilding(s, { uid }, become(via.kind)).ok);
  for (let r = specialtyOf(s.defend.layout, { uid })?.rank ?? 0; r < rank; r++) {
    const kind = s.defend.layout.structures.find(st => st.uid === uid)!.kind;
    const step = nextSteps(kind, specialtyOf(s.defend.layout, { uid })).find(st => st.type === "path" && st.path === path) ?? assert.fail(`${path} ${r + 1}`);
    assert.ok(upgradeBuilding(s, { uid }, step).ok);
  }
}
const become = (to: PaletteItem): UpgradeStep => ({ type: "become", to: to as never, cost: 0 });
function simulation(s: S) {
  const fit = fitLayout(s.defend.layout); assert.ok(fit.ok);
  return new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
}
function enemy(sim: DefendSim, x: number, y: number) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e); (sim as any).indexEnemies(); return e;
}

// ── The tree ───────────────────────────────────────────────────────────
test("the shop's three basic buildings branch into attuned buildings, each with three branches", () => {
  const to = (k: Parameters<typeof nextSteps>[0]) => nextSteps(k).map(stepName);
  assert.deepEqual(to("watchTower"), ["Archer tower", "Cannon tower", "Wizard tower"], "no paths of its own");
  assert.deepEqual(to("meleeGuild"), ["Barracks", "Assassins' den", "Spearmen hall"]);
  assert.deepEqual(to("rangedGuild"), ["Archer barracks", "Mage Guild", "Gunner hall"]);
  assert.deepEqual(to("gunHall"), ["Musket hall", "Machine-gun nest", "Rocket battery"]);
  assert.deepEqual(to("barracks"), ["Chapterhouse", "Berserker lodge", "Halberd yard"]);
  assert.deepEqual(to("chapterHouse"), ["Crusaders I"]);
  assert.deepEqual(to("assassinDen"), ["Blood hall", "Veil house", "Poison den"]);
  assert.deepEqual(to("wizardTower"), ["Pyre tower", "Frost tower", "Storm tower"]);
  assert.deepEqual(to("pyreTower"), ["Pyromancy I"], "attuned to its branch, it climbs it");
  assert.deepEqual(to("sniperLodge"), ["Revolutionary", "Marksmen I", "Ricochet I", "Suppressing fire I", "Deadeye I", "Piercing rounds I"], "an ultimate keeps its own");
  assert.deepEqual(nextSteps("stormTower", { path: "storm", rank: 2 }).map(stepName), ["Stormcalling III"]);
  for (const [kind, path] of [["pyreTower", "pyromancy"], ["frostTower", "rime"], ["stormTower", "storm"]] as const)
    assert.deepEqual(nextSteps(kind, { path, rank: 3 }).map((s) => s.type === "merge" && s.to), ["darkKeep"], `${path} III merges`);
  assert.deepEqual(nextSteps("lancerStable", { path: "wingedLancers", rank: 3 }).map((s) => s.type === "merge" && s.to), ["valkyriePalace"]);
  assert.deepEqual(nextSteps("archerTower", { path: "fireArrows", rank: 3 }), [], "no ultimate yet");
  assert.deepEqual(to("wallSpikes"), ["Blasting stakes I", "Spring stakes I", "Rimed stakes I"]);
  // Every attuned building has three branches of three ranks (or, while a
  // third is still to come, two).
  for (const a of ATTUNED) {
    assert.ok(a.branches.length === 3 || (a.branches.length === 2 && ["archerTower", "cannonTower", "archerBarracks", "mageGuild"].includes(a.kind)), a.kind);
    for (const b of a.branches) assert.equal(pathById(b.path).ranks.length, b.path === "wispArrow" ? 2 : 3, b.path);
  }
  assert.equal(rootOf("darkKeep"), "watchTower");
  assert.equal(rootOf("valkyriePalace"), "meleeGuild");
  assert.equal(upgradedFrom("musketHall"), "gunHall");
  assert.equal(rootOf("sniperLodge"), "rangedGuild");
  assert.equal(upgradedFrom("watchTower"), undefined);
  assert.deepEqual([STARTING_OWNED.watchTower, STARTING_OWNED.meleeGuild, STARTING_OWNED.rangedGuild], [1, 1, 1], "a new game starts with one of each");
});

test("each building is upgraded on its own, paying Knowledge rank by rank", () => {
  const s = fixture("pyreTower", 2); s.settings.devMode = false; s.knowledge = 4;
  const [a, b] = uids(s, "pyreTower"), pyro = (rank: number): UpgradeStep => ({ type: "path", path: "pyromancy", rank, cost: 0 });
  assert.equal(upgradeBuilding(s, { uid: a }, pyro(2)).ok, false, "ranks go in order");
  assert.ok(upgradeBuilding(s, { uid: a }, pyro(1)).ok);
  assert.equal(s.knowledge, 0);
  assert.deepEqual(specialtyOf(s.defend.layout, { uid: a }), { path: "pyromancy", rank: 1 });
  assert.equal(specialtyOf(s.defend.layout, { uid: b }), undefined, "the other tower is untouched");
  assert.deepEqual(upgradeBuilding(s, { uid: b }, pyro(1)), { ok: false, reason: "Needs 4 Knowledge." });
  s.knowledge = 1e6;
  assert.equal(upgradeBuilding(s, { uid: a }, { type: "path", path: "rime", rank: 1, cost: 0 }).ok, false, "one path a building");
  assert.equal(upgradeBuilding(s, { uid: a }, become("cannonTower")).ok, false, "a pyre tower doesn't become a cannon");
  assert.equal(upgradeBuilding(s, { uid: 999 }, pyro(1)).ok, false, "nothing stands there");
  wear(s, a, "pyromancy", 3);
  assert.equal(s.knowledge, 1e6 - 4004 - 16004);
  assert.equal(bonuses(s).structurePaths![a].pyreTower!.rank, 3);
  assert.equal(bonuses(s).structurePaths![b], undefined);
  assert.equal(specialtyLabel(specialtyOf(s.defend.layout, { uid: a })), "Pyromancy III");
  assert.deepEqual(treeGraph("wizardTower").filter((n) => n.state === "next").map((n) => n.id), ["k:pyreTower", "k:frostTower", "k:stormTower"]);
  assert.match(treeCardHtml(s, "wizardTower", undefined, "k:stormTower"), /Storm tower[\s\S]*data-ug-buy="k:stormTower"/);
  s.knowledge = 0;
  assert.match(treeCardHtml(s, "wizardTower", undefined, "k:stormTower"), /data-ug-buy="k:stormTower" disabled/, "unaffordable upgrades show, locked");
  assert.ok(!treeGraph("wizardTower").some((n) => n.id.startsWith("p:")), "only the attunements show before a branch is taken");
  assert.match(treeCardHtml(s, "stormTower", { path: "storm", rank: 1 }, "p:storm:3"), /Locked/);
  assert.match(treeCardHtml(s, "wizardTower", undefined, "k:wizardTower"), /Where it is now/);
});

test("becoming another building swaps one copy: in place when it fits, else it waits in the palette", () => {
  const s = fixture("watchTower", 2), [a] = uids(s, "watchTower");
  assert.deepEqual(upgradeBuilding(s, { uid: a }, become("archerTower")), { ok: true, kind: "archerTower", waiting: false });
  assert.deepEqual([s.defend.owned.watchTower, s.defend.owned.archerTower], [1, 1]);
  assert.equal(s.defend.layout.structures.find(st => st.uid === a)!.kind, "archerTower", "the same building, same uid");
  assert.ok(fitLayout(s.defend.layout).ok);
  // The same size, it stays where it stood; another size, and it waits in
  // the palette to be placed again, attuned but not yet on its path.
  const g = fixture("rangedGuild", 2), [guild, other] = uids(g, "rangedGuild");
  assert.deepEqual(upgradeBuilding(g, { uid: guild }, become("gunHall")), { ok: true, kind: "gunHall", waiting: false });
  assert.deepEqual(upgradeBuilding(g, { uid: other }, become("gunHall")), { ok: true, kind: "gunHall", waiting: false });
  assert.deepEqual(upgradeBuilding(g, { uid: other }, become("musketHall")), { ok: true, kind: "musketHall", waiting: true });
  assert.deepEqual(g.defend.layout.structures.map((st) => st.kind), ["gunHall"]);
  assert.deepEqual([g.defend.owned.musketHall, keptGroups(g.defend, "musketHall")], [1, []]);
});

test("three buildings maxed on different branches merge into the ultimate; undone, they come apart", () => {
  const w = fixture("stormTower", 1), [t] = uids(w, "stormTower");
  wear(w, t, "storm");
  const merge: UpgradeStep = { type: "merge", to: "darkKeep", cost: 0 };
  assert.deepEqual(upgradeBuilding(w, { uid: t }, merge), { ok: false, reason: "Needs a Pyre tower at Pyromancy III and a Frost tower at Rime III to merge with." });
  // One waits in the palette, one stands in the city.
  w.defend.owned.pyreTower = 1; w.defend.owned.frostTower = 1;
  w.defend.kept.push({ kind: "pyreTower", path: "pyromancy", rank: 3 });
  let l = w.defend.layout;
  l = placeStructure(l, "frostTower", l.keep.tx + 1, l.keep.ty - 3, { path: "rime", rank: 3 })!;
  w.defend.layout = l;
  w.settings.devMode = false; w.knowledge = 0;
  assert.match(treeCardHtml(w, "stormTower", { path: "storm", rank: 3 }, "k:darkKeep"), /waiting in the palette[\s\S]*standing in the city[\s\S]*data-ug-buy="k:darkKeep" >Merge · Free/);
  // A keep needs a 2 × 2 block of tiles: it waits in the palette.
  assert.deepEqual(upgradeBuilding(w, { uid: t }, merge), { ok: true, kind: "darkKeep", waiting: true });
  assert.deepEqual([w.defend.owned.stormTower, w.defend.owned.pyreTower, w.defend.owned.frostTower, w.defend.owned.darkKeep, available(w.defend, "darkKeep")], [0, 0, 0, 1, 1]);
  assert.deepEqual([w.defend.kept, w.defend.layout.structures.length], [[], 0], "the other two are used up");
  assert.equal(w.knowledge, 0, "merging is free");
  assert.ok(foundNodes(w.defend).has("k:darkKeep"));
  // Undoing the merge parts it into the three; a respec into three Watch towers.
  assert.deepEqual(undoTo("darkKeep", undefined, "k:darkKeep"), { kind: "frostTower", wear: { path: "rime", rank: 3 }, apart: [{ kind: "pyreTower", wear: { path: "pyromancy", rank: 3 } }, { kind: "stormTower", wear: { path: "storm", rank: 3 } }] });
  assert.equal(undoRefund("darkKeep", undefined, "k:darkKeep"), 0);
  assert.equal(undoTo("darkKeep", undefined, "p:storm:2"), undefined, "below the merge, only the merge undoes");
  const r = undoUpgrade(w, { copy: "darkKeep" }, "k:darkKeep");
  assert.deepEqual(r.ok && r.copy, { copy: "frostTower", wear: { path: "rime", rank: 3 } });
  assert.deepEqual((["pyreTower", "frostTower", "stormTower"] as const).map((k) => keptGroups(w.defend, k).map((g) => g.path)), [["pyromancy"], ["rime"], ["storm"]]);
  assert.deepEqual([w.defend.owned.pyreTower, w.defend.owned.frostTower, w.defend.owned.stormTower, w.defend.owned.darkKeep, w.knowledge], [1, 1, 1, 0, 0]);
  w.defend.kept = []; w.defend.owned.pyreTower = w.defend.owned.frostTower = w.defend.owned.stormTower = 0; w.defend.owned.darkKeep = 1; w.defend.owned.watchTower = 0;
  assert.ok(respecBuilding(w, { copy: "darkKeep" }).ok);
  assert.deepEqual([w.defend.owned.watchTower, w.defend.owned.darkKeep, w.knowledge], [3, 0, allocated("darkKeep")]);
});

test("moving keeps a building's upgrades; taken up, it waits in the palette with them and is placed again", () => {
  const s = fixture("frostTower", 2), d = s.defend, [uid] = uids(s, "frostTower"), l0 = d.layout;
  wear(s, uid, "rime", 2);
  setLayout(d, moveStructure(d.layout, uid, l0.keep.tx + 1, l0.keep.ty - 3)!);
  assert.deepEqual(specialtyOf(d.layout, { uid }), { path: "rime", rank: 2 });
  assert.deepEqual(d.kept, []);
  setLayout(d, removeStructure(d.layout, uid));
  assert.deepEqual(keptGroups(d, "frostTower"), [{ path: "rime", rank: 2, count: 1 }]);
  assert.deepEqual([available(d, "frostTower"), plainAvailable(d, "frostTower")], [1, 0]);
  const back = decode(JSON.stringify(s));
  assert.deepEqual(back.defend.kept, d.kept, "kept copies survive saves");
  setLayout(d, placeStructure(d.layout, "frostTower", l0.keep.tx, l0.keep.ty - 3, { path: "rime", rank: 2 })!);
  const again = uids(s, "frostTower").find(u => u !== uids(s, "frostTower")[0] || true)!;
  assert.ok(d.layout.structures.some(st => st.kind === "frostTower" && st.path === "rime" && st.rank === 2));
  assert.ok(again);
  assert.deepEqual(d.kept, [], "placed again, it no longer waits");
  // Never more kept than wait in the palette.
  const raw: any = JSON.parse(JSON.stringify(s));
  raw.defend.kept = [{ kind: "frostTower", path: "rime", rank: 2 }, { kind: "frostTower", path: "pyromancy", rank: 9 }, { kind: "barracks", path: "rime", rank: 1 }];
  assert.deepEqual(decode(JSON.stringify(raw)).defend.kept, [], "nothing waits in the palette, and the rest is malformed");
});

test("wall spikes climb a path per row, keep it as they move, and keep it waiting in the palette", () => {
  const s = defaults(); s.settings.devMode = true; s.defend.owned.wallSpikes = 2;
  const d = s.defend, l = d.layout, north = { tx: l.keep.tx, ty: l.keep.ty, side: "n" as const }, west = { ...north, side: "w" as const };
  d.layout = placeSpikes(placeSpikes(l, north)!, west)!;
  assert.ok(upgradeBuilding(s, { spikes: north }, { type: "path", path: "blastStakes", rank: 1, cost: 0 }).ok);
  assert.ok(upgradeBuilding(s, { spikes: west }, { type: "path", path: "rimeStakes", rank: 1, cost: 0 }).ok);
  assert.equal(upgradeBuilding(s, { spikes: west }, { type: "path", path: "fortified", rank: 1, cost: 0 }).ok, false);
  const loaded = decode(JSON.stringify(s));
  assert.deepEqual(placedBattlePaths(loaded).spikePaths, { [spikeKey(north)]: { spikes: { path: "blastStakes", rank: 1 } }, [spikeKey(west)]: { spikes: { path: "rimeStakes", rank: 1 } } });
  const east = { ...north, side: "e" as const };
  setLayout(d, moveSpikes(d.layout, north, east)!);
  assert.equal(specialtyOf(d.layout, { spikes: east })?.path, "blastStakes", "moving keeps it");
  setLayout(d, removeSpikes(d.layout, east));
  assert.deepEqual(d.kept, [{ kind: "wallSpikes", path: "blastStakes", rank: 1 }]);
  setLayout(d, placeSpikes(d.layout, east)!);
  assert.equal(specialtyOf(d.layout, { spikes: east }), undefined, "a plain row placed");
});

test("upgrades are snapshotted at battle start", () => {
  const s = fixture("frostTower", 1), [uid] = uids(s, "frostTower");
  wear(s, uid, "rime", 1);
  const sim = simulation(s);
  wear(s, uid, "rime", 2); s.training.towerDamage = 2;
  assert.equal(sim.bonuses.structurePaths![uid].frostTower!.rank, 1);
  assert.equal(bonuses(s).structurePaths![uid].frostTower!.rank, 2); assert.equal(sim.bonuses.towerDamage, 1);
});

// ── The living tree and respec ──────────────────────────────────────────
test("a choice cuts off the branches beside it and opens its own", () => {
  const ids = (kind: Parameters<typeof buildingTree>[0], wear?: Parameters<typeof buildingTree>[1]) => buildingTree(kind, wear).map((n) => `${n.id}=${n.state}`);
  const plain = ids("rangedGuild");
  assert.deepEqual(plain, ["k:rangedGuild=owned", "k:archerBarracks=next", "k:mageGuild=next", "k:gunHall=next"]);
  const mage = ids("mageGuild");
  assert.ok(!mage.some((n) => n.startsWith("k:archerBarracks")), "the archer branch is gone");
  assert.ok(mage.includes("k:infernoHall=next") && mage.includes("k:cinderHall=next"), "the mage's own branch halls appear");
  assert.ok(!mage.some((n) => n.startsWith("p:pyroclasm") || n.startsWith("u:")), "only their attunements, until one is taken");
  assert.deepEqual(ids("gunHall").slice(2), ["k:musketHall=next", "k:gunNest=next", "k:rocketBattery=next"], "a branch that makes another building shows only that building");
  const pyro = ids("infernoHall", { path: "pyroclasm", rank: 1 });
  assert.deepEqual(pyro, ["k:rangedGuild=owned", "k:mageGuild=owned", "k:infernoHall=owned", "p:pyroclasm:1=owned", "p:pyroclasm:2=next", "p:pyroclasm:3=locked", "u:mageGuild=locked"], "Cinders is cut off; the ultimate is to come");
  const storm = buildingTree("stormTower", { path: "storm", rank: 3 });
  assert.deepEqual(storm.at(-1), { id: "k:darkKeep", parent: "p:storm:3", state: "next", kind: "darkKeep", cost: 0, step: { type: "merge", to: "darkKeep", cost: 0 } });
  const keep = buildingTree("darkKeep");
  assert.deepEqual(keep.map((n) => n.id), ["k:watchTower", "k:wizardTower", ...[["pyreTower", "pyromancy"], ["frostTower", "rime"], ["stormTower", "storm"]].flatMap(([k, p]) => [`k:${k}`, ...[1, 2, 3].map((r) => `p:${p}:${r}`)]), "k:darkKeep"]);
  assert.ok(keep.every((n) => n.state === "owned"));
  assert.equal(keep.at(-1)!.parent, "p:rime:3", "over the middle branch");
  for (const n of buildingTree("watchTower")) if (n.parent) assert.ok(buildingTree("watchTower").some((o) => o.id === n.parent), n.id);
  // Every buyable node is exactly one of the building's next steps.
  for (const [k, w] of [["watchTower"], ["wizardTower"], ["spearHall"], ["stormTower", { path: "storm", rank: 3 }], ["stormTower"], ["wallSpikes"], ["chapterHouse", { path: "crusaders", rank: 1 }], ["barracks"]] as const)
    assert.equal(buildingTree(k, w as never).filter((n) => n.state === "next").length, nextSteps(k, w as never).length, k);
});

test("allocated Knowledge counts every step from the basic building", () => {
  const full = (p: PathId) => pathById(p).ranks.reduce((n, r) => n + r.cost, 0);
  assert.equal(allocated("watchTower"), 0);
  assert.equal(allocated("wizardTower"), 8);
  assert.equal(allocated("pyreTower", { path: "pyromancy", rank: 2 }), 8 + 6 + 4 + 4004);
  assert.equal(allocated("phalanx", { path: "testudo", rank: 1 }), 5 + 7 + 4);
  assert.equal(allocated("darkKeep"), 3 * 8 + 6 + 6 + 8 + full("pyromancy") + full("rime") + full("storm"), "all three towers merged into it");
  assert.equal(allocated("wallSpikes", { path: "blastStakes", rank: 1 }), pathById("blastStakes").ranks[0].cost);
});

test("a respec is free, gives back every point and returns the basic building", () => {
  const s = fixture("rangedGuild", 2); s.settings.devMode = false; s.knowledge = 100; s.smithy = { copper: 5, silver: 0, gold: 0 };
  const [a, b] = uids(s, "rangedGuild");
  assert.match((respecBuilding(s, { uid: a }) as { reason: string }).reason, /no upgrades/);
  assert.ok(upgradeBuilding(s, { uid: a }, { type: "become", to: "archerBarracks", cost: 0 }).ok);
  assert.ok(upgradeBuilding(s, { uid: a }, { type: "become", to: "rangerLodge", cost: 0 }).ok);
  assert.ok(upgradeBuilding(s, { uid: a }, { type: "path", path: "rangers", rank: 1, cost: 0 }).ok);
  const archers = 5 + 3 + pathById("rangers").ranks[0].cost;
  assert.equal(s.knowledge, 100 - archers);
  assert.ok(upgradeBuilding(s, { uid: b }, { type: "become", to: "gunHall", cost: 0 }).ok);
  const r = respecBuilding(s, { uid: a });
  assert.ok(r.ok && r.kind === "rangedGuild");
  assert.equal(s.knowledge, 100 - 6, "the archers' Knowledge comes back");
  assert.equal(s.smithy.copper, 5, "free");
  assert.deepEqual([s.defend.owned.rangedGuild, s.defend.owned.archerBarracks, s.defend.owned.gunHall], [1, 0, 1]);
  assert.equal(specialtyOf(s.defend.layout, { uid: a }), undefined);
  assert.equal(s.defend.layout.structures.find((st) => st.uid === b)!.kind, "gunHall", "the other building is untouched");
  assert.ok(respecBuilding(s, { uid: b }).ok);
});

test("undoing a node steps the building back to the one it grew from, its Knowledge back", () => {
  const s = fixture("watchTower", 1); s.settings.devMode = false; s.knowledge = 1e7;
  const [a] = uids(s, "watchTower");
  assert.ok(upgradeBuilding(s, { uid: a }, become("wizardTower")).ok);
  wear(s, a, "storm", 3);
  const storm = pathById("storm");
  // Undo Stormcalling II and III, then the wizard tower itself (and the storm tower it became), standing where it is.
  const all = 1e7 - s.knowledge;
  assert.equal(undoRefund("stormTower", { path: "storm", rank: 3 }, "p:storm:2"), storm.ranks[1].cost + storm.ranks[2].cost);
  assert.ok(undoUpgrade(s, { uid: a }, "p:storm:2").ok);
  assert.deepEqual(specialtyOf(s.defend, { uid: a }), { path: "storm", rank: 1 });
  assert.ok(undoUpgrade(s, { uid: a }, "k:wizardTower").ok);
  assert.equal(s.defend.layout.structures.find((st) => st.uid === a)?.kind, "watchTower");
  assert.equal(s.knowledge, 1e7, `every point back (${all} spent)`);
  assert.equal((undoUpgrade(s, { uid: a }, "k:watchTower") as { reason: string }).reason, "Nothing to undo there.", "the basic building can't be undone");
  // A branch's attunement made the hall a phalanx: undoing its first rank leaves a plain phalanx, undoing the attunement a hall again.
  assert.deepEqual(undoTo("phalanx", { path: "testudo", rank: 2 }, "p:testudo:2"), { kind: "phalanx", wear: { path: "testudo", rank: 1 } });
  assert.deepEqual(undoTo("phalanx", { path: "testudo", rank: 2 }, "p:testudo:1"), { kind: "phalanx" });
  assert.deepEqual(undoTo("phalanx", { path: "testudo", rank: 2 }, "k:phalanx"), { kind: "spearHall" });
  assert.equal(undoRefund("phalanx", { path: "testudo", rank: 1 }, "p:testudo:1"), 4);
  assert.equal(undoRefund("phalanx", { path: "testudo", rank: 1 }, "k:phalanx"), 7 + 4);
});

test("the tree puts other buildings beside and below, branches above, and counts hidden and closed branches", () => {
  const plain = buildingTree("watchTower");
  for (const n of plain.filter((o) => o.step?.type === "become")) assert.ok(n.side && n.hidden!.length >= 2, n.id);
  assert.equal(plain.find((o) => o.id === "k:watchTower")!.closed, undefined, "nothing closed off yet");
  const wizard = buildingTree("stormTower", { path: "storm", rank: 1 });
  assert.equal(wizard.find((o) => o.id === "k:watchTower")!.closed!.length, 2, "it passed over the archer and cannon towers");
  assert.equal(wizard.find((o) => o.id === "k:wizardTower")!.closed!.length, 2, "the Pyre and Frost towers");
  assert.ok(wizard.filter((o) => o.path).every((o) => !o.side), "branches carry on up");
  assert.ok(wizard.find((o) => o.id === "k:darkKeep"), "the ultimate waits at the top");
});

test("a copy still in the palette is upgraded and respecced on its own", () => {
  const s = defaults(); s.knowledge = 1e5; s.smithy.copper = 20;
  s.defend.owned.watchTower = 2;
  const pyro = pathById("pyromancy");
  // Plain copy into a wizard tower, then a pyre tower: one copy of each.
  const tower = { copy: "watchTower" as const };
  assert.equal(targetKind(s.defend, tower), "watchTower");
  const step = nextSteps("watchTower").find(st => st.type === "become" && st.to === "wizardTower")!;
  const r = upgradeBuilding(s, tower, step);
  assert.ok(r.ok && r.copy && "copy" in r.copy && r.copy.copy === "wizardTower");
  assert.equal(s.defend.owned.watchTower, 1); assert.equal(s.defend.owned.wizardTower, 1);
  assert.equal(s.knowledge, 1e5 - step.cost);
  const attune = nextSteps("wizardTower").find(st => st.type === "become" && st.to === "pyreTower")!;
  const r1 = upgradeBuilding(s, { copy: "wizardTower" }, attune);
  assert.deepEqual(r1.ok && r1.copy, { copy: "pyreTower" });
  // Up a path: it waits as a kept copy, rank by rank.
  let at: any = { copy: "pyreTower" };
  for (let rank = 1; rank <= 2; rank++) {
    const r2 = upgradeBuilding(s, at, nextSteps("pyreTower", at.wear).find(st => st.type === "path" && st.path === "pyromancy")!);
    assert.ok(r2.ok, (r2 as any).reason); at = (r2 as any).copy;
  }
  assert.deepEqual(at, { copy: "pyreTower", wear: { path: "pyromancy", rank: 2 } });
  assert.deepEqual(keptGroups(s.defend, "pyreTower"), [{ path: "pyromancy", rank: 2, count: 1 }]);
  assert.equal(plainAvailable(s.defend, "pyreTower"), 0);
  assert.equal(s.knowledge, 1e5 - step.cost - attune.cost - pyro.ranks[0].cost - pyro.ranks[1].cost);
  // A copy that isn't there can't be upgraded.
  assert.equal(upgradeBuilding(s, { copy: "wizardTower" }, nextSteps("wizardTower").find(st => st.type === "become" && st.to === "frostTower")!).ok, false);
  // Respec: every point back, a plain watch tower again.
  const back = respecBuilding(s, at);
  assert.ok(back.ok);
  assert.equal(s.knowledge, 1e5);
  assert.equal(s.smithy.copper, 20, "free");
  assert.equal(s.defend.kept.length, 0);
  assert.equal(s.defend.owned.watchTower, 2); assert.equal(s.defend.owned.wizardTower + s.defend.owned.pyreTower, 0);
  assert.equal(respecBuilding(s, { copy: "watchTower" }).ok, false, "nothing to respec");
  assert.ok(hasTree("watchTower") && hasTree("sniperLodge") && hasTree("wallSpikes"));
  assert.ok(!hasTree("cityTile") && !hasTree("cityGate"));
});

test("version 4: building research all comes back as Knowledge; buildings stand plain; evolved ones turn back", () => {
  const s = fixture("wizardTower", 2); s.settings.devMode = false; s.defend.owned.wizardTower = 3;
  const raw: any = JSON.parse(JSON.stringify(s));
  raw.version = 4; raw.knowledge = 100;
  raw.pathResearch = {
    pyromancy: { rank: 2, spent: 4008 }, // worn by a tower
    rime: { rank: 1, spent: 4 }, // worn by nobody
    storm: { rank: 3, spent: 175015, crowned: true }, // a crown, with a keep made from it
    starfall: { rank: 1, spent: 6 }, // a spell: still researched
  };
  raw.defend.owned.darkKeep = 1;
  raw.defend.layout.structures[0].path = "pyromancy";
  raw.researchJob = { kind: "path", id: "crusaders", rank: 0, left: 1000, paid: 4 };
  const loaded = decode(JSON.stringify(raw));
  assert.equal(loaded.version, 7);
  assert.deepEqual(loaded.defend.layout.structures.map((st) => st.path), [undefined, undefined]);
  assert.deepEqual(Object.keys(loaded.pathResearch), ["starfall"]);
  assert.equal(loaded.knowledge, 100 + 4008 + 4 + 175015 + 4, "every building research back, and the research in progress");
  assert.equal(loaded.researchJob, null);
  assert.deepEqual([loaded.defend.owned.darkKeep, loaded.defend.owned.wizardTower], [0, 4], "the keep is a wizard tower again");
  const again = decode(JSON.stringify(loaded));
  assert.equal(again.knowledge, loaded.knowledge, "migrates once");
  assert.deepEqual(again.defend.layout, loaded.defend.layout);
});

test("version 3 cards and version 2 topic paths come back as Knowledge too", () => {
  const s = fixture("wizardTower", 2); s.defend.owned.wizardTower = 3;
  const raw: any = JSON.parse(JSON.stringify(s));
  delete raw.pathResearch; raw.version = 2; raw.knowledge = 0;
  raw.paths = { wizardTower: { path: "rime", rank: 2, spent: 4008 } };
  const loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), [undefined, undefined]);
  assert.equal(loaded.knowledge, 4008);
  const v3: any = JSON.parse(JSON.stringify(s));
  v3.version = 3; v3.knowledge = 0; v3.pathResearch = { pyromancy: { rank: 1, spent: 4 } };
  v3.defend.cards = [{ id: 1, kind: "wizardTower", path: "pyromancy", rank: 1, placement: `structure:${uids(s, "wizardTower")[0]}` }];
  const three = decode(JSON.stringify(v3));
  assert.equal(three.knowledge, 4);
  assert.equal((three.defend as any).cards, undefined);
});

test("malformed paths and ranks are dropped from the saved city", () => {
  const s = fixture("wizardTower", 2);
  const raw: any = JSON.parse(JSON.stringify(s));
  raw.defend.layout.structures[0].path = "assassins"; raw.defend.layout.structures[0].rank = 1;
  raw.defend.layout.structures[1].path = "rime"; raw.defend.layout.structures[1].rank = 7;
  const loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), [undefined, undefined]);
  assert.equal(loaded.defend.layout.structures.length, 2, "the buildings stand");
});

// ── The guilds' troops ──────────────────────────────────────────────────
test("the guilds train brawlers and stone throwers; their branches snipers and musketmen", () => {
  for (const [kind, troop, def] of [["meleeGuild", "brawler", BRAWLER], ["rangedGuild", "slinger", SLINGER], ["sniperLodge", "sniper", SNIPER], ["musketHall", "musketeer", MUSKETEER]] as const) {
    const s = fixture(kind, 1), sim = simulation(s);
    new Barracks().step(sim, 0.01);
    assert.equal(sim.soldiers.length, 1, kind);
    assert.deepEqual([sim.soldiers[0].kind, sim.soldiers[0].maxHp, sim.soldiers[0].damage], [troop, def.hp, def.damage], kind);
  }
});

test("brawlers punch in reach; stone throwers, snipers and musketmen shoot their own shots", () => {
  const m = fixture("meleeGuild", 1), sim = simulation(m);
  new Barracks().step(sim, 0.01);
  const brawler = sim.soldiers[0], e = enemy(sim, brawler.x + 0.5, brawler.y);
  brawler.target = e.id; brawler.cd = 0;
  stepSwordsman(sim, brawler, 0.01);
  assert.equal(e.maxHp - e.hp, BRAWLER.damage);
  assert.equal(brawler.cd, BRAWLER.cooldown);
  for (const [kind, shot, reach] of [["rangedGuild", "stone", SLINGER.range], ["sniperLodge", "bullet", SNIPER.range]] as const) {
    const s = fixture(kind, 1), r = openSight(simulation(s));
    new Barracks().step(r, 0.01);
    const u = r.soldiers[0];
    const far = enemy(r, u.x + reach + 1, u.y);
    stepArcher(r, u, 0.01);
    assert.equal(r.arrows.length, 0, `${kind}: out of reach`);
    r.enemies = []; enemy(r, u.x + reach - 0.5, u.y); u.cd = 0;
    stepArcher(r, u, 0.01);
    assert.equal(r.arrows[0]?.shot, shot, kind);
    assert.ok(far);
  }
  const g = fixture("rocketBattery", 1), gs = openSight(simulation(g));
  new Barracks().step(gs, 0.01);
  const u = gs.soldiers[0], a = enemy(gs, u.x + 2, u.y), b = enemy(gs, u.x + 2.4, u.y);
  stepArcher(gs, u, 0.01);
  assert.equal(gs.arrows[0].blast, ROCKETEER.blast);
  for (let i = 0; i < 60; i++) stepArrows(gs, 1 / 30);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, "the rocket bursts over both");
  assert.ok(u.hp === u.maxHp, "never hurting its own");
});

// ── Paths in battle ─────────────────────────────────────────────────────
test("three Wizard towers cast Fire, Ice and Storm together, beside a plain one, from a persisted save", () => {
  const s = fixture("wizardTower", 4), [a, b, c, plain] = uids(s, "wizardTower");
  wear(s, a, "pyromancy"); wear(s, b, "rime"); wear(s, c, "storm");
  const loaded = decode(JSON.stringify(s));
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), ["pyromancy", "rime", "storm", undefined]);
  const sim = simulation(loaded), w = new Wizards();
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.kind), ["pyreTower", "frostTower", "stormTower", "wizardTower"]);
  for (const b of sim.map.buildings.filter(b => isWizardTower(b.kind))) { const at = center(b.rect); enemy(sim, at.x, at.y - 2); }
  w.step(sim, 0.01);
  assert.equal(sim.flames.length, 2, "Pyromancy's flame and the plain tower's"); assert.equal(sim.frosts.length, 1); assert.ok(sim.bolts.length > 0);
  assert.equal(sim.bonuses.structurePaths![plain], undefined, "the fourth wears nothing");
  assert.equal(sim.bonuses.paths, undefined, "no global specialization leaks between copies");
});

test("a Crusader barracks recruits with its own health and damage, a plain one beside it with its own", () => {
  const s = fixture("barracks", 2), [a] = uids(s, "barracks");
  wear(s, a, "crusaders");
  const sim = simulation(s); new Barracks().step(sim, 0.01);
  const troops = sim.soldiers.filter(s => s.kind === "sword");
  assert.equal(troops.length, 2); assert.equal(troops[0].maxHp, 88); assert.equal(troops[1].maxHp, 40);
  assert.equal(troops[0].damage, 9); assert.equal(troops[1].damage, 6);
});

test("Fire arrows and Sharpshooters on separate towers keep their own projectiles", () => {
  const s = fixture("archerTower", 2), [a, b2] = uids(s, "archerTower");
  wear(s, a, "fireArrows"); wear(s, b2, "sharpshooters");
  const sim = simulation(s), b = sim.map.buildings.filter(b => b.kind === "brazierTower" || b.kind === "hawkTower");
  assert.deepEqual(b.map((t) => t.kind), ["brazierTower", "hawkTower"], "each made its branch's tower on load");
  for (const tower of b) { const at = center(tower.rect); enemy(sim, at.x, at.y - 2); }
  new Towers().step(sim, 0.01);
  const fire = sim.arrows.filter(a => a.origin?.building === b[0].id), sharp = sim.arrows.filter(a => a.origin?.building === b[1].id);
  assert.ok(fire.every(a => a.burn)); assert.equal(sharp.length, 1); assert.equal(sharp[0].burn, undefined);
});

test("Pyromancer and Cryomancer effects retain their own tier after the caster dies", () => {
  const s = fixture("mageGuild", 2), [first, second] = uids(s, "mageGuild");
  wear(s, first, "pyroclasm"); wear(s, second, "cinders");
  const sim = simulation(s); new Barracks().step(sim, 0.01);
  for (const troop of sim.soldiers) enemy(sim, troop.x, troop.y - 1);
  for (const troop of sim.soldiers) stepMage(sim, troop, 0.01);
  assert.equal(sim.fireballs.length, 2);
  assert.ok(sim.fireballs[0].damage > sim.fireballs[1].damage);
  sim.soldiers = []; stepFireballs(sim, 10);
  assert.equal(sim.blazes.length, 1); assert.equal(sim.blazes[0].clingFor, 4); assert.equal(sim.frostBursts.length, 1);
  sim.enemies = [];
  const b = sim.blazes[0], e = enemy(sim, b.x, b.y); stepBlazes(sim, 0.01);
  assert.equal(e.burn, 4, "Pyromancer ground fire keeps its originating clinging tier");
});

test("overlapping watch towers combine their strongest mark and slow without multiplying duplicates", () => {
  // Spare paths since every watch tower became a basic building.
  const s = fixture("watchTower", 2), [first, second] = uids(s, "watchTower");
  spare(s, first, "spotters", 3); spare(s, second, "signalFires", 3);
  const fit = fitLayout(s.defend.layout); assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, battleBonuses(s)), b = sim.map.buildings.find(b => b.kind === "watchTower")!, at = center(b.rect);
  const e = enemy(sim, at.x + 2, at.y); (sim as any).markEnemies();
  assert.equal(e.markDamage, 3); assert.equal(e.slowed, 0.55);
});

test("oil-soaked bait and fortified bait retain separate hit reactions and health", () => {
  const s = fixture("monsterBait", 2), [first, second] = uids(s, "monsterBait");
  wear(s, first, "oilSoaked"); wear(s, second, "fortified");
  const sim = simulation(s), b = sim.map.buildings.filter(b => b.kind === "monsterBait");
  const a = enemy(sim, 1, 1), other = enemy(sim, 2, 1);
  baitBitten(sim, a, 5, b[0]); baitBitten(sim, other, 5, b[1]);
  assert.ok(a.burn); assert.equal(other.burn, undefined);
  assert.ok(sim.maxHp[b[1].id] > sim.maxHp[b[0].id]);
});

test("spells are still researched once in the Study", () => {
  const s = defaults(); s.knowledge = 1e6;
  assert.ok(learnPath(s, "starfall"));
  assert.equal(learnPath(s, "pyromancy"), false);
});

test("version 6: ranks on paths a building can no longer take come back, and ultimates their old price beyond a respec's", () => {
  const s = fixture("watchTower", 2); s.settings.devMode = false;
  const [a, b] = uids(s, "watchTower");
  s.defend.layout.structures.find((st) => st.uid === a)!.path = "spotters";
  s.defend.layout.structures.find((st) => st.uid === a)!.rank = 2;
  s.defend.owned.musketHall = 1; s.defend.owned.heroHall = 1;
  const raw: any = JSON.parse(JSON.stringify(s));
  raw.version = 6; raw.knowledge = 100;
  raw.defend.kept = [{ kind: "musketHall", path: "grenadiers", rank: 1 }];
  const loaded = decode(JSON.stringify(raw));
  assert.equal(loaded.version, 7);
  const spotters = pathById("spotters"), grenadiers = pathById("grenadiers");
  const hero = 100004 - allocated("heroHall");
  assert.ok(hero > 0);
  assert.equal(loaded.knowledge, 100 + spotters.ranks[0].cost + spotters.ranks[1].cost + grenadiers.ranks[0].cost + hero);
  assert.equal(specialtyOf(loaded.defend.layout, { uid: a }), undefined, "the watch tower stands plain");
  assert.equal(specialtyOf(loaded.defend.layout, { uid: b }), undefined);
  assert.deepEqual([loaded.defend.kept, loaded.defend.owned.musketHall, loaded.defend.owned.heroHall], [[], 1, 1]);
  const again = decode(JSON.stringify(loaded));
  assert.equal(again.knowledge, loaded.knowledge, "migrates once");
});

test("saved wizard towers and barracks wearing a branch's path become that branch's building", () => {
  const s = defaults();
  let l = s.defend.layout;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, "barracks", l.keep.tx, l.keep.ty - 1) ?? assert.fail("placement");
  Object.assign(l.structures.at(-1)!, { path: "halberdiers", rank: 2 });
  Object.assign(s.defend.owned, { barracks: 2, wizardTower: 1 });
  const raw = JSON.parse(JSON.stringify({ ...s.defend, layout: l, kept: [{ kind: "wizardTower", path: "rime", rank: 1 }, { kind: "barracks", path: "crusaders", rank: 3 }] }));
  const d = decodeDefendSave(raw);
  assert.deepEqual(d.layout.structures.map((o) => [o.kind, o.path, o.rank]).at(-1), ["halberdYard", "halberdiers", 2]);
  assert.deepEqual(d.kept, [{ kind: "frostTower", path: "rime", rank: 1 }, { kind: "chapterHouse", path: "crusaders", rank: 3 }]);
  assert.deepEqual([d.owned.barracks, d.owned.halberdYard, d.owned.chapterHouse, d.owned.wizardTower, d.owned.frostTower], [0, 1, 1, 0, 1]);
  // A plain one stays as it was.
  assert.equal(decodeDefendSave(JSON.parse(JSON.stringify(s.defend))).owned.barracks, s.defend.owned.barracks);
});
