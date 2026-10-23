// The Ranged Guild's gunner line: the Gunner hall leading to the Musket
// hall (whose Sharpshooters are crowned into the Sniper lodge), the
// Machine-gun nest (whose Belt feed is crowned into the Gatling
// emplacement) and the Rocket battery; their troops in battle; and old
// saves' musket halls and sniper lodges turned back into Ranged Guilds.
import { test } from "node:test";
import { openSight } from "./open-sight.ts";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";
import { BECOMES, allocated, buildingTree, nextSteps, rootOf, specialtyOf, stepName, upgradeBuilding, upgradedFrom, migrateGunLine } from "../src/specializations.ts";
import { BELT_FEED, CLUSTER, DUELISTS, GUN_SHIELD, OVERDRIVE, QUICKDRAW, SALVO, STOPPING, SHARP_MUSKETS, TRIPOD, pathById, type PathId } from "../src/knowledge-paths.ts";
import { studyPathCost } from "../src/economy.ts";
import { bonuses } from "../src/progression.ts";
import { battleBonuses, wear } from "./spare-paths.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout, type PlacedKind } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Barracks, stepArcher } from "../src/defend/troops.ts";
import { stepArrows } from "../src/defend/towers.ts";
import { ENEMIES, GATLING_GUNNER, GUNNER, MACHINE_GUNNER, MUSKETEER, ROCKETEER } from "../src/defend/catalog.ts";
import { cellIndex } from "../src/defend/grid.ts";
import { PATH_LOOKS, structurePixels } from "../src/defend/tower-art.ts";

type S = ReturnType<typeof defaults>;

/** One `kind` beside the keep climbing `path` to `rank`. */
function building(kind: PlacedKind, path?: PathId, rank = 3) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned[kind] = 1;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, kind, l.keep.tx, l.keep.ty - 1) ?? assert.fail("placement");
  s.defend.layout = l;
  const uid = l.structures.find((st) => st.kind === kind)!.uid;
  for (let r = 0; path && r < rank; r++) {
    wear(s, uid, path, r + 1);
  }
  return { s, uid };
}
function battle(s: S, troop: Soldier["kind"]) {
  const fit = fitLayout(s.defend.layout);
  assert.ok(fit.ok);
  const sim = openSight(new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, battleBonuses(s)));
  new Barracks().step(sim, 0.01);
  const m = sim.soldiers.find((u) => u.kind === troop) ?? assert.fail(`a ${troop}`);
  return { sim, m };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
/** One shot from `m`, flown home. */
function fire(sim: DefendSim, m: Soldier) {
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  for (let i = 0; i < 90 && sim.arrows.length; i++) { (sim as any).indexEnemies(); stepArrows(sim, 1 / 30); }
}

// ── The tree ───────────────────────────────────────────────────────────
test("the Ranged Guild leads to gunners, and gunners branch into muskets, machine guns and rockets", () => {
  assert.deepEqual(BECOMES.rangedGuild!.map((b) => b.to), ["archerBarracks", "mageGuild", "gunHall"]);
  // Each branch's attunement makes the hall a building of its own, which then climbs its path.
  assert.deepEqual(nextSteps("gunHall").map(stepName), ["Musket hall", "Machine-gun nest", "Rocket battery"]);
  assert.deepEqual(nextSteps("gunHall").map((s) => s.type), ["become", "become", "become"]);
  assert.deepEqual(nextSteps("gunNest").map(stepName), ["Belt feed I"]);
  assert.deepEqual(nextSteps("gunNest", { path: "beltFeed", rank: 1 }).map(stepName), ["Belt feed II"]);
  assert.deepEqual(nextSteps("gunNest", { path: "beltFeed", rank: 3 }).map(stepName), ["Gatling emplacement"], "maxed, it can merge");
  assert.deepEqual(nextSteps("gatlingNest").map(stepName), ["Gun shield I", "Overdrive I", "Stopping power I"]);
  assert.equal(upgradedFrom("musketHall"), "gunHall");
  assert.equal(upgradedFrom("gatlingNest"), "gunHall", "merged from gunner halls' branches");
  for (const k of ["gunHall", "musketHall", "gunNest", "gatlingNest", "rocketBattery"] as const) assert.equal(rootOf(k), "rangedGuild");
  // A Gatling's Knowledge is all three buildings merged into it.
  const full = (p: "volleyFire" | "beltFeed" | "clusterRockets") => pathById(p).ranks.reduce((n, r) => n + r.cost, 0);
  assert.equal(allocated("gatlingNest"), 3 * 6 + 8 + 10 + 12 + full("volleyFire") + full("beltFeed") + full("clusterRockets"));
  const ids = buildingTree("gatlingNest").map((n) => n.id);
  for (const id of ["k:rangedGuild", "k:gunHall", "p:volleyFire:3", "p:beltFeed:3", "p:clusterRockets:3", "k:gatlingNest"]) assert.ok(ids.includes(id), id);
  assert.equal(allocated("musketHall", { path: "volleyFire", rank: 2 }) - allocated("musketHall"), studyPathCost(4, 0) + studyPathCost(4, 1));
});
test("a Gunner hall is bought up from a Ranged Guild and its Belt feed branch makes a nest", () => {
  const { s, uid } = building("rangedGuild");
  const kind = () => s.defend.layout.structures.find((o) => o.uid === uid)!.kind;
  const step = () => nextSteps(kind(), specialtyOf(s.defend.layout, { uid }));
  assert.ok(upgradeBuilding(s, { uid }, step().find((o) => o.type === "become" && o.to === "gunHall")!).ok);
  assert.ok(upgradeBuilding(s, { uid }, step().find((o) => o.type === "become" && o.to === "gunNest")!).ok);
  assert.deepEqual([kind(), specialtyOf(s.defend.layout, { uid })], ["gunNest", undefined], "attuned, not yet on its path");
  for (let r = 0; r < 3; r++) assert.ok(upgradeBuilding(s, { uid }, step()[0]).ok);
  assert.deepEqual([kind(), specialtyOf(s.defend.layout, { uid })], ["gunNest", { path: "beltFeed", rank: 3 }]);
  // Alone it can't merge: the other two branches are missing.
  const merge = upgradeBuilding(s, { uid }, step()[0]);
  assert.ok(!merge.ok && /Musket hall at Volley fire III and a Rocket battery at Cluster rockets III/.test(merge.reason));
  assert.equal(s.defend.owned.gunNest, 1);
  assert.equal(s.defend.owned.rangedGuild, 0);
});
test("each new hall and path has its own art", () => {
  assert.deepEqual(PATH_LOOKS.gunHall, ["quickdraw", "duelists"]);
  assert.deepEqual(PATH_LOOKS.gunNest, ["beltFeed", "tripod"]);
  assert.deepEqual(PATH_LOOKS.gatlingNest, ["gunShield", "overdrive", "stoppingPower"]);
  assert.deepEqual(PATH_LOOKS.rocketBattery, ["clusterRockets", "salvoRacks"]);
  assert.ok(PATH_LOOKS.musketHall!.includes("sharpMuskets"));
  const art = (["gunHall", "gunNest", "gatlingNest", "rocketBattery"] as const).flatMap((k) => ["", ...PATH_LOOKS[k]!].map((look) => structurePixels(k, 4, 4, 0, 1, look).join()));
  assert.equal(new Set(art).size, art.length);
});

// ── In battle ──────────────────────────────────────────────────────────
test("gunners fire quick pistol shots", () => {
  const { sim, m } = battle(building("gunHall").s, "gunner");
  const e = enemy(sim, m.x + 2, m.y), hp = e.hp;
  fire(sim, m);
  assert.equal(hp - e.hp, m.damage);
  assert.ok(m.cd > GUNNER.cooldown - 0.2 && m.cd <= GUNNER.cooldown);
});

test("plain musket balls no longer burst; Grenadiers' do, and Sharpshooters reach further and hit harder", () => {
  const plain = battle(building("musketHall").s, "musketeer");
  const e = enemy(plain.sim, plain.m.x + 2, plain.m.y), hp = e.hp;
  fire(plain.sim, plain.m);
  assert.equal(hp - e.hp, plain.m.damage);
  assert.equal(plain.sim.effects.filter((f) => f.kind === "boom").length, 0);

  const gren = battle(building("musketHall", "grenadiers", 1).s, "musketeer");
  enemy(gren.sim, gren.m.x + 2, gren.m.y);
  fire(gren.sim, gren.m);
  assert.equal(gren.sim.effects.filter((f) => f.kind === "boom").length, 1);

  const sharp = battle(building("musketHall", "sharpMuskets", 3).s, "musketeer");
  const reach = MUSKETEER.range + SHARP_MUSKETS.range[3];
  const far = enemy(sharp.sim, sharp.m.x + reach - 0.2, sharp.m.y), small = enemy(sharp.sim, sharp.m.x + 1, sharp.m.y, 10);
  sharp.m.cd = 0;
  stepArcher(sharp.sim, sharp.m, 1 / 30);
  assert.equal(sharp.sim.arrows.length, 1);
  assert.equal(sharp.sim.arrows[0].target, far.id, "the toughest in reach, past the nearest");
  assert.equal(sharp.sim.arrows[0].damage, sharp.m.damage * SHARP_MUSKETS.damage[3]);
  assert.ok(small);
});

test("machine gunners reload quickly, faster on Belt feed; Gatlings faster still but slow on their feet", () => {
  const plain = battle(building("gunNest").s, "machineGunner");
  enemy(plain.sim, plain.m.x + 2, plain.m.y);
  plain.m.cd = 0;
  stepArcher(plain.sim, plain.m, 1 / 30);
  assert.equal(plain.m.cd, MACHINE_GUNNER.cooldown);
  const belt = battle(building("gunNest", "beltFeed", 3).s, "machineGunner");
  enemy(belt.sim, belt.m.x + 2, belt.m.y);
  belt.m.cd = 0;
  stepArcher(belt.sim, belt.m, 1 / 30);
  assert.equal(belt.m.cd, MACHINE_GUNNER.cooldown * BELT_FEED.reload[3]);
  assert.equal(belt.sim.arrows[0].damage, belt.m.damage * BELT_FEED.damage);

  const g = battle(building("gatlingNest").s, "gatlingGunner");
  enemy(g.sim, g.m.x + 2, g.m.y);
  g.m.cd = 0;
  stepArcher(g.sim, g.m, 1 / 30);
  assert.equal(g.m.cd, GATLING_GUNNER.cooldown);
  assert.ok(GATLING_GUNNER.cooldown < MACHINE_GUNNER.cooldown * BELT_FEED.reload[3]);
  assert.ok(GATLING_GUNNER.speed < MACHINE_GUNNER.speed / 2);
});

test("rockets reload slowly and burst, hurting everything round where they land", () => {
  const { sim, m } = battle(building("rocketBattery").s, "rocketeer");
  const e = enemy(sim, m.x + 3, m.y), near = enemy(sim, m.x + 3.6, m.y + 0.4);
  const [a, b] = [e.hp, near.hp];
  fire(sim, m);
  assert.ok(e.hp < a && near.hp < b, "both caught in the burst");
  assert.equal(sim.effects.filter((f) => f.kind === "boom").length, 1);
  assert.ok(ROCKETEER.cooldown > MUSKETEER.cooldown * 2);
});

test("Quickdraw reloads gunners faster and fires a second pistol; Duelists reach further, every 3rd shot critical", () => {
  const quick = battle(building("gunHall", "quickdraw", 3).s, "gunner");
  const a = enemy(quick.sim, quick.m.x + 1, quick.m.y), b = enemy(quick.sim, quick.m.x + 2, quick.m.y);
  quick.m.cd = 0;
  stepArcher(quick.sim, quick.m, 1 / 30);
  assert.equal(quick.m.cd, GUNNER.cooldown * QUICKDRAW.reload[3]);
  assert.deepEqual(quick.sim.arrows.map((x) => x.target), [a.id, b.id]);

  const duel = battle(building("gunHall", "duelists", 3).s, "gunner");
  const far = enemy(duel.sim, duel.m.x + GUNNER.range + DUELISTS.range[3] - 0.2, duel.m.y);
  const hits: number[] = [];
  for (let i = 0; i < 3; i++) { duel.m.cd = 0; duel.sim.arrows.length = 0; stepArcher(duel.sim, duel.m, 1 / 30); hits.push(duel.sim.arrows[0]?.damage ?? 0); }
  assert.equal(duel.sim.arrows[0].target, far.id, "in reach past the plain range");
  const shot = duel.m.damage * DUELISTS.damage[3];
  assert.deepEqual(hits, [shot, shot, shot * DUELISTS.crit]);
  // Off the path no count is kept.
  assert.equal(battle(building("gunHall").s, "gunner").m.strikes, undefined);
});

test("Tripod gives machine gunners reach and harder bullets", () => {
  const t = battle(building("gunNest", "tripod", 3).s, "machineGunner");
  enemy(t.sim, t.m.x + MACHINE_GUNNER.range + TRIPOD.range[3] - 0.2, t.m.y);
  t.m.cd = 0;
  stepArcher(t.sim, t.m, 1 / 30);
  assert.equal(t.sim.arrows.length, 1);
  assert.equal(t.sim.arrows[0].damage, t.m.damage * TRIPOD.damage[3]);
});

test("Gun shield toughens and speeds Gatling gunners; Overdrive cranks faster and harder, with no push", () => {
  const plain = battle(building("gatlingNest").s, "gatlingGunner").m;
  const shield = battle(building("gatlingNest", "gunShield", 3).s, "gatlingGunner").m;
  assert.equal(shield.maxHp, plain.maxHp * GUN_SHIELD.hp[3]);
  const over = battle(building("gatlingNest", "overdrive", 3).s, "gatlingGunner");
  const target = enemy(over.sim, over.m.x + 2, over.m.y), at = target.x;
  over.m.cd = 0;
  stepArcher(over.sim, over.m, 1 / 30);
  assert.equal(over.m.cd, GATLING_GUNNER.cooldown * OVERDRIVE.reload[3]);
  assert.equal(over.sim.arrows[0].damage, over.m.damage * OVERDRIVE.damage[3]);
  assert.equal(over.sim.arrows[0].knock, undefined, "no push");
  fire(over.sim, over.m);
  assert.equal(target.x, at);
});

test("Stopping power knocks enemies back, hard, for little damage, but not bosses", () => {
  const stop = battle(building("gatlingNest", "stoppingPower", 3).s, "gatlingGunner");
  // Open street east of the gun, so nothing stops the push.
  for (let i = 0; i <= 6; i++) { const c = cellIndex(Math.floor(stop.m.x) + i, Math.floor(stop.m.y)); stop.sim.solid[c] = 0; }
  const e = enemy(stop.sim, stop.m.x + 2, stop.m.y), x = e.x, hp = e.hp;
  fire(stop.sim, stop.m);
  assert.equal(hp - e.hp, stop.m.damage * STOPPING.damage[3]);
  assert.ok(Math.abs(e.x - (x + STOPPING.push[3])) < 1e-9, `pushed ${e.x - x}`);
  assert.ok(Math.abs(e.y - stop.m.y) < 1e-9, "straight back");
  // A boss stands firm.
  const boss = enemy(stop.sim, stop.m.x + 2, stop.m.y + 0.01);
  boss.kind = (Object.keys(ENEMIES) as (keyof typeof ENEMIES)[]).find((k) => ENEMIES[k].boss)!;
  e.hp = 0; (stop.sim as any).indexEnemies();
  const bx = boss.x;
  fire(stop.sim, stop.m);
  assert.equal(boss.x, bx);
  // A wall stops the push.
  const w = enemy(stop.sim, stop.m.x + 2, stop.m.y);
  boss.hp = 0;
  stop.sim.solid[cellIndex(Math.floor(w.x + 0.3), Math.floor(w.y))] = 1;
  (stop.sim as any).indexEnemies();
  const wx = w.x;
  fire(stop.sim, stop.m);
  assert.ok(w.x - wx < STOPPING.push[3], "held by the wall");
});

test("Cluster rockets burst wider with bomblets and fire; Salvo racks loose more rockets", () => {
  const c = battle(building("rocketBattery", "clusterRockets", 3).s, "rocketeer");
  enemy(c.sim, c.m.x + 3, c.m.y);
  c.m.cd = 0;
  stepArcher(c.sim, c.m, 1 / 30);
  assert.equal(c.sim.arrows[0].blast, ROCKETEER.blast + CLUSTER.blast[3]);
  assert.equal(c.sim.arrows[0].grenade?.bomblets, CLUSTER.bomblets[3]);
  c.sim.arrows.length = 0;
  fire(c.sim, c.m);
  assert.equal(c.sim.effects.filter((f) => f.kind === "boom").length, 1 + CLUSTER.bomblets[3]);
  assert.equal(c.sim.blazes.length, 1);
  // At II the bomblets but no fire.
  const two = battle(building("rocketBattery", "clusterRockets", 2).s, "rocketeer");
  enemy(two.sim, two.m.x + 3, two.m.y);
  fire(two.sim, two.m);
  assert.equal(two.sim.blazes.length, 0);

  const s = battle(building("rocketBattery", "salvoRacks", 3).s, "rocketeer");
  for (let i = 0; i < 4; i++) enemy(s.sim, s.m.x + 2 + i * 0.5, s.m.y);
  s.m.cd = 0;
  stepArcher(s.sim, s.m, 1 / 30);
  assert.equal(s.sim.arrows.length, SALVO.rockets[3]);
  assert.equal(s.m.cd, ROCKETEER.cooldown * SALVO.reload[3]);
});

// ── Older saves ────────────────────────────────────────────────────────
test("old saves' musket halls and sniper lodges turn back into Ranged Guilds, their Knowledge refunded", () => {
  const { s } = building("musketHall", "volleyFire", 2);
  s.defend.owned.sniperLodge = 2;
  s.defend.kept.push({ kind: "sniperLodge", path: "marksmen", rank: 1 });
  s.knowledge = 0;
  const guilds = s.defend.owned.rangedGuild;
  migrateGunLine(s);
  assert.equal(s.knowledge, 10 + studyPathCost(4, 0) + studyPathCost(4, 1) + 2 * 8 + studyPathCost(4, 0));
  assert.equal(s.defend.owned.rangedGuild, guilds + 3);
  assert.equal(s.defend.owned.musketHall + s.defend.owned.sniperLodge, 0);
  assert.equal(s.defend.layout.structures.some((st) => st.kind === "musketHall"), false);
  assert.equal(s.defend.kept.length, 0);

  // Loading: only saves from before version 6 migrate.
  const raw = (version: number) => JSON.stringify({ ...JSON.parse(JSON.stringify(building("musketHall").s)), version, knowledge: 0 });
  assert.equal(decode(raw(5)).defend.owned.musketHall, 0);
  assert.equal(decode(raw(6)).defend.owned.musketHall, 1);
});
