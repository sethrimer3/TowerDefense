// The Study's knowledge paths (src/knowledge-paths.ts): choosing one seals
// the others, ranks go in order, unlearning returns the Knowledge, saves keep
// only well formed choices, and each path changes the battle as it says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { bonuses } from "../src/progression.ts";
import { PATHS, PATH_TOPICS, RIME, STORM, ASSASSIN, CRUSADE, FIRE_ARROWS, SHARP, GUNNERY, SIEGE_SHOT, SKIRMISH, SPOTTERS, SIGNAL, PYROCLASM, CINDERS, OIL, FORTIFY, crownBought, crownedFrom, decodePaths, evolve, evolvedBy, learnPath, pathState, unlearnPath } from "../src/knowledge-paths.ts";
import { ICON_ROWS, ICON_SIZE } from "../src/ui/path-icons.ts";
import { defaultLayout, fitLayout, placeCityTile, placeStructure, placedCount } from "../src/defend/layout.ts";
import { available } from "../src/defend/progress.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy, type Levels } from "../src/defend/sim.ts";
import { NO_BONUSES, UPGRADES, watchRadius, type Bonuses, type PaletteItem } from "../src/defend/catalog.ts";
import { center } from "../src/defend/pathing.ts";
import { chilled, stepFlames, stepFrosts, Wizards } from "../src/defend/wizard.ts";
import { Barracks, stepArcher, stepSwordsman } from "../src/defend/troops.ts";
import { Towers, stepArrows, stepShells } from "../src/defend/towers.ts";
import { stepBlazes, stepFireballs, stepMage } from "../src/defend/mages.ts";
import { baitBitten } from "../src/defend/bait.ts";

const rich = () => {
  const s = defaults();
  s.knowledge = 1000000;
  return s;
};

test("choosing a path seals the others until it is unlearned, which returns its Knowledge", () => {
  const s = rich();
  assert.ok(learnPath(s, "pyromancy"));
  assert.ok(learnPath(s, "pyromancy"));
  assert.equal(s.knowledge, 1000000 - 4 - 4004);
  assert.deepEqual(s.paths.wizardTower, { path: "pyromancy", rank: 2, spent: 4008 });
  assert.ok(pathState(s, "rime").sealed);
  assert.equal(learnPath(s, "rime"), false, "sealed");
  assert.equal(learnPath(s, "crusaders"), true, "another topic's paths are its own");
  assert.equal(unlearnPath(s, "wizardTower"), 4008);
  assert.equal(s.knowledge, 1000000 - 4, "every point back but the barracks'");
  assert.equal(s.paths.wizardTower, undefined);
  assert.ok(learnPath(s, "rime"), "open again");
});

test("ranks are learned in order, each for its cost, up to the last", () => {
  const s = defaults();
  s.knowledge = 3;
  assert.equal(learnPath(s, "storm"), false, "too dear");
  s.knowledge = 1000000;
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
  const inside = kind === "barracks" || kind === "archerBarracks" || kind === "mageGuild";
  l = placeStructure(l, kind, tx, inside ? ty - 1 : ty - 3) ?? assert.fail(kind);
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

/** One volley from a lone tower at whatever stands in reach. */
function volley(kind: PaletteItem, paths: Bonuses["paths"], foes: [number, number, number?][]) {
  const { sim, b, at } = battle(kind, paths);
  const enemies = foes.map(([dx, dy, hp]) => {
    const e = orc(sim, at.x + dx, at.y + dy);
    if (hp) e.hp = e.maxHp = hp;
    return e;
  });
  const towers = new Towers();
  towers.step(sim, 1 / 30);
  return { sim, b, towers, enemies };
}

test("Fire arrows set what they hit burning, and at III loose a volley", () => {
  const { sim, enemies: [e] } = volley("archerTower", { archerTower: { path: "fireArrows", rank: 1 } }, [[0, -3]]);
  assert.equal(sim.arrows.length, 1);
  const arrow = sim.arrows[0];
  assert.equal(arrow.burn, arrow.damage * FIRE_ARROWS.share[1]);
  for (let t = 0; t < 1 && !e.burn; t += 1 / 30) stepArrows(sim, 1 / 30);
  assert.equal(e.burn, FIRE_ARROWS.burn[1]);
  const hp = e.hp;
  (sim as unknown as { tick(dt: number): void }).tick(1);
  assert.ok(Math.abs(hp - e.hp - arrow.burn!) < 1e-9, "a second's burn");
  (sim as unknown as { tick(dt: number): void }).tick(FIRE_ARROWS.burn[1]);
  assert.equal(e.burn, undefined, "burnt out");

  const plain = volley("archerTower", undefined, [[0, -3]]);
  assert.equal(plain.sim.arrows[0].burn, undefined, "no path, no burn");
  const three = volley("archerTower", { archerTower: { path: "fireArrows", rank: 3 } }, [[0, -3], [1, -3], [-1, -3], [0, -4]]);
  assert.equal(three.sim.arrows.length, FIRE_ARROWS.volley);
});

test("Sharpshooters crit every 3rd arrow, and at III aim at the strongest", () => {
  const { sim, b, towers } = volley("archerTower", { archerTower: { path: "sharpshooters", rank: 2 } }, [[0, -3]]);
  for (let k = 0; k < 2; k++) {
    towers.cooldown.set(b.id, 0);
    towers.step(sim, 1 / 30);
  }
  const [a, b2, c] = sim.arrows.map((a) => a.damage);
  assert.equal(a, b2);
  assert.equal(c, a * SHARP.crit);
  const deadeye = volley("archerTower", { archerTower: { path: "sharpshooters", rank: 3 } }, [[0, -2], [0, -4, 5e6]]);
  assert.equal(deadeye.sim.arrows[0].target, deadeye.enemies[1].id, "the stronger, further one");
});

test("Gun crews reload faster and burst into grapeshot; Siege shot hits harder and wider", () => {
  const plain = volley("cannonTower", undefined, [[0, -4]]);
  const drilled = volley("cannonTower", { cannonTower: { path: "gunnery", rank: 3 } }, [[0, -4]]);
  assert.equal(drilled.towers.cooldown.get(drilled.b.id)!, plain.towers.cooldown.get(plain.b.id)! * GUNNERY.reload[3]);
  assert.equal(plain.sim.shells[0].grape, undefined);
  assert.ok(drilled.sim.shells[0].grape);
  const near = orc(drilled.sim, drilled.sim.shells[0].x1 + drilled.sim.shells[0].r * 0.8, drilled.sim.shells[0].y1);
  const lone = orc(plain.sim, plain.sim.shells[0].x1 + plain.sim.shells[0].r * 0.8, plain.sim.shells[0].y1);
  for (const { sim } of [plain, drilled]) for (let t = 0; t < 2; t += 1 / 30) stepShells(sim, 1 / 30);
  assert.ok(near.maxHp - near.hp > lone.maxHp - lone.hp, "grapeshot hits round the landing harder");

  const siege = volley("cannonTower", { cannonTower: { path: "siegeShot", rank: 2 } }, [[0, -4]]);
  const base = volley("cannonTower", undefined, [[0, -4]]);
  assert.equal(siege.sim.shells[0].damage, base.sim.shells[0].damage * SIEGE_SHOT.damage[2]);
  assert.equal(siege.sim.shells[0].r, base.sim.shells[0].r * SIEGE_SHOT.radius);
  assert.equal(siege.towers.cooldown.get(siege.b.id)!, base.towers.cooldown.get(base.b.id)! * SIEGE_SHOT.reload);
});

test("Rangers loose twin shots; Skirmishers draw faster", () => {
  const archer = (paths: Bonuses["paths"]) => {
    const { sim, b } = battle("archerBarracks", paths);
    new Barracks().step(sim, 1 / 30);
    const s = sim.soldiers.find((s) => s.home === b.id)!;
    orc(sim, s.x + 2, s.y);
    orc(sim, s.x - 2, s.y);
    stepArcher(sim, s, 1 / 30);
    return { sim, s };
  };
  const plain = archer(undefined);
  assert.equal(plain.sim.arrows.length, 1);
  assert.equal(archer({ archerBarracks: { path: "rangers", rank: 3 } }).sim.arrows.length, 2);
  const quick = archer({ archerBarracks: { path: "skirmishers", rank: 1 } });
  assert.ok(Math.abs(quick.s.cd - plain.s.cd * SKIRMISH.reload[1]) < 1e-9);
});

/** Marks whatever stands in a lone watch tower's radius, as each step does. */
const mark = (sim: DefendSim) => (sim as unknown as { markEnemies(): void }).markEnemies();

test("Spotters' marks hit harder and reach further; Signal fires slow the marked, then set them burning", () => {
  const watch = (paths?: Bonuses["paths"]) => {
    const { sim, at } = battle("watchTower", paths);
    const near = orc(sim, at.x, at.y - 3), far = orc(sim, at.x, at.y - watchRadius(0) - 1);
    mark(sim);
    return { sim, near, far };
  };
  const plain = watch();
  assert.ok(plain.near.marked && !plain.far.marked);
  plain.sim.hurtEnemy(plain.near, 10);
  assert.equal(plain.near.maxHp - plain.near.hp, 20, "a mark doubles damage");
  assert.equal(plain.near.slowed, undefined);

  const spot = watch({ watchTower: { path: "spotters", rank: 2 } });
  assert.ok(spot.far.marked, "a wider radius");
  spot.sim.hurtEnemy(spot.near, 10);
  assert.equal(spot.near.maxHp - spot.near.hp, 10 * SPOTTERS.mark[2]);

  const signal = watch({ watchTower: { path: "signalFires", rank: 1 } });
  assert.equal(signal.near.slowed, SIGNAL.slow[1]);
  assert.equal(chilled(signal.near), SIGNAL.slow[1]);
  assert.equal(signal.far.slowed, undefined);
  assert.equal(signal.near.burn, undefined);
  signal.near.x = signal.far.x;
  signal.near.y = signal.far.y;
  (signal.sim as unknown as { indexEnemies(): void }).indexEnemies();
  mark(signal.sim);
  assert.equal(signal.near.slowed, undefined, "out of the radius, back to its pace");

  const pyre = watch({ watchTower: { path: "signalFires", rank: 3 } });
  assert.ok(pyre.far.marked, "beacon chain reaches further");
  assert.equal(pyre.near.burnDps, SIGNAL.burn);
});

/** A fire mage fresh from its guild, with an orc 3 cells off, after one throw. */
function mage(paths?: Bonuses["paths"]) {
  const { sim, b } = battle("mageGuild", paths);
  new Barracks().step(sim, 1 / 30);
  const s = sim.soldiers.find((s) => s.home === b.id);
  assert.ok(s);
  const e = orc(sim, s.x + 3, s.y);
  s.cd = 0;
  stepMage(sim, s, 1 / 30);
  assert.equal(sim.fireballs.length, 1);
  return { sim, s, e, f: sim.fireballs[0] };
}

test("Pyroclasm throws heavier, wider fireballs, and at III two more burst beside them", () => {
  const plain = mage(), hot = mage({ mageGuild: { path: "pyroclasm", rank: 2 } });
  assert.equal(hot.f.damage, plain.f.damage * PYROCLASM.damage);
  assert.ok(Math.abs(hot.f.r - plain.f.r * PYROCLASM.splash) < 1e-9);

  const hurtBeside = (m: ReturnType<typeof mage>) => {
    const side = orc(m.sim, m.f.x1 + m.f.r * 1.3, m.f.y1);
    m.f.t = m.f.dur;
    stepFireballs(m.sim, 1 / 30);
    return side.maxHp - side.hp;
  };
  assert.equal(hurtBeside(mage({ mageGuild: { path: "pyroclasm", rank: 2 } })), 0, "beyond the burst");
  assert.ok(hurtBeside(mage({ mageGuild: { path: "pyroclasm", rank: 3 } })) > 0, "a meteor lands beside it");
});

test("Cinders burn longer and hotter, and at III the fire clings to whoever walks through", () => {
  const blaze = (paths?: Bonuses["paths"]) => {
    const m = mage(paths);
    m.f.t = m.f.dur;
    stepFireballs(m.sim, 1 / 30);
    assert.equal(m.sim.blazes.length, 1);
    return { ...m, b: m.sim.blazes[0] };
  };
  const plain = blaze(), hot = blaze({ mageGuild: { path: "cinders", rank: 2 } });
  assert.ok(Math.abs(hot.b.life - plain.b.life * CINDERS.life) < 1e-9);
  assert.ok(Math.abs(hot.b.dps - plain.b.dps * CINDERS.dps) < 1e-9);

  const cling = blaze({ mageGuild: { path: "cinders", rank: 3 } });
  const walker = orc(cling.sim, cling.b.x, cling.b.y);
  stepBlazes(cling.sim, 1 / 30);
  assert.equal(walker.burn, CINDERS.cling);
  assert.equal(walker.burnDps, cling.b.dps);
  stepBlazes(hot.sim, 1 / 30);
  assert.equal(orc(hot.sim, hot.b.x, hot.b.y).burn, undefined);
});

test("Oil-soaked bait sets its biters alight; fortified crates hold out and, spiked, bite back", () => {
  const bait = (paths?: Bonuses["paths"]) => {
    const { sim, b, at } = battle("monsterBait", paths);
    return { sim, b, e: orc(sim, at.x, at.y - 1) };
  };
  const plain = bait();
  baitBitten(plain.sim, plain.e, 5);
  assert.equal(plain.e.burn, undefined);
  assert.equal(plain.e.hp, plain.e.maxHp);

  const oil = bait({ bait: { path: "oilSoaked", rank: 2 } });
  baitBitten(oil.sim, oil.e, 5);
  assert.equal(oil.e.burn, OIL.burn[2]);
  assert.equal(oil.e.burnDps, OIL.dps[2]);

  const fort = bait({ bait: { path: "fortified", rank: 2 } });
  assert.equal(fort.sim.maxHp[fort.b.id], plain.sim.maxHp[plain.b.id] * FORTIFY.hp[2]);
  baitBitten(fort.sim, fort.e, 5);
  assert.equal(fort.e.hp, fort.e.maxHp, "no spikes before III");
  const spiked = bait({ bait: { path: "fortified", rank: 3 } });
  baitBitten(spiked.sim, spiked.e, 5);
  assert.equal(spiked.e.maxHp - spiked.e.hp, 5 * FORTIFY.thorns);
});

// ── Evolutions ────────────────────────────────────────────────────────────
test("a crown turns every copy into the greater building, and unlearning turns them back", () => {
  const s = rich();
  s.knowledge = 1000000;
  const d = s.defend;
  let l = d.layout;
  for (const [dx, dy] of [[-1, 0], [0, -1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? assert.fail("tile");
  d.owned.barracks = 2;
  d.layout = placeStructure(l, "barracks", l.keep.tx, l.keep.ty - 1) ?? assert.fail("barracks");
  assert.equal(placedCount(d.layout, "barracks"), 1);

  assert.equal(evolve(s, "crusaders"), false, "not before the path is chosen");
  for (let i = 0; i < 3; i++) {
    assert.ok(!pathState(s, "crusaders").canEvolve, "not before its last rank");
    learnPath(s, "crusaders");
  }
  assert.ok(pathState(s, "crusaders").canEvolve);
  const before = s.knowledge;
  assert.ok(evolve(s, "crusaders"));
  assert.equal(s.knowledge, before - 100000);
  assert.equal(d.owned.barracks, 0);
  assert.equal(d.owned.valkyriePalace, 2);
  assert.equal(placedCount(d.layout, "barracks"), 0, "lifted back to the palette");
  assert.equal(available(d, "valkyriePalace"), 2);
  assert.equal(evolve(s, "crusaders"), false, "once");
  assert.equal(crownedFrom(s, "barracks")?.id, "crusaders");
  assert.equal(evolvedBy("valkyriePalace")?.id, "crusaders");

  // A copy bought while crowned is a palace, and turns back with the rest.
  d.owned.valkyriePalace++;
  crownBought(s, "barracks");
  assert.equal(s.paths.barracks!.crowned, 3);
  assert.deepEqual(decode(JSON.stringify(s)).paths.barracks, s.paths.barracks, "the save keeps the crown");

  let pl = d.layout;
  for (const [dx, dy] of [[1, 0], [0, 1]]) pl = placeCityTile(pl, pl.keep.tx + dx, pl.keep.ty + dy) ?? assert.fail("tile");
  d.layout = placeStructure(pl, "valkyriePalace", pl.keep.tx + 1, pl.keep.ty) ?? assert.fail("palace");
  d.owned.valkyriePalace++; // one bought before any crown stays a palace
  const spent = s.paths.barracks!.spent;
  assert.equal(unlearnPath(s, "barracks"), spent);
  assert.equal(d.owned.barracks, 3);
  assert.equal(d.owned.valkyriePalace, 1);
  assert.equal(placedCount(d.layout, "valkyriePalace"), 1, "what is still owned stays placed");
  assert.equal(crownedFrom(s, "barracks"), undefined);
});

test("a crowned wizard tower becomes a Dark wizard keep; saves keep only a crown on a finished path", () => {
  const s = rich();
  s.knowledge = 1000000;
  s.defend.owned.wizardTower = 1;
  for (let i = 0; i < 3; i++) learnPath(s, "storm");
  assert.ok(evolve(s, "storm"));
  assert.equal(s.defend.owned.darkKeep, 1);
  assert.equal(s.defend.owned.wizardTower, 0);
  assert.equal(evolve(s, "pyromancy"), false, "sealed and crownless");
  assert.deepEqual(decodePaths({ wizardTower: { path: "storm", rank: 2, spent: 14, crowned: 1 } }), { wizardTower: { path: "storm", rank: 2, spent: 14 } });
  assert.deepEqual(decodePaths({ wizardTower: { path: "pyromancy", rank: 3, spent: 26, crowned: 1 } }), { wizardTower: { path: "pyromancy", rank: 3, spent: 26 } });
  assert.deepEqual(decodePaths({ wizardTower: { path: "storm", rank: 3, spent: 59, crowned: 0 } }), { wizardTower: { path: "storm", rank: 3, spent: 59, crowned: 0 } });
});
