// C4 nanobots, the cannon tower's ultimate: harmless shells bursting into
// clouds of nanobots, every enemy in a cloud infected and exploding as it
// dies, and its shared upgrades (blast range, cloud size, a chance a dying
// host sets free a new cloud).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";
import { buildingTree, fullTree, nextSteps, rootOf, specialtyOf, stepName, upgradeBuilding, upgradedFrom } from "../src/specializations.ts";
import { NANO_BLAST, NANO_CLOUD, NANO_PATHS, NANO_REPLICATE, decodeNanoRanks, nanoAllocated, respecNano, upgradeNano } from "../src/nanobot-upgrades.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { NANO_TOWER, STRUCTURES, cannonDamage } from "../src/defend/catalog.ts";
import { Towers } from "../src/defend/towers.ts";
import { stepNano } from "../src/defend/nanobots.ts";
import { structurePixels } from "../src/defend/tower-art.ts";
import { graftedGraph, kindStats } from "../src/ui/specialty.ts";
import { reachOf } from "../src/defend/inspect.ts";
import { center } from "../src/defend/pathing.ts";

type S = ReturnType<typeof defaults>;

/** A C4 nanobots beside the keep, its shared tree at `ranks`. */
function bunker(ranks: S["defend"]["nanoRanks"] = undefined) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned.nanoTower = 1;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, "nanoTower", l.keep.tx, l.keep.ty - 1) ?? assert.fail("placement");
  s.defend.layout = l;
  if (ranks) s.defend.nanoRanks = ranks;
  return s;
}
function battle(s: S) {
  const fit = fitLayout(s.defend.layout);
  assert.ok(fit.ok, fit.ok ? "" : fit.reason);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
  const b = sim.map.buildings.find((o) => o.kind === "nanoTower") ?? assert.fail("no tower");
  return { sim, b, c: center(b.rect) };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
/** Steps nanobots alone until its shells have landed. */
function land(sim: DefendSim) {
  for (let i = 0; i < 400 && sim.nanoShells.length; i++) stepNano(sim, 1 / 30);
}

// ── The tree ───────────────────────────────────────────────────────────
test("C4 nanobots is the cannon tower's ultimate, merged from cannon towers maxed on different branches", () => {
  assert.deepEqual(nextSteps("cannonTower", { path: "siegeShot", rank: 3 }).map(stepName), ["C4 nanobots"]);
  assert.deepEqual(nextSteps("cannonTower", { path: "gunnery", rank: 3 }).map(stepName), ["C4 nanobots"]);
  assert.deepEqual(nextSteps("nanoTower"), [], "its upgrades are a shared tree, not paths");
  assert.equal(upgradedFrom("nanoTower"), "cannonTower");
  assert.equal(rootOf("nanoTower"), "watchTower");
  const ids = buildingTree("nanoTower").map((n) => n.id);
  for (const id of ["k:watchTower", "k:cannonTower", "p:gunnery:3", "p:siegeShot:3", "k:nanoTower"]) assert.ok(ids.includes(id), id);
  assert.ok(!buildingTree("cannonTower").some((n) => n.soon), "no longer an ultimate to come");
  assert.ok(fullTree("watchTower").some((n) => n.id === "k:nanoTower"), "on the line's upgrade map");
  assert.deepEqual([STRUCTURES.nanoTower.w, STRUCTURES.nanoTower.h], [6, 6], "3 × 3 quarter tiles");
});

test("maxed cannon towers merge into C4 nanobots; the save keeps it", () => {
  const s = defaults(); s.settings.devMode = true;
  Object.assign(s.defend.owned, { batteryTower: 1, mortarTower: 1, minelayerTower: 1 });
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, "batteryTower", l.keep.tx, l.keep.ty - 1)!;
  const placed = l.structures.find((o) => o.kind === "batteryTower")!, uid = placed.uid;
  placed.path = "gunnery";
  placed.rank = 3;
  s.defend.layout = l;
  s.defend.kept.push({ kind: "mortarTower", path: "siegeShot", rank: 3 });
  const missing = nextSteps("batteryTower", specialtyOf(s.defend.layout, { uid })).find(o => o.type === "merge")!;
  assert.equal(upgradeBuilding(s, { uid }, missing).ok, false, "Minelayer is required for new merges");
  s.defend.kept.push({ kind: "minelayerTower", path: "minelaying", rank: 3 });
  const merge = nextSteps("batteryTower", specialtyOf(s.defend.layout, { uid })).find((o) => o.type === "merge")!;
  const r = upgradeBuilding(s, { uid }, merge);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  assert.equal(s.defend.owned.nanoTower, 1);
  assert.deepEqual([s.defend.owned.batteryTower, s.defend.owned.mortarTower, s.defend.owned.minelayerTower], [0, 0, 0]);
  assert.deepEqual(s.defend.kept, [], "both other branches are used up");
  assert.ok(!s.defend.layout.structures.some((o) => o.kind === "batteryTower"));
  assert.equal(decode(JSON.stringify(s)).defend.owned.nanoTower, 1);
});

test("its shared tree: three branches, all climbed side by side, Replication 0 to 5% in 1% steps", () => {
  assert.deepEqual(NANO_PATHS.map((p) => p.id), ["blast", "cloud", "replicate"]);
  assert.deepEqual(NANO_REPLICATE.chance, [0, 0.01, 0.02, 0.03, 0.04, 0.05]);
  const s = bunker();
  for (const p of NANO_PATHS) for (let i = 0; i < p.ranks.length; i++) assert.ok(upgradeNano(s, p.id).ok, `${p.id} ${i + 1}`);
  assert.equal(upgradeNano(s, "replicate").ok, false, "5% is the most");
  assert.deepEqual(s.defend.nanoRanks, { blast: 3, cloud: 3, replicate: 5 });
  assert.deepEqual(decode(JSON.stringify(s)).defend.nanoRanks, s.defend.nanoRanks);
  assert.equal(decodeNanoRanks({ replicate: 9 }), undefined, "nonsense is dropped");
  assert.deepEqual(bonuses(s).nano, s.defend.nanoRanks);
  const ids = graftedGraph(s, "nanoTower").map((n) => n.id);
  for (const id of ["k:nanoTower", "q:blast:3", "q:cloud:3", "q:replicate:5"]) assert.ok(ids.includes(id), id);
  assert.match(kindStats(s, "nanoTower"), /cloud 5 cells round.*blast 3\.2 cells round.*5% chance/);
  s.settings.devMode = false;
  const before = s.knowledge, spent = nanoAllocated(s.defend.nanoRanks);
  assert.ok(respecNano(s).ok);
  assert.equal(s.defend.nanoRanks, undefined);
  assert.equal(s.knowledge, before + spent);
  assert.match(kindStats(bunker(), "nanoTower"), /^A harmless shell every 16s · 30 range/);
});

test("the bunker has its own art and a long reach when tapped", () => {
  const art = structurePixels("nanoTower", 6, 6, 0, 1).join();
  assert.notEqual(art, structurePixels("cannonTower", 6, 6, 0, 1).join());
  assert.notEqual(art, structurePixels("nanoTower", 6, 6, 2, 1).join(), "it takes damage");
  const { sim, b } = battle(bunker());
  assert.equal(reachOf(b, sim)[0].r, NANO_TOWER.range);
});

// ── In battle ──────────────────────────────────────────────────────────
test("it fires very slowly from very far, and its shell does no harm", () => {
  const { sim, c } = battle(bunker());
  const towers = new Towers();
  const far = enemy(sim, c.x + 25, c.y);
  towers.step(sim, 1 / 30);
  assert.equal(sim.nanoShells.length, 1, "a shell at an enemy 25 cells off");
  towers.step(sim, 1 / 30);
  assert.equal(sim.nanoShells.length, 1, "and none again for a long while");
  assert.ok(((towers.cooldown.get(sim.map.buildings.find((o) => o.kind === "nanoTower")!.id)) ?? 0) > 10);
  land(sim);
  assert.equal(far.hp, far.maxHp, "the shell is harmless");
  assert.ok(far.nano, "but the cloud infects it");
  assert.equal(sim.nanoClouds.length, 1);
});

test("the cloud infects everyone in it while it hangs, and only them", () => {
  const { sim, c } = battle(bunker());
  const mark = enemy(sim, c.x + 12, c.y), inside = enemy(sim, c.x + 12, c.y + NANO_CLOUD.radius[0] - 0.3), outside = enemy(sim, c.x + 12, c.y + NANO_CLOUD.radius[0] + 1);
  new Towers().step(sim, 1 / 30);
  land(sim);
  assert.ok(mark.nano && inside.nano);
  assert.equal(outside.nano, undefined);
  // Walking into the cloud before it thins infects too.
  outside.y = c.y + 1;
  (sim as any).indexEnemies();
  stepNano(sim, 1 / 30);
  assert.ok(outside.nano);
  for (let i = 0; i < NANO_TOWER.life * 30 + 2; i++) stepNano(sim, 1 / 30);
  assert.equal(sim.nanoClouds.length, 0, "it thins away");
});

test("an infected enemy explodes as it dies, and the blast sets off the infected round it", () => {
  const s = bunker();
  const { sim, c } = battle(s);
  const a = enemy(sim, c.x + 12, c.y, 10), b = enemy(sim, c.x + 13, c.y, 10), far = enemy(sim, c.x + 12 + NANO_BLAST.radius[0] + 1, c.y, 1e6);
  const clean = enemy(sim, c.x + 12, c.y + 0.5, 1e6);
  new Towers().step(sim, 1 / 30);
  land(sim);
  assert.ok(a.nano && b.nano);
  delete clean.nano;
  sim.nanoClouds = [];
  sim.hurtEnemy(a, 100);
  (sim as any).sweepAway();
  assert.equal(sim.nanoBursts.length, 1, "the dead host waits to burst");
  stepNano(sim, 1 / 30);
  const damage = cannonDamage(0) * NANO_TOWER.blast;
  assert.ok(clean.maxHp - clean.hp > damage * 0.6, "the blast hurts the enemies round it");
  assert.equal(far.hp, far.maxHp, "but not beyond its reach");
  assert.ok(b.hp <= 0, "a second host dies in it…");
  (sim as any).sweepAway();
  assert.equal(sim.nanoBursts.length, 1, "…and bursts in turn");
});

test("Replication: a dying host may set free a new cloud, drawing chance only once bought", () => {
  for (const [ranks, clouds] of [[undefined, 0], [{ replicate: 5 }, -1]] as const) {
    const { sim, c } = battle(bunker(ranks as S["defend"]["nanoRanks"]));
    let draws = 0;
    const rand = sim.rand.bind(sim);
    (sim as any).rand = () => (draws++, rand());
    for (let i = 0; i < 200; i++) sim.nanoBursts.push({ x: c.x + 12, y: c.y, r: 0.1, damage: 1, chance: sim.bonuses.nano ? NANO_REPLICATE.chance[5] : 0, origin: { x: c.x, y: c.y, building: 0 } });
    // Each blast draws twice for its look (`explode`).
    const explodes = 400;
    stepNano(sim, 1 / 30);
    if (clouds === 0) {
      assert.equal(sim.nanoClouds.length, 0);
      assert.equal(draws, explodes, "only the blasts' own draws");
    } else {
      assert.ok(sim.nanoClouds.length >= 1 && sim.nanoClouds.length <= 30, `${sim.nanoClouds.length} new clouds from 200 hosts at 5%`);
      assert.equal(draws, explodes + 200, "and one more a host for its chance");
    }
  }
});

test("bigger blast and cloud with their ranks", () => {
  const { sim, c } = battle(bunker({ cloud: 3, blast: 3 }));
  enemy(sim, c.x + 12, c.y);
  new Towers().step(sim, 1 / 30);
  land(sim);
  assert.equal(sim.nanoClouds[0].r, NANO_CLOUD.radius[3]);
  assert.equal(sim.enemies[0].nano!.r, NANO_BLAST.radius[3]);
});
