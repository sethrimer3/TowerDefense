// The Hero, the swordsmen's ultimate: a Barracks become one with Knowledge,
// its one hero's combo of slashes and spins, and its paths in battle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";
import { BECOMES, allocated, buildingTree, fullTree, nextSteps, rootOf, specialtyOf, stepName, upgradeBuilding, upgradedFrom } from "../src/specializations.ts";
import { BLADE_DANCE, LEGEND, WHIRLWIND, pathById, type PathId } from "../src/knowledge-paths.ts";
import { bonuses } from "../src/progression.ts";
import { battleBonuses, wear } from "./spare-paths.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout, type PlacedKind } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Barracks } from "../src/defend/troops.ts";
import { HERO, STRUCTURES, type EnemyKind } from "../src/defend/catalog.ts";
import { combo, stepHero } from "../src/defend/hero.ts";
import { CAPE, newCape, stepCape, type Cape } from "../src/defend/hero-cape.ts";
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
function battle(s: S) {
  const fit = fitLayout(s.defend.layout);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, battleBonuses(s));
  new Barracks().step(sim, 0.01);
  const heroes = sim.soldiers.filter((u) => u.kind === "hero");
  assert.equal(heroes.length, 1, "one hero");
  return { sim, h: heroes[0] };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6, kind: EnemyKind = "orc") {
  const e: Enemy = { id: sim.newId(), kind, x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
const index = (sim: DefendSim) => (sim as any).indexEnemies();
const hurt = (e: Enemy) => e.maxHp - e.hp;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
/** The Hero's next strike at `e`, its blade made ready. */
function strike(sim: DefendSim, h: Soldier, e: Enemy) {
  h.cd = 0;
  index(sim);
  combo(sim, h, e);
}

// ── The tree ───────────────────────────────────────────────────────────
test("the Hero is the swordsmen's ultimate, merged from three barracks maxed on different branches", () => {
  assert.equal(BECOMES.barracks, undefined);
  assert.deepEqual(nextSteps("barracks").map(stepName), ["Crusaders I", "Berserkers I", "Halberdiers I"]);
  assert.deepEqual(nextSteps("barracks", { path: "halberdiers", rank: 3 }).map(stepName), ["Hero"]);
  assert.deepEqual(nextSteps("heroHall").map(stepName), ["Whirlwind I", "Blade dance I", "Legend I"]);
  assert.equal(upgradedFrom("heroHall"), "barracks");
  assert.equal(rootOf("heroHall"), "meleeGuild");
  const full = (p: "crusaders" | "berserkers" | "halberdiers") => pathById(p).ranks.reduce((n, r) => n + r.cost, 0);
  assert.equal(allocated("heroHall"), 3 * 4 + full("crusaders") + full("berserkers") + full("halberdiers"));
  const ids = buildingTree("heroHall").map((n) => n.id);
  for (const id of ["k:meleeGuild", "k:barracks", "p:crusaders:3", "p:berserkers:3", "p:halberdiers:3", "k:heroHall", "p:whirlwind:1", "p:bladeDance:1", "p:legend:1"]) assert.ok(ids.includes(id), id);
  // It shows on the Melee Guild line's upgrade map, its paths to the top.
  const map = fullTree("meleeGuild").map((n) => n.id);
  for (const id of ["k:heroHall", "p:whirlwind:3", "p:bladeDance:3", "p:legend:3"]) assert.ok(map.includes(id), id);
  assert.equal(STRUCTURES.heroHall.w * STRUCTURES.heroHall.h, STRUCTURES.barracks.w * STRUCTURES.barracks.h, "it stands where its barracks stood");
});
test("three maxed Barracks merge into the Hero, which keeps its place; the save keeps it", () => {
  const { s, uid } = building("barracks", "crusaders", 3);
  s.defend.owned.barracks = 3;
  s.defend.kept.push({ kind: "barracks", path: "berserkers", rank: 3 }, { kind: "barracks", path: "halberdiers", rank: 3 });
  const kind = () => s.defend.layout.structures.find((o) => o.uid === uid)?.kind;
  const merge = nextSteps(kind()!, specialtyOf(s.defend.layout, { uid })).find((o) => o.type === "merge")!;
  const r = upgradeBuilding(s, { uid }, merge);
  assert.ok(r.ok && !r.waiting, "it stands where the barracks stood");
  assert.equal(kind(), "heroHall");
  assert.equal(s.defend.owned.heroHall, 1);
  assert.equal(s.defend.owned.barracks, 0);
  assert.deepEqual(s.defend.kept, [], "the other two are used up");
  assert.equal(decode(JSON.stringify(s)).defend.layout.structures.find((o) => o.uid === uid)?.kind, "heroHall");
});
test("the hall and each path have their own art, and the stats read the combo", () => {
  assert.deepEqual(PATH_LOOKS.heroHall, ["whirlwind", "bladeDance", "legend"]);
  const art = ["", ...PATH_LOOKS.heroHall!].map((look) => structurePixels("heroHall", 4, 6, 0, 1, look).join());
  assert.equal(new Set(art).size, art.length);
  assert.match(kindStats(defaults(), "heroHall"), /^One hero: .* every 3rd strike a spin 1\.5 cells round, 1\.5x/);
  assert.match(kindStats(defaults(), "heroHall", "whirlwind", 3), /every strike a spin 2\.4 cells round/);
  assert.match(kindStats(defaults(), "heroHall", "bladeDance", 3), /flurries of 5, kills adding more up to 12/);
  assert.match(kindStats(defaults(), "heroHall", "legend", 3), /rises once when it falls/);
});

// ── In battle ──────────────────────────────────────────────────────────
test("one hero, slow to rise again, with far more of everything than a swordsman", () => {
  const { sim, h } = battle(building("heroHall").s);
  assert.equal(h.maxHp, HERO.hp);
  // A whole Barracks drill a second goes by; no second hero comes.
  const b = new Barracks();
  for (let i = 0; i < 300; i++) b.step(sim, 0.1);
  assert.equal(sim.soldiers.filter((u) => u.kind === "hero").length, 1);
  assert.equal(h.strikes, undefined);
  assert.equal(h.rallied, undefined);
});

test("its combo: two slashes cutting everything in front, then a spin cutting everything round it", () => {
  const { sim, h } = battle(building("heroHall").s);
  const front = enemy(sim, h.x + 0.8, h.y), beside = enemy(sim, h.x + 0.9, h.y + 0.9), behind = enemy(sim, h.x - 1, h.y);
  strike(sim, h, front);
  assert.equal(hurt(front), h.damage);
  assert.equal(hurt(beside), h.damage, "the slash's sweep");
  assert.equal(hurt(behind), 0, "not behind it");
  assert.equal(h.cd, HERO.cooldown);
  assert.equal(sim.swings.at(-1)?.kind, "slash");
  strike(sim, h, front);
  assert.equal(hurt(behind), 0);
  strike(sim, h, front);
  assert.equal(sim.swings.at(-1)?.kind, "spin");
  assert.ok(near(hurt(behind), h.damage * HERO.spinDamage), "the spin cuts all round");
  assert.ok(near(hurt(front), h.damage * (2 + HERO.spinDamage)));
  const far = enemy(sim, h.x + HERO.spin + 1, h.y);
  strike(sim, h, front); strike(sim, h, front); strike(sim, h, front);
  assert.equal(hurt(far), 0, "out of the spin's reach");
  // Swings fade away.
  for (let i = 0; i < 30; i++) (sim as any).tick(1 / 30);
  assert.equal(sim.swings.length, 0);
});

test("a crowd of small enemies melts round the Hero", () => {
  const { sim, h } = battle(building("heroHall").s);
  const crowd: Enemy[] = [];
  for (let i = 0; i < 12; i++) crowd.push(enemy(sim, h.x + Math.cos(i / 2) * 1.1, h.y + Math.sin(i / 2) * 1.1, 20, "roach"));
  for (let i = 0; i < 6; i++) strike(sim, h, crowd.find((e) => e.hp > 0) ?? crowd[0]);
  assert.ok(crowd.every((e) => e.hp <= 0), `${crowd.filter((e) => e.hp > 0).length} left`);
});

test("it hunts enemies in the city and strikes them in reach", () => {
  const { sim, h } = battle(building("heroHall").s);
  const e = enemy(sim, h.x + 0.7, h.y);
  h.cd = 0;
  stepHero(sim, h, 1 / 30);
  assert.equal(hurt(e), h.damage);
});

test("Whirlwind spins sooner, wider and harder, at III every strike", () => {
  const one = battle(building("heroHall", "whirlwind", 1).s);
  const behind = enemy(one.sim, one.h.x - 1.8, one.h.y), a = enemy(one.sim, one.h.x + 0.8, one.h.y);
  strike(one.sim, one.h, a);
  assert.equal(hurt(behind), 0);
  strike(one.sim, one.h, a);
  assert.ok(near(hurt(behind), one.h.damage * WHIRLWIND.damage[1]), "every other strike a spin, 2 cells round");

  const three = battle(building("heroHall", "whirlwind", 3).s);
  const t = enemy(three.sim, three.h.x - 2.2, three.h.y), b = enemy(three.sim, three.h.x + 0.8, three.h.y);
  strike(three.sim, three.h, b);
  assert.ok(near(hurt(t), three.h.damage * WHIRLWIND.damage[3]), "the first strike spins");
  assert.equal(three.sim.swings.at(-1)?.kind, "spin");
});

test("Blade dance dashes from enemy to enemy, slashing each, faster; Thousand cuts adds a slash a kill", () => {
  const { sim, h } = battle(building("heroHall", "bladeDance", 1).s);
  // Open ground all the way along.
  sim.ownSolid.fill(0);
  const x0 = h.x, a = enemy(sim, h.x + 0.8, h.y), b = enemy(sim, h.x + 2.3, h.y), c = enemy(sim, h.x + 4, h.y);
  strike(sim, h, a);
  assert.ok(hurt(a) > 0 && hurt(b) > 0 && hurt(c) > 0, "three slashes along the line");
  assert.ok(h.x > x0 + 2, "it dashed along");
  assert.equal(sim.swings.filter((w) => w.kind === "dash").length, 2);
  assert.equal(sim.swings.filter((w) => w.kind === "slash").length, BLADE_DANCE.slashes[1]);

  const two = battle(building("heroHall", "bladeDance", 2).s);
  strike(two.sim, two.h, enemy(two.sim, two.h.x + 0.8, two.h.y));
  assert.equal(two.h.cd, HERO.cooldown * BLADE_DANCE.cooldown[2]);

  // Thousand cuts: weak enemies strung out, each kill one more slash.
  const three = battle(building("heroHall", "bladeDance", 3).s);
  three.sim.ownSolid.fill(0);
  const line: Enemy[] = [];
  for (let i = 0; i < 8; i++) line.push(enemy(three.sim, three.h.x + 0.8 + i * 0.9, three.h.y, 1, "roach"));
  strike(three.sim, three.h, line[0]);
  assert.ok(line.every((e) => e.hp <= 0), "the flurry ran on past five slashes");
});

test("Legend: twice the HP, kills heal it, and at III it rises once when it falls", () => {
  const one = battle(building("heroHall", "legend", 1).s);
  assert.equal(one.h.maxHp, HERO.hp * LEGEND.hp[1]);

  const two = battle(building("heroHall", "legend", 2).s);
  two.h.hp = two.h.maxHp / 2;
  strike(two.sim, two.h, enemy(two.sim, two.h.x + 0.8, two.h.y, 1, "roach"));
  assert.ok(near(two.h.hp, two.h.maxHp * (0.5 + LEGEND.heal)));

  const three = battle(building("heroHall", "legend", 3).s);
  three.sim.hurtDefender(three.h, three.h.maxHp * 10);
  assert.equal(three.h.hp, three.h.maxHp * LEGEND.rise);
  assert.equal(three.h.guard, LEGEND.stand);
  assert.equal(three.h.rallied, true);
  assert.equal(three.sim.hurtDefender(three.h, 10), 0, "unhurtable while it stands");
  delete three.h.guard;
  three.sim.hurtDefender(three.h, three.h.maxHp * 10);
  assert.ok(three.h.hp <= 0, "only once");

  // Off the path a hero falls.
  const plain = battle(building("heroHall").s);
  plain.sim.hurtDefender(plain.h, plain.h.maxHp * 10);
  assert.ok(plain.h.hp <= 0);
  assert.equal(plain.h.rallied, undefined);
});

test("the Hero's cape hangs, streams out behind it as it runs and whirls round it in a spin", () => {
  const links = (c: Cape) => {
    const out: number[] = [];
    for (let i = 1; i < CAPE.points; i++) out.push(Math.sqrt((c.x[i] - c.x[i - 1]) ** 2 + (c.y[i] - c.y[i - 1]) ** 2));
    return out;
  };
  const tip = CAPE.points - 1;
  // At rest it hangs below the shoulders.
  const still = newCape(10, 10, 0);
  for (let t = 1; t <= 120; t++) stepCape(still, 10, 10, t / 60);
  assert.ok(still.y[tip] > 10 + CAPE.link * 3, `hangs down, tip at ${still.y[tip]}`);
  // Running right, it streams out to the left of the Hero.
  const run = newCape(10, 10, 0);
  for (let t = 1; t <= 60; t++) stepCape(run, 10 + (t / 60) * 3, 10, t / 60);
  assert.ok(run.x[tip] < 13 - CAPE.link * 3, `trails behind, tip at ${run.x[tip]}`);
  // A dash and a spin never stretch it.
  stepCape(run, 15.5, 10, 61 / 60);
  for (const d of links(run)) assert.ok(Math.abs(d - CAPE.link) < 1e-9);
  const spun = newCape(10, 10, 0);
  for (let t = 1; t <= 60; t++) stepCape(spun, 10, 10, t / 60);
  const before = Math.atan2(spun.y[tip] - 10, spun.x[tip] - 10);
  for (let t = 61; t <= 70; t++) stepCape(spun, 10, 10, t / 60, 1);
  const after = Math.atan2(spun.y[tip] - 10, spun.x[tip] - 10);
  assert.ok(after - before > 0.5, `whirled round, ${before} to ${after}`);
  for (const d of links(spun)) assert.ok(Math.abs(d - CAPE.link) < 1e-9);
});
