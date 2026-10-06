// The Study's knowledge paths (src/knowledge-paths.ts): choosing one seals
// the others, ranks go in order, unlearning returns the Knowledge, saves keep
// only well formed choices, and each path changes the battle as it says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { bonuses } from "../src/progression.ts";
import { PATHS, PATH_TOPICS, RIME, STORM, ASSASSIN, CRUSADE, decodePaths, learnPath, pathState, unlearnPath } from "../src/knowledge-paths.ts";
import { ICON_ROWS, ICON_SIZE } from "../src/ui/path-icons.ts";
import { defaultLayout, fitLayout, placeCityTile, placeStructure } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy, type Levels } from "../src/defend/sim.ts";
import { NO_BONUSES, UPGRADES, type Bonuses, type PaletteItem } from "../src/defend/catalog.ts";
import { center } from "../src/defend/pathing.ts";
import { chilled, stepFlames, stepFrosts, Wizards } from "../src/defend/wizard.ts";
import { Barracks, stepSwordsman } from "../src/defend/troops.ts";

const rich = () => {
  const s = defaults();
  s.knowledge = 100;
  return s;
};

test("choosing a path seals the others until it is unlearned, which returns its Knowledge", () => {
  const s = rich();
  assert.ok(learnPath(s, "pyromancy"));
  assert.ok(learnPath(s, "pyromancy"));
  assert.equal(s.knowledge, 100 - 4 - 8);
  assert.deepEqual(s.paths.wizardTower, { path: "pyromancy", rank: 2, spent: 12 });
  assert.ok(pathState(s, "rime").sealed);
  assert.equal(learnPath(s, "rime"), false, "sealed");
  assert.equal(learnPath(s, "crusaders"), true, "another topic's paths are its own");
  assert.equal(unlearnPath(s, "wizardTower"), 12);
  assert.equal(s.knowledge, 100 - 4, "every point back but the barracks'");
  assert.equal(s.paths.wizardTower, undefined);
  assert.ok(learnPath(s, "rime"), "open again");
});

test("ranks are learned in order, each for its cost, up to the last", () => {
  const s = defaults();
  s.knowledge = 3;
  assert.equal(learnPath(s, "storm"), false, "too dear");
  s.knowledge = 1000;
  const storm = PATHS.find((p) => p.id === "storm")!;
  for (const r of storm.ranks) assert.ok(learnPath(s, "storm"), r.name);
  assert.equal(learnPath(s, "storm"), false, "maxed");
  assert.equal(s.paths.wizardTower!.spent, storm.ranks.reduce((n, r) => n + r.cost, 0));
});

test("unlimited money learns for nothing and unlearning returns nothing", () => {
  const s = defaults();
  s.settings.devMode = true;
  assert.ok(learnPath(s, "assassins"));
  assert.equal(s.knowledge, 0);
  assert.equal(unlearnPath(s, "barracks"), 0);
  assert.equal(s.paths.barracks, undefined);
});

test("saves keep only well formed paths", () => {
  assert.deepEqual(decodePaths({ wizardTower: { path: "rime", rank: 2, spent: 12 } }), { wizardTower: { path: "rime", rank: 2, spent: 12 } });
  assert.deepEqual(decodePaths({ wizardTower: { path: "crusaders", rank: 1, spent: 4 } }), {}, "another topic's path");
  assert.deepEqual(decodePaths({ wizardTower: { path: "rime", rank: 9, spent: 4 } }), {}, "no such rank");
  assert.deepEqual(decodePaths({ barracks: { path: "assassins", rank: 1, spent: -1 } }), {});
  assert.deepEqual(decodePaths("nonsense"), {});
  const s = rich();
  learnPath(s, "crusaders");
  assert.deepEqual(decode(JSON.stringify(s)).paths, s.paths);
  assert.deepEqual(defaults().paths, {});
});

test("the battle hears of paths only once one is chosen", () => {
  const s = rich();
  assert.equal(bonuses(s).paths, undefined);
  assert.deepEqual(bonuses(s), NO_BONUSES);
  learnPath(s, "storm");
  assert.deepEqual(bonuses(s).paths, { wizardTower: { path: "storm", rank: 1 } });
});

test("every topic offers two or more paths of three ranks, with square icons", () => {
  for (const t of PATH_TOPICS) assert.ok(PATHS.filter((p) => p.topic === t).length >= 2, t);
  for (const p of PATHS) assert.equal(p.ranks.length, 3, p.id);
  for (const [k, rows] of Object.entries(ICON_ROWS)) {
    assert.equal(rows.length, ICON_SIZE, k);
    for (const r of rows) assert.equal(r.length, ICON_SIZE, k);
  }
});

// ── In battle ─────────────────────────────────────────────────────────────
const LEVELS = Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Levels;

/** A city with one `kind` north of the keep (a barracks inside the walls,
 * a tower just outside them), fighting with `paths`. */
function battle(kind: PaletteItem, paths?: Bonuses["paths"]) {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, tx + dx, ty + dy) ?? assert.fail("tile");
  l = placeStructure(l, kind, tx, kind === "barracks" ? ty - 1 : ty - 3) ?? assert.fail(kind);
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...LEVELS }, 1, paths ? { ...NO_BONUSES, paths } : NO_BONUSES);
  const b = sim.map.buildings.find((b) => b.kind === kind)!;
  return { sim, b, at: center(b.rect) };
}

function orc(sim: DefendSim, x: number, y: number): Enemy {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as unknown as { indexEnemies(): void }).indexEnemies();
  return e;
}

/** Steps a lone wizard tower for `seconds`, counting the attacks it starts. */
function cast(sim: DefendSim, seconds: number) {
  const wizards = new Wizards();
  let flames = 0, frosts = 0, bolts = 0;
  for (let t = 0; t < seconds; t += 1 / 30) {
    const [f, w, b] = [sim.flames.length, sim.frosts.length, sim.bolts.length];
    wizards.step(sim, 1 / 30);
    flames += Math.max(0, sim.flames.length - f);
    frosts += Math.max(0, sim.frosts.length - w);
    bolts += Math.max(0, sim.bolts.length - b);
    stepFlames(sim, wizards, 1 / 30);
    stepFrosts(sim, 1 / 30);
    sim.bolts = [];
  }
  return { flames, frosts, bolts };
}

test("Pyromancy gives up the ice, Rime the flames, and Stormcalling casts bolts for flames", () => {
  const plain = battle("wizardTower");
  orc(plain.sim, plain.at.x, plain.at.y - 3);
  const both = cast(plain.sim, 8);
  assert.ok(both.flames > 0 && both.frosts > 0 && !both.bolts);

  const pyro = battle("wizardTower", { wizardTower: { path: "pyromancy", rank: 1 } });
  orc(pyro.sim, pyro.at.x, pyro.at.y - 3);
  const fire = cast(pyro.sim, 8);
  assert.ok(fire.flames > both.flames && !fire.frosts);

  const rime = battle("wizardTower", { wizardTower: { path: "rime", rank: 1 } });
  orc(rime.sim, rime.at.x, rime.at.y - 3);
  const ice = cast(rime.sim, 8);
  assert.ok(ice.frosts > both.frosts && !ice.flames);

  const storm = battle("wizardTower", { wizardTower: { path: "storm", rank: 2 } });
  for (let k = 0; k < 6; k++) orc(storm.sim, storm.at.x - 3 + k * 1.2, storm.at.y - 3);
  const wizards = new Wizards();
  wizards.step(storm.sim, 1 / 30);
  assert.equal(storm.sim.flames.length, 0);
  assert.equal(storm.sim.bolts.length, 1);
  assert.equal(storm.sim.bolts[0].pts.length / 2 - 1, STORM.links[2], "leaps through five");
  assert.equal(storm.sim.enemies.filter((e) => e.hp < e.maxHp).length, STORM.links[2]);
});

test("Rime's deep freeze stops what the ice hits, then lets it go", () => {
  const { sim, at } = battle("wizardTower", { wizardTower: { path: "rime", rank: 3 } });
  const e = orc(sim, at.x, at.y - 3);
  const wizards = new Wizards();
  for (let t = 0; t < 1.5 && !e.freeze; t += 1 / 30) {
    wizards.step(sim, 1 / 30);
    stepFrosts(sim, 1 / 30);
  }
  assert.equal(e.freeze, RIME.freeze);
  assert.equal(chilled(e), 0);
  (sim as unknown as { tick(dt: number): void }).tick(RIME.freeze + 0.1);
  assert.equal(e.freeze, undefined);
});

test("Crusaders are heartier and heal; Assassins are frailer and strike critically", () => {
  const recruit = (paths?: Bonuses["paths"]) => {
    const { sim, b } = battle("barracks", paths);
    new Barracks().step(sim, 1 / 30);
    const s = sim.soldiers.find((s) => s.home === b.id);
    assert.ok(s);
    return { sim, s };
  };
  const base = recruit().s.maxHp;
  assert.equal(recruit({ barracks: { path: "crusaders", rank: 1 } }).s.maxHp, base * CRUSADE.hp[1]);
  assert.equal(recruit({ barracks: { path: "assassins", rank: 1 } }).s.maxHp, base * ASSASSIN.hp);

  const healer = recruit({ barracks: { path: "crusaders", rank: 2 } });
  healer.s.hp = 10;
  stepSwordsman(healer.sim, healer.s, 1);
  assert.equal(healer.s.hp, 10 + CRUSADE.heal);

  const { sim, s } = recruit({ barracks: { path: "assassins", rank: 1 } });
  const e = orc(sim, s.x + 0.5, s.y);
  s.target = e.id;
  const hits: number[] = [];
  for (let k = 0; k < 4; k++) {
    const hp = e.hp;
    s.cd = 0;
    stepSwordsman(sim, s, 1 / 30);
    hits.push(hp - e.hp);
  }
  assert.deepEqual(hits, [s.damage, s.damage, s.damage, s.damage * ASSASSIN.crit], "every 4th is critical");
});
