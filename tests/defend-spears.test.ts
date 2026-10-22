// The Melee Guild's spearmen line: the Spearmen hall leading to the
// Phalanx, the Javelin camp and the Lancer stable (whose Winged lancers are
// crowned into the Valkyrie palace, no longer the Crusaders'); their troops
// and paths in battle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";
import { BECOMES, allocated, buildingTree, nextSteps, rootOf, specialtyOf, stepName, upgradeBuilding, upgradedFrom } from "../src/specializations.ts";
import { BARBED, HEAVY_LANCE, LONG_SPEARS, SET_SPEARS, SPEAR_WALL, TESTUDO, THROWING, WINGED, pathById, type PathId } from "../src/knowledge-paths.ts";
import { bonuses } from "../src/progression.ts";
import { battleBonuses, wear } from "./spare-paths.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout, type PlacedKind } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Barracks, stepArcher, stepSwordsman } from "../src/defend/troops.ts";
import { stepArrows } from "../src/defend/towers.ts";
import { HOPLITE, JAVELINEER, LANCER, SPEARMAN, type EnemyKind } from "../src/defend/catalog.ts";
import { spearSpeed } from "../src/defend/spears.ts";
import { PATH_LOOKS, structurePixels } from "../src/defend/tower-art.ts";
import { kindStats } from "../src/ui/specialty.ts";

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
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, battleBonuses(s));
  new Barracks().step(sim, 0.01);
  const m = sim.soldiers.find((u) => u.kind === troop) ?? assert.fail(`a ${troop}`);
  return { sim, m };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6, kind: EnemyKind = "orc") {
  const e: Enemy = { id: sim.newId(), kind, x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
/** One thrust of melee troop `m` at `e`. */
function thrust(sim: DefendSim, m: Soldier, e: Enemy) {
  m.cd = 0;
  m.target = e.id;
  stepSwordsman(sim, m, 1 / 30);
}
/** One throw from `m`, flown home. */
function fire(sim: DefendSim, m: Soldier) {
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  for (let i = 0; i < 90 && sim.arrows.length; i++) { (sim as any).indexEnemies(); stepArrows(sim, 1 / 30); }
}

// ── The tree ───────────────────────────────────────────────────────────
test("the Melee Guild leads to spearmen, and spearmen branch into a phalanx, javelins and lancers", () => {
  assert.deepEqual(BECOMES.meleeGuild!.map((b) => b.to), ["barracks", "assassinDen", "spearHall"]);
  assert.deepEqual(nextSteps("spearHall").map(stepName), ["Phalanx", "Javelin camp", "Lancer stable"]);
  assert.deepEqual(nextSteps("spearHall").map((s) => s.type), ["become", "become", "become"]);
  assert.deepEqual(nextSteps("lancerStable").map(stepName), ["Winged lancers I"]);
  assert.deepEqual(nextSteps("phalanx", { path: "testudo", rank: 1 }).map(stepName), ["Testudo II"]);
  assert.deepEqual(nextSteps("javelinCamp", { path: "barbed", rank: 2 }).map(stepName), ["Barbed javelins III"]);
  for (const k of ["phalanx", "javelinCamp", "lancerStable"] as const) assert.equal(upgradedFrom(k), "spearHall");
  for (const k of ["spearHall", "phalanx", "javelinCamp", "lancerStable", "valkyriePalace"] as const) assert.equal(rootOf(k), "meleeGuild");
});

test("the Valkyrie palace is the spearmen's ultimate, merged from a maxed phalanx, javelin camp and lancer stable", () => {
  assert.equal(upgradedFrom("valkyriePalace"), "spearHall");
  assert.deepEqual(nextSteps("barracks", { path: "crusaders", rank: 3 }).map(stepName), ["Hero"]);
  assert.deepEqual(nextSteps("lancerStable", { path: "wingedLancers", rank: 3 }).map(stepName), ["Valkyrie palace"]);
  const full = (p: PathId) => pathById(p).ranks.reduce((n, r) => n + r.cost, 0);
  assert.equal(allocated("valkyriePalace"), 3 * 5 + 7 + 8 + 10 + full("testudo") + full("barbed") + full("wingedLancers"));
  const ids = buildingTree("valkyriePalace").map((n) => n.id);
  for (const id of ["k:meleeGuild", "k:spearHall", "p:testudo:3", "p:barbed:3", "p:wingedLancers:3", "k:valkyriePalace"]) assert.ok(ids.includes(id), id);
  // A save with a palace still loads it.
  const s = defaults(); s.defend.owned.valkyriePalace = 2;
  assert.equal(decode(JSON.stringify(s)).defend.owned.valkyriePalace, 2);
});

test("a Melee Guild is bought up through spearmen and lancers, then merged into a Valkyrie palace", () => {
  const { s, uid } = building("meleeGuild");
  const kind = () => s.defend.layout.structures.find((o) => o.uid === uid)?.kind;
  const steps = () => nextSteps(kind()!, specialtyOf(s.defend.layout, { uid }));
  assert.ok(upgradeBuilding(s, { uid }, steps().find((o) => o.type === "become" && o.to === "spearHall")!).ok);
  assert.ok(upgradeBuilding(s, { uid }, steps().find((o) => o.type === "become" && o.to === "lancerStable")!).ok);
  for (let r = 0; r < 3; r++) assert.ok(upgradeBuilding(s, { uid }, steps()[0]).ok);
  assert.deepEqual(specialtyOf(s.defend.layout, { uid }), { path: "wingedLancers", rank: 3 });
  // The phalanx and the javelin camp wait maxed in the palette.
  s.defend.owned.phalanx = 1; s.defend.owned.javelinCamp = 1;
  s.defend.kept.push({ kind: "phalanx", path: "testudo", rank: 3 }, { kind: "javelinCamp", path: "barbed", rank: 3 });
  assert.ok(upgradeBuilding(s, { uid }, steps()[0]).ok);
  assert.deepEqual([s.defend.owned.valkyriePalace, s.defend.owned.lancerStable, s.defend.owned.phalanx, s.defend.owned.javelinCamp, s.defend.owned.meleeGuild], [1, 0, 0, 0, 0]);
});

test("each new hall and path has its own art and stats", () => {
  assert.deepEqual(PATH_LOOKS.spearHall, ["longSpears", "setSpears"]);
  assert.deepEqual(PATH_LOOKS.phalanx, ["testudo", "spearWall"]);
  assert.deepEqual(PATH_LOOKS.javelinCamp, ["barbed", "throwingArms"]);
  assert.deepEqual(PATH_LOOKS.lancerStable, ["heavyLance", "wingedLancers"]);
  const kinds = ["spearHall", "phalanx", "javelinCamp", "lancerStable"] as const;
  const art = kinds.flatMap((k) => ["", ...PATH_LOOKS[k]!].map((look) => structurePixels(k, 4, 4, 0, 1, look).join()));
  assert.equal(new Set(art).size, art.length);
  for (const k of kinds) assert.match(kindStats(defaults(), k), /^Recruits: /);
  assert.match(kindStats(defaults(), "phalanx", "testudo", 1), /takes 45% of every blow/);
});

// ── In battle ──────────────────────────────────────────────────────────
test("spearmen strike from further off than swordsmen; Long spears run through to the enemy behind", () => {
  const { sim, m } = battle(building("spearHall").s, "spearman");
  const e = enemy(sim, m.x + 1.3, m.y), hp = e.hp;
  thrust(sim, m, e);
  assert.equal(hp - e.hp, m.damage, "a spear's length away");
  assert.ok(SPEARMAN.reach > 0.75 + 0.3);

  const long = battle(building("spearHall", "longSpears", 2).s, "spearman");
  const a = enemy(long.sim, long.m.x + 1.2, long.m.y), b = enemy(long.sim, long.m.x + 2.2, long.m.y), side = enemy(long.sim, long.m.x + 0.6, long.m.y + 1);
  const [ha, hb, hs] = [a.hp, b.hp, side.hp];
  thrust(long.sim, long.m, a);
  assert.equal(ha - a.hp, long.m.damage);
  assert.equal(hb - b.hp, long.m.damage * LONG_SPEARS.share[2], "the one behind");
  assert.equal(hs - side.hp, 0, "not the one beside");
});

test("Set spears hit the unhurt harder and stagger", () => {
  const { sim, m } = battle(building("spearHall", "setSpears", 2).s, "spearman");
  const e = enemy(sim, m.x + 1, m.y);
  thrust(sim, m, e);
  assert.equal(e.maxHp - e.hp, m.damage * SET_SPEARS.fresh[2]);
  assert.equal(e.stagger, SET_SPEARS.stagger);
  const before = e.hp;
  thrust(sim, m, e);
  assert.equal(before - e.hp, m.damage, "no longer unhurt");
});

test("hoplites take a share of every blow, less in a testudo, and hold the line", () => {
  const plain = battle(building("phalanx").s, "hoplite");
  assert.equal(plain.sim.hurtDefender(plain.m, 10), 10 * HOPLITE.guard);
  const t = battle(building("phalanx", "testudo", 3).s, "hoplite");
  const h = t.m, hp = h.hp;
  t.sim.hurtDefender(h, 10);
  assert.ok(Math.abs(hp - h.hp - 10 * HOPLITE.guard * TESTUDO.guard[3]) < 1e-9);
  // A comrade beside it takes another tenth off.
  t.sim.soldiers.push({ ...h, id: t.sim.newId(), x: h.x + 1, hp: h.maxHp });
  const before = h.hp;
  t.sim.hurtDefender(h, 10);
  assert.ok(Math.abs(before - h.hp - 10 * HOPLITE.guard * TESTUDO.guard[3] * (1 - TESTUDO.ally)) < 1e-9);
  // Hold the line: enemies within reach are slowed.
  const e = enemy(t.sim, h.x + 0.8, h.y);
  thrust(t.sim, h, e);
  assert.ok((e.chill ?? 0) > 0);
  // Others are untouched by the guard.
  const sword = { ...h, kind: "sword" as const, hp: 100, maxHp: 100 };
  assert.equal(t.sim.hurtDefender(sword, 10), 10);
});

test("Spear wall strikes every enemy within a hoplite's reach", () => {
  const { sim, m } = battle(building("phalanx", "spearWall", 2).s, "hoplite");
  const a = enemy(sim, m.x + 0.8, m.y), b = enemy(sim, m.x, m.y + 0.9), far = enemy(sim, m.x + 3, m.y);
  thrust(sim, m, a);
  const hit = m.damage * SPEAR_WALL.damage[2];
  assert.ok(Math.abs(a.maxHp - a.hp - hit) < 1e-6);
  assert.ok(Math.abs(b.maxHp - b.hp - hit * SPEAR_WALL.share[2]) < 1e-6);
  assert.equal(far.hp, far.maxHp);
});

test("lancers charge each new enemy; Heavy lance staggers and tramples; Winged lancers ride faster and heal", () => {
  const { sim, m } = battle(building("lancerStable").s, "lancer");
  const e = enemy(sim, m.x + 0.8, m.y), o = enemy(sim, m.x, m.y + 0.8);
  thrust(sim, m, e);
  assert.equal(e.maxHp - e.hp, m.damage * LANCER.charge);
  const before = e.hp;
  thrust(sim, m, e);
  assert.equal(before - e.hp, m.damage, "only the first thrust charges");
  thrust(sim, m, o);
  assert.equal(o.maxHp - o.hp, m.damage * LANCER.charge, "a new enemy is charged again");

  const heavy = battle(building("lancerStable", "heavyLance", 3).s, "lancer");
  const t = enemy(heavy.sim, heavy.m.x + 0.8, heavy.m.y), by = enemy(heavy.sim, heavy.m.x + 1.3, heavy.m.y + 0.4);
  thrust(heavy.sim, heavy.m, t);
  const charge = heavy.m.damage * HEAVY_LANCE.charge[3];
  assert.equal(t.maxHp - t.hp, charge);
  assert.equal(t.stagger, HEAVY_LANCE.stagger);
  assert.equal(by.maxHp - by.hp, charge * HEAVY_LANCE.share, "trampled");

  const winged = battle(building("lancerStable", "wingedLancers", 3).s, "lancer");
  assert.equal(spearSpeed(winged.sim, winged.m as Soldier & { kind: "lancer" }), LANCER.speed * WINGED.speed[3]);
  winged.m.hp = winged.m.maxHp / 2;
  thrust(winged.sim, winged.m, enemy(winged.sim, winged.m.x + 0.8, winged.m.y));
  assert.equal(winged.m.hp, winged.m.maxHp * (0.5 + WINGED.heal));
  // Off the paths no lance is remembered.
  assert.equal(battle(building("spearHall").s, "spearman").m.lanced, undefined);
});

test("javelineers throw heavy javelins; barbs hold, boar spears hit big game, throwing arms throw two", () => {
  const { sim, m } = battle(building("javelinCamp").s, "javelineer");
  const e = enemy(sim, m.x + 3, m.y);
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  assert.equal(sim.arrows[0].shot, "javelin");
  assert.equal(sim.arrows[0].pin, undefined);
  assert.equal(m.cd, JAVELINEER.cooldown);
  for (let i = 0; i < 90 && sim.arrows.length; i++) { (sim as any).indexEnemies(); stepArrows(sim, 1 / 30); }
  assert.equal(e.maxHp - e.hp, m.damage);

  const barbed = battle(building("javelinCamp", "barbed", 3).s, "javelineer");
  const ogre = enemy(barbed.sim, barbed.m.x + 3, barbed.m.y, 1e6, "ogre");
  fire(barbed.sim, barbed.m);
  assert.ok(Math.abs(ogre.maxHp - ogre.hp - barbed.m.damage * BARBED.bigDamage) < 1e-6);
  assert.ok((ogre.chill ?? 0) > 0 && (ogre.stagger ?? 0) > 0);

  const arms = battle(building("javelinCamp", "throwingArms", 3).s, "javelineer");
  const far = enemy(arms.sim, arms.m.x + JAVELINEER.range + THROWING.range[3] - 0.2, arms.m.y), near = enemy(arms.sim, arms.m.x + 1, arms.m.y);
  arms.m.cd = 0;
  stepArcher(arms.sim, arms.m, 1 / 30);
  assert.deepEqual(arms.sim.arrows.map((a) => a.target).sort(), [near.id, far.id].sort());
  assert.equal(arms.m.cd, JAVELINEER.cooldown * THROWING.reload[3]);
});
